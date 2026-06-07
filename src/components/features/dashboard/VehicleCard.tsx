// src/components/features/dashboard/VehicleCard.tsx - Fixed imports
'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { CheckedInVehicle } from '@/types'
import { getStatusConfig } from '@/lib/statusUtils' // Fixed import
import { getConditionColor, getConditionTextColor, getConditionDisplayName, getConditionByName } from '@/lib/conditionUtils'
import { formatDate, formatMileage, safeString } from '@/lib/utils'
import { Calendar, Gauge, FileText, MapPin } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { VehicleArt, resolveVehicleArt } from './VehicleArt'


interface VehicleCardProps {
  vehicle: CheckedInVehicle
  onEdit: (vehicle: CheckedInVehicle) => void
  onView: (vehicle: CheckedInVehicle) => void
  className?: string
}

export const VehicleCard = React.memo(function VehicleCard({
  vehicle,
  onEdit,
  onView,
  className = ''
}: VehicleCardProps) {
  const t = useT()
  const statusConfig = getStatusConfig(vehicle.status)
  const StatusIcon = statusConfig.icon

  // Get proper condition color - try to find the condition object first
  const conditionObject = getConditionByName(vehicle.condition)
  const conditionColor = conditionObject ? conditionObject.color : getConditionColor(vehicle.condition)
  const conditionTextColor = getConditionTextColor(conditionColor)
  const conditionDisplayName = getConditionDisplayName(vehicle.condition)
  const hasArt = !!resolveVehicleArt(vehicle.make, vehicle.model)

  // Debug logging to help troubleshoot
  React.useEffect(() => {
    if (conditionObject) {
      logger.log(`✅ Found condition object for "${vehicle.condition}":`, {
        name: conditionObject.name,
        color: conditionObject.color,
        severity: conditionObject.severity
      })
    } else {
      logger.log(`⚠️ No condition object found for "${vehicle.condition}", using fallback color: ${conditionColor}`)
    }
  }, [vehicle.condition, conditionObject, conditionColor])

  return (
    <Card 
      className={`group hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 ${className}`}
      style={{ borderLeftColor: conditionColor }}
      onClick={() => onView(vehicle)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header with Registration and Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {safeString(vehicle.registration)}
            </h3>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor} ${statusConfig.borderColor} border`}>
              <StatusIcon className={`w-3 h-3 mr-1 ${statusConfig.color}`} />
              {statusConfig.label}
            </div>
          </div>
        </div>

        {/* Make/Model illustration, tinted to the vehicle colour */}
        {hasArt && (
          <div className="hidden lg:flex justify-center -my-1">
            <VehicleArt
              make={vehicle.make}
              model={vehicle.model}
              colour={vehicle.colour}
              className="h-28 w-28"
            />
          </div>
        )}

        {/* Vehicle Information */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-gray-500 dark:text-gray-400">{t('dashboard.card.makeModelLabel')}</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {`${safeString(vehicle.make)} ${safeString(vehicle.model)}`.trim() || t('dashboard.common.notAvailable')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-gray-500 dark:text-gray-400">{t('dashboard.card.sizeLabel')}</p>
              <Badge variant="secondary" className="text-xs">
                {safeString(vehicle.size) || t('dashboard.common.notAvailable')}
              </Badge>
            </div>
          </div>
        </div>

        {/* Condition Badge with Proper Color */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.card.conditionLabel')}</span>
            <span 
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: conditionColor,
                color: conditionTextColor,
                borderColor: conditionColor
              }}
            >
              {conditionDisplayName}
            </span>
          </div>
          
          <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            {formatDate(vehicle.createdAt)}
          </div>
        </div>

        {/* Additional Information */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Gauge className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.card.mileageLabel')}</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatMileage(vehicle.mileage)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.card.colourLabel')}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {safeString(vehicle.colour) || t('dashboard.common.notAvailable')}
            </p>
          </div>
        </div>

        {/* Comments if present */}
        {vehicle.comments && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.card.commentsLabel')}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {safeString(vehicle.comments)}
            </p>
          </div>
        )}

        {/* Edit Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(vehicle)
            }}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
          >
            {t('dashboard.card.editVehicleBtn')}
          </button>
        </div>
      </CardContent>
    </Card>
  )
})