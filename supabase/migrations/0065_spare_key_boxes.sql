-- 0065_spare_key_boxes.sql  (Key Box — declared boxes)
-- ============================================================================
-- Until now a box only existed because some key row referenced it, so an
-- EMPTY box was impossible (and a box vanished when its last key left).
-- This table declares boxes explicitly: create "B8" first, assign keys later.
-- The UI shows the UNION of declared boxes and boxes referenced by keys.
-- Additive + re-runnable.
-- ============================================================================

create table if not exists public.spare_key_boxes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,           -- 'B8' (stored uppercase)
  created_by_name  text,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists spare_key_boxes_org_idx on public.spare_key_boxes (organization_id);

alter table public.spare_key_boxes enable row level security;
drop policy if exists spare_key_boxes_org_rw on public.spare_key_boxes;
create policy spare_key_boxes_org_rw on public.spare_key_boxes
  for all
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Live updates alongside spare_keys.
do $$
begin
  alter publication supabase_realtime add table public.spare_key_boxes;
exception when duplicate_object then
  null;
end $$;
