-- YARDAO -> Supabase: ALL migrations combined, in apply order.
-- Paste into Supabase SQL Editor. Wrapped in a transaction (safe to retry).

BEGIN;

-- ===================== 0001_core_schema.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0001_core_schema.sql
-- Core tables for the vertical slice + closely-coupled support tables.
-- Multi-tenant: every tenant row carries organization_id (the RLS boundary).
-- RLS itself is enabled in 0002_rls_policies.sql.
--
-- Conventions
--   * Columns are snake_case (Postgres idiom). The data layer maps snake↔camel
--     so the frontend TypeScript interfaces stay byte-for-byte identical.
--   * uuid primary keys (gen_random_uuid). Fresh-start data — no Firestore IDs
--     are preserved, so we use real uuids everywhere instead of string keys.
--   * String-union TS types (VehicleStatus, etc.) → text + CHECK constraints,
--     so adding a value later is a cheap migration (no enum ALTER pain).
--   * Firestore "YYYY-MM-DD" string dates → date; created/updated → timestamptz.
--   * Free-form maps / arrays that the UI treats as opaque (damagePins,
--     yard spaces/blocks, invoice parts/labour, externalProvider) → jsonb.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ── shared updated_at trigger ───────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- organizations
-- ============================================================================
create table public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  member_count int  not null default 0,
  created_by   uuid,                       -- auth.users(id); FK omitted (created during bootstrap)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

-- ============================================================================
-- profiles  (1:1 with auth.users — app-level user record / UserProfile)
-- ============================================================================
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  organization_id       uuid references public.organizations(id) on delete set null,
  organization_name     text,                  -- denormalised org name (UserProfile.organizationName)
  display_name          text,
  email                 text,
  fcm_token             text,                  -- Capacitor push token (set on login)
  role                  text not null default 'member' check (role in ('admin','member','mechanic')),
  theme_preference      text not null default 'system' check (theme_preference in ('light','dark','system')),
  language_preference   text check (language_preference in ('en','ro','bg','pl')),
  requires_password_reset boolean not null default false,
  email_verified        boolean,
  is_active             boolean not null default true,
  is_deleted            boolean not null default false,
  deleted_at            timestamptz,
  deleted_by            uuid,
  last_login_at         timestamptz,
  notifications_enabled boolean,
  default_view          text check (default_view in ('pipeline','table','cards','layout')),
  default_branch_slug   text,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);
create index profiles_org_idx on public.profiles(organization_id);

-- organizations.created_by references a profile/user; add FK now that profiles exists
alter table public.organizations
  add constraint organizations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ============================================================================
-- organization_settings  (1 row per org)
-- ============================================================================
create table public.organization_settings (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null unique references public.organizations(id) on delete cascade,
  mot_expiry_threshold          int  not null default 30,
  tax_expiry_threshold          int  not null default 30,
  default_vehicle_status        text not null default 'Pending checks',
  allow_bulk_operations         boolean not null default true,
  require_approval_for_checkout boolean not null default false,
  enable_audit_logging          boolean not null default true,
  timezone                      text not null default 'Europe/London',
  date_format                   text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')),
  currency                      text not null default 'GBP',
  updated_at                    timestamptz,
  updated_by                    uuid
);

-- ============================================================================
-- branches
-- ============================================================================
create table public.branches (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  slug              text not null,
  name              text not null,
  is_main           boolean not null default false,
  is_active         boolean not null default true,
  address           text,
  postcode          text,
  latitude          double precision,
  longitude         double precision,
  service_bay_count int,
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  unique (organization_id, slug)
);
create index branches_org_idx on public.branches(organization_id);

-- ============================================================================
-- contracts
-- ============================================================================
create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  is_default      boolean not null default false,
  color           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index contracts_org_idx on public.contracts(organization_id);

-- ============================================================================
-- condition_categories
-- ============================================================================
create table public.condition_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  sort_order      int  not null default 0,   -- maps to ConditionCategory.order (firestore.ts contract)
  is_default      boolean not null default false,
  color           text,
  severity        text check (severity in ('excellent','good','fair','poor','critical')),
  created_at      timestamptz not null default now()
);
create index condition_categories_org_idx on public.condition_categories(organization_id);

-- ============================================================================
-- external_garages
-- ============================================================================
create table public.external_garages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  address         text not null,
  is_active       boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index external_garages_org_idx on public.external_garages(organization_id);

