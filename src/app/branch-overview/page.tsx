// src/app/branch-overview/page.tsx
// UPDATED - Now includes interactive Google Maps integration
'use client'

import React, { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBranches } from '@/hooks/useBranches'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { BranchOverviewCard } from '@/components/branch-overview/BranchOverviewCard'
import { VehicleGroupModal } from '@/components/branch-overview/VehicleGroupModal'
import { BranchOverviewStats } from '@/components/branch-overview/BranchOverviewStats'
import { BranchOverviewFilters } from '@/components/branch-overview/BranchOverviewFilters'
import { BranchMapView } from '@/components/branch-overview/BranchMapView'
import { useBranchOverviewData } from '@/hooks/useBranchOverviewData'
import { useT } from '@/lib/i18n'
import { Car, Filter, Building2, Map } from 'lucide-react'

// Import types
import type { BranchData, VehicleGroup } from '@/types/branch-overview'

// Import utility functions
import {
  processBranchData,
  buildMakeModelMap,
  filterBranchData,
  calculateBranchOverviewStats
} from '@/utils/branchOverviewUtils'

export default function BranchOverviewPage() {
  const t = useT()
  const { user } = useAuth()
  const { branches, loading: branchesLoading } = useBranches()
  const { allVehicles, loading: vehiclesLoading } = useBranchOverviewData()
  
  // State
  const [selectedGroup, setSelectedGroup] = useState<{
    branchName: string
    group: VehicleGroup
  } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMake, setFilterMake] = useState('')
  const [filterModel, setFilterModel] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showMap, setShowMap] = useState(true) // NEW: Toggle map visibility

  // Process data by branch with business logic
  const branchData = useMemo<BranchData[]>(() => {
    return processBranchData(branches, allVehicles)
  }, [branches, allVehicles])

  // Build make-model relationship map (only for vehicles in yard)
  const makeModelMap = useMemo(() => {
    return buildMakeModelMap(allVehicles)
  }, [allVehicles])

  // Get unique makes
  const uniqueMakes = useMemo(() => {
    return Array.from(makeModelMap.keys()).sort()
  }, [makeModelMap])

  // Get models for selected make
  const availableModels = useMemo(() => {
    if (!filterMake) {
      // No make selected - return all unique models
      const allModels = new Set<string>()
      makeModelMap.forEach(models => {
        models.forEach(model => allModels.add(model))
      })
      return Array.from(allModels).sort()
    }
    
    // Make selected - return only models for that make
    const modelsForMake = makeModelMap.get(filterMake)
    return modelsForMake ? Array.from(modelsForMake).sort() : []
  }, [makeModelMap, filterMake])

  // Filter branch data
  const filteredBranchData = useMemo(() => {
    return filterBranchData(branchData, searchTerm, filterMake, filterModel)
  }, [branchData, searchTerm, filterMake, filterModel])

  // Calculate statistics
  const totals = useMemo(() => {
    return calculateBranchOverviewStats(allVehicles, branches)
  }, [allVehicles, branches])

  // Handlers
  const handleGroupClick = (branchName: string, group: VehicleGroup) => {
    setSelectedGroup({ branchName, group })
  }

  const handleMakeChange = (make: string) => {
    setFilterMake(make)
    // Clear model when make changes
    if (filterModel) {
      setFilterModel('')
    }
  }

  // NEW: Handle branch click from map
  const handleBranchClickFromMap = (branchId: string) => {
    // Scroll to the branch card
    const branchElement = document.getElementById(`branch-card-${branchId}`)
    if (branchElement) {
      branchElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Optional: Add highlight effect
      branchElement.classList.add('ring-4', 'ring-[#025940]', 'ring-opacity-50')
      setTimeout(() => {
        branchElement.classList.remove('ring-4', 'ring-[#025940]', 'ring-opacity-50')
      }, 2000)
    }
  }

  // Check if any branches have locations
  const hasAnyBranchWithLocation = branches.some(
    branch => branch.latitude && branch.longitude
  )

  const isLoading = branchesLoading || vehiclesLoading

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-950 dark:via-slate-950 dark:to-gray-900">
          <Navigation />
          <div className="pt-0">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-4 font-medium">
                  {t('branchOverview.loading')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-950 dark:via-slate-950 dark:to-gray-900">
        <Navigation />
        
        <div className="pt-0">
          <div className="w-full px-2 sm:px-4 lg:px-8 py-1">
            {/* Header */}
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white truncate">
                    {t('branchOverview.title')}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {t('branchOverview.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* NEW: Map Toggle Button */}
                  {hasAnyBranchWithLocation && (
                    <button
                      onClick={() => setShowMap(!showMap)}
                      className={`flex-shrink-0 p-2 sm:p-2.5 rounded-xl shadow-md border transition-all ${
                        showMap
                          ? 'bg-[#025940] border-[#025940] text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                      title={showMap ? t('branchOverview.hideMap') : t('branchOverview.showMap')}
                    >
                      <Map className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden flex-shrink-0 p-2 sm:p-2.5 rounded-xl bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all"
                  >
                    <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <BranchOverviewStats totals={totals} />

            {/* NEW: Interactive Map */}
            {showMap && hasAnyBranchWithLocation && (
              <div className="mb-6 sm:mb-8">
                <BranchMapView
                  branches={branches}
                  branchData={branchData}
                  onBranchClick={handleBranchClickFromMap}
                />
              </div>
            )}

            {/* Filters */}
            <div className={`mb-4 sm:mb-6 transition-all duration-300 ${showFilters ? 'block' : 'hidden lg:block'}`}>
              <BranchOverviewFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filterMake={filterMake}
                onMakeChange={handleMakeChange}
                filterModel={filterModel}
                onModelChange={setFilterModel}
                uniqueMakes={uniqueMakes}
                uniqueModels={availableModels}
                onClear={() => {
                  setSearchTerm('')
                  setFilterMake('')
                  setFilterModel('')
                }}
              />
            </div>

            {/* Branch Cards Grid - Responsive grid with proper mobile sizing */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-3 sm:gap-4">
              {filteredBranchData.map(branch => (
                <div 
                  key={branch.branchId} 
                  id={`branch-card-${branch.branchId}`}
                  className="transition-all duration-300"
                >
                  <BranchOverviewCard
                    branch={branch}
                    onGroupClick={(group) => handleGroupClick(branch.branchName, group)}
                  />
                </div>
              ))}
            </div>

            {/* Empty State */}
            {filteredBranchData.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 sm:py-20 px-4">
                <div className="p-4 sm:p-6 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 sm:mb-6">
                  <Car className="w-12 h-12 sm:w-20 sm:h-20 text-gray-400 dark:text-gray-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2 text-center">
                  {t('branchOverview.emptyTitle')}
                </h3>
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 text-center max-w-md">
                  {searchTerm || filterMake || filterModel
                    ? t('branchOverview.emptyFiltered')
                    : t('branchOverview.emptyNone')}
                </p>
                {(searchTerm || filterMake || filterModel) && (
                  <button
                    onClick={() => {
                      setSearchTerm('')
                      setFilterMake('')
                      setFilterModel('')
                    }}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
                  >
                    {t('branchOverview.clearFilters')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Vehicle Details Modal */}
        {selectedGroup && (
          <VehicleGroupModal
            isOpen={!!selectedGroup}
            onClose={() => setSelectedGroup(null)}
            group={selectedGroup.group}
            branchName={selectedGroup.branchName}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}