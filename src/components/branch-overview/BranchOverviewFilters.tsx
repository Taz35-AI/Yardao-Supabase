// src/components/branch-overview/BranchOverviewFilters.tsx
'use client'

import React from 'react'
import { useT } from '@/lib/i18n'
import { Search, X, Filter, Car, Package2 } from 'lucide-react'

interface BranchOverviewFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  filterMake: string
  onMakeChange: (value: string) => void
  filterModel: string
  onModelChange: (value: string) => void
  uniqueMakes: string[]
  uniqueModels: string[]
  onClear: () => void
}

export function BranchOverviewFilters({
  searchTerm,
  onSearchChange,
  filterMake,
  onMakeChange,
  filterModel,
  onModelChange,
  uniqueMakes,
  uniqueModels,
  onClear
}: BranchOverviewFiltersProps) {
  const t = useT()
  const hasFilters = searchTerm || filterMake || filterModel

  return (
    <div className="bg-white dark:bg-[#0D0D0D] rounded-xl shadow-lg border border-[#C5D9D0] dark:border-[#025940] p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 sm:p-2 bg-[#C5D9D0]/30 dark:bg-[#025940]/20 rounded-lg">
            <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-[#025940] dark:text-[#72A68E]" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-[#0D0D0D] dark:text-white">
            {t('branchOverview.filters.title')}
          </h3>
        </div>
        {hasFilters && (
          <button
            onClick={onClear}
            className="sm:ml-auto flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-[#72A68E] dark:text-[#C5D9D0] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200 self-start sm:self-auto"
          >
            <X className="w-3 h-3 sm:w-4 sm:h-4" />
            {t('branchOverview.filters.clearAll')}
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Search Input */}
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="block text-xs sm:text-sm font-medium text-[#025940] dark:text-[#72A68E] mb-1.5 sm:mb-2">
            {t('branchOverview.filters.search')}
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-[#72A68E]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('branchOverview.filters.searchPlaceholder')}
              className="w-full pl-8 sm:pl-10 pr-8 sm:pr-4 py-2 sm:py-2.5 text-sm sm:text-base border border-[#C5D9D0] dark:border-[#025940] rounded-lg bg-white dark:bg-[#0D0D0D] text-[#0D0D0D] dark:text-white placeholder-[#72A68E] focus:ring-2 focus:ring-[#025940] focus:border-transparent transition-all duration-200"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 sm:right-3 top-1/2 transform -translate-y-1/2 text-[#72A68E] hover:text-[#025940] dark:hover:text-[#C5D9D0]"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Make Filter */}
        <div className="col-span-1">
          <label className="block text-xs sm:text-sm font-medium text-[#025940] dark:text-[#72A68E] mb-1.5 sm:mb-2">
            {t('branchOverview.filters.make')}
          </label>
          <div className="relative">
            <Car className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-[#72A68E] pointer-events-none" />
            <select
              value={filterMake}
              onChange={(e) => {
                const newMake = e.target.value
                onMakeChange(newMake)
                // Always clear model when make changes to avoid invalid combinations
                onModelChange('')
              }}
              className="w-full pl-8 sm:pl-10 pr-7 sm:pr-8 py-2 sm:py-2.5 text-sm sm:text-base border border-[#C5D9D0] dark:border-[#025940] rounded-lg bg-white dark:bg-[#0D0D0D] text-[#0D0D0D] dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-transparent appearance-none transition-all duration-200 cursor-pointer"
            >
              <option value="">{t('branchOverview.filters.allMakes')}</option>
              {uniqueMakes.map(make => (
                <option key={make} value={make}>{make}</option>
              ))}
            </select>
            <div className="absolute right-2.5 sm:right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#72A68E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Model Filter - Shows filtered models based on selected make */}
        <div className="col-span-1">
          <label className="block text-xs sm:text-sm font-medium text-[#025940] dark:text-[#72A68E] mb-1.5 sm:mb-2">
            {t('branchOverview.filters.model')} {filterMake && uniqueModels ? `(${uniqueModels.length})` : ''}
          </label>
          <div className="relative">
            <Package2 className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-[#72A68E] pointer-events-none" />
            <select
              value={filterModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full pl-8 sm:pl-10 pr-7 sm:pr-8 py-2 sm:py-2.5 text-sm sm:text-base border border-[#C5D9D0] dark:border-[#025940] rounded-lg bg-white dark:bg-[#0D0D0D] text-[#0D0D0D] dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-transparent appearance-none transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={Boolean(filterMake && (!uniqueModels || uniqueModels.length === 0))}
            >
              <option value="">
                {filterMake ?
                  (uniqueModels && uniqueModels.length > 0 ? t('branchOverview.filters.selectModel') : t('branchOverview.filters.noModels')) :
                  t('branchOverview.filters.selectMakeFirst')
                }
              </option>
              {uniqueModels && uniqueModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            <div className="absolute right-2.5 sm:right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#72A68E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      {/* Active Filters Display */}
      {hasFilters && (
        <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          {searchTerm && (
            <span className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-[#C5D9D0]/30 dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] rounded-full text-xs sm:text-sm">
              <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="truncate max-w-[100px] sm:max-w-none">"{searchTerm}"</span>
              <button
                onClick={() => onSearchChange('')}
                className="ml-1 hover:text-[#012619] dark:hover:text-[#C5D9D0]"
              >
                <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </button>
            </span>
          )}
          {filterMake && (
            <span className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-[#72A68E]/20 dark:bg-[#025940]/30 text-[#025940] dark:text-[#72A68E] rounded-full text-xs sm:text-sm">
              <Car className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="truncate max-w-[100px] sm:max-w-none">{filterMake}</span>
              <button
                onClick={() => onMakeChange('')}
                className="ml-1 hover:text-[#012619] dark:hover:text-[#C5D9D0]"
              >
                <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </button>
            </span>
          )}
          {filterModel && (
            <span className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full text-xs sm:text-sm">
              <Package2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="truncate max-w-[100px] sm:max-w-none">{filterModel}</span>
              <button
                onClick={() => onModelChange('')}
                className="ml-1 hover:text-purple-900 dark:hover:text-purple-100"
              >
                <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}