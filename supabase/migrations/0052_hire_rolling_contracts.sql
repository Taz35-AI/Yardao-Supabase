-- 0052_hire_rolling_contracts.sql  (Hire Management — rolling/flexi contracts)
-- ============================================================================
-- Rolling (flexi) contracts: a 4-week MINIMUM term, then they roll on
-- indefinitely with no fixed end (end_date stays NULL) until each vehicle is
-- returned. is_rolling marks them; duration_value/unit holds the minimum term
-- (4 weeks). Additive, re-runnable.
-- ============================================================================

alter table public.rental_agreements
  add column if not exists is_rolling boolean not null default false;
