// supabase/functions/delete-account/index.ts
// Self-service account deletion (App Store Guideline 5.1.1(v)).
//
// The browser/Capacitor webview can't delete a Supabase Auth user (needs the
// service-role key), so this privileged function does it — but ONLY for the
// caller themselves. The target is always derived from the verified JWT; there
// is no userId parameter, so a user can never delete anyone but themselves.
//
// Scope depends on the caller's role:
//   • admin (org owner) → deletes the ENTIRE organisation: every member's Auth
//     account + all org-scoped business data (cascades from organizations).
//   • member / mechanic → deletes only their own account + personal data.
//
// Client contract:
//   supabase.functions.invoke('delete-account')   // no body; identity from JWT
//
// Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // ── 1. Identify the caller from their JWT (this IS the account to delete) ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerAuth?.user) {
      return json({ error: 'Invalid or expired session.' }, 401)
    }
    const callerId = callerAuth.user.id

    // ── 2. Service-role client + load the caller's role/org ───────────────────
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .maybeSingle()
    if (profileErr) return json({ error: profileErr.message }, 500)

    const isOwner = profile?.role === 'admin'
    const orgId = profile?.organization_id ?? null

    // ── 3a. OWNER → delete the entire organisation ────────────────────────────
    if (isOwner && orgId) {
      // Delete every member's Auth user. profiles.id → auth.users ON DELETE
      // CASCADE, so each profile row goes with it. "not found" is fine.
      const { data: members } = await admin
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
      for (const m of members ?? []) {
        const { error } = await admin.auth.admin.deleteUser((m as any).id)
        if (error && !/not found/i.test(error.message)) {
          console.error('delete-account: member auth delete failed', (m as any).id, error.message)
        }
      }

      // Delete the organisation row → cascades all org-scoped business data
      // (vehicles, checked_in_vehicles, service_bookings, stock_parts,
      // invoices, mileage_readings, settings, branches, …).
      const { error: orgErr } = await admin.from('organizations').delete().eq('id', orgId)
      if (orgErr) return json({ error: orgErr.message }, 400)

      // Belt-and-braces: make sure the caller's own Auth user is gone.
      await admin.auth.admin.deleteUser(callerId).then(() => {}, () => {})

      return json({ ok: true, scope: 'organization' })
    }

    // ── 3b. MEMBER → delete only the caller ───────────────────────────────────
    const { error: authDelErr } = await admin.auth.admin.deleteUser(callerId)
    if (authDelErr && !/not found/i.test(authDelErr.message)) {
      return json({ error: authDelErr.message }, 400)
    }
    // Profile cascades via the FK; best-effort cleanup in case it lingered.
    await admin.from('profiles').delete().eq('id', callerId).then(() => {}, () => {})

    return json({ ok: true, scope: 'account' })
  } catch (e) {
    console.error('delete-account failed:', e)
    return json({ error: e instanceof Error ? e.message : 'delete-account failed.' }, 400)
  }
})
