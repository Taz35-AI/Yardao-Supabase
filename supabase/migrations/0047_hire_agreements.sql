-- 0047_hire_agreements.sql  (Hire Management — P0)
-- ============================================================================
-- The hire agreement (renamable in the UI) = the spine: a customer's dated,
-- rated hire with a set of vehicle LINES. Each line is the unit of proration —
-- everything bills off rental_agreement_vehicles.
--
-- This is SEPARATE from the existing public.contracts (yard labels), which are
-- untouched. New tables => RLS + org policy + realtime. Reversible via
-- teardown_hire_management.sql.
-- ============================================================================

-- ── Agreement (header) ──────────────────────────────────────────────────────
create table if not exists public.rental_agreements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       text,
  branch_name     text,
  customer_id     uuid references public.rental_customers(id) on delete set null,
  customer_name   text,                                  -- denorm for boards
  reference       text,
  start_date      date not null,
  duration_value  int  not null,
  duration_unit   text not null check (duration_unit in ('weeks','months')),
  end_date        date,                                  -- computed by the app from start + duration
  rate_type       text not null check (rate_type in ('weekly','monthly')),
  rate_amount     numeric not null,
  currency        text not null default 'GBP',
  status          text not null default 'draft'
                    check (status in ('draft','active','completed','cancelled')),
  notes           text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists rental_agreements_org_idx on public.rental_agreements(organization_id);
create index if not exists rental_agreements_customer_idx on public.rental_agreements(organization_id, customer_id);
alter table public.rental_agreements enable row level security;
create policy rental_agreements_org_rw on public.rental_agreements
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Vehicle lines (the proration unit) ──────────────────────────────────────
create table if not exists public.rental_agreement_vehicles (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  agreement_id        uuid not null references public.rental_agreements(id) on delete cascade,
  vehicle_id          text,
  registration        text,                              -- denorm for 3-digit search + boards
  make                text,
  model               text,
  scheduled_start     date,                              -- defaults to agreement.start_date
  scheduled_end       date,
  actual_out_at       timestamptz,                       -- when it really went on hire
  actual_return_at    timestamptz,
  status              text not null default 'scheduled'
                        check (status in ('scheduled','active','returned','swapped','cancelled')),
  swapped_from_line_id uuid,                             -- swap chain links (see 0048)
  swapped_to_line_id   uuid,
  line_rate_type      text,                              -- rate snapshot at attach time
  line_rate_amount    numeric,
  notes               text,
  created_by          uuid,
  created_by_name     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);
create index if not exists rental_agreement_vehicles_agr_idx
  on public.rental_agreement_vehicles(organization_id, agreement_id);
create index if not exists rental_agreement_vehicles_vehicle_idx
  on public.rental_agreement_vehicles(organization_id, vehicle_id);
-- A vehicle can only be ACTIVE on one line at a time (anti double-hire).
create unique index if not exists rental_agreement_vehicles_one_active
  on public.rental_agreement_vehicles(organization_id, vehicle_id)
  where status = 'active';
alter table public.rental_agreement_vehicles enable row level security;
create policy rental_agreement_vehicles_org_rw on public.rental_agreement_vehicles
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Yard link column ────────────────────────────────────────────────────────
alter table public.checked_in_vehicles
  add column if not exists current_agreement_line_id uuid;

-- ── Realtime (RLS still applies) ────────────────────────────────────────────
alter publication supabase_realtime add table public.rental_agreements;
alter publication supabase_realtime add table public.rental_agreement_vehicles;
