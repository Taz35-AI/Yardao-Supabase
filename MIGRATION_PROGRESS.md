# YARDAO → Supabase + Vercel — Migration Progress

**Isolated rebuild.** This folder is a standalone copy of the YARDAO frontend.
It is **not** connected to the live Firebase app (`WORKING ACTIVE VERSION`),
shares no git history, node_modules, or build output, and must never run the
live deploy flow. The live Firestore app keeps running untouched until cutover.

Goal: a **data-layer swap**, not a redesign. The frontend is reused wholesale;
only the *internals* of the service layer are re-implemented against Supabase,
keeping every function signature identical. Online-only. Fresh-start data.

---

## Stack
- **Frontend:** Next.js 15, `output: 'export'` static bundle (distDir `out`),
  next-pwa Workbox, Capacitor (`com.yardao.app`). One build serves web (Vercel
  static) + mobile (Capacitor webview).
- **Backend:** Supabase — Postgres + RLS, Edge Functions (Deno) + Postgres RPC.
  No standalone Node/Express server.
- **Auth:** Supabase Auth (session stored via Capacitor Preferences on native).
- **Realtime:** Supabase Realtime replaces Firestore `onSnapshot`.
- **Maps:** free only — MapLibre/Leaflet + OSM tiles + Nominatim/Photon geocoder.

---

## Conventions (decided)
- **DB columns snake_case**; the data layer maps snake↔camel so frontend TS
  interfaces stay byte-for-byte identical (zero component churn).
- **uuid PKs** (`gen_random_uuid`). Fresh data, no Firestore IDs preserved.
- **String-union TS types → `text` + CHECK** (cheap to extend vs enum ALTER).
- **`YYYY-MM-DD` strings → `date`; timestamps → `timestamptz`.**
- **Opaque maps/arrays → `jsonb`** (damagePins, yard spaces/blocks, invoice
  parts/labour, externalProvider, work_required, audit logs).
- **Tenancy:** `organization_id` on every row; RLS policy
  `organization_id = auth_org_id()` where `auth_org_id()` reads the `org_id`
  JWT claim injected by the Custom Access Token Hook.

---

## Status

| Phase | State |
|---|---|
| 1. Scaffold isolated folder | ✅ done |
| 2. Core schema + RLS draft | ✅ first pass (`0001`, `0002`, `0003`) |
| 3a. Auth + core data layer on Supabase (type-clean) | ✅ done |
| 3b. Yard map + realtime wiring, Vercel + Capacitor verify | ⏳ needs live project |
| 4. Remaining tables + service-layer port | ⬜ |
| 5. Edge Functions (DVLA, bulk refresh, Groq, Resend) + pg_cron | ⬜ |
| 6. RLS audit + realtime QA + cutover (on your go) | ⬜ |

### Done so far
- Copied frontend source (src, public, assets, configs) — excluded
  node_modules, .git, .next, out, build, android, functions, .firebase,
  .vercel, .idea, .env.local, and all Firebase config files.
- Added `@supabase/supabase-js` to package.json (firebase kept until the
  service layer is fully ported — removing it now would break the build).
- `src/lib/supabaseClient.ts` — shared web/native client, Capacitor Preferences
  auth storage, PKCE flow.
- `.env.local.example` — public client env template.
- `supabase/migrations/0001_core_schema.sql` — 18 core tables.
- `supabase/migrations/0002_rls_policies.sql` — RLS, `auth_org_id()`,
  `custom_access_token_hook`, realtime publication.

### Phase 3a — done (whole project type-checks clean: `npx tsc --noEmit` → 0)
- `src/lib/dbMap.ts` — top-level snake↔camel mappers (jsonb values pass through).
- `src/lib/firestore.ts` — **re-implemented against Supabase**, every export +
  signature identical: `vehicleService`, `conditionService`, `contractService`,
  `yardVehicleService`, `userProfileService`, `organizationService` + `Vehicle`
  type. `getVehicles` now uses a SQL `WHERE` (was a client-side filter).
- `src/contexts/AuthContext.tsx` — Supabase Auth, same `useAuth()` contract;
  `user` is a Firebase-compatible shape (`uid/email/emailVerified/displayName`).
- Ported the 3 screens that called Firebase-`User` methods to Supabase:
  `verify-email-required` (`user.reload()` → `refreshSession()`),
  `reset-password-required` + `useProfileLogic` (`updatePassword`/reauth →
  `supabase.auth.updateUser` / sign-in re-auth).
- `supabase/migrations/0003_auth_bootstrap.sql` — `handle_new_user` trigger
  (auto-creates profile on signup) + `create_organization` SECURITY DEFINER RPC
  (atomic org create + admin join + seed conditions, RLS-safe before claim).

### Phase 3b — remaining for the runnable slice (needs live project)
- Re-implement `enhancedVehicleService`, `vehicleParkingService`,
  `yardLayoutService` against Supabase (yard map data + occupancy).
- Replace Firestore `onSnapshot` in `FleetDataContext` / `YardDataContext` with
  Supabase Realtime channels.
- Add `vercel.json`, deploy, and verify in a Capacitor build.
- ⚠️ Until the remaining services are ported, the app is split-brain (some paths
  Supabase, some still Firestore) — don't run end-to-end until Phase 4 lands or
  the slice's services are all swapped.

### Core tables drafted (Firestore collection → Postgres table)
organizations, userProfiles→`profiles`, organizationSettings→`organization_settings`,
branches, contracts, conditionCategories→`condition_categories`,
externalGarages→`external_garages`, vehicles, checkedInVehicles→`checked_in_vehicles`,
yardLayouts→`yard_layouts`, customers, serviceBookings→`service_bookings`,
stockParts→`stock_parts`, partUsage→`part_usage`, orderHistory→`order_history`,
stockAdjustments→`stock_adjustments`, invoices, checkoutHistory→`checkout_history`.

### Remaining Firestore collections to model (Phase 4)
yardVehicles, branchMigrations, vehicleTransfers, vehicleCheckoutHistory,
checkoutHistory(legacy), hireHistory, contractAssignments, deliveriesDefleet,
vehicle_insurance, insurancePolicies, externalServiceVehicles, conditions,
bodyshopJobs(+timeEntries), tasks(+data), invitations, notificationSettings,
userNotifications, userNotes, voiceCommandLogs, voiceSettings, bulkRefreshJobs.

### Edge Functions to port (Phase 5)
`vehicleLookup` (DVLA VES + DVSA MOT, incl. private-plate handling),
`bulkRefreshVehicleData` + `onBulkRefreshRequested` worker (→ pg_cron + queue),
scheduled jobs, triggers, `voice`, `groq`. Secrets in Supabase Vault:
DVLA_API_KEY, MOT_CLIENT_ID/SECRET/API_KEY/TOKEN_URL/SCOPE, RESEND_API_KEY, GROQ_API_KEY.

---

## ⚠️ Required manual step after `db push`
Enable the JWT claim hook (org_id won't reach RLS otherwise):
**Supabase dashboard → Authentication → Hooks → Customize Access Token (JWT)
Claims → `public.custom_access_token_hook`**, or in `supabase/config.toml`:
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

## How to apply (once you provide the project)
```bash
npm install
supabase login
supabase link --project-ref <your-ref>
supabase db push          # applies 0001 + 0002
# then enable the access-token hook (above)
```
