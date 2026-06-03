-- ============================================================================
-- YARDAO → Supabase  |  0012_hire.sql
-- Out-on-hire / return tracking + hire history.
--
-- The checked_in_vehicles row (0001) already carries the per-vehicle hire state
-- (hire_status, original_status, hired_at/by/by_name, hire_notes,
-- current_hire_history_id). This migration adds the append-once-per-hire ledger
-- read by HireHistoryService and written by VehicleHireService.
--
-- Conventions (see 0001):
--   * snake_case columns; uuid PK; org-scoped via organization_id.
--   * branch refs are TEXT (the app keys branches by a stable string —
--     a branch uuid as string, or the 'main'/slug literal — and passes it
--     through unchanged; matches checked_in_vehicles.branch_id).
--   * Person refs (hired_by / returned_by) are TEXT: the app stores the raw
--     userId string and can pass non-uuid actors. createdAt/updatedAt +
--     hire dates → timestamptz; the data layer revives them to Date objects.
-- ============================================================================

-- ============================================================================
-- hire_history  (one row per time a vehicle goes out on hire; closed on return)
-- ============================================================================
create table public.hire_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- vehicle snapshot
  vehicle_id        text,                 -- checked_in_vehicles row id at hire time (kept as text for parity)
  registration      text not null,        -- canonical reg key (uppercase, no spaces)
  make              text,
  model             text,
  -- hire period
  hire_start_date   timestamptz,
  hire_end_date     timestamptz,          -- null while still out on hire
  duration_in_days  int,                  -- computed on return
  -- who hired it
  hired_by          text,
  hired_by_name     text,
  hire_notes        text,
  -- who returned it
  returned_by       text,
  returned_by_name  text,
  return_notes      text,
  -- branch
  branch_id         text,                 -- stable branch key (see checked_in_vehicles.branch_id)
  branch_name       text,
  -- timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index hire_history_org_idx      on public.hire_history(organization_id);
create index hire_history_org_reg_idx  on public.hire_history(organization_id, registration);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.hire_history enable row level security;

create policy hire_history_org_rw on public.hire_history
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());
