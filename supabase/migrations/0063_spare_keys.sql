-- 0063_spare_keys.sql  (Fleet — head-office spare-key box log + queue)
-- ============================================================================
-- One row per physical spare key held at head office. A key either lives in a
-- BOX (B1, B2, …) + numbered SLOT, or sits in the QUEUE (box/slot NULL) waiting
-- to be assigned a slot. Make/model/type are cached from import/manual entry —
-- the UI prefers live fleet data when the registration matches. `logbook` =
-- the V5 is stored with the key. One key per physical slot (unique
-- org+box+slot; NULLs don't collide, so the queue can hold many keys).
-- Additive + re-runnable.
-- ============================================================================

create table if not exists public.spare_keys (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  registration     text not null,
  box              text,                   -- e.g. 'B1'; NULL = in the queue
  slot             int,                    -- NULL = in the queue
  make             text,
  model            text,
  vehicle_type     text,                   -- SWB / L3H2 / CAR … (cached)
  logbook          boolean not null default false,
  notes            text,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  updated_by_name  text,
  unique (organization_id, box, slot)
);

-- Safety for databases that ran the earlier NOT NULL version of this migration.
alter table public.spare_keys alter column box drop not null;
alter table public.spare_keys alter column slot drop not null;

create index if not exists spare_keys_org_idx on public.spare_keys (organization_id);
create index if not exists spare_keys_reg_idx on public.spare_keys (organization_id, registration);

alter table public.spare_keys enable row level security;
drop policy if exists spare_keys_org_rw on public.spare_keys;
create policy spare_keys_org_rw on public.spare_keys
  for all
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Live updates for the key-box page (people add/remove keys constantly).
do $$
begin
  alter publication supabase_realtime add table public.spare_keys;
exception when duplicate_object then
  null;
end $$;
