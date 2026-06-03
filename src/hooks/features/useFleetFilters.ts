// src/hooks/features/useFleetFilters.ts - Fleet Filtering Hook

import { useState, useMemo } from 'react'
import { 
  FleetVehicle, 
  SortConfig, 
  filterVehiclesBySearch, 
  filterVehiclesByMOT, 
  filterVehiclesBySize, 
  sortVehicles 
} from '@/lib/fleetUtils'
import { logger } from '@/lib/logger'

export function useFleetFilters(vehicles: FleetVehicle[]) {
  const [searchTerm, setSearchTerm] = useState('')
  const [motFilter, setMotFilter] = useState(false)
  const [sizeFilter, setSizeFilter] = useState('')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ 
    key: 'createdAt', 
    direction: 'desc' 
  })

  // Apply all filters and sorting
  const filteredAndSortedVehicles = useMemo(() => {
    let filtered = vehicles

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filterVehiclesBySearch(filtered, searchTerm)
    }

    // Apply MOT filter
    if (motFilter) {
      filtered = filterVehiclesByMOT(filtered)
    }

    // Apply size filter
    if (sizeFilter) {
      filtered = filterVehiclesBySize(filtered, sizeFilter)
    }

    // Apply sorting
    return sortVehicles(filtered, sortConfig)
  }, [vehicles, searchTerm, motFilter, sizeFilter, sortConfig])

  // Handle search
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
  }

  // Handle MOT filter toggle
  const toggleMotFilter = () => {
    setMotFilter(!motFilter)
    // Clear size filter when MOT filter is enabled
    if (!motFilter) {
      setSizeFilter('')
    }
  }

  // Handle size filter
  const handleSizeFilter = (size: string) => {
    if (sizeFilter === size) {
      setSizeFilter('')
    } else {
      setSizeFilter(size)
      // Clear MOT filter when size filter is set
      setMotFilter(false)
    }
  }

  // Handle sorting
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('')
    setMotFilter(false)
    setSizeFilter('')
    setSortConfig({ key: 'createdAt', direction: 'desc' })
  }

  // Check if any filters are active
  const hasActiveFilters = searchTerm.trim() !== '' || motFilter || sizeFilter !== ''

  return {
    // State
    searchTerm,
    motFilter,
    sizeFilter,
    sortConfig,
    
    // Computed
    filteredAndSortedVehicles,
    hasActiveFilters,
    
    // Actions
    handleSearchChange,
    toggleMotFilter,
    handleSizeFilter,
    handleSort,
    clearAllFilters
  }
}