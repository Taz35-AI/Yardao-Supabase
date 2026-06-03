// src/lib/fleetUtils.ts - FIXED: FleetVehicle interface with required fields + Insurance Support

import { InsuranceStatus } from '@/types'
import { logger } from '@/lib/logger'

export interface SortConfig {
  key: string
  direction: 'asc' | 'desc'
}

// FIXED: Make core fields required to match your usage + ADD insuranceStatus
export interface FleetVehicle {
  id: string
  registration: string    // FIXED: Required (was optional)
  make: string           // FIXED: Required (was optional) 
  model: string          // FIXED: Required (was optional)
  colour?: string
  size: string           // FIXED: Required (was optional)
  motExpiry?: string
  taxExpiry?: string
  comments?: string
  condition: string      // FIXED: Required (was optional)
  organizationId: string // FIXED: Required (was optional)
  createdBy: string      // FIXED: Required (was optional)
  createdAt: Date | string
  contract?: string | null
  contractColor?: string | null
  
  // ✅ ADDED: Insurance Status field to fix TypeScript error
  insuranceStatus?: InsuranceStatus | null
  vehicleDiagramType?: string | null
  damagePins?: any[]
}

/**
 * Format date string to GB locale
 */
export const formatDate = (dateString: string): string => {
  if (!dateString) return 'Not set'
  return new Date(dateString).toLocaleDateString('en-GB')
}

/**
 * 🔴 FIXED: Check if date is expiring within 30 days OR already expired
 * Now includes both expired and expiring vehicles for MOT filter
 */
export const isExpiringSoon = (dateString: string): boolean => {
  if (!dateString) return false
  const date = new Date(dateString)
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  // FIXED: Removed the date >= new Date() check to include expired vehicles
  return date <= thirtyDaysFromNow
}

/**
 * Check if date is expired
 */
export const isExpired = (dateString: string): boolean => {
  if (!dateString) return false
  const date = new Date(dateString)
  return date <= new Date()
}

/**
 * Get expiry status with styling classes
 */
export const getExpiryStatus = (dateString: string) => {
  if (!dateString) {
    return {
      status: 'not-set',
      text: 'Not set',
      className: 'text-gray-500 dark:text-gray-400',
      isExpiring: false,
      daysUntilExpiry: 0
    }
  }

  const date = new Date(dateString)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (isExpired(dateString)) {
    return {
      status: 'expired',
      text: 'Expired',
      className: 'text-red-600 dark:text-red-400 font-semibold',
      isExpiring: true,
      daysUntilExpiry
    }
  }

  if (isExpiringSoon(dateString)) {
    return {
      status: 'expiring-soon',
      text: 'Expiring Soon',
      className: 'text-amber-600 dark:text-amber-400 font-semibold',
      isExpiring: true,
      daysUntilExpiry
    }
  }

  return {
    status: 'valid',
    text: 'Valid',
    className: 'text-green-600 dark:text-green-400',
    isExpiring: false,
    daysUntilExpiry
  }
}

/**
 * Safely convert value to string for searching
 */
const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

/**
 * Filter vehicles based on search term - ENHANCED with contract search
 */
export const filterVehiclesBySearch = (vehicles: FleetVehicle[], searchTerm: string): FleetVehicle[] => {
  if (!searchTerm.trim()) return vehicles

  const lowercaseSearch = searchTerm.toLowerCase()
  return vehicles.filter(vehicle =>
    safeString(vehicle.registration).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.make).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.model).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.colour).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.size).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.condition).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.comments).toLowerCase().includes(lowercaseSearch) ||
    safeString(vehicle.contract).toLowerCase().includes(lowercaseSearch)
  )
}

/**
 * Filter vehicles by MOT expiry status
 * 🔴 FIXED: Now properly uses the updated isExpiringSoon function that includes expired vehicles
 */
export const filterVehiclesByMOT = (vehicles: FleetVehicle[]): FleetVehicle[] => {
  return vehicles.filter(vehicle => 
    vehicle.motExpiry && (isExpired(vehicle.motExpiry) || isExpiringSoon(vehicle.motExpiry))
  )
}