-- ============================================================================
-- vehicles  (fleet inventory — the master record)
-- ============================================================================
create table public.vehicles (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  registration            text not null,
  make                    text,
  model                   text,
  colour                  text,
  size                    text,
  mot_expiry              date,
  tax_expiry              date,
  has_recall              boolean,                 -- DVSA outstanding safety recall (bulk refresh)
  comments                text,
  condition               text,
  -- contract: denormalised name/colour for fast rendering + stable id link
  contract                text,
  contract_color          text,
  contract_id             uuid references public.contracts(id) on delete set null,
  -- insurance
  insurance_status        text check (insurance_status in ('Insured','Not Insured')),
  insurance_policy_id      uuid,
  insurance_policy_name    text,
  insurance_policy_expiry  date,
  -- lifecycle / location
  current_status          text check (current_status in ('in_fleet','checked_in','external_service','sold','scrapped','defleeted')),
  current_location        text,
  last_known_location     text,
  vehicle_diagram_type    text,
  damage_pins             jsonb,
  date_acquired           date,
  -- defleet
  is_defleeted            boolean not null default false,
  defleet_date            date,
  defleet_processed_date  timestamptz,
  defleet_reason          text check (defleet_reason in ('Sold','Scrapped','Trade-In','End of Lease','Accident Write-Off','Theft','Other')),
  defleet_reason_details  text,
  defleeted_by            uuid,
  defleeted_by_name       text,
  -- restore-to-fleet attribution (reverses defleet)
  restored_at             timestamptz,
  restored_by             uuid,
  restored_by_name        text,
  last_edit_log           jsonb,                 -- audit of the last edit (edit modal / MOT-done / insurance)
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz,
  unique (organization_id, registration)
);
create index vehicles_org_idx          on public.vehicles(organization_id);
create index vehicles_org_defleet_idx  on public.vehicles(organization_id, is_defleeted);
create index vehicles_org_contract_idx on public.vehicles(organization_id, contract_id);
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- checked_in_vehicles  (vehicles currently in a yard / in-transit / at garage)
-- ============================================================================
create table public.checked_in_vehicles (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  vehicle_id                  uuid references public.vehicles(id) on delete set null,
  user_id                     uuid,
  -- branch_id is TEXT, not a uuid FK: the app keys branches by a stable string
  -- (branch uuid as string, or the 'main'/slug literal) and passes it through
  -- unchanged. Modelling it as text preserves that behaviour with no churn.
  branch_id                   text,
  registration                text not null,
  make                        text,
  model                       text,
  colour                      text,
  size                        text,
  condition                   text,
  status                      text not null default 'Pending checks' check (status in ('Ready','Pending checks','Repairs needed','Non-Starter')),
  mileage                     text,
  notes                       text,
  comments                    text,
  mot_expiry                  date,
  tax_expiry                  date,
  location                    text,
  bay                         text,
  -- yard layout link: stable id of the parking space inside yard_layouts.spaces
  parking_space_id            text,
  parked_by                   uuid,
  parked_by_name              text,
  parked_at                   timestamptz,
  check_in_time               timestamptz default now(),
  vehicle_diagram_type        text,
  damage_pins                 jsonb,
  -- contract
  contract                    text,
  contract_color              text,
  -- transfer / in-transit
  transfer_status             text check (transfer_status in ('in_transit','at_external_garage')),
  source_branch_id            text,
  source_branch_name          text,
  target_branch_id            text,
  target_branch_name          text,
  transfer_initiated_at       timestamptz,
  transfer_initiated_by       uuid,
  transfer_initiated_by_name  text,
  -- external garage
  external_garage_id          uuid references public.external_garages(id) on delete set null,
  external_garage_name        text,
  service_booking_id          uuid,
  checked_out_to_garage_at    timestamptz,
  checked_out_to_garage_by    uuid,
  checked_out_to_garage_by_name text,
  -- insurance
  insurance_status            text check (insurance_status in ('Insured','Not Insured')),
  insurance_policy_id         uuid,
  insurance_policy_name       text,
  insurance_policy_expiry     date,
  -- hire
  hire_status                 text not null default 'In Yard' check (hire_status in ('In Yard','Out on Hire')),
  original_status             text check (original_status in ('Ready','Pending checks','Repairs needed','Non-Starter')),
  hired_at                    timestamptz,
  hired_by                    uuid,
  hired_by_name               text,
  hire_notes                  text,
  current_hire_history_id     uuid,
  -- audit
  last_edit_log               jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz
);
create index civ_org_idx            on public.checked_in_vehicles(organization_id);
create index civ_org_branch_idx     on public.checked_in_vehicles(organization_id, branch_id);
create index civ_org_vehicle_idx    on public.checked_in_vehicles(organization_id, vehicle_id);
-- yard occupancy lookups: which space is taken in a branch (replaces client-side filtering)
create index civ_branch_space_idx   on public.checked_in_vehicles(branch_id, parking_space_id);
create trigger civ_set_updated_at before update on public.checked_in_vehicles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- yard_vehicles  (legacy parallel check-in collection; kept for the
-- yardVehicleService contract in firestore.ts. Mirrors the YardVehicle type.)
-- ============================================================================
create table public.yard_vehicles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  vehicle_id       uuid references public.vehicles(id) on delete set null,
  registration     text not null,
  size             text,
  mileage          text,
  condition        text,
  comments         text,
  date_in          text,
  status           text check (status in ('Ready','Pending checks','Repairs needed','Non-Starter')),
  make             text,
  model            text,
  colour           text,
  contract         text,
  contract_color   text,
  contract_id      uuid references public.contracts(id) on delete set null,
  insurance_status text check (insurance_status in ('Insured','Not Insured')),
  mot_expiry       date,
  tax_expiry       date,
  checked_in_by    uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
create index yard_vehicles_org_idx on public.yard_vehicles(organization_id);
create trigger yard_vehicles_set_updated_at before update on public.yard_vehicles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- yard_layouts  (one row per branch; spaces + blocks kept as jsonb so the
-- yardLayoutService contract — a YardLayout with a spaces Record + blocks
-- array — maps 1:1. Vehicle→space link is the stable space id in parking_space_id.)
-- ============================================================================
create table public.yard_layouts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id       text not null,                          -- stable branch key (see checked_in_vehicles.branch_id)
  spaces          jsonb not null default '{}'::jsonb,   -- Record<coord, ParkingSpace>
  blocks          jsonb not null default '[]'::jsonb,    -- BuildingBlock[]
  updated_at      timestamptz,
  updated_by      uuid,
  updated_by_name text,
  unique (organization_id, branch_id)
);

-- ============================================================================
-- customers
-- ============================================================================
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  first_name        text,
  last_name         text,
  phone             text,
  email             text,
  registrations     text[],
  phone_normalized  text not null,
  notes             text,
  booking_count     int not null default 0,
  last_booking_date date,
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_by        uuid,
  updated_by_name   text,
  updated_at        timestamptz,
  unique (organization_id, phone_normalized)
);
create index customers_org_idx on public.customers(organization_id);

