-- 0068_insurance_change_log.sql
-- ============================================================================
-- Per-vehicle insurance history. One row per change of insurance status/policy,
-- so the Fleet "Insurance Status" section can show, at a glance, what each
-- vehicle's insurance history was: reg + make/model, from → to policy, when,
-- and who did it. Written from every insurance-change path (fleet edit, yard,
-- detail modal). Append-only; never updated.
-- ============================================================================

create table if not exists public.insurance_change_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  vehicle_id       uuid,                  -- fleet vehicle id (nullable: yard-only rows)
  registration     text,
  make             text,
  model            text,
  from_status      text,                  -- 'Insured' | 'Not Insured' | null (first time)
  from_policy_name text,
  to_status        text,                  -- 'Insured' | 'Not Insured'
  to_policy_name   text,
  changed_by       uuid,
  changed_by_name  text,
  source           text,                  -- 'fleet_edit' | 'yard' | 'detail_modal' | 'bulk'
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists insurance_change_log_org_idx
  on public.insurance_change_log(organization_id, created_at desc);
create index if not exists insurance_change_log_vehicle_idx
  on public.insurance_change_log(organization_id, vehicle_id, created_at desc);
create index if not exists insurance_change_log_reg_idx
  on public.insurance_change_log(organization_id, registration);

alter table public.insurance_change_log enable row level security;
create policy insurance_change_log_org_rw on public.insurance_change_log
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());
