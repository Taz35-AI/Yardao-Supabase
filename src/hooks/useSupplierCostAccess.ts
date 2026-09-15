// src/hooks/useSupplierCostAccess.ts
// Decides whether the current user may see supplier rental costs (what the
// business pays per vehicle). allowed = org owner (organizations.created_by)
// OR uid is on organization_settings.supplier_cost_access_user_ids.
// This is the UI gate; the real enforcement is RLS (migration 0072).
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { organizationService } from '@/lib/firestore'
import { supplierCostAccessService } from '@/lib/services/supplierCostAccessService'
import { logger } from '@/lib/logger'

interface SupplierCostAccess {
  loading: boolean
  allowed: boolean
  isOwner: boolean
}

export function useSupplierCostAccess(): SupplierCostAccess {
  const { user, profile, profileLoading } = useAuth()
  const [state, setState] = useState<SupplierCostAccess>({ loading: true, allowed: false, isOwner: false })

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
        const [org, ids] = await Promise.all([
          organizationService.getOrganization(orgId),
          supplierCostAccessService.getAccessUserIds(orgId),
        ])
        if (cancelled) return
        const isOwner = !!org?.createdBy && org.createdBy === uid
        setState({ loading: false, allowed: isOwner || ids.includes(uid), isOwner })
      } catch (err) {
        logger.error('useSupplierCostAccess failed:', err)
        if (!cancelled) setState({ loading: false, allowed: false, isOwner: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.uid, profile?.organizationId, profileLoading])

  return state
}
