-- =====================================================================
--  VIRTUALS PRO — Supabase setup (safe to run more than once)
--  Supabase Dashboard -> SQL Editor -> New query -> paste ALL -> Run
--
--  No secret key is used by the website. Security is enforced here with
--  Row Level Security: customers see only their own data, the admin
--  (is_admin = true) can review everything.
-- =====================================================================

-- 1) PROFILES --------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text not null default '',
  country text not null default 'Ghana',
  country_flag text not null default 'GH',
  currency text not null default 'GHS',
  registration_status text not null default 'pending',  -- pending | approved | rejected
  active_plan text not null default 'none',             -- none | basic | starter | standard | pro | elite
  plan_status text not null default 'none',             -- none | pending | active
  pending_plan text,
  avatar_initial text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles enable row level security;

-- 2) PAYMENTS --------------------------------------------------------
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_type text not null,                -- registration | plan
  plan_code text,
  plan_name text,
  amount text not null default '50.00',
  currency text not null default 'GHS',
  network text not null default 'TELECEL NETWORK',
  recipient_number text not null default '0506805681',
  recipient_name text not null default 'Richard Alorzuke',
  transaction_reference text,
  screenshot_name text,
  screenshot_url text,
  status text not null default 'pending',    -- pending | approved | rejected
  rejection_reason text,
  created_at timestamptz not null default now()
);
-- Update defaults for existing projects too. Historical payment rows are untouched.
alter table public.payments alter column recipient_number set default '0506805681';
alter table public.payments alter column recipient_name set default 'Richard Alorzuke';
alter table public.payments enable row level security;

-- 3) ADMIN CHECK (security definer => no RLS recursion) --------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- 4) AUTO-CREATE A PROFILE WHEN SOMEONE SIGNS UP ---------------------
--    The admin email below automatically becomes the admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  fname text := coalesce(meta->>'full_name', '');
begin
  insert into public.profiles
    (id, email, full_name, phone, country, country_flag, currency,
     avatar_initial, is_admin)
  values (
    new.id,
    new.email,
    fname,
    coalesce(meta->>'phone', ''),
    coalesce(meta->>'country', 'Ghana'),
    coalesce(meta->>'country_flag', 'GH'),
    coalesce(meta->>'currency', 'GHS'),
    upper(left(fname, 1)),
    lower(new.email) = 'stevewealthstrategist@gmail.com'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) CUSTOMER ACTION: request a plan (they cannot edit their own status)
create or replace function public.request_plan(p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan not in ('basic','starter','standard','pro','elite') then
    raise exception 'invalid plan';
  end if;
  update public.profiles
     set pending_plan = p_plan, plan_status = 'pending'
   where id = auth.uid();
end;
$$;
grant execute on function public.request_plan(text) to authenticated;

-- 6) POLICIES: PROFILES ----------------------------------------------
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- 7) POLICIES: PAYMENTS ----------------------------------------------
drop policy if exists "payments_read_own" on public.payments;
create policy "payments_read_own"
  on public.payments for select
  using (auth.uid() = user_id);

drop policy if exists "payments_insert_own" on public.payments;
create policy "payments_insert_own"
  on public.payments for insert
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "payments_admin_read" on public.payments;
create policy "payments_admin_read"
  on public.payments for select
  using (public.is_admin());

drop policy if exists "payments_admin_update" on public.payments;
create policy "payments_admin_update"
  on public.payments for update
  using (public.is_admin())
  with check (public.is_admin());

-- 8) PREDICTIONS (saved analysis results, one row per predicted match) ----
create table if not exists public.predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  league text,
  home_team text,
  away_team text,
  pick text,
  win_rate integer,
  source_screenshot text,
  created_at timestamptz not null default now()
);
alter table public.predictions enable row level security;

drop policy if exists "predictions_read_own" on public.predictions;
create policy "predictions_read_own"
  on public.predictions for select
  using (auth.uid() = user_id);

drop policy if exists "predictions_insert_own" on public.predictions;
create policy "predictions_insert_own"
  on public.predictions for insert
  with check (auth.uid() = user_id);

drop policy if exists "predictions_admin_read" on public.predictions;
create policy "predictions_admin_read"
  on public.predictions for select
  using (public.is_admin());

-- 9) STORAGE: private bucket for payment screenshots ------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

drop policy if exists "proofs_upload_own" on storage.objects;
create policy "proofs_upload_own"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "proofs_read_own" on storage.objects;
create policy "proofs_read_own"
  on storage.objects for select
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "proofs_admin_read" on storage.objects;
create policy "proofs_admin_read"
  on storage.objects for select
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- 9) BACK-FILL for accounts that already exist ------------------------
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

update public.profiles
   set is_admin = true
 where lower(email) = 'stevewealthstrategist@gmail.com';

-- 10) "IS THIS EMAIL ALREADY A REAL (PAID) ACCOUNT?" ---------------------
--     New customers are NOT saved to Supabase until they submit their
--     registration-fee proof. So an email is only "taken" when a paid
--     (pending/approved) account or the admin already uses it.
create or replace function public.email_has_paid_account(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(u.email) = lower(p_email)
       and (
         p.is_admin
         or exists (
           select 1 from public.payments pay
            where pay.user_id = p.id
              and pay.payment_type = 'registration'
              and pay.status in ('pending', 'approved')
         )
       )
  );
$$;
grant execute on function public.email_has_paid_account(text) to anon, authenticated;
