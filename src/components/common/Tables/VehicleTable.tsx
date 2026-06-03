// src/components/common/Tables/VehicleTable.tsx - Full Mobile-Responsive Version with Comments
'use client'

import React from 'react'
import { CheckedInVehicle, SortConfig } from '@/types'
import { CheckCircle, AlertTriangle, ChevronUp, ChevronDown, MessageCircle, Calendar, Gauge } from 'lucide-react'

interface VehicleTableProps {
  vehicles: CheckedInVehicle[]
  sortConfig: SortConfig
  onSort: (key: string) => void
  onView: (vehicle: CheckedInVehicle) => void
  className?: string
}

export const VehicleTable = React.memo(function VehicleTable({
  vehicles,
  sortConfig,
  onSort,
  onView,
  className = ''
}: VehicleTableProps) {
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try {
      return String(value)
    } catch {
      return ''
    }
  }

  const getStatusIcon = (status: string) => {
    return status === 'Ready' 
      ? <CheckCircle className="w-4 h-4 text-green-600" />
      : <AlertTriangle className="w-4 h-4 text-orange-600" />
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) {
      return <ChevronUp className="w-3 h-3 text-gray-400" />
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    try {
      if (date.toDate) {
        return date.toDate().toLocaleDateString('en-GB')
      }
      return new Date(date).toLocaleDateString('en-GB')
    } catch {
      return 'N/A'
    }
  }

  const getStatusBadgeClasses = (status: string) => {
    return status === 'Ready'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  }

  const getSizeBadgeClasses = () => {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  }

  const formatMileage = (mileage: any) => {
    if (!mileage) return 'N/A'
    const mileageStr = safeString(mileage)
    if (!mileageStr) return 'N/A'
    return mileageStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }

  return (
    <div className={className}>
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
          💡 Click on any vehicle to view detailed information, edit details, or check out the vehicle
        </p>
      </div>
      
      {/* Mobile View - ONLY 3 COLUMNS: Registration, Vehicle, Status */}
      <div className="block lg:hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('registration')}
              >
                <div className="flex items-center gap-1">
                  Registration
                  <SortIcon column="registration" />
                </div>
              </th>
              <th className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300">
                Vehicle
              </th>
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  <SortIcon column="status" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr 
                key={vehicle.id}
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 cursor-pointer group"
                onClick={() => onView(vehicle)}
                title="Click to view vehicle details"
              >
                <td className="py-3 px-3 font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                  {safeString(vehicle.registration)}
                </td>
                <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                  <div className="flex flex-col">
                    <span className="font-medium">{safeString(vehicle.make)} {safeString(vehicle.model)}</span>
                    {vehicle.colour && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{safeString(vehicle.colour)}</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(vehicle.status)}
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClasses(vehicle.status)}`}>
                      {vehicle.status}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Desktop View - ALL COLUMNS */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('registration')}
              >
                <div className="flex items-center gap-1">
                  Registration
                  <SortIcon column="registration" />
                </div>
              </th>
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('make')}
              >
                <div className="flex items-center gap-1">
                  Make
                  <SortIcon column="make" />
                </div>
              </th>
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('model')}
              >
                <div className="flex items-center gap-1">
                  Model
                  <SortIcon column="model" />
                </div>
              </th>
              <th className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300">
                Size
              </th>
              <th className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300">
                Status
              </th>
              <th className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300">
                Condition
              </th>
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('createdAt')}
              >
                <div className="flex items-center gap-1">
                  Check-in Date
                  <SortIcon column="createdAt" />
                </div>
              </th>
              <th className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300">
                Mileage
              </th>
              <th 
                className="text-left py-3 px-3 font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort('comments')}
              >
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  Comments
                  <SortIcon column="comments" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr 
                key={vehicle.id} 
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 cursor-pointer group"
                onClick={() => onView(vehicle)}
                title="Click to view vehicle details"
              >
                <td className="py-3 px-3 font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                  {safeString(vehicle.registration)}
                </td>
                <td className="py-3 px-3 text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {safeString(vehicle.make)}
                </td>
                <td className="py-3 px-3 text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {safeString(vehicle.model)}
                </td>
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSizeBadgeClasses()}`}>
                    {safeString(vehicle.size)}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(vehicle.status)}
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClasses(vehicle.status)}`}>
                      {vehicle.status}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3 text-gray-600 dark:text-gray-400 text-sm">
                  <span className="max-w-[120px] truncate block">
                    {safeString(vehicle.condition)}
                  </span>
                </td>
                <td className="py-3 px-3 text-gray-600 dark:text-gray-400 text-sm">
                  {formatDate(vehicle.createdAt)}
                </td>
                <td className="py-3 px-3 text-gray-600 dark:text-gray-400 text-sm">
                  {formatMileage(vehicle.mileage)}
                </td>
                <td className="py-3 px-3 text-gray-600 dark:text-gray-400 text-sm">
                  <div className="max-w-[180px]">
                    {safeString(vehicle.comments) ? (
                      <div>
                        <div className="truncate text-sm">
                          {safeString(vehicle.comments)}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <MessageCircle className="w-3 h-3" />
                          Comment available
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No comments</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {vehicles.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 dark:text-gray-500 mb-4">
            <CheckCircle className="w-12 h-12 mx-auto opacity-50" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No vehicles found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Try adjusting your search filters or check in a new vehicle.
          </p>
        </div>
      )}
    </div>
  )
})