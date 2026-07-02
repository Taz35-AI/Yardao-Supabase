-- 0055_booking_carry_over.sql  (Service bookings — carry a job to another day)
-- ============================================================================
-- When a job isn't finished, it is CARRIED OVER: the SAME booking row is
-- re-dated (one booking = one job = one invoice). `carried_over_slots` banks the
-- 30-min slots the job used on PREVIOUS days so the invoice bills the TOTAL
-- hours across every day (labour = carried_over_slots + slot_count).
-- `carried_over_count` records how many times it has spilled over. Both default
-- 0, so existing jobs and non-users are unaffected. Additive + re-runnable.
-- ============================================================================

alter table public.service_bookings
  add column if not exists carried_over_slots int not null default 0,
  add column if not exists carried_over_count int not null default 0;
