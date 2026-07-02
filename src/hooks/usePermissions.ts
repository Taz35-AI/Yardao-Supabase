// src/hooks/usePermissions.ts
// Resolves the current user's capabilities (see src/lib/permissions.ts) for use
// in UI gating. Fetches the org's created_by ONCE per org (module cache) so the
// owner — who may just have role 'admin' — is correctly recognised everywhere
// without every component re-querying.
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { organizationService } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import {
  type PermCtx,
  isOwner,
  isGarageManager,
  isManager,
  isAdminLevel,
} from '@/lib/permissions'

const ownerCache = new Map<string, string | null>() // orgId → created_by

export interface Permissions {
  loading: boolean
  ctx: PermCtx
  isOwner: boolean
  isGarageManager: boolean
  isManager: boolean
  isAdminLevel: boolean
  canEditInvoices: boolean
  canCreateInvoices: boolean
  canManageBookings: boolean
  canCreateBookings: boolean
  canManageStockPrices: boolean
  canGrantManager: boolean
}

export function usePermissions(): Permissions {
  const { user, profile, profileLoading } = useAuth()
  const uid = user?.uid ?? null
  const role = (profile?.role as string) ?? null
  const orgId = profile?.organizationId ?? null
  const [createdBy, setCreatedBy] = useState<string | null | undefined>(
    orgId ? ownerCache.get(orgId) : undefined,
  )

  useEffect(() => {
    let cancelled = false
    if (!orgId) {
      setCreatedBy(undefined)
      return
    }
    if (ownerCache.has(orgId)) {
      setCreatedBy(ownerCache.get(orgId) ?? null)
      return
    }
    ;(async () => {
      try {
        const org = await organizationService.getOrganization(orgId)
        const cb = org?.createdBy ?? null
        ownerCache.set(orgId, cb)
        if (!cancelled) setCreatedBy(cb)
      } catch (err) {
        logger.error('usePermissions: org load failed', err)
        if (!cancelled) setCreatedBy(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const ctx: PermCtx = { uid, role, orgCreatedBy: createdBy ?? null }
  const loading = profileLoading || createdBy === undefined
  const manager = isManager(ctx)

  return {
    loading,
    ctx,
    isOwner: isOwner(ctx),
    isGarageManager: isGarageManager(ctx),
    isManager: manager,
    isAdminLevel: isAdminLevel(ctx),
    canEditInvoices: manager,
    canCreateInvoices: manager,
    canManageBookings: manager,
    canCreateBookings: manager,
    canManageStockPrices: manager,
    canGrantManager: manager,
  }
}
