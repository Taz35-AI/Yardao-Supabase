// src/hooks/useYardLayout.ts
// React hook for loading and saving the yard layout for a single branch.
//
// PHASE 2 UPDATE: Now uses onSnapshot for LIVE updates so the dashboard
// reflects layout changes from other tabs/users in real time.
// This costs slightly more in Firestore reads but gives a much better
// multi-user experience.
//
// PHASE 2 FIX: When `branchId === 'main'` (Yardao's sentinel value meaning
// "the user's default branch"), this hook resolves it to the real branch
// document id BEFORE querying yardLayouts. That way the dashboard which
// always passes 'main' for the home branch correctly finds the layout the
// user designed via Settings → Branches → Fairview Bray (or whatever their
// real main branch is called).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { wireResyncTriggers, onReconnectRefetch } from '@/lib/realtime/resync'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { yardLayoutService } from '@/lib/services/yardLayoutService'
import { YardLayout } from '@/types/yardLayout'
import { logger } from '@/lib/logger'

interface UseYardLayoutResult {
  layout: YardLayout | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveLayout: (next: Pick<YardLayout, 'spaces' | 'blocks'>) => Promise<void>
  /** The actual Firestore branch id this layout is bound to (after resolving 'main') */
  resolvedBranchId: string | null
}

export function useYardLayout(branchId: string | null): UseYardLayoutResult {
  const { user } = useAuth()
  const [layout, setLayout] = useState<YardLayout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('')
  // The real branch doc id we end up using (e.g. resolved from 'main')
  const [resolvedBranchId, setResolvedBranchId] = useState<string | null>(null)

  // ── Load org id once user is available ─────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false

    const loadProfile = async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (cancelled) return
        if (profile?.organizationId) {
          setOrganizationId(profile.organizationId)
          setUserDisplayName(profile.displayName || user.email || 'Unknown User')
        }
      } catch (err) {
        if (cancelled) return
        logger.error('❌ Failed to load user profile in useYardLayout:', err)
      }
    }
    loadProfile()

    return () => { cancelled = true }
  }, [user?.uid, user?.email])

  // ── Resolve 'main' sentinel to the real branch document id ────────────
  // Yardao's dashboard passes branchId='main' to mean "the user's default
  // branch". The yardLayouts collection is keyed by REAL Firestore branch
  // ids though, so we need to look up the user's main branch first.
  useEffect(() => {
    if (!branchId || !organizationId) {
      setResolvedBranchId(null)
      return
    }

    // If branchId is anything other than the literal 'main' sentinel,
    // it could be EITHER a real Firestore doc id (when called from
    // Settings → BranchManagement) OR a slug like 'fairview-barking'
    // (when called from the dashboard URL ?branch=... param).
    // Try slug lookup first; fall back to treating it as a doc id.
    if (branchId !== 'main') {
      let cancelled = false
      const resolveSlugOrId = async () => {
        try {
          const { data: slugRows, error: slugError } = await supabase
            .from('branches')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('slug', branchId)
            .limit(1)
          if (slugError) throw slugError
          if (cancelled) return
          if (slugRows && slugRows.length > 0) {
            // Found a branch with this slug — use its real doc id
            setResolvedBranchId(slugRows[0].id)
            return
          }
          // No slug match — assume it's already a doc id (Settings path)
          setResolvedBranchId(branchId)
        } catch (err) {
          if (cancelled) return
          logger.error('❌ Failed to resolve slug in useYardLayout:', err)
          setResolvedBranchId(branchId) // fall back to direct use
        }
      }
      resolveSlugOrId()
      return () => { cancelled = true }
    }

    // Resolve 'main' → real branch id by querying the branches table.
    let cancelled = false
    const resolveMain = async () => {
      try {
        // Strategy: prefer is_main === true, then the first branch we find.
        // Each query scoped by organization_id for safety. (The Firestore
        // version also tried an isDefault flag first, but the Supabase
        // branches schema has no such column — is_main is the canonical flag.)

        // 1. is_main flag
        const { data: mainRows, error: mainError } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_main', true)
          .limit(1)
        if (mainError) throw mainError
        if (cancelled) return
        if (mainRows && mainRows.length > 0) {
          setResolvedBranchId(mainRows[0].id)
          return
        }

        // 2. Fallback: any branch in this organization
        const { data: anyRows, error: anyError } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organizationId)
          .limit(1)
        if (anyError) throw anyError
        if (cancelled) return
        if (anyRows && anyRows.length > 0) {
          setResolvedBranchId(anyRows[0].id)
          logger.log('⚠ useYardLayout: no is_main branch flagged, using first branch')
          return
        }

        // 3. No branches at all — keep null so the layout view shows empty state
        setResolvedBranchId(null)
        logger.log('⚠ useYardLayout: no branches found for organization', organizationId)
      } catch (err) {
        if (cancelled) return
        logger.error('❌ Failed to resolve main branchId in useYardLayout:', err)
        setResolvedBranchId(null)
      }
    }
    resolveMain()

    return () => { cancelled = true }
  }, [branchId, organizationId])

  // ── LIVE subscribe to layout doc using the resolved branchId ──────────
  useEffect(() => {
    if (!resolvedBranchId || !organizationId) {
      setLayout(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const branch = resolvedBranchId
    const org = organizationId

    // Initial fetch + re-fetch on any change to this org's yard layouts.
    // yardLayoutService.getLayout is already org-scoped (queries by
    // organization_id + branch_id), so the org-mismatch defensive check the
    // Firestore version did is handled by the query itself.
    const refresh = async () => {
      try {
        const result = await yardLayoutService.getLayout(branch, org)
        // Layout may not exist yet — that's fine, dashboard renders empty.
        setLayout(result)
        setLoading(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load yard layout'
        setError(msg)
        setLoading(false)
        logger.error('❌ useYardLayout layout fetch error:', err)
      }
    }

    refresh()

    const channel = supabase
      .channel(`yard_layouts:${org}:${branch}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'yard_layouts',
          filter: `organization_id=eq.${org}`,
        },
        () => {
          refresh()
        },
      )
      // Leg-2 resync: refetch when realtime reconnects after a drop.
      .subscribe(onReconnectRefetch(refresh))

    // Leg-2 resync: refetch on tab focus / network back online too.
    const stopResync = wireResyncTriggers(refresh)
    return () => {
      stopResync()
      supabase.removeChannel(channel)
    }
  }, [resolvedBranchId, organizationId])

  // ── Manual refresh (rarely needed with live subscription, kept for API compat) ──
  const refresh = useCallback(async () => {
    // With onSnapshot, refresh is essentially a no-op — the listener auto-updates.
    // We keep this in the API surface to avoid breaking existing callers.
    return
  }, [])

  // ── Save layout ────────────────────────────────────────────────────────
  const saveLayout = useCallback(
    async (next: Pick<YardLayout, 'spaces' | 'blocks'>) => {
      if (!resolvedBranchId || !organizationId || !user?.uid) {
        throw new Error('Cannot save: missing branch, organization, or user')
      }

      await yardLayoutService.saveLayout({
        branchId: resolvedBranchId,
        organizationId,
        spaces: next.spaces,
        blocks: next.blocks,
        updatedBy: user.uid,
        updatedByName: userDisplayName,
      })
      // No need to setLayout manually — onSnapshot will pick it up.
    },
    [resolvedBranchId, organizationId, user?.uid, userDisplayName],
  )

  return {
    layout,
    loading,
    error,
    refresh,
    saveLayout,
    resolvedBranchId,
  }
}