# YARDAO — Feature Parity Checklist (Supabase rebuild)

Sign-off that every feature behaves the same on Supabase as on the live Firebase
app. Run through this on the **live Vercel URL** (and once on the **mobile/PWA**),
logged in as a real admin. Tick each box; note anything off and I'll fix it.

**Legend:** `[ ]` not checked · `[x]` works · `[!]` broken (add a note) · `[~]` minor diff
**Test org:** Verification Test Org (`leescu.paul@gmail.com`). Where useful, add a 2nd org to confirm isolation visually.

---

## ✅ Already verified by automated audit (no action needed)
- [x] **RLS — anon lockout:** all 30 tables return empty to anonymous callers (0 leaks).
- [x] **RLS — cross-tenant read:** forged `organization_id` filter returns nothing.
- [x] **RLS — cross-tenant write:** inserting into another org is rejected (403).
- [x] **Data layer:** every feature table accepts org-scoped insert/read/delete + enforces constraints.
- [x] **Edge Functions live:** DVLA + DVSA MOT lookup (real data, incl. model), Groq AI, geocoding.

---

## ✅ Browser walkthrough — automated pass (Claude, 2026-06-04, local dev → live Supabase)
Drove the running app end-to-end in a real browser against the live Supabase DB (org *Fairview Maidenhead*). Every page below loaded with real data, **zero console errors**, all REST calls 2xx (only benign aborted HEAD count-probes on navigation). No test data created (add-vehicle wizard cancelled).
- [x] **Login → dashboard** (§1) and **session persists across full reload** (§1).
- [x] **Role gating** (§1): admin sees Organization + Data Management in Settings.
- [x] **Realtime "Sync Active"** on the dashboard (§4/§3 live).
- [x] **Fleet** (§3): table + columns + pagination; **Add-Vehicle DVLA/MOT lookup filled make=BMW, model=330, colour=White** (Edge Function live, §18).
- [x] **Yard / dashboard** (§4): renders per branch, status columns, detail modals open cleanly.
- [x] **Damage mapper consistency FIX verified** (§4): same pin renders at identical 21.6%/43.9% with no letterboxing in both the small Fleet modal (250×306, ratio 0.814) and the wider Yard view (289×354, ratio 0.814).
- [x] **Service bookings** (§7): Today/Upcoming/Calendar/Working-Report, workshop bay grid, real booking w/ customer.
- [x] **Bodyshop** (§8): Kanban board renders (no active jobs).
- [x] **Stock + Invoicing tabs** (§9/§10): tiles, sort, Add Part.
- [x] **Reports** (§15): utilisation %, status breakdown, distribution widgets.
- [x] **Customers** (§11): list with auto-upserted customer + linked vehicles.
- [x] **Branch overview** (§6): multi-branch distribution + per-branch counts.
- [x] **Deliveries & Defleet** (§14): calendar/list + counters + export.
- [x] **Checkout history** (§6): activity log, filters, CSV export.
- [x] **Settings** (§16/§20): theme (light/dark/system), 4 languages, dashboard prefs, notifications.
- [~] **Contracts badge colour** (§13): rendering path code-verified; no contract assigned in test org to eyeball live.
- [ ] **Write flows** (create/edit/move/drag, invoice PDF, Zao actions) and **§19 device** (PWA install, Capacitor, haptics, QR) — left for your manual pass; can't fully exercise destructive writes against the shared DB without creating junk.

---

## 1. Auth & access
- [ ] Log in with email/password → lands on dashboard.
- [ ] Log out → returns to /login; protected routes redirect to login when logged out.
- [ ] Wrong password → clear error, no crash.
- [ ] Refresh while logged in → stays logged in (session persists).
- [ ] Role gating: admin sees admin areas (User Management, Settings); member/mechanic restricted.
- [ ] Auto-logout after inactivity still triggers.
- [ ] *(Phase-5/email)* Register, email verification, password reset, invites — see §Deferred.

