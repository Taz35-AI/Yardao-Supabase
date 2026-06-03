// src/components/common/Tables/FleetTable.tsx
// UPDATED: Fleet table with hover tooltips FIXED positioning
'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { FleetTableHeader } from './FleetTableHeader'
import { FleetTableRow } from './FleetTableRow'
import { FleetVehicle } from '@/types'
import { MessageSquare, Calendar } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface SortConfig {
  key: string
  direction: 'asc' | 'desc'
}

interface FleetTableProps {
  vehicles: FleetVehicle[]
  sortConfig: SortConfig
  onSort: (key: string) => void
  onViewVehicle: (vehicle: FleetVehicle) => void
  onEditVehicle?: (vehicle: FleetVehicle) => void
  selectedVehicleIds?: Set<string>
  onToggleSelection?: (vehicleId: string) => void
  onToggleSelectAll?: () => void
}

export function FleetTable({
  vehicles,
  sortConfig,
  onSort,
  onViewVehicle,
  onEditVehicle,
  selectedVehicleIds,
  onToggleSelection,
  onToggleSelectAll
}: FleetTableProps) {
  const t = useT()
  // Add hover state management for tooltips
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isAllSelected = selectedVehicleIds && onToggleSelection
    ? vehicles.length > 0 && vehicles.every(vehicle => selectedVehicleIds.has(vehicle.id))
    : false

  const showCheckbox = Boolean(onToggleSelection && selectedVehicleIds)

  // Helper function to safely convert to string
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try {
      return String(value)
    } catch {
      return ''
    }
  }

  // Format date helper
  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    try {
      const dateStr = typeof date === 'string' ? date : date.toString()
      const dateObj = new Date(dateStr)
      return dateObj.toLocaleDateString('en-GB')
    } catch {
      return 'N/A'
    }
  }

  const handleMouseEnter = (vehicleId: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    setHoveredVehicle(vehicleId)
    const rect = event.currentTarget.getBoundingClientRect()
    
    // Calculate position - to the right of the row
    const tooltipX = Math.min(rect.right - 350, window.innerWidth - 370)
    const tooltipY = rect.top + 10 // Slight offset from top of row
    
    setTooltipPosition({
      x: tooltipX,
      y: tooltipY
    })
  }

  const handleMouseLeave = () => {
    setHoveredVehicle(null)
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-[#025940] dark:text-[#72A68E]">
            <p className="text-lg font-medium mb-2">{t('fleet.table.emptyTitle')}</p>
            <p className="text-sm">
              {t('fleet.table.emptyMessage')}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Render tooltip using portal to avoid z-index and overflow issues
  const renderTooltip = () => {
    if (!hoveredVehicle || !mounted) return null
    
    const vehicle = vehicles.find(v => v.id === hoveredVehicle)
    if (!vehicle) return null
    
    const hasComments = vehicle.comments && safeString(vehicle.comments).trim() !== ''
    const hasDateAcquired = vehicle.dateAcquired

    return createPortal(
      <div 
        className="fixed pointer-events-none animate-in fade-in duration-200"
        style={{
          left: `${tooltipPosition.x}px`,
          top: `${tooltipPosition.y}px`,
          zIndex: 9999, // Ensure it's above everything
        }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-4 min-w-[280px] max-w-[350px]">
          {/* Arrow pointing to row - LEFT SIDE */}
          <div className="absolute left-[-8px] top-4 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-white dark:border-r-gray-800"></div>
          
          {/* Comments Section - ALWAYS SHOWN */}
          <div className={hasDateAcquired ? "mb-3" : ""}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className={`w-4 h-4 ${hasComments ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-400'}`} />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('fleet.table.tooltipCommentsHeading')}</span>
            </div>
            <p className={`text-sm ${hasComments ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500 italic'} leading-relaxed`}>
              {hasComments ? safeString(vehicle.comments) : t('fleet.table.tooltipNoComments')}
            </p>
          </div>
          
          {/* Divider - ALWAYS SHOWN */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-3"></div>
          
          {/* Date Acquired Section - ALWAYS SHOWN */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Calendar className={`w-4 h-4 ${hasDateAcquired ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-400'}`} />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('fleet.table.tooltipDateAcquiredHeading')}</span>
            </div>
            <div className={`text-sm ${hasDateAcquired ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500 italic'}`}>
              {hasDateAcquired ? formatDate(vehicle.dateAcquired) : t('fleet.table.tooltipDateNotSpecified')}
            </div>
          </div>
        </div>
      </div>,
      document.body // Render at body level to avoid any container constraints
    )
  }

  // UPDATED: Reduced minWidth since Comments and Date Acquired are hidden on desktop
  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className={`w-full ${showCheckbox ? 'md:min-w-[1300px]' : 'md:min-w-[1250px]'}`}>
              <FleetTableHeader 
                sortConfig={sortConfig}
                onSort={onSort}
                showCheckbox={showCheckbox}
                isAllSelected={isAllSelected}
                onToggleSelectAll={onToggleSelectAll}
                hasVehicles={vehicles.length > 0}
              />
              <tbody className="bg-white dark:bg-[#0D0D0D] divide-y divide-[#C5D9D0] dark:divide-[#012619]">
                {vehicles.map(vehicle => (
                  <FleetTableRow
                    key={vehicle.id}
                    vehicle={vehicle}
                    onView={onViewVehicle}
                    onEdit={onEditVehicle}
                    isSelected={selectedVehicleIds?.has(vehicle.id)}
                    onToggleSelection={onToggleSelection}
                    onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => handleMouseEnter(vehicle.id, e)}
                    onMouseLeave={handleMouseLeave}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Render tooltip outside of Card using portal */}
      {renderTooltip()}
    </>
  )
}