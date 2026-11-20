-- =====================================================================
--  OPTIONAL one-time cleanup: remove accounts that never paid the
--  registration fee (e.g. your earlier test sign-ups).
--  Keeps: the admin, and anyone with a pending/approved registration
--  payment. Deleting from auth.users also deletes their profile.
--  Supabase -> SQL Editor -> paste -> Run
-- =====================================================================
delete from auth.users
 where id in (
   select p.id
     from public.profiles p
    where p.is_admin = false
      and not exists (
        select 1 from public.payments pay
         where pay.user_id = p.id
           and pay.payment_type = 'registration'
           and pay.status in ('pending', 'approved')
      )
 );
