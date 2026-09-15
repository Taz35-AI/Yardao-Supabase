-- 0071_vehicle_rental_rates.sql  (Fleet — what we pay the supplier per vehicle)
-- ============================================================================
-- One row per vehicle holding the rate the business pays its vehicle supplier.
-- Suppliers quote either a WEEKLY or a MONTHLY figure, so we store the amount
-- exactly as quoted plus which period it is; the app derives the other figure
-- (weekly x 52 / 12 = monthly). Kept in its own table, not on `vehicles`, so
-- RLS can restrict it to ADMINS only — members / mechanics / garage managers
-- can still read every vehicle row without ever seeing supplier costs.
-- Additive + re-runnable.
-- ============================================================================

create table if not exists public.vehicle_rental_rates (
  vehicle_id      uuid primary key references public.vehicles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount          numeric(10,2) not null check (amount >= 0),
  period          text not null check (period in ('weekly','monthly')),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

create index if not exists vehicle_rental_rates_org_idx
  on public.vehicle_rental_rates(organization_id);

alter table public.vehicle_rental_rates enable row level security;

drop policy if exists vehicle_rental_rates_admin_rw on public.vehicle_rental_rates;
create policy vehicle_rental_rates_admin_rw on public.vehicle_rental_rates
  for all to authenticated
  using      (organization_id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (organization_id = public.auth_org_id() and public.auth_role() = 'admin');
