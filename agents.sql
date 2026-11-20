-- Run AFTER supabase/schema.sql in Supabase SQL Editor. Safe to re-run.
-- Use REFERRAL_SECRET and SUPABASE_SERVICE_ROLE_KEY as server-only env vars.
create extension if not exists pgcrypto;
alter table public.profiles add column if not exists is_agent boolean not null default false;
alter table public.profiles add column if not exists referred_agent_id uuid;
alter table public.payments add column if not exists approved_at timestamptz;
alter table public.payments add column if not exists referred_agent_id uuid;

create table if not exists public.agents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 agent_code text not null unique,
 full_name text not null,
 email text not null,
 phone text not null default '',
 username text unique,
 commission_percentage numeric(5,2) not null check(commission_percentage between 0 and 100),
 status text not null default 'active' check(status in ('active','suspended','deleted')),
 referral_enabled boolean not null default true,
 click_count integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='profiles_referred_agent_fk') then
  alter table public.profiles add constraint profiles_referred_agent_fk foreign key (referred_agent_id) references public.agents(id);
 end if;
 if not exists(select 1 from pg_constraint where conname='payments_referred_agent_fk') then
  alter table public.payments add constraint payments_referred_agent_fk foreign key (referred_agent_id) references public.agents(id);
 end if;
end $$;
create index if not exists profiles_referred_agent_idx on public.profiles(referred_agent_id);
create index if not exists payments_referred_agent_idx on public.payments(referred_agent_id);
create index if not exists payments_user_status_idx on public.payments(user_id,status);

create table if not exists public.agent_commissions (
 id bigint generated always as identity primary key,
 agent_id uuid not null references public.agents(id),
 customer_id uuid not null references public.profiles(id),
 payment_id bigint not null unique references public.payments(id),
 payment_amount numeric(12,2) not null,
 commission_percentage numeric(5,2) not null,
 commission_amount numeric(12,2) not null,
 currency text not null default 'GHS',
 status text not null default 'approved' check(status in ('approved','reversed')),
 approved_at timestamptz not null default now(),
 reversed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists agent_commissions_agent_idx on public.agent_commissions(agent_id);
create index if not exists agent_commissions_customer_idx on public.agent_commissions(customer_id);
create table if not exists public.agent_audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid not null,
 action text not null,
 subject_id text,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);

create or replace function public.my_agent_id() returns uuid language sql security definer stable set search_path=public as $$
 select id from public.agents where user_id=auth.uid() and status='active' limit 1
$$;
create or replace function public.valid_referral(p_code text) returns boolean language sql security definer stable set search_path=public as $$
 select exists(select 1 from public.agents where agent_code=p_code and status='active' and referral_enabled=true)
$$;
create or replace function public.track_referral_click(p_code text) returns void language plpgsql security definer set search_path=public as $$
begin
 if public.valid_referral(p_code) then update public.agents set click_count=click_count+1 where agent_code=p_code; end if;
end $$;
-- Claim is permanent: no customer UPDATE policy for referred_agent_id.
create or replace function public.claim_referral(p_customer uuid,p_code text) returns boolean language plpgsql security definer set search_path=public as $$
declare v_agent uuid;
begin
 -- Either the customer claims for their own account, or a service-role caller does.
 if current_setting('request.jwt.claim.role',true) <> 'service_role' then
   if auth.uid() is null or p_customer <> auth.uid() then raise exception 'Not allowed'; end if;
 end if;
 select id into v_agent from public.agents where agent_code=p_code and status='active' and referral_enabled=true;
 if v_agent is null then return false; end if;
 update public.profiles set referred_agent_id=v_agent
 where id=p_customer and referred_agent_id is null and registration_status='pending'
   and is_admin=false and is_agent=false
   and not exists(select 1 from public.payments where user_id=p_customer and payment_type='registration');
 return found;
end $$;
revoke all on function public.track_referral_click(text) from public;
revoke all on function public.valid_referral(text) from public;
revoke all on function public.claim_referral(uuid,text) from public;
grant execute on function public.track_referral_click(text) to anon, authenticated;
grant execute on function public.valid_referral(text) to anon, authenticated;
grant execute on function public.claim_referral(uuid,text) to authenticated, service_role;