-- ============================================================================
-- service_bookings
-- ============================================================================
create table public.service_bookings (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  date                     date not null,
  time_slot                text,
  registration             text,
  make                     text,
  model                    text,
  work_required            jsonb,                  -- string | string[] (preserved as-is)
  is_custom_vehicle        boolean not null default false,
  notes                    text,
  status                   text not null default 'scheduled' check (status in ('scheduled','checked_in_to_garage','in-progress','completed','cancelled')),
  service_bay              int,
  slot_count               int not null default 1,
  is_external_provider     boolean not null default false,
  external_provider        jsonb,                  -- { garageName, address, customTime }
  parts_status             text,
  mileage                  int,
  assigned_mechanic_id     uuid,
  assigned_mechanic_name   text,
  customer_name            text,
  customer_phone           text,
  customer_email           text,
  -- branch tracking
  original_branch_id       text,
  original_branch_name     text,
  vehicle_removed_from_branch boolean,
  -- vehicle lifecycle flags stamped when the booking's vehicle is defleeted/deleted
  vehicle_defleeted        boolean,
  vehicle_defleeted_at     timestamptz,
  vehicle_defleeted_by     uuid,
  vehicle_deleted          boolean,
  vehicle_deleted_at       timestamptz,
  vehicle_deleted_by       uuid,
  -- garage check-in / completion attribution
  checked_in_to_garage_at  timestamptz,
  checked_in_to_garage_by  uuid,
  checked_in_to_garage_by_name text,
  completed_from_dashboard boolean,
  completed_at             timestamptz,
  completed_by             uuid,
  completed_by_name        text,
  created_by               uuid,
  created_by_name          text,
  created_at               timestamptz not null default now(),
  last_modified_by         uuid,
  last_modified_by_name    text,
  cancelled_by             uuid,
  cancelled_by_name        text,
  updated_at               timestamptz
);
create index sb_org_idx       on public.service_bookings(organization_id);
create index sb_org_date_idx  on public.service_bookings(organization_id, date);
create trigger sb_set_updated_at before update on public.service_bookings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- stock_parts
-- ============================================================================
create table public.stock_parts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  part_name           text not null,
  part_number         text,
  make_model          text[] not null default '{}',  -- multiple makes/models per part
  quantity            numeric not null default 0,
  net_price           numeric not null default 0,
  restock_target      numeric not null default 0,
  unit                text not null default 'pieces' check (unit in ('pieces','liters')),
  supplier            text,
  comments            text,
  is_one_off          boolean not null default false,
  linked_registration text,
  linked_vehicle_id   uuid,
  last_used_date      date,
  total_usage_count   int not null default 0,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);
create index stock_parts_org_idx on public.stock_parts(organization_id);
create trigger stock_parts_set_updated_at before update on public.stock_parts
  for each row execute function public.set_updated_at();

-- ============================================================================
-- part_usage
-- ============================================================================
create table public.part_usage (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  part_id                   uuid references public.stock_parts(id) on delete set null,
  part_name                 text,
  part_number               text,
  vehicle_id                text,                  -- may be a fleet uuid OR a custom-vehicle marker
  vehicle_registration      text,
  vehicle_registration_key  text,                  -- canonical reg key (uppercase, no spaces)
  quantity_used             numeric not null default 0,
  unit                      text not null default 'pieces' check (unit in ('pieces','liters')),
  used_by                   uuid,
  used_by_name              text,
  used_at                   timestamptz not null default now(),
  notes                     text,
  net_price                 numeric not null default 0,
  total_cost                numeric not null default 0
);
create index part_usage_org_idx       on public.part_usage(organization_id);
create index part_usage_part_idx      on public.part_usage(part_id);
create index part_usage_org_regkey_idx on public.part_usage(organization_id, vehicle_registration_key);

-- ============================================================================
-- order_history
-- ============================================================================
create table public.order_history (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  part_id          uuid references public.stock_parts(id) on delete set null,
  part_name        text,
  part_number      text,
  supplier         text,
  quantity_ordered numeric not null default 0,
  unit             text not null default 'pieces' check (unit in ('pieces','liters')),
  net_price        numeric not null default 0,
  total_cost       numeric not null default 0,
  ordered_by       uuid,
  ordered_by_name  text,
  ordered_at       timestamptz not null default now(),
  order_type       text not null check (order_type in ('initial','restock'))
);
create index order_history_org_idx  on public.order_history(organization_id);
create index order_history_part_idx on public.order_history(part_id);

-- ============================================================================
-- stock_adjustments
-- ============================================================================
create table public.stock_adjustments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  part_id          uuid references public.stock_parts(id) on delete set null,
  part_name        text,
  part_number      text,
  adjustment_type  text not null check (adjustment_type in ('add','remove')),
  quantity         numeric not null,
  reason           text not null check (reason in ('count_correction','damaged','lost_stolen','return_supplier','transfer','expired','other')),
  notes            text,
  previous_stock   numeric not null,
  new_stock        numeric not null,
  adjusted_by      uuid,
  adjusted_by_name text,
  adjusted_at      timestamptz not null default now(),
  unit             text not null default 'pieces' check (unit in ('pieces','liters'))
);
create index stock_adjustments_org_idx  on public.stock_adjustments(organization_id);
create index stock_adjustments_part_idx on public.stock_adjustments(part_id);

-- ============================================================================
-- invoices  (jsPDF source data — parts/labour kept as jsonb line arrays)
-- ============================================================================
create table public.invoices (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  invoice_number       text not null,
  invoice_date         date not null,
  vehicle_id           text,
  vehicle_registration text,
  vehicle_make         text,
  vehicle_model        text,
  vehicle_mileage      text,
  from_company         text,
  to_company           text,
  parts                jsonb not null default '[]'::jsonb,   -- InvoicePart[]
  labour               jsonb not null default '[]'::jsonb,   -- LabourLine[]
  subtotal             numeric not null default 0,
  discount             numeric,
  discount_percent     numeric,
  markup_percent       numeric,
  vat                  numeric,
  total                numeric not null default 0,
  from_logo            text,                                 -- base64 logo
  status               text not null default 'draft' check (status in ('draft','issued','paid')),
  created_by           uuid,
  created_by_name      text,
  created_at           timestamptz not null default now(),
  unique (organization_id, invoice_number)
);
create index invoices_org_idx on public.invoices(organization_id);

