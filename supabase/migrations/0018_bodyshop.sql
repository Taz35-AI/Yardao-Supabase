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
