// src/hooks/fleet/useVehicleSuppliers.ts
// Loads the org's VEHICLE suppliers list (settings) for the Supplier dropdown in
// the Add / Edit vehicle forms. Defensive — returns [] on any failure.
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { settingsService } from '@/lib/services/settingsService'

export function useVehicleSuppliers(): string[] {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!user?.uid) return
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId && !cancelled) {
          setSuppliers(await settingsService.getVehicleSuppliers(profile.organizationId))
        }
      } catch {
        /* no settings / not configured → empty list */
      }
    })()
    return () => { cancelled = true }
  }, [user?.uid])

  return suppliers
}