-- ============================================================================
-- checkout_history  (matches checkoutHistoryService.CheckoutHistoryRecord — the
-- branch-aware shape actually written by the app. Person/branch refs are TEXT
-- because records legitimately carry non-uuid actors like 'system'/'Unknown'.)
-- ============================================================================
create table public.checkout_history (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  -- vehicle snapshot
  registration                text not null,
  make                        text,
  model                       text,
  colour                      text,
  size                        text,
  condition                   text,
  status                      text,
  mileage                     text,
  contract                    text,
  contract_color              text,
  insurance_status            text,
  mot_expiry                  text,
  tax_expiry                  text,
  notes                       text,
  comments                    text,
  vehicle_id                  text,
  -- branch tracking
  original_branch_id          text,
  original_branch_name        text,
  -- checkout attribution
  checked_out_date            timestamptz,
  checked_out_by              text,
  checked_out_by_name         text,
  -- original check-in context
  original_check_in_date      timestamptz,
  original_checked_in_by      text,
  original_checked_in_by_name text,
  -- external garage context
  is_external_garage_checkout boolean,
  external_garage_name        text,
  service_booking_id          text,
  -- deletion/defleet context (spread in by enhancedVehicleService)
  deletion_reason             text,
  created_at                  timestamptz not null default now()
);
create index checkout_history_org_idx        on public.checkout_history(organization_id);
create index checkout_history_org_reg_idx     on public.checkout_history(organization_id, registration);
create index checkout_history_org_date_idx    on public.checkout_history(organization_id, checked_out_date desc);

-- ===================== 0002_rls_policies.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0002_rls_policies.sql
-- Row-Level Security: organization_id is the tenant boundary on every table.
--
-- Tenancy model
--   * Each user's profile carries organization_id + role.
--   * A Custom Access Token Hook copies those into the JWT as `org_id` / `role`
--     so RLS can check them WITHOUT a per-request lookup into profiles.
--   * Policy shape:  organization_id = auth_org_id()
--
-- After applying this migration you MUST enable the hook in the dashboard:
--   Authentication → Hooks → Customize Access Token (JWT) Claims
--   → select public.custom_access_token_hook
-- (or set [auth.hook.custom_access_token] in supabase/config.toml).
-- ============================================================================

-- ── claim helpers ───────────────────────────────────────────────────────────
-- org_id of the calling user, read from the JWT claim (no table lookup).
create or replace function public.auth_org_id()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'org_id', '')::uuid
$$;

-- app role is exposed as a custom `user_role` claim — NOT the Postgres `role`
-- claim (PostgREST uses `role` to SET ROLE, so it must stay 'authenticated').
create or replace function public.auth_role()
returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'
$$;

-- ── Custom Access Token Hook ─────────────────────────────────────────────────
-- Injects org_id + role from the user's profile into every issued JWT.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims    jsonb := event -> 'claims';
  v_org_id  uuid;
  v_role    text;
begin
  select organization_id, role into v_org_id, v_role
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  if v_org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org_id::text));
  end if;
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- the auth admin role executes the hook and must read profiles
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;

-- ── enable RLS on every table ────────────────────────────────────────────────
alter table public.organizations          enable row level security;
alter table public.profiles               enable row level security;
alter table public.organization_settings  enable row level security;
alter table public.branches               enable row level security;
alter table public.contracts              enable row level security;
alter table public.condition_categories   enable row level security;
alter table public.external_garages       enable row level security;
alter table public.vehicles               enable row level security;
alter table public.checked_in_vehicles    enable row level security;
alter table public.yard_vehicles          enable row level security;
alter table public.yard_layouts           enable row level security;
alter table public.customers              enable row level security;
alter table public.service_bookings       enable row level security;
alter table public.stock_parts            enable row level security;
alter table public.part_usage             enable row level security;
alter table public.order_history          enable row level security;
alter table public.stock_adjustments      enable row level security;
alter table public.invoices               enable row level security;
alter table public.checkout_history       enable row level security;

-- ── organizations ────────────────────────────────────────────────────────────
-- members can read their own org; admins can update it.
create policy org_select on public.organizations
  for select to authenticated using (id = public.auth_org_id());
create policy org_update on public.organizations
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (id = public.auth_org_id() and public.auth_role() = 'admin');

