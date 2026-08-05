// supabase/functions/scheduledNotifications/index.ts  (Deno Edge Function)
// ----------------------------------------------------------------------------
// Server-side scheduled jobs, ported from functions/src/scheduled.ts. Invoked by
// pg_cron (see migrations/0024_cron.sql) — NOT by the browser. One function with
// a `job` selector so a single deploy + a single bearer secret covers all three
// cron entries:
//
//   job = 'mot_expirations'  ← checkMOTExpirations  (Firebase: daily 06:00 UTC)
//   job = 'todays_services'  ← checkTodaysServices  (Firebase: daily 08:00 UTC)
//   job = 'note_reminders'   ← checkNoteReminders   (Firebase: every 5 minutes)
//
// FCM PUSH: each notification is BOTH written as an in-app user_notifications
// row (Realtime bell/inbox) AND delivered as a native FCM push to every
// recipient's registered device (profiles.fcm_token). Push is best-effort: if
// FCM_SERVICE_ACCOUNT isn't configured, sendFcm() is a no-op and only the in-app
// row is written. Dead device tokens (UNREGISTERED) are cleared from the profile.
//
// Auth: pg_cron passes the service-role bearer in the Authorization header. We
// only run the work when that bearer matches SUPABASE_SERVICE_ROLE_KEY, so the
// endpoint can't be driven by ordinary users.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'
import { sendFcm } from '../_shared/fcm.ts'

// Accept the exact service_role key OR any Supabase-issued service_role JWT (the
// Edge gateway verifies the signature first) — tolerant of legacy-vs-new
// service_role key strings differing between caller (cron / manual curl) and env.
function isServiceRole(token: string, serviceKey: string): boolean {
  if (!token) return false
  if (serviceKey && token === serviceKey) return true
  try {
    let p = token.split('.')[1]
    if (!p) return false
    p = p.replace(/-/g, '+').replace(/_/g, '/')
    while (p.length % 4) p += '='
    return JSON.parse(atob(p))?.role === 'service_role'
  } catch { return false }
}

