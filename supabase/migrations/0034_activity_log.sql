-- ============================================================================
-- YARDAO → Supabase  |  0034_activity_log.sql
-- A single append-only activity feed for the dashboard "Recent activity" panel.
-- Every meaningful action writes one row via activityLogService.log(), with the
-- actor (who did it) captured as a snapshot so the feed reads fast and survives
-- user deletion.
--
-- Conventions (see 0001/0012):
--   * snake_case; uuid PK; org-scoped via organization_id + auth_org_id() RLS.
--   * actor_id / entity_id are TEXT (the app can pass non-uuid actors like
--     'system', and entity ids come from several tables).
--   * append-only: never updated; the panel reads the latest N by created_at.
-- ============================================================================

create table public.activity_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  -- who did it (snapshot — kept even if the user is later removed)
  actor_id         text,
  actor_name       text,
  -- what happened
  action_type      text not null,   -- 'checkin','checkout','status_changed','hire','return',
                                     -- 'garage_booking','garage_out','garage_return','comment',
                                     -- 'condition_changed','contract_changed','insurance_changed',
                                     -- 'vehicle_added','defleet','registration_changed', ...
  entity_type      text not null default 'vehicle',
  entity_id        text,            -- vehicle / checked_in / booking id
  registration     text,            -- for quick per-vehicle filtering + display
  summary          text not null,   -- human-readable line, e.g. 'Status: Ready → Repairs needed'
  details          jsonb,           -- optional structured extras (from/to, garage name, etc.)
  branch_id        text,
  created_at       timestamptz not null default now()
);

create index activity_log_org_created_idx on public.activity_log(organization_id, created_at desc);
create index activity_log_org_reg_idx     on public.activity_log(organization_id, registration);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.activity_log enable row level security;

create policy activity_log_org_rw on public.activity_log
  for all to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- ── Realtime: the panel subscribes for live updates ──────────────────────────
alter publication supabase_realtime add table public.activity_log;
