-- 0048_hire_swaps_credits.sql  (Hire Management — P0)
-- ============================================================================
-- Swap log (close one line / open the next on the same agreement) and the
-- SUGGESTED credit records (downtime + early return). Credits are visibility
-- only — a manager approves before they land on the export. New tables => RLS.
-- Reversible via teardown_hire_management.sql.
-- ============================================================================

create table if not exists public.rental_swaps (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  agreement_id      uuid references public.rental_agreements(id) on delete cascade,
  from_line_id      uuid,
  from_registration text,
  to_line_id        uuid,
  to_registration   text,
  swapped_at        timestamptz not null default now(),
  reason            text,
  performed_by      uuid,
  performed_by_name text,
  created_at        timestamptz not null default now()
);
create index if not exists rental_swaps_agr_idx on public.rental_swaps(organization_id, agreement_id);
alter table public.rental_swaps enable row level security;
create policy rental_swaps_org_rw on public.rental_swaps
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

create table if not exists public.rental_credits (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  agreement_id     uuid references public.rental_agreements(id) on delete cascade,
  line_id          uuid,
  vehicle_id       text,
  registration     text,
  reason           text,                 -- 'downtime' | 'early_return' | 'manual'
  period_start     date,
  period_end       date,
  days             int,
  daily_rate       numeric,
  estimated_credit numeric,
  status           text not null default 'suggested'
                     check (status in ('suggested','approved','ignored','resolved')),
  reviewed_by      uuid,
  reviewed_by_name text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
create index if not exists rental_credits_agr_idx on public.rental_credits(organization_id, agreement_id);
create index if not exists rental_credits_status_idx on public.rental_credits(organization_id, status);
-- Keep credit suggestions idempotent per (line, reason, window).
create unique index if not exists rental_credits_unique_window
  on public.rental_credits(organization_id, line_id, reason, period_start);
alter table public.rental_credits enable row level security;
create policy rental_credits_org_rw on public.rental_credits
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());
