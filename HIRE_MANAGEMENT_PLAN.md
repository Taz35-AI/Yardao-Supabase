# Yardao — Hire Management: Implementation Plan

Status: **PLAN ONLY — no app code written.** Lives on branch `feature/hire-management`.
`main`/production is never touched; everything here is fully rewindable. Grounded against the
live Supabase schema (verified 23 Jun 2026).

> **The spine:** Customer → (valid documents) → **Hire Agreement** (dates + rate) → **vehicle
> lines** → schedule. Billing is **per-vehicle, prorated on actual days**. That one model drives
> the Gantt, the B2B dashboard, the credit suggestions and the Excel/PDF export — all from the
> same facts.

---

## Locked decisions (from you)
1. **"Hire Agreement" is renamable.** Internally the entity/table is `rental_agreements`; the
   word shown in the UI is an **org setting** you can change to anything ("Contract", "Hire",
   "Rental"…), singular + plural.
2. **Calendar-accurate proration.** Daily = weekly ÷ 7, or monthly ÷ **actual days in that
   month**. Used for staggered starts, early returns and downtime credits.
3. **Insurance is a hard block.** A rental customer must hold a non-expired **fleet insurance**
   document before any vehicle can go on hire. Other document types are optional (don't block).

---

## 1. Integration map (verified — reuse first)
| Existing Yardao asset | How hire management uses it |
|---|---|
| `vehicles` (fleet) | The source for attaching vehicles to an agreement; **3-digit registration search**. Never duplicated. |
| `checked_in_vehicles` + `vehicleHireService` (`setOutOnHire`/`quickCheckIn`) | The set-on-hire / return mechanism we intercept. One added link column. |
| `contracts` (label + colour only — **not** dated/rated) | **Left alone.** Our "hire agreement" is a separate entity; we keep the name distinct (renamable) to avoid clashing with these yard labels. |
| `customers` (garage customers) | **Left alone.** Rental customers are a separate table. |
| `service_bookings` + `external_garages` + `checked_in_vehicles.transfer_status` | Downtime source → the Gantt "offline" overlay + suggested credits. |
| `activity_log` (already logs hire/return/garage/status) | The per-vehicle + per-agreement timelines and the swap log. |
| insurance gating (`canPerformAction`) | Vehicle-level insurance still applies; we add customer-level insurance gating on top. |
| `organization_settings` (jsonb blobs e.g. `service_settings`, `suppliers`) | Holds the **renamable agreement label** + proration prefs. |
| `xlsx` + `jspdf` (already deps; `invoiceReport.ts` / `generateInvoicePDF.ts` patterns) | **One-click Excel/PDF** export of the Rent Plan / Active Rentals report. |
| branches, RLS by `organization_id`, i18n ×4, static export (modals, no `[id]` routes) | Standard plumbing for every new surface. |

---

## 2. Data model (new, additive, RLS-scoped)
All new tables; owner runs the SQL; identity by id, display fields denormalised for fast boards.

**2.1 `rental_customers`** — B2B accounts (separate from garage customers)
`id, organization_id, name, is_business, company_name, account_no, contact_name, phone, email,
billing_email, billing_address, account_manager, notes, is_active, created_*`.

**2.2 `rental_customer_documents`** — the gating docs
`id, organization_id, customer_id, doc_type ('fleet_insurance' | …), reference, expiry_date,
file_url (optional), notes, created_*`. A customer is **hire-eligible** only with a
`fleet_insurance` row whose `expiry_date >= today`.

**2.3 `rental_agreements`** — the (renamable) hire agreement = the spine
`id, organization_id, branch_id/name, customer_id, customer_name (denorm), reference,
start_date, duration_value int, duration_unit ('weeks'|'months'), end_date (computed),
rate_type ('weekly'|'monthly'), rate_amount, currency, status ('draft'|'active'|'completed'|
'cancelled'), notes, created_*`. `end_date` derived from start + duration.

**2.4 `rental_agreement_vehicles`** — the vehicle **lines** = the proration unit
`id, organization_id, agreement_id, vehicle_id, registration (denorm), make/model (denorm),
scheduled_start (defaults to agreement.start_date, editable per line), scheduled_end,
actual_out_at, actual_return_at, status ('scheduled'|'active'|'returned'|'swapped'),
swapped_from_line_id, swapped_to_line_id, line_rate_amount (snapshot of the agreement rate),
notes, created_*`. **Everything bills off this row.**

**2.5 `rental_swaps`** — the swap log (clarified model in §5)
`id, organization_id, agreement_id, from_line_id, from_registration, to_line_id,
to_registration, swapped_at, reason, performed_by/_name, created_at`.

**2.6 `rental_credits`** — suggested credits (never imposed)
`id, organization_id, agreement_id, line_id, vehicle_id, registration, reason
('downtime'|'early_return'|'manual'), period_start, period_end, days, daily_rate,
estimated_credit, status ('suggested'|'approved'|'ignored'|'resolved'), reviewed_by/_name,
notes, created_*`.

**2.7 `organization_settings.hire_settings`** (jsonb) — `{ agreementLabelSingular: "Contract",
agreementLabelPlural: "Contracts", prorationBasis: "calendar" }`. The renamable label.

**2.8 `checked_in_vehicles.current_agreement_line_id`** (uuid) — so the yard/dashboard resolves
the live agreement + customer for an on-hire vehicle in one read.

---

## 3. Proration engine (calendar-accurate)
Per line, billing covers the days the vehicle was **actually on hire** within the agreement window.
- **Weekly rate** → daily = `rate / 7`.
- **Monthly rate** → daily = `rate / (days in that calendar month)` — so a day in February costs
  slightly more than a day in March. Periods spanning months are summed month-by-month.
- **Staggered start:** line billed from `actual_out_at` (not the scheduled start) → the dashboard
  shows each vehicle's prorated amount (your "5 out today, 5 over the next days" case).
- **Early return:** billed to `actual_return_at`; the unused remainder of the current period
  becomes a **suggested credit** (your 23–29 weekly, returned 25th → ~2 days suggested back).
- **Downtime:** offline days inside an active hire → **suggested credit** (not auto-deducted).
Everything is **suggested**; a manager approves before it lands on the export.

---

## 4. Core workflows
1. **Add rental customer + documents.** Capture fleet insurance + expiry. No hire allowed until a
   valid (non-expired) insurance doc exists → otherwise a clear blocking message.
2. **Create a hire agreement** for that customer: start date (today or future), duration
   (weeks/months), weekly **or** monthly rate. `end_date` auto-computed.
3. **Attach vehicles** to the agreement by **3-digit reg search** from the fleet → each becomes a
   line with the agreement's schedule (per-line start editable).
4. **Schedule auto-draws** on the Gantt for the agreement's span, grouped/filterable **per
   customer**.
5. **Set on hire (interception).** Staff set a vehicle out via the normal yard action:
   - If it's a line on an agreement → modal **"Set on hire with {Customer}, {Agreement}?"** →
     confirm → line goes `active`, `actual_out_at` stamped.
   - If the agreement is **future-dated** → warn: *"{reg} is booked to {Customer} on {Agreement}
     from {date} — make sure it's back in time. To start sooner, edit the start date."*
   - Insurance gate (customer + vehicle) enforced here.
6. **Check-in during an agreement** → ask **End of hire / Swap / Temporary (yard) hold**:
   - **End of hire** → `actual_return_at` stamped, line `returned`, **suggested prorated credit**
     for the unused part of the period.
   - **Swap** → see §5.
7. **Downtime** (internal/external garage during an active hire) → Gantt shows the offline span →
   **suggested credit** for those days.

---

## 5. Swap workflow (your "make this clearer" — proposed)
A swap = **close one line, open the next, on the same agreement**, with the swap date as the hinge:
1. On the outgoing vehicle's Gantt row → **Swap** → pick the replacement (3-digit search) + date +
   reason.
2. Replacement is **added as a new line** on the same agreement, scheduled from the swap date; the
   outgoing line's `scheduled_end`/`actual_return_at` is set to the swap date and it's marked
   `swapped` (linked to the new line).
3. When the replacement is set out, the on-hire modal recognises it's on {Agreement} → confirm →
   it's live on the same agreement.
4. **Billing is seamless:** outgoing prorated to the swap date, incoming from the swap date — no
   gap, no double-charge for the customer.
5. **Log + cross-linked timelines:** "{from} swapped → {to} on {date} by {user} (reason)",
   visible on both vehicles and the agreement.
Reactive swaps (check-in → Swap) and planned swaps (done ahead on the Gantt) use the same path.

---

## 6. Gantt scheduler
Rows = vehicles grouped by agreement; X-axis = time (week / month / agreement-span). **Filter by
customer.** Bars from each line's scheduled/actual dates. Overlays: **downtime** spans (garage/
service) shown as a distinct hatch; **swaps** link two rows; future-dated bars styled differently
from live. Actions on a row: set-on-hire status, **Swap**, end-of-hire. Today marker.

