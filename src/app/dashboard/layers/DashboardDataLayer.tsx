// src/app/dashboard/layers/DashboardDataLayer.tsx
// Handles all data fetching, state management, and computed values
// ✅ OPTIMIZED: Uses useIncomingTransfers for efficient incoming transfer loading

import { useMemo, useState, useEffect } from 'react'
import { useFleetData } from '@/hooks/useFleetData'
import { useYardData } from '@/contexts/YardDataContext'
import { useConditionManagement } from '@/hooks/useConditionManagement'
import { useServiceBookings } from '@/hooks/useServiceBookings'
import { useDashboardLogic } from '@/hooks/features/useDashboardLogic'
import { usePagination } from '@/hooks/common/usePagination'
import { useBranches } from '@/hooks/useBranches'
import { useIncomingTransfers } from '@/hooks/useIncomingTransfers' // ✅ NEW: Optimized incoming transfers
import { userProfileService } from '@/lib/firestore'
import { updateConditionLookup } from '@/lib/conditionUtils'
import type { 
  VehicleStatus, 
  CheckedInVehicle,
  Analytics,
  UserProfile
} from '@/types'
import { logger } from '@/lib/logger'

// Local type definitions
interface LocalFleetVehicle {
  id: string
  registration: string
  make: string
  model: string
  colour?: string
  size: string
  motExpiry?: string
  taxExpiry?: string
  comments?: string
  condition: string
  organizationId: string
  createdBy: string
  createdAt: Date | string
  contract?: string | null
  contractColor?: string | null
  insuranceStatus?: string | null
  vehicleDiagramType?: string | null
  damagePins?: any[]
}

interface LocalConditionCategory {
  id: string
  name: string
  organizationId: string
  isDefault: boolean
  createdAt: Date | string
  color?: string
}

interface ServiceBooking {
  id: string
  date: string
  timeSlot?: string
  customTime?: string
  registration: string
  make?: string
  model?: string
  workRequired: string | string[]
  isCustomVehicle: boolean
  notes?: string
  organizationId: string
  createdBy: string
  createdByName: string
  createdAt: Date
  updatedAt?: Date
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'checked_in_to_garage'
  isExternalProvider?: boolean
  externalProvider?: {
    garageName: string
    address: string
    customTime?: string
  }
  checkedInToGarageAt?: Date
  checkedInToGarageBy?: string
  checkedInToGarageByName?: string
}

// Default analytics object
const DEFAULT_ANALYTICS: Analytics = {
  totalCount: 0,
  readyCount: 0,
  needsCheckingCount: 0,
  pendingChecksCount: 0,
  repairsNeededCount: 0,
  nonStarterCount: 0,
  inYardCount: 0,
  outOnHireCount: 0,
  avgMileage: 0,
  motExpiringCount: 0,
  taxExpiringCount: 0,
  conditionBreakdown: {},
  locationBreakdown: {},
  sizeBreakdown: {},
  statusBreakdown: {},
  contractBreakdown: {},
  statusCounts: {
    ready: 0,
    pendingChecks: 0,
    repairsNeeded: 0,
    nonStarter: 0
  },
  statusPercentages: {
    ready: 0,
    pendingChecks: 0,
    repairsNeeded: 0,
    nonStarter: 0
  },
  hireAnalytics: {
    totalOutOnHire: 0,
    totalInYard: 0,
    hiresByBranch: {},
    averageHireDuration: 0,
    currentHires: []
  },
  insuredCount: 0,
  notInsuredCount: 0,
  unknownInsuranceCount: 0,
  insuranceBreakdown: {},
  todayCheckIns: 0,
  weekCheckIns: 0,
  averageStayTime: 0
}

// Helper function for vehicle status determination
function determineVehicleStatus(vehicle: any): VehicleStatus {
  if (vehicle.status && ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter'].includes(vehicle.status)) {
    return vehicle.status as VehicleStatus
  }
  return 'Pending checks'
}

interface DashboardDataLayerProps {
  userId?: string
  branchId?: string
}

