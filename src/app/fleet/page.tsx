// src/app/fleet/page.tsx - COMPLETELY REDESIGNED: Perfect symmetry across all devices
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { Button } from '@/components/ui/Button'
import { logger } from '@/lib/logger'

// Feature Components
import { FleetHeader } from '@/components/features/fleet/FleetHeader'
import { FleetActions } from '@/components/features/fleet/FleetActions'
import { FleetAnalytics } from '@/components/features/fleet/FleetAnalytics'
import { BulkRoadTaxToolbar } from '@/components/features/fleet/BulkRoadTaxToolbar'

// Common Components
import { FleetFilters } from '@/components/common/Filters/FleetFilters'
import { FleetTable } from '@/components/common/Tables/FleetTable'
import { FleetAlerts } from '@/components/common/Modals/FleetAlerts'
import { Pagination } from '@/components/common/Pagination'

// Modal Components
import { FleetVehicleDetailModal } from '@/components/common/Modals/FleetVehicleDetailModal'
import { FleetVehicleEditModal } from '@/components/common/Modals/FleetVehicleEditModal'
import { VehicleForm } from '@/components/fleet/VehicleForm'
import { BulkDvlaRefreshModal } from '@/components/fleet/BulkDvlaRefreshModal'
import { DuplicateVehicleModal } from '@/components/common/Modals/DuplicateVehicleModal'
import { BulkRoadTaxModal } from '@/components/common/Modals/BulkRoadTaxModal'
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { enhancedVehicleService } from '@/lib/services/enhancedVehicleService'
import { DefleetVehicleModal } from '@/components/common/Modals/DefleetVehicleModal'

// Contract Sync Notification Component
import { ContractSyncNotification } from '@/components/common/notifications/contractSyncNotification'

// Custom Hooks
import { useFleetData } from '@/hooks/useFleetData'
import { useFleetActions } from '@/hooks/features/useFleetActions'
import { usePagination } from '@/hooks/common/usePagination'
import { useAuth } from '@/contexts/AuthContext'

// Types
import { InsuranceStatus, FleetVehicle, DefleetReason } from '@/types'

// Services
import { BulkRoadTaxService } from '@/lib/services/bulkRoadTaxService'
import { userProfileService } from '@/lib/firestore'
import { useT } from '@/lib/i18n'

