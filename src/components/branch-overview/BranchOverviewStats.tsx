// src/components/branch-overview/BranchOverviewStats.tsx
'use client'

import React from 'react'
import { useT } from '@/lib/i18n'
import type { BranchOverviewStats } from '@/types/branch-overview'

interface BranchOverviewStatsProps {
  totals: BranchOverviewStats
}

export function BranchOverviewStats({ totals }: BranchOverviewStatsProps) {
  const t = useT()
  const stats = [
    {
      label: t('branchOverview.stats.totalVehicles'),
      value: totals.totalVehicles.toLocaleString(),
      imagePath: '/Branch overview/total-vehicles.png',
      color: 'from-[#025940] to-[#012619]',
      bgColor: 'bg-[#C5D9D0]/30 dark:bg-[#025940]/20',
      iconColor: 'text-[#025940] dark:text-[#72A68E]'
    },
    {
      label: t('branchOverview.stats.activeBranches'),
      value: totals.totalBranches.toLocaleString(),
      imagePath: '/Branch overview/active-branches.png',
      color: 'from-[#72A68E] to-[#025940]',
      bgColor: 'bg-[#72A68E]/20 dark:bg-[#72A68E]/20',
      iconColor: 'text-[#025940] dark:text-[#72A68E]'
    },
    {
      label: t('branchOverview.stats.avgPerBranch'),
      value: totals.avgPerBranch.toLocaleString(),
      imagePath: '/Branch overview/avg-per-branch.png',
      color: 'from-[#012619] to-[#025940]',
      bgColor: 'bg-[#025940]/10 dark:bg-[#012619]/20',
      iconColor: 'text-[#012619] dark:text-[#C5D9D0]'
    },
    {
      label: t('branchOverview.stats.mostCommon'),
      value: totals.mostCommon.type,
      subValue: t('branchOverview.stats.units', { count: totals.mostCommon.count }),
      imagePath: '/Branch overview/most-common.png',
      color: 'from-[#72A68E] to-[#C5D9D0]',
      bgColor: 'bg-[#C5D9D0]/40 dark:bg-[#72A68E]/20',
      iconColor: 'text-[#025940] dark:text-[#C5D9D0]'
    }
  ]

  return (
    <div className="w-full mb-6 sm:mb-8">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="relative group bg-white dark:bg-[#0D0D0D] rounded-lg sm:rounded-xl shadow-md sm:shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Gradient Background Effect */}
            <div className={`absolute inset-0 bg-gradient-to-r ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
            
            <div className="relative p-3 sm:p-4 lg:p-6">
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-2 sm:gap-3 mb-2 sm:mb-4">
                <div className={`p-2 sm:p-2.5 lg:p-3 ${stat.bgColor} rounded-lg sm:rounded-xl`}>
                  <img 
                    src={stat.imagePath} 
                    alt={stat.label}
                    className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${stat.iconColor}`}
                  />
                </div>
                <div className="text-left xs:text-right">
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-[#0D0D0D] dark:text-white truncate">
                    {stat.value}
                  </div>
                  {stat.subValue && (
                    <div className="text-[10px] sm:text-xs text-[#72A68E] dark:text-[#C5D9D0] mt-0.5 sm:mt-1">
                      {stat.subValue}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] sm:text-xs lg:text-sm font-medium text-[#72A68E] dark:text-[#C5D9D0] truncate pr-2">
                  {stat.label}
                </h3>
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#C5D9D0] dark:bg-[#025940] group-hover:bg-current transition-colors duration-300 flex-shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}