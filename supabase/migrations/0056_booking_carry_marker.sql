-- 0056_booking_carry_marker.sql  (Service bookings — carry-over trail marker)
-- ============================================================================
-- Carrying a job over MOVES the live booking to the next day (keeping its parts,
-- hours and single invoice) and leaves a read-only "carried over" MARKER on the
-- original day so the trail is visible. `carried_forward` flags such a marker;
-- `carried_to_date` is the day the job moved to (for its label). Markers are
-- inert: never invoiced, excluded from counts and bay-conflict checks.
-- Additive + re-runnable; defaults keep existing rows unaffected.
-- ============================================================================

alter table public.service_bookings
  add column if not exists carried_forward boolean not null default false,
  add column if not exists carried_to_date date;
