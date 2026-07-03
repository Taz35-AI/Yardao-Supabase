// src/components/common/Tables/FleetTableRow.tsx
// UPDATED: Fleet table row with Comments and Date Acquired hidden, shown on hover
'use client'

import React from 'react'
import { Calendar, AlertTriangle, CheckCircle, CalendarClock } from 'lucide-react'
import { FleetVehicle } from '@/types'
import { getConditionColor, getConditionTextColor, getConditionDisplayName } from '@/lib/conditionUtils'
import { computeDefleetDue } from '@/lib/utils/defleetDue'
import { useT } from '@/lib/i18n'

type TFunc = (key: string, vars?: Record<string, string | number>) => string

interface FleetTableRowProps {
  vehicle: FleetVehicle
  onView: (vehicle: FleetVehicle) => void
  onEdit?: (vehicle: FleetVehicle) => void
  isSelected?: boolean
  onToggleSelection?: (vehicleId: string) => void
  onMouseEnter?: (e: React.MouseEvent<HTMLTableRowElement>) => void
  onMouseLeave?: () => void
}

const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return String(value)
  } catch {
    return ''
  }
}

const formatDate = (date: any) => {
  if (!date) return 'N/A'
  try {
    const dateStr = typeof date === 'string' ? date : date.toString()
    const dateObj = new Date(dateStr)
    return dateObj.toLocaleDateString('en-GB')
  } catch {
    return 'N/A'
  }
}

const getExpiryStatus = (expiryDate: string, t: TFunc) => {
  if (!expiryDate) return null
  
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(expiryDate)
    expiry.setHours(0, 0, 0, 0)
    
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysUntilExpiry < 0) {
      return { status: 'expired', className: 'text-red-600 font-bold', text: t('fleet.row.statusExpired') }
    } else if (daysUntilExpiry === 0) {
      return { status: 'expiring-today', className: 'text-red-500 font-bold', text: t('fleet.row.statusExpiresToday') }
    } else if (daysUntilExpiry <= 7) {
      return { status: 'expiring-soon', className: 'text-orange-600 font-semibold', text: formatDate(expiryDate) }
    } else if (daysUntilExpiry <= 30) {
      return { status: 'warning', className: 'text-yellow-600', text: formatDate(expiryDate) }
    }
    return { status: 'ok', className: 'text-green-600', text: formatDate(expiryDate) }
  } catch {
    return null
  }
}

const getExpiryBadge = (expiryDate: string, t: TFunc) => {
  if (!expiryDate) return null
  
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(expiryDate)
    expiry.setHours(0, 0, 0, 0)
    
    const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysLeft < 0) {
      const daysExpired = Math.abs(daysLeft)
      return {
        text: t('fleet.row.badgeDaysExpired', { days: daysExpired }),
        bgColor: 'bg-red-600 dark:bg-red-700',
        textColor: 'text-white',
        icon: AlertTriangle,
        tooltip: t('fleet.row.badgeExpiredTooltip', { days: daysExpired })
      }
    } else if (daysLeft === 0) {
      return {
        text: t('fleet.row.badgeToday'),
        bgColor: 'bg-red-500 dark:bg-red-600',
        textColor: 'text-white',
        icon: AlertTriangle,
        tooltip: t('fleet.row.badgeExpiresTodayTooltip')
      }
    } else if (daysLeft <= 7) {
      return {
        text: t('fleet.row.badgeDaysLeft', { days: daysLeft }),
        bgColor: 'bg-orange-500 dark:bg-orange-600',
        textColor: 'text-white',
        icon: AlertTriangle,
        tooltip: t('fleet.row.badgeDaysLeftTooltip', { days: daysLeft })
      }
    } else if (daysLeft <= 30) {
      return {
        text: t('fleet.row.badgeDaysLeft', { days: daysLeft }),
        bgColor: 'bg-yellow-400 dark:bg-yellow-500',
        textColor: 'text-gray-900',
        icon: Calendar,
        tooltip: t('fleet.row.badgeDaysLeftTooltip', { days: daysLeft })
      }
    }
    
    return null
  } catch {
    return null
  }
}

