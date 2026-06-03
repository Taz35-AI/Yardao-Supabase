// src/components/features/dashboard/InlineDashboardFilters.tsx - PREMIUM LIGHT MODE UI

'use client'

import React, { useState, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { 
  Search, 
  X, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  FileText,
  Filter,
  Shield,
  Ban
} from 'lucide-react'
import { FilterConfig, CheckedInVehicle } from '@/types'
import { useT } from '@/lib/i18n'

interface InlineDashboardFiltersProps {
  vehicles: CheckedInVehicle[]
  filters: FilterConfig
  onFilterChange: (key: keyof FilterConfig, value: string | boolean) => void
  onClearFilters: () => void
  className?: string
  compact?: boolean
}

export function InlineDashboardFilters({
  vehicles,
  filters,
  onFilterChange,
  onClearFilters,
  className = '',
  compact = false
}: InlineDashboardFiltersProps) {
  const t = useT()
  const [dateRangeExpanded, setDateRangeExpanded] = useState(false)

  // Extract available filter options from vehicles
  const { availableConditions, availableContracts } = useMemo(() => {
    const conditions = new Set<string>()
    const contracts = new Set<string>()

    if (vehicles && Array.isArray(vehicles)) {
      vehicles.forEach(vehicle => {
        if (vehicle.condition && vehicle.condition.trim()) conditions.add(vehicle.condition.trim())
        if (vehicle.contract && vehicle.contract.trim()) contracts.add(vehicle.contract.trim())
      })
    }

    return {
      availableConditions: Array.from(conditions),
      availableContracts: Array.from(contracts)
    }
  }, [vehicles])

  // Check if any filters are active
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'motExpiring') return value === true
    return typeof value === 'string' && value.trim() !== ''
  })

  // ═══════════════════════════════════════════
  // COMPACT VERSION — Used inside filter panel
  // ═══════════════════════════════════════════
  if (compact) {
    return (
      <div className={`space-y-3 ${className}`}>
        {/* Filter Dropdowns Row + Clear */}
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1">
          {/* Condition */}
          <select
            value={filters.condition}
            onChange={(e) => onFilterChange('condition', e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-[#4a5e54] dark:text-gray-300 focus:ring-2 focus:ring-[#025940]/20 focus:border-[#025940] transition-all shadow-sm appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a9e94' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              paddingRight: '32px'
            }}
          >
            <option value="">{t('dashboard.filters.allConditions')}</option>
            {availableConditions.map(condition => (
              <option key={condition} value={condition}>{condition}</option>
            ))}
          </select>

          {/* Contract */}
          <select
            value={filters.contract}
            onChange={(e) => onFilterChange('contract', e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-[#4a5e54] dark:text-gray-300 focus:ring-2 focus:ring-[#025940]/20 focus:border-[#025940] transition-all shadow-sm appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238a9e94' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              paddingRight: '32px'
            }}
          >
            <option value="">{t('dashboard.filters.allContracts')}</option>
            <option value="__no_contract__">{t('dashboard.filters.noContractOption')}</option>
            {availableContracts.map(contract => (
              <option key={contract} value={contract}>{contract}</option>
            ))}
          </select>

          {/* Date Toggle */}
          <button
            onClick={() => setDateRangeExpanded(!dateRangeExpanded)}
            className="h-9 px-3 bg-white dark:bg-gray-900 text-[#4a5e54] dark:text-gray-300 font-semibold rounded-lg border border-[#e2e8e5] dark:border-gray-600 hover:border-[#c8d5ce] hover:shadow-md flex items-center justify-center gap-2 transition-all shadow-sm text-xs"
          >
            <Calendar className="w-3.5 h-3.5 text-[#8a9e94]" />
            <span className="hidden sm:inline">{t('dashboard.filters.dateToggleShort')}</span>
            {dateRangeExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          </div>

          {/* Clear button */}
          {hasActiveFilters && (
            <Button
              onClick={onClearFilters}
              className="h-9 px-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold rounded-lg border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center gap-1.5 transition-all shadow-sm flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">{t('dashboard.filters.clearShort')}</span>
            </Button>
          )}
        </div>

        {/* Date Range Expanded */}
        {dateRangeExpanded && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-[#f0f4f2] dark:bg-gray-800 rounded-lg border border-[#e2e8e5] dark:border-gray-700">
            <div>
              <label className="block text-[10px] font-bold text-[#8a9e94] dark:text-gray-400 uppercase tracking-wider mb-1">{t('dashboard.filters.fromLabelCompact')}</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-gray-200 focus:ring-2 focus:ring-[#025940]/20 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#8a9e94] dark:text-gray-400 uppercase tracking-wider mb-1">{t('dashboard.filters.toLabelCompact')}</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-gray-200 focus:ring-2 focus:ring-[#025940]/20 shadow-sm"
              />
            </div>
          </div>
        )}

        {/* Active Filter Tags — Compact */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5">
            {filters.condition && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#ecfdf5] text-[#059669] rounded-md text-[10px] font-semibold border border-[#a7f3d0]">
                {filters.condition}
                <button onClick={() => onFilterChange('condition', '')} className="hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.contract && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-600 rounded-md text-[10px] font-semibold border border-purple-200">
                {filters.contract === '__no_contract__' ? t('dashboard.filters.noContractOption') : filters.contract}
                <button onClick={() => onFilterChange('contract', '')} className="hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[10px] font-semibold border border-blue-200">
                {filters.dateFrom || t('dashboard.filters.anyDate')} → {filters.dateTo || t('dashboard.filters.anyDate')}
                <button onClick={() => { onFilterChange('dateFrom', ''); onFilterChange('dateTo', '') }} className="hover:text-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // STANDARD VERSION — Full filter panel
  // ═══════════════════════════════════════════
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="rounded-xl bg-white dark:bg-gray-800 p-4 border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#012619] rounded-xl">
            <Filter className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#012619] dark:text-white">{t('dashboard.filters.panelHeading')}</h3>
            <p className="text-xs text-[#8a9e94] dark:text-gray-400">{t('dashboard.filters.panelSubtitle')}</p>
          </div>
        </div>
      </div>

      {/* Main Search Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#8a9e94] w-4 h-4" />
          <Input
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            placeholder={t('dashboard.filters.searchPlaceholder')}
            className="pl-11 pr-10 text-sm h-11 bg-white dark:bg-gray-900 border border-[#e2e8e5] dark:border-gray-600 focus:ring-2 focus:ring-[#025940]/20 focus:border-[#025940] rounded-xl font-medium text-[#012619] dark:text-white placeholder-[#8a9e94] shadow-sm"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange('search', '')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-[#8a9e94] hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <Button
            onClick={onClearFilters}
            className="h-11 px-5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold rounded-xl border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center gap-2 transition-all shadow-sm"
          >
            <X className="w-4 h-4" />
            {t('dashboard.filters.clearAll')}
          </Button>
        )}
      </div>

      {/* Exclude Keywords */}
      <div className="relative">
        <Ban className="absolute left-4 top-1/2 transform -translate-y-1/2 text-red-400 w-4 h-4" />
        <Input
          value={filters.excludeKeywords}
          onChange={(e) => onFilterChange('excludeKeywords', e.target.value)}
          placeholder={t('dashboard.filters.excludeKeywordsPlaceholder')}
          className="pl-11 pr-10 text-sm h-11 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800/50 focus:ring-2 focus:ring-red-500/20 focus:border-red-400 rounded-xl font-medium text-[#012619] dark:text-white placeholder-[#8a9e94] shadow-sm"
        />
        {filters.excludeKeywords && (
          <button
            onClick={() => onFilterChange('excludeKeywords', '')}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-red-300 hover:text-red-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Controls Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Condition */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="px-3 py-2 bg-[#f0f4f2] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
            <label className="text-[10px] font-bold text-[#8a9e94] dark:text-gray-400 uppercase tracking-wider">{t('dashboard.filters.conditionLabel')}</label>
          </div>
          <select
            value={filters.condition}
            onChange={(e) => onFilterChange('condition', e.target.value)}
            className="w-full px-3 py-3 text-sm font-medium bg-transparent text-[#012619] dark:text-gray-200 focus:outline-none cursor-pointer hover:bg-[#f6f8f7] dark:hover:bg-gray-800/50 transition-colors"
          >
            <option value="">{t('dashboard.filters.allConditions')}</option>
            {availableConditions.length > 0 ?
              availableConditions.map(condition => (
                <option key={condition} value={condition}>{condition}</option>
              )) :
              <option disabled>{t('dashboard.filters.noConditionsAvailable')}</option>
            }
          </select>
        </div>

        {/* Contract */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="px-3 py-2 bg-[#f0f4f2] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
            <label className="text-[10px] font-bold text-[#8a9e94] dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              {t('dashboard.filters.contractLabel')}
            </label>
          </div>
          <select
            value={filters.contract}
            onChange={(e) => onFilterChange('contract', e.target.value)}
            className="w-full px-3 py-3 text-sm font-medium bg-transparent text-[#012619] dark:text-gray-200 focus:outline-none cursor-pointer hover:bg-[#f6f8f7] dark:hover:bg-gray-800/50 transition-colors"
          >
            <option value="">{t('dashboard.filters.allContracts')}</option>
            <option value="__no_contract__">{t('dashboard.filters.noContractOption')}</option>
            {availableContracts.length > 0 ?
              availableContracts.map(contract => (
                <option key={contract} value={contract}>{contract}</option>
              )) :
              <option disabled>{t('dashboard.filters.noContractsAvailable')}</option>
            }
          </select>
        </div>

        {/* Date Range Toggle */}
        <button
          onClick={() => setDateRangeExpanded(!dateRangeExpanded)}
          className="h-full min-h-[76px] bg-[#012619] hover:bg-[#025940] text-white font-bold rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-sm"
        >
          <Calendar className="w-5 h-5" />
          {t('dashboard.filters.dateRange')}
          {dateRangeExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Date Range */}
      {dateRangeExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#f0f4f2] dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700">
          <div>
            <label className="block text-[10px] font-bold text-[#8a9e94] dark:text-gray-400 uppercase tracking-wider mb-1.5">{t('dashboard.filters.fromDateLabel')}</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2.5 text-sm font-medium border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-gray-200 focus:ring-2 focus:ring-[#025940]/20 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#8a9e94] dark:text-gray-400 uppercase tracking-wider mb-1.5">{t('dashboard.filters.toDateLabel')}</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2.5 text-sm font-medium border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-gray-200 focus:ring-2 focus:ring-[#025940]/20 shadow-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                onFilterChange('dateFrom', '')
                onFilterChange('dateTo', '')
              }}
              className="w-full py-2.5 bg-white dark:bg-gray-900 border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 font-semibold rounded-lg hover:border-[#c8d5ce] hover:shadow-md transition-all shadow-sm text-sm"
            >
              {t('dashboard.filters.clearDates')}
            </button>
          </div>
        </div>
      )}

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.excludeKeywords && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-800">
              <Ban className="w-3.5 h-3.5" />
              {t('dashboard.filters.excludingTag', { keywords: filters.excludeKeywords })}
              <button onClick={() => onFilterChange('excludeKeywords', '')} className="ml-1 hover:text-red-800 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}

          {filters.condition && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ecfdf5] dark:bg-emerald-900/20 text-[#059669] dark:text-emerald-300 rounded-lg text-xs font-semibold border border-[#a7f3d0] dark:border-emerald-800">
              <Shield className="w-3.5 h-3.5" />
              {filters.condition}
              <button onClick={() => onFilterChange('condition', '')} className="ml-1 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}

          {filters.contract && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 rounded-lg text-xs font-semibold border border-purple-200 dark:border-purple-800">
              <FileText className="w-3.5 h-3.5" />
              {filters.contract === '__no_contract__' ? t('dashboard.filters.noContractOption') : filters.contract}
              <button onClick={() => onFilterChange('contract', '')} className="ml-1 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}

          {(filters.dateFrom || filters.dateTo) && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-800">
              <Calendar className="w-3.5 h-3.5" />
              {filters.dateFrom || t('dashboard.filters.anyDate')} → {filters.dateTo || t('dashboard.filters.anyDate')}
              <button onClick={() => { onFilterChange('dateFrom', ''); onFilterChange('dateTo', '') }} className="ml-1 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}