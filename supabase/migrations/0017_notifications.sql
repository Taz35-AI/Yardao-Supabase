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
