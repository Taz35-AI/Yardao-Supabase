// src/lib/orgSetup.ts
// Finishes the deferred organisation setup for a user who signed up while email
// confirmation was ON (so signUp returned no session and the org couldn't be
// created yet). Called on first authenticated login. Idempotent and safe to
// call on every login — it no-ops unless there's a pending org to create.

import { supabase } from '@/lib/supabaseClient'
import { organizationService } from '@/lib/firestore'
import { logger } from '@/lib/logger'

/**
 * @returns true if it created the organisation this call, false otherwise.
 * Throws if creation fails (caller should surface a retryable error).
 *
 * Concurrency-safe: the login/register pages AND AuthContext both call this on
 * sign-in. Without a guard, two concurrent callers could each pass the
 * "no organization yet" check and create TWO organizations. We dedupe by
 * sharing a single in-flight promise so only one run ever executes at a time.
 */
let inFlight: Promise<boolean> | null = null
export function completePendingOrgSetup(): Promise<boolean> {
  if (inFlight) return inFlight
  inFlight = runCompletePendingOrgSetup().finally(() => { inFlight = null })
  return inFlight
}

async function runCompletePendingOrgSetup(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const meta = (user.user_metadata || {}) as Record<string, any>
  const pendingOrg = typeof meta.pending_org_name === 'string' ? meta.pending_org_name.trim() : ''
  const pendingName = typeof meta.pending_display_name === 'string' ? meta.pending_display_name.trim() : ''
  if (!pendingOrg) return false // nothing pending → ordinary login

  // If the org was already created (e.g. a previous login finished setup), just
  // clear the flags so we don't try again.
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.organization_id) {
    await supabase.auth.updateUser({ data: { pending_org_name: null, pending_display_name: null } }).catch(() => {})
    return false
  }

  logger.log('🏢 Finishing deferred org setup for', user.email)
  if (pendingName) {
    await supabase.auth.updateUser({ data: { displayName: pendingName } })
  }

  // create_organization RPC (SECURITY DEFINER) creates the org, sets this
  // profile's organization_id + name + role=admin, seeds conditions, and the
  // Main Branch — then refreshes the session so the org_id JWT claim is present.
  await organizationService.createOrganization({
    name: pendingOrg,
    description: `${pendingOrg} fleet management`,
  } as any)

  if (pendingName) {
    await supabase.from('profiles').update({ display_name: pendingName }).eq('id', user.id)
  }

  // Clear the pending flags now that setup is done.
  await supabase.auth.updateUser({ data: { pending_org_name: null, pending_display_name: null } }).catch(() => {})
  return true
}