// ── date helpers (ported from functions/src/utils.ts, UTC) ───────────────────
function getTodayString(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDaysDifference(dateString: string): number {
  const target = new Date(dateString + 'T00:00:00Z')
  const today = new Date(getTodayString() + 'T00:00:00Z')
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// Active statuses must match the app's "active fleet" view (utils.ts). The
// Supabase vehicles.current_status enum differs from Firestore's; map to the
// closest equivalents that represent an in-service vehicle.
const ACTIVE_STATUSES = new Set(['in_fleet', 'checked_in', 'external_service'])

// MOT reminder cadence — flag a vehicle at these exact "days remaining"
// milestones (in addition to expired + expiring-today), instead of every day,
// so users get 14/7/3/1-day nudges rather than a daily stream.
const MOT_REMINDER_DAYS = [14, 7, 3, 1]

type Admin = ReturnType<typeof createClient>

/**
 * Coerce a mixed-type data bag into the all-string map FCM v1 requires, and tag
 * it with the notification `type` so the app's tap handler can route correctly.
 */
function toFcmData(type: string, data?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { type }
  for (const [k, v] of Object.entries(data ?? {})) out[k] = String(v)
  return out
}

/**
 * Fan out a notification to every active, notifications-enabled user in an org:
 * one in-app user_notifications row per recipient AND a native FCM push to each
 * recipient that has a registered device token. Returns the in-app row count.
 */
async function notifyOrgUsers(
  admin: Admin,
  organizationId: string,
  payload: { type: string; title: string; message: string; priority: 'high' | 'medium' | 'low'; data?: Record<string, unknown> },
): Promise<number> {
  const { data: users } = await admin
    .from('profiles')
    .select('id, is_active, is_deleted, notifications_enabled, fcm_token')
    .eq('organization_id', organizationId)

  const recipients = (users ?? []).filter((u: any) =>
    u.is_active !== false && u.is_deleted !== true && u.notifications_enabled !== false
  )
  if (recipients.length === 0) return 0

  const rows = recipients.map((u: any) => ({
    organization_id: organizationId,
    user_id: u.id,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    priority: payload.priority,
    data: payload.data ?? {},
  }))
  const { error } = await admin.from('user_notifications').insert(rows)
  if (error) console.error('notifyOrgUsers insert failed:', error.message)

  // Best-effort native push to each registered device, in parallel.
  const fcmData = toFcmData(payload.type, payload.data)
  await Promise.all(
    recipients
      .filter((u: any) => u.fcm_token)
      .map(async (u: any) => {
        const r = await sendFcm(u.fcm_token, payload.title, payload.message, fcmData)
        if (r.invalidToken) {
          await admin.from('profiles').update({ fcm_token: null }).eq('id', u.id)
        }
      }),
  )

  return rows.length
}

// ── job: MOT expirations (Firebase checkMOTExpirations) ──────────────────────
async function runMotExpirations(admin: Admin): Promise<Record<string, unknown>> {
  const { data: orgs } = await admin.from('organizations').select('id, name')
  let notified = 0

  for (const org of orgs ?? []) {
    const organizationId = (org as any).id as string

    const { data: rows } = await admin
      .from('vehicles')
      .select('registration, mot_expiry, current_status, is_defleeted')
      .eq('organization_id', organizationId)

    const expired: string[] = []
    const expiringToday: string[] = []
    const expiringSoonByDays = new Map<number, string[]>()

    for (const v of rows ?? []) {
      const veh = v as any
      if (
        !veh.mot_expiry ||
        veh.is_defleeted === true ||
        !veh.current_status ||
        !ACTIVE_STATUSES.has(veh.current_status)
      ) continue

      const days = getDaysDifference(String(veh.mot_expiry))
      if (days < 0) expired.push(veh.registration)
      else if (days === 0) expiringToday.push(veh.registration)
      else if (MOT_REMINDER_DAYS.includes(days)) {
        if (!expiringSoonByDays.has(days)) expiringSoonByDays.set(days, [])
        expiringSoonByDays.get(days)!.push(veh.registration)
      }
    }

    const list = (regs: string[]) =>
      `${regs.slice(0, 3).join(', ')}${regs.length > 3 ? ` +${regs.length - 3} more` : ''}`

    if (expired.length > 0) {
      notified += await notifyOrgUsers(admin, organizationId, {
        type: 'mot_expired',
        title: '🚨 MOT Expired',
        message: `${expired.length} vehicle${expired.length > 1 ? 's have' : ' has'} expired MOT${expired.length > 1 ? 's' : ''}: ${list(expired)}`,
        priority: 'high',
        data: { count: expired.length, vehicles: expired.join(',') },
      })
    }

    if (expiringToday.length > 0) {
      notified += await notifyOrgUsers(admin, organizationId, {
        type: 'mot_expiring',
        title: '⚠️ MOT Expiring Today',
        message: `${expiringToday.length} vehicle${expiringToday.length > 1 ? 's have' : ' has'} MOT expiring today: ${list(expiringToday)}`,
        priority: 'high',
        data: { count: expiringToday.length, vehicles: expiringToday.join(',') },
      })
    }

    for (const [days, regs] of expiringSoonByDays) {
      const title = days === 1 ? '⚠️ MOT Expiring Tomorrow' : '📅 MOT Expiring Soon'
      const dayText = days === 1 ? 'tomorrow' : `in ${days} days`
      notified += await notifyOrgUsers(admin, organizationId, {
        type: 'mot_expiring',
        title,
        message: `${regs.length} vehicle${regs.length > 1 ? 's have' : ' has'} MOT expiring ${dayText}: ${list(regs)}`,
        priority: 'medium',
        data: { count: regs.length, vehicles: regs.join(','), daysRemaining: days },
      })
    }
  }

  return { job: 'mot_expirations', orgs: (orgs ?? []).length, notificationsWritten: notified }
}

// ── job: today's services (Firebase checkTodaysServices) ─────────────────────
async function runTodaysServices(admin: Admin): Promise<Record<string, unknown>> {
  const { data: orgs } = await admin.from('organizations').select('id')
  const today = getTodayString()
  let notified = 0

  for (const org of orgs ?? []) {
    const organizationId = (org as any).id as string

    // Both 'scheduled' and 'checked_in_to_garage' are still pending for today.
    const { data: bookings } = await admin
      .from('service_bookings')
      .select('id, registration, time_slot')
      .eq('organization_id', organizationId)
      .eq('date', today)
      .in('status', ['scheduled', 'checked_in_to_garage'])

    const todays = bookings ?? []
    if (todays.length === 0) continue

    const servicesList = todays
      .slice(0, 3)
      .map((s: any) => `${s.registration} at ${s.time_slot ?? ''}`)
      .join(', ')
    const moreText = todays.length > 3 ? ` +${todays.length - 3} more` : ''

    notified += await notifyOrgUsers(admin, organizationId, {
      type: 'service_today',
      title: '🔧 Services Scheduled Today',
      message: `${todays.length} service${todays.length > 1 ? 's' : ''} scheduled: ${servicesList}${moreText}`,
      priority: 'medium',
      data: { count: todays.length, bookings: todays.map((s: any) => s.id).join(',') },
    })
  }

  return { job: 'todays_services', orgs: (orgs ?? []).length, notificationsWritten: notified }
}

// ── job: note reminders (Firebase checkNoteReminders) ────────────────────────
async function runNoteReminders(admin: Admin): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString()

  // Due, unsent notes (mirrors the two-field Firestore query).
  const { data: notes } = await admin
    .from('user_notes')
    .select('id, user_id, organization_id, text, priority, scheduled_time, done, notification_sent')
    .lte('scheduled_notification_at', nowIso)
    .eq('notification_sent', false)
    .limit(50)

  let sent = 0
  for (const n of notes ?? []) {
    const note = n as any

    // Skip done notes — burn so they never fire (matches Firestore behaviour).
    if (note.done === true) {
      await admin.from('user_notes').update({ notification_sent: true }).eq('id', note.id)
      continue
    }

    // Respect the owner's notification preference.
    const { data: profile } = await admin
      .from('profiles')
      .select('notifications_enabled, fcm_token')
      .eq('id', note.user_id)
      .maybeSingle()
    if (profile?.notifications_enabled === false) {
      await admin.from('user_notes').update({ notification_sent: true }).eq('id', note.id)
      continue
    }

    const noteText = note.text || 'You have a reminder'
    const priority = note.priority || 'medium'
    const priorityEmoji = priority === 'urgent' ? '🚨' : priority === 'medium' ? '⏰' : '📋'
    const title = `${priorityEmoji} Note Reminder`
    const message = note.scheduled_time ? `${noteText} — scheduled at ${note.scheduled_time}` : noteText

    const { error } = await admin.from('user_notifications').insert({
      organization_id: note.organization_id,
      user_id: note.user_id,
      type: 'note_reminder',
      title,
      message,
      // user_notes.priority is low|medium|urgent; user_notifications wants
      // high|medium|low → map 'urgent' to 'high'.
      priority: priority === 'urgent' ? 'high' : priority === 'low' ? 'low' : 'medium',
      data: { noteId: note.id },
    })

    if (!error) {
      await admin.from('user_notes').update({ notification_sent: true }).eq('id', note.id)
      sent++

      // Personal native push to the note's owner (best-effort).
      if (profile?.fcm_token) {
        const r = await sendFcm(profile.fcm_token, title, message, {
          type: 'note_reminder',
          noteId: String(note.id),
        })
        if (r.invalidToken) {
          await admin.from('profiles').update({ fcm_token: null }).eq('id', note.user_id)
        }
      }
    }
  }

  return { job: 'note_reminders', due: (notes ?? []).length, notificationsWritten: sent }
}

// ── job: daily 6AM email report ──────────────────────────────────────────────
// Sends each org's configured recipients (organization_settings.
// daily_report_emails, editable by owner/admin/garage-manager in Settings) a
// morning digest via Resend: today's external-garage bookings, expired MOT,
// expired road tax, MOT/tax expiring within 14 days, and external bookings in
// the next 5 days.
//
// TIMEZONE: pg_cron runs in UTC and the UK flips GMT/BST, so the cron fires at
// BOTH 05:00 and 06:00 UTC and this job only sends when it's actually 6AM in
// London — exactly one of the two runs matches, year-round. Pass {force:true}
// to bypass the hour gate for manual testing.

function londonHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(new Date()),
    10,
  )
}
function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()) // YYYY-MM-DD
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const euDate = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')

