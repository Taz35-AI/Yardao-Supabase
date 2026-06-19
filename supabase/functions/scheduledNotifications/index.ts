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

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    // Only the service-role bearer (passed by pg_cron) may run these jobs.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token || token !== serviceKey) {
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
      default:
        return json({ error: `Unknown job '${jobName}'. Expected mot_expirations | todays_services | note_reminders.` }, 400)
    }
  } catch (e) {
    console.error('scheduledNotifications failed:', e)
    return json({ error: e instanceof Error ? e.message : 'Scheduled job failed.' }, 500)
  }
})
