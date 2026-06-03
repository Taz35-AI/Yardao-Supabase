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
| 4. Remaining tables + service-layer port | ✅ services + UI ported (waves 1–3); Firebase 62→11 files |
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

### Phase 3b — in progress
Ported to Supabase (signatures identical, whole project `tsc --noEmit` → 0):
- `vehicleParkingService` — park/unpark/force-move + self-healing occupancy
  (SQL lookup by branch + space, replacing the client-side scan).
- `yardLayoutService` — one row per branch, upsert on (org, branch).
- `enhancedVehicleService` — defleet / restore / hard-delete + pre-flight checks.
- `checkoutHistoryService` — branch-aware history (rich record shape).
- Schema additions for these: `vehicles.restored_*`, `service_bookings`
  vehicle_defleeted/deleted flags, `checkout_history` rebuilt to the rich shape,
  and **branch refs modelled as `text`** (app keys branches by a stable string).

Still to do for a runnable slice (needs live project):
- Replace Firestore `onSnapshot` in `FleetDataContext` / `YardDataContext` with
  Supabase Realtime channels.
- Add `vercel.json`, deploy, verify in a Capacitor build.
- ⚠️ Still split-brain until the rest of Phase 4 lands — don't run end-to-end yet.

### Phase 4 — wave 1 (6 parallel agents; whole project `tsc --noEmit` → 0)
Ported to Supabase (identical signatures):
- Stock/invoicing: `stockService`, `settingsService` (→ existing tables; `organization_settings` gained suppliers/companies/policies jsonb).
- Transfers: `transferService` (uses existing `checked_in_vehicles`; `service_booking_id` relaxed to text).
- Hire: `vehicleHireService`, `hireHistoryService` (+ new `hire_history` table).
- Customers/history: `customerService`, `customerJobHistoryService` (derived from bookings), `vehicleServiceHistoryService` (+ new `vehicle_service_history`).
- Branches/org/garages/conditions/contracts: `branchService` (Realtime subscribe), standalone `organizationService`, `externalGarageService`, standalone `conditionService`, `contractService` (+ new `branch_migrations`; branches→Realtime).
- Bulk ops: `bulkInsuranceService` (×2 paths), `bulkRoadTaxService`, `bulkVehicleRefreshService` (Realtime; DVLA call stubbed via `functions.invoke` for Phase 5).
- New migrations: `0010_stock_settings` … `0015_bulk_insurance`.

### ✅ Applied & verified on the live Supabase project (ref gxiplydgrcjxdfrcrwcg)
- All 15 migrations (0001–0003, 0010–0021) applied cleanly via the SQL Editor.
- Custom Access Token hook enabled; **0021** fixes it: added an RLS policy so
  `supabase_auth_admin` can read `profiles`, and moved the app role to a
  `user_role` claim (never overwrite PostgREST's `role`).
- End-to-end live test PASSED: sign-in → `create_organization` → JWT `org_id`
  claim → 5 conditions seeded → vehicle insert/read → yard check-in →
  tenant isolation (anon sees nothing). The data/auth/RLS slice is green.

Known follow-ups flagged by agents:
- A few `writeBatch` ops are now non-atomic parallel writes → convert to RPCs if true atomicity matters (stock batch-use, bulk updates).
- `insurance_policies` table created but unused (policies live as jsonb on `organization_settings`) — reconcile/drop later.
- `src/types/{transfer,hireHistory,yardLayout}.ts` still import the Firebase `Timestamp` type — clean up when removing the firebase dep.

### Phase 4 — remaining (wave 2+)
- Realtime hooks/contexts still on `onSnapshot`: `useYardData`, `useYardLayout`, `useVehicleTransfers`, `useIncomingTransfers`, `useNotifications`, `useCustomers`, `useCheckoutHistory`, `useBranchOverviewData`, `useBodyshopJobs`, `useDeliveriesDefleet`, `ServiceBookingsContext`.
- Sync/util services: `insuranceSyncService`, `damageSyncService`, `contractSyncService`, `conditionSyncService`, `RegistrationUpdateService`, `notesCleanupService`, `cleanupExistingData`, `lib/zao/fleetQueries`.
- Components with inline Firestore: stock modals, `VehicleDetailModal`, `ServiceBanner`, `VehicleHireLookup`, `UserManagement`, `reports`, settings/dashboard widgets.
- Bodyshop, tasks, user notes, notifications tables (not yet modelled).
- Voice/Groq/push (`useGroqAssistant`, `SpeechEnabledGroqAssistant`, `VoiceCommandButton`, push debug) → Phase 5 Edge Functions.

### Phase 4 — wave 3 done (UI components; tsc → 0)
Ported all inline-Firestore UI off Firebase: stock modals (AddPart/EditPart/CreateInvoice),
`VehicleDetailModal`, `useFleetActions`, `InsuranceWarningPopup`, `ServiceBanner`,
`VehicleHireLookup`, `UserManagement`, `DataManagement`, `reports`, `cleanup-conditions`.
Admin user-creation stubbed via `supabase.functions.invoke('admin-create-user')` (Phase 5,
service-role Edge Function — can't create users from the client).

### Only 11 Firebase files left (all expected)
- Phase 5: `usePushNotifications`, `useGroqAssistant`, `SpeechEnabledGroqAssistant`,
  `VoiceCommandButton`, `PushDebugScreen`, `push-debug/page` (voice/Groq/FCM).
- Final cleanup (when firebase dep is removed): `types/{yardLayout,transfer,hireHistory}.ts`
  (only import the `Timestamp` *type*), `lib/firebase.ts`, `hooks/common/useFirestoreNetwork.ts`.

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
