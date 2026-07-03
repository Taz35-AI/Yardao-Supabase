-- 0060_vehicle_defleet_due_date.sql  (Fleet — explicit defleet-due date)
-- ============================================================================
-- Adds an EXPECTED / TARGET defleet date, used as an alternative to the
-- rental term (weeks). When a supplier gives an exact defleet date, it is
-- stored here and used verbatim; otherwise the due date is still derived from
-- rental_term_weeks. This is distinct from `defleet_date`, which records when a
-- vehicle was ACTUALLY defleeted. Nullable + additive + re-runnable.
-- ============================================================================

alter table public.vehicles
  add column if not exists defleet_due_date date;
