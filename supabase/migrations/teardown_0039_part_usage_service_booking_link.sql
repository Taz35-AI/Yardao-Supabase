-- ============================================================================
-- Teardown for 0039 — removes the booking link from part_usage.
--
-- Run ONLY to fully revert migration 0039. Safe: drops just the added column
-- and its index. All part_usage history rows remain intact — they simply lose
-- their job attribution. Idempotent.
-- ============================================================================

drop index if exists public.part_usage_org_booking_idx;

alter table public.part_usage
  drop column if exists service_booking_id;