-- Normalize even direct Supabase inserts: never trust a customer's amount,
-- currency, or agent_id. This protects commission calculations server-side.
create or replace function public.normalize_agent_payment() returns trigger language plpgsql security definer set search_path=public as $$
declare c public.profiles%rowtype;
begin
 if new.payment_type not in ('registration','plan') then raise exception 'Invalid payment type'; end if;
 select * into c from public.profiles where id=new.user_id;
 if not found then raise exception 'Unknown customer'; end if;
 if new.payment_type='registration' then
  new.amount:='50.00'; new.plan_code:=null; new.plan_name:=null;
 else
  case new.plan_code
   when 'starter' then new.amount:='250.00'; new.plan_name:='Starter';
   when 'basic' then new.amount:='500.00'; new.plan_name:='Basic';
   when 'standard' then new.amount:='1000.00'; new.plan_name:='Standard';
   when 'pro' then new.amount:='2000.00'; new.plan_name:='Pro';
   when 'elite' then new.amount:='5000.00'; new.plan_name:='Elite';
   else raise exception 'Invalid plan';
  end case;
 end if;
 new.currency:=c.currency;
 new.referred_agent_id:=c.referred_agent_id;
 new.status:='pending';
 if new.screenshot_url is null or split_part(new.screenshot_url,'/',1) <> new.user_id::text then raise exception 'Payment proof is required'; end if;
 return new;
