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
