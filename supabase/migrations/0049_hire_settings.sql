-- 0049_hire_settings.sql  (Hire Management — P0)
-- ============================================================================
-- Org-level hire preferences, including the RENAMABLE agreement label. Stored
-- as a single jsonb blob (mirrors service_settings / suppliers etc.). NULL =>
-- the app applies defaults:
--   { "agreementLabelSingular": "Hire Agreement",
--     "agreementLabelPlural":   "Hire Agreements",
--     "prorationBasis":         "calendar" }
-- organization_settings already has RLS, so no policy change is needed.
-- Reversible via teardown_hire_management.sql.
-- ============================================================================

alter table public.organization_settings
  add column if not exists hire_settings jsonb;
