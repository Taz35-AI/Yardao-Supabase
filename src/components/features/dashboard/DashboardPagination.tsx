// src/components/features/dashboard/DashboardPagination.tsx
'use client'

import React from 'react'
import { Pagination } from '@/components/common/Pagination'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface DashboardPaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  itemsPerPageOptions: number[]
  startIndex: number
  endIndex: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  onPageChange: (page: number) => void
  onNextPage: () => void
  onPreviousPage: () => void
  onItemsPerPageChange: (items: number) => void
  className?: string
}

export function DashboardPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  itemsPerPageOptions,
  startIndex,
  endIndex,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onNextPage,
  onPreviousPage,
  onItemsPerPageChange,
  className = ''
}: DashboardPaginationProps) {
  // Don't render if no items
  if (totalItems === 0) return null

  return (
    <div className={`mt-4 sm:mt-6 ${className}`}>
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
        onPageChange={onPageChange}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        onItemsPerPageChange={onItemsPerPageChange}
        className="flex justify-center"
      />
    </div>
  )
}

// Optional: Compact mobile version
export function DashboardPaginationCompact({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onNextPage,
  onPreviousPage,
  hasPreviousPage,
  hasNextPage
}: Pick<DashboardPaginationProps, 
  'currentPage' | 'totalPages' | 'totalItems' | 'startIndex' | 'endIndex' | 
  'onNextPage' | 'onPreviousPage' | 'hasPreviousPage' | 'hasNextPage'>) {
  const t = useT()

  if (totalItems === 0) return null

  return (
    <div className="flex items-center justify-between px-2 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      <button
        onClick={onPreviousPage}
        disabled={!hasPreviousPage}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {t('dashboard.pagination.compactRange', { from: startIndex + 1, to: Math.min(endIndex, totalItems), total: totalItems })}
      </span>
      
      <button
        onClick={onNextPage}
        disabled={!hasNextPage}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}