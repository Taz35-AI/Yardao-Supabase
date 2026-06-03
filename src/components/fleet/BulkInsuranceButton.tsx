// src/components/fleet/BulkInsuranceButton.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { InsuranceConfirmationDialog } from '@/components/dialogs/InsuranceConfirmationDialog'
import { Shield, ChevronDown, AlertTriangle, Info } from 'lucide-react'
import { InsuranceStatus, FleetVehicle } from '@/types'
import { logger } from '@/lib/logger'

interface BulkInsuranceButtonProps {
  vehicles: FleetVehicle[]
  filteredVehicles?: FleetVehicle[]
  onBulkInsurance: (insuranceStatus: InsuranceStatus, vehicleIds?: string[]) => Promise<void>
  loading?: boolean // This comes from useFleetActions.bulkInsuranceLoading
  className?: string
}

export function BulkInsuranceButton({
  vehicles,
  filteredVehicles,
  onBulkInsurance,
  loading = false, // FIXED: Use external loading state
  className = ''
}: BulkInsuranceButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedScope, setSelectedScope] = useState<'all' | 'filtered'>('all')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingInsuranceStatus, setPendingInsuranceStatus] = useState<InsuranceStatus | null>(null)
  // REMOVED: const [isProcessing, setIsProcessing] = useState(false) - using external loading instead
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  // Calculate statistics
  const targetVehicles = selectedScope === 'filtered' ? (filteredVehicles || vehicles) : vehicles
  const totalVehicles = targetVehicles.length
  const insuredCount = targetVehicles.filter(v => v.insuranceStatus === 'Insured').length
  const uninsuredCount = targetVehicles.filter(v => v.insuranceStatus === 'Not Insured').length
  const unknownCount = totalVehicles - insuredCount - uninsuredCount

  // Handle insurance status selection - SHOW CONFIRMATION DIALOG
  const handleInsuranceSelection = (status: InsuranceStatus) => {
    setPendingInsuranceStatus(status)
    setShowConfirmDialog(true)
    setShowDropdown(false)
  }

  // Handle confirmation from dialog - SIMPLIFIED: No internal loading state
  const handleConfirmInsurance = async () => {
    if (!pendingInsuranceStatus) return

    try {
      const vehicleIds = selectedScope === 'filtered' 
        ? (filteredVehicles || vehicles).map(v => v.id).filter(Boolean)
        : undefined // undefined means all vehicles

      // FIXED: Just call the function, loading state is managed externally
      await onBulkInsurance(pendingInsuranceStatus, vehicleIds)
      
      // Only close dialog after success
      setShowConfirmDialog(false)
      setPendingInsuranceStatus(null)
    } catch (error) {
      logger.error('Bulk insurance operation failed:', error)
      // Keep dialog open on error so user can see what happened
      // Error handling is done in the parent component
    }
  }

  // Handle dialog close
  const handleCloseDialog = () => {
    if (!loading) { // FIXED: Use external loading state
      setShowConfirmDialog(false)
      setPendingInsuranceStatus(null)
    }
  }

  // Insurance status options
  const insuranceOptions: { status: InsuranceStatus; label: string; color: string; icon: any }[] = [
    { status: 'Insured', label: 'Mark as Insured', color: 'text-green-700 bg-green-50 hover:bg-green-100', icon: Shield },
    { status: 'Not Insured', label: 'Mark as Not Insured', color: 'text-red-700 bg-red-50 hover:bg-red-100', icon: AlertTriangle },
  ]

  if (totalVehicles === 0) {
    return null
  }

  return (
    <>
      <div className={`relative ${className}`} ref={dropdownRef}>
        {/* Main Button */}
        <Button
          onClick={() => setShowDropdown(!showDropdown)}
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs border-blue-300 hover:bg-blue-50 dark:border-blue-600 dark:hover:bg-blue-700/20 text-blue-700 dark:text-blue-300"
          disabled={loading || totalVehicles === 0} // FIXED: Use external loading
        >
          {loading ? ( // FIXED: Use external loading
            <>
              <div className="w-3 h-3 mr-1 border border-blue-500 border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Shield className="w-3 h-3 mr-1" />
              Bulk Insurance
              <ChevronDown className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>

        {/* Dropdown Menu */}
        {showDropdown && !loading && ( // FIXED: Use external loading
          <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
            {/* Header */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <Shield className="w-4 h-4 mr-2 text-blue-500" />
                Bulk Insurance Update
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Update insurance status for multiple vehicles
              </p>
            </div>

            {/* Scope Selection */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Vehicles:
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked={selectedScope === 'all'}
                    onChange={() => setSelectedScope('all')}
                    className="mr-2 text-blue-600"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    All vehicles ({vehicles.length})
                  </span>
                </label>
                {filteredVehicles && filteredVehicles.length !== vehicles.length && (
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="scope"
                      value="filtered"
                      checked={selectedScope === 'filtered'}
                      onChange={() => setSelectedScope('filtered')}
                      className="mr-2 text-blue-600"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      Filtered results ({filteredVehicles.length})
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Current Status Summary */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current Status ({totalVehicles} vehicles):
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <div className="font-medium text-green-700 dark:text-green-300">{insuredCount}</div>
                  <div className="text-green-600 dark:text-green-400">Insured</div>
                </div>
                <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
                  <div className="font-medium text-red-700 dark:text-red-300">{uninsuredCount}</div>
                  <div className="text-red-600 dark:text-red-400">Uninsured</div>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="font-medium text-gray-700 dark:text-gray-300">{unknownCount}</div>
                  <div className="text-gray-600 dark:text-gray-400">Unknown</div>
                </div>
              </div>
            </div>

            {/* Insurance Options */}
            <div className="p-3">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Set Insurance Status:
              </div>
              <div className="space-y-1">
                {insuranceOptions.map((option) => {
                  const IconComponent = option.icon
                  return (
                    <button
                      key={option.status}
                      onClick={() => handleInsuranceSelection(option.status)}
                      className={`w-full flex items-center px-3 py-2 text-xs rounded-md transition-colors ${option.color} dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300`}
                    >
                      <IconComponent className="w-3 h-3 mr-2" />
                      {option.label}
                      <div className="ml-auto text-xs opacity-75">
                        {totalVehicles} vehicles
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Info */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-start">
                <Info className="w-3 h-3 mr-2 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  Changes will automatically sync to any checked-in vehicles in the yard.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <InsuranceConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={handleCloseDialog}
        onConfirm={handleConfirmInsurance}
        vehicleCount={totalVehicles}
        action={pendingInsuranceStatus || 'Insured'}
        loading={loading} // FIXED: Pass external loading state to dialog
      />
    </>
  )
}