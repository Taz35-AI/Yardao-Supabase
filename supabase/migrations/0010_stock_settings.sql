-- ============================================================================
-- YARDAO → Supabase  |  0010_stock_settings.sql
-- Backing schema for stockService + settingsService (Phase 4 data-layer swap).
--
-- stockService maps entirely to tables that already exist in 0001
-- (stock_parts, part_usage, order_history, stock_adjustments, invoices) — no
-- new tables needed there.
--
-- settingsService stores a single per-org "organization settings" document
-- holding opaque arrays/maps (suppliers, from/to companies, insurance
-- policies, contract→default-status map). The existing public.organization_settings
-- table (0001) carries scalar tenant settings keyed by organization_id; we
-- extend it with the jsonb columns this service needs so both settings
-- surfaces share the one per-org row (organization_id is already UNIQUE there).
-- ============================================================================

-- ── organization_settings: settingsService jsonb columns ────────────────────
-- Stored as jsonb arrays/objects so the camel-cased element shapes
-- (FromCompanyDetails, InsurancePolicy, etc.) pass through dbMap untouched.
alter table public.organization_settings
  add column if not exists suppliers                  jsonb       not null default '[]'::jsonb,
  add column if not exists from_companies             jsonb       not null default '[]'::jsonb,
  add column if not exists to_companies               jsonb       not null default '[]'::jsonb,
  add column if not exists insurance_policies         jsonb       not null default '[]'::jsonb,
  add column if not exists contract_default_statuses  jsonb       not null default '{}'::jsonb,
  add column if not exists created_at                 timestamptz not null default now();
