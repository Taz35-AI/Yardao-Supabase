// src/components/features/dashboard/VehicleActionsToolbar.tsx
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Download, LogOut } from 'lucide-react'
import { CheckedInVehicle } from '@/types'
import { ExportToExcelButton } from '@/components/common/Buttons/ExportToExcelButton'
import { BulkCheckoutButton } from '@/components/common/Buttons/BulkCheckoutButton'

interface VehicleActionsToolbarProps {
  vehicles: CheckedInVehicle[]
  filteredVehicles: CheckedInVehicle[]
  onBulkCheckout: (vehicleIds: string[]) => Promise<void>
  className?: string
}

export const VehicleActionsToolbar = React.memo(function VehicleActionsToolbar({
  vehicles,
  filteredVehicles,
  onBulkCheckout,
  className = ''
}: VehicleActionsToolbarProps) {
  
  // Enhanced export function with insurance column support
  const handleExport = () => {
    // Enhanced CSV export functionality with insurance and contract columns
    const headers = [
      'Registration', 
      'Make', 
      'Model', 
      'Colour', 
      'Size', 
      'Condition', 
      'Status',
      'Contract',
      'Insurance Status', // Added insurance column
      'Check-in Date'
    ]
    
    const csvContent = [
      headers.join(','),
      ...filteredVehicles.map(vehicle => [
        vehicle.registration || '',
        vehicle.make || '',
        vehicle.model || '',
        vehicle.colour || '',
        vehicle.size || '',
        vehicle.condition || '',
        vehicle.status || '',
        vehicle.contract || 'No Contract', // Added contract data
        vehicle.insuranceStatus || 'Unknown', // Added insurance data
        vehicle.createdAt ? new Date(vehicle.createdAt).toLocaleDateString() : ''
      ].map(field => `"${field}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `yard-vehicles-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleBulkCheckoutClick = async () => {
    if (!filteredVehicles.length) {
      alert('No vehicles to check out')
      return
    }

    if (window.confirm(`Are you sure you want to check out ${filteredVehicles.length} vehicle${filteredVehicles.length !== 1 ? 's' : ''}?`)) {
      const vehicleIds = filteredVehicles.map(vehicle => vehicle.id)
      await onBulkCheckout(vehicleIds)
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Enhanced Export Button with Insurance Support */}
      <Button
        onClick={handleExport}
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
        disabled={!filteredVehicles.length}
      >
        <Download className="w-3 h-3 mr-1" />
        Export
      </Button>

      {/* Bulk Checkout Button */}
      <Button
        onClick={handleBulkCheckoutClick}
        variant="default"
        size="sm"
        className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
        disabled={!filteredVehicles.length}
      >
        <LogOut className="w-3 h-3 mr-1" />
        Bulk Checkout
      </Button>

      {/* Vehicle count indicator for mobile */}
      <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 ml-auto">
        {filteredVehicles.length === vehicles.length ? (
          `${vehicles.length} total`
        ) : (
          `${filteredVehicles.length}/${vehicles.length}`
        )}
      </div>
    </div>
  )
})