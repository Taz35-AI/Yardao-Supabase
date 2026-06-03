// src/components/features/checkout-history/CheckoutHistoryFilters.tsx
'use client'

import React from 'react'
import { Search, Download, RefreshCw, Calendar, User, X, Filter } from 'lucide-react'
import { useT } from '@/lib/i18n'

// Display-only label key per date-range value (value stays the logic number)
const DATE_LABEL_KEY: Record<number, string> = {
  1: 'checkout.dateOpt.d1',
  3: 'checkout.dateOpt.d3',
  7: 'checkout.dateOpt.d7',
  14: 'checkout.dateOpt.d14',
  30: 'checkout.dateOpt.d30',
}

interface CheckoutHistoryFiltersProps {
  searchTerm: string
  onSearchChange: (term: string) => void
  selectedUser: string
  onUserChange: (user: string) => void
  dateRange: number
  onDateRangeChange: (days: number) => void
  uniqueUsers: string[]
  onRefresh: () => void
  onExport: () => void
  totalResults: number
  loading?: boolean
}

const DATE_OPTIONS = [
  { value: 1,  label: 'Today' },
  { value: 3,  label: 'Last 3 days' },
  { value: 7,  label: 'Last 7 days' },
  { value: 14, label: 'Last 2 weeks' },
  { value: 30, label: 'Last 30 days' },
]

export function CheckoutHistoryFilters({
  searchTerm, onSearchChange,
  selectedUser, onUserChange,
  dateRange, onDateRangeChange,
  uniqueUsers, onRefresh, onExport,
  totalResults, loading = false
}: CheckoutHistoryFiltersProps) {
  const t = useT()

  const hasActiveFilters = searchTerm || selectedUser !== 'all' || dateRange !== 30

  const clearAll = () => {
    onSearchChange('')
    onUserChange('all')
    onDateRangeChange(30)
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('checkout.filters.title')}</span>
          {!loading && (
            <span className="text-xs text-gray-400 dark:text-gray-500">· {t('checkout.filters.resultCount', { count: totalResults })}</span>
          )}
          {loading && (
            <span className="text-xs text-gray-400 animate-pulse">· {t('checkout.filters.loadingShort')}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors"
            >
              <X className="w-3 h-3" /> {t('checkout.filters.clear')}
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('checkout.common.refresh')}
          </button>
          <button
            onClick={onExport}
            disabled={totalResults === 0 || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#012619] hover:bg-[#025940] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            {t('checkout.filters.exportCsv')}
          </button>
        </div>
      </div>

      {/* Filter controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t('checkout.filters.searchPlaceholder')}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-700/30 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940] dark:focus:border-[#72A68E] transition-colors"
          />
          {searchTerm && (
            <button onClick={() => onSearchChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* User filter */}
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <select
            value={selectedUser}
            onChange={e => onUserChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940] dark:focus:border-[#72A68E] transition-colors appearance-none"
          >
            <option value="all">{t('checkout.filters.allUsers')}</option>
            {uniqueUsers.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <select
            value={dateRange}
            onChange={e => onDateRangeChange(Number(e.target.value))}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940] dark:focus:border-[#72A68E] transition-colors appearance-none"
          >
            {DATE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{t(DATE_LABEL_KEY[opt.value] ?? '') || opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
          {searchTerm && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#025940]/10 text-[#025940] dark:bg-[#72A68E]/10 dark:text-[#72A68E]">
              {t('checkout.filters.searchPill', { term: searchTerm })}
              <button onClick={() => onSearchChange('')}><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {selectedUser !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
              {t('checkout.filters.userPill', { user: selectedUser })}
              <button onClick={() => onUserChange('all')}><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {dateRange !== 30 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">
              {DATE_LABEL_KEY[dateRange] ? t(DATE_LABEL_KEY[dateRange]) : t('checkout.filters.dateFallbackDays', { count: dateRange })}
              <button onClick={() => onDateRangeChange(30)}><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}