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
