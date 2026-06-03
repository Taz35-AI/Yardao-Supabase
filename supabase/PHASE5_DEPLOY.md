# Phase 5 — Edge Functions: deploy & configure

All function code is written under `supabase/functions/`. They read secrets from
the environment at runtime, so **you set the secrets in Supabase — they never
touch the frontend/Vercel and I never see them.** Steps below, in order.

## 1. Set the function secrets (Supabase, not Vercel)
Dashboard → **Edge Functions → Secrets**, or CLI:
```bash
supabase secrets set \
  DVLA_API_KEY=... \
  MOT_CLIENT_ID=... MOT_CLIENT_SECRET=... MOT_API_KEY=... \
  MOT_TOKEN_URL=... MOT_SCOPE=... \
  GROQ_API_KEY=... \
  RESEND_API_KEY=...
```
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are **auto-injected** — do NOT set them.

## 2. Deploy the functions
```bash
supabase functions deploy vehicleLookup
supabase functions deploy callGroq
supabase functions deploy geocodeAddress
supabase functions deploy admin-create-user
supabase functions deploy send-email
supabase functions deploy bulkRefreshVehicleData
supabase functions deploy scheduledNotifications --no-verify-jwt
```
`scheduledNotifications` uses `--no-verify-jwt` because pg_cron calls it with a
service-role bearer (the function checks that bearer itself). All others keep
JWT verification on (only logged-in users can call them).

| Function | Secrets used | Notes |
|---|---|---|
| `vehicleLookup` | DVLA + MOT | DVLA VES + DVSA MOT, private-plate handling |
| `bulkRefreshVehicleData` | DVLA + MOT | bulk refresh; writes progress to `bulk_refresh_jobs` (Realtime) |
| `callGroq` | GROQ_API_KEY | Zao AI text assistant |
| `geocodeAddress` | none | free OpenStreetMap Nominatim |
| `admin-create-user` | (service role, auto) | verifies caller is admin; creates user + profile |
| `send-email` | RESEND_API_KEY | transactional email |
| `scheduledNotifications` | (service role, auto) | cron worker (MOT/service/note alerts) |

## 3. Email — two places for Resend
- **Auth emails** (verification / reset / invite): Dashboard → **Authentication →
  SMTP Settings** → host `smtp.resend.com`, port 465, user `resend`, password =
  your `RESEND_API_KEY`, sender = a **Resend-verified domain**.
- **App/transactional email** (`send-email` fn): uses `RESEND_API_KEY` secret.
  ⚠️ Edit the default `from` in `supabase/functions/send-email/index.ts`
  (`noreply@yourdomain`) to your verified domain before it will send.

## 4. Scheduled jobs (pg_cron) — run AFTER functions are deployed
`supabase/migrations/0024_cron.sql` schedules the daily/periodic jobs via
pg_cron + pg_net. Before running it, set these two DB settings once (SQL Editor),
substituting your real values:
```sql
alter database postgres set app.settings.project_url      = 'https://gxiplydgrcjxdfrcrwcg.supabase.co';
alter database postgres set app.settings.service_role_key = '<YOUR-SERVICE-ROLE-KEY>';
```
Then run `0024_cron.sql` (SQL Editor or `supabase db push`). Verify with
`select * from cron.job;`. Schedules: MOT expirations (06:00), today's services
(08:00), note reminders (every 5 min).

## Known deferrals / knobs
- **FCM push send is deferred (phase 5b).** The scheduled jobs currently write
  **in-app `user_notifications`** rows (the bell/inbox) instead of pushing to
  devices. Wiring real FCM/APNs push needs a Firebase service-account credential
  added as a function secret + a small send step — say the word when you want it.
- **`ACTIVE_STATUSES`** in `scheduledNotifications/index.ts` maps "active" to
  `in_fleet | checked_in | external_service` — review if you want a different set.
- Region/timeout for long functions (bulk refresh) can be tuned in the dashboard.
