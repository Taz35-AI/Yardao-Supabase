// src/components/branch-overview/VehicleGroupModal.tsx
'use client'

import React from 'react'
import { X, Car, MapPin, FileText, Shield, Hash, Palette, Ruler } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { useT } from '@/lib/i18n'
import type { VehicleGroup } from '@/types/branch-overview'

interface VehicleGroupModalProps {
  isOpen: boolean
  onClose: () => void
  branchName: string
  group: VehicleGroup
}

export function VehicleGroupModal({ isOpen, onClose, branchName, group }: VehicleGroupModalProps) {
  const t = useT()
  if (!isOpen) return null

  const getStatusBadge = (status?: string) => {
    const statusConfig: Record<string, { color: string, text: string }> = {
      'Ready': { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', text: t('branchOverview.modal.statusReady') },
      'Pending checks': { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', text: t('branchOverview.modal.statusPending') },
      'Repairs needed': { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', text: t('branchOverview.modal.statusRepairs') },
      'Non-Starter': { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', text: t('branchOverview.modal.statusNonStarter') }
    }

    const config = statusConfig[status || ''] || {
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      text: status || t('branchOverview.modal.statusUnknown')
    }
    
    return (
      <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full ${config.color}`}>
        {config.text}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 sm:p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Car className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="truncate">{group.make} {group.model}</span>
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-2 text-blue-100 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                  {branchName}
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3 sm:w-4 sm:h-4" />
                  {t(group.count !== 1 ? 'branchOverview.modal.vehiclesPlural' : 'branchOverview.modal.vehiclesSingular', { count: group.count })}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Vehicle List */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Mobile: Card Layout */}
          <div className="grid gap-3 sm:hidden">
            {group.vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                    {vehicle.registration}
                  </span>
                  {getStatusBadge(vehicle.status)}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <Car className="w-3 h-3" />
                    <span className="truncate">{vehicle.make} {vehicle.model}</span>
                  </div>
                  {vehicle.colour && (
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <Palette className="w-3 h-3" />
                      <span className="truncate">{vehicle.colour}</span>
                    </div>
                  )}
                  {vehicle.size && (
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <Ruler className="w-3 h-3" />
                      <span className="truncate">{vehicle.size}</span>
                    </div>
                  )}
                  {vehicle.condition && (
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <Shield className="w-3 h-3" />
                      <span className="truncate">{vehicle.condition}</span>
                    </div>
                  )}
                </div>
                
                {vehicle.contract && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-gray-500" />
                    <Badge variant="outline" size="sm">
                      {vehicle.contract}
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: Table Layout */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colRegistration')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colMake')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colModel')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colColour')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colSize')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colStatus')}
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white text-sm">
                    {t('branchOverview.modal.colContract')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.vehicles.map((vehicle, index) => (
                  <tr
                    key={vehicle.id}
                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {vehicle.registration}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                      {vehicle.make}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                      {vehicle.model}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                      {vehicle.colour || '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                      {vehicle.size || '-'}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(vehicle.status)}
                    </td>
                    <td className="py-3 px-4">
                      {vehicle.contract ? (
                        <Badge variant="outline" size="sm">
                          {vehicle.contract}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}