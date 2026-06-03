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
import { doc, onSnapshot, collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
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
          const slugQ = query(
            collection(db, 'branches'),
            where('organizationId', '==', organizationId),
            where('slug', '==', branchId),
            limit(1),
          )
          const slugSnap = await getDocs(slugQ)
          if (cancelled) return
          if (!slugSnap.empty) {
            // Found a branch with this slug — use its real doc id
            setResolvedBranchId(slugSnap.docs[0].id)
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

    // Resolve 'main' → real branch id by querying the branches collection
    let cancelled = false
    const resolveMain = async () => {
      try {
        const branchesRef = collection(db, 'branches')
        // Strategy: prefer isDefault === true, then isMain === true,
        // then a branch named 'main'/'Main', then the first branch we find.
        // Each query scoped by organizationId for safety.

        // 1. isDefault flag
        const defaultQ = query(
          branchesRef,
          where('organizationId', '==', organizationId),
          where('isDefault', '==', true),
          limit(1),
        )
        const defaultSnap = await getDocs(defaultQ)
        if (cancelled) return
        if (!defaultSnap.empty) {
          setResolvedBranchId(defaultSnap.docs[0].id)
          return
        }

        // 2. isMain flag
        const mainFlagQ = query(
          branchesRef,
          where('organizationId', '==', organizationId),
          where('isMain', '==', true),
          limit(1),
        )
        const mainFlagSnap = await getDocs(mainFlagQ)
        if (cancelled) return
        if (!mainFlagSnap.empty) {
          setResolvedBranchId(mainFlagSnap.docs[0].id)
          return
        }

        // 3. Fallback: any branch in this organization (alphabetical-ish via Firestore default)
        const anyQ = query(
          branchesRef,
          where('organizationId', '==', organizationId),
          limit(1),
        )
        const anySnap = await getDocs(anyQ)
        if (cancelled) return
        if (!anySnap.empty) {
          setResolvedBranchId(anySnap.docs[0].id)
          logger.log('⚠ useYardLayout: no isDefault/isMain branch flagged, using first branch')
          return
        }

        // 4. No branches at all — keep null so the layout view shows empty state
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

    const ref = doc(db, 'yardLayouts', resolvedBranchId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // Layout hasn't been created yet — that's fine, dashboard renders empty
          setLayout(null)
          setLoading(false)
          return
        }
        const data = snap.data()
        if (data.organizationId !== organizationId) {
          // Defensive: refuse data from another org (rules should already prevent this)
          logger.error('❌ yardLayout doc organizationId mismatch')
          setLayout(null)
          setLoading(false)
          return
        }
        setLayout({
          branchId: data.branchId || resolvedBranchId,
          organizationId: data.organizationId,
          spaces: data.spaces || {},
          blocks: Array.isArray(data.blocks) ? data.blocks : [],
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
          updatedByName: data.updatedByName,
        })
        setLoading(false)
      },
      (err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load yard layout'
        setError(msg)
        setLoading(false)
        logger.error('❌ useYardLayout onSnapshot error:', err)
      },
    )

    return () => unsub()
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