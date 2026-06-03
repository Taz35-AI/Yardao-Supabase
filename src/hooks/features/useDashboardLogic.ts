// src/hooks/features/useDashboardLogic.ts - FIXED with Insurance Status Filter Support
'use client'

import { useState, useCallback, useMemo } from 'react'
import { Analytics, CheckedInVehicle, VehicleStatus, InsuranceStatus, FilterConfig, SortConfig } from '@/types'
import { createCompleteAnalytics } from '@/lib/analyticsUtils'
import { logger } from '@/lib/logger'

interface UseDashboardLogicReturn {
  // Modal states
  showCheckInForm: boolean
  setShowCheckInForm: (show: boolean) => void
  selectedVehicle: CheckedInVehicle | null
  setSelectedVehicle: (vehicle: CheckedInVehicle | null) => void
  showEditModal: boolean
  setShowEditModal: (show: boolean) => void
  showDetailModal: boolean
  setShowDetailModal: (show: boolean) => void
  showSizeModal: boolean
  setShowSizeModal: (show: boolean) => void
  showConditionModal: boolean
  setShowConditionModal: (show: boolean) => void
  showStatusModal: boolean
  setShowStatusModal: (show: boolean) => void
  showContractModal: boolean
  setShowContractModal: (show: boolean) => void
  showInsuranceModal: boolean // NEW: Insurance modal
  setShowInsuranceModal: (show: boolean) => void
  
  // Filter and sort states
  activeFilter: string
  filters: FilterConfig
  sortConfig: SortConfig
  filteredVehicles: CheckedInVehicle[]
  statusSizeBreakdown: Record<string, Record<string, number>>
  
  // Event handlers
  handleFilterChange: (key: keyof FilterConfig, value: string | boolean) => void
  clearAllFilters: () => void
  handleSizeFilter: (size: string) => void
  handleConditionFilter: (condition: string) => void
  handleStatusFilter: (status: string) => void
  handleContractFilter: (contract: string) => void
  handleInsuranceFilter: (insurance: string) => void // NEW: Insurance filter handler
  handleStatusSizeFilter: (status: string, size: string) => void
  handleSort: (key: string) => void
  handleEditVehicle: (vehicle: CheckedInVehicle) => void
  handleViewVehicle: (vehicle: CheckedInVehicle) => void
  handleCloseDetailModal: () => void
  handleSizeCardClick: () => void
  handleConditionCardClick: () => void
  handleStatusCardClick: () => void
  handleContractCardClick: () => void
  handleInsuranceCardClick: () => void // NEW: Insurance card click handler
}

