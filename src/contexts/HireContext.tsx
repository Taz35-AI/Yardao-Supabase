// src/contexts/HireContext.tsx
// Shared state for the Hire section: org id, the renamable agreement label, and
// a refresh signal components key their loads on. Gated to /hire. Defensive.
'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireSettingsService } from '@/lib/services/hireSettingsService'
import { DEFAULT_HIRE_SETTINGS, type HireSettings } from '@/types/hire'
import { logger } from '@/lib/logger'

interface HireContextValue {
  organizationId: string | null
  settings: HireSettings
  refreshKey: number
  refresh: () => void
  reloadSettings: () => Promise<void>
}

const HireContext = createContext<HireContextValue | undefined>(undefined)

export function HireProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [settings, setSettings] = useState<HireSettings>(DEFAULT_HIRE_SETTINGS)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const reloadSettings = useCallback(async () => {
    if (!organizationId) return
    setSettings(await hireSettingsService.getHireSettings(organizationId))
  }, [organizationId])

  useEffect(() => {
    let cancelled = false
    if (!user?.uid) {
      setOrganizationId(null)
      return
    }
    ;(async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (cancelled) return
        const orgId = profile?.organizationId ?? null
        setOrganizationId(orgId)
        if (orgId) setSettings(await hireSettingsService.getHireSettings(orgId))
      } catch (err) {
        logger.error('HireProvider: org/settings load failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  return (
    <HireContext.Provider value={{ organizationId, settings, refreshKey, refresh, reloadSettings }}>
      {children}
    </HireContext.Provider>
  )
}

export function useHire(): HireContextValue {
  const ctx = useContext(HireContext)
  if (!ctx) throw new Error('useHire must be used within a HireProvider')
  return ctx
}
