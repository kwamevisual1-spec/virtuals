-- Update the destination shown for NEW registration and subscription payments.
-- Existing payment rows are intentionally left unchanged for historical accuracy.
alter table public.payments
  alter column recipient_number set default '0506805681';

alter table public.payments
  alter column recipient_name set default 'Richard Alorzuke';