## 2. Organization & branches
- [ ] New org on signup auto-creates a renamable **Main Branch** (slug `main`, "Main" tag).
- [ ] Branch selector lists Main + other branches; switching changes the yard view.
- [ ] Create a new branch (name + slug + optional address/bays) → appears in selector.
- [ ] Rename a branch → name updates everywhere; vehicles stay linked.
- [ ] Delete a branch with vehicles → blocked with message; empty branch → soft-deletes.
- [ ] Branch list updates **live** (realtime) without refresh.

## 3. Fleet inventory
- [ ] Fleet table loads org vehicles; columns, sort, pagination work.
- [ ] Filters + search (reg/make/model, status, contract, insurance, defleeted toggle).
- [ ] Add Fleet Vehicle wizard (3 steps): DVLA **Look up** fills make/colour/**model**; save creates vehicle.
- [ ] Edit vehicle (detail/edit modal): condition, status, contract, insurance, dates, notes save.
- [ ] Duplicate-registration detection on add.
- [ ] Export to Excel / CSV produces a file with the right data.
- [ ] Bulk upload (vehicles) imports rows.
- [ ] Fleet updates **live** when changed elsewhere (yard insurance sync → fleet, no refresh).

## 4. Yard / check-in / parking / map
- [ ] Yard view renders per selected branch; vehicles show correct status colours.
- [ ] **Check in** a fleet vehicle (with a size) → appears in yard; fleet status updates.
- [ ] Check-out / remove from yard works; history recorded.
- [ ] Update condition/status from the yard → syncs to fleet.
- [ ] Yard **map editor**: create parking spaces, merged spaces, building blocks; save persists.
- [ ] Park / move / force-move a vehicle onto a space; occupancy correct; unpark works.
- [ ] Detail modal opens steadily (no shake), shows linked parts when present.
- [ ] Damage mapper: place pins on the diagram, choose diagram type, save persists.
- [ ] *(needs Storage bucket — see Deferred)* Attach a **damage photo**.
- [ ] Yard updates **live** across devices.

## 5. Hire
- [ ] Set a vehicle **out on hire** → status changes; hire-history record created.
- [ ] Return from hire → back in yard; original status restored; days-counter resets.
- [ ] Hire lookup / "since acquired" shows correct dates & history.
- [ ] Insurance gate: can't hire out an **uninsured** vehicle (warning shown).

## 6. Transfers & multi-branch
- [ ] Initiate a branch transfer → vehicle shows **in transit** to target branch.
- [ ] Cancel an in-transit transfer → reverts.
- [ ] Receive a vehicle at the target branch → lands correctly.
- [ ] Check out to **external garage** → shows at garage; return clears it.
- [ ] Incoming transfers list shows vehicles heading to the current branch (live).
- [ ] Branch overview + branch map shows per-branch counts/locations.

## 7. Service bookings & workshop
- [ ] Create a booking (internal): date, time slot, work required, mechanic, bay.
- [ ] Create an **external-provider** booking (garage name/address/time).
- [ ] Multi-slot booking spans the right number of slots; bay conflict handling.
- [ ] Today / Upcoming / Calendar views correct; booking updates **live**.
- [ ] Check-in-to-garage and Mark-Complete (with odometer) flows work.
- [ ] Customer details captured on the booking; parts-status chip behaves.

## 8. Bodyshop
- [ ] Kanban board loads jobs in the right stages (queued/prep/paint/finishing).
- [ ] Create a job; move between stages (drag); reorder queue; set status/complete.
- [ ] Damage items + estimate; assign mechanic.
- [ ] Time entries: log hours/materials against a job; staff activity modal totals.
- [ ] Board updates **live**.

## 9. Stock / parts & ordering
- [ ] Stock tab lists parts grouped by category; search works.
- [ ] Add part (incl. multiple make/models, unit, supplier, restock target).
- [ ] Edit part; one-off parts linked to a registration.
- [ ] Use parts against a vehicle ("All Vehicles" + per-vehicle) → quantity decrements, usage logged.
- [ ] Order history (initial + restock) records; stock adjustments (count/damaged/etc.) apply.
- [ ] "Parts used today" view correct.

## 10. Invoicing
- [ ] Create invoice from a vehicle's parts + labour (presets), discount/markup/VAT.
- [ ] Business "from" details + logo pull from settings.
- [ ] **jsPDF**: download PDF — renders correctly with all line items + totals.
- [ ] Invoice statuses (draft/issued/paid); invoice number unique per org.

## 11. Customers
- [ ] Customers list loads; search by name/phone/reg.
- [ ] Booking auto-upserts a customer (phone-normalised dedup); booking count + last booking update.
- [ ] Customer job history shows their past bookings/jobs.

## 12. Insurance
- [ ] Set insurance status (Insured/Not Insured) on fleet → **syncs to yard** copies.
- [ ] Insurance policies + policy picker; expiry tracked.
- [ ] Uninsured vehicles blocked from checkout/hire with warning.
- [ ] Bulk insurance update across selected vehicles.

## 13. Contracts & conditions
- [ ] Contracts list; create/edit/delete; colour badge renders consistently across fleet & yard.
- [ ] Assign a contract to a vehicle → badge + colour correct everywhere.
- [ ] Conditions: 5 defaults seeded on org creation; manage/add/reorder; condition cleanup.

## 14. Defleet / deliveries
- [ ] Defleet a vehicle (reason + date) → removed from yard, flagged defleeted, history preserved.
- [ ] Restore-to-fleet → reappears in active fleet.
- [ ] Deliveries & defleet calendar/log: add/track incoming deliveries + outgoing defleets.

## 15. Dashboard / reports / analytics
- [ ] Dashboard stats (in-yard, ready, attention, MOT due) match reality.
- [ ] Fleet utilisation snapshot + charts render (the recharts widgets).
- [ ] Reports (vehicle/condition/status/contract/insurance/external-garage) generate correct data.
- [ ] Counts/aggregates match the underlying data per org.

## 16. Notifications
- [ ] In-app notification bell shows org notifications; mark read.
- [ ] Notification settings save.
- [ ] Service banners / indicators show for due services.
- [ ] *(Phase-5b/FCM)* Device push — see Deferred.

## 17. Zao AI & voice
- [ ] Zao assistant opens; text query returns a sensible answer (Groq live ✅).
- [ ] Action intents work: "where is REG", status/counts, book service, MOT-done, check-in, hire out/return, checkout/return garage, create note, read notes.
- [ ] Note creation parses free text into a note.
- [ ] *(no Deepgram)* Voice transcription is intentionally **disabled** — confirm it degrades gracefully (no crash).

## 18. Integrations
- [x] **DVLA + MOT** lookup returns real data incl. model (verified).
- [ ] Bulk MOT/tax refresh runs and updates vehicles (watch live progress).
- [x] **Groq** AI responds (verified).
- [ ] **Maps**: branch address geocodes (free OSM/Nominatim) and shows on the branch map.

## 19. PWA / mobile / platform
- [ ] PWA install prompt; installs; offline page shows when offline (online-only otherwise).
- [ ] Capacitor Android build runs against the same bundle; core flows work on device.
- [ ] Haptics, status/navigation bars, QR scanner (html5-qrcode) function on device.

## 20. i18n / theme / branding
- [ ] All 4 languages (en/bg/pl/ro) switch correctly; no missing keys on key screens.
- [ ] Light/dark/system theme toggles; persists.
- [ ] Branding, YARDAO logo, fonts, colours match the live app.

---

## ⏳ Deferred — expected to fail until enabled (not regressions)
- [ ] **Damage photo upload** — create Supabase Storage bucket `damage-photos` + policies.
- [ ] **Email** (verification/reset/invite + transactional) — Resend verified domain + Auth SMTP + `from` set.
- [ ] **Scheduled alerts** (MOT/service/note reminders) — run `0024_cron.sql` + set the two DB GUCs.
- [ ] **Admin "add user"** — `admin-create-user` deployed; exercise it once.
- [ ] **Device push (FCM)** — Phase 5b: needs a Firebase service-account credential.
- [ ] **Voice transcription** — intentionally dropped (no Deepgram).

---

### How to report back
For anything you tick `[!]` or `[~]`, jot: **page → what you did → what happened vs. expected**. Paste those to me and I'll fix them one by one. The automated section above is already green, so focus your time on §1–§20 behaviours.
