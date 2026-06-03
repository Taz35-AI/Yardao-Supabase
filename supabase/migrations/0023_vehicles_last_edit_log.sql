-- ============================================================================
-- 0023_vehicles_last_edit_log.sql
-- The fleet update flows (edit modal, MOT-done via Zao, insurance changes)
-- attach an audit `lastEditLog` to the vehicle, same as checked_in_vehicles.
-- The vehicles table was missing the column, so those writes failed with
-- PGRST204 ("Could not find the 'last_edit_log' column"). Add it.
-- Idempotent.
-- ============================================================================
alter table public.vehicles add column if not exists last_edit_log jsonb;
