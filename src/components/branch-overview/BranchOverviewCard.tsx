// src/components/branch-overview/BranchOverviewCard.tsx
'use client'

import React, { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { MapPin, Car, ChevronRight, ChevronDown, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { useT } from '@/lib/i18n'
import type { BranchData, VehicleGroup, BranchVehicle } from '@/types/branch-overview'

interface BranchOverviewCardProps {
  branch: BranchData
  onGroupClick: (group: VehicleGroup) => void
  onHireDetailsClick?: (vehicle: BranchVehicle) => void
}

export function BranchOverviewCard({ branch, onGroupClick }: BranchOverviewCardProps) {
  const t = useT()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isHireExpanded, setIsHireExpanded] = useState(false)
  
  // Show first 3 groups in compact view, all when expanded
  const displayGroups = isExpanded ? branch.vehicleGroups : branch.vehicleGroups.slice(0, 3)
  const hasMoreGroups = branch.vehicleGroups.length > 3
  const remainingCount = branch.vehicleGroups.length - 3

  return (
    <Card className="group hover:shadow-md transition-all duration-200 bg-white dark:bg-[#0D0D0D] border-[#C5D9D0] dark:border-[#025940] w-full">
      {/* Compact Header */}
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
            <img 
              src="/Branch overview/active-branches.png" 
              alt="Branch"
              className="w-3 h-3 sm:w-4 sm:h-4 text-[#72A68E] flex-shrink-0"
            />
            <h3 className="font-semibold text-xs sm:text-sm text-[#0D0D0D] dark:text-white truncate">
              {branch.branchName}
            </h3>
            {branch.isMain && (
              <Badge variant="default" size="sm" className="ml-1 px-1 sm:px-1.5 py-0 text-[10px] sm:text-xs">
                {t('branchOverview.card.main')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-[#C5D9D0]/30 dark:bg-[#025940]/20 rounded text-[#025940] dark:text-[#72A68E] flex-shrink-0">
            <Car className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span className="text-[10px] sm:text-xs font-bold">{branch.vehiclesInYard}</span>
          </div>
        </div>

        {/* Compact Vehicle List */}
        {branch.vehicleGroups.length > 0 ? (
          <div className="space-y-1">
            {displayGroups.map((group, index) => (
              <div
                key={`${group.make}-${group.model}`}
                onClick={() => onGroupClick(group)}
                className="flex items-center justify-between py-1 px-1.5 sm:px-2 rounded hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/20 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
                  <span className="text-[10px] sm:text-xs font-bold text-[#0D0D0D] dark:text-white bg-[#C5D9D0]/50 dark:bg-[#025940]/50 px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0">
                    {group.count}
                  </span>
                  <span className="text-[10px] sm:text-xs text-[#025940] dark:text-[#72A68E] truncate">
                    {group.make} {group.model}
                  </span>
                </div>
                <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#72A68E] flex-shrink-0" />
              </div>
            ))}

            {/* Expand/Collapse Toggle */}
            {hasMoreGroups && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(!isExpanded)
                }}
                className="flex items-center gap-1 py-1 px-1.5 sm:px-2 text-[10px] sm:text-xs text-[#025940] dark:text-[#72A68E] hover:text-[#012619] dark:hover:text-[#C5D9D0] transition-colors w-full"
              >
                {isExpanded ? (
                  <>
                    <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {t('branchOverview.card.showLess')}
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {t('branchOverview.card.moreCount', { count: remainingCount })}
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="text-[10px] sm:text-xs text-[#72A68E] dark:text-[#C5D9D0] text-center py-2">
            {t('branchOverview.card.noVehicles')}
          </div>
        )}

        {/* Out on Hire Section */}
        {branch.vehiclesOutOnHire > 0 && (
          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-[#C5D9D0] dark:border-[#025940]">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsHireExpanded(!isHireExpanded)
              }}
              className="flex items-center justify-between w-full py-1 px-1.5 sm:px-2 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-orange-600 dark:text-orange-400" />
                <span className="text-[10px] sm:text-xs font-medium text-orange-700 dark:text-orange-300">
                  {t('branchOverview.card.outOnHire')}
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-orange-800 dark:text-orange-200 bg-orange-100 dark:bg-orange-900/30 px-1 sm:px-1.5 py-0.5 rounded">
                  {branch.vehiclesOutOnHire}
                </span>
              </div>
              {isHireExpanded ? (
                <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-orange-600 dark:text-orange-400" />
              ) : (
                <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-orange-600 dark:text-orange-400" />
              )}
            </button>

            {/* Expanded Hire Details */}
            {isHireExpanded && (
              <div className="mt-1 sm:mt-2 space-y-1">
                {branch.hiredVehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="flex flex-col xs:flex-row xs:items-center xs:justify-between py-1 px-1.5 sm:px-2 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                  >
                    <div className="flex flex-col xs:flex-row xs:items-center xs:gap-2 min-w-0">
                      <span className="text-[10px] sm:text-xs font-bold text-[#0D0D0D] dark:text-white">
                        {vehicle.registration}
                      </span>
                      <span className="text-[10px] sm:text-xs text-[#72A68E] dark:text-[#C5D9D0] truncate">
                        {vehicle.make} {vehicle.model}
                      </span>
                    </div>
                    {vehicle.hiredAt && (
                      <span className="text-[10px] sm:text-xs text-orange-600 dark:text-orange-400 flex-shrink-0 mt-1 xs:mt-0">
                        {vehicle.hiredAt.toDate ? 
                          vehicle.hiredAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : 
                          new Date(vehicle.hiredAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
                        }
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}