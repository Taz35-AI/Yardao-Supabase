-- 0069_daily_report.sql
-- ============================================================================
-- Daily 6AM email report (external garage bookings today + next 5 days, MOT/
-- tax expired, MOT/tax expiring within 14 days).
--
-- 1) organization_settings.daily_report_emails — the recipient list, editable
--    in Settings by owner/admin/garage-manager. Empty list = report off.
--
-- 2) pg_cron entry firing the scheduledNotifications edge function with
--    job='daily_report' at BOTH 05:00 and 06:00 UTC. The UK flips GMT/BST, so
--    the function itself only sends when it's actually 6AM in Europe/London —
--    exactly one of the two runs matches, year-round.
--
-- NOTE: replace <SERVICE_ROLE_KEY> with the project's service_role key when
-- running by hand (mirrors the existing cron entries from 0024_cron.sql).
-- ============================================================================

alter table public.organization_settings
  add column if not exists daily_report_emails jsonb not null default '[]'::jsonb;

select cron.schedule(
  'yardao-daily-report',
  '0 5,6 * * *',
  $$
  select net.http_post(
    url:='https://gxiplydgrcjxdfrcrwcg.supabase.co/functions/v1/scheduledNotifications',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body:=jsonb_build_object('job','daily_report')
  );
  $$
);
