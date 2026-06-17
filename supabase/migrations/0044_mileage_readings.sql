-- ============================================================================
-- 0044_mileage_readings.sql
-- Gold-standard odometer history.
--
-- Until now a vehicle's mileage lived only on its current checked-in row and
-- was archived piecemeal into checkout_history / service records. There was no
-- single source of truth and no timeline. This adds:
--
--   1. public.mileage_readings — an APPEND-ONLY log: one row per odometer
--      reading (check-in, return-from-hire, edit, service, manual). Powers the
--      anti-clocking floor (one indexed query), the per-vehicle timeline, and
--      future analytics (avg daily use, service-by-mileage forecasting).
--
--   2. vehicles.last_recorded_mileage / last_mileage_at — a fast cache of the
--      latest reading, so the fleet record always shows current mileage even
--      when the vehicle isn't in the yard.
--
--   3. A one-time backfill from every existing source so the floor/timeline
--      have full history from day one.
--
-- Conventions mirror 0034_activity_log: snake_case, uuid PK, org-scoped via
-- organization_id + auth_org_id() RLS, append-only.
-- Idempotent: safe to run more than once (backfill only runs when empty).
-- ============================================================================

create table if not exists public.mileage_readings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  -- fleet link when known; null for custom / non-fleet vehicles (matched by key)
  vehicle_id       uuid references public.vehicles(id) on delete set null,
  registration     text not null,
  registration_key text not null,                    -- UPPER, no spaces
  mileage          integer not null check (mileage >= 0),
  recorded_at      timestamptz not null default now(),
  source           text not null default 'manual'
                     check (source in ('check_in','quick_check_in','edit','service','manual','import')),
  recorded_by      text,
  recorded_by_name text,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists mileage_readings_org_regkey_idx
  on public.mileage_readings(organization_id, registration_key, recorded_at desc);
create index if not exists mileage_readings_org_vehicle_idx
  on public.mileage_readings(organization_id, vehicle_id);

alter table public.mileage_readings enable row level security;

drop policy if exists mileage_readings_org_rw on public.mileage_readings;
create policy mileage_readings_org_rw on public.mileage_readings
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Fast cache on the fleet vehicle (latest reading)
alter table public.vehicles add column if not exists last_recorded_mileage integer;
alter table public.vehicles add column if not exists last_mileage_at timestamptz;

-- ── One-time backfill (only when the log is empty) ──────────────────────────
do $$
begin
  if not exists (select 1 from public.mileage_readings) then

    -- Current in-yard readings
    insert into public.mileage_readings
      (organization_id, vehicle_id, registration, registration_key, mileage, recorded_at, source)
    select organization_id, vehicle_id, registration,
           upper(regexp_replace(registration, '\s', '', 'g')),
           nullif(regexp_replace(mileage, '[^0-9]', '', 'g'), '')::int,
           coalesce(check_in_time, created_at, now()), 'import'
    from public.checked_in_vehicles
    where nullif(regexp_replace(coalesce(mileage,''), '[^0-9]', '', 'g'), '') is not null;

    -- Past stays (checkout history)
    insert into public.mileage_readings
      (organization_id, vehicle_id, registration, registration_key, mileage, recorded_at, source)
    select organization_id, null, registration,
           upper(regexp_replace(registration, '\s', '', 'g')),
           nullif(regexp_replace(mileage, '[^0-9]', '', 'g'), '')::int,
           coalesce(checked_out_date, original_check_in_date, created_at, now()), 'import'
    from public.checkout_history
    where nullif(regexp_replace(coalesce(mileage,''), '[^0-9]', '', 'g'), '') is not null;

    -- Completed services with an odometer reading
    insert into public.mileage_readings
      (organization_id, vehicle_id, registration, registration_key, mileage, recorded_at, source)
    select organization_id, null, registration,
           upper(regexp_replace(registration, '\s', '', 'g')),
           mileage,
           coalesce(completed_at, date::timestamptz, created_at, now()), 'import'
    from public.service_bookings
    where registration is not null and mileage is not null and mileage > 0;

    -- Manual service-history records with a mileage
    insert into public.mileage_readings
      (organization_id, vehicle_id, registration, registration_key, mileage, recorded_at, source)
    select organization_id, null, registration, registration_key,
           mileage::int,
           coalesce(date::timestamptz, now()), 'import'
    from public.vehicle_service_history
    where mileage is not null and mileage > 0;

  end if;
end $$;

-- ── Seed the vehicle cache from the latest reading per vehicle ───────────────
update public.vehicles v
set last_recorded_mileage = sub.mileage,
    last_mileage_at       = sub.recorded_at
from (
  select distinct on (organization_id, registration_key)
         organization_id, registration_key, mileage, recorded_at
  from public.mileage_readings
  order by organization_id, registration_key, recorded_at desc
) sub
where v.organization_id = sub.organization_id
  and upper(regexp_replace(v.registration, '\s', '', 'g')) = sub.registration_key;
