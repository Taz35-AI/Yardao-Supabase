-- ============================================================================
-- YARDAO → Supabase  |  0036_insurance_never_unknown.sql
-- ----------------------------------------------------------------------------
-- Insurance is ALWAYS "Insured" or "Not Insured" — never null ("Unknown").
--
-- The column was nullable with no default, so any vehicle whose insurance was
-- never explicitly chosen (old check-ins, fleet adds, migrated Firebase rows)
-- ended up null and rendered as the grey "Unknown" badge. There was no rule
-- forcing one of the two real values.
--
-- This migration:
--   1. Backfills every null to 'Not Insured' (the compliance-safe default —
--      a vehicle is treated as uninsured until insurance is recorded).
--   2. Sets the column default to 'Not Insured'.
--   3. Makes the column NOT NULL so "Unknown" can never occur again.
--
-- ‼️ HEADS-UP: vehicles that were "Unknown" will now show "Not Insured" (red)
-- and will surface in insurance warnings. That's intended — you then flip the
-- genuinely-insured ones to "Insured" (with their policy). No more ambiguous
-- middle state.
--
-- Safe: existing 'Insured'/'Not Insured' rows are untouched; reversible by
-- dropping NOT NULL / the default.
-- ============================================================================

-- 1. Backfill nulls → 'Not Insured'
update public.vehicles            set insurance_status = 'Not Insured' where insurance_status is null;
update public.checked_in_vehicles set insurance_status = 'Not Insured' where insurance_status is null;

-- 2. Default for future rows
alter table public.vehicles            alter column insurance_status set default 'Not Insured';
alter table public.checked_in_vehicles alter column insurance_status set default 'Not Insured';

-- 3. Forbid null (no more "Unknown")
alter table public.vehicles            alter column insurance_status set not null;
alter table public.checked_in_vehicles alter column insurance_status set not null;
