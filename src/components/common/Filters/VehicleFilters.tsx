// src/components/common/Filters/VehicleFilters.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Search, X, Filter, Calendar } from 'lucide-react'
import { FilterConfig } from '@/types'

interface VehicleFiltersProps {
  filters: FilterConfig
  onFilterChange: (key: keyof FilterConfig, value: string | boolean) => void
  onClearFilters: () => void
  className?: string
}

export const VehicleFilters = React.memo(function VehicleFilters({
  filters,
  onFilterChange,
  onClearFilters,
  className = ''
}: VehicleFiltersProps) {
  const hasActiveFilters = Object.values(filters).some(value => 
    typeof value === 'boolean' ? value : Boolean(value)
  )

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search vehicles..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          className="pl-10 h-10"
        />
        {filters.search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFilterChange('search', '')}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Mobile-Optimized Filter Grid */}
      <div className="space-y-3">
        {/* Filter Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 h-7"
            >
              <X className="w-3 h-3 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        {/* Top Row - Size and Status */}
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filters.size}
            onChange={(e) => onFilterChange('size', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Sizes</option>
            <option value="Small Van">Small Van</option>
            <option value="Large Van">Large Van</option>
            <option value="Extra Large Van">Extra Large Van</option>
            <option value="Pickup Truck">Pickup Truck</option>
            <option value="Car">Car</option>
            <option value="Motorcycle">Motorcycle</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Status</option>
            <option value="Ready">Ready</option>
            <option value="Needs Checking">Needs Checking</option>
          </select>
        </div>

        {/* Middle Row - MOT Toggle */}
        <div className="flex items-center justify-center">
          <label className="flex items-center gap-3 cursor-pointer bg-gray-50 dark:bg-gray-700 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
            <input
              type="checkbox"
              checked={filters.motExpiring}
              onChange={(e) => onFilterChange('motExpiring', e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              MOT Expiring Soon
            </span>
          </label>
        </div>

        {/* Bottom Row - Date Range */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>Date Range</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})