// src/contexts/FleetDataContext.tsx
// 💸 COST OPTIMIZATION: Single shared fleet data instance.
//
// Before: useFleetData was called from 7 places (DashboardDataLayer,
// fleet/page.tsx, ServiceBanner, DeliveriesDefleetContent, EntryCard,
// ServiceBookingsContent, useNotifications). Each call mounted its own React
// state and ran its own getDocs against the `vehicles` collection (95+ docs)
// plus a getDocs against `conditionCategories` (300+ docs). On a typical
// authenticated page-load that meant 6–7× duplicate fetches per user.
//
// After: this provider owns the only fetch. All consumers read from it via
// context. Public API of useFleetData (state, actions, analytics,
// refreshData) is preserved 1:1 — every existing call site continues to work
// without any change.
//
// Behaviour preserved verbatim from the original hook:
//   • 5-minute stale check on app foreground
//   • One-time defleet migration (gated by localStorage flag)
//   • Condition deduplication
//   • Organization-switch reset
//   • App-background pause
//   • All logger output
//   • Exact action signatures (including legacy `deleteVehicle(id, p0, ...)`)
'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppState } from '@/hooks/common/useAppState'
import { Vehicle, vehicleService, userProfileService } from '@/lib/firestore'
import { ConditionCategory, conditionService } from '@/lib/conditionService'
import { contractService } from '@/lib/contractService'
import { buildContractColorIndex, resolveVehicleContractColor } from '@/lib/contractUtils'
import { logger } from '@/lib/logger'

interface FleetAnalytics {
  totalVehicles: number
  motExpiringVehicles: Vehicle[]
  sizeBreakdown: Record<string, number>
}

export interface FleetDataContextValue {
  vehicles: Vehicle[]
  conditions: ConditionCategory[]
  loading: boolean
  error: string | null
  organizationId: string | null
  addVehicle: (
    vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>,
  ) => Promise<Vehicle | undefined>
  updateVehicle: (
    vehicleId: string,
    updates: Partial<Omit<Vehicle, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>>,
  ) => Promise<void>
  // Legacy signature preserved verbatim — `p0`, `reason`, `details`, `defleetDate`
  // are unused inside the implementation but kept so existing callers continue
  // to typecheck and behave identically.
  deleteVehicle: (
    vehicleId: string,
    p0: any,
    reason: string,
    details: string,
    defleetDate: string,
  ) => Promise<void>
  clearAllVehicles: () => Promise<void>
  bulkAddVehicles: (
    vehicleData: Omit<Vehicle, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>[],
  ) => Promise<Vehicle[] | undefined>
  addCondition: (name: string) => Promise<ConditionCategory | undefined>
  updateCondition: (conditionId: string, name: string) => Promise<void>
  analytics: FleetAnalytics
  refreshData: () => Promise<void>
  // Local-only optimistic patch — updates the in-memory vehicles array with
  // NO Firestore read or write. Used by bulk ops that already committed to
  // Firestore, so we mirror the change instead of re-downloading the whole
  // collection (a top read-cost line).
  applyLocalVehiclePatch: (patch: Partial<Vehicle>, predicate: (v: Vehicle) => boolean) => void
}

const FleetDataContext = createContext<FleetDataContextValue | null>(null)

export function useFleetDataContext(): FleetDataContextValue {
  const ctx = useContext(FleetDataContext)
  if (!ctx) {
    throw new Error(
      'useFleetData must be used within a FleetDataProvider. ' +
        'Make sure FleetDataProvider is mounted in the React tree.',
    )
  }
  return ctx
}