/**
 * Filter vehicles by size
 */
export const filterVehiclesBySize = (vehicles: FleetVehicle[], size: string): FleetVehicle[] => {
  if (!size) return vehicles
  return vehicles.filter(vehicle => vehicle.size === size)
}

/**
 * Filter vehicles by contract
 */
export const filterVehiclesByContract = (vehicles: FleetVehicle[], contractName: string): FleetVehicle[] => {
  if (!contractName) return vehicles
  if (contractName === 'No Contract') {
    return vehicles.filter(vehicle => !vehicle.contract)
  }
  return vehicles.filter(vehicle => vehicle.contract === contractName)
}

/**
 * ✅ ADDED: Filter vehicles by insurance status
 */
export const filterVehiclesByInsurance = (vehicles: FleetVehicle[], insuranceStatus: string): FleetVehicle[] => {
  if (!insuranceStatus || insuranceStatus === 'all') return vehicles
  if (insuranceStatus === 'insured') {
    return vehicles.filter(vehicle => vehicle.insuranceStatus === 'Insured')
  }
  if (insuranceStatus === 'not-insured') {
    return vehicles.filter(vehicle => vehicle.insuranceStatus === 'Not Insured' || !vehicle.insuranceStatus)
  }
  return vehicles
}

/**
 * Sort vehicles based on sort configuration
 */
export const sortVehicles = (vehicles: FleetVehicle[], sortConfig: SortConfig): FleetVehicle[] => {
  return [...vehicles].sort((a, b) => {
    let aValue: any
    let bValue: any

    switch (sortConfig.key) {
      case 'createdAt':
        aValue = new Date(a.createdAt)
        bValue = new Date(b.createdAt)
        break
      case 'motExpiry':
        aValue = a.motExpiry ? new Date(a.motExpiry) : new Date('1900-01-01')
        bValue = b.motExpiry ? new Date(b.motExpiry) : new Date('1900-01-01')
        break
      case 'taxExpiry':
        aValue = a.taxExpiry ? new Date(a.taxExpiry) : new Date('1900-01-01')
        bValue = b.taxExpiry ? new Date(b.taxExpiry) : new Date('1900-01-01')
        break
      case 'contract':
        aValue = safeString(a.contract || 'ZZZ')
        bValue = safeString(b.contract || 'ZZZ')
        break
      // ✅ ADDED: Insurance status sorting
      case 'insuranceStatus':
        aValue = safeString(a.insuranceStatus || 'ZZZ')
        bValue = safeString(b.insuranceStatus || 'ZZZ')
        break
      default:
        aValue = safeString((a as any)[sortConfig.key]).toLowerCase()
        bValue = safeString((b as any)[sortConfig.key]).toLowerCase()
    }

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1
    }
    return 0
  })
}

/**
 * Calculate fleet analytics with contract breakdown + insurance breakdown
 * 🔴 FIXED: Now uses the updated isExpiringSoon that includes expired vehicles
 */
