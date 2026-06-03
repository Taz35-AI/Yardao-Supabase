// src/components/common/Buttons/ExportToExcelButton.tsx
// Fixed version that uses the proper centralized export utilities

'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { exportDashboardVehicles } from '@/utils/dashboardExport'
import type { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'

interface ExportToExcelButtonProps {
  vehicles: CheckedInVehicle[]
  filename?: string
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

export const ExportToExcelButton = React.memo(function ExportToExcelButton({
  vehicles,
  filename = 'checked-in-vehicles',
  className = '',
  variant = 'outline',
  size = 'md',
  disabled = false
}: ExportToExcelButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const exportToExcel = useCallback(async () => {
    logger.log('🔄 Export button clicked')
    logger.log('📊 Vehicles to export:', vehicles.length)
    
    if (!vehicles.length) {
      alert('No vehicles to export')
      return
    }

    setIsExporting(true)
    logger.log('🔄 Export started...')
    
    try {
      // Use the centralized export utility that properly handles Capacitor
      await exportDashboardVehicles(vehicles, filename)
      logger.log(`✅ Export completed successfully`)
    } catch (error: any) {
      logger.error('❌ Export error:', error)
      alert(`Failed to export: ${error?.message || 'Unknown error'}`)
    } finally {
      setIsExporting(false)
      logger.log('🔄 Export process completed')
    }
  }, [vehicles, filename])

  const getButtonSize = () => {
    switch (size) {
      case 'sm': return 'h-8 px-3 text-xs'
      case 'lg': return 'h-12 px-6 text-base'
      default: return 'h-10 px-4 text-sm'
    }
  }

  const vehicleCount = vehicles.length

  return (
    <Button
      variant={variant}
      onClick={exportToExcel}
      disabled={disabled || isExporting || vehicleCount === 0}
      className={`
        ${getButtonSize()}
        ${className}
        border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300
        dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        flex items-center space-x-2
        min-w-fit
      `}
      title={vehicleCount === 0 ? 'No vehicles to export' : `Export ${vehicleCount} vehicles to Excel`}
    >
      {isExporting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="hidden sm:inline">Exporting...</span>
          <span className="sm:hidden">...</span>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Export to Excel</span>
          <span className="sm:hidden">Export</span>
          {vehicleCount > 0 && (
            <span className="hidden md:inline bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded-full text-xs font-medium">
              {vehicleCount}
            </span>
          )}
        </>
      )}
    </Button>
  )
})