/** Render one report section as an inline-styled HTML table (email-safe). */
function htmlTable(title: string, headers: string[], rows: string[][], emptyText: string): string {
  const th = headers.map(h =>
    `<th style="text-align:left;padding:8px 10px;background:#012619;color:#b3f243;font-size:12px;letter-spacing:.04em;">${h}</th>`
  ).join('')
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}" style="padding:10px;color:#6b7a70;font-size:13px;">${emptyText}</td></tr>`
    : rows.map((r, i) =>
        `<tr style="background:${i % 2 ? '#f4f8f6' : '#ffffff'};">${r.map(c =>
          `<td style="padding:7px 10px;border-bottom:1px solid #e2e8e5;font-size:13px;color:#1a2c24;">${c}</td>`
        ).join('')}</tr>`
      ).join('')
  return `
    <h3 style="margin:22px 0 8px;font-size:15px;color:#012619;">${title}</h3>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8e5;border-radius:6px;">
      <thead><tr>${th}</tr></thead><tbody>${body}</tbody>
    </table>`
}

async function runDailyReport(admin: Admin, force = false): Promise<Record<string, unknown>> {
  if (!force && londonHour() !== 6) {
    return { job: 'daily_report', skipped: true, reason: `London hour is ${londonHour()}, not 6` }
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return { job: 'daily_report', error: 'RESEND_API_KEY not configured' }

  const today = londonToday()
  const in5 = addDaysIso(today, 5)
  const { data: orgs } = await admin.from('organizations').select('id, name')
  let emailsSent = 0
  const results: Record<string, unknown>[] = []

  for (const org of orgs ?? []) {
    const orgId = (org as any).id as string
    const orgName = (org as any).name as string

    // Recipients — configured in Settings; skip orgs with none.
    const { data: settings } = await admin
      .from('organization_settings')
      .select('daily_report_emails')
      .eq('organization_id', orgId)
      .maybeSingle()
    // Entries are strings (legacy) or { email, externalBookings } objects.
    // The toggle only affects the instant external-booking alerts — everyone on
    // the list still gets this daily report.
    const entries = Array.isArray((settings as any)?.daily_report_emails)
      ? ((settings as any).daily_report_emails as any[])
      : []
    const emails: string[] = entries
      .map((e) => (typeof e === 'string' ? e : e?.email))
      .filter((e) => typeof e === 'string' && e.includes('@'))
    if (emails.length === 0) continue

    // ── Garage bookings: external today, INTERNAL today, external next 5 days ──
    const { data: allBookings } = await admin
      .from('service_bookings')
      .select('registration, date, time_slot, status, is_external_provider, external_provider')
      .eq('organization_id', orgId)
      .gte('date', today)
      .lte('date', in5)
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
    const garageOf = (b: any) =>
      (b.external_provider && (b.external_provider.garageName || b.external_provider.address)) || 'External garage'
    const isExt = (b: any) => b.is_external_provider === true
    // External bookings store the literal 'EXTERNAL' in time_slot; the real
    // typed time lives in external_provider.customTime — show exactly that.
    const timeOf = (b: any) => {
      const raw = b?.external_provider?.customTime || b?.time_slot || ''
      return String(raw).toUpperCase() === 'EXTERNAL' ? '—' : (String(raw) || '—')
    }
    const todaysExt = (allBookings ?? []).filter((b: any) => isExt(b) && String(b.date).slice(0, 10) === today)
    const todaysInt = (allBookings ?? []).filter((b: any) => !isExt(b) && String(b.date).slice(0, 10) === today)
    const upcomingExt = (allBookings ?? []).filter((b: any) => isExt(b) && String(b.date).slice(0, 10) > today)

    // ── 2/3/4. MOT + tax: expired and expiring within 14 days ───────────
    const { data: vehicles } = await admin
      .from('vehicles')
      .select('id, registration, make, model, contract, insurance_status, mot_expiry, tax_expiry, current_status, is_defleeted')
      .eq('organization_id', orgId)
      .eq('is_defleeted', false)
    const active = (vehicles ?? []).filter((v: any) => !v.current_status || ACTIVE_STATUSES.has(v.current_status))
    // reg → contract map so the booking tables can show the contract too
    // (check-in strips reg whitespace, so match on a normalised reg).
    const normRegKey = (r: unknown) => String(r ?? '').toUpperCase().replace(/\s+/g, '')
    const contractByReg = new Map<string, string>()
    for (const v of vehicles ?? []) {
      if ((v as any).contract) contractByReg.set(normRegKey((v as any).registration), (v as any).contract)
    }
    const contractOf = (reg: unknown) => contractByReg.get(normRegKey(reg)) || '—'
    const daysTo = (iso: string) =>
      Math.ceil((new Date(String(iso).slice(0, 10) + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86_400_000)

    // ── Not insured & not checked into any yard ─────────────────────────
    // Same rule as the Fleet page chip: uninsured active-fleet vehicles with no
    // 'In Yard' checked_in row (matched by vehicle_id, then normalised reg —
    // check-in strips reg whitespace). Hire rows tell us if it's out on hire.
    const { data: yardRows } = await admin
      .from('checked_in_vehicles')
      .select('vehicle_id, registration, make, model, hire_status, transfer_status, external_garage_id, external_garage_name, checked_out_to_garage_at')
      .eq('organization_id', orgId)
    // Garage phone numbers (optional, Settings → External Garages) — matched by
    // id first, then by name for older rows without the id link.
    const { data: garages } = await admin
      .from('external_garages')
      .select('id, name, phone')
      .eq('organization_id', orgId)
    const garagePhoneById = new Map<string, string>()
    const garagePhoneByName = new Map<string, string>()
    for (const g of garages ?? []) {
      const gg = g as any
      if (gg.phone) {
        garagePhoneById.set(gg.id, gg.phone)
        garagePhoneByName.set(String(gg.name || '').trim().toLowerCase(), gg.phone)
      }
    }
    const garagePhoneOf = (y: any) =>
      (y.external_garage_id && garagePhoneById.get(y.external_garage_id)) ||
      garagePhoneByName.get(String(y.external_garage_name || '').trim().toLowerCase()) || '—'
    const inYardKeys = new Set<string>()
    const onHireKeys = new Set<string>()
    for (const y of yardRows ?? []) {
      const yy = y as any
      const keys = [yy.vehicle_id ? 'id:' + yy.vehicle_id : '', 'reg:' + normRegKey(yy.registration)].filter(Boolean)
      const target = yy.hire_status === 'In Yard' ? inYardKeys : yy.hire_status === 'Out on Hire' ? onHireKeys : null
      if (target) for (const k of keys) target.add(k)
    }
    const hasKey = (set: Set<string>, v: any) => set.has('id:' + v.id) || set.has('reg:' + normRegKey(v.registration))

    // ── Vehicles currently checked out at external garages ──────────────
    // Same rule as the app's downtime view: at_external_garage transfer status
    // OR a checked-out-to-garage timestamp still set on the yard row.
    const atExternalGarage = (yardRows ?? [])
      .filter((y: any) => y.transfer_status === 'at_external_garage' || y.checked_out_to_garage_at)
      .map((y: any) => {
        const sinceIso = y.checked_out_to_garage_at ? String(y.checked_out_to_garage_at).slice(0, 10) : null
        const days = sinceIso
          ? Math.max(0, Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(sinceIso + 'T00:00:00Z').getTime()) / 86_400_000))
          : null
        return { ...y, sinceIso, days }
      })
      .sort((a: any, b: any) => (b.days ?? -1) - (a.days ?? -1))
    const uninsuredNotInYard = active
      .filter((v: any) => v.insurance_status !== 'Insured' && !hasKey(inYardKeys, v))
      .map((v: any) => ({ ...v, where: hasKey(onHireKeys, v) ? 'Out on hire' : 'Not checked in' }))
      .sort((a: any, b: any) => String(a.registration).localeCompare(String(b.registration)))

    const motExpired = active.filter((v: any) => v.mot_expiry && daysTo(v.mot_expiry) < 0)
      .sort((a: any, b: any) => String(a.mot_expiry).localeCompare(String(b.mot_expiry)))
    const taxExpired = active.filter((v: any) => v.tax_expiry && daysTo(v.tax_expiry) < 0)
      .sort((a: any, b: any) => String(a.tax_expiry).localeCompare(String(b.tax_expiry)))
    const expiringSoon: { v: any; type: 'MOT' | 'Road Tax'; expiry: string; days: number }[] = []
    for (const v of active) {
      if (v.mot_expiry) { const d = daysTo(v.mot_expiry); if (d >= 0 && d <= 14) expiringSoon.push({ v, type: 'MOT', expiry: v.mot_expiry, days: d }) }
      if (v.tax_expiry) { const d = daysTo(v.tax_expiry); if (d >= 0 && d <= 14) expiringSoon.push({ v, type: 'Road Tax', expiry: v.tax_expiry, days: d }) }
    }
    expiringSoon.sort((a, b) => a.days - b.days)

    // ── Compose the email ───────────────────────────────────────────────
    const mm = (v: any) => [v.make, v.model].filter(Boolean).join(' ') || '—'
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:0 auto;padding:16px;">
        <div style="background:#012619;border-radius:10px;padding:18px 20px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">Yardao</span>
          <span style="color:#b3f243;font-size:14px;margin-left:10px;">Daily Report — ${euDate(today)} · ${orgName}</span>
        </div>
        ${htmlTable('🔧 External garage bookings today', ['Reg', 'Contract', 'Garage', 'Time', 'Status'],
          todaysExt.map((b: any) => [b.registration ?? '—', contractOf(b.registration), garageOf(b), timeOf(b), b.status ?? '—']),
          'No external garage bookings today 🎉')}
        ${htmlTable('🔧 Internal garage bookings today', ['Reg', 'Contract', 'Time', 'Status'],
          todaysInt.map((b: any) => [b.registration ?? '—', contractOf(b.registration), timeOf(b), b.status ?? '—']),
          'No internal garage bookings today 🎉')}
        ${htmlTable('🗓️ Upcoming external garage bookings (next 5 days)', ['Date', 'Reg', 'Contract', 'Garage', 'Time', 'Status'],
          upcomingExt.map((b: any) => [euDate(b.date), b.registration ?? '—', contractOf(b.registration), garageOf(b), timeOf(b), b.status ?? '—']),
          'No upcoming external bookings in the next 5 days')}
        ${htmlTable('🏭 Vehicles checked out at external garages', ['Reg', 'Vehicle', 'Contract', 'Garage', 'Since', 'Days there', 'Phone'],
          atExternalGarage.map((y: any) => [
            y.registration ?? '—',
            [y.make, y.model].filter(Boolean).join(' ') || '—',
            contractOf(y.registration),
            y.external_garage_name || 'External garage',
            euDate(y.sinceIso),
            y.days === null ? '—' : String(y.days),
            garagePhoneOf(y),
          ]),
          'No vehicles at external garages 🎉')}
        ${htmlTable('🚨 MOT expired', ['Reg', 'Vehicle', 'Contract', 'MOT expired', 'Days overdue'],
          motExpired.map((v: any) => [v.registration, mm(v), v.contract || '—', euDate(v.mot_expiry), String(-daysTo(v.mot_expiry))]),
          'No expired MOTs 🎉')}
        ${htmlTable('🚨 Road tax expired', ['Reg', 'Vehicle', 'Contract', 'Tax expired', 'Days overdue'],
          taxExpired.map((v: any) => [v.registration, mm(v), v.contract || '—', euDate(v.tax_expiry), String(-daysTo(v.tax_expiry))]),
          'No expired road tax 🎉')}
        ${htmlTable('🛡️ Not insured & not in any yard', ['Reg', 'Vehicle', 'Contract', 'Where'],
          uninsuredNotInYard.map((v: any) => [v.registration, mm(v), v.contract || '—', v.where]),
          'None — every uninsured vehicle is safely in a yard 🎉')}
        ${htmlTable('📅 MOT / tax expiring in the next 14 days', ['Reg', 'Vehicle', 'Contract', 'Type', 'Expires', 'Days left'],
          expiringSoon.map(e => [e.v.registration, mm(e.v), e.v.contract || '—', e.type, euDate(e.expiry), String(e.days)]),
          'Nothing expiring in the next 14 days 🎉')}
        <p style="color:#8a9e94;font-size:11px;margin-top:20px;">
          Sent automatically at 6AM by Yardao. Recipients are managed in Settings → Daily report.
        </p>
      </div>`

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Yardao <noreply@yardao.com>',
        to: emails,
        subject: `Yardao Daily Report — ${euDate(today)} · ${orgName}`,
        html,
      }),
    })
    const ok = resp.ok
    if (ok) emailsSent++
    else console.error('daily_report Resend error:', resp.status, (await resp.text()).slice(0, 300))
    results.push({
      org: orgName, recipients: emails.length, sent: ok,
      todaysExt: todaysExt.length, todaysInt: todaysInt.length, upcomingExt: upcomingExt.length,
      atExternalGarage: atExternalGarage.length,
      motExpired: motExpired.length, taxExpired: taxExpired.length,
      uninsuredNotInYard: uninsuredNotInYard.length, expiringSoon: expiringSoon.length,
    })
  }

  return { job: 'daily_report', date: today, emailsSent, orgs: results }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    // Only the service-role bearer (passed by pg_cron) may run these jobs.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!isServiceRole(token, serviceKey)) {
      return json({ error: 'Forbidden.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const jobName = (body?.job as string) ?? ''

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    switch (jobName) {
      case 'mot_expirations':
        return json(await runMotExpirations(admin))
      case 'todays_services':
        return json(await runTodaysServices(admin))
      case 'note_reminders':
        return json(await runNoteReminders(admin))
      case 'daily_report':
        return json(await runDailyReport(admin, body?.force === true))
      default:
        return json({ error: `Unknown job '${jobName}'. Expected mot_expirations | todays_services | note_reminders | daily_report.` }, 400)
    }
  } catch (e) {
    console.error('scheduledNotifications failed:', e)
    return json({ error: e instanceof Error ? e.message : 'Scheduled job failed.' }, 500)
  }
})