export function useDashboardLogic(
  vehicles: CheckedInVehicle[],
  analytics: Analytics | Partial<Analytics>
): UseDashboardLogicReturn {
  
  // Ensure analytics is complete to prevent TypeScript errors
  const completeAnalytics = useMemo(() => {
    return createCompleteAnalytics(analytics)
  }, [analytics])
  
  // Modal states
  const [showCheckInForm, setShowCheckInForm] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<CheckedInVehicle | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showSizeModal, setShowSizeModal] = useState(false)
  const [showConditionModal, setShowConditionModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showContractModal, setShowContractModal] = useState(false)
  const [showInsuranceModal, setShowInsuranceModal] = useState(false) // NEW: Insurance modal state

  // Filter and sort states
  const [activeFilter, setActiveFilter] = useState<string>('')
  const [filters, setFilters] = useState<FilterConfig>({
    search: '',
    excludeKeywords: '',
    size: '',
    condition: '',
    status: '',
    contract: '',
    insuranceStatus: '', // NEW: Insurance status filter
    motExpiring: false,
    dateFrom: '',
    dateTo: ''
  })
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'createdAt',
    direction: 'desc'
  })

  // Helper function for safe string comparison
  const safeString = useCallback((value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value.toLowerCase()
    try {
      return String(value).toLowerCase()
    } catch {
      return ''
    }
  }, [])

  const safeEquals = useCallback((val1: any, val2: any): boolean => {
    const str1 = safeString(val1).toLowerCase().trim()
    const str2 = safeString(val2).toLowerCase().trim()
    return str1 === str2
  }, [safeString])

  // Enhanced search function with exclude keywords functionality
  const searchAllFields = useCallback((vehicle: CheckedInVehicle, searchTerm: string, excludeTerms?: string): boolean => {
    const term = searchTerm.toLowerCase().trim()
    
    // If no search term and no exclude terms, return true
    if (!term && !excludeTerms?.trim()) return true

    // All searchable fields including contract and insurance
    const searchableFields = [
      safeString(vehicle.registration),
      safeString(vehicle.make),
      safeString(vehicle.model),
      safeString(vehicle.colour),
      safeString(vehicle.size),
      safeString(vehicle.condition),
      safeString(vehicle.status),
      safeString(vehicle.contract),
      safeString(vehicle.insuranceStatus), // NEW: Include insurance status in search
      safeString(vehicle.notes),
      safeString(vehicle.comments),
      safeString(vehicle.mileage),
      safeString(vehicle.location),
      safeString(vehicle.bay),
      vehicle.motExpiry ? safeString(vehicle.motExpiry) : '',
      vehicle.taxExpiry ? safeString(vehicle.taxExpiry) : '',
      safeString(vehicle.userId),
      safeString(vehicle.organizationId),
      `${safeString(vehicle.make)} ${safeString(vehicle.model)}`,
      `${safeString(vehicle.registration)} ${safeString(vehicle.make)} ${safeString(vehicle.model)}`,
      vehicle.contract ? `${safeString(vehicle.registration)} ${safeString(vehicle.contract)}` : '',
      vehicle.contract ? `${safeString(vehicle.make)} ${safeString(vehicle.model)} ${safeString(vehicle.contract)}` : '',
      vehicle.createdAt ? new Date(vehicle.createdAt).toLocaleDateString() : '',
      vehicle.checkInTime ? new Date(vehicle.checkInTime).toLocaleDateString() : ''
    ]

    // Join all fields and search
    const allFieldsText = searchableFields
      .filter(field => field)
      .join(' ')
      .toLowerCase()

    // Handle include search terms
    let includeMatches = true
    if (term) {
      const searchTerms = term.split(/\s+/).filter(t => t.length > 0)
      includeMatches = searchTerms.every(searchTerm => 
        allFieldsText.includes(searchTerm)
      )
    }

    // Handle exclude keywords
    if (excludeTerms && excludeTerms.trim()) {
      const excludeTermsList = excludeTerms.split(/\s+/)
        .filter(t => t.length > 0)
        .map(t => t.toLowerCase())
      
      const hasExcludedTerms = excludeTermsList.some(excludeTerm => 
        allFieldsText.includes(excludeTerm)
      )
      
      return includeMatches && !hasExcludedTerms
    }

    return includeMatches
  }, [safeString])

  // FIXED: Enhanced filter vehicles with insurance status support
  const filteredVehicles = useMemo(() => {
    let filtered = [...vehicles]

    logger.log('🔍 Filtering vehicles:', {
      totalVehicles: vehicles.length,
      filters: filters,
      sampleVehicle: vehicles[0] ? {
        registration: vehicles[0].registration,
        condition: vehicles[0].condition,
        contract: vehicles[0].contract,
        insuranceStatus: vehicles[0].insuranceStatus,
        size: vehicles[0].size,
        status: vehicles[0].status
      } : null
    })

    // Enhanced search filter with exclude keywords
    if (filters.search || filters.excludeKeywords) {
      filtered = filtered.filter(vehicle => 
        searchAllFields(vehicle, filters.search, filters.excludeKeywords)
      )
      logger.log('After search filter:', filtered.length)
    }

    // Size filter
    if (filters.size && filters.size.trim()) {
      const beforeSize = filtered.length
      filtered = filtered.filter(vehicle => 
        safeEquals(vehicle.size, filters.size)
      )
      logger.log(`Size filter (${filters.size}): ${beforeSize} -> ${filtered.length}`)
    }

    // Condition filter
    if (filters.condition && filters.condition.trim()) {
      const beforeCondition = filtered.length
      filtered = filtered.filter(vehicle => {
        const vehicleCondition = safeString(vehicle.condition).trim()
        const filterCondition = safeString(filters.condition).trim()
        const matches = vehicleCondition === filterCondition
        
        if (!matches) {
          logger.log('Condition mismatch:', {
            vehicle: vehicle.registration,
            vehicleCondition: `"${vehicleCondition}"`,
            filterCondition: `"${filterCondition}"`
          })
        }
        
        return matches
      })
      logger.log(`Condition filter (${filters.condition}): ${beforeCondition} -> ${filtered.length}`)
    }

    // Status filter
    if (filters.status && filters.status.trim()) {
      const beforeStatus = filtered.length
      filtered = filtered.filter(vehicle => 
        safeEquals(vehicle.status, filters.status)
      )
      logger.log(`Status filter (${filters.status}): ${beforeStatus} -> ${filtered.length}`)
    }

    // Contract filter
    if (filters.contract && filters.contract.trim()) {
      const beforeContract = filtered.length
      
      if (filters.contract === '__no_contract__') {
        // Filter for vehicles with no contract
        filtered = filtered.filter(vehicle => 
          !vehicle.contract || vehicle.contract.trim() === ''
        )
      } else {
        // Filter for specific contract
        filtered = filtered.filter(vehicle => {
          const vehicleContract = safeString(vehicle.contract).trim()
          const filterContract = safeString(filters.contract).trim()
          const matches = vehicleContract === filterContract
          
          if (!matches && vehicle.contract) {
            logger.log('Contract mismatch:', {
              vehicle: vehicle.registration,
              vehicleContract: `"${vehicleContract}"`,
              filterContract: `"${filterContract}"`
            })
          }
          
          return matches
        })
      }
      logger.log(`Contract filter (${filters.contract}): ${beforeContract} -> ${filtered.length}`)
    }

    // NEW: Insurance status filter
    if (filters.insuranceStatus && filters.insuranceStatus.trim()) {
      const beforeInsurance = filtered.length
      
      if (filters.insuranceStatus === '__unknown__') {
        // Filter for vehicles with unknown insurance status
        filtered = filtered.filter(vehicle => 
          !vehicle.insuranceStatus || vehicle.insuranceStatus === null
        )
      } else {
        // Filter for specific insurance status
        filtered = filtered.filter(vehicle => {
          const vehicleInsurance = safeString(vehicle.insuranceStatus).trim()
          const filterInsurance = safeString(filters.insuranceStatus).trim()
          const matches = vehicleInsurance === filterInsurance
          
          if (!matches && vehicle.insuranceStatus) {
            logger.log('Insurance mismatch:', {
              vehicle: vehicle.registration,
              vehicleInsurance: `"${vehicleInsurance}"`,
              filterInsurance: `"${filterInsurance}"`
            })
          }
          
          return matches
        })
      }
      logger.log(`Insurance filter (${filters.insuranceStatus}): ${beforeInsurance} -> ${filtered.length}`)
    }

    // MOT expiring filter
    if (filters.motExpiring) {
      const threeMonthsFromNow = new Date()
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
      
      filtered = filtered.filter(vehicle => {
        if (!vehicle.motExpiry) return false
        try {
          const motDate = new Date(vehicle.motExpiry)
          return motDate <= threeMonthsFromNow && motDate >= new Date()
        } catch {
          return false
        }
      })
    }

    // Date range filters
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(vehicle => {
        try {
          if (!vehicle.createdAt) {
            return false
          }
          
          let vehicleDate: Date
          if (typeof vehicle.createdAt === 'string') {
            vehicleDate = new Date(vehicle.createdAt)
          } else if (vehicle.createdAt && typeof vehicle.createdAt === 'object' && 'toDate' in vehicle.createdAt) {
            vehicleDate = (vehicle.createdAt as any).toDate()
          } else {
            vehicleDate = new Date(vehicle.createdAt)
          }

          if (isNaN(vehicleDate.getTime())) {
            return false
          }

          const vehicleDateStr = vehicleDate.toISOString().split('T')[0]
          
          if (filters.dateFrom && vehicleDateStr < filters.dateFrom) {
            return false
          }
          
          if (filters.dateTo && vehicleDateStr > filters.dateTo) {
            return false
          }
          
          return true
        } catch (error) {
          logger.error('Date filtering error:', error)
          return false
        }
      })
    }

    logger.log('Final filtered vehicles:', filtered.length)
    return filtered
  }, [vehicles, filters, searchAllFields, safeEquals, safeString])

  // Sort filtered vehicles
  const sortedVehicles = useMemo(() => {
    const sorted = [...filteredVehicles]
    
    sorted.sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1

      let aValue: any = a[sortConfig.key as keyof CheckedInVehicle]
      let bValue: any = b[sortConfig.key as keyof CheckedInVehicle]

      const aStr = aValue != null ? String(aValue).toLowerCase() : ''
      const bStr = bValue != null ? String(bValue).toLowerCase() : ''

      const comparison = aStr.localeCompare(bStr)
      return comparison * direction
    })

    return sorted
  }, [filteredVehicles, sortConfig])

  // Calculate status-size breakdown
  const statusSizeBreakdown = useMemo(() => {
    const breakdown: Record<string, Record<string, number>> = {}
    
    vehicles.forEach(vehicle => {
      const status = safeString(vehicle.status) || 'Unknown'
      const size = safeString(vehicle.size) || 'Unknown'
      
      if (!breakdown[status]) {
        breakdown[status] = {}
      }
      
      breakdown[status][size] = (breakdown[status][size] || 0) + 1
    })
    
    return breakdown
  }, [vehicles, safeString])

  // Filter handlers
  const handleFilterChange = useCallback((key: keyof FilterConfig, value: string | boolean) => {
    logger.log('Filter change:', key, value)
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
    setActiveFilter(key)
  }, [])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      excludeKeywords: '',
      size: '',
      condition: '',
      status: '',
      contract: '',
      insuranceStatus: '', // NEW: Reset insurance filter
      motExpiring: false,
      dateFrom: '',
      dateTo: ''
    })
    setActiveFilter('')
  }, [])

  const handleSizeFilter = useCallback((size: string) => {
    handleFilterChange('size', size)
    setShowSizeModal(false)
  }, [handleFilterChange])

  const handleConditionFilter = useCallback((condition: string) => {
    logger.log('Setting condition filter:', condition)
    handleFilterChange('condition', condition)
    setShowConditionModal(false)
  }, [handleFilterChange])

  const handleStatusFilter = useCallback((status: string) => {
    handleFilterChange('status', status)
    setShowStatusModal(false)
  }, [handleFilterChange])

  const handleContractFilter = useCallback((contract: string) => {
    logger.log('Setting contract filter:', contract)
    handleFilterChange('contract', contract)
    setShowContractModal(false)
  }, [handleFilterChange])

  // NEW: Insurance filter handler
  const handleInsuranceFilter = useCallback((insurance: string) => {
    logger.log('Setting insurance filter:', insurance)
    handleFilterChange('insuranceStatus', insurance)
    setShowInsuranceModal(false)
  }, [handleFilterChange])

  const handleStatusSizeFilter = useCallback((status: string, size: string) => {
    setFilters(prev => ({
      ...prev,
      status,
      size
    }))
    setShowStatusModal(false)
  }, [])

  const handleSort = useCallback((key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }, [])

  const handleEditVehicle = useCallback((vehicle: CheckedInVehicle) => {
    setSelectedVehicle(vehicle)
    setShowEditModal(true)
  }, [])

  const handleViewVehicle = useCallback((vehicle: CheckedInVehicle) => {
    setSelectedVehicle(vehicle)
    setShowDetailModal(true)
  }, [])

  const handleCloseDetailModal = useCallback(() => {
    setShowDetailModal(false)
    setSelectedVehicle(null)
  }, [])

  const handleSizeCardClick = useCallback(() => {
    setShowSizeModal(true)
  }, [])

  const handleConditionCardClick = useCallback(() => {
    setShowConditionModal(true)
  }, [])

  const handleStatusCardClick = useCallback(() => {
    setShowStatusModal(true)
  }, [])

  const handleContractCardClick = useCallback(() => {
    setShowContractModal(true)
  }, [])

  // NEW: Insurance card click handler
  const handleInsuranceCardClick = useCallback(() => {
    setShowInsuranceModal(true)
  }, [])

  return {
    // Modal states
    showCheckInForm,
    setShowCheckInForm,
    selectedVehicle,
    setSelectedVehicle,
    showEditModal,
    setShowEditModal,
    showDetailModal,
    setShowDetailModal,
    showSizeModal,
    setShowSizeModal,
    showConditionModal,
    setShowConditionModal,
    showStatusModal,
    setShowStatusModal,
    showContractModal,
    setShowContractModal,
    showInsuranceModal, // NEW: Insurance modal state
    setShowInsuranceModal,
    
    // Filter and sort states
    activeFilter,
    filters,
    sortConfig,
    filteredVehicles: sortedVehicles,
    statusSizeBreakdown,
    
    // Event handlers
    handleFilterChange,
    clearAllFilters,
    handleSizeFilter,
    handleConditionFilter,
    handleStatusFilter,
    handleContractFilter,
    handleInsuranceFilter, // NEW: Insurance filter handler
    handleStatusSizeFilter,
    handleSort,
    handleEditVehicle,
    handleViewVehicle,
    handleCloseDetailModal,
    handleSizeCardClick,
    handleConditionCardClick,
    handleStatusCardClick,
    handleContractCardClick,
    handleInsuranceCardClick // NEW: Insurance card click handler
  }
}