-- Adds three-way probability fields to the existing predictions table.
-- Safe to re-run. Run in Supabase SQL Editor after schema.sql / agents.sql.
alter table public.predictions add column if not exists home_prob numeric(5,2);
alter table public.predictions add column if not exists draw_prob numeric(5,2);
alter table public.predictions add column if not exists away_prob numeric(5,2);
alter table public.predictions add column if not exists confidence integer;
alter table public.predictions add column if not exists data_quality text;
alter table public.predictions add column if not exists model_json jsonb;
