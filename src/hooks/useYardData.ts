// src/hooks/useYardData.ts - PERFORMANCE OPTIMIZED VERSION WITH CONDITION SYNC
// Added tab visibility detection and conditional loading
// ALL EXISTING FUNCTIONALITY PRESERVED
// ✅ BATTERY FIX: PROPERLY PAUSES/RESUMES LISTENERS WHEN APP GOES TO BACKGROUND

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'
import { useTabVisibility } from '@/hooks/common/useTabVisibility'
import { useAppState } from '@/hooks/common/useAppState'
import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList, toSnake } from '@/lib/dbMap'
import { userProfileService, vehicleService } from '@/lib/firestore'
import { checkoutHistoryService } from '@/lib/checkoutHistoryService'
import { contractService } from '@/lib/contractService'
import { buildContractColorIndex, resolveVehicleContractColor, type ContractColorIndex } from '@/lib/contractUtils'
import { branchService } from '@/lib/services/branchService'
import { VehicleHireService } from '@/lib/services/vehicleHireService'
import { 
  Analytics, 
  AuditLog, 
  CheckedInVehicle, 
  VehicleCheckInData,
  VehicleStatus,
  VehicleHireStatus,
  SetOutOnHireData,
  QuickCheckInData,
  isVehicleInYard,
  isVehicleOutOnHire,
  InsuranceStatus,
  canPerformAction
} from '@/types'
import { 
  createCheckInAuditLog, 
  createCheckOutAuditLog, 
  generateAuditAction, 
  createAuditLog 
} from '@/lib/auditUtils'
import { ContractSyncService } from '@/services/contractSyncService'
import { InsuranceSyncService } from '@/services/insuranceSyncService'
import { ConditionSyncService } from '@/services/conditionSyncService'
import { logger } from '@/lib/logger'

// Sync notification interface
interface SyncNotification {
  type: 'success' | 'warning' | 'error'
  message: string
  details?: {
    fleetUpdated: boolean
    yardUpdated: number
    syncType: 'contract' | 'insurance' | 'condition'
  }
}

// Props for the hook with branch support
interface UseYardDataProps {
  branchId?: string
}

// timestamptz string | Date → Date. The Firestore version revived Timestamps
// to Date via .toDate(); Supabase returns ISO strings, so coerce them here so
// CheckedInVehicle date fields keep the same (Date) shape consumers rely on.
const toDate = (v: any): any => {
  if (!v) return v
  if (v instanceof Date) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : d
}

// Helper functions
const safeString = (value: any): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && value.toString) return value.toString()
  return String(value || '')
}

const safeEquals = (a: any, b: any): boolean => {
  return safeString(a).toLowerCase() === safeString(b).toLowerCase()
}

const normalizeStatus = (status: string): VehicleStatus => {
  const lowerStatus = safeString(status).toLowerCase()
  
  if (lowerStatus.includes('ready')) return 'Ready'
  if (lowerStatus.includes('pending') || lowerStatus.includes('check')) return 'Pending checks'
  if (lowerStatus.includes('repair')) return 'Repairs needed'
  if (lowerStatus.includes('non-starter') || lowerStatus.includes('non starter')) return 'Non-Starter'
  
  // Legacy mapping
  if (lowerStatus === 'needs checking') return 'Pending checks'
  
  return 'Pending checks' // Default fallback
}

// Helper function to clean data for Firebase
const cleanDataForFirebase = (data: any): any => {
  const cleaned: any = {}
  
  Object.keys(data).forEach(key => {
    const value = data[key]
    if (value !== undefined) {
      cleaned[key] = value
    }
  })
  
  return cleaned
}

// Helper function to ensure vehicle has hire status
const ensureHireStatus = (vehicle: any): CheckedInVehicle => {
  return {
    ...vehicle,
    hireStatus: vehicle.hireStatus || 'In Yard' as VehicleHireStatus,
    originalStatus: vehicle.originalStatus || undefined,
    hiredAt: vehicle.hiredAt || undefined,
    hiredBy: vehicle.hiredBy || undefined,
    hiredByName: vehicle.hiredByName || undefined,
    hireNotes: vehicle.hireNotes || undefined
  }
}

