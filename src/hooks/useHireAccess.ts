// src/hooks/useHireAccess.ts
// Decides whether the current user may see/use the Hire section.
//   allowed = is org owner (organizations.created_by) OR uid is on the
//   hire_settings.accessUserIds allow-list. Owner-only by default.
// This is the UI gate; the real enforcement is RLS (migration 0050).
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { organizationService } from '@/lib/firestore'
import { hireSettingsService } from '@/lib/services/hireSettingsService'
import { logger } from '@/lib/logger'

interface HireAccess {
  loading: boolean
  allowed: boolean
  isOwner: boolean
}

export function useHireAccess(): HireAccess {
  const { user, profile, profileLoading } = useAuth()
  const [state, setState] = useState<HireAccess>({ loading: true, allowed: false, isOwner: false })

  useEffect(() => {
    let cancelled = false
    const uid = user?.uid
    const orgId = profile?.organizationId

    if (profileLoading) {
      setState((s) => ({ ...s, loading: true }))
      return
    }
    if (!uid || !orgId) {
      setState({ loading: false, allowed: false, isOwner: false })
      return
    }

    ;(async () => {
      try {
        const [org, settings] = await Promise.all([
          organizationService.getOrganization(orgId),
          hireSettingsService.getHireSettings(orgId),
        ])
        if (cancelled) return
        const isOwner = !!org?.createdBy && org.createdBy === uid
        const onList = (settings.accessUserIds ?? []).includes(uid)
        setState({ loading: false, allowed: isOwner || onList, isOwner })
      } catch (err) {
        logger.error('useHireAccess failed:', err)
        if (!cancelled) setState({ loading: false, allowed: false, isOwner: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.uid, profile?.organizationId, profileLoading])

  return state
}