---

## 7. B2B Hire Dashboard + export (the deliverable)
Per-customer dashboard: active vehicles, each line's actual days + **prorated amount**, suggested
credits, agreement totals. **Active Rentals / Rent Plan report** → **one-click Excel** (via the
existing `xlsx` + `excelDownload` util) and **PDF** (via `jspdf`), so you "open the customer → run
the report → export" exactly like the workflow you described.

---

## 8. Credit suggestion engine
Derives suggestions from line facts + downtime: early-return remainder and offline spans become
`rental_credits` rows with a calendar-accurate estimate. **Suggested only** — manager approves /
ignores; approved credits show on the dashboard + export. Idempotent per (line, reason, period).

---

## 9. Renamable label, permissions, edge cases
- **Renamable label:** a Settings field sets the singular/plural term; the whole UI reads it.
- **Permissions:** view for staff; rate edits, agreement create/cancel and credit approval are
  admin-gated; RLS by `organization_id` on every table.
- **Edge cases:** no double-active line per vehicle (partial unique index); insurance expiry mid-
  agreement → warning; vehicle deleted → denormalised reg keeps boards readable; rate change →
  per-line snapshot protects history; future agreement + early manual hire → the warning in §4.5.

---

## 10. Phasing roadmap (all on `feature/hire-management`)
Each phase: `tsc` clean → shown on dev → you review → you run that phase's SQL → next. Migrations
numbered from the current head; a matching `teardown_hire_management.sql` ships from phase 1 so you
can wipe it any time.
- **P0 Foundations** — migrations (customers, documents, agreements, lines, swaps, credits,
  settings, link column) + teardown + types + services (no UI).
- **P1 Customers + documents + agreements** — add a rental customer with insurance gating; create
  an agreement; attach vehicles by 3-digit search; auto-schedule.
- **P2 The spine live** — set-on-hire interception (match + future warning), staggered activation,
  the per-customer Gantt, end-of-hire with prorated credit.
- **P3 Money** — calendar-accurate proration, B2B dashboard, **one-click Excel/PDF Rent Plan**.
- **P4 Movement** — swaps (close/open line), downtime overlay + suggested credits, credit-review
  board, timelines.

---

### Bottom line
Customer + insurance → renamable Hire Agreement (dates + rate) → vehicle lines → auto-schedule, with
**per-line, calendar-accurate proration** powering the Gantt, the B2B dashboard, the suggested
credits and the one-click export. Separate from garage customers and the yard "Contracts" labels,
additive, isolated on `feature/hire-management`, and rewindable at will.
