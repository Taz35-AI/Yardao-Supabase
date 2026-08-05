-- 0070_external_garage_phone.sql
-- Optional phone number on external garages (Settings → External Garages).
-- Shown in the daily report's "Vehicles checked out at external garages"
-- section so whoever reads the report can ring the garage straight away.
-- (Applied to production 2026-08-05 via the management API.)

alter table public.external_garages
  add column if not exists phone text;
