-- 0073_mileage_override.sql  (Yard — manager override of a wrong mileage)
-- ============================================================================
-- Staff sometimes key the odometer wrong (an extra digit, say). Because the
-- mileage log (0044) is append-only and enforces an anti-clocking floor, a
-- wrong HIGH reading then blocks every correct reading that follows. This adds
-- a "void" marker so the org OWNER / GARAGE MANAGER can mark the wrong readings
-- as such from the vehicle edit dialog. Voided rows stay on record (audit) but
-- no longer count towards the floor or the fleet's current-mileage cache.
--
--   • voided_at / voided_by / void_reason on mileage_readings
--   • 'override' allowed as a reading source
--   • RLS split: everyone in the org can read + insert; only owner / garage
--     manager (auth_can_write_money, migration 0054) can UPDATE (= void);
--     nobody can delete.
-- Additive + re-runnable.
-- ============================================================================

alter table public.mileage_readings
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   text,
  add column if not exists void_reason text;

alter table public.mileage_readings drop constraint if exists mileage_readings_source_check;
alter table public.mileage_readings add constraint mileage_readings_source_check
  check (source in ('check_in','quick_check_in','edit','service','manual','import','override'));

create index if not exists mileage_readings_live_idx
  on public.mileage_readings(organization_id, registration_key, recorded_at desc)
  where voided_at is null;

drop policy if exists mileage_readings_org_rw  on public.mileage_readings;
drop policy if exists mileage_readings_read    on public.mileage_readings;
drop policy if exists mileage_readings_insert  on public.mileage_readings;
drop policy if exists mileage_readings_void    on public.mileage_readings;

create policy mileage_readings_read on public.mileage_readings
  for select to authenticated
  using (organization_id = public.auth_org_id());

create policy mileage_readings_insert on public.mileage_readings
  for insert to authenticated
  with check (organization_id = public.auth_org_id());

create policy mileage_readings_void on public.mileage_readings
  for update to authenticated
  using      (organization_id = public.auth_org_id() and public.auth_can_write_money())
  with check (organization_id = public.auth_org_id() and public.auth_can_write_money());
