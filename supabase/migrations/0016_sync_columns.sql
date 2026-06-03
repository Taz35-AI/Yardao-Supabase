-- ============================================================================
-- YARDAO → Supabase  |  0016_sync_columns.sql
-- Audit blobs written by the fleet⇄yard field-sync services:
--   * contractSyncService   → vehicles.last_contract_update
--   * conditionSyncService  → vehicles.last_condition_update
--   * damageSyncService     → vehicles.last_damage_update
--   * insuranceSyncService  → vehicles.last_insurance_update (already added in 0015)
--
-- Each service stamps an opaque per-vehicle audit object on the fleet row when it
-- syncs a field down from / up to the yard. The Firestore version stored these
-- inline on the vehicle doc (lastContractUpdate / lastConditionUpdate /
-- lastDamageUpdate). They are opaque maps → jsonb, matching the dbMap
-- jsonb-passthrough convention (nested camelCase keys preserved verbatim:
-- { updatedBy, updatedByName, updatedAt, source, vehicleId | registration |
--   previousContract | pinCount }).
--
-- All other fields these services write already exist on vehicles /
-- checked_in_vehicles (contract, contract_color, condition, damage_pins,
-- insurance_status + policy columns, last_edit_log). No new tables are needed.
-- New columns inherit the existing vehicles RLS policy, so no policy change.
-- ============================================================================

alter table public.vehicles
  add column if not exists last_contract_update  jsonb,
  add column if not exists last_condition_update jsonb,
  add column if not exists last_damage_update    jsonb;
