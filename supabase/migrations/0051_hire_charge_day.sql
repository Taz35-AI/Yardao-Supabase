-- 0051_hire_charge_day.sql  (Hire Management — billing charge day)
-- ============================================================================
-- Weekly contracts can bill on a fixed weekday (e.g. always Friday) regardless
-- of the start day. charge_day = JS getDay() weekday (0=Sun … 6=Sat); NULL means
-- "same as the start day" (no stub). Ignored for 4-weekly contracts (those
-- always anchor to the start of each 28-day period). Additive, re-runnable.
-- ============================================================================

alter table public.rental_agreements
  add column if not exists charge_day smallint;