export const calculateFleetAnalytics = (vehicles: FleetVehicle[]) => {
  const totalVehicles = vehicles.length
  
  const motExpiringVehicles = vehicles.filter(vehicle => 
    vehicle.motExpiry && (isExpired(vehicle.motExpiry) || isExpiringSoon(vehicle.motExpiry))
  )

  const sizeBreakdown = vehicles.reduce((acc, vehicle) => {
    const size = safeString(vehicle.size) || 'Unknown'
    acc[size] = (acc[size] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const contractBreakdown = vehicles.reduce((acc, vehicle) => {
    const contract = vehicle.contract || 'No Contract'
    acc[contract] = (acc[contract] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ✅ ADDED: Insurance breakdown calculation
  const insuranceBreakdown = vehicles.reduce((acc, vehicle) => {
    const insurance = vehicle.insuranceStatus || 'Unknown'
    acc[insurance] = (acc[insurance] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    totalVehicles,
    motExpiringCount: motExpiringVehicles.length,
    motExpiringVehicles,
    sizeBreakdown,
    contractBreakdown,
    insuranceBreakdown, // ✅ ADDED: Insurance breakdown
    contractStats: {
      totalWithContracts: vehicles.filter(v => v.contract).length,
      totalWithoutContracts: vehicles.filter(v => !v.contract).length,
      uniqueContracts: new Set(vehicles.map(v => v.contract).filter(Boolean)).size
    },
    // ✅ ADDED: Insurance stats
    insuranceStats: {
      insured: vehicles.filter(v => v.insuranceStatus === 'Insured').length,
      notInsured: vehicles.filter(v => v.insuranceStatus === 'Not Insured').length,
      unknown: vehicles.filter(v => !v.insuranceStatus).length
    }
  }
}

/**
 * Get unique vehicle sizes from fleet
 */
export const getUniqueSizes = (vehicles: FleetVehicle[]): string[] => {
  const sizes = vehicles.map(v => safeString(v.size) || 'Unknown').filter(Boolean)
  return [...new Set(sizes)].sort()
}

/**
 * Get unique contracts from fleet
 */
export const getUniqueContracts = (vehicles: FleetVehicle[]): string[] => {
  const contracts = vehicles.map(v => v.contract).filter(Boolean) as string[]
  return [...new Set(contracts)].sort()
}

/**
 * ✅ ADDED: Get unique insurance statuses from fleet
 */
export const getUniqueInsuranceStatuses = (vehicles: FleetVehicle[]): InsuranceStatus[] => {
  const statuses = vehicles.map(v => v.insuranceStatus).filter(Boolean) as InsuranceStatus[]
  return [...new Set(statuses)].sort()
}

/**
 * Format Excel date for Firestore
 */
export const formatDateForFirestore = (excelDate: any): string => {
  if (!excelDate) return ''
  
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  
  if (typeof excelDate === 'string') {
    const date = new Date(excelDate)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  }
  
  if (excelDate instanceof Date) {
    return excelDate.toISOString().split('T')[0]
  }
  
  return ''
}

/**
 * Excel template generator with Contract column + Insurance column
 */
export const generateFleetTemplate = () => {
  return [
    {
      registration: 'ABC123',
      make: 'Ford',
      model: 'Transit',
      colour: 'White',
      size: 'Large Van',
      condition: 'Excellent',
      motExpiry: '2024-12-31',
      taxExpiry: '2024-11-30',
      comments: 'Sample vehicle entry',
      contract: 'Fleet Management Co',
      insuranceStatus: 'Insured' // ✅ ADDED: Insurance status
    },
    {
      registration: 'DEF456',
      make: 'Vauxhall',
      model: 'Vivaro',
      colour: 'Silver',
      size: 'Medium Van',
      condition: 'Good',
      motExpiry: '2024-10-15',
      taxExpiry: '2024-09-30',
      comments: 'Regular service required',
      contract: 'ABC Rentals',
      insuranceStatus: 'Insured' // ✅ ADDED: Insurance status
    },
    {
      registration: 'GHI789',
      make: 'Mercedes',
      model: 'Sprinter',
      colour: 'Blue',
      size: 'Large Van', 
      condition: 'Fair',
      motExpiry: '2025-01-20',
      taxExpiry: '2025-02-28',
      comments: '',
      contract: '',
      insuranceStatus: 'Not Insured' // ✅ ADDED: Insurance status
    }
  ]
}

/**
 * Process Excel import data with contract support + insurance support
 */
export const processFleetImportData = (rawData: any[]) => {
  return rawData.map((row, index) => {
    logger.log(`Processing row ${index + 1}:`, {
      registration: row.Registration || row.registration,
      contract: row.Contract || row.contract || '(empty)',
      insuranceStatus: row['Insurance Status'] || row.insuranceStatus || '(empty)' // ✅ ADDED: Insurance logging
    })

    return {
      registration: row.Registration || row.registration || '',
      make: row.Make || row.make || '',
      model: row.Model || row.model || '',
      colour: row.Colour || row.colour || row.Color || row.color || '',
      size: row.Size || row.size || '',
      condition: row.Condition || row.condition || 'Good',
      motExpiry: formatDateForFirestore(row['MOT Expiry'] || row.motExpiry || row['mot expiry']),
      taxExpiry: formatDateForFirestore(row['Tax Expiry'] || row.taxExpiry || row['tax expiry']),
      comments: row.Comments || row.comments || '',
      contract: row.Contract || row.contract || null,
      // ✅ ADDED: Insurance status processing
      insuranceStatus: row['Insurance Status'] || row.insuranceStatus || row['insurance status'] || null
    }
  })
}

/**
 * Validate fleet import with contract checking + insurance checking
 */
export const validateFleetImport = (
  vehicles: any[], 
  existingVehicles: any[] = [],
  availableContracts: any[] = []
) => {
  const errors: string[] = []
  const warnings: string[] = []
  const contractStats = { 
    total: 0, 
    withContracts: 0, 
    invalidContracts: [] as string[],
    missingContracts: [] as string[]
  }

  // ✅ ADDED: Insurance validation stats
  const insuranceStats = {
    total: 0,
    withInsurance: 0,
    insured: 0,
    notInsured: 0,
    invalidInsurance: [] as string[]
  }

  const existingRegs = new Set(existingVehicles.map(v => v.registration?.toUpperCase()))
  const validContractNames = new Set(availableContracts.map(c => c.name))
  const validInsuranceStatuses = new Set(['Insured', 'Not Insured']) // ✅ ADDED: Valid insurance statuses

  logger.log('Validating import:', {
    vehicles: vehicles.length,
    existingVehicles: existingVehicles.length,
    availableContracts: availableContracts.length,
    validContractNames: Array.from(validContractNames)
  })

  vehicles.forEach((vehicle, index) => {
    const rowNumber = index + 2
    
    if (!vehicle.registration?.trim()) {
      errors.push(`Row ${rowNumber}: Registration is required`)
      return
    }
    
    if (!vehicle.make?.trim()) {
      errors.push(`Row ${rowNumber}: Make is required`)
      return
    }
    
    if (!vehicle.size?.trim()) {
      errors.push(`Row ${rowNumber}: Size is required`)
      return
    }

    const cleanReg = vehicle.registration.trim().toUpperCase()
    if (existingRegs.has(cleanReg)) {
      warnings.push(`Row ${rowNumber}: Vehicle ${cleanReg} already exists and will be updated`)
    }

    // Contract validation
    contractStats.total++
    if (vehicle.contract && vehicle.contract.trim()) {
      contractStats.withContracts++
      const contractName = vehicle.contract.trim()
      
      if (!validContractNames.has(contractName)) {
        if (!contractStats.invalidContracts.includes(contractName)) {
          contractStats.invalidContracts.push(contractName)
          contractStats.missingContracts.push(contractName)
        }
        errors.push(`Row ${rowNumber}: Contract "${contractName}" not found in settings for ${cleanReg}`)
      }
    }

    // ✅ ADDED: Insurance validation
    insuranceStats.total++
    if (vehicle.insuranceStatus && vehicle.insuranceStatus.trim()) {
      insuranceStats.withInsurance++
      const insuranceStatus = vehicle.insuranceStatus.trim()
      
      if (validInsuranceStatuses.has(insuranceStatus)) {
        if (insuranceStatus === 'Insured') {
          insuranceStats.insured++
        } else if (insuranceStatus === 'Not Insured') {
          insuranceStats.notInsured++
        }
      } else {
        if (!insuranceStats.invalidInsurance.includes(insuranceStatus)) {
          insuranceStats.invalidInsurance.push(insuranceStatus)
        }
        errors.push(`Row ${rowNumber}: Insurance status "${insuranceStatus}" is invalid for ${cleanReg}. Must be "Insured" or "Not Insured"`)
      }
    }
  })

  logger.log('Validation complete:', {
    errors: errors.length,
    warnings: warnings.length,
    contractStats,
    insuranceStats // ✅ ADDED: Insurance stats logging
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    contractStats,
    insuranceStats // ✅ ADDED: Return insurance stats
  }
}