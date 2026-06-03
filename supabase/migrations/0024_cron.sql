-- ============================================================================
-- YARDAO → Supabase  |  0024_cron.sql
-- ----------------------------------------------------------------------------
-- Scheduled jobs, ported from the Firebase scheduled Cloud Functions
-- (functions/src/scheduled.ts) plus a nightly fleet DVLA refresh.
--
-- Firebase used firebase-functions/v2/scheduler (onSchedule). Supabase has no
-- managed scheduler, so we run the schedule in Postgres with pg_cron and have
-- each cron entry fire the relevant Edge Function over HTTP with pg_net.
--
-- Jobs created here:
--   yardao_mot_expirations  06:00 UTC daily   → scheduledNotifications {job:mot_expirations}
--                                                (was checkMOTExpirations)
--   yardao_todays_services  08:00 UTC daily   → scheduledNotifications {job:todays_services}
--                                                (was checkTodaysServices)
--   yardao_note_reminders   every 5 minutes   → scheduledNotifications {job:note_reminders}
--                                                (was checkNoteReminders)
--   yardao_nightly_refresh  02:00 UTC daily   → (DISABLED by default — see note)
--
-- ════════════════════════════════════════════════════════════════════════════
-- ‼️  YOU MUST EDIT TWO PLACEHOLDERS BELOW BEFORE RUNNING `supabase db push`  ‼️
-- ════════════════════════════════════════════════════════════════════════════
-- This migration reads both values from custom Postgres GUCs so no secret is
-- hard-coded in the migration file. Set them ONCE on the database, then run the
-- migration. Run these two statements in the SQL editor (or psql) as a
-- superuser/owner, replacing the placeholder text:
--
--   alter database postgres
--     set app.settings.project_url = 'https://<YOUR-PROJECT-REF>.supabase.co';
--   alter database postgres
--     set app.settings.service_role_key = '<YOUR-SERVICE-ROLE-KEY>';
--
--   1. app.settings.project_url       — your project base URL, e.g.
--                                        https://abcdefghijklmno.supabase.co
--                                        (Edge Functions live at <url>/functions/v1/<fn>)
--   2. app.settings.service_role_key  — the project's SERVICE ROLE key
--                                        (Project Settings → API → service_role).
--                                        Passed as the Bearer token; the Edge
--                                        Function only runs the job when this
--                                        matches its SUPABASE_SERVICE_ROLE_KEY.
--
-- If you'd rather not use database GUCs, replace the two
-- current_setting('app.settings....') calls in each cron.schedule() body below
-- with the literal string values, then run `supabase db push`.
--
-- After db push, verify with:   select * from cron.job;
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Make sure re-running this migration doesn't create duplicate jobs.
-- cron.unschedule() raises if the job is missing, so guard each call.
do $$
declare
  j text;
begin
  foreach j in array array[
    'yardao_mot_expirations',
    'yardao_todays_services',
    'yardao_note_reminders',
    'yardao_nightly_refresh'
  ]
  loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) MOT expirations  — daily 06:00 UTC  (was checkMOTExpirations)
--    Writes in-app user_notifications rows for expired / expiring-soon MOTs.
-- ────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'yardao_mot_expirations',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.settings.project_url') || '/functions/v1/scheduledNotifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := jsonb_build_object('job', 'mot_expirations')
  );
  $$
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Today's services  — daily 08:00 UTC  (was checkTodaysServices)
--    Writes an in-app user_notifications row summarising today's bookings.
-- ────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'yardao_todays_services',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.settings.project_url') || '/functions/v1/scheduledNotifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := jsonb_build_object('job', 'todays_services')
  );
  $$
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Note reminders  — every 5 minutes  (was checkNoteReminders)
--    Fires due user_notes as in-app user_notifications + burns the note.
-- ────────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'yardao_note_reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := current_setting('app.settings.project_url') || '/functions/v1/scheduledNotifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body    := jsonb_build_object('job', 'note_reminders')
  );
  $$
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Nightly fleet DVLA refresh  — daily 02:00 UTC  (NEW, OPTIONAL)
--    The Firebase project had no scheduled bulk refresh (it was user-triggered),
--    so this is provisioned but LEFT UNSCHEDULED to avoid surprise DVLA quota
--    burn. The bulkRefreshVehicleData function derives the org from the caller's
--    JWT, so it cannot currently be driven per-org by cron without a small
--    server-side variant. To enable a nightly refresh you would add an Edge
--    Function that loops orgs server-side, then uncomment and point this at it:
--
-- select cron.schedule(
--   'yardao_nightly_refresh',
--   '0 2 * * *',
--   $$
--   select net.http_post(
--     url     := current_setting('app.settings.project_url') || '/functions/v1/<nightlyFleetRefreshFn>',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
