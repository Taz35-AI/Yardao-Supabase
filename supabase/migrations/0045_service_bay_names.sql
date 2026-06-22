-- 0045_service_bay_names.sql
-- ============================================================================
-- Custom display names for service bays (ramps).
--
-- A bay's IDENTITY stays its number: bookings, service history and the
-- scheduling logic all reference service_bay (an int), never the name. This
-- column only stores how each bay is *labelled* in the UI.
--
--   service_bay_names : jsonb array of strings, index 0 = bay 1's name,
--                       index 1 = bay 2, etc. e.g. ["MOT Ramp","Diagnostics"]
--                       NULL / missing / blank entry => the app shows "Bay N".
--
-- Renaming a bay never moves a booking; it's display-only. Safe to add with no
-- backfill — existing branches keep showing the default "Bay N".
-- ============================================================================

alter table public.branches
  add column if not exists service_bay_names jsonb;
