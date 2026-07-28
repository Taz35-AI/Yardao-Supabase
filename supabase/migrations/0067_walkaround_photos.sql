-- 0067_walkaround_photos.sql
-- ============================================================================
-- Walk-around photos: a fixed set of standard vehicle angles (front, sides,
-- front/rear 3/4 angles) captured alongside damage pins. Stored as a jsonb
-- ARRAY of { angle, url, createdAt } — URLs only (photos live in the
-- `damage-photos` Storage bucket), never base64, so rows stay small.
--
-- Mirrors damage_pins: same two tables, same fleet<->yard sync, jsonb-passthrough
-- (inner keys stay camelCase). Nullable + defaults to nothing, so existing rows
-- and every write path that omits it are unaffected.
-- ============================================================================

alter table public.vehicles
  add column if not exists walkaround_photos jsonb;

alter table public.checked_in_vehicles
  add column if not exists walkaround_photos jsonb;