export function useDashboardDataLayer({ userId, branchId = 'main' }: DashboardDataLayerProps) {
  // User profile state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  
  // Data refresh management
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  // Branch data
  const { branches, getBranchBySlug } = useBranches()
  const [currentBranch, setCurrentBranch] = useState<any>(null)
  
  const memoizedBranchId = useMemo(() => branchId, [branchId])
  
  // Load user profile
  useEffect(() => {
    let isMounted = true

    const loadUserProfile = async () => {
      if (!userId) {
        if (isMounted) {
          setUserProfile(null)
          setProfileLoading(false)
        }
        return
      }

      try {
        const profile = await userProfileService.getProfile(userId)
        if (isMounted) {
          setUserProfile(profile)
        }
      } catch (error) {
        logger.error('Failed to load user profile:', error)
        if (isMounted) {
          setUserProfile(null)
        }
      } finally {
        if (isMounted) {
          setProfileLoading(false)
        }
      }
    }

    loadUserProfile()

    return () => {
      isMounted = false
    }
  }, [userId])
  
  // Load branch data
  useEffect(() => {
    let isMounted = true

    const loadBranch = async () => {
      if (!userId) {
        if (isMounted) setCurrentBranch(null)
        return
      }

      try {
        const branch = await getBranchBySlug(memoizedBranchId)
        if (isMounted) {
          setCurrentBranch(branch)
        }
      } catch (error) {
        logger.error('Failed to load branch:', error)
        if (isMounted) {
          setCurrentBranch(null)
        }
      }
    }

    loadBranch()

    return () => {
      isMounted = false
    }
  }, [memoizedBranchId, getBranchBySlug, userId])
  
  // Data hooks
  const fleetData = useFleetData()
  
  // Shared yard data — single provider-owned listener (branch derived
  // from the URL inside YardDataProvider, same value memoizedBranchId
  // resolves to here).
  const yardData = useYardData()
  
  // ✅ NEW: Optimized incoming transfers hook - only loads vehicles targeting this branch
  const { 
    incomingVehicles, 
    loading: incomingTransfersLoading 
  } = useIncomingTransfers({ branchId: memoizedBranchId })
  
  const { conditions: conditionCategories, loading: conditionsLoading } = useConditionManagement()
  const { bookings: rawServiceBookings, loading: serviceBookingsLoading } = useServiceBookings()

  // Process service bookings
  const serviceBookings: ServiceBooking[] = useMemo(() => {
    if (!rawServiceBookings) return []
    return rawServiceBookings.map(booking => ({
      id: booking.id,
      date: booking.date,
      timeSlot: booking.timeSlot,
      customTime: (booking as any).customTime,
      registration: booking.registration,
      make: booking.make,
      model: booking.model,
      workRequired: booking.workRequired,
      isCustomVehicle: booking.isCustomVehicle,
      notes: booking.notes,
      organizationId: booking.organizationId,
      createdBy: booking.createdBy,
      createdByName: booking.createdByName,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      status: booking.status as any,
      isExternalProvider: booking.isExternalProvider,
      externalProvider: booking.externalProvider && booking.externalProvider.garageName ? {
        garageName: booking.externalProvider.garageName,
        address: booking.externalProvider.address || '',
        customTime: (booking.externalProvider as any).customTime || ''
      } : undefined,
      checkedInToGarageAt: (booking as any).checkedInToGarageAt,
      checkedInToGarageBy: (booking as any).checkedInToGarageBy,
      checkedInToGarageByName: (booking as any).checkedInToGarageByName
    }))
  }, [rawServiceBookings])

  // Process fleet vehicles
  const fleetVehicles: LocalFleetVehicle[] = useMemo(() => {
    if (!fleetData?.vehicles) return []
    return fleetData.vehicles
      .filter(vehicle => vehicle.id && (vehicle as any).isDefleeted !== true && (vehicle as any).currentStatus !== 'defleeted')
      .map(vehicle => ({
        id: vehicle.id!,
        registration: vehicle.registration || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        colour: vehicle.colour || '',
        size: vehicle.size || '',
        motExpiry: vehicle.motExpiry || '',
        taxExpiry: vehicle.taxExpiry || '',
        comments: vehicle.comments || '',
        condition: vehicle.condition || '',
        organizationId: vehicle.organizationId || '',
        createdBy: vehicle.createdBy || '',
        createdAt: vehicle.createdAt || new Date(),
        contract: (vehicle as any).contract || null,
        contractColor: (vehicle as any).contractColor || null,
        insuranceStatus: (vehicle as any).insuranceStatus || null,
        vehicleDiagramType: (vehicle as any).vehicleDiagramType || null,
        damagePins: (vehicle as any).damagePins || [],
      }))
  }, [fleetData?.vehicles])

  // Process conditions
  const conditions: LocalConditionCategory[] = useMemo(() => {
    if (!conditionCategories || conditionCategories.length === 0) return []
    return conditionCategories.map(condition => ({
      id: condition.id,
      name: condition.name,
      organizationId: condition.organizationId,
      isDefault: condition.isDefault || false,
      createdAt: condition.createdAt || new Date(),
      color: condition.color
    }))
  }, [conditionCategories])

  // Extract vehicle data
  const checkedInVehicles = useMemo(() => yardData?.checkedInVehicles || [], [yardData?.checkedInVehicles])
  const vehiclesInYard = useMemo(() => yardData?.vehiclesInYard || [], [yardData?.vehiclesInYard])
  const vehiclesOutOnHire = useMemo(() => yardData?.vehiclesOutOnHire || [], [yardData?.vehiclesOutOnHire])
  const analytics = useMemo(() => yardData?.analytics || DEFAULT_ANALYTICS, [yardData?.analytics])

  // Dashboard logic hook
  const dashboardLogic = useDashboardLogic(vehiclesInYard, analytics)

  // Filter vehicles out on hire
  const filteredVehiclesOutOnHire = useMemo(() => {
    if (!dashboardLogic.filters.search) {
      return vehiclesOutOnHire
    }

    const searchTerm = dashboardLogic.filters.search.toLowerCase().trim()
    
    return vehiclesOutOnHire.filter(vehicle => {
      const searchableFields = [
        vehicle.registration,
        vehicle.make,
        vehicle.model,
        vehicle.colour,
        vehicle.size,
        vehicle.contract,
        vehicle.hireNotes
      ].filter(Boolean).map(field => field!.toLowerCase())

      return searchableFields.some(field => field.includes(searchTerm))
    })
  }, [vehiclesOutOnHire, dashboardLogic.filters.search])

  // Enhance vehicles with status
  const enhancedVehicles = useMemo(() => 
    vehiclesInYard.map(vehicle => ({
      ...vehicle,
      status: determineVehicleStatus(vehicle)
    })), 
    [vehiclesInYard]
  )

  const enhancedFilteredVehicles = useMemo(() => 
    dashboardLogic.filteredVehicles.map(vehicle => ({
      ...vehicle,
      status: determineVehicleStatus(vehicle)
    })), 
    [dashboardLogic.filteredVehicles]
  )

  // Pagination
  const pagination = usePagination({
    data: enhancedFilteredVehicles,
    itemsPerPageOptions: [25, 50, 75, 100, 200],
    defaultItemsPerPage: 25
  })

  // Calculate contextual breakdowns
  const contextualBreakdowns = useMemo(() => {
    const hasActiveFilters = !!(
      dashboardLogic.filters.search || 
      dashboardLogic.filters.excludeKeywords || 
      dashboardLogic.filters.dateFrom || 
      dashboardLogic.filters.dateTo || 
      dashboardLogic.filters.condition || 
      dashboardLogic.filters.contract || 
      dashboardLogic.filters.size || 
      dashboardLogic.filters.status || 
      dashboardLogic.filters.motExpiring
    )
    
    if (!hasActiveFilters || !dashboardLogic.filteredVehicles.length) {
      return {
        sizeBreakdown: analytics.sizeBreakdown || {},
        conditionBreakdown: analytics.conditionBreakdown || {},
        statusBreakdown: analytics.statusBreakdown || {},
        contractBreakdown: analytics.contractBreakdown || {}
      }
    }

    const breakdowns = {
      sizeBreakdown: {} as Record<string, number>,
      conditionBreakdown: {} as Record<string, number>,
      statusBreakdown: {} as Record<string, number>,
      contractBreakdown: {} as Record<string, number>
    }

    dashboardLogic.filteredVehicles.forEach(vehicle => {
      if (vehicle.size) {
        breakdowns.sizeBreakdown[vehicle.size] = (breakdowns.sizeBreakdown[vehicle.size] || 0) + 1
      }
      if (vehicle.condition) {
        breakdowns.conditionBreakdown[vehicle.condition] = (breakdowns.conditionBreakdown[vehicle.condition] || 0) + 1
      }
      const status = determineVehicleStatus(vehicle)
      breakdowns.statusBreakdown[status] = (breakdowns.statusBreakdown[status] || 0) + 1
      if (vehicle.contract) {
        breakdowns.contractBreakdown[vehicle.contract] = (breakdowns.contractBreakdown[vehicle.contract] || 0) + 1
      }
    })

    return breakdowns
  }, [dashboardLogic.filteredVehicles, analytics, dashboardLogic.filters])

  // Update condition lookup
  useEffect(() => {
    if (conditionCategories && conditionCategories.length > 0) {
      updateConditionLookup(conditionCategories)
    }
  }, [conditionCategories])

  // Force data refresh function
  const forceDataRefresh = async () => {
    setIsRefreshing(true)
    try {
      if (yardData?.clearError) {
        yardData.clearError()
      }
      if (yardData?.clearSyncNotification) {
        yardData.clearSyncNotification()
      }
      await new Promise(resolve => setTimeout(resolve, 500))
      setLastRefresh(new Date())
    } catch (error) {
      logger.error('Error during refresh:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Loading state
  const isLoading = yardData?.loading || fleetData?.loading || conditionsLoading || serviceBookingsLoading || profileLoading

  return {
    // User & profile
    userProfile,
    profileLoading,
    
    // Branch data
    currentBranch,
    branches,
    
    // Raw data
    fleetData,
    yardData,
    fleetVehicles,
    conditions,
    serviceBookings,
    
    // Vehicle lists
    checkedInVehicles,
    vehiclesInYard,
    vehiclesOutOnHire,
    filteredVehiclesOutOnHire,
    enhancedVehicles,
    enhancedFilteredVehicles,
    
    // ✅ NEW: Incoming transfers (optimized)
    incomingVehicles,
    incomingTransfersLoading,
    
    // Analytics & breakdowns
    analytics,
    contextualBreakdowns,
    
    // Dashboard logic
    dashboardLogic,
    
    // Pagination
    pagination,
    
    // Refresh state
    isRefreshing,
    lastRefresh,
    forceDataRefresh,
    
    // Loading state
    isLoading
  }
}