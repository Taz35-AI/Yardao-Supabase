// src/components/common/Filters/FleetFilters.tsx - COMPACT & PERFECT
'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/contexts/AuthContext'
import { contractService } from '@/lib/contractService'
import { userProfileService } from '@/lib/firestore'
import { Contract } from '@/types'
import { useT } from '@/lib/i18n'
import {
  Filter,
  X,
  Search,
  Calendar,
  Truck,
  Shield,
  ChevronDown,
  RotateCcw,
  FileText,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react'
import { logger } from '@/lib/logger'

interface FilterConfig {
  search: string
  excludeKeywords: string
  size: string
  condition: string
  status: string
  contract: string
  motExpiring: boolean
  recall: boolean
  dateFrom: string
  dateTo: string
  insurance: string
  showDefleeted?: boolean
}

interface FleetFiltersProps {
  filters: FilterConfig | null | undefined
  onFiltersChange: (filters: FilterConfig) => void
  conditions: any[]
  sizes: string[]
  onClearFilters: () => void
}

export function FleetFilters({
  filters,
  onFiltersChange,
  conditions,
  sizes,
  onClearFilters
}: FleetFiltersProps) {
  const { user } = useAuth()
  const t = useT()
  const [isExpanded, setIsExpanded] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(true)

  const safeFilters = filters || {
    search: '',
    excludeKeywords: '',
    size: 'all',
    condition: 'all',
    status: 'all',
    contract: 'all',
    motExpiring: false,
    recall: false,
    dateFrom: '',
    dateTo: '',
    insurance: 'all',
    showDefleeted: false
  }

  useEffect(() => {
    let isMounted = true

    const loadContracts = async () => {
      if (!user?.uid) {
        if (isMounted) setContractsLoading(false)
        return
      }

      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (!profile?.organizationId) {
          if (isMounted) setContractsLoading(false)
          return
        }

        const loadedContracts = await contractService.getContracts(profile.organizationId)
        if (isMounted) {
          setContracts(loadedContracts || [])
        }
      } catch (error) {
        logger.error('Failed to load contracts:', error)
      } finally {
        if (isMounted) {
          setContractsLoading(false)
        }
      }
    }

    loadContracts()

    return () => {
      isMounted = false
    }
  }, [user?.uid])

  const handleFilterChange = (key: keyof FilterConfig, value: string | boolean) => {
    const newFilters = { ...safeFilters, [key]: value }
    onFiltersChange(newFilters)
  }

  const activeFilterCount = [
    safeFilters.size !== 'all',
    safeFilters.condition !== 'all',
    safeFilters.contract !== 'all',
    safeFilters.insurance !== 'all',
    safeFilters.motExpiring,
    safeFilters.recall,
    safeFilters.dateFrom !== '',
    safeFilters.dateTo !== '',
    safeFilters.showDefleeted
  ].filter(Boolean).length

  const hasAdvancedFilters = safeFilters.size !== 'all' || 
                            safeFilters.condition !== 'all' || 
                            safeFilters.contract !== 'all' ||
                            safeFilters.insurance !== 'all' ||
                            safeFilters.motExpiring ||
                            safeFilters.recall ||
                            safeFilters.dateFrom !== '' ||
                            safeFilters.dateTo !== '' ||
                            safeFilters.showDefleeted

  return (
    <Card className="relative z-20">
      <CardContent className="p-2 sm:p-3">
        {/* PRIMARY ROW: Search + Quick Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <Input
              placeholder={t('fleet.filters.searchPlaceholder')}
              value={safeFilters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-8 pr-8 h-8 text-sm"
            />
            {safeFilters.search && (
              <button
                onClick={() => handleFilterChange('search', '')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {/* Show Defleeted Toggle */}
            <Button
              variant={safeFilters.showDefleeted ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange('showDefleeted', !safeFilters.showDefleeted)}
              className={`h-8 px-2 text-xs whitespace-nowrap ${
                safeFilters.showDefleeted 
                  ? 'bg-gray-600 hover:bg-gray-700 text-white border-gray-600' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {safeFilters.showDefleeted ? (
                <>
                  <Eye className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">{t('fleet.filters.defleeted')}</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">{t('fleet.filters.showDefleeted')}</span>
                </>
              )}
            </Button>

            {/* Recall Due Toggle */}
            <Button
              variant={safeFilters.recall ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange('recall', !safeFilters.recall)}
              className={`h-8 px-2 text-xs whitespace-nowrap ${
                safeFilters.recall
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                  : 'border-red-300 text-red-700 hover:bg-red-50'
              }`}
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">{t('fleet.filters.recallDue')}</span>
            </Button>

            {/* Filters Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 px-2 text-xs whitespace-nowrap"
            >
              <Filter className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">{t('fleet.filters.filtersButton')}</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-blue-500 text-white text-xs rounded-full px-1.5 min-w-[1.25rem] text-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </Button>

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearFilters}
                className="h-8 px-2 text-xs whitespace-nowrap border-red-300 text-red-600 hover:bg-red-50"
              >
                <RotateCcw className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">{t('fleet.filters.clear')}</span>
              </Button>
            )}
          </div>
        </div>

        {/* ADVANCED FILTERS - Expandable */}
        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-2">
            {/* Filter Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Size */}
              <div>
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  <Truck className="w-2.5 h-2.5 inline mr-0.5" />
                  {t('fleet.filters.labelSize')}
                </label>
                <select
                  value={safeFilters.size}
                  onChange={(e) => handleFilterChange('size', e.target.value)}
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="all">{t('fleet.filters.optionAll')}</option>
                  {sizes.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  {t('fleet.filters.labelCondition')}
                </label>
                <select
                  value={safeFilters.condition}
                  onChange={(e) => handleFilterChange('condition', e.target.value)}
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="all">{t('fleet.filters.optionAll')}</option>
                  {conditions.map(condition => (
                    <option key={condition.id} value={condition.name}>
                      {condition.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contract */}
              <div>
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  <FileText className="w-2.5 h-2.5 inline mr-0.5" />
                  {t('fleet.filters.labelContract')}
                </label>
                <select
                  value={safeFilters.contract}
                  onChange={(e) => handleFilterChange('contract', e.target.value)}
                  disabled={contractsLoading}
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                >
                  <option value="all">{t('fleet.filters.optionAll')}</option>
                  <option value="none">{t('fleet.filters.optionNone')}</option>
                  {contracts.map(contract => (
                    <option key={contract.id} value={contract.name}>
                      {contract.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Insurance */}
              <div>
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  <Shield className="w-2.5 h-2.5 inline mr-0.5" />
                  {t('fleet.filters.labelInsurance')}
                </label>
                <select
                  value={safeFilters.insurance}
                  onChange={(e) => handleFilterChange('insurance', e.target.value)}
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="all">{t('fleet.filters.optionAll')}</option>
                  <option value="insured">{t('fleet.filters.optionInsured')}</option>
                  <option value="not-insured">{t('fleet.filters.optionNotInsured')}</option>
                </select>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  <Calendar className="w-2.5 h-2.5 inline mr-0.5" />
                  {t('fleet.filters.labelDateFrom')}
                </label>
                <input
                  type="date"
                  value={safeFilters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  <Calendar className="w-2.5 h-2.5 inline mr-0.5" />
                  {t('fleet.filters.labelDateTo')}
                </label>
                <input
                  type="date"
                  value={safeFilters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Active Filters Pills */}
            {hasAdvancedFilters && (
              <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-200 dark:border-gray-600">
                {safeFilters.size !== 'all' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    {t('fleet.filters.pillSize', { size: safeFilters.size })}
                    <button onClick={() => handleFilterChange('size', 'all')} className="ml-1 hover:text-blue-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                {safeFilters.condition !== 'all' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                    {t('fleet.filters.pillCondition', { condition: safeFilters.condition })}
                    <button onClick={() => handleFilterChange('condition', 'all')} className="ml-1 hover:text-purple-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                {safeFilters.contract !== 'all' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                    {t('fleet.filters.pillContract', { contract: safeFilters.contract === 'none' ? t('fleet.filters.optionNone') : safeFilters.contract })}
                    <button onClick={() => handleFilterChange('contract', 'all')} className="ml-1 hover:text-green-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                {safeFilters.insurance !== 'all' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                    {t('fleet.filters.pillInsurance', { value: safeFilters.insurance === 'not-insured' ? t('fleet.filters.optionNotInsured') : t('fleet.filters.optionInsured') })}
                    <button onClick={() => handleFilterChange('insurance', 'all')} className="ml-1 hover:text-yellow-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                {safeFilters.motExpiring && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                    {t('fleet.filters.pillMotExpiring')}
                    <button onClick={() => handleFilterChange('motExpiring', false)} className="ml-1 hover:text-red-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                {safeFilters.recall && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                    {t('fleet.filters.pillRecall')}
                    <button onClick={() => handleFilterChange('recall', false)} className="ml-1 hover:text-red-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}

                {safeFilters.showDefleeted && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                    {t('fleet.filters.pillShowingDefleeted')}
                    <button onClick={() => handleFilterChange('showDefleeted', false)} className="ml-1 hover:text-gray-600">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}