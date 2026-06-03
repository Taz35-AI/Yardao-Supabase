// src/hooks/useMechanics.ts
// Returns the active mechanics in the current user's organisation, used to
// populate "Assign mechanic" dropdowns on service bookings and bodyshop jobs.
//
// Implementation notes:
//   • Fetches once per orgId with a small module-level cache (5 min TTL).
//     Multiple consumers can mount the hook simultaneously without each one
//     hitting Firestore.
//   • Mechanics are simply users with role === 'mechanic'. We use the existing
//     userProfileService.getActiveUsersByOrganization (already filters out
//     deleted/inactive users) and apply the role filter client-side.
//   • The list rarely changes — admins invite mechanics from UserManagement —
//     so a TTL'd cache is plenty. Force-refresh via `refresh()` if needed
//     (e.g. immediately after inviting a new mechanic).
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import type { UserProfile } from '@/types'

interface CacheEntry {
  mechanics: UserProfile[]
  ts: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

interface UseMechanicsResult {
  mechanics: UserProfile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useMechanics(): UseMechanicsResult {
  const { user } = useAuth()
  const [mechanics, setMechanics] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const orgIdRef = useRef<string | null>(null)

  const load = useCallback(async (force: boolean) => {
    if (!user) {
      setMechanics([])
      setLoading(false)
      return
    }
    try {
      const profile = await userProfileService.getProfile(user.uid)
      const orgId = profile?.organizationId
      if (!orgId) {
        setMechanics([])
        setLoading(false)
        return
      }
      orgIdRef.current = orgId

      // Cache hit?
      if (!force) {
        const cached = cache.get(orgId)
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          setMechanics(cached.mechanics)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(null)
      const allUsers = await userProfileService.getActiveUsersByOrganization(orgId)
      const onlyMechanics = allUsers.filter(u => u.role === 'mechanic')
      setMechanics(onlyMechanics)
      cache.set(orgId, { mechanics: onlyMechanics, ts: Date.now() })
    } catch (err) {
      logger.error('[useMechanics] failed to load', err)
      setError(err instanceof Error ? err.message : 'Failed to load mechanics')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load(false)
  }, [load])

  const refresh = useCallback(async () => {
    if (orgIdRef.current) cache.delete(orgIdRef.current)
    await load(true)
  }, [load])

  return { mechanics, loading, error, refresh }
}