// ⚠️ Implementation hook. Do NOT call this directly from components —
// every call mounts its own Firestore listener. Consume the shared
// instance via `useYardData()` from '@/contexts/YardDataContext', which
// calls this exactly once inside YardDataProvider.
export function useYardDataInternal(props?: UseYardDataProps) {
  const { user } = useAuth()
  const pathname = usePathname()
  const { isVisible } = useTabVisibility()
  const { isAppActive } = useAppState()
  const branchId = props?.branchId || 'main' // Default to main branch
  
  const [checkedInVehicles, setCheckedInVehicles] = useState<CheckedInVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('')
  const [syncNotification, setSyncNotification] = useState<SyncNotification | null>(null)

  // Live contract colour index (id/name -> colour) for this org. Lets the
  // snapshot mapper resolve a vehicle's badge colour from the source of truth
  // instead of its (possibly stale/empty) stored contractColor copy — same fix
  // as FleetDataContext, applied to the yard/dashboard data path.
  const contractIndexRef = useRef<ContractColorIndex>({ byId: new Map(), byName: new Map() })

  // Ref for managing subscription
  const unsubscribeRef = useRef<(() => void) | null>(null)
  // Branch the live listener is currently bound to. Lets us KEEP an active
  // listener across navigation/visibility re-renders and only re-subscribe
  // when the branch actually changes — instead of tearing it down and
  // re-reading the whole collection on every pathname change.
  const activeBranchRef = useRef<string | null>(null)

  // Determine if we should have an active listener
  const shouldHaveActiveListener = useCallback(() => {
    // Don't load if no user
    if (!user || !userOrganizationId) return false
    if (!isAppActive) return false // Stop when app in background
    
    // Only load on dashboard, fleet, or other relevant pages
    const relevantPages = ['/dashboard', '/fleet', '/service-bookings', '/branch-overview']
    const isRelevantPage = relevantPages.some(page => pathname.startsWith(page))
    
    // Only load when tab is visible AND on relevant page
    return isVisible && isRelevantPage
  }, [user, userOrganizationId, pathname, isVisible, isAppActive])

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      if (!user) {
        setUserOrganizationId(null)
        setUserDisplayName('')
        return
      }

      try {
        const userProfile = await userProfileService.getProfile(user.uid)
        if (userProfile) {
          setUserOrganizationId(userProfile.organizationId)
          setUserDisplayName(userProfile.displayName || user.displayName || 'Unknown User')
        } else {
          setError('No user profile found. Please join an organization.')
        }
      } catch (error) {
        logger.error('Error loading user data:', error)
        setError('Failed to load user data')
      }
    }

    loadUserData()
  }, [user])

  // Load contracts → build the colour index for this org. Re-resolve any
  // already-loaded vehicles so badge colours apply even if the first yard
  // snapshot arrived before contracts finished loading.
  useEffect(() => {
    if (!userOrganizationId) return
    let cancelled = false
    contractService
      .getContracts(userOrganizationId)
      .then(contracts => {
        if (cancelled) return
        contractIndexRef.current = buildContractColorIndex(contracts)
        setCheckedInVehicles(prev =>
          prev.map(v => {
            const resolved = resolveVehicleContractColor(v as any, contractIndexRef.current)
            return resolved && resolved !== v.contractColor ? { ...v, contractColor: resolved } : v
          }),
        )
      })
      .catch(err => logger.error('[useYardData] contract colour index load failed:', err))
    return () => {
      cancelled = true
    }
  }, [userOrganizationId])

  // 🔥 CRITICAL FIX: Properly manage listener lifecycle based on app state
  useEffect(() => {
    // Helper function to cleanup listener
    const cleanupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 UNSUBSCRIBING from yard data listener')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }

    // Helper function to setup listener
    const setupListener = () => {
      // Don't setup if we already have one
      if (unsubscribeRef.current) {
        logger.log('⚠️ Yard listener already exists, skipping setup')
        return
      }

      if (!userOrganizationId) {
        logger.log('⚠️ No organization ID, cannot setup yard listener')
        return
      }

      logger.log(`🔥 CREATING new yard data listener for branch: ${branchId}`)
      setLoading(true)
      setError(null)

      const orgId = userOrganizationId
      const listenBranchId = branchId

      // Map a (camelCased) row → CheckedInVehicle, preserving the exact shape
      // the Firestore snapshot mapper produced before.
      const mapRow = (data: any): CheckedInVehicle => ensureHireStatus({
        id: data.id,

        // Store reference to fleet vehicle
        vehicleId: data.vehicleId || null,

        // Required fields
        registration: safeString(data.registration),
        make: safeString(data.make),
        model: safeString(data.model),
        size: safeString(data.size),
        condition: safeString(data.condition),
        status: normalizeStatus(data.status),
        userId: safeString(data.userId),
        organizationId: safeString(data.organizationId),
        branchId: data.branchId || 'main',

        // Optional fields
        colour: data.colour ? safeString(data.colour) : undefined,
        mileage: data.mileage ? safeString(data.mileage) : undefined,
        notes: data.notes ? safeString(data.notes) : undefined,
        comments: data.comments ? safeString(data.comments) : undefined,
        contract: data.contract && data.contract.trim() !== '' ? safeString(data.contract) : null,
        // Resolve badge colour from the live contracts index (source of truth);
        // falls back to the stored copy when nothing matches.
        contractColor: resolveVehicleContractColor(
          { contract: data.contract, contractColor: data.contractColor, contractId: data.contractId },
          contractIndexRef.current,
        ) || null,
        insuranceStatus: data.insuranceStatus || null,
        insurancePolicyId:     data.insurancePolicyId     || null,  // ✅ NEW
        insurancePolicyName:   data.insurancePolicyName   || null,  // ✅ NEW
        insurancePolicyExpiry: data.insurancePolicyExpiry || null,  // ✅ NEW
        motExpiry: data.motExpiry ? safeString(data.motExpiry) : undefined,
        taxExpiry: data.taxExpiry ? safeString(data.taxExpiry) : undefined,
        location: data.location ? safeString(data.location) : undefined,
        bay: data.bay ? safeString(data.bay) : undefined,

        // Date fields
        updatedAt: toDate(data.updatedAt),
        createdAt: toDate(data.createdAt),
        checkInTime: toDate(data.checkInTime),
        lastEditLog: data.lastEditLog,

        // Hire fields
        hireStatus: data.hireStatus || 'In Yard',
        originalStatus: data.originalStatus,
        hiredAt: toDate(data.hiredAt),
        hiredBy: data.hiredBy,
        hiredByName: data.hiredByName,
        hireNotes: data.hireNotes,

        // ✅ NEW: Transfer status fields for CheckedOutVehiclesSection
        transferStatus: data.transferStatus || null,
        targetBranchId: data.targetBranchId || null,
        targetBranchName: data.targetBranchName || null,
        transferInitiatedAt: toDate(data.transferInitiatedAt),
        transferInitiatedBy: data.transferInitiatedBy,
        transferInitiatedByName: data.transferInitiatedByName,

        // ✅ NEW: External garage fields for CheckedOutVehiclesSection
        externalGarageId: data.externalGarageId || null,
        externalGarageName: data.externalGarageName || null,
        serviceBookingId: data.serviceBookingId || null,
        checkedOutToGarageAt: toDate(data.checkedOutToGarageAt),
        checkedOutToGarageBy: data.checkedOutToGarageBy,
        checkedOutToGarageByName: data.checkedOutToGarageByName,
        vehicleDiagramType: data.vehicleDiagramType || null,
        damagePins: data.damagePins || [],

        // ✨ PHASE 2: Yard layout — which parking space (if any) this vehicle is parked on
        parkingSpaceId: data.parkingSpaceId || null,
        // 👤 Parking attribution — who last changed this vehicle's parking state
        parkedBy: data.parkedBy,
        parkedByName: data.parkedByName,
        parkedAt: toDate(data.parkedAt),
      })

      // Initial fetch + re-fetch on any change to this branch's vehicles.
      const refresh = async () => {
        try {
          const { data, error } = await supabase
            .from('checked_in_vehicles')
            .select('*')
            .eq('organization_id', orgId)
            .eq('branch_id', listenBranchId)
            .order('created_at', { ascending: false })
          if (error) throw error

          const vehicles = toCamelList<any>(data).map(mapRow)
          logger.log(`✅ Yard data updated: ${vehicles.length} vehicles`)
          setCheckedInVehicles(vehicles)
          setLoading(false)
          setError(null)
        } catch (err) {
          logger.error('❌ Error in yard data subscription:', err)
          setError('Failed to load vehicles')
          setLoading(false)
        }
      }

      refresh()

      const channel = supabase
        .channel(`checked_in_vehicles:${orgId}:${listenBranchId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'checked_in_vehicles',
            filter: `organization_id=eq.${orgId}`,
          },
          () => {
            refresh()
          },
        )
        .subscribe()

      unsubscribeRef.current = () => {
        supabase.removeChannel(channel)
      }
    }

    // MAIN LOGIC: Decide whether to have a listener or not
    const shouldListen = shouldHaveActiveListener()
    
    logger.log('🎯 Yard data listener decision:', {
      shouldListen,
      hasUser: !!user,
      hasOrg: !!userOrganizationId,
      isVisible,
      isAppActive,
      pathname,
      branchId,
      currentListener: !!unsubscribeRef.current
    })

    if (shouldListen) {
      // Already listening to the right branch → KEEP IT. This is the
      // crucial fix: a pathname/visibility re-render no longer tears the
      // listener down, so navigating between dashboard / fleet /
      // service-bookings costs ZERO extra reads and keeps the live
      // connection hot (no reconnect gap for other users' changes).
      if (unsubscribeRef.current && activeBranchRef.current === branchId) {
        logger.log('ℹ️ Yard listener already active for this branch, keeping it')
      } else {
        // No listener yet, OR the branch genuinely changed → (re)subscribe.
        if (unsubscribeRef.current) {
          logger.log(`🔀 Yard branch changed (${activeBranchRef.current} → ${branchId}) — re-subscribing`)
          cleanupListener()
        } else {
          logger.log('✅ CONDITIONS MET: Setting up yard data listener')
        }
        setupListener()
        activeBranchRef.current = branchId
      }
    } else {
      // We should NOT have a listener - remove it if we have one
      if (unsubscribeRef.current) {
        logger.log('🛑 CONDITIONS NOT MET: Removing yard data listener')
        logger.log('Reason:',
          !user ? 'No user' :
          !userOrganizationId ? 'No org' :
          !isAppActive ? '🔴 APP IN BACKGROUND' :
          !isVisible ? 'Tab hidden' :
          'Wrong page'
        )
        cleanupListener()
        activeBranchRef.current = null
        setLoading(false)
      }
    }

    // NOTE: deliberately NO per-run cleanup return here. Tearing the
    // listener down on every dependency change (pathname feeds
    // shouldHaveActiveListener) is exactly what caused a full collection
    // re-read on every navigation. Genuine teardown is handled above
    // (shouldListen === false) and on true unmount by the effect below.
  }, [shouldHaveActiveListener, userOrganizationId, branchId])

  // True-unmount cleanup ONLY (empty deps → cleans on provider/component
  // teardown, e.g. logout). Does NOT run on pathname/visibility/branch
  // dependency changes, so it cannot cause navigation re-reads.
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 Yard listener: final cleanup on unmount')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      activeBranchRef.current = null
    }
  }, [])

  // Store notification timer reference
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Helper function for sync with ID-based lookups
  const syncToFleet = useCallback(async (
    vehicleId: string | null,
    registration: string,
    contractValue: string | null, 
    contractColorValue: string | null,
    insuranceValue: InsuranceStatus | null,
    conditionValue?: string | null,
    policyId?: string | null,        // ✅ NEW
    policyName?: string | null,      // ✅ NEW
    policyExpiry?: string | null     // ✅ NEW
  ) => {
    if (!userOrganizationId || !user) return

    try {
      // CONDITION SYNC - Add this new section
      if (conditionValue && vehicleId) {
        logger.log('🔄 AUTO-SYNCING CONDITION TO FLEET INVENTORY (ID-based)...', conditionValue)
        
        const conditionSyncResult = await ConditionSyncService.syncConditionFromYardToFleet(
          vehicleId,
          { condition: conditionValue },
          userOrganizationId,
          user.uid,
          userDisplayName,
          true // isVehicleId flag
        )

        if (conditionSyncResult.success) {
          setSyncNotification({
            type: 'success',
            message: ` Bodywork Condition synced to "${conditionValue}"`,
            details: {
              fleetUpdated: conditionSyncResult.updatedFleetRecord,
              yardUpdated: conditionSyncResult.updatedYardRecords,
              syncType: 'condition'
            }
          })
          logger.log('✅ CONDITION AUTO-SYNC SUCCESSFUL (ID-based)')
        }
      } else if (conditionValue && !vehicleId) {
        // Legacy fallback for vehicles without vehicleId
        logger.log('🔄 AUTO-SYNCING CONDITION TO FLEET INVENTORY (legacy)...', conditionValue)
        
        const conditionSyncResult = await ConditionSyncService.syncConditionFromYardToFleet(
          registration,
          { condition: conditionValue },
          userOrganizationId,
          user.uid,
          userDisplayName,
          false // isVehicleId flag
        )

        if (conditionSyncResult.success) {
          setSyncNotification({
            type: 'success',
            message: `Condition "${conditionValue}" automatically synced to fleet inventory!`,
            details: {
              fleetUpdated: conditionSyncResult.updatedFleetRecord,
              yardUpdated: conditionSyncResult.updatedYardRecords,
              syncType: 'condition'
            }
          })
          logger.log('✅ CONDITION AUTO-SYNC SUCCESSFUL (legacy)')
        }
      }

      // Sync contract if provided
      if (contractValue && vehicleId) {
        logger.log('AUTO-SYNCING CONTRACT TO FLEET INVENTORY (ID-based)...', contractValue)
        
        const contractSyncResult = await ContractSyncService.syncContractFromYardToFleet(
          vehicleId, // Use vehicle ID for faster lookup
          { contract: contractValue, contractColor: contractColorValue },
          userOrganizationId,
          user.uid,
          userDisplayName,
          true // isVehicleId flag
        )

        if (contractSyncResult.success) {
          setSyncNotification({
            type: 'success',
            message: `Contract synced to "${contractValue}"`,
            details: {
              fleetUpdated: contractSyncResult.updatedFleetRecord,
              yardUpdated: contractSyncResult.updatedYardRecords,
              syncType: 'contract'
            }
          })
          logger.log('CONTRACT AUTO-SYNC SUCCESSFUL (ID-based)')
        }
      } else if (contractValue && !vehicleId) {
        // Legacy fallback for vehicles without vehicleId
        logger.log('AUTO-SYNCING CONTRACT TO FLEET INVENTORY (legacy)...', contractValue)
        
        const contractSyncResult = await ContractSyncService.syncContractFromYardToFleet(
          registration,
          { contract: contractValue, contractColor: contractColorValue },
          userOrganizationId,
          user.uid,
          userDisplayName,
          false // isVehicleId flag
        )

        if (contractSyncResult.success) {
          setSyncNotification({
            type: 'success',
            message: `CONTRACT "${contractValue}" AUTOMATICALLY SAVED TO FLEET INVENTORY!`,
            details: {
              fleetUpdated: contractSyncResult.updatedFleetRecord,
              yardUpdated: contractSyncResult.updatedYardRecords,
              syncType: 'contract'
            }
          })
          logger.log('CONTRACT AUTO-SYNC SUCCESSFUL (legacy)')
        }
      }

      // Sync insurance if provided
      if (insuranceValue && vehicleId) {
        logger.log('AUTO-SYNCING INSURANCE TO FLEET INVENTORY (ID-based)...', insuranceValue)
        
        const insuranceSyncResult = await InsuranceSyncService.syncInsuranceFromYardToFleet(
          vehicleId,
          {
            insuranceStatus:       insuranceValue,
            insurancePolicyId:     policyId     ?? null,  // ✅ NEW
            insurancePolicyName:   policyName   ?? null,  // ✅ NEW
            insurancePolicyExpiry: policyExpiry ?? null,  // ✅ NEW
          },
          userOrganizationId,
          user.uid,
          userDisplayName,
          true // isVehicleId flag
        )

        if (insuranceSyncResult.success) {
          setSyncNotification({
            type: 'success',
            message: `Insurance status synced to "${insuranceValue}" `,
            details: {
              fleetUpdated: insuranceSyncResult.updatedFleetRecord,
              yardUpdated: insuranceSyncResult.updatedYardRecords,
              syncType: 'insurance'
            }
          })
          logger.log('INSURANCE AUTO-SYNC SUCCESSFUL (ID-based)')
        }
      } else if (insuranceValue && !vehicleId) {
        // Legacy fallback for vehicles without vehicleId
        logger.log('AUTO-SYNCING INSURANCE TO FLEET INVENTORY (legacy)...', insuranceValue)
        
        const insuranceSyncResult = await InsuranceSyncService.syncInsuranceFromYardToFleet(
          registration,
          {
            insuranceStatus:       insuranceValue,
            insurancePolicyId:     policyId     ?? null,  // ✅ NEW
            insurancePolicyName:   policyName   ?? null,  // ✅ NEW
            insurancePolicyExpiry: policyExpiry ?? null,  // ✅ NEW
          },
          userOrganizationId,
          user.uid,
          userDisplayName,
          false // isVehicleId flag
        )

        if (insuranceSyncResult.success) {
          setSyncNotification({
            type: 'success',
            message: `INSURANCE STATUS "${insuranceValue}" AUTOMATICALLY SAVED TO FLEET INVENTORY!`,
            details: {
              fleetUpdated: insuranceSyncResult.updatedFleetRecord,
              yardUpdated: insuranceSyncResult.updatedYardRecords,
              syncType: 'insurance'
            }
          })
          logger.log('INSURANCE AUTO-SYNC SUCCESSFUL (legacy)')
        }
      }

    } catch (syncError) {
      logger.error('Sync error:', syncError)
      setSyncNotification({
        type: 'warning',
        message: 'Vehicle checked in but sync to fleet inventory failed'
      })
    }

    // Clear any existing timer
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current)
    }

    // Set new timer and store reference
    notificationTimerRef.current = setTimeout(() => {
      setSyncNotification(null)
      notificationTimerRef.current = null
    }, 8000)
  }, [user, userOrganizationId, userDisplayName])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
        notificationTimerRef.current = null
      }
    }
  }, [])

  // Getter functions for filtering by hire status
  const getVehiclesInYard = useCallback(() => {
  return checkedInVehicles.filter(vehicle => {
    // Must be marked as "In Yard" for hire status
    const isInYardHireStatus = isVehicleInYard(vehicle)
    
    // Must NOT be in transit or at external garage
    const isNotInTransit = vehicle.transferStatus !== 'in_transit'
    const isNotAtGarage = vehicle.transferStatus !== 'at_external_garage'
    
    // Vehicle is truly "in yard" only if all conditions are met
    return isInYardHireStatus && isNotInTransit && isNotAtGarage
  })
}, [checkedInVehicles])

  const getVehiclesOutOnHire = useCallback(() => {
    return checkedInVehicles.filter(isVehicleOutOnHire)
  }, [checkedInVehicles])

  // Getter functions for filtering by insurance status
  const getInsuredVehicles = useCallback(() => {
    return checkedInVehicles.filter(v => v.insuranceStatus === 'Insured')
  }, [checkedInVehicles])

  const getUninsuredVehicles = useCallback(() => {
    return checkedInVehicles.filter(v => v.insuranceStatus === 'Not Insured')
  }, [checkedInVehicles])

  const getVehiclesWithUnknownInsurance = useCallback(() => {
    return checkedInVehicles.filter(v => !v.insuranceStatus)
  }, [checkedInVehicles])

  // Set Out on Hire functionality with insurance validation
  const setOutOnHire = useCallback(async (data: SetOutOnHireData) => {
    if (!user || !userOrganizationId) throw new Error('User not authenticated')

    try {
      // Get vehicle data first to check insurance status
      const vehicle = checkedInVehicles.find(v => v.id === data.vehicleId)
      if (!vehicle) throw new Error('Vehicle not found')

      // Check insurance status before allowing hire
      if (!canPerformAction(vehicle.insuranceStatus)) {
        throw new Error(`INSURANCE_REQUIRED:${vehicle.registration}`)
      }

      await VehicleHireService.setOutOnHire(
        data.vehicleId,
        user.uid,
        userDisplayName,
        data.hireNotes
      )
      logger.log(`Vehicle set out on hire from branch: ${branchId}`)
    } catch (error) {
      logger.error('Error setting vehicle out on hire:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to set vehicle out on hire'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [user, userOrganizationId, userDisplayName, branchId, checkedInVehicles])

  // Quick Check-In functionality
  const quickCheckIn = useCallback(async (data: QuickCheckInData) => {
    if (!user || !userOrganizationId) throw new Error('User not authenticated')

    try {
      await VehicleHireService.quickCheckIn(
        data.vehicleId,
        user.uid,
        userDisplayName,
        data.returnNotes
      )
      logger.log(`Vehicle returned from hire to branch: ${branchId}`)
    } catch (error) {
      logger.error('Error returning vehicle from hire:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to return vehicle from hire'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [user, userOrganizationId, userDisplayName, branchId])

  // CHECK-IN with ID-based relationships - INCLUDING CONDITION SYNC
  const checkInVehicle = useCallback(async (vehicleData: VehicleCheckInData) => {
    if (!user || !userOrganizationId) throw new Error('User not authenticated')
    
    try {
      const normalizedReg = vehicleData.registration.toUpperCase().replace(/\s+/g, '')
      logger.log(`Checking in ${normalizedReg} to branch: ${branchId}`)

      // Check if vehicle exists in ANY branch
      const { data: allVehiclesRows, error: allVehiclesError } = await supabase
        .from('checked_in_vehicles')
        .select('*')
        .eq('organization_id', userOrganizationId)
      if (allVehiclesError) throw allVehiclesError

      let existingVehicle: any = null
      toCamelList<any>(allVehiclesRows).forEach(data => {
        const existingReg = data.registration?.toUpperCase().replace(/\s+/g, '')
        if (existingReg === normalizedReg) {
          existingVehicle = { ...data }
        }
      })

      if (existingVehicle) {
        // Vehicle exists - check if it's in a different branch
        if (existingVehicle.branchId === branchId) {
          throw new Error(`Vehicle ${vehicleData.registration} is already checked into this branch`)
        }

        // TRANSFER VEHICLE FROM ANOTHER BRANCH
        const fromBranch = await branchService.getBranchBySlug(userOrganizationId, existingVehicle.branchId || 'main')
        const toBranch = await branchService.getBranchBySlug(userOrganizationId, branchId)
        
        logger.log(`TRANSFERRING vehicle from ${fromBranch?.name} to ${toBranch?.name}`)

        // Create audit log for transfer
        const auditLog = createAuditLog(
          `Transferred from ${fromBranch?.name || 'Unknown Branch'} to ${toBranch?.name || 'Unknown Branch'}`,
          user.uid,
          userDisplayName
        )

        // Prepare contract, insurance, and condition values
        const contractValue = vehicleData.contract?.trim() || null
        const contractColorValue = vehicleData.contractColor?.trim() || null
        const insuranceValue = vehicleData.insuranceStatus || null
        const conditionValue = vehicleData.condition?.trim() || null // ADD CONDITION

        // Update the existing vehicle with new data and branch
        {
          const { error: transferError } = await supabase
            .from('checked_in_vehicles')
            .update({
              // PRESERVE VEHICLE ID REFERENCE
              vehicle_id: existingVehicle.vehicleId || vehicleData.vehicleId || null,

              make: safeString(vehicleData.make),
              model: safeString(vehicleData.model),
              colour: safeString(vehicleData.colour),
              size: safeString(vehicleData.size),
              condition: safeString(vehicleData.condition),
              status: vehicleData.status,
              mileage: safeString(vehicleData.mileage),
              notes: safeString(vehicleData.notes),
              comments: safeString(vehicleData.comments),
              contract: contractValue,
              contract_color: contractColorValue,
              insurance_status: insuranceValue,
              mot_expiry: safeString(vehicleData.motExpiry) || null,
              tax_expiry: safeString(vehicleData.taxExpiry) || null,
              branch_id: branchId,
              // ✨ Phase 2.5a: vehicle is in a NEW branch — old parking space ID
              //                is meaningless here (different layout doc). Clear.
              parking_space_id: null,
              // Ensure hire status is set for transfers
              hire_status: 'In Yard' as VehicleHireStatus,
              original_status: null,
              hired_at: null,
              hired_by: null,
              hired_by_name: null,
              hire_notes: null,
              updated_at: new Date().toISOString(),
              last_edit_log: auditLog,
              vehicle_diagram_type: (vehicleData as any).vehicleDiagramType || null,
              damage_pins: (vehicleData as any).damagePins || [],
            })
            .eq('id', existingVehicle.id)
          if (transferError) throw transferError
        }


        logger.log(`Vehicle transferred to ${toBranch?.name}`)

        // Handle sync using vehicle ID if available - INCLUDING CONDITION
        const vehicleIdForSync = existingVehicle.vehicleId || vehicleData.vehicleId
        await syncToFleet(vehicleIdForSync, normalizedReg, contractValue, contractColorValue, insuranceValue, conditionValue)

      } else {
        // NEW VEHICLE - create in current branch
        const auditLog = createCheckInAuditLog(userDisplayName, user.uid)
        const contractValue = vehicleData.contract?.trim() || null
        const contractColorValue = vehicleData.contractColor?.trim() || null
        const insuranceValue = vehicleData.insuranceStatus || null
        const conditionValue = vehicleData.condition?.trim() || null // ADD CONDITION
        
        // Try to find fleet vehicle by registration to get vehicle ID
        let fleetVehicleId = vehicleData.vehicleId || null
        
        if (!fleetVehicleId && userOrganizationId) {
          try {
            const fleetVehicle = await vehicleService.getVehicleByRegistration(userOrganizationId, normalizedReg)
            if (fleetVehicle) {
              fleetVehicleId = fleetVehicle.id!
              logger.log(`Found fleet vehicle ID for ${normalizedReg}: ${fleetVehicleId}`)
            }
          } catch (error) {
            logger.log(`Could not find fleet vehicle for ${normalizedReg}, proceeding without ID reference`)
          }
        }
        
        const nowIso = new Date().toISOString()
        const checkInData = {
          // Store reference to fleet vehicle
          vehicle_id: fleetVehicleId,

          registration: normalizedReg,
          make: safeString(vehicleData.make),
          model: safeString(vehicleData.model),
          colour: safeString(vehicleData.colour),
          size: safeString(vehicleData.size),
          condition: safeString(vehicleData.condition),
          status: vehicleData.status,
          mileage: safeString(vehicleData.mileage),
          notes: safeString(vehicleData.notes),
          comments: safeString(vehicleData.comments),
          contract: contractValue,
          contract_color: contractColorValue,
          insurance_status: insuranceValue,
          mot_expiry: safeString(vehicleData.motExpiry) || null,
          tax_expiry: safeString(vehicleData.taxExpiry) || null,
          branch_id: branchId,
          // Set default hire status for new vehicles
          hire_status: 'In Yard' as VehicleHireStatus,
          original_status: null,
          hired_at: null,
          hired_by: null,
          hired_by_name: null,
          hire_notes: null,
          user_id: user.uid,
          organization_id: userOrganizationId,
          created_at: nowIso,
          updated_at: nowIso,
          check_in_time: nowIso,
          last_edit_log: auditLog,
          vehicle_diagram_type: (vehicleData as any).vehicleDiagramType || null,
          damage_pins: (vehicleData as any).damagePins || [],
        }

        const { error: insertError } = await supabase
          .from('checked_in_vehicles')
          .insert(checkInData)
        if (insertError) throw insertError
        logger.log(`New vehicle checked into branch: ${branchId}`)

        // Handle sync using vehicle ID if available - INCLUDING CONDITION
        await syncToFleet(fleetVehicleId, normalizedReg, contractValue, contractColorValue, insuranceValue, conditionValue)
      }
    } catch (err) {
      logger.error('Check-in error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to check in vehicle'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [user, userOrganizationId, branchId, userDisplayName, syncToFleet])

  // CHECK-OUT vehicle with insurance validation - FIXED: Now preserves insurance status
  const checkOutVehicle = useCallback(async (vehicleId: string) => {
    if (!user || !userOrganizationId) throw new Error('User not authenticated')
    if (!vehicleId || typeof vehicleId !== 'string') throw new Error('Invalid vehicle ID')

    try {
      const vehicle = checkedInVehicles.find(v => v.id === vehicleId)
      if (!vehicle) {
        throw new Error('Vehicle not found')
      }

      // Check insurance status before allowing checkout
      if (!canPerformAction(vehicle.insuranceStatus)) {
        throw new Error(`INSURANCE_REQUIRED:${vehicle.registration}`)
      }

      logger.log(`Checking out vehicle ${vehicle.registration} from branch: ${branchId}`)

      // Build checkout record - FIXED: Now includes insurance status
      const checkoutRecord: any = {
        registration: vehicle.registration,
        make: vehicle.make,
        model: vehicle.model,
        size: vehicle.size,
        condition: vehicle.condition,
        status: vehicle.status,
        branchId: vehicle.branchId || branchId,
        checkedOutDate: new Date(),
        checkedOutBy: user.uid,
        checkedOutByName: userDisplayName,
        organizationId: userOrganizationId,
        originalCheckInDate: vehicle.checkInTime || vehicle.createdAt || new Date(),
        originalCheckedInBy: vehicle.userId,
        originalCheckedInByName: vehicle.lastEditLog?.byDisplayName || userDisplayName,

        // Store vehicle ID reference
        vehicleId: vehicle.vehicleId || null
      }

      // Add optional fields - FIXED: Now includes insuranceStatus
      if (vehicle.colour) checkoutRecord.colour = vehicle.colour
      if (vehicle.mileage) checkoutRecord.mileage = vehicle.mileage
      if (vehicle.contract) checkoutRecord.contract = vehicle.contract
      if (vehicle.contractColor) checkoutRecord.contractColor = vehicle.contractColor
      if (vehicle.insuranceStatus) checkoutRecord.insuranceStatus = vehicle.insuranceStatus // FIXED: Now preserving insurance status
      if (vehicle.motExpiry) checkoutRecord.motExpiry = vehicle.motExpiry
      if (vehicle.taxExpiry) checkoutRecord.taxExpiry = vehicle.taxExpiry
      if (vehicle.notes) checkoutRecord.notes = vehicle.notes
      if (vehicle.comments) checkoutRecord.comments = vehicle.comments

      // Save to checkout history
      const cleanedCheckoutRecord = cleanDataForFirebase(checkoutRecord)
      await checkoutHistoryService.addCheckoutRecord(cleanedCheckoutRecord as any)

      // Create audit log and update vehicle before deletion
      const auditLog = createCheckOutAuditLog(userDisplayName, user.uid)

      {
        const { error: updError } = await supabase
          .from('checked_in_vehicles')
          .update({
            last_edit_log: auditLog,
            // ✨ Phase 2.5a: clear parking space first so the slot frees up
            //                immediately even before the doc is fully deleted.
            parking_space_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vehicleId)
        if (updError) throw updError
      }

      // Small delay to ensure audit log is saved, then delete
      setTimeout(async () => {
        await supabase.from('checked_in_vehicles').delete().eq('id', vehicleId)
        logger.log(`Vehicle checked out from branch: ${branchId}`)
      }, 100)
      
    } catch (err) {
      logger.error('Checkout error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to check out vehicle'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [user, userOrganizationId, branchId, userDisplayName, checkedInVehicles])

  // UPDATE vehicle with improved sync support - INCLUDING CONDITION SYNC
  const updateVehicleConditionAndStatus = useCallback(async (vehicleId: string, updates: {
    condition?: string
    status?: VehicleStatus
    comments?: string
    notes?: string
    mileage?: string
    contract?: string | null
    contractColor?: string | null
    insuranceStatus?: InsuranceStatus | null
    insurancePolicyId?: string | null        // ✅ NEW
    insurancePolicyName?: string | null      // ✅ NEW
    insurancePolicyExpiry?: string | null    // ✅ NEW
    motExpiry?: string
    taxExpiry?: string
    createdAt?: Date
    checkInTime?: Date
      damagePins?: any[]   // ← ADD THIS

    
  }) => {
    if (!user || !userOrganizationId) throw new Error('User not authenticated')
    if (!vehicleId || typeof vehicleId !== 'string') throw new Error('Invalid vehicle ID')

    try {
      // First, get the full vehicle record to access vehicleId reference
      const { data: vehicleRow, error: vehicleFetchError } = await supabase
        .from('checked_in_vehicles')
        .select('*')
        .eq('id', vehicleId)
        .maybeSingle()
      if (vehicleFetchError) throw vehicleFetchError

      if (!vehicleRow) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = toCamel<any>(vehicleRow)!
      const vehicleIdForSync = vehicleData.vehicleId // Get the fleet vehicle ID reference
      const registration = vehicleData.registration

      logger.log('🔍 Vehicle data for sync:', {
        documentId: vehicleId,
        fleetVehicleId: vehicleIdForSync,
        registration: registration,
        currentCondition: vehicleData.condition,
        newCondition: updates.condition
      })

      const updateData: any = {
  updatedAt: new Date().toISOString(),
  branchId: branchId,
  ...(updates.damagePins !== undefined && { damagePins: updates.damagePins })
}

      // Track what's being changed for audit log
      const changes: Record<string, any> = {}
      let contractChanged = false
      let insuranceChanged = false
      let conditionChanged = false // ADD CONDITION TRACKING

      if (updates.condition !== undefined && updates.condition !== vehicleData.condition) {
        updateData.condition = safeString(updates.condition)
        changes.condition = updates.condition
        conditionChanged = true // TRACK CONDITION CHANGE
        logger.log('✅ Condition change detected:', vehicleData.condition, '→', updates.condition)
      }
      
      if (updates.status !== undefined) {
        updateData.status = updates.status
        changes.status = updates.status
        
        // If vehicle is out on hire, update the original status instead
        if (vehicleData.hireStatus === 'Out on Hire') {
          updateData.originalStatus = updates.status
          // Don't change the current status, keep it as is
          delete updateData.status
        }
      }
      
      if (updates.comments !== undefined) {
        updateData.comments = updates.comments === '' || updates.comments === null ? '' : safeString(updates.comments)
        changes.comments = updates.comments
      }
      
      if (updates.notes !== undefined) {
        updateData.notes = updates.notes === '' || updates.notes === null ? '' : safeString(updates.notes)
        changes.notes = updates.notes
      }
      
      if (updates.mileage !== undefined) {
        updateData.mileage = safeString(updates.mileage)
        changes.mileage = updates.mileage
      }
      
      if (updates.motExpiry !== undefined) {
        updateData.motExpiry = safeString(updates.motExpiry)
        changes.motExpiry = updates.motExpiry
      }
      
      if (updates.taxExpiry !== undefined) {
        updateData.taxExpiry = safeString(updates.taxExpiry)
        changes.taxExpiry = updates.taxExpiry
      }
      
      // Handle contract updates
      if (updates.contract !== undefined) {
        const newContract = updates.contract?.trim() || null
        const oldContract = vehicleData.contract?.trim() || null
        
        if (newContract !== oldContract) {
          contractChanged = true
          updateData.contract = newContract
          changes.contract = newContract
        }
      }
      
      if (updates.contractColor !== undefined) {
        updateData.contractColor = updates.contractColor?.trim() || null
        changes.contractColor = updates.contractColor
      }

      // Handle insurance status updates
      if (updates.insuranceStatus !== undefined) {
        const newInsurance = updates.insuranceStatus
        const oldInsurance = vehicleData.insuranceStatus
        
        if (newInsurance !== oldInsurance) {
          insuranceChanged = true
          updateData.insuranceStatus = newInsurance
          changes.insuranceStatus = newInsurance
        }
      }

      // ✅ NEW: Always write policy fields alongside insurance status
      if (updates.insurancePolicyId !== undefined)     updateData.insurancePolicyId     = updates.insurancePolicyId     ?? null
      if (updates.insurancePolicyName !== undefined)   updateData.insurancePolicyName   = updates.insurancePolicyName   ?? null
      if (updates.insurancePolicyExpiry !== undefined) updateData.insurancePolicyExpiry = updates.insurancePolicyExpiry ?? null
      
      if (updates.createdAt !== undefined) {
        updateData.createdAt = updates.createdAt
        changes.createdAt = updates.createdAt
      }
      
      if (updates.checkInTime !== undefined) {
        updateData.checkInTime = updates.checkInTime
        changes.checkInTime = updates.checkInTime
      }

      logger.log(`📝 Updating vehicle in branch [${branchId}]:`, vehicleId, updateData)

      // Generate audit log
      const auditAction = conditionChanged
        ? `Condition updated to "${updateData.condition}"`
        : contractChanged 
        ? `Contract ${updateData.contract ? 'updated to' : 'removed from'} ${updateData.contract || 'vehicle'}`
        : insuranceChanged
        ? `Insurance status ${updateData.insuranceStatus ? 'updated to' : 'removed from'} ${updateData.insuranceStatus || 'vehicle'}`
        : generateAuditAction(changes, userDisplayName)
      
      const auditLog = createAuditLog(auditAction, user.uid, userDisplayName)
      updateData.lastEditLog = auditLog

      // Update the vehicle in the database
      {
        const { error: updError } = await supabase
          .from('checked_in_vehicles')
          .update(toSnake(updateData))
          .eq('id', vehicleId)
        if (updError) throw updError
      }
      logger.log(`✅ Vehicle updated in branch: ${branchId}`)

      // CONDITION SYNC - FIXED SECTION
      if (conditionChanged && registration) {
        logger.log('🔄 AUTO-SYNCING CONDITION TO FLEET INVENTORY...', {
          condition: updateData.condition,
          vehicleIdForSync,
          registration
        })
        
        try {
          let conditionSyncResult
          
          if (vehicleIdForSync) {
            // ID-based sync (fastest)
            logger.log('Using ID-based sync with vehicleId:', vehicleIdForSync)
            conditionSyncResult = await ConditionSyncService.syncConditionFromYardToFleet(
              vehicleIdForSync,
              { condition: updateData.condition },
              userOrganizationId,
              user.uid,
              userDisplayName,
              true // isVehicleId flag
            )
          } else {
            // Registration-based sync (fallback)
            logger.log('Using registration-based sync with registration:', registration)
            conditionSyncResult = await ConditionSyncService.syncConditionFromYardToFleet(
              registration,
              { condition: updateData.condition },
              userOrganizationId,
              user.uid,
              userDisplayName,
              false // isVehicleId flag
            )
          }

          if (conditionSyncResult?.success) {
            logger.log('✅ CONDITION AUTO-SYNC SUCCESSFUL', conditionSyncResult)
            setSyncNotification({
              type: 'success',
              message: `Condition "${updateData.condition}" synced to fleet inventory!`,
              details: {
                fleetUpdated: conditionSyncResult.updatedFleetRecord,
                yardUpdated: conditionSyncResult.updatedYardRecords,
                syncType: 'condition'
              }
            })
            
            // Clear notification after delay
            setTimeout(() => setSyncNotification(null), 5000)
          } else {
            logger.log('⚠️ Condition sync returned unsuccessful result:', conditionSyncResult)
          }
        } catch (syncError) {
          logger.error('❌ Condition sync error:', syncError)
          // Don't throw - update succeeded even if sync failed
        }
      }

      // Handle contract sync if changed (existing logic)
      if (contractChanged && registration) {
        await syncToFleet(
          vehicleIdForSync || null,
          registration,
          updateData.contract || null,
          updateData.contractColor || null,
          null, // No insurance change in this sync
          null  // No condition change in this sync (already handled)
        )
      }

      // Handle insurance sync if changed (existing logic)
      if (insuranceChanged && registration) {
        await syncToFleet(
          vehicleIdForSync || null,
          registration,
          null,
          null,
          updateData.insuranceStatus || null,
          null,
          updateData.insurancePolicyId     ?? null,  // ✅ NEW
          updateData.insurancePolicyName   ?? null,  // ✅ NEW
          updateData.insurancePolicyExpiry ?? null   // ✅ NEW
        )
      }

      // Handle damage pins sync if changed
if (updates.damagePins !== undefined && vehicleIdForSync) {
  try {
    const { DamageSyncService } = await import('@/services/damageSyncService')
    await DamageSyncService.syncDamageFromYardToFleet(
      vehicleIdForSync,
      updates.damagePins,
      userOrganizationId,
      user.uid,
      userDisplayName,
      true
    )
    logger.log('✅ Damage pins synced to fleet')
  } catch (syncError) {
    logger.error('❌ Damage pins sync error:', syncError)
    // Non-critical - don't throw
  }
}
      
    } catch (err) {
      logger.error('Database update error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to update vehicle'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [user, userOrganizationId, branchId, userDisplayName, syncToFleet, setSyncNotification])

  // BULK CHECKOUT with insurance validation - FIXED: Now preserves insurance status
  const bulkCheckout = useCallback(async (vehicleIds: string[]) => {
    if (!user || !userOrganizationId) throw new Error('User not authenticated')
    if (!vehicleIds || vehicleIds.length === 0) throw new Error('No vehicles selected')

    try {
      // Check insurance status for all vehicles first
      const uninsuredVehicles: string[] = []
      const validVehicles: CheckedInVehicle[] = []
      
      vehicleIds.forEach(id => {
        const vehicle = checkedInVehicles.find(v => v.id === id)
        if (vehicle) {
          if (!canPerformAction(vehicle.insuranceStatus)) {
            uninsuredVehicles.push(vehicle.registration)
          } else {
            validVehicles.push(vehicle)
          }
        }
      })

      // If any vehicles are uninsured, throw error with details
      if (uninsuredVehicles.length > 0) {
        throw new Error(`INSURANCE_REQUIRED_BULK:${uninsuredVehicles.join(', ')}`)
      }

      logger.log(`Starting bulk checkout for ${validVehicles.length} vehicles from branch: ${branchId}`)

      const auditLog = createCheckOutAuditLog(userDisplayName, user.uid)

      for (const vehicle of validVehicles) {
        // Build checkout record - FIXED: Now includes insurance status
        const checkoutRecord: any = {
          registration: vehicle.registration,
          make: vehicle.make,
          model: vehicle.model,
          size: vehicle.size,
          condition: vehicle.condition,
          status: vehicle.status,
          branchId: vehicle.branchId || branchId,
          checkedOutDate: new Date(),
          checkedOutBy: user.uid,
          checkedOutByName: userDisplayName,
          organizationId: userOrganizationId,
          originalCheckInDate: vehicle.checkInTime || vehicle.createdAt || new Date(),
          originalCheckedInBy: vehicle.userId,
          originalCheckedInByName: vehicle.lastEditLog?.byDisplayName || userDisplayName,

          // Store vehicle ID reference
          vehicleId: vehicle.vehicleId || null
        }

        // Add optional fields - FIXED: Now includes insuranceStatus
        if (vehicle.colour) checkoutRecord.colour = vehicle.colour
        if (vehicle.mileage) checkoutRecord.mileage = vehicle.mileage
        if (vehicle.contract) checkoutRecord.contract = vehicle.contract
        if (vehicle.contractColor) checkoutRecord.contractColor = vehicle.contractColor
        if (vehicle.insuranceStatus) checkoutRecord.insuranceStatus = vehicle.insuranceStatus // FIXED: Now preserving insurance status
        if (vehicle.motExpiry) checkoutRecord.motExpiry = vehicle.motExpiry
        if (vehicle.taxExpiry) checkoutRecord.taxExpiry = vehicle.taxExpiry
        if (vehicle.notes) checkoutRecord.notes = vehicle.notes
        if (vehicle.comments) checkoutRecord.comments = vehicle.comments

        // Save to checkout history
        const cleanedCheckoutRecord = cleanDataForFirebase(checkoutRecord)
        await checkoutHistoryService.addCheckoutRecord(cleanedCheckoutRecord as any)

        // Update with audit log
        const { error: updError } = await supabase
          .from('checked_in_vehicles')
          .update({
            last_edit_log: auditLog,
            // ✨ Phase 2.5a: clear parking space — vehicle is leaving the yard
            parking_space_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vehicle.id)
        if (updError) throw updError
      }

      logger.log('Bulk checkout updates committed')

      // Delete after a short delay
      setTimeout(async () => {
        const idsToDelete = validVehicles.map(v => v.id)
        await supabase.from('checked_in_vehicles').delete().in('id', idsToDelete)
        logger.log(`${validVehicles.length} vehicles checked out from branch: ${branchId}`)
      }, 100)
      
    } catch (err) {
      logger.error('Bulk checkout error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to bulk checkout vehicles'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [user, userOrganizationId, branchId, userDisplayName, checkedInVehicles])

  // Analytics helper functions (updated to include insurance breakdown)
  const getCheckedInByCondition = () => {
    const inYardVehicles = getVehiclesInYard()
    return inYardVehicles.reduce((acc, vehicle) => {
      const condition = safeString(vehicle.condition) || 'Unknown'
      acc[condition] = (acc[condition] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  const getCheckedInByLocation = () => {
    const inYardVehicles = getVehiclesInYard()
    return inYardVehicles.reduce((acc, vehicle) => {
      const location = safeString(vehicle.location) || 'Unspecified'
      acc[location] = (acc[location] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  const getCheckedInBySize = () => {
    const inYardVehicles = getVehiclesInYard()
    return inYardVehicles.reduce((acc, vehicle) => {
      const size = safeString(vehicle.size) || 'Unspecified'
      acc[size] = (acc[size] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  const getCheckedInByContract = () => {
    const inYardVehicles = getVehiclesInYard()
    return inYardVehicles.reduce((acc, vehicle) => {
      const contract = vehicle.contract && vehicle.contract.trim() !== '' 
        ? vehicle.contract 
        : 'No Contract'
      acc[contract] = (acc[contract] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  // Insurance breakdown analytics
  const getCheckedInByInsurance = () => {
    const inYardVehicles = getVehiclesInYard()
    return inYardVehicles.reduce((acc, vehicle) => {
      const insurance = vehicle.insuranceStatus || 'Unknown'
      acc[insurance] = (acc[insurance] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  const getVehiclesByStatus = (status: string) => {
    if (!status) return []
    const normalizedStatus = normalizeStatus(status)
    // Only count vehicles that are in the yard for status analytics
    return getVehiclesInYard().filter(vehicle => vehicle.status === normalizedStatus)
  }

  const getVehiclesByCondition = (condition: string) => {
    if (!condition) return []
    // Only count vehicles that are in the yard
    return getVehiclesInYard().filter(vehicle => safeEquals(vehicle.condition, condition))
  }

  const getVehicleById = (vehicleId: string) => {
    return checkedInVehicles.find(vehicle => vehicle.id === vehicleId) || null
  }

  const getStatusBreakdown = () => {
    const inYardVehicles = getVehiclesInYard()
    return inYardVehicles.reduce((acc, vehicle) => {
      const status = vehicle.status || 'Pending checks'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  const getMileageAnalytics = () => {
    const inYardVehicles = getVehiclesInYard()
    const validMileages = inYardVehicles
      .map(v => parseFloat(safeString(v.mileage).replace(/,/g, '')))
      .filter(m => !isNaN(m) && m > 0)

    return {
      avgMileage: validMileages.length > 0 
        ? Math.round(validMileages.reduce((sum, m) => sum + m, 0) / validMileages.length)
        : 0
    }
  }

  const getExpiryAnalytics = () => {
    const inYardVehicles = getVehiclesInYard()
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000))

    return {
      motExpiringCount: inYardVehicles.filter(v => {
        if (!v.motExpiry) return false
        try {
          const motDate = new Date(v.motExpiry)
          return motDate <= thirtyDaysFromNow && motDate >= now
        } catch {
          return false
        }
      }).length,
      
      taxExpiringCount: inYardVehicles.filter(v => {
        if (!v.taxExpiry) return false
        try {
          const taxDate = new Date(v.taxExpiry)
          return taxDate <= thirtyDaysFromNow && taxDate >= now
        } catch {
          return false
        }
      }).length
    }
  }

  // Analytics to include insurance data + hire data
  const getAnalytics = (): Analytics => {
    const inYardVehicles = getVehiclesInYard()
    const outOnHireVehicles = getVehiclesOutOnHire()
    const insuredVehicles = getInsuredVehicles()
    const uninsuredVehicles = getUninsuredVehicles()
    const unknownInsuranceVehicles = getVehiclesWithUnknownInsurance()

    return {
      totalCount: checkedInVehicles.length, // Total vehicles in system
      inYardCount: inYardVehicles.length,   // Vehicles physically in yard
      outOnHireCount: outOnHireVehicles.length, // Vehicles out on hire
      
      // Insurance counts
      insuredCount: insuredVehicles.length,
      notInsuredCount: uninsuredVehicles.length,
      unknownInsuranceCount: unknownInsuranceVehicles.length,
      
      // Status counts only include vehicles in yard
      readyCount: getVehiclesByStatus('Ready').length,
      pendingChecksCount: getVehiclesByStatus('Pending checks').length,
      repairsNeededCount: getVehiclesByStatus('Repairs needed').length,
      nonStarterCount: getVehiclesByStatus('Non-Starter').length,
      needsCheckingCount: getVehiclesByStatus('Pending checks').length, // Legacy support
      
      ...getMileageAnalytics(),
      ...getExpiryAnalytics(),
      
      conditionBreakdown: getCheckedInByCondition(),
      locationBreakdown: getCheckedInByLocation(),
      sizeBreakdown: getCheckedInBySize(),
      statusBreakdown: getStatusBreakdown(),
      contractBreakdown: getCheckedInByContract(),
      insuranceBreakdown: getCheckedInByInsurance(),
      
      statusCounts: {
        ready: getVehiclesByStatus('Ready').length,
        pendingChecks: getVehiclesByStatus('Pending checks').length,
        repairsNeeded: getVehiclesByStatus('Repairs needed').length,
        nonStarter: getVehiclesByStatus('Non-Starter').length
      },
      
      statusPercentages: (() => {
        const total = inYardVehicles.length || 1 // Only count in-yard vehicles
        return {
          ready: Math.round((getVehiclesByStatus('Ready').length / total) * 100),
          pendingChecks: Math.round((getVehiclesByStatus('Pending checks').length / total) * 100),
          repairsNeeded: Math.round((getVehiclesByStatus('Repairs needed').length / total) * 100),
          nonStarter: Math.round((getVehiclesByStatus('Non-Starter').length / total) * 100)
        }
      })(),
      
      hireAnalytics: {
        totalOutOnHire: outOnHireVehicles.length,
        totalInYard: inYardVehicles.length,
        hiresByBranch: { [branchId]: outOnHireVehicles.length },
        averageHireDuration: 0, // Calculate if needed
        currentHires: outOnHireVehicles
      },
      
      todayCheckIns: 0,
      weekCheckIns: 0,
      averageStayTime: 0
    }
  }

  const clearError = () => {
    setError(null)
  }

  const clearSyncNotification = () => {
    setSyncNotification(null)
  }

  // Return everything including new insurance functionality
  return {
    // State
    checkedInVehicles,
    vehiclesInYard: getVehiclesInYard(),
    vehiclesOutOnHire: getVehiclesOutOnHire(),
    loading,
    error,
    analytics: getAnalytics(),
    userOrganizationId,
    userDisplayName,
    
    // Sync notification (combined contract + insurance + condition)
    syncNotification,
    clearSyncNotification,
    
    // Core Actions
    checkInVehicle,
    checkOutVehicle,
    updateVehicleConditionAndStatus,
    bulkCheckout,
    
    // Hire Actions
    setOutOnHire,
    quickCheckIn,
    
    // Insurance Query Functions
    getInsuredVehicles,
    getUninsuredVehicles,
    getVehiclesWithUnknownInsurance,
    getCheckedInByInsurance,
    
    // Query Functions
    getCheckedInByCondition,
    getCheckedInByLocation,
    getCheckedInBySize,
    getCheckedInByContract,
    getVehiclesByCondition,
    getVehiclesByStatus,
    getVehicleById,
    getVehiclesInYard,
    getVehiclesOutOnHire,
    
    // Utility Functions
    clearError,
    normalizeStatus,
    
    // Branch info
    currentBranchId: branchId
  }
}