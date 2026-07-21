-- 0066_spare_key_one_key.sql  (Key Box — "came with only 1 key" flags)
-- ============================================================================
-- Some vehicles arrive from the supplier with a SINGLE key, so a spare will
-- never exist. Flagging them here removes them from the "missing spare keys"
-- list (and from the coverage denominator) instead of drowning the real gaps.
-- One row per org+registration. Additive + re-runnable.
-- ============================================================================

create table if not exists public.spare_key_one_key (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  registration     text not null,           -- normalised (uppercase, no spaces)
  created_by_name  text,
  created_at       timestamptz not null default now(),
  unique (organization_id, registration)
);

create index if not exists spare_key_one_key_org_idx on public.spare_key_one_key (organization_id);

alter table public.spare_key_one_key enable row level security;
drop policy if exists spare_key_one_key_org_rw on public.spare_key_one_key;
create policy spare_key_one_key_org_rw on public.spare_key_one_key
  for all
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Live updates alongside spare_keys.
do $$
begin
  alter publication supabase_realtime add table public.spare_key_one_key;
exception when duplicate_object then
  null;
end $$;