// Icons
import { Plus, X, Download, Share2, Upload, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── FleetHeaderExcelItems ────────────────────────────────────────────────────
// Renders just the Excel menu items (download/share/upload/template) for use
// inside FleetAnalytics's three-dots dropdown. Keeps all xlsx logic here so
// FleetHeader doesn't need to be visible.

interface FleetHeaderExcelItemsProps {
  vehicles: FleetVehicle[]
  filteredVehicles?: FleetVehicle[]
  onBulkUpload: (vehicles: any[]) => Promise<void>
}

function FleetHeaderExcelItems({ vehicles, filteredVehicles, onBulkUpload }: FleetHeaderExcelItemsProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = useT()
  const vehiclesToExport = filteredVehicles || vehicles

  const buildWorkbook = async () => {
    const data = vehiclesToExport.map((v, i) => ({
      'No.': i + 1,
      'Registration': v.registration || '',
      'Make': v.make || '',
      'Model': v.model || '',
      'Colour': v.colour || '',
      'Size': v.size || '',
      'Condition': v.condition || '',
      'Contract': v.contract || 'No Contract',
      'Insurance Status': v.insuranceStatus || 'Unknown',
      'MOT Expiry': v.motExpiry ? new Date(v.motExpiry).toLocaleDateString('en-GB') : '',
      'Tax Expiry': v.taxExpiry ? new Date(v.taxExpiry).toLocaleDateString('en-GB') : '',
      'Comments': v.comments || '',
      'Date Acquired': v.dateAcquired ? new Date(v.dateAcquired).toLocaleDateString('en-GB') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Vehicles')
    return wb
  }

  const handleDownload = async () => {
    if (!vehiclesToExport.length) return alert(t('fleet.excel.alertNoVehicles'))
    setIsDownloading(true)
    try {
      const wb = await buildWorkbook()
      const ts = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `fleet-vehicles-${ts}.xlsx`)
    } catch (e) {
      alert(t('fleet.excel.alertExportFailed'))
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDownloadTemplate = async () => {
    setIsDownloading(true)
    try {
      const template = [
        { 'Registration': 'RS67MAW', 'Make': 'Ford', 'Model': 'Transit', 'Colour': 'White', 'Size': 'L2H1', 'MOT Expiry': '22/12/2030', 'Tax Expiry': '03/12/2025', 'Comments': 'Example vehicle 1', 'Date Acquired': '15/01/2024' },
        { 'Registration': 'NY86ZMR', 'Make': 'Ford', 'Model': 'Fiesta', 'Colour': 'Bronze', 'Size': 'Car', 'MOT Expiry': '19/09/2023', 'Tax Expiry': '22/01/2020', 'Comments': 'Example vehicle 2', 'Date Acquired': '10/03/2024' },
      ]
      const ws = XLSX.utils.json_to_sheet(template)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Fleet Template')
      XLSX.writeFile(wb, 'fleet-template.xlsx')
    } catch (e) {
      alert(t('fleet.excel.alertTemplateFailed'))
    } finally {
      setIsDownloading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      const processed = rows.map(row => ({
        registration: String(row['Registration'] || '').toUpperCase().trim(),
        make: String(row['Make'] || '').trim(),
        model: String(row['Model'] || '').trim(),
        colour: String(row['Colour'] || '').trim(),
        size: String(row['Size'] || '').trim(),
        motExpiry: row['MOT Expiry'] ? String(row['MOT Expiry']) : '',
        taxExpiry: row['Tax Expiry'] ? String(row['Tax Expiry']) : '',
        comments: String(row['Comments'] || '').trim(),
        dateAcquired: row['Date Acquired'] ? String(row['Date Acquired']) : '',
        condition: 'Excellent',
      })).filter(v => v.registration)
      await onBulkUpload(processed)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('fleet.excel.alertUploadFailed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const btnClass = 'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="p-2">
      <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('fleet.excel.sectionTitle')}</p>

      <button onClick={handleDownload} disabled={isDownloading || isSharing} className={btnClass}>
        {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {t('fleet.excel.download', { count: vehiclesToExport.length })}
      </button>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || isDownloading}
        className={btnClass}
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? t('fleet.excel.uploading') : t('fleet.excel.uploadExcel')}
      </button>

      <button onClick={handleDownloadTemplate} disabled={isDownloading} className={btnClass}>
        {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
        {t('fleet.excel.downloadTemplate')}
      </button>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
    </div>
  )
}

// Extended FilterConfig interface with insurance filter + DEFLEET FILTER
interface FilterConfig {
  search: string
  excludeKeywords: string
  size: string
  condition: string
  status: string
  contract: string
  motExpiring: boolean
  recall: boolean
  dateFrom: string
  dateTo: string
  insurance: string
  showDefleeted?: boolean
}

// Safe string conversion helper
const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    logger.log('Attempted to render object as string:', value)
    return ''
  }
  try {
    return String(value)
  } catch {
    return ''
  }
}

// Get unique sizes from vehicles
const getUniqueSizes = (vehicles: FleetVehicle[]): string[] => {
  const sizes = vehicles.map(v => v.size).filter(Boolean)
  return [...new Set(sizes)].sort()
}

// Check if date is expiring within 30 days OR already expired
const isExpiringSoon = (dateString: string): boolean => {
  if (!dateString) return false
  const date = new Date(dateString)
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  return date <= thirtyDaysFromNow
}

// Helper to get unique condition names from condition objects
const getUniqueConditionNames = (conditions: any[]): string[] => {
  if (!conditions || !Array.isArray(conditions)) return []

  const names = conditions.map(c => {
    if (typeof c === 'string') return c
    if (c && typeof c === 'object' && 'name' in c) return c.name
    return String(c)
  }).filter(Boolean)

  return [...new Set(names)]
}

export default function FleetInventoryPage() {
  const { user } = useAuth()
  const t = useT()
  const fleetData = useFleetData()
  const {
    handleBulkImport: handleBulkUpload,
    handleClearAll,
    handleAddVehicle,
    handleUpdateVehicle,
    handleDeleteVehicle,
    clearingAll,
    bulkInsuranceLoading,
    handleBulkInsurance,
    deletingVehicle,
    syncNotification: contractSyncNotification,
    setSyncNotification: clearContractSyncNotification,
    duplicateModal
  } = useFleetActions(fleetData)

  // ✅ Zao: auto-refresh when Zao updates a vehicle
  useEffect(() => {
    const handler = () => { if (fleetData.refreshData) fleetData.refreshData() }
    window.addEventListener('zao:vehicle-updated', handler)
    return () => window.removeEventListener('zao:vehicle-updated', handler)
  }, [fleetData.refreshData])

  // Vehicle Selection State
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set())

  // Defleet modal state
  const [defleetingVehicle, setDefleetingVehicle] = useState<FleetVehicle | null>(null)
  const [restoringVehicle, setRestoringVehicle] = useState<FleetVehicle | null>(null)
  const [restoreLoading, setRestoreLoading] = useState(false)

  // Extract data from fleetData with proper null checks
  const vehicles = fleetData?.vehicles || []
  const conditions = fleetData?.conditions || []
  const loading = fleetData?.loading || false
  const fleetError = fleetData?.error || null

  // Transform vehicles to FleetVehicle type with insuranceStatus included
  const fleetVehicles: FleetVehicle[] = useMemo(() => {
    if (!vehicles || !Array.isArray(vehicles)) {
      return []
    }

    return vehicles.map(vehicle => ({
      id: safeString(vehicle.id),
      registration: safeString(vehicle.registration),
      make: safeString(vehicle.make),
      model: safeString(vehicle.model),
      colour: safeString(vehicle.colour),
      size: safeString(vehicle.size),
      motExpiry: safeString(vehicle.motExpiry),
      taxExpiry: safeString(vehicle.taxExpiry),
      hasRecall: (vehicle as any).hasRecall === true,
      comments: safeString(vehicle.comments),
      condition: safeString(vehicle.condition),
      organizationId: safeString(vehicle.organizationId),
      createdBy: safeString(vehicle.createdBy),
      createdAt: vehicle.createdAt || new Date(),
      contract: vehicle.contract || null,
      contractColor: vehicle.contractColor || null,
      insuranceStatus: vehicle.insuranceStatus       || null,
      insurancePolicyId: vehicle.insurancePolicyId     || null,  // ✅ NEW
      insurancePolicyName: vehicle.insurancePolicyName   || null,  // ✅ NEW
      insurancePolicyExpiry: vehicle.insurancePolicyExpiry || null,  // ✅ NEW
      dateAcquired: safeString(vehicle.dateAcquired),
      isDefleeted: vehicle.isDefleeted,
      defleetDate: vehicle.defleetDate || undefined,
      defleetProcessedDate: vehicle.defleetProcessedDate || undefined,
      defleetReason: vehicle.defleetReason,
      defleetReasonDetails: vehicle.defleetReasonDetails,
      defleetedBy: vehicle.defleetedBy,
      defleetedByName: vehicle.defleetedByName,
      vehicleDiagramType: (vehicle as any).vehicleDiagramType || null,
      damagePins: (vehicle as any).damagePins || [],
    }))
  }, [vehicles])

  // Filter state with insurance filter + DEFLEET FILTER
  const [filters, setFilters] = useState<FilterConfig>({
    search: '',
    excludeKeywords: '',
    size: 'all',
    condition: 'all',
    status: 'all',
    contract: 'all',
    motExpiring: false,
    recall: false,
    dateFrom: '',
    dateTo: '',
    insurance: 'all',
    showDefleeted: false
  })

  // Sort configuration
  const [sortConfig, setSortConfig] = useState({
    key: 'createdAt',
    direction: 'desc' as 'asc' | 'desc'
  })

  // Apply filters and sorting
  const filteredAndSortedVehicles = useMemo(() => {
    let filtered = [...fleetVehicles]

    if (filters.showDefleeted) {
      filtered = filtered.filter(vehicle => vehicle.isDefleeted === true)
    } else {
      filtered = filtered.filter(vehicle => !vehicle.isDefleeted)
    }

    if (filters.search.trim()) {
      const searchTerm = filters.search.toLowerCase()
      filtered = filtered.filter(vehicle =>
        vehicle.registration.toLowerCase().includes(searchTerm) ||
        vehicle.make.toLowerCase().includes(searchTerm) ||
        vehicle.model.toLowerCase().includes(searchTerm) ||
        (vehicle.colour && vehicle.colour.toLowerCase().includes(searchTerm)) ||
        vehicle.size.toLowerCase().includes(searchTerm) ||
        vehicle.condition.toLowerCase().includes(searchTerm) ||
        (vehicle.comments && vehicle.comments.toLowerCase().includes(searchTerm)) ||
        (vehicle.contract && vehicle.contract.toLowerCase().includes(searchTerm))
      )
    }

    if (filters.excludeKeywords.trim()) {
      const excludeTerms = filters.excludeKeywords.toLowerCase().split(',').map(term => term.trim())
      filtered = filtered.filter(vehicle => {
        const vehicleText = [
          vehicle.registration,
          vehicle.make,
          vehicle.model,
          vehicle.colour || '',
          vehicle.size,
          vehicle.condition,
          vehicle.comments || '',
          vehicle.contract || ''
        ].join(' ').toLowerCase()

        return !excludeTerms.some(term => vehicleText.includes(term))
      })
    }

    if (filters.size !== 'all') {
      filtered = filtered.filter(vehicle => vehicle.size === filters.size)
    }

    if (filters.condition !== 'all') {
      filtered = filtered.filter(vehicle => vehicle.condition === filters.condition)
    }

    if (filters.contract !== 'all') {
      if (filters.contract === 'none') {
        filtered = filtered.filter(vehicle => !vehicle.contract)
      } else {
        filtered = filtered.filter(vehicle => vehicle.contract === filters.contract)
      }
    }

    if (filters.insurance !== 'all') {
      if (filters.insurance === 'not-insured') {
        filtered = filtered.filter(vehicle =>
          vehicle.insuranceStatus === 'Not Insured' ||
          !vehicle.insuranceStatus
        )
      } else if (filters.insurance === 'insured') {
        filtered = filtered.filter(vehicle => vehicle.insuranceStatus === 'Insured')
      }
    }

    if (filters.motExpiring) {
      filtered = filtered.filter(vehicle =>
        vehicle.motExpiry && isExpiringSoon(vehicle.motExpiry)
      )
    }

    if (filters.recall) {
      filtered = filtered.filter(vehicle => vehicle.hasRecall === true)
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom)
      filtered = filtered.filter(vehicle => {
        const vehicleDate = new Date(vehicle.createdAt)
        return vehicleDate >= fromDate
      })
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(vehicle => {
        const vehicleDate = new Date(vehicle.createdAt)
        return vehicleDate <= toDate
      })
    }

    return filtered.sort((a, b) => {
      let aValue: any
      let bValue: any

      const sortKey = filters.motExpiring ? 'motExpiry' : sortConfig.key
      const sortDirection = filters.motExpiring ? 'asc' : sortConfig.direction

      switch (sortKey) {
        case 'createdAt':
          aValue = new Date(a.createdAt)
          bValue = new Date(b.createdAt)
          break
        case 'motExpiry':
          aValue = a.motExpiry ? new Date(a.motExpiry) : new Date('9999-12-31')
          bValue = b.motExpiry ? new Date(b.motExpiry) : new Date('9999-12-31')
          break
        case 'taxExpiry':
          aValue = a.taxExpiry ? new Date(a.taxExpiry) : new Date('9999-12-31')
          bValue = b.taxExpiry ? new Date(b.taxExpiry) : new Date('9999-12-31')
          break
        case 'contract':
          aValue = (a.contract || 'ZZZ').toLowerCase()
          bValue = (b.contract || 'ZZZ').toLowerCase()
          break
        default:
          aValue = String((a as any)[sortKey] || '').toLowerCase()
          bValue = String((b as any)[sortKey] || '').toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [fleetVehicles, filters, sortConfig])

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'search' || key === 'excludeKeywords' || key === 'dateFrom' || key === 'dateTo') {
      return value && value !== ''
    }
    if (key === 'motExpiring' || key === 'showDefleeted') {
      return value === true
    }
    return value && value !== '' && value !== 'all'
  })

  // Pagination
  const {
    currentPageData,
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    startIndex,
    endIndex,
    hasNextPage,
    hasPreviousPage,
    itemsPerPageOptions,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    setItemsPerPage
  } = usePagination({
    data: filteredAndSortedVehicles,
    itemsPerPageOptions: [10, 25, 50, 100],
    defaultItemsPerPage: 25
  })

  // Local state
  const [showAddForm, setShowAddForm] = useState(false)
  const [viewingVehicle, setViewingVehicle] = useState<FleetVehicle | null>(null)
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localSuccess, setLocalSuccess] = useState<string | null>(null)
  const [showBulkRoadTaxModal, setShowBulkRoadTaxModal] = useState(false)
  const [bulkDvlaOrg, setBulkDvlaOrg] = useState<string | null>(null)

  // Handle sorting
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // Selection handlers
  const handleToggleSelection = (vehicleId: string) => {
    setSelectedVehicleIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(vehicleId)) {
        newSet.delete(vehicleId)
      } else {
        newSet.add(vehicleId)
      }
      return newSet
    })
  }

  const handleToggleSelectAll = () => {
    const allCurrentIds = currentPageData.map(v => v.id)
    const allSelected = allCurrentIds.every(id => selectedVehicleIds.has(id))

    setSelectedVehicleIds(prev => {
      const newSet = new Set(prev)
      if (allSelected) {
        allCurrentIds.forEach(id => newSet.delete(id))
      } else {
        allCurrentIds.forEach(id => newSet.add(id))
      }
      return newSet
    })
  }

  const clearSelection = () => {
    setSelectedVehicleIds(new Set())
  }

  const getSelectedVehicles = () => {
    return fleetVehicles.filter(v => selectedVehicleIds.has(v.id))
  }

  // Bulk DVLA refresh — resolve the org, then open the progress modal.
  const handleOpenBulkDvla = async () => {
    if (!user) {
      setLocalError(t('fleet.page.userNotAuthenticated'))
      return
    }
    try {
      const profile = await userProfileService.getProfile(user.uid)
      if (!profile?.organizationId) {
        setLocalError(t('fleet.page.orgNotFound'))
        return
      }
      setBulkDvlaOrg(profile.organizationId)
    } catch {
      setLocalError(t('fleet.page.orgNotFound'))
    }
  }

  // Bulk Road Tax Handler
  const handleBulkRoadTaxUpdate = async (taxExpiry: string) => {
    if (!user) {
      throw new Error(t('fleet.page.userNotAuthenticated'))
    }

    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error(t('fleet.page.orgNotFound'))
      }

      const result = await BulkRoadTaxService.bulkUpdateRoadTax({
        organizationId: userProfile.organizationId,
        userId: user.uid,
        userDisplayName: user.displayName || user.email || 'Unknown User',
        taxExpiry,
        vehicleIds: Array.from(selectedVehicleIds)
      })

      if (result.success) {
        setLocalSuccess(
          t('fleet.page.roadTaxSuccess', { count: result.fleetUpdated })
        )
        clearSelection()
        // Mirror the write locally instead of re-downloading the whole fleet.
        // bulkUpdateRoadTax returns the exact vehicle IDs it set.
        const updatedIds = new Set(result.processedVehicles)
        fleetData.applyLocalVehiclePatch({ taxExpiry }, v => !!v.id && updatedIds.has(v.id))
        setTimeout(() => setLocalSuccess(null), 5000)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('fleet.page.failedRoadTax')
      setLocalError(errorMessage)
      setTimeout(() => setLocalError(null), 5000)
      throw error
    }
  }

  const clearAllFilters = () => {
    setFilters({
      search: '',
      excludeKeywords: '',
      size: 'all',
      condition: 'all',
      status: 'all',
      contract: 'all',
      motExpiring: false,
      recall: false,
      dateFrom: '',
      dateTo: '',
      insurance: 'all',
      showDefleeted: false
    })
  }

  const handleAddVehicleWithErrorHandling = async (vehicleData: any) => {
    setLocalError(null)

    if (process.env.NODE_ENV === 'development') {
      logger.log('Adding vehicle with data:', {
        vehicleData,
        hasContract: 'contract' in vehicleData,
        contractValue: vehicleData.contract,
        hasContractColor: 'contractColor' in vehicleData,
        contractColorValue: vehicleData.contractColor,
        hasInsuranceStatus: 'insuranceStatus' in vehicleData,
        insuranceStatusValue: vehicleData.insuranceStatus
      })
    }

    try {
      await handleAddVehicle(vehicleData)
      setShowAddForm(false)
      setLocalSuccess(t('fleet.page.vehicleAdded'))
      setTimeout(() => setLocalSuccess(null), 5000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('fleet.page.failedAddVehicle')
      setLocalError(errorMessage)
      setTimeout(() => setLocalError(null), 5000)

      if (process.env.NODE_ENV === 'development') {
        logger.info('Vehicle add failed:', errorMessage)
      }
    }
  }

  const handleUpdateVehicleWithErrorHandling = async (vehicleId: string, updates: any) => {
    setLocalError(null)

    if (process.env.NODE_ENV === 'development') {
      logger.log('Fleet page sending update:', {
        vehicleId,
        updates,
        hasContract: 'contract' in updates,
        contractValue: updates.contract,
        hasContractColor: 'contractColor' in updates,
        contractColorValue: updates.contractColor,
        hasInsuranceStatus: 'insuranceStatus' in updates,
        insuranceStatusValue: updates.insuranceStatus
      })
    }

    try {
      await handleUpdateVehicle(vehicleId, updates)
      setEditingVehicle(null)
      setLocalSuccess(t('fleet.page.vehicleUpdated'))
      setTimeout(() => setLocalSuccess(null), 5000)

      if (process.env.NODE_ENV === 'development') {
        logger.log('Fleet vehicle updated - contract and insurance sync may have occurred to yard!')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('fleet.page.failedUpdateVehicle')
      const displayMessage = errorMessage.replace(/[⚠️❌]/g, '').trim()

      setLocalError(displayMessage)

      if (!errorMessage.includes('already exists')) {
        setTimeout(() => setLocalError(null), 5000)
      }

      if (process.env.NODE_ENV === 'development') {
        logger.info('Vehicle update prevented:', displayMessage)
      }
    }
  }

  // Opens defleet modal instead of direct delete
  const handleDeleteVehicleClick = async (vehicleOrId: FleetVehicle | string): Promise<void> => {
    const vehicle = typeof vehicleOrId === 'string'
      ? fleetVehicles.find(v => v.id === vehicleOrId)
      : vehicleOrId

    if (vehicle) {
      setDefleetingVehicle(vehicle)
    }
  }

  // Handles defleet confirmation from modal
  const handleDefleetConfirm = async (reason: DefleetReason, details: string, defleetDate: string) => {
    if (!defleetingVehicle) return

    setLocalError(null)
    try {
      await handleDeleteVehicle(
        defleetingVehicle.id,
        defleetingVehicle,
        reason,
        details,
        defleetDate
      )

      if (fleetData.refreshData) {
        await fleetData.refreshData()
      }

      setDefleetingVehicle(null)
      setViewingVehicle(null)
      setEditingVehicle(null)

      setLocalSuccess(t('fleet.page.vehicleDefleeted', { reg: defleetingVehicle.registration }))
      setTimeout(() => setLocalSuccess(null), 5000)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('fleet.page.failedDefleet'))
      setTimeout(() => setLocalError(null), 5000)
    }
  }

  // Opens the restore confirmation for a defleeted vehicle.
  const handleRestoreVehicleClick = (vehicle: FleetVehicle) => {
    setRestoringVehicle(vehicle)
  }

  // Restores a defleeted vehicle back to the active fleet.
  const handleRestoreConfirm = async () => {
    if (!restoringVehicle || !user) return
    setRestoreLoading(true)
    setLocalError(null)
    try {
      const res = await enhancedVehicleService.restoreVehicle(restoringVehicle.id, {
        userId: user.uid,
        userDisplayName: user.displayName || 'Unknown',
      })
      if (!res.success) throw new Error(res.errors[0] || 'Restore failed')

      if (fleetData.refreshData) await fleetData.refreshData()

      const reg = restoringVehicle.registration
      setRestoringVehicle(null)
      setViewingVehicle(null)
      setEditingVehicle(null)
      setLocalSuccess(t('fleet.page.vehicleRestored', { reg }))
      setTimeout(() => setLocalSuccess(null), 5000)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('fleet.page.failedRestore'))
      setTimeout(() => setLocalError(null), 5000)
    } finally {
      setRestoreLoading(false)
    }
  }

  const handleBulkUploadWithErrorHandling = async (uploadedVehicles: any[]) => {
    setLocalError(null)
    try {
      await handleBulkUpload(uploadedVehicles)
      setLocalSuccess(t('fleet.page.bulkUploadSuccess', { count: uploadedVehicles.length }))
      setTimeout(() => setLocalSuccess(null), 5000)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('fleet.page.failedBulkUpload'))
      setTimeout(() => setLocalError(null), 5000)
    }
  }

  const handleClearAllWithErrorHandling = async () => {
    setLocalError(null)
    try {
      await handleClearAll()
      setLocalSuccess(t('fleet.page.allCleared'))
      setTimeout(() => setLocalSuccess(null), 5000)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('fleet.page.failedClear'))
      setTimeout(() => setLocalError(null), 5000)
    }
  }

  const handleDirectBulkInsurance = handleBulkInsurance

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
          <Navigation />
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">{t('fleet.page.loading')}</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        <Navigation />

        {contractSyncNotification && (
          <ContractSyncNotification
            notification={contractSyncNotification}
            onClose={() => clearContractSyncNotification(null)}
          />
        )}

        {deletingVehicle && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="text-gray-900 dark:text-gray-100">
                  {t('fleet.page.defleetingOverlay')}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="pt-0">
          <div className="w-full px-2 sm:px-4 lg:px-6 py-2">

            {/* Bulk Road Tax selection toolbar */}
            {selectedVehicleIds.size > 0 && (
              <BulkRoadTaxToolbar
                selectedCount={selectedVehicleIds.size}
                onOpenModal={() => setShowBulkRoadTaxModal(true)}
                onClearSelection={clearSelection}
                totalVehicles={fleetVehicles.length}
              />
            )}

            {/* FleetActions — kept for any hidden logic it handles */}
            <FleetActions
              vehicleCount={fleetVehicles.filter(v => !v.isDefleeted).length}
              vehicles={fleetVehicles}
              filteredVehicles={filteredAndSortedVehicles}
              conditions={conditions}
              onBulkUpload={handleBulkUploadWithErrorHandling}
              onClearAll={handleClearAllWithErrorHandling}
              clearingAll={clearingAll}
              onAddVehicle={() => setShowAddForm(true)}
            />

            <FleetAlerts
              error={localError || fleetError}
              success={localSuccess}
              onClearError={() => setLocalError(null)}
              onClearSuccess={() => setLocalSuccess(null)}
            />

            {/* ═══════════════════════════════════════════════
                ROW 1: Metric strip + Add Vehicle + ⋮ menu
                ROW 2: Search & Filters
            ═══════════════════════════════════════════════ */}
            <div className="space-y-3">

              {/* ROW 1: FleetAnalytics now owns the action buttons */}
              <div className="w-full">
                <FleetAnalytics
                  vehicles={filteredAndSortedVehicles}
                  totalVehicles={fleetVehicles.filter(v => !v.isDefleeted).length}
                  motFilter={filters.motExpiring}
                  sizeFilter={filters.size !== 'all' ? filters.size : ''}
                  insuranceFilter={filters.insurance}
                  onToggleMotFilter={() => setFilters(prev => ({ ...prev, motExpiring: !prev.motExpiring }))}
                  onSizeFilter={(size) => setFilters(prev => ({ ...prev, size: size || 'all' }))}
                  onInsuranceFilter={(status) => setFilters(prev => ({ ...prev, insurance: status || 'all' }))}
                  onAddVehicle={() => setShowAddForm(true)}
                  onBulkInsurance={handleDirectBulkInsurance}
                  filteredVehicles={filteredAndSortedVehicles}
                  vehicleCount={fleetVehicles.filter(v => !v.isDefleeted).length}
                  bulkInsuranceLoading={bulkInsuranceLoading}
                  onClearAll={handleClearAllWithErrorHandling}
                  clearingAll={clearingAll}
                  excelActionsSlot={
                    <FleetHeaderExcelItems
                      vehicles={fleetVehicles}
                      filteredVehicles={filteredAndSortedVehicles}
                      onBulkUpload={handleBulkUploadWithErrorHandling}
                    />
                  }
                />
              </div>

              {/* FleetHeader — kept for Excel download/upload/share/template logic.
                  We render it hidden so its internal state and file ref stay alive,
                  then expose its menu items via FleetHeaderExcelItems above. */}
              <div className="hidden">
                <FleetHeader
                  vehicles={fleetVehicles}
                  filteredVehicles={filteredAndSortedVehicles}
                  conditions={conditions}
                  onBulkUpload={handleBulkUploadWithErrorHandling}
                  onBulkInsurance={handleDirectBulkInsurance}
                  vehicleCount={fleetVehicles.filter(v => !v.isDefleeted).length}
                  clearingAll={clearingAll}
                  bulkInsuranceLoading={bulkInsuranceLoading}
                  onClearAll={handleClearAllWithErrorHandling}
                  onAddVehicle={() => setShowAddForm(true)}
                  showSyncBanner={false}
                />
              </div>

              {/* ROW 3: Search & Filters */}
              <div className="w-full relative z-10">
                <FleetFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  conditions={conditions}
                  sizes={getUniqueSizes(fleetVehicles)}
                  onClearFilters={clearAllFilters}
                />
              </div>

            </div>

            {totalItems > 0 && (
              <div className="mt-3 mb-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 px-1">
                {t('fleet.page.showing', { from: startIndex + 1, end: endIndex, total: totalItems })}
                {hasActiveFilters && t('fleet.page.filteredSuffix')}
                {totalItems !== fleetVehicles.length && t('fleet.page.totalSuffix', { total: fleetVehicles.length })}
                {selectedVehicleIds.size > 0 && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">
                    {t('fleet.page.selectedSuffix', { count: selectedVehicleIds.size })}
                  </span>
                )}
              </div>
            )}

            {fleetVehicles.filter(v => !v.isDefleeted).length > 0 && (
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={handleOpenBulkDvla}
                  className="inline-flex items-center gap-2 bg-[#025940] hover:bg-[#012619] text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t('fleet.bulkDvla.button')}
                </button>
              </div>
            )}

            <FleetTable
              vehicles={currentPageData}
              sortConfig={sortConfig}
              onSort={handleSort}
              onViewVehicle={setViewingVehicle}
              selectedVehicleIds={selectedVehicleIds}
              onToggleSelection={handleToggleSelection}
              onToggleSelectAll={handleToggleSelectAll}
            />

            {totalItems > 0 && (
              <div className="mt-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  itemsPerPageOptions={itemsPerPageOptions}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  hasNextPage={hasNextPage}
                  hasPreviousPage={hasPreviousPage}
                  onPageChange={goToPage}
                  onNextPage={goToNextPage}
                  onPreviousPage={goToPreviousPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </div>
            )}

            {!loading && fleetVehicles.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('fleet.page.emptyNoVehiclesTitle')}</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">{t('fleet.page.emptyNoVehiclesMsg')}</p>
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('fleet.page.addFirstVehicle')}
                </Button>
              </div>
            )}

            {!loading && fleetVehicles.length > 0 && filteredAndSortedVehicles.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('fleet.page.emptyNoMatchTitle')}</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">{t('fleet.page.emptyNoMatchMsg')}</p>
                <Button
                  onClick={clearAllFilters}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {t('fleet.page.clearAllFilters')}
                </Button>
              </div>
            )}

          </div>

          {/* ── Modals ─────────────────────────────────────────── */}

          {bulkDvlaOrg && (
            <BulkDvlaRefreshModal
              organizationId={bulkDvlaOrg}
              vehicleCount={fleetVehicles.filter(v => !v.isDefleeted).length}
              onClose={() => setBulkDvlaOrg(null)}
              onComplete={() => { if (fleetData.refreshData) fleetData.refreshData() }}
            />
          )}

          {showAddForm && (
            <VehicleForm
              onAdd={handleAddVehicleWithErrorHandling}
              onCancel={() => setShowAddForm(false)}
              conditions={getUniqueConditionNames(conditions)}
              existingVehicles={fleetVehicles}
            />
          )}

          {viewingVehicle && (
            <FleetVehicleDetailModal
              vehicle={viewingVehicle}
              onClose={() => setViewingVehicle(null)}
              onEdit={(vehicle) => {
                setViewingVehicle(null)
                setEditingVehicle(vehicle)
              }}
              onDelete={handleDeleteVehicleClick}
              onRestore={handleRestoreVehicleClick}
            />
          )}

          {editingVehicle && (
            <FleetVehicleEditModal
              vehicle={editingVehicle}
              conditions={conditions}
              vehicles={fleetVehicles}
              onSave={handleUpdateVehicleWithErrorHandling}
              onCancel={() => setEditingVehicle(null)}
              onDelete={handleDeleteVehicleClick}
            />
          )}

          <DuplicateVehicleModal
            isOpen={duplicateModal.isOpen}
            onClose={duplicateModal.onCancel}
            onConfirm={duplicateModal.onConfirm}
            duplicates={duplicateModal.duplicates}
            totalCount={duplicateModal.totalCount}
          />

          <BulkRoadTaxModal
            isOpen={showBulkRoadTaxModal}
            onClose={() => setShowBulkRoadTaxModal(false)}
            selectedVehicles={getSelectedVehicles()}
            onConfirm={handleBulkRoadTaxUpdate}
          />

          {defleetingVehicle && (
            <DefleetVehicleModal
              isOpen={true}
              onClose={() => setDefleetingVehicle(null)}
              onConfirm={handleDefleetConfirm}
              vehicle={defleetingVehicle}
            />
          )}

          {restoringVehicle && (
            <ConfirmationModal
              isOpen={true}
              onClose={() => setRestoringVehicle(null)}
              onConfirm={handleRestoreConfirm}
              title={t('fleet.page.restoreTitle')}
              message={t('fleet.page.restoreMessage', { reg: restoringVehicle.registration })}
              confirmText={t('fleet.page.restoreConfirm')}
              cancelText={t('fleet.page.restoreCancel')}
              variant="default"
              loading={restoreLoading}
            />
          )}

        </div>
      </div>
    </ProtectedRoute>
  )
}