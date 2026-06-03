// src/components/features/dashboard/MobileDashboardFilters.tsx
// Filter bottom-sheet — triggered externally via isOpen/onClose props.
// The floating FAB has been removed; the filter button now lives in DashboardSummaryCards.

'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import {
  X,
  Calendar,
  Shield,
  FileText
} from 'lucide-react'
import { FilterConfig, CheckedInVehicle } from '@/types'
import { useT } from '@/lib/i18n'

interface MobileDashboardFiltersProps {
  vehicles: CheckedInVehicle[]
  filters: FilterConfig
  onFilterChange: (key: keyof FilterConfig, value: string | boolean) => void
  onClearFilters: () => void
  /** Controlled open state — pass true to show the sheet */
  isOpen?: boolean
  /** Called when the sheet wants to close itself */
  onClose?: () => void
}

export function MobileDashboardFilters({
  vehicles,
  filters,
  onFilterChange,
  onClearFilters,
  isOpen: controlledOpen,
  onClose,
}: MobileDashboardFiltersProps) {
  const t = useT()

  // Fallback internal state for uncontrolled usage
  const [internalOpen, setInternalOpen] = useState(false)

  const isModalOpen = controlledOpen ?? internalOpen

  const closeSheet = () => {
    setInternalOpen(false)
    onClose?.()
  }

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

  // Count active filters (search is handled separately outside this sheet)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.excludeKeywords) count++
    if (filters.condition) count++
    if (filters.contract) count++
    if (filters.dateFrom || filters.dateTo) count++
    if (filters.motExpiring) count++
    return count
  }, [filters])

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isModalOpen])

  // Nothing to render if sheet is closed
  if (!isModalOpen) return null

  return (
    <>
      {/* Filter Bottom Sheet */}
      <div className="fixed inset-0 z-50 lg:hidden">

        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={closeSheet}
        />

        {/* Sheet panel */}
        <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl animate-slide-up max-h-[85vh] overflow-hidden flex flex-col">

          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#025940] dark:text-[#72A68E]">
                {t('dashboard.filters.panelHeading')}
              </h2>
              <button
                onClick={closeSheet}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active filter count */}
            {activeFilterCount > 0 && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('dashboard.filters.activeCount', { count: activeFilterCount })}
                </span>
                <button
                  onClick={onClearFilters}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                >
                  {t('dashboard.filters.clearAllLower')}
                </button>
              </div>
            )}
          </div>

          {/* Scrollable filter content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

            {/* Quick Filters */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {t('dashboard.filters.quickFilters')}
              </h3>

              <div className="space-y-3">
                {/* Condition */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Shield className="w-4 h-4 inline mr-1" />
                    {t('dashboard.filters.conditionLabel')}
                  </label>
                  <select
                    value={filters.condition}
                    onChange={(e) => onFilterChange('condition', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-[#025940]"
                  >
                    <option value="">{t('dashboard.filters.allConditions')}</option>
                    {availableConditions.length > 0 ? (
                      availableConditions.map(condition => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))
                    ) : (
                      <option value="" disabled>{t('dashboard.filters.noConditionsAvailable')}</option>
                    )}
                  </select>
                </div>

                {/* Contract */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FileText className="w-4 h-4 inline mr-1" />
                    {t('dashboard.filters.contractLabel')}
                  </label>
                  <select
                    value={filters.contract}
                    onChange={(e) => onFilterChange('contract', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-[#025940]"
                  >
                    <option value="">{t('dashboard.filters.allContracts')}</option>
                    <option value="__no_contract__">{t('dashboard.filters.noContractOption')}</option>
                    {availableContracts.length > 0 ? (
                      availableContracts.map(contract => (
                        <option key={contract} value={contract}>{contract}</option>
                      ))
                    ) : (
                      <option value="" disabled>{t('dashboard.filters.noContractsAvailable')}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Date Range */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                <Calendar className="w-4 h-4 inline mr-1" />
                {t('dashboard.filters.dateRange')}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.filters.fromLabelCompact')}</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => onFilterChange('dateFrom', e.target.value)}
                    className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-[#025940]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboard.filters.toLabelCompact')}</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => onFilterChange('dateTo', e.target.value)}
                    className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-[#025940]"
                  />
                </div>
              </div>

              {(filters.dateFrom || filters.dateTo) && (
                <button
                  onClick={() => {
                    onFilterChange('dateFrom', '')
                    onFilterChange('dateTo', '')
                  }}
                  className="mt-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {t('dashboard.filters.clearDatesLower')}
                </button>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onClearFilters()
                  closeSheet()
                }}
                variant="outline"
                className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {t('dashboard.filters.resetFilters')}
              </Button>
              <Button
                onClick={closeSheet}
                className="flex-1 bg-[#025940] hover:bg-[#012619] text-white"
              >
                {t('dashboard.filters.applyFilters')}
              </Button>
            </div>
          </div>

        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  )
}