end $$;
drop trigger if exists normalize_agent_payment_insert on public.payments;
create trigger normalize_agent_payment_insert before insert on public.payments for each row execute function public.normalize_agent_payment();
-- This function is the only approval path. Locks a payment row, transitions it
-- once, snapshots the agent's current rate, and inserts a UNIQUE commission.
-- All writes occur in one PostgreSQL transaction (the RPC call).
create or replace function public.review_agent_payment(p_payment_id bigint, p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; a public.agents%rowtype; v_amount numeric(12,2); v_rate numeric(5,2); v_commission numeric(12,2);
begin
 if not public.is_admin() then raise exception 'Admin only'; end if;
 if p_action not in ('approve','reject','reverse') then raise exception 'Invalid action'; end if;
 select * into p from public.payments where id=p_payment_id for update;
 if not found then raise exception 'Payment not found'; end if;
 if p_action='reverse' then
   if p.status <> 'approved' then raise exception 'Only approved payments may be reversed'; end if;
   update public.payments set status='reversed' where id=p.id;
   update public.agent_commissions set status='reversed', reversed_at=now() where payment_id=p.id and status='approved';
   insert into public.agent_audit_logs(actor_id,action,subject_id,details) values(auth.uid(),'payment_reversed',p.id::text,jsonb_build_object('user_id',p.user_id));
   return jsonb_build_object('status','reversed');
 end if;
 if p.status <> 'pending' then raise exception 'Payment already reviewed'; end if;
 if p_action='reject' then
   update public.payments set status='rejected' where id=p.id;
   if p.payment_type='registration' then
     update public.profiles set registration_status='rejected' where id=p.user_id;
   else
     update public.profiles set pending_plan=null, plan_status=case when active_plan='none' then 'none' else 'active' end where id=p.user_id;
   end if;
   insert into public.agent_audit_logs(actor_id,action,subject_id,details) values(auth.uid(),'payment_rejected',p.id::text,jsonb_build_object('user_id',p.user_id));
   return jsonb_build_object('status','rejected');
 end if;
 v_amount := round(p.amount::numeric,2);
 if v_amount<=0 then raise exception 'Invalid payment amount'; end if;
 update public.payments set status='approved', approved_at=now(), referred_agent_id=(select referred_agent_id from public.profiles where id=p.user_id) where id=p.id;
 if p.payment_type='registration' then
   update public.profiles set registration_status='approved' where id=p.user_id;
 elsif p.payment_type='plan' then
   if p.plan_code not in ('starter','basic','standard','pro','elite') then raise exception 'Invalid plan'; end if;
   update public.profiles set active_plan=p.plan_code, plan_status='active', pending_plan=null where id=p.user_id;
 else raise exception 'Invalid payment type'; end if;
 select a.* into a from public.agents a join public.profiles c on c.referred_agent_id=a.id where c.id=p.user_id and a.status='active' for update of a;
 if found then
   v_rate := a.commission_percentage;
   v_commission := round(v_amount*v_rate/100,2);
   insert into public.agent_commissions(agent_id,customer_id,payment_id,payment_amount,commission_percentage,commission_amount,currency)
   values(a.id,p.user_id,p.id,v_amount,v_rate,v_commission,p.currency) on conflict(payment_id) do nothing;
 end if;
 insert into public.agent_audit_logs(actor_id,action,subject_id,details) values(auth.uid(),'payment_approved',p.id::text,jsonb_build_object('user_id',p.user_id,'agent_id',a.id,'commission',v_commission));
 return jsonb_build_object('status','approved','commission',coalesce(v_commission,0));
end $$;
revoke all on function public.review_agent_payment(bigint,text) from public;
grant execute on function public.review_agent_payment(bigint,text) to authenticated;

alter table public.agents enable row level security;
alter table public.agent_commissions enable row level security;
alter table public.agent_audit_logs enable row level security;
drop policy if exists agents_admin_all on public.agents;
create policy agents_admin_all on public.agents for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists agents_self_read on public.agents;
create policy agents_self_read on public.agents for select using(user_id=auth.uid() and status='active');
drop policy if exists agents_agent_customers on public.profiles;
create policy agents_agent_customers on public.profiles for select using(referred_agent_id=public.my_agent_id());
drop policy if exists agents_agent_payments on public.payments;
create policy agents_agent_payments on public.payments for select using(referred_agent_id=public.my_agent_id());
drop policy if exists commissions_agent_read on public.agent_commissions;
create policy commissions_agent_read on public.agent_commissions for select using(agent_id=public.my_agent_id());
drop policy if exists commissions_admin_all on public.agent_commissions;
create policy commissions_admin_all on public.agent_commissions for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists audit_admin_read on public.agent_audit_logs;
create policy audit_admin_read on public.agent_audit_logs for select using(public.is_admin());
create or replace function public.update_my_agent_profile(p_name text,p_phone text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or length(trim(p_name))<2 or length(trim(p_phone))<5 then raise exception 'Invalid profile'; end if;
 update public.agents set full_name=trim(p_name),phone=trim(p_phone),updated_at=now() where user_id=auth.uid() and status='active';
 if not found then raise exception 'Agent suspended'; end if;
 update public.profiles set full_name=trim(p_name),phone=trim(p_phone) where id=auth.uid();
end $$;
revoke all on function public.update_my_agent_profile(text,text) from public;
grant execute on function public.update_my_agent_profile(text,text) to authenticated;
create or replace function public.manage_agent(p_id uuid,p_patch jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare before_row public.agents%rowtype; after_row public.agents%rowtype; rate numeric;
begin
 if not public.is_admin() then raise exception 'Admin only'; end if;
 if p_patch is null or (p_patch - 'commission_percentage' - 'status' - 'referral_enabled' - 'full_name' - 'phone') <> '{}'::jsonb then raise exception 'Invalid changes'; end if;
 select * into before_row from public.agents where id=p_id for update;
 if not found then raise exception 'Agent not found'; end if;
 if p_patch ? 'commission_percentage' then
  rate:=(p_patch->>'commission_percentage')::numeric;
  if rate<0 or rate>100 or round(rate,2)<>rate then raise exception 'Invalid commission rate'; end if;
 end if;
 if p_patch ? 'status' and p_patch->>'status' not in ('active','suspended','deleted') then raise exception 'Invalid status'; end if;
 update public.agents set
  commission_percentage=coalesce(rate,commission_percentage),
  status=coalesce(p_patch->>'status',status),
  referral_enabled=case when p_patch->>'status'='deleted' then false when p_patch ? 'referral_enabled' then (p_patch->>'referral_enabled')::boolean else referral_enabled end,
  full_name=case when p_patch ? 'full_name' then trim(p_patch->>'full_name') else full_name end,
  phone=case when p_patch ? 'phone' then trim(p_patch->>'phone') else phone end,
  updated_at=now()
 where id=p_id returning * into after_row;
 if length(after_row.full_name)<2 or length(after_row.phone)<5 then raise exception 'Invalid contact details'; end if;
 insert into public.agent_audit_logs(actor_id,action,subject_id,details) values(auth.uid(),'agent_updated',p_id::text,jsonb_build_object('before',to_jsonb(before_row),'after',to_jsonb(after_row)));
 return to_jsonb(after_row);
end $$;
revoke all on function public.manage_agent(uuid,jsonb) from public;
grant execute on function public.manage_agent(uuid,jsonb) to authenticated;
-- Admin audit log inserts use this function; no client-side insert policy.
create or replace function public.log_agent_action(p_action text,p_subject text,p_details jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin only'; end if;
 insert into public.agent_audit_logs(actor_id,action,subject_id,details) values(auth.uid(),p_action,p_subject,p_details);
end $$;
revoke all on function public.log_agent_action(text,text,jsonb) from public;
grant execute on function public.log_agent_action(text,text,jsonb) to authenticated;
