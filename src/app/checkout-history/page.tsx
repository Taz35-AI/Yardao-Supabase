// src/app/checkout-history/page.tsx
'use client'

import React from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { useCheckoutHistory } from '@/hooks/useCheckoutHistory'
import { CheckoutHistoryTable } from '@/components/features/checkout-history/CheckoutHistoryTable'
import { CheckoutHistoryFilters } from '@/components/features/checkout-history/CheckoutHistoryFilters'
import { Pagination } from '@/components/common/Pagination'
import { usePagination } from '@/hooks/common/usePagination'
import { useT } from '@/lib/i18n'
import { History, Car, Users, Calendar, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'

export default function CheckoutHistoryPage() {
  const {
    filteredHistory, loading, error,
    searchTerm, setSearchTerm,
    selectedUser, setSelectedUser,
    dateRange, setDateRange,
    refreshHistory, exportToCSV,
    totalCheckouts, uniqueUsers, totalVehicles
  } = useCheckoutHistory()

  const {
    currentPageData: paginatedHistory,
    currentPage, totalPages, totalItems,
    itemsPerPage, itemsPerPageOptions,
    startIndex, endIndex,
    hasNextPage, hasPreviousPage,
    goToPage, goToNextPage, goToPreviousPage, setItemsPerPage
  } = usePagination({
    data: filteredHistory as any[],
    defaultItemsPerPage: 25,
    itemsPerPageOptions: [10, 25, 50, 100]
  })

  const t = useT()

  const stats = [
    { label: t('checkout.statsTotalActivity'), value: totalCheckouts, icon: TrendingUp, accent: '#025940', bg: '#025940' },
    { label: t('checkout.statsUniqueVehicles'), value: totalVehicles, icon: Car, accent: '#72A68E', bg: '#72A68E' },
    { label: t('checkout.statsActiveUsers'), value: uniqueUsers.length, icon: Users, accent: '#b3f243', bg: '#b3f243' },
    { label: t('checkout.statsDaysShown'), value: t('checkout.statsDaysValue', { count: dateRange }), icon: Calendar, accent: '#012619', bg: '#012619' },
  ]

  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
          <Navigation />
          <div className="w-full px-2 sm:px-4 lg:px-6 py-8">
            <div className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-white dark:bg-gray-800/80 p-8 text-center">
              <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">{t('checkout.errFailedLoadTitle')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
              <button onClick={refreshHistory} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#025940] text-white text-sm font-medium hover:bg-[#012619] transition-colors">
                <RefreshCw className="w-4 h-4" /> {t('checkout.tryAgain')}
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        <Navigation />

        <div className="w-full px-2 sm:px-4 lg:px-6 py-5 sm:py-7">

          {/* ── Page Header ── */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-0.5">
              <div className="w-8 h-8 rounded-xl bg-[#012619] dark:bg-[#b3f243]/20 flex items-center justify-center shadow-sm flex-shrink-0">
                <History className="w-4 h-4 text-white dark:text-[#b3f243]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#012619] dark:text-white tracking-tight">
                {t('checkout.pageTitle')}
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 pl-11">
              {t('checkout.pageSubtitle')}
            </p>
          </div>

          {/* ── Stats Strip ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
            {stats.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 overflow-hidden">
                  <div className="h-0.5" style={{ backgroundColor: s.accent }} />
                  <div className="px-3.5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
                      <p className="text-xl font-bold text-[#012619] dark:text-white">{s.value}</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${s.accent}15` }}>
                      <Icon className="w-4 h-4" style={{ color: s.accent }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Filters ── */}
          <div className="mb-4">
            <CheckoutHistoryFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              selectedUser={selectedUser}
              onUserChange={setSelectedUser}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              uniqueUsers={uniqueUsers}
              onRefresh={refreshHistory}
              onExport={exportToCSV}
              totalResults={filteredHistory?.length || 0}
              loading={loading}
            />
          </div>

          {/* ── Results count ── */}
          {totalItems > 0 && !loading && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 px-0.5">
              {t('checkout.showingRecords', { start: startIndex + 1, end: Math.min(endIndex, totalItems), total: totalItems })}
            </p>
          )}

          {/* ── Table ── */}
          <CheckoutHistoryTable
            records={paginatedHistory as any[]}
            loading={loading}
          />

          {/* ── Pagination ── */}
          {totalItems > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                itemsPerPageOptions={itemsPerPageOptions}
                startIndex={startIndex + 1}
                endIndex={Math.min(endIndex, totalItems)}
                hasNextPage={hasNextPage}
                hasPreviousPage={hasPreviousPage}
                onPageChange={goToPage}
                onNextPage={goToNextPage}
                onPreviousPage={goToPreviousPage}
                onItemsPerPageChange={setItemsPerPage}
                className="flex justify-center"
              />
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  )
}