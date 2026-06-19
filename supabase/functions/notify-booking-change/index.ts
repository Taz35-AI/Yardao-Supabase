// supabase/functions/notify-booking-change/index.ts
// Event-driven service-booking notifications. Fired by a Supabase DATABASE
// WEBHOOK on public.service_bookings (Insert / Update / Delete). Composes a
// human message — created / updated / completed / cancelled / removed — and
// fans it out to the org's users as an in-app user_notifications row AND a
// native FCM push (best-effort; same path the scheduled jobs use).
//
// Webhook setup (Supabase dashboard → Database → Webhooks → Create):
//   • Table:   public.service_bookings
//   • Events:  Insert, Update, Delete
//   • Type:    HTTP Request → POST
//   • URL:     https://<PROJECT-REF>.supabase.co/functions/v1/notify-booking-change
//   • HTTP Headers: Authorization = Bearer <SERVICE_ROLE_KEY>
//
// Auth: we only act when that bearer matches SUPABASE_SERVICE_ROLE_KEY, so the
// endpoint can't be driven by ordinary users.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'
import { sendFcm } from '../_shared/fcm.ts'

type Admin = ReturnType<typeof createClient>

// Accept the caller if the bearer is the service_role key (exact match) OR any
// Supabase-issued service_role JWT. The Edge gateway verifies the JWT signature
// before this function runs, so trusting the decoded `role` is safe — and it
// tolerates the webhook's service_role token string differing from the
// function's SUPABASE_SERVICE_ROLE_KEY (legacy-vs-new key formats).
function isServiceRole(token: string, serviceKey: string): boolean {
  if (!token) return false
  if (serviceKey && token === serviceKey) return true
  try {
    let p = token.split('.')[1]
    if (!p) return false
    p = p.replace(/-/g, '+').replace(/_/g, '/')
    while (p.length % 4) p += '='
    const payload = JSON.parse(atob(p))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

function toFcmData(type: string, data?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { type }
  for (const [k, v] of Object.entries(data ?? {})) out[k] = String(v)
  return out
}

// Fan a notification out to every active, notifications-enabled user in an org:
// one in-app row each + a native FCM push to each registered device. Mirrors
// scheduledNotifications.notifyOrgUsers so behaviour is identical.
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

function whenText(b: any): string {
  const date = b?.date ? ` on ${b.date}` : ''
  const time = b?.time_slot ? ` at ${b.time_slot}` : ''
  return `${date}${time}`
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!isServiceRole(token, serviceKey)) {
      console.warn('notify-booking-change: 403 — bearer is not a service_role token')
      return json({ error: 'Forbidden.' }, 403)
    }

    // Supabase webhook payload: { type:'INSERT'|'UPDATE'|'DELETE', record, old_record, table, schema }
    const body = await req.json().catch(() => ({}))
    const event = String(body?.type ?? '')
    console.log('notify-booking-change: received event', event, 'table', String(body?.table ?? ''))
    const rec = body?.record ?? {}
    const old = body?.old_record ?? {}
    const b = event === 'DELETE' ? old : rec

    const organizationId = b?.organization_id
    if (!organizationId) {
      console.warn('notify-booking-change: skipped — no organization_id on payload', JSON.stringify(body).slice(0, 300))
      return json({ ok: true, skipped: 'no organization_id' })
    }

    const reg = b?.registration || 'A vehicle'
    const when = whenText(b)
    const data = { bookingId: String(b?.id ?? ''), registration: String(reg) }
    const T = 'service_booking' // matches the app's notification tap router

    let payload:
      | { type: string; title: string; message: string; priority: 'high' | 'medium' | 'low'; data?: Record<string, unknown> }
      | null = null

    if (event === 'INSERT') {
      payload = { type: T, title: '🗓️ New Service Booking', message: `${reg} booked for service${when}`, priority: 'medium', data }
    } else if (event === 'DELETE') {
      payload = { type: T, title: '🗑️ Booking Removed', message: `${reg}'s service booking was removed`, priority: 'medium', data }
    } else if (event === 'UPDATE') {
      const statusChanged = rec?.status !== old?.status
      if (statusChanged && rec?.status === 'completed') {
        payload = { type: T, title: '✅ Service Completed', message: `${reg}'s service is complete`, priority: 'medium', data }
      } else if (statusChanged && rec?.status === 'cancelled') {
        payload = { type: T, title: '🚫 Booking Cancelled', message: `${reg}'s service booking was cancelled`, priority: 'medium', data }
      } else if (Number(rec?.slot_count) !== Number(old?.slot_count)) {
        const n = Number(rec?.slot_count) || 1
        payload = { type: T, title: '🕒 Booking Length Changed', message: `${reg}'s service is now ${n} slot${n === 1 ? '' : 's'}${when}`, priority: 'low', data }
      } else {
        // Only notify when something meaningful changed — ignore updated_at-only
        // touches and bookkeeping fields so the feed isn't spammy.
        const keys = [
          'date', 'time_slot', 'status', 'registration', 'work_required',
          'assigned_mechanic_id', 'assigned_mechanic_name', 'service_bay',
          'is_external_provider', 'external_provider', 'notes',
        ]
        const changed = keys.some((k) => JSON.stringify(rec?.[k]) !== JSON.stringify(old?.[k]))
        if (changed) {
          payload = { type: T, title: '✏️ Booking Updated', message: `${reg}'s service booking was updated${when}`, priority: 'low', data }
        }
      }
    }

    if (!payload) {
      console.log('notify-booking-change: skipped — no meaningful change for', event)
      return json({ ok: true, skipped: 'no meaningful change' })
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const notified = await notifyOrgUsers(admin, organizationId, payload)
    console.log(`notify-booking-change: ${event} for ${reg} → notified ${notified} user(s)`)
    return json({ ok: true, event, notified })
  } catch (e) {
    console.error('notify-booking-change failed:', e)
    return json({ error: e instanceof Error ? e.message : 'notify-booking-change failed' }, 400)
  }
})
