// supabase/functions/admin-delete-user/index.ts
// Privileged user-DELETION endpoint — the counterpart to admin-create-user.
//
// Why this exists: the browser can't delete a Supabase Auth user (needs the
// service-role key). A plain profile "soft delete" leaves the Auth account in
// place, so its email stays registered and can't be reused. This function runs
// with the service role: it removes the Auth user (freeing the email) AND the
// profile row, after verifying the caller is an admin of the SAME organization.
//
// Client contract:
//   supabase.functions.invoke('admin-delete-user', { body: { userId } })
//
// Env (auto-injected):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // ── 1. Identify the caller from their JWT ─────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header.' }, 401)
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerAuth?.user) {
      return json({ error: 'Invalid or expired session.' }, 401)
    }

    // ── 2. Service-role client + confirm caller is an admin ───────────────────
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerProfile, error: profileErr } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerAuth.user.id)
      .maybeSingle()
    if (profileErr) return json({ error: profileErr.message }, 500)
    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: 'Forbidden: admin role required.' }, 403)
    }

    // ── 3. Validate input + load the target ───────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const userId: string | undefined = body?.userId
    if (!userId) return json({ error: 'userId is required.' }, 400)
    if (userId === callerAuth.user.id) {
      return json({ error: 'You cannot delete your own account.' }, 400)
    }

    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', userId)
      .maybeSingle()
    if (targetErr) return json({ error: targetErr.message }, 500)

    // Guardrails: same org only, and never delete an admin.
    if (target) {
      if (target.organization_id !== callerProfile.organization_id) {
        return json({ error: 'Forbidden: user is in another organization.' }, 403)
      }
      if (target.role === 'admin') {
        return json({ error: 'Admins cannot be deleted.' }, 403)
      }
    }

    // ── 4. Delete the Auth user (this frees the email) ────────────────────────
    const { error: authDelErr } = await admin.auth.admin.deleteUser(userId)
    // "User not found" is fine — the Auth account was already gone; continue so
    // we still clean up any lingering profile row.
    if (authDelErr && !/not found/i.test(authDelErr.message)) {
      return json({ error: authDelErr.message }, 400)
    }

    // ── 5. Remove the profile row (hard). If a FK from other tables blocks the
    //       delete, fall back to a soft-delete so we never leave a half-state —
    //       the email is already freed by the Auth deletion above. ────────────
    const { error: profDelErr } = await admin
      .from('profiles')
      .delete()
      .eq('id', userId)
    if (profDelErr) {
      await admin
        .from('profiles')
        .update({ is_active: false, is_deleted: true })
        .eq('id', userId)
        .then(() => {}, () => {})
      return json({ ok: true, profileHardDeleted: false })
    }

    return json({ ok: true, profileHardDeleted: true })
  } catch (e) {
    console.error('admin-delete-user failed:', e)
    return json(
      { error: e instanceof Error ? e.message : 'admin-delete-user failed.' },
      400,
    )
  }
})
