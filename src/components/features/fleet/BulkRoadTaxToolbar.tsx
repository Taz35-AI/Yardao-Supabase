// src/components/features/fleet/BulkRoadTaxToolbar.tsx - COMPACT VERSION
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Calendar, X, CheckSquare } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface BulkRoadTaxToolbarProps {
  selectedCount: number
  onOpenModal: () => void
  onClearSelection: () => void
  totalVehicles: number
}

export function BulkRoadTaxToolbar({
  selectedCount,
  onOpenModal,
  onClearSelection,
  totalVehicles
}: BulkRoadTaxToolbarProps) {
  const t = useT()
  if (selectedCount === 0) return null

  return (
    <div className="mb-4 bg-gradient-to-r from-blue-600 to-blue-700 
                    dark:from-blue-700 dark:to-blue-800 shadow-md rounded-lg">
      <div className="px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Selection Info - COMPACT */}
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-white flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-white truncate">
                {t('fleet.roadTax.vehiclesSelected', { count: selectedCount })}
              </p>
              <p className="text-[10px] sm:text-xs text-blue-100 hidden sm:block">
                {t('fleet.roadTax.outOfTotal', { total: totalVehicles })}
              </p>
            </div>
          </div>

          {/* Actions - COMPACT */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              onClick={onOpenModal}
              size="sm"
              className="bg-white text-blue-700 hover:bg-blue-50 font-medium
                       h-7 sm:h-8 px-2 sm:px-3 text-xs whitespace-nowrap"
            >
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
              {t('fleet.roadTax.roadTaxButton')}
            </Button>
            <Button
              onClick={onClearSelection}
              variant="outline"
              size="sm"
              className="border-white/30 text-white hover:bg-white/20
                       h-7 sm:h-8 px-1.5 sm:px-2"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}