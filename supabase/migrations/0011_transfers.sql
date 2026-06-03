-- ============================================================================
-- YARDAO → Supabase  |  0011_transfers.sql
-- Vehicle transfers (branch↔branch) + external-garage checkout for
-- src/lib/services/transferService.ts.
--
-- Finding: transferService operates ENTIRELY on `checked_in_vehicles`. It reads
-- a row (registration / branch_id / external_garage_name) and updates the
-- transfer + garage columns in place. There is NO separate transfers
-- collection in the Firestore original, so no new table is required — every
-- column the service writes already exists on checked_in_vehicles
-- (0001_core_schema.sql, "transfer / in-transit" + "external garage" blocks):
--   transfer_status, target_branch_id, target_branch_name,
--   transfer_initiated_at, transfer_initiated_by, transfer_initiated_by_name,
--   external_garage_name, service_booking_id, checked_out_to_garage_at,
--   checked_out_to_garage_by, checked_out_to_garage_by_name, last_edit_log.
-- branch columns are already text; transfer_status CHECK already allows
-- 'in_transit' and 'at_external_garage'.
--
-- The ONE adjustment: service_booking_id was modelled as uuid, but the service
-- writes the raw service-booking id string straight through (Firestore
-- pass-through semantics). Relax it to text so that write can never fail on a
-- non-uuid id, matching the original's behaviour. (text accepts uuid strings
-- too, so existing/fresh uuid ids keep working.)
-- ============================================================================

alter table public.checked_in_vehicles
  alter column service_booking_id type text using service_booking_id::text;
