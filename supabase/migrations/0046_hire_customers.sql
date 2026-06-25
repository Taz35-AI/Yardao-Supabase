-- 0046_hire_customers.sql  (Hire Management — P0)
-- ============================================================================
-- Rental hire customers are a SEPARATE population from garage/service customers
-- (public.customers, "Garage Customers"). They are NOT touched here.
--
-- A customer must hold a non-expired 'fleet_insurance' document before any
-- vehicle can go on hire (enforced in the app — hard block).
--
-- New tables => RLS + the standard org-scoped policy. Reversible via
-- teardown_hire_management.sql.
-- ============================================================================

create table if not exists public.rental_customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,             -- person or trading name
  is_business     boolean not null default false,
  company_name    text,
  account_no      text,
  contact_name    text,
  phone           text,
  email           text,
  billing_email   text,
  billing_address text,
  account_manager text,
  notes           text,
  is_active       boolean not null default true,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists rental_customers_org_idx on public.rental_customers(organization_id);
alter table public.rental_customers enable row level security;
create policy rental_customers_org_rw on public.rental_customers
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

create table if not exists public.rental_customer_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id     uuid not null references public.rental_customers(id) on delete cascade,
  doc_type        text not null,             -- 'fleet_insurance' | 'credit_agreement' | ...
  reference       text,                      -- policy / document number
  expiry_date     date,                      -- drives the hire-eligibility gate
  file_url        text,                      -- optional uploaded copy
  notes           text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists rental_customer_documents_cust_idx
  on public.rental_customer_documents(organization_id, customer_id);
alter table public.rental_customer_documents enable row level security;
create policy rental_customer_documents_org_rw on public.rental_customer_documents
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());
