-- ============================================================================
-- YARDAO → Supabase  |  0015_bulk_insurance.sql
-- Schema for the bulk-insurance / bulk-road-tax / bulk-vehicle-refresh services.
--
-- What these services actually touch:
--   * bulkInsuranceService  — sets vehicles.insurance_status (+ an audit blob)
--   * bulkRoadTaxService     — sets vehicles.tax_expiry        (+ an audit blob)
--   * bulkVehicleRefreshService — enqueues a server-side DVLA refresh job and
--                                  watches its live progress (was a Firestore
--                                  doc bulkRefreshJobs/{organizationId};
--                                  becomes the bulk_refresh_jobs table here).
--
-- The bulk update services write a per-vehicle audit object that the Firestore
-- version stored inline on the vehicle doc (lastInsuranceUpdate / lastTaxUpdate).
-- These are opaque maps → jsonb columns on `vehicles`, matching the dbMap
-- jsonb-passthrough convention (camelCase keys preserved verbatim).
--
-- insurance_policies: created per the migration brief. NOTE: none of the four
-- ported services in this phase read or write this table — they only flip the
-- vehicles.insurance_status enum. It is provisioned here so the existing
-- vehicles.insurance_policy_id / _name / _expiry columns (added in 0001) have a
-- real table to point at when the policy-management feature is ported.
-- ============================================================================

-- ── vehicles: bulk-update audit blobs ────────────────────────────────────────
-- Opaque audit objects written by the bulk services. Stored as jsonb so the
-- nested camelCase shape ({ updatedBy, updatedByName, updatedAt, source,
-- bulkOperation, previousInsuranceStatus }) passes through untouched.
alter table public.vehicles
  add column if not exists last_insurance_update jsonb,
  add column if not exists last_tax_update       jsonb;

-- ============================================================================
-- insurance_policies
-- ============================================================================
create table if not exists public.insurance_policies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  policy_name     text not null,
  provider        text,
  policy_number   text,
  start_date      date,
  expiry_date     date,
  notes           text,
  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists insurance_policies_org_idx on public.insurance_policies(organization_id);
create trigger insurance_policies_set_updated_at before update on public.insurance_policies
  for each row execute function public.set_updated_at();

-- ============================================================================
-- bulk_refresh_jobs
-- One live job row per organization (the org id IS the natural key, mirroring
-- the Firestore doc bulkRefreshJobs/{organizationId}). The DVLA refresh runs
-- server-side and writes progress here; the client subscribes for a progress
-- bar. status/total/processed/updated/not_found/errors mirror BulkRefreshProgress.
-- ============================================================================
create table if not exists public.bulk_refresh_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  status          text not null default 'requested' check (status in ('requested','running','done','error')),
  total           int  not null default 0,
  processed       int  not null default 0,
  updated         int  not null default 0,
  not_found       int  not null default 0,
  errors          int  not null default 0,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists bulk_refresh_jobs_org_idx on public.bulk_refresh_jobs(organization_id);
create trigger bulk_refresh_jobs_set_updated_at before update on public.bulk_refresh_jobs
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.insurance_policies enable row level security;
alter table public.bulk_refresh_jobs  enable row level security;

create policy insurance_policies_org_rw on public.insurance_policies
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

create policy bulk_refresh_jobs_org_rw on public.bulk_refresh_jobs
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Replaces the Firestore onSnapshot the refresh service used for live progress.
alter publication supabase_realtime add table public.bulk_refresh_jobs;
