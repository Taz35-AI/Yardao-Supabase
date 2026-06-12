-- ============================================================================
-- 0039: link each part-usage row to the service booking (job) it belongs to
--
-- Until now part_usage recorded only (part, vehicle, timestamp) — there was no
-- field saying WHICH job a part was used on. Invoicing therefore had to scoop
-- "all parts for this registration in the last 10 days", which lumps together
-- two separate services done on the same vehicle inside that window.
--
-- This adds an OPTIONAL foreign key to service_bookings so each part used can be
-- attributed to exactly one job. It is nullable + additive:
--   • every existing row stays valid (service_booking_id = null = "not tied to a
--     job" = the current/legacy behaviour),
--   • ad-hoc scans made with no open job also stay null and can be claimed later.
--
-- on delete set null: deleting a booking must NEVER delete stock-usage history
-- (the part still physically left the shelf) — it only unlinks the row.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.part_usage
  add column if not exists service_booking_id uuid
  references public.service_bookings(id) on delete set null;

-- Fast "all parts for this job" lookups, organization-scoped.
create index if not exists part_usage_org_booking_idx
  on public.part_usage(organization_id, service_booking_id);
