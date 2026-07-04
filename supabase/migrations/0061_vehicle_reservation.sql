-- 0061_vehicle_reservation.sql  (Yard — admin vehicle reservation / hold)
-- ============================================================================
-- Lets an admin RESERVE a vehicle that's in the yard with a note. Reserved
-- vehicles are blocked from checkout and flagged "Reserved" on the yard map.
-- Stored on checked_in_vehicles (the live yard record), so the hold is
-- per-yard-stay and clears naturally when the vehicle leaves / is re-checked-in.
-- All nullable/defaulted + additive + re-runnable.
-- ============================================================================

alter table public.checked_in_vehicles
  add column if not exists is_reserved   boolean not null default false,
  add column if not exists reserved_note text,
  add column if not exists reserved_by   text,          -- display name of the admin
  add column if not exists reserved_at   timestamptz;
