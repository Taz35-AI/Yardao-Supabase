-- ============================================================================
-- YARDAO → Supabase  |  0013_customers_history.sql
-- Manual per-vehicle service-history records.
--
-- The `customers` table already exists (0001) and the per-customer job
-- history + the booking-sourced half of the per-vehicle service history are
-- DERIVED on demand from existing tables (service_bookings) — no storage of
-- their own. The ONLY new persistence this slice needs is the hand-entered
-- ("manual") service-history rows that the Firestore version stored in the
-- `vehicleServiceHistory` collection. Booking-sourced rows are NOT copied
-- here; they keep living in service_bookings and are merged at read time.
--
-- Conventions match 0001: snake_case columns, uuid PK, organization_id is the
-- RLS tenant boundary, dates as date, timestamps as timestamptz, person refs
-- as uuid where they are real users.
-- ============================================================================

-- ============================================================================
-- vehicle_service_history  (manual records only — mirrors ManualServiceHistoryDoc)
--   * registration       : as the user typed it (display)
--   * registration_key    : canonical UPPER/no-space key used for equality match
--   * location_type       : 'internal' | 'external'  (ServiceLocationType)
--   * mileage             : optional odometer reading
-- ============================================================================
create table public.vehicle_service_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  registration      text not null,
  registration_key  text not null,
  make              text,
  model             text,
  date              date not null,                          -- service date (YYYY-MM-DD)
  location_type     text not null check (location_type in ('internal','external')),
  garage_name       text,                                   -- when external
  work_done         text not null default '',
  mechanic_name     text,
  mileage           numeric,
  notes             text,
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index vehicle_service_history_org_idx
  on public.vehicle_service_history(organization_id);
-- per-vehicle lookups join on the canonical registration key
create index vehicle_service_history_org_regkey_idx
  on public.vehicle_service_history(organization_id, registration_key);
create trigger vehicle_service_history_set_updated_at before update on public.vehicle_service_history
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.vehicle_service_history enable row level security;
create policy vehicle_service_history_org_rw on public.vehicle_service_history
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());