-- ── profiles ─────────────────────────────────────────────────────────────────
-- a user can always read/update their own row; members can read profiles in
-- their org; admins can insert/update/soft-delete profiles in their org.
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_org on public.profiles
  for select to authenticated using (organization_id = public.auth_org_id());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (organization_id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (organization_id = public.auth_org_id() and public.auth_role() = 'admin');
-- the access-token hook runs as supabase_auth_admin and must read profiles
-- (RLS would otherwise return 0 rows and the org_id claim would never be set).
create policy auth_admin_read_profiles on public.profiles
  as permissive for select to supabase_auth_admin using (true);

-- ── generic org-scoped tables ────────────────────────────────────────────────
-- Identical full-CRUD-within-org policy. Generated via a DO loop to stay DRY;
-- tighten per-table (e.g. admin-only deletes) in a later migration if needed.
do $$
declare t text;
begin
  foreach t in array array[
    'organization_settings','branches','contracts','condition_categories',
    'external_garages','vehicles','checked_in_vehicles','yard_vehicles','yard_layouts',
    'customers','service_bookings','stock_parts','part_usage',
    'order_history','stock_adjustments','invoices','checkout_history'
  ]
  loop
    execute format($f$
      create policy %1$s_org_rw on public.%1$s
        for all to authenticated
        using (organization_id = public.auth_org_id())
        with check (organization_id = public.auth_org_id());
    $f$, t);
  end loop;
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Surfaces that replace Firestore onSnapshot. RLS still applies to realtime,
-- so clients only receive changes for their own org.
alter publication supabase_realtime add table public.checked_in_vehicles;
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.yard_layouts;
alter publication supabase_realtime add table public.service_bookings;

-- ===================== 0003_auth_bootstrap.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0003_auth_bootstrap.sql
-- Signup → profile provisioning + RLS-safe organization bootstrap.
--
-- The chicken-and-egg problem: a just-signed-up user has no org_id JWT claim
-- yet, so a direct client INSERT into organizations / UPDATE of their profile
-- would be denied by RLS. We solve it with:
--   1. a trigger that auto-creates the profile row on signup, and
--   2. a SECURITY DEFINER RPC that creates the org, joins the caller as admin,
--      and seeds default conditions atomically (bypassing RLS safely, scoped to
--      auth.uid()).
-- ============================================================================

-- ── 1. auto-create profile on signup ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, email_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'displayName', new.raw_user_meta_data ->> 'display_name', new.email),
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. create organization + join caller as admin + seed conditions ──────────
create or replace function public.create_organization(p_name text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (name, description, created_by, member_count)
  values (p_name, p_description, v_uid, 1)
  returning id into v_org;

  update public.profiles
     set organization_id = v_org,
         organization_name = p_name,
         role = 'admin',
         updated_at = now()
   where id = v_uid;

  -- seed the 5 default condition categories (mirrors conditionService defaults)
  insert into public.condition_categories (organization_id, name, sort_order, color, severity) values
    (v_org, 'Excellent', 0, '#16a34a', 'excellent'),
    (v_org, 'Good',      1, '#22c55e', 'good'),
    (v_org, 'Fair',      2, '#eab308', 'fair'),
    (v_org, 'Poor',      3, '#f97316', 'poor'),
    (v_org, 'Critical',  4, '#ef4444', 'critical');

  -- every org starts with one renamable Main Branch (slug 'main', is_main)
  insert into public.branches (organization_id, slug, name, is_main, is_active, created_by)
  values (v_org, 'main', 'Main Branch', true, true, v_uid);

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

-- NOTE: after calling create_organization the client MUST refresh its session
-- (supabase.auth.refreshSession()) so the access-token hook re-issues a JWT
-- carrying the new org_id claim — otherwise subsequent RLS-scoped reads return
-- nothing. organizationService.createOrganization does this automatically.

-- ===================== 0010_stock_settings.sql =====================
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

-- ===================== 0011_transfers.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0011_transfers.sql
-- Vehicle transfers (branch↔branch) + external-garage checkout for
-- src/lib/services/transferService.ts.
--
-- Finding: transferService operates ENTIRELY on `checked_in_vehicles`. It reads
-- a row (registration / branch_id / external_garage_name) and updates the
-- transfer + garage columns in place. There is NO separate transfers
-- collection in the Firestore original, so no new table is required — every
-- column the service writes already exists on checked_in_vehicles
-- (0001_core_schema.sql, "transfer / in-transit" + "external garage" blocks):
--   transfer_status, target_branch_id, target_branch_name,
--   transfer_initiated_at, transfer_initiated_by, transfer_initiated_by_name,
--   external_garage_name, service_booking_id, checked_out_to_garage_at,
--   checked_out_to_garage_by, checked_out_to_garage_by_name, last_edit_log.
-- branch columns are already text; transfer_status CHECK already allows
-- 'in_transit' and 'at_external_garage'.
--
-- The ONE adjustment: service_booking_id was modelled as uuid, but the service
-- writes the raw service-booking id string straight through (Firestore
-- pass-through semantics). Relax it to text so that write can never fail on a
-- non-uuid id, matching the original's behaviour. (text accepts uuid strings
-- too, so existing/fresh uuid ids keep working.)
-- ============================================================================

alter table public.checked_in_vehicles
  alter column service_booking_id type text using service_booking_id::text;

-- ===================== 0012_hire.sql =====================
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

-- ===================== 0013_customers_history.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0013_customers_history.sql
-- Manual per-vehicle service-history records.
--
-- The `customers` table already exists (0001) and the per-customer job
-- history + the booking-sourced half of the per-vehicle service history are
-- DERIVED on demand from existing tables (service_bookings) — no storage of
-- their own. The ONLY new persistence this slice needs is the hand-entered
-- ("manual") service-history rows that the Firestore version stored in the
-- `vehicleServiceHistory` collection. Booking-sourced rows are NOT copied
-- here; they keep living in service_bookings and are merged at read time.
--
-- Conventions match 0001: snake_case columns, uuid PK, organization_id is the
-- RLS tenant boundary, dates as date, timestamps as timestamptz, person refs
-- as uuid where they are real users.
-- ============================================================================

-- ============================================================================
-- vehicle_service_history  (manual records only — mirrors ManualServiceHistoryDoc)
--   * registration       : as the user typed it (display)
--   * registration_key    : canonical UPPER/no-space key used for equality match
--   * location_type       : 'internal' | 'external'  (ServiceLocationType)
--   * mileage             : optional odometer reading
-- ============================================================================
create table public.vehicle_service_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  registration      text not null,
  registration_key  text not null,
  make              text,
  model             text,
  date              date not null,                          -- service date (YYYY-MM-DD)
  location_type     text not null check (location_type in ('internal','external')),
  garage_name       text,                                   -- when external
  work_done         text not null default '',
  mechanic_name     text,
  mileage           numeric,
  notes             text,
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index vehicle_service_history_org_idx
  on public.vehicle_service_history(organization_id);
-- per-vehicle lookups join on the canonical registration key
create index vehicle_service_history_org_regkey_idx
  on public.vehicle_service_history(organization_id, registration_key);
