-- ============================================================================
-- YARDAO → Supabase  |  0037_normalize_size.sql
-- ----------------------------------------------------------------------------
-- Normalise vehicle SIZE to a single canonical form: trimmed + UPPER-CASE.
-- Imports / free-text entry left the same size as "Car", "CAR", "CaR", " car "
-- etc., which then showed up as separate sizes in filters and breakdowns.
-- Folding them to one canonical value fixes that everywhere (dashboard size
-- facet AND the old summary size modal).
--
-- Safe: only rewrites the casing/whitespace of an existing text value; no rows
-- added/removed, no other column touched.
-- ============================================================================

update public.vehicles            set size = upper(trim(size)) where size is not null and size <> upper(trim(size));
update public.checked_in_vehicles  set size = upper(trim(size)) where size is not null and size <> upper(trim(size));
