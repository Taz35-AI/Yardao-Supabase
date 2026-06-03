// src/components/features/dashboard/VehicleViewToggle.tsx
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Table, Grid3X3 } from 'lucide-react'
import { useT } from '@/lib/i18n'

export type ViewMode = 'table' | 'cards'

interface VehicleViewToggleProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  className?: string
}

export const VehicleViewToggle = React.memo(function VehicleViewToggle({
  viewMode,
  onViewModeChange,
  className = ''
}: VehicleViewToggleProps) {
  const t = useT()
  return (
    <div className={`flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${className}`}>
      <Button
        variant={viewMode === 'table' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('table')}
        className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-all ${
          viewMode === 'table'
            ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
        }`}
      >
        <Table className="w-4 h-4" />
        <span className="hidden sm:inline text-sm font-medium">{t('dashboard.viewToggle.table')}</span>
      </Button>
      
      <Button
        variant={viewMode === 'cards' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('cards')}
        className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-all ${
          viewMode === 'cards'
            ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
        }`}
      >
        <Grid3X3 className="w-4 h-4" />
        <span className="hidden sm:inline text-sm font-medium">{t('dashboard.viewToggle.cards')}</span>
      </Button>
    </div>
  )
})