create trigger vehicle_service_history_set_updated_at before update on public.vehicle_service_history
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.vehicle_service_history enable row level security;
create policy vehicle_service_history_org_rw on public.vehicle_service_history
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ===================== 0014_branches_misc.sql =====================
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

-- ===================== 0015_bulk_insurance.sql =====================
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

-- ===================== 0016_sync_columns.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0016_sync_columns.sql
-- Audit blobs written by the fleet⇄yard field-sync services:
--   * contractSyncService   → vehicles.last_contract_update
--   * conditionSyncService  → vehicles.last_condition_update
--   * damageSyncService     → vehicles.last_damage_update
--   * insuranceSyncService  → vehicles.last_insurance_update (already added in 0015)
--
-- Each service stamps an opaque per-vehicle audit object on the fleet row when it
-- syncs a field down from / up to the yard. The Firestore version stored these
-- inline on the vehicle doc (lastContractUpdate / lastConditionUpdate /
-- lastDamageUpdate). They are opaque maps → jsonb, matching the dbMap
-- jsonb-passthrough convention (nested camelCase keys preserved verbatim:
-- { updatedBy, updatedByName, updatedAt, source, vehicleId | registration |
--   previousContract | pinCount }).
--
-- All other fields these services write already exist on vehicles /
-- checked_in_vehicles (contract, contract_color, condition, damage_pins,
-- insurance_status + policy columns, last_edit_log). No new tables are needed.
-- New columns inherit the existing vehicles RLS policy, so no policy change.
-- ============================================================================

alter table public.vehicles
  add column if not exists last_contract_update  jsonb,
  add column if not exists last_condition_update jsonb,
  add column if not exists last_damage_update    jsonb;

-- ===================== 0017_notifications.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0017_notifications.sql
-- Notifications + per-user notes/reminders + push (FCM) settings.
--
-- Models the Firestore surfaces ported in this slice:
--   * userNotes/{uid}/notes  → public.user_notes          (per-user reminders)
--   * fcmTokens/{uid}        → public.notification_settings (per-user push/FCM)
--   * (new) backend-pushed   → public.user_notifications   (per-user notif rows)
--
-- Conventions match 0001/0002: snake_case columns, uuid PK, organization_id is
-- the RLS tenant boundary, dates as date, timestamps as timestamptz, person
-- refs as uuid where they are real users. string-unions → text + CHECK.
-- vehicle refs are TEXT (registration string), matching the rest of the schema.
-- ============================================================================

-- ============================================================================
-- user_notes  (mirrors the UserNote doc under userNotes/{uid}/notes)
--   * user_id                  : owner (Firestore keyed the subcollection by uid)
--   * date                     : note date (YYYY-MM-DD)
--   * scheduled_time           : 'HH:mm' or null
--   * priority                 : 'low' | 'medium' | 'urgent'
--   * category                 : 'personal' | 'work' | 'vehicle' | 'finance'
--   * recurrence               : 'none' | 'daily' | 'weekly' | 'monthly'
--   * vehicle_reg              : registration string (text ref) or null
--   * scheduled_notification_at: ISO timestamp a Cloud Fn/edge fn fires on
--   * notification_sent        : whether the push has been sent
-- ============================================================================
create table public.user_notes (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  user_id                   uuid not null,
  text                      text not null default '',
  date                      date not null,
  scheduled_time            text,
  priority                  text not null default 'medium' check (priority in ('low','medium','urgent')),
  category                  text not null default 'work'   check (category in ('personal','work','vehicle','finance')),
  recurrence                text not null default 'none'   check (recurrence in ('none','daily','weekly','monthly')),
  vehicle_reg               text,
  done                      boolean not null default false,
  archived_at               timestamptz,
  scheduled_notification_at timestamptz,
  notification_sent         boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz
);
create index user_notes_org_idx       on public.user_notes(organization_id);
create index user_notes_org_user_idx  on public.user_notes(organization_id, user_id);
-- "today's notes" lookups filter by user + date + done
create index user_notes_org_user_date_idx
  on public.user_notes(organization_id, user_id, date);
create trigger user_notes_set_updated_at before update on public.user_notes
  for each row execute function public.set_updated_at();

