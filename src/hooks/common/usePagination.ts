// src/hooks/common/usePagination.ts - Fixed to handle undefined data
import { useState, useMemo } from 'react'

interface UsePaginationProps<T> {
  data: T[] | undefined // Allow undefined data
  itemsPerPageOptions?: number[]
  defaultItemsPerPage?: number
}

interface UsePaginationReturn<T> {
  // Current page data
  currentPageData: T[]
  
  // Pagination state
  currentPage: number
  totalPages: number
  itemsPerPage: number
  totalItems: number
  
  // Pagination actions
  goToPage: (page: number) => void
  goToNextPage: () => void
  goToPreviousPage: () => void
  setItemsPerPage: (items: number) => void
  
  // Pagination info
  startIndex: number
  endIndex: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  
  // Available options
  itemsPerPageOptions: number[]
}

export function usePagination<T>({
  data,
  itemsPerPageOptions = [10, 25, 50, 100],
  defaultItemsPerPage = 25
}: UsePaginationProps<T>): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPageState] = useState(defaultItemsPerPage)

  // Safely handle undefined data
  const safeData = data || []

  // Calculate pagination values
  const totalItems = safeData.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)

  // Get current page data
  const currentPageData = useMemo(() => {
    return safeData.slice(startIndex, endIndex)
  }, [safeData, startIndex, endIndex])

  // Navigation helpers
  const hasNextPage = currentPage < totalPages
  const hasPreviousPage = currentPage > 1

  // Navigation functions
  const goToPage = (page: number) => {
    const clampedPage = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(clampedPage)
  }

  const goToNextPage = () => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1)
    }
  }

  const goToPreviousPage = () => {
    if (hasPreviousPage) {
      setCurrentPage(prev => prev - 1)
    }
  }

  const setItemsPerPage = (items: number) => {
    setItemsPerPageState(items)
    // Reset to first page when changing items per page
    setCurrentPage(1)
  }

  // Reset to first page when data changes significantly
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  return {
    // Current page data
    currentPageData,
    
    // Pagination state
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    
    // Pagination actions
    goToPage,
    goToNextPage,
    goToPreviousPage,
    setItemsPerPage,
    
    // Pagination info
    startIndex,
    endIndex,
    hasNextPage,
    hasPreviousPage,
    
    // Available options
    itemsPerPageOptions
  }
}