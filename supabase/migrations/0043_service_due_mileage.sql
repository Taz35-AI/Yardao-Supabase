-- 0043_service_due_mileage.sql
-- ============================================================================
-- Mileage-at-check-in + "service due" flagging.
--
-- 1. organization_settings.service_settings (jsonb)
--    Holds the org's check-in/service preferences:
--      {
--        "captureMileageOnCheckIn": true,   -- require mileage to check a vehicle in
--        "serviceDueEnabled":       true,   -- flag vehicles overdue for a service
--        "serviceDueThresholdMiles": 10000  -- miles-since-last-service that trips the flag
--      }
--    Stored as a single jsonb blob (mirrors suppliers / from_companies etc.).
--    NULL/missing => the app applies its defaults (capture on, flag on, 10,000).
--
-- 2. checked_in_vehicles service-due columns
--    The flag lives on the CHECKED-IN row (where the current mileage is captured),
--    not the fleet record. Because that row is recreated on each yard stay, the
--    flag self-resets per check-in — no stale "service due" lingering after a
--    service is done and the vehicle returns.
--      service_due           : true when overdue at the last check-in
--      service_due_miles     : how many miles past the threshold (for display)
--      last_service_mileage  : the odometer at the last recorded service (basis)
-- ============================================================================

alter table public.organization_settings
  add column if not exists service_settings jsonb;

alter table public.checked_in_vehicles
  add column if not exists service_due boolean not null default false;

alter table public.checked_in_vehicles
  add column if not exists service_due_miles integer;

alter table public.checked_in_vehicles
  add column if not exists last_service_mileage integer;

-- Cheap partial index so the Service Banner / dashboard can pull flagged
-- vehicles per org without scanning the whole yard.
create index if not exists checked_in_vehicles_service_due_idx
  on public.checked_in_vehicles (organization_id)
  where service_due = true;
