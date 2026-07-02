-- 0057_default_labour_rate.sql  (Invoicing — configurable labour rate)
-- ============================================================================
-- The invoice labour rate was hardcoded at £50/hour. This adds an org-wide
-- default rate in settings; a per-"from company" override lives in the existing
-- from_companies jsonb (no column needed). Nullable → falls back to £50 in code
-- until set. Additive + re-runnable.
-- ============================================================================

alter table public.organization_settings
  add column if not exists default_labour_rate numeric;
