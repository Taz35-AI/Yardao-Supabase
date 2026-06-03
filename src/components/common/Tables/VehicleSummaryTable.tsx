// src/components/common/Tables/VehicleSummaryTable.tsx
'use client'

import React from 'react'
import { CheckedInVehicle, SortConfig } from '@/types'
import { Card, CardContent } from '@/components/ui/Card'
import { ChevronUp, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react'

interface VehicleSummaryTableProps {
  vehicles: CheckedInVehicle[]
  sortConfig: SortConfig
  onSort: (key: string) => void
  onView: (vehicle: CheckedInVehicle) => void
  className?: string
}

export const VehicleSummaryTable = React.memo(function VehicleSummaryTable({
  vehicles,
  sortConfig,
  onSort,
  onView,
  className = ''
}: VehicleSummaryTableProps) {
  
  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) {
      return <ChevronUp className="w-3 h-3 text-[#72A68E]" />
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-3 h-3 text-[#025940]" />
      : <ChevronDown className="w-3 h-3 text-[#025940]" />
  }

  const getStatusBadge = (status: string) => {
    const isReady = status === 'Ready'
    return (
      <div className="flex items-center gap-1.5">
        {isReady 
          ? <CheckCircle className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
          : <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
        }
        <span className={`
          inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
          ${isReady 
            ? 'bg-[#72A68E]/20 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]'
            : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
          }
        `}>
          {status}
        </span>
      </div>
    )
  }

  const getConditionBadge = (condition: string) => {
    // Determine condition severity for styling
    const conditionLower = condition?.toLowerCase() || ''
    let colorClass = 'bg-[#C5D9D0] text-[#012619] dark:bg-[#012619] dark:text-[#C5D9D0]'
    
    if (conditionLower.includes('excellent') || conditionLower.includes('good')) {
      colorClass = 'bg-[#72A68E]/20 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]'
    } else if (conditionLower.includes('fair') || conditionLower.includes('average')) {
      colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    } else if (conditionLower.includes('poor') || conditionLower.includes('damaged')) {
      colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    }
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {condition || 'N/A'}
      </span>
    )
  }

  const formatContract = (contract: string | null | undefined) => {
    if (!contract) return '-'
    // Truncate long contract names for summary view
    return contract.length > 15 ? contract.substring(0, 15) + '...' : contract
  }

  return (
    <Card className={className}>
      <CardContent className="p-0">
        {/* Mobile View - Stacked Cards */}
        <div className="lg:hidden space-y-3 p-4">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              onClick={() => onView(vehicle)}
              className="bg-white dark:bg-[#0D0D0D] border border-[#C5D9D0] dark:border-[#012619] rounded-lg p-4 hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/20 transition-all duration-200 cursor-pointer"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0D0D0D] dark:text-white">
                    {vehicle.registration}
                  </span>
                  {getStatusBadge(vehicle.status)}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[#72A68E] dark:text-[#C5D9D0]">Vehicle:</span>
                    <span className="ml-1 text-[#0D0D0D] dark:text-white">
                      {vehicle.make} {vehicle.model}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#72A68E] dark:text-[#C5D9D0]">Condition:</span>
                    <span className="ml-1">{getConditionBadge(vehicle.condition)}</span>
                  </div>
                  {vehicle.contract && (
                    <div className="col-span-2">
                      <span className="text-[#72A68E] dark:text-[#C5D9D0]">Contract:</span>
                      <span className="ml-1 text-[#0D0D0D] dark:text-white">
                        {formatContract(vehicle.contract)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View - Compact Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#C5D9D0]/50 dark:bg-[#012619] border-b border-[#C5D9D0] dark:border-[#025940]">
              <tr>
                <th 
                  className="text-left py-3 px-4 font-medium text-[#025940] dark:text-[#72A68E] cursor-pointer hover:bg-[#72A68E]/20 dark:hover:bg-[#025940]/20 transition-colors"
                  onClick={() => onSort('registration')}
                >
                  <div className="flex items-center gap-1">
                    Registration
                    <SortIcon column="registration" />
                  </div>
                </th>
                <th className="text-left py-3 px-4 font-medium text-[#025940] dark:text-[#72A68E]">
                  Vehicle
                </th>
                <th 
                  className="text-left py-3 px-4 font-medium text-[#025940] dark:text-[#72A68E] cursor-pointer hover:bg-[#72A68E]/20 dark:hover:bg-[#025940]/20 transition-colors"
                  onClick={() => onSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    <SortIcon column="status" />
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 font-medium text-[#025940] dark:text-[#72A68E] cursor-pointer hover:bg-[#72A68E]/20 dark:hover:bg-[#025940]/20 transition-colors"
                  onClick={() => onSort('condition')}
                >
                  <div className="flex items-center gap-1">
                    Condition
                    <SortIcon column="condition" />
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 font-medium text-[#025940] dark:text-[#72A68E] cursor-pointer hover:bg-[#72A68E]/20 dark:hover:bg-[#025940]/20 transition-colors"
                  onClick={() => onSort('contract')}
                >
                  <div className="flex items-center gap-1">
                    Contract
                    <SortIcon column="contract" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C5D9D0] dark:divide-[#012619]">
              {vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  onClick={() => onView(vehicle)}
                  className="hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/20 transition-all duration-200 cursor-pointer group"
                >
                  <td className="py-3 px-4 font-semibold text-[#0D0D0D] dark:text-white group-hover:text-[#025940] dark:group-hover:text-[#72A68E]">
                    {vehicle.registration}
                  </td>
                  <td className="py-3 px-4 text-[#025940] dark:text-[#72A68E]">
                    <div className="flex flex-col">
                      <span className="font-medium">{vehicle.make} {vehicle.model}</span>
                      {vehicle.colour && (
                        <span className="text-xs text-[#72A68E] dark:text-[#C5D9D0]">{vehicle.colour}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(vehicle.status)}
                  </td>
                  <td className="py-3 px-4">
                    {getConditionBadge(vehicle.condition)}
                  </td>
                  <td className="py-3 px-4 text-[#025940] dark:text-[#72A68E]">
                    {vehicle.contract ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#72A68E]/20 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E] text-xs font-medium">
                        {formatContract(vehicle.contract)}
                      </span>
                    ) : (
                      <span className="text-[#72A68E] dark:text-[#C5D9D0]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
})