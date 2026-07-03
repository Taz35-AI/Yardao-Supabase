-- 0058_vehicle_supplier_rental_term.sql  (Fleet — supplier + rental term)
-- ============================================================================
-- Adds the vehicle's SUPPLIER and its RENTAL TERM (in months) so the fleet page
-- can flag vehicles approaching / past their defleet-due date
-- (defleet due = date_acquired + rental_term_months). Both nullable + additive,
-- so existing vehicles and non-users are unaffected. Re-runnable.
-- ============================================================================

alter table public.vehicles
  add column if not exists supplier            text,
  add column if not exists rental_term_months  int;
