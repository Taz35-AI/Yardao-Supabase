// supabase/functions/admin-create-user/index.ts
// Privileged user-creation endpoint.
//
// Why this exists: Supabase cannot create auth users from the browser without
// the service-role key (and we never ship that key to the client). The old
// Firebase app used a "secondary app" trick to create a user without logging
// the current admin out. The Supabase equivalent is this Edge Function: it runs
// with the service-role key, so `auth.admin.createUser` creates the new account
// without touching the calling admin's session.
//
// Client contract (unchanged):
//   supabase.functions.invoke('admin-create-user', { body: {
//     email, displayName, temporaryPassword, organizationId, organizationName, createdBy
//   }})
//   then reads `data.uid ?? data.id ?? data.user.id`.
//
// Env (auto-injected into every Edge Function — no manual secret needed):
//   SUPABASE_URL              — project URL
//   SUPABASE_SERVICE_ROLE_KEY — service-role key (full admin, bypasses RLS)
//   SUPABASE_ANON_KEY         — anon key (used only to verify the caller's JWT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // ── 1. Verify the CALLER is an authenticated admin ────────────────────────
    // Read the caller's JWT from the Authorization header and resolve it with an
    // anon-key client scoped to that token. This identifies WHO is calling
    // without granting them any extra privileges.
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

    // ── 2. Admin client (service role) — full access, bypasses RLS ─────────────
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Confirm the caller's profile is an admin and capture their organization.
    // Read with the service-role client so RLS can't hide the row.
    const { data: callerProfile, error: profileErr } = await admin
      .from('profiles')
      .select('role, organization_id, organization_name')
      .eq('id', callerAuth.user.id)
      .maybeSingle()

    if (profileErr) {
      return json({ error: profileErr.message }, 500)
    }
    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: 'Forbidden: admin role required.' }, 403)
    }

    // ── 3. Validate input ─────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const {
      email,
      displayName,
      temporaryPassword,
      organizationName,
      createdBy,
    } = body ?? {}

    // The new user always belongs to the CALLER's organization (server-derived,
    // never trusted from the client body).
    const organizationId = callerProfile.organization_id

    if (!email || !temporaryPassword) {
      return json({ error: 'email and temporaryPassword are required.' }, 400)
    }
    if (!organizationId) {
      return json({ error: 'Caller has no organization.' }, 400)
    }

    // ── 4. Create the auth user (service role) ────────────────────────────────
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true, // pre-confirm so the temp password works immediately
      user_metadata: { displayName },
    })

    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? 'Failed to create user.' }, 400)
    }

    const newUser = created.user

    // ── 5. Upsert the profiles row for the new user ───────────────────────────
    // Column names match public.profiles (snake_case). PK is `id` = auth user id.
    const { error: upsertErr } = await admin.from('profiles').upsert({
      id: newUser.id,
      organization_id: organizationId,
      organization_name: organizationName ?? callerProfile.organization_name ?? '',
      display_name: displayName ?? '',
      email,
      role: 'member',
      requires_password_reset: true,
      created_by: createdBy ?? callerAuth.user.id,
      is_active: true,
      is_deleted: false,
    })

    if (upsertErr) {
      // Roll back the orphaned auth user so a retry can reuse the email.
      await admin.auth.admin.deleteUser(newUser.id).catch(() => {})
      return json({ error: upsertErr.message }, 500)
    }

    // Client reads `uid ?? id ?? user.id`.
    return json({ uid: newUser.id })
  } catch (e) {
    console.error('admin-create-user failed:', e)
    return json(
      { error: e instanceof Error ? e.message : 'admin-create-user failed.' },
      400,
    )
  }
})