alter table public.user_notes enable row level security;
create policy user_notes_org_rw on public.user_notes
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ============================================================================
-- notification_settings  (mirrors fcmTokens/{uid} — one row per user)
--   * user_id     : token owner (Firestore keyed the doc by uid)
--   * token       : FCM registration token
--   * platform    : 'android' (only native Android registers today)
--   * Stored separately from profiles.fcm_token so a user can carry a single
--     authoritative push record scoped to their org for the backend sender.
-- ============================================================================
create table public.notification_settings (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null,
  token             text,
  platform          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  -- one settings/token row per user
  unique (user_id)
);
create index notification_settings_org_idx on public.notification_settings(organization_id);
create trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;
create policy notification_settings_org_rw on public.notification_settings
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ============================================================================
-- user_notifications  (backend-pushed per-user notification rows)
--   Live surface: a bell/inbox can subscribe via Realtime. Generic shape so the
--   sender can fan out service/MOT/delivery/note alerts as persisted rows.
--   * type/title/message/priority mirror the in-app NotificationItem shape
--   * data : opaque payload → jsonb
--   * read_at : null until the user reads it
-- ============================================================================
create table public.user_notifications (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null,
  type              text,
  title             text,
  message           text,
  priority          text check (priority in ('high','medium','low')),
  data              jsonb,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index user_notifications_org_idx      on public.user_notifications(organization_id);
create index user_notifications_org_user_idx on public.user_notifications(organization_id, user_id);
create trigger user_notifications_set_updated_at before update on public.user_notifications
  for each row execute function public.set_updated_at();

alter table public.user_notifications enable row level security;
create policy user_notifications_org_rw on public.user_notifications
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- user_notifications has a live bell/inbox surface. user_notes is read via
-- one-shot fetches in the ported code (no onSnapshot), so it is NOT published.
alter publication supabase_realtime add table public.user_notifications;

-- ===================== 0018_bodyshop.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0018_bodyshop.sql
-- Bodyshop kanban: jobs + per-job daily time entries.
--
-- Firestore shape ported here:
--   * collection `bodyshopJobs`            → table public.bodyshop_jobs
--   * sub-collection `timeEntries` (per job) → table public.bodyshop_time_entries
--     (re-parented via job_id FK, with its own organization_id for RLS).
--
-- Conventions (see 0001):
--   * snake_case columns; uuid PK; org-scoped via organization_id (RLS boundary).
--   * String-union TS types → text + CHECK:
--       BodyshopStage  = 'queued' | 'prep' | 'paint' | 'finishing'
--       BodyshopJob.status = 'open' | 'complete'
--   * Firestore "YYYY-MM-DD" string dates → date; created/updated → timestamptz.
--   * Person refs (created_by / completed_by / logged_by) are TEXT: the app
--     stores the raw Firebase uid string and can pass non-uuid actors.
--   * vehicle_id is TEXT for parity (the job links an optional fleet vehicle id;
--     stock integration passes it through unchanged to batchUseParts).
--   * Opaque arrays/objects the UI round-trips → jsonb:
--       stage_hours  (StageHours: { queued, prep, paint, finishing })
--       damages      (DamageItem[])
--       materials    (MaterialLine[])  on each time entry
-- ============================================================================

-- ============================================================================
-- bodyshop_jobs  (one row per vehicle in the bodyshop kanban)
-- ============================================================================
create table public.bodyshop_jobs (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  -- vehicle
  vehicle_registration   text not null,
  vehicle_id             text,                 -- optional fleet vehicle id (kept text for parity)
  vehicle_make           text,
  vehicle_model          text,
  -- lifecycle / kanban
  status                 text not null default 'open' check (status in ('open','complete')),
  stage                  text not null default 'queued' check (stage in ('queued','prep','paint','finishing')),
  priority               int  not null default 999,   -- lower = higher priority (1 is top)
  stage_hours            jsonb not null default '{"queued":0,"prep":0,"paint":0,"finishing":0}'::jsonb,
  total_hours            numeric not null default 0,
  -- damage estimate panel
  damages                jsonb,                -- DamageItem[]
  damages_estimated      boolean,              -- true once prep tech locks estimates
  -- mechanic assignment (both set together, or both cleared)
  assigned_mechanic_id   text,
  assigned_mechanic_name text,
  -- attribution
  created_by             text,
  created_by_name        text,
  created_at             timestamptz not null default now(),
  completed_at           timestamptz,
  completed_by           text,
  updated_at             timestamptz
);
create index bodyshop_jobs_org_idx on public.bodyshop_jobs(organization_id);

-- ============================================================================
-- bodyshop_time_entries  (the `timeEntries` sub-collection, re-parented)
-- One row per (job, date, stage); hours + materials logged by a user.
-- ============================================================================
create table public.bodyshop_time_entries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  job_id           uuid not null references public.bodyshop_jobs(id) on delete cascade,
  date             date not null,             -- Firestore "YYYY-MM-DD"
  hours            numeric not null default 0,
  notes            text,
  materials        jsonb not null default '[]'::jsonb,   -- MaterialLine[]
  stage            text not null default 'queued' check (stage in ('queued','prep','paint','finishing')),
  logged_by        text,
  logged_by_name   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
create index bodyshop_time_entries_org_idx on public.bodyshop_time_entries(organization_id);
create index bodyshop_time_entries_job_idx on public.bodyshop_time_entries(job_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.bodyshop_jobs         enable row level security;
alter table public.bodyshop_time_entries enable row level security;

create policy bodyshop_jobs_org_rw on public.bodyshop_jobs
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

create policy bodyshop_time_entries_org_rw on public.bodyshop_time_entries
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- The kanban board subscribes to jobs for live updates. Time entries are read
-- on-demand (per job, on modal open) and have no live surface, so only
-- bodyshop_jobs is added to the realtime publication.
alter publication supabase_realtime add table public.bodyshop_jobs;

-- ===================== 0019_realtime_pub.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0019_realtime_pub.sql
-- ----------------------------------------------------------------------------
-- Adds the `customers` table to the supabase_realtime publication so the
-- useCustomers hook receives live INSERT/UPDATE/DELETE events — replacing the
-- Firestore onSnapshot it previously used (new customers created by the
-- booking-save upsert must appear in autocomplete immediately).
--
-- checked_in_vehicles + yard_layouts are already in the publication (0002), so
-- useYardData and useYardLayout need nothing added here.
--
-- checkout_history is intentionally NOT added: useCheckoutHistory is a one-time
-- fetch (loadAll + manual refresh), not a live listener, so it needs no
-- realtime stream.
-- ============================================================================

alter publication supabase_realtime add table public.customers;

-- ===================== 0020_deliveries.sql =====================
-- ============================================================================
-- YARDAO → Supabase  |  0020_deliveries.sql
-- deliveries_defleet  (for src/hooks/useDeliveriesDefleet.ts via
-- DeliveriesDefleetContext).
--
-- Finding: despite the "defleet" name, this hook does NOT read defleeted
-- vehicles. In the Firestore original it owns a dedicated `deliveriesDefleet`
-- collection — a standalone delivery/defleet planning log keyed by
-- organizationId, with its own create/update/delete CRUD. It is unrelated to
-- the `vehicles.is_defleeted` lifecycle flag, so a dedicated table is required
-- (there is no existing table that carries operationType / expectedArrival /
-- supplier / defleetReason / defleetDestination).
--
-- Shape mirrors the DeliveryDefleelEntry interface
-- (DeliveriesDefleetContent.tsx). createdAt/updatedAt are coerced to Date on
-- read by the hook (toCamel passes the ISO string through; the hook revives it
-- exactly like the Firestore .toDate() path used to).
-- ============================================================================

create table if not exists public.deliveries_defleet (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  date                  text not null,                 -- yyyy-mm-dd (kept as text: matches the Firestore string + the hook's date sort)
  operation_type        text not null check (operation_type in ('delivery','defleet')),
  registration          text not null,
  make                  text,
  model                 text,
  notes                 text,
  -- completion status
  is_completed          boolean,
  completed_at          text,
  completed_by          text,
  -- delivery specific
  expected_arrival      text,
  supplier              text,
  -- defleet specific
  is_fleet_vehicle      boolean,
  defleet_reason        text,
  defleet_destination   text,
  -- attribution
  created_by            uuid,
  created_by_name       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

create index if not exists deliveries_defleet_org_idx
  on public.deliveries_defleet(organization_id);
-- mirrors the hook's order-by (date desc, created_at desc)
create index if not exists deliveries_defleet_org_date_idx
  on public.deliveries_defleet(organization_id, date desc, created_at desc);

create trigger deliveries_defleet_set_updated_at before update on public.deliveries_defleet
  for each row execute function public.set_updated_at();

-- ── RLS: standard org-scoped read/write ──────────────────────────────────────
alter table public.deliveries_defleet enable row level security;

create policy deliveries_defleet_org_rw on public.deliveries_defleet
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Realtime: replaces the Firestore onSnapshot listener ─────────────────────
alter publication supabase_realtime add table public.deliveries_defleet;

-- ============================================================================
-- checked_in_vehicles: transfer/garage receipt audit columns
-- The useVehicleTransfers hook (receiveVehicle / returnFromGarage) stamps WHO
-- received a transferred vehicle and WHO returned one from an external garage.
-- These audit fields existed in the Firestore docs but were never modelled as
-- columns (transferService.ts only writes last_edit_log). Add them so the
-- hook's writes preserve that attribution instead of silently dropping it.
-- ============================================================================
alter table public.checked_in_vehicles
  add column if not exists received_at              timestamptz,
  add column if not exists received_by              uuid,
  add column if not exists received_by_name         text,
  add column if not exists returned_from_garage_at  timestamptz,
  add column if not exists returned_from_garage_by  uuid,
  add column if not exists returned_from_garage_by_name text;

-- ===================== 0021_fix_jwt_hook.sql =====================
-- ============================================================================
-- 0021_fix_jwt_hook.sql — make the access-token hook actually populate claims.
--
-- Two fixes:
-- 1. The hook runs as `supabase_auth_admin`. profiles has RLS on, and no policy
--    grants that role SELECT, so the hook read 0 rows and set no org_id claim.
--    Add a permissive SELECT policy for supabase_auth_admin (the documented
--    requirement for access-token hooks that read app tables).
-- 2. The app role must NOT overwrite the JWT `role` claim (PostgREST uses it to
--    SET ROLE). Put it in a separate `user_role` claim, and read that in
--    auth_role(). Idempotent — safe to run on the already-applied database.
-- ============================================================================

-- 1. let the auth admin read profiles under RLS
drop policy if exists auth_admin_read_profiles on public.profiles;
create policy auth_admin_read_profiles on public.profiles
  as permissive for select to supabase_auth_admin using (true);
grant select on public.profiles to supabase_auth_admin;

-- 2. app role lives in `user_role`, not the Postgres `role` claim
create or replace function public.auth_role()
returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims   jsonb := event -> 'claims';
  v_org_id uuid;
  v_role   text;
begin
  select organization_id, role into v_org_id, v_role
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  if v_org_id is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org_id::text));
  end if;
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ===================== 0022_org_main_branch.sql =====================
-- ============================================================================
-- 0022_org_main_branch.sql — every new organization starts with one
-- auto-created, renamable Main Branch (slug 'main', is_main = true).
-- The branch selector shows the Main entry only when an is_main row exists, and
-- checked-in vehicles are keyed by branch_id = 'main', so this makes the default
-- branch a real, renamable row instead of a UI-only fallback.
-- Idempotent (create or replace). Existing orgs are backfilled separately.
-- ============================================================================
create or replace function public.create_organization(p_name text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (name, description, created_by, member_count)
  values (p_name, p_description, v_uid, 1)
  returning id into v_org;

  update public.profiles
     set organization_id = v_org,
         organization_name = p_name,
         role = 'admin',
         updated_at = now()
   where id = v_uid;

  insert into public.condition_categories (organization_id, name, sort_order, color, severity) values
    (v_org, 'Excellent', 0, '#16a34a', 'excellent'),
    (v_org, 'Good',      1, '#22c55e', 'good'),
    (v_org, 'Fair',      2, '#eab308', 'fair'),
    (v_org, 'Poor',      3, '#f97316', 'poor'),
    (v_org, 'Critical',  4, '#ef4444', 'critical');

  -- every org starts with one renamable Main Branch
  insert into public.branches (organization_id, slug, name, is_main, is_active, created_by)
  values (v_org, 'main', 'Main Branch', true, true, v_uid);

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

-- ===================== 0023_vehicles_last_edit_log.sql =====================
-- ============================================================================
-- 0023_vehicles_last_edit_log.sql
-- The fleet update flows (edit modal, MOT-done via Zao, insurance changes)
-- attach an audit `lastEditLog` to the vehicle, same as checked_in_vehicles.
-- The vehicles table was missing the column, so those writes failed with
-- PGRST204 ("Could not find the 'last_edit_log' column"). Add it.
-- Idempotent.
-- ============================================================================
alter table public.vehicles add column if not exists last_edit_log jsonb;

COMMIT;
