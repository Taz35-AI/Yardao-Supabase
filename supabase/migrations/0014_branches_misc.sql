-- ============================================================================
-- YARDAO → Supabase  |  0014_branches_misc.sql
-- Support tables/columns for the branchService, organizationService,
-- externalGarageService, conditionService and contractService ports.
--
-- branches / contracts / condition_categories / external_garages already exist
-- in 0001. This migration:
--   * adds branches.vehicle_count (Branch.vehicleCount — written on create)
--   * adds condition_categories.is_editable + updated_at (standalone
--     ConditionCategory contract carries isEditable/updatedAt; sort_order ↔
--     ConditionCategory.order is already in 0001)
--   * creates branch_migrations (one row per org, keyed by organization_id) for
--     branchService.checkMigrationStatus / runMigration
-- ============================================================================

-- ── branches: vehicle_count ──────────────────────────────────────────────────
alter table public.branches
  add column if not exists vehicle_count int not null default 0;

-- ── condition_categories: is_editable + updated_at ───────────────────────────
alter table public.condition_categories
  add column if not exists is_editable boolean not null default true;
alter table public.condition_categories
  add column if not exists updated_at  timestamptz;

-- ============================================================================
-- branch_migrations  (BranchMigration — one row per org)
-- The Firestore version keyed the doc by organizationId; here organization_id is
-- both the tenant boundary and the natural key (unique).
-- ============================================================================
create table if not exists public.branch_migrations (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  migration_completed    boolean not null default false,
  migration_date         timestamptz,
  migrated_vehicle_count int,
  created_at             timestamptz not null default now(),
  unique (organization_id)
);
create index if not exists branch_migrations_org_idx on public.branch_migrations(organization_id);

alter table public.branch_migrations enable row level security;

create policy branch_migrations_org_rw on public.branch_migrations
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Realtime parity with the Firestore branch subscription (subscribeToBranches).
alter publication supabase_realtime add table public.branches;
