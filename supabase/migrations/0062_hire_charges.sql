-- 0062_hire_charges.sql  (B2B Hire — PCNs & damages charge ledger)
-- ============================================================================
-- One ledger row per chargeable incident on a hire vehicle:
--   • PCN  — kind 'nominated' (liability transferred → admin fee only) or
--            'paid' (we paid the fine → fine + admin fee recharged)
--   • Damage — repair/valeting cost charged to the customer
-- Each charge links customer + agreement (contract) + vehicle, carries the
-- money breakdown (base + per-customer admin fee + VAT = total) and a simple
-- settlement status (outstanding / paid / waived). Additive + re-runnable.
-- ============================================================================

create table if not exists public.rental_charges (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  charge_type         text not null check (charge_type in ('pcn','damage')),
  pcn_kind            text check (pcn_kind in ('nominated','paid')),  -- pcn rows only
  reference           text,            -- PCN reference number
  issuer              text,            -- council / TfL / private operator
  registration        text,
  vehicle_id          text,
  customer_id         uuid references public.rental_customers(id) on delete set null,
  customer_name       text,
  agreement_id        uuid references public.rental_agreements(id) on delete set null,
  agreement_reference text,
  line_id             uuid references public.rental_agreement_vehicles(id) on delete set null,
  incident_date       date,            -- contravention / damage date (nullable)
  description         text,
  base_amount         numeric not null default 0,  -- fine paid / damage cost (0 when nominated)
  admin_fee           numeric not null default 0,  -- ex VAT
  vat_amount          numeric not null default 0,
  total_amount        numeric not null default 0,
  status              text not null default 'outstanding'
                        check (status in ('outstanding','paid','waived')),
  paid_at             date,
  notes               text,
  created_by          uuid,
  created_by_name     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

create index if not exists rental_charges_org_idx      on public.rental_charges (organization_id);
create index if not exists rental_charges_customer_idx on public.rental_charges (customer_id);
create index if not exists rental_charges_agreement_idx on public.rental_charges (agreement_id);

alter table public.rental_charges enable row level security;
drop policy if exists rental_charges_org_rw on public.rental_charges;
create policy rental_charges_org_rw on public.rental_charges
  for all
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Per-customer PCN/damage admin fee (ex VAT), e.g. 15.00 or 25.00. NULL → no
-- admin fee prefilled (still editable per charge in the UI).
alter table public.rental_customers
  add column if not exists pcn_admin_fee numeric;
