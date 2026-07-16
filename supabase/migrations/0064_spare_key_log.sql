-- 0064_spare_key_log.sql  (Key Box — permanent event history)
-- ============================================================================
-- Every key-box movement is recorded forever: added, moved (box/slot change,
-- incl. assigned from the queue), removed (with a note — "given to driver X").
-- Searching a reg that's no longer in the box answers from this log:
-- "removed on <date> by <who>: <note>". Rows are never updated or deleted by
-- the app. Additive + re-runnable.
-- ============================================================================

create table if not exists public.spare_key_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  registration     text not null,
  action           text not null check (action in ('added','moved','removed')),
  box              text,            -- location at the time of the event (null = queue)
  slot             int,
  from_box         text,            -- 'moved' only: where it came from
  from_slot        int,
  note             text,
  actor_id         uuid,
  actor_name       text,
  created_at       timestamptz not null default now()
);

create index if not exists spare_key_log_org_idx on public.spare_key_log (organization_id, created_at desc);
create index if not exists spare_key_log_reg_idx on public.spare_key_log (organization_id, registration);

alter table public.spare_key_log enable row level security;
drop policy if exists spare_key_log_org_rw on public.spare_key_log;
create policy spare_key_log_org_rw on public.spare_key_log
  for all
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());