export function FleetTableRow({ 
  vehicle, 
  onView, 
  onEdit,
  isSelected,
  onToggleSelection,
  onMouseEnter,
  onMouseLeave
}: FleetTableRowProps) {
  const t = useT()
  const motStatus = getExpiryStatus(vehicle.motExpiry || '', t)
  const taxStatus = getExpiryStatus(vehicle.taxExpiry || '', t)

  const motBadge = getExpiryBadge(vehicle.motExpiry || '', t)
  const taxBadge = getExpiryBadge(vehicle.taxExpiry || '', t)
  
  const MotIcon = motBadge?.icon
  const TaxIcon = taxBadge?.icon

  const getConditionBadgeStyle = (condition: string) => {
    const bgColor = getConditionColor(condition)
    const textColor = getConditionTextColor(condition)
    
    return {
      backgroundColor: bgColor,
      color: textColor,
      border: `1px solid ${bgColor}`
    }
  }

  const getContractBadgeStyle = (contractColor: string | null | undefined) => {
    if (!contractColor) {
      return {
        backgroundColor: '#e5e7eb',
        color: '#374151',
        border: '1px solid #d1d5db'
      }
    }

    const brightness = parseInt(contractColor.slice(1, 3), 16) * 0.299 +
                      parseInt(contractColor.slice(3, 5), 16) * 0.587 +
                      parseInt(contractColor.slice(5, 7), 16) * 0.114
    const textColor = brightness > 128 ? '#000000' : '#ffffff'
    
    return {
      backgroundColor: contractColor,
      color: textColor,
      border: `1px solid ${contractColor}`
    }
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
      return
    }
    onView(vehicle)
  }

  return (
    <tr 
      className={`
        border-b border-[#C5D9D0] dark:border-[#013619] 
        hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/20 
        cursor-pointer transition-colors group
        ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}
      `}
      onClick={handleRowClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Checkbox Column */}
      {onToggleSelection && (
        <td className="hidden md:table-cell px-4 py-3 text-center" style={{ width: '50px' }}>
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={isSelected || false}
              onChange={(e) => {
                e.stopPropagation()
                onToggleSelection(vehicle.id)
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 
                       text-blue-600 focus:ring-2 focus:ring-blue-500 
                       cursor-pointer transition-colors"
              title={isSelected ? t('fleet.row.deselectVehicleTitle') : t('fleet.row.selectVehicleTitle')}
            />
          </div>
        </td>
      )}

      {/* 1. Registration - Better aligned */}
      <td className="py-3 px-4" style={{ width: '130px' }}>
        <div className="font-bold text-[#025940] dark:text-[#72A68E] whitespace-nowrap">
          {safeString(vehicle.registration)}
        </div>
        {vehicle.hasRecall && (
          <span
            title={t('fleet.row.recallTooltip')}
            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800 whitespace-nowrap"
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            {t('fleet.row.recallBadge')}
          </span>
        )}
        {(() => {
          const due = computeDefleetDue(vehicle.dateAcquired, vehicle.rentalTermMonths)
          if (due.state !== 'soon' && due.state !== 'overdue') return null
          const overdue = due.state === 'overdue'
          const dateStr = due.dueDate ? new Date(due.dueDate + 'T00:00:00').toLocaleDateString('en-GB') : ''
          return (
            <span
              title={t('fleet.row.defleetDueTooltip', { date: dateStr })}
              className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                overdue
                  ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                  : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              <CalendarClock className="w-2.5 h-2.5" />
              {overdue ? t('fleet.row.defleetOverdue') : t('fleet.row.defleetDueSoon', { days: due.daysLeft ?? 0 })}
            </span>
          )
        })()}
      </td>

      {/* 2. Make - Better aligned */}
      <td className="py-3 px-4" style={{ width: '110px' }}>
        <div className="text-sm text-[#025940] dark:text-[#72A68E]">
          {safeString(vehicle.make)}
        </div>
      </td>

      {/* 3. Model - Better aligned */}
      <td className="py-3 px-4" style={{ width: '130px' }}>
        <div className="text-sm text-[#025940] dark:text-[#72A68E]">
          {safeString(vehicle.model)}
        </div>
      </td>

      {/* 4. Colour - Better aligned */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '100px' }}>
        <div className="text-sm text-[#025940] dark:text-[#72A68E]">
          {safeString(vehicle.colour) || '-'}
        </div>
      </td>

      {/* 5. Size - Better aligned */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '90px' }}>
        <div className="text-sm text-[#025940] dark:text-[#72A68E]">
          {safeString(vehicle.size)}
        </div>
      </td>

      {/* 6. Contract - Better aligned */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '140px' }}>
        {vehicle.contract ? (
          <span 
            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border whitespace-nowrap"
            style={getContractBadgeStyle(vehicle.contractColor)}
          >
            {safeString(vehicle.contract)}
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>

      {/* 7. Insurance - Better aligned */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '140px' }}>
        <div className="flex items-center gap-1">
          {vehicle.insuranceStatus === 'Insured' ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-500">{t('fleet.row.insured')}</span>
            </>
          ) : vehicle.insuranceStatus === 'Not Insured' ? (
            <>
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-500" />
              <span className="text-sm font-medium text-red-600 dark:text-red-500">{t('fleet.row.notInsured')}</span>
            </>
          ) : (
            <span className="text-xs text-gray-400">{t('fleet.row.insuranceUnknown')}</span>
          )}
        </div>
      </td>

      {/* 8. MOT - Better aligned. Due-soon vehicles show the days-left badge
          AND the expiry date stacked, so both are visible at a glance. */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '110px' }}>
        <div className="flex flex-col gap-0.5">
          {motBadge && MotIcon && (
            <>
              <div
                className={`inline-flex items-center self-start px-1.5 py-0.5 rounded text-[10px] font-bold ${motBadge.bgColor} ${motBadge.textColor}`}
                title={motBadge.tooltip}
              >
                <MotIcon className="w-3 h-3 mr-0.5" />
                {motBadge.text}
              </div>
              <span className={`text-[11px] whitespace-nowrap ${motStatus?.className || 'text-gray-500'}`}>
                {formatDate(vehicle.motExpiry)}
              </span>
            </>
          )}
          {!motBadge && motStatus && (
            <span className={`text-xs ${motStatus.className}`}>
              {motStatus.text}
            </span>
          )}
          {!vehicle.motExpiry && <span className="text-xs text-gray-400">-</span>}
        </div>
      </td>

      {/* 9. Tax - Better aligned. Due-soon vehicles show the days-left badge
          AND the expiry date stacked, matching the MOT column. */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '110px' }}>
        <div className="flex flex-col gap-0.5">
          {taxBadge && TaxIcon && (
            <>
              <div
                className={`inline-flex items-center self-start px-1.5 py-0.5 rounded text-[10px] font-bold ${taxBadge.bgColor} ${taxBadge.textColor}`}
                title={taxBadge.tooltip}
              >
                <TaxIcon className="w-3 h-3 mr-0.5" />
                {taxBadge.text}
              </div>
              <span className={`text-[11px] whitespace-nowrap ${taxStatus?.className || 'text-gray-500'}`}>
                {formatDate(vehicle.taxExpiry)}
              </span>
            </>
          )}
          {!taxBadge && taxStatus && (
            <span className={`text-xs ${taxStatus.className}`}>
              {taxStatus.text}
            </span>
          )}
          {!vehicle.taxExpiry && <span className="text-xs text-gray-400">-</span>}
        </div>
      </td>

      {/* 10. Condition - Better aligned */}
      <td className="hidden md:table-cell py-3 px-4" style={{ width: '120px' }}>
        <span 
          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap"
          style={getConditionBadgeStyle(vehicle.condition || '')}
        >
          {getConditionDisplayName(vehicle.condition || 'N/A')}
        </span>
      </td>

      {/* Comments and Date Acquired columns are REMOVED - they appear on hover only */}
    </tr>
  )
}