export function FleetDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { isAppActive } = useAppState()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [conditions, setConditions] = useState<ConditionCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  // Ref to track if data has been loaded at least once
  const dataLoadedRef = useRef(false)
  const lastLoadTimeRef = useRef<number>(0)

  // Load user organization
  useEffect(() => {
    if (!user) {
      setVehicles([])
      setConditions([])
      setOrganizationId(null)
      setLoading(false)
      return
    }

    const loadUserOrganization = async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setOrganizationId(profile.organizationId)
        } else {
          setError('No organization found')
        }
      } catch (err) {
        logger.error('[useFleetData] Error loading organization:', err)
        setError('Failed to load user organization')
      }
    }

    loadUserOrganization()
  }, [user])

  // ✅ FIXED: Deduplicate conditions by name (case-insensitive)
  const deduplicateConditions = useCallback(
    (conditions: ConditionCategory[]): ConditionCategory[] => {
      const seen = new Map<string, ConditionCategory>()

      conditions.forEach(condition => {
        const normalizedName = condition.name.trim().toLowerCase()

        // Keep the first occurrence of each unique name
        if (!seen.has(normalizedName)) {
          seen.set(normalizedName, condition)
        } else {
          // If duplicate found, log it for debugging
          logger.log(`⚠️ [useFleetData] Duplicate condition found: "${condition.name}" (ID: ${condition.id})`)
        }
      })

      const uniqueConditions = Array.from(seen.values())

      // If we found duplicates, log summary
      if (uniqueConditions.length < conditions.length) {
        logger.log(`🧹 [useFleetData] Removed ${conditions.length - uniqueConditions.length} duplicate condition(s)`)
        logger.log('📋 [useFleetData] Unique conditions:', uniqueConditions.map(c => `${c.name} (${c.id})`))
      }

      return uniqueConditions
    },
    [],
  )

  // Determine if we should load data
  const shouldLoadData = useCallback(() => {
    if (!user || !organizationId) return false
    if (!isAppActive) return false // Stop when app in background

    // Check if we need to reload (e.g., if it's been more than 5 minutes)
    // (Computed for parity with the original hook; the actual stale check
    // happens in the load-decision useEffect below.)
    const now = Date.now()
    const timeSinceLastLoad = now - lastLoadTimeRef.current
    const shouldReload = !dataLoadedRef.current || timeSinceLastLoad > 5 * 60 * 1000 // 5 minutes
    void shouldReload // intentionally unused — see comment above

    return true // Active and ready to load
  }, [user, organizationId, isAppActive])

  // 🔧 ONE-TIME MIGRATION: Stamp all old defleeted vehicles with proper flags
  // Runs once per org, tracked in localStorage. Safe to leave in forever.
  const runDefleetMigration = useCallback(
    async (allVehicles: Vehicle[]) => {
      if (!organizationId) return
      const migrationKey = `yardao_defleet_migration_v1_${organizationId}`
      if (localStorage.getItem(migrationKey) === 'done') return

      // Find vehicles that were defleeted the old way (have defleet data but missing flags)
      const toFix = allVehicles.filter(
        v =>
          v.isDefleeted !== true &&
          v.currentStatus !== 'defleeted' &&
          (v.defleetDate || v.defleetedBy || v.defleetReason),
      )

      if (toFix.length > 0) {
        logger.log(`🔧 [Migration] Fixing ${toFix.length} old defleeted vehicles...`)
        const { doc: firestoreDoc, updateDoc } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')

        await Promise.all(
          toFix.map(v =>
            updateDoc(firestoreDoc(db, 'vehicles', v.id!), {
              isDefleeted: true,
              currentStatus: 'defleeted',
            }),
          ),
        )
        logger.log(`✅ [Migration] Done - fixed ${toFix.length} vehicles`)
      } else {
        logger.log(`✅ [Migration] Nothing to fix`)
      }

      localStorage.setItem(migrationKey, 'done')
    },
    [organizationId],
  )

  // Load data function - extracted for reuse
  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (!user || !organizationId) {
        setVehicles([])
        setConditions([])
        setLoading(false)
        return
      }

      // Don't load if app is in background (unless forced)
      if (!isAppActive && !forceRefresh) {
        logger.log('📴 [useFleetData] Loading SKIPPED - app in background')
        setLoading(false)
        return
      }

      try {
        if (forceRefresh) {
          logger.log('🔄 [useFleetData] Force refreshing fleet data...')
        }

        logger.log('🔥 [useFleetData] Loading fleet data...')
        setLoading(true)
        setError(null)

        // ✅ FIXED: Fetch ALL vehicles including defleeted
        // Previously we fetched all for migration then discarded them and re-fetched
        // without defleeted via vehicleService.getVehicles(). Now we keep ALL vehicles
        // in state so the showDefleeted toggle in FleetFilters actually has data to show.
        const { collection: col, query: q2, where: wh, getDocs: gd, orderBy: ob } = await import(
          'firebase/firestore'
        )
        const { db: firedb } = await import('@/lib/firebase')
        const allSnapshot = await gd(
          q2(col(firedb, 'vehicles'), wh('organizationId', '==', organizationId), ob('createdAt', 'desc')),
        )
        const allVehicles = allSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle))

        // ── Contract badge colour: resolve from the live contracts list ──────
        // Each vehicle stores a denormalised `contractColor` copy that can be
        // empty or stale (e.g. a duplicate same-named contract). Resolve it
        // against the org's contracts (source of truth) so identical contracts
        // always render identical badges. Safe: falls back to the stored copy
        // if contracts can't be loaded.
        let resolvedVehicles = allVehicles
        try {
          const contracts = await contractService.getContracts(organizationId)
          const colorIndex = buildContractColorIndex(contracts)
          resolvedVehicles = allVehicles.map(v => {
            const resolved = resolveVehicleContractColor(v as any, colorIndex)
            return resolved && resolved !== (v as any).contractColor
              ? ({ ...v, contractColor: resolved } as Vehicle)
              : v
          })
        } catch (contractErr) {
          logger.error('[useFleetData] Contract colour resolution skipped:', contractErr)
        }

        // Run one-time migration silently
        await runDefleetMigration(allVehicles)

        // Load conditions in parallel (no change needed here)
        const conditionsData = await conditionService.getConditions(organizationId)

        // ✅ KEY FIX: Set ALL vehicles into state (including defleeted)
        // The UI filter layer (FleetFilters showDefleeted toggle) handles visibility.
        // By default showDefleeted is false, so defleeted vehicles are hidden at the
        // filter/display level — NOT stripped from the data source.
        setVehicles(resolvedVehicles)

        // ✅ CRITICAL FIX: NEVER initialize conditions here
        // Conditions should already exist from organization creation
        if (conditionsData.length === 0) {
          logger.error('⚠️ [useFleetData] No conditions found! Organization may not be properly initialized.')
          logger.error('⚠️ [useFleetData] Conditions should have been created during organization setup.')
          setError('No conditions found. Please contact support.')
          setConditions([])
        } else {
          // ✅ FIXED: Deduplicate conditions before setting state
          logger.log(`📋 [useFleetData] Loaded ${conditionsData.length} condition(s) from database`)
          const uniqueConditions = deduplicateConditions(conditionsData)
          setConditions(uniqueConditions)
          logger.log(`✅ [useFleetData] Using ${uniqueConditions.length} unique condition(s)`)
        }

        // Mark as loaded and update timestamp
        dataLoadedRef.current = true
        lastLoadTimeRef.current = Date.now()

        const activeCount = allVehicles.filter(
          v => v.isDefleeted !== true && v.currentStatus !== 'defleeted',
        ).length
        const defleetedCount = allVehicles.length - activeCount

        if (forceRefresh) {
          logger.log(`✅ [useFleetData] Refreshed: ${activeCount} active + ${defleetedCount} defleeted vehicles loaded`)
        } else {
          logger.log(`✅ [useFleetData] Loaded: ${activeCount} active + ${defleetedCount} defleeted vehicles`)
        }
      } catch (err) {
        logger.error('❌ [useFleetData] Error loading fleet data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load fleet data')
      } finally {
        setLoading(false)
      }
    },
    [user, organizationId, isAppActive, deduplicateConditions, runDefleetMigration],
  )

  // 🔥 CRITICAL FIX: Properly manage data loading based on app state
  useEffect(() => {
    const shouldLoad = shouldLoadData()

    logger.log('🎯 [useFleetData] Load decision:', {
      shouldLoad,
      hasUser: !!user,
      hasOrg: !!organizationId,
      isAppActive,
      dataLoaded: dataLoadedRef.current,
    })

    if (shouldLoad) {
      // Only load if we haven't loaded yet or if app just became active
      if (!dataLoadedRef.current) {
        logger.log('✅ [useFleetData] CONDITIONS MET: Loading fleet data for first time')
        loadData()
      } else if (isAppActive) {
        // App became active - check if we need to refresh
        const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current
        if (timeSinceLastLoad > 5 * 60 * 1000) {
          // More than 5 minutes
          logger.log('✅ [useFleetData] App active and data stale - refreshing fleet data')
          loadData()
        } else {
          logger.log('ℹ️ [useFleetData] App active but data is fresh - skipping load')
        }
      }
    } else {
      // We should NOT load data
      if (!user || !organizationId) {
        logger.log('⚠️ [useFleetData] Cannot load fleet data: Missing user or organization')
        setVehicles([])
        setConditions([])
        setLoading(false)
      } else if (!isAppActive) {
        logger.log('🛑 [useFleetData] Fleet data loading PAUSED - app in background')
        // Keep existing data, just stop loading
        setLoading(false)
      }
    }
  }, [shouldLoadData, loadData, isAppActive, user, organizationId])

  // Reset loaded state when switching organizations
  useEffect(() => {
    if (organizationId) {
      logger.log(`📌 [useFleetData] Organization changed: ${organizationId}`)
      dataLoadedRef.current = false
      lastLoadTimeRef.current = 0
    }
  }, [organizationId])

  // Manual refresh function
  const refreshData = useCallback(async () => {
    logger.log('🔄 [useFleetData] Manual fleet data refresh requested')

    // Only refresh if app is active
    if (!isAppActive) {
      logger.log('⚠️ [useFleetData] Cannot refresh - app is in background')
      return
    }

    await loadData(true)
  }, [loadData, isAppActive])

  // Local-only optimistic patch (no Firestore I/O). Mirrors a write that
  // already happened so we don't re-download the whole fleet.
  const applyLocalVehiclePatch = useCallback(
    (patch: Partial<Vehicle>, predicate: (v: Vehicle) => boolean) => {
      setVehicles(prev => prev.map(v => (predicate(v) ? { ...v, ...patch } : v)))
    },
    [],
  )

  const addVehicle = async (
    vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>,
  ) => {
    if (!user || !organizationId) return

    try {
      const newVehicle = await vehicleService.addVehicle({
        ...vehicle,
        organizationId,
        createdBy: user.uid,
      })
      setVehicles(prev => [newVehicle, ...prev])
      return newVehicle
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add vehicle')
    }
  }

  const updateVehicle = async (
    vehicleId: string,
    updates: Partial<Omit<Vehicle, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>>,
  ) => {
    if (!user || !organizationId) return

    try {
      await vehicleService.updateVehicle(vehicleId, updates)
      setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, ...updates } : v)))
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update vehicle')
    }
  }

  const deleteVehicle = async (
    vehicleId: string,
    p0: any,
    reason: string,
    details: string,
    defleetDate: string,
  ) => {
    try {
      await vehicleService.deleteVehicle(vehicleId)
      setVehicles(prev => prev.filter(v => v.id !== vehicleId))
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete vehicle')
    }
  }

  const clearAllVehicles = async () => {
    if (!organizationId) return

    try {
      await vehicleService.clearAllVehicles(organizationId)
      setVehicles([])
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to clear vehicles')
    }
  }

  const bulkAddVehicles = async (
    vehicleData: Omit<Vehicle, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>[],
  ) => {
    if (!user || !organizationId) return

    try {
      const vehiclesWithOrganization = vehicleData.map(vehicle => ({
        ...vehicle,
        organizationId,
        createdBy: user.uid,
      }))

      const newVehicles = await vehicleService.bulkAddVehicles(vehiclesWithOrganization)
      setVehicles(prev => [...newVehicles, ...prev])
      return newVehicles
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to bulk add vehicles')
    }
  }

  const addCondition = async (name: string) => {
    if (!organizationId) return

    try {
      // ✅ FIXED: Check for duplicate names before adding
      const normalizedName = name.trim().toLowerCase()
      const duplicate = conditions.find(c => c.name.trim().toLowerCase() === normalizedName)

      if (duplicate) {
        throw new Error(`Condition "${name}" already exists`)
      }

      const newCondition = await conditionService.addCondition({
        name: name.trim(),
        order: conditions.length,
        organizationId,
        color: '#6b7280',
        severity: 'good' as const,
        isDefault: false,
        isEditable: true,
      })
      setConditions(prev => [...prev, newCondition])
      return newCondition
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add condition')
    }
  }

  const updateCondition = async (conditionId: string, name: string) => {
    try {
      await conditionService.updateCondition(conditionId, { name: name.trim() })
      setConditions(prev => prev.map(c => (c.id === conditionId ? { ...c, name: name.trim() } : c)))
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update condition')
    }
  }

  // ✅ UPDATED: Analytics only counts ACTIVE (non-defleeted) vehicles
  const activeVehicles = vehicles.filter(
    v => v.isDefleeted !== true && v.currentStatus !== 'defleeted',
  )

  const analytics: FleetAnalytics = {
    totalVehicles: activeVehicles.length,

    motExpiringVehicles: activeVehicles.filter(vehicle => {
      if (!vehicle.motExpiry) return false
      const motDate = new Date(vehicle.motExpiry)
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      return motDate <= thirtyDaysFromNow
    }),

    sizeBreakdown: activeVehicles.reduce(
      (acc, vehicle) => {
        if (vehicle.size) {
          acc[vehicle.size] = (acc[vehicle.size] || 0) + 1
        }
        return acc
      },
      {} as Record<string, number>,
    ),
  }

  const value: FleetDataContextValue = {
    vehicles,
    conditions,
    loading,
    error,
    organizationId,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    clearAllVehicles,
    bulkAddVehicles,
    addCondition,
    updateCondition,
    analytics,
    refreshData,
    applyLocalVehiclePatch,
  }

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>
}
