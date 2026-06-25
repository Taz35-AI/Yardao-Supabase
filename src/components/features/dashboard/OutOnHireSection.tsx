// src/components/features/dashboard/OutOnHireSection.tsx
// Restyled: Clean table layout matching Yardao suite
// ✅ ALL logic, props, handlers, search, filter fully preserved
// ✅ Collapsible header removed — visibility controlled by parent (DashboardContent)
// ✅ Table on desktop, compact rows on mobile
'use client'

import React, { useEffect, useState } from 'react'
import { CheckedInVehicle, isVehicleOutOnHire, getDisplayStatus } from '@/types'
import { useT } from '@/lib/i18n'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import {
  Car,
  CheckCircle,
  Clock,
  Wrench,
  XCircle,
  Calendar,
  User,
  Building2,
  FileText,
  ArrowLeft,
  Search
} from 'lucide-react'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OutOnHireSectionProps {
  vehicles: CheckedInVehicle[]
  searchTerm?: string
  totalUnfilteredCount?: number
  onQuickCheckIn: (vehicle: CheckedInVehicle) => void
  onViewDetails: (vehicle: CheckedInVehicle) => void
  className?: string
}

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────

const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

const formatDateTime = (date: any): string => {
  if (!date) return '—'
  try {
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'Ready':
      return { icon: CheckCircle, color: '#0d6b2e', bg: '#e6f4ec', label: 'Ready', labelKey: 'dashboard.outOnHire.statusReady' }
    case 'Pending checks':
      return { icon: Clock,        color: '#92400e', bg: '#fef3c7', label: 'Pending', labelKey: 'dashboard.outOnHire.statusPending' }
    case 'Repairs needed':
      return { icon: Wrench,       color: '#9a3412', bg: '#ffedd5', label: 'Repairs', labelKey: 'dashboard.outOnHire.statusRepairs' }
    case 'Non-Starter':
      return { icon: XCircle,      color: '#991b1b', bg: '#fee2e2', label: 'Non-Starter', labelKey: 'dashboard.outOnHire.statusNonStarter' }
    default:
      return { icon: Clock,        color: '#4a5e54', bg: '#f0f4f2', label: status || '—', labelKey: '' }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OutOnHireSection({
  vehicles,
  searchTerm,
  totalUnfilteredCount,
  onQuickCheckIn,
  onViewDetails,
  className = ''
}: OutOnHireSectionProps) {
  const t = useT()
  const outOnHireVehicles = vehicles.filter(isVehicleOutOnHire)
  const isSearching       = searchTerm && searchTerm.trim() !== ''
  const actualTotal       = totalUnfilteredCount || outOnHireVehicles.length

  // Resolve contract → customer for any vehicle on a Hire-Management line.
  const [hireCustomerByLine, setHireCustomerByLine] = useState<Record<string, string>>({})
  const lineKey = outOnHireVehicles
    .map((v) => v.currentAgreementLineId)
    .filter(Boolean)
    .sort()
    .join(',')
  useEffect(() => {
    const orgId = vehicles.find((v) => v.organizationId)?.organizationId
    const lineIds = lineKey ? lineKey.split(',') : []
    if (!orgId || lineIds.length === 0) {
      setHireCustomerByLine({})
      return
    }
    let cancelled = false
    hireAgreementService.getCustomerNamesByLineIds(orgId, lineIds).then((m) => {
      if (!cancelled) setHireCustomerByLine(m)
    })
    return () => {
      cancelled = true
    }
  }, [lineKey, vehicles])

  const customerFor = (v: CheckedInVehicle): string =>
    (v.currentAgreementLineId && hireCustomerByLine[v.currentAgreementLineId]) || ''

  // Don't render when empty and not searching
  if (outOnHireVehicles.length === 0 && !isSearching) return null

  return (
    <div className={`rounded-2xl overflow-hidden border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm ${className}`}>

      {/* ── Empty search state ── */}
      {isSearching && outOnHireVehicles.length === 0 && (
        <div className="py-10 px-4 text-center">
          <Search className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
          <p className="text-sm text-[#4a5e54] dark:text-gray-400">
            {t('dashboard.outOnHire.noResults', { searchTerm: searchTerm ?? '' })}
          </p>
          <p className="text-xs text-[#8a9e94] mt-1">
            {t('dashboard.outOnHire.currentlyOnHireCount', { count: actualTotal })}
          </p>
        </div>
      )}

      {/* ── Table ── */}
      {outOnHireVehicles.length > 0 && (
        <>
          {/* ── Desktop table header (hidden on mobile) ── */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-4 px-5 py-2.5 bg-[#f8faf9] dark:bg-gray-800/60 border-b border-[#e2e8e5] dark:border-gray-700">
            <span className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest">{t('dashboard.outOnHire.colVehicle')}</span>
            <span className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest">{t('dashboard.outOnHire.colStatus')}</span>
            <span className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest">{t('dashboard.outOnHire.colHired')}</span>
            <span className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest">{t('dashboard.outOnHire.colBy')}</span>
            <span className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest">{t('dashboard.outOnHire.colActions')}</span>
          </div>

          {/* ── Rows ── */}
          <div className="divide-y divide-[#f0f4f2] dark:divide-gray-800">
            {outOnHireVehicles.map(vehicle => {
              const cfg        = getStatusConfig(getDisplayStatus(vehicle))
              const StatusIcon = cfg.icon

              return (
                <div
                  key={vehicle.id}
                  className="group hover:bg-[#f8faf9] dark:hover:bg-gray-800/40 transition-colors"
                >
                  {/* ── Desktop row ── */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-4 px-5 py-3">

                    {/* Vehicle */}
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-sm text-[#012619] dark:text-white tracking-wide block">
                        {safeString(vehicle.registration)}
                      </span>
                      <span className="text-[11px] text-[#8a9e94] truncate block mt-0.5">
                        {safeString(vehicle.make)} {safeString(vehicle.model)}
                        {vehicle.size && <span className="text-[#c8d5ce]"> · {safeString(vehicle.size)}</span>}
                      </span>
                    </div>

                    {/* Status */}
                    <div>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {cfg.labelKey ? t(cfg.labelKey) : cfg.label}
                      </span>
                    </div>

                    {/* Hired at */}
                    <div className="flex items-center gap-1.5 text-xs text-[#4a5e54] dark:text-gray-400">
                      <Calendar className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
                      <span>{formatDateTime(vehicle.hiredAt)}</span>
                    </div>

                    {/* Hired by (+ contract customer when on a hire agreement) */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
                        <span className="text-xs text-[#4a5e54] dark:text-gray-400 truncate">
                          {safeString(vehicle.hiredByName) || '—'}
                        </span>
                        {vehicle.hireNotes && (
                          <span className="hidden lg:flex items-center gap-1 text-[10px] text-[#8a9e94] ml-1 truncate max-w-[120px]">
                            <FileText className="w-3 h-3 flex-shrink-0" />
                            {safeString(vehicle.hireNotes)}
                          </span>
                        )}
                      </div>
                      {customerFor(vehicle) && (
                        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#025940]/10 dark:bg-[#025940]/25 text-[10px] font-bold text-[#025940] dark:text-[#b3f243] max-w-full truncate">
                          <Building2 className="w-2.5 h-2.5 flex-shrink-0" />
                          <span className="truncate">{customerFor(vehicle)}</span>
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onViewDetails(vehicle)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#4a5e54] dark:text-gray-300 bg-[#f0f4f2] dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        {t('dashboard.outOnHire.detailsButton')}
                      </button>
                      <button
                        onClick={() => onQuickCheckIn(vehicle)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#012619] bg-[#b3f243] hover:bg-[#c8f76a] transition-colors"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        {t('dashboard.outOnHire.checkInButton')}
                      </button>
                    </div>
                  </div>

                  {/* ── Mobile row (two lines, actions on right) ── */}
                  <div className="sm:hidden flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      {/* Line 1 */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#012619] dark:text-white tracking-wide">
                          {safeString(vehicle.registration)}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          <StatusIcon className="w-2.5 h-2.5" />
                          {cfg.labelKey ? t(cfg.labelKey) : cfg.label}
                        </span>
                      </div>
                      {/* Line 2 */}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-[#8a9e94]">
                          {safeString(vehicle.make)} {safeString(vehicle.model)}
                        </span>
                        <span className="text-[10px] text-[#72A68E] flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {formatDateTime(vehicle.hiredAt)}
                        </span>
                        {safeString(vehicle.hiredByName) && (
                          <span className="text-[10px] text-[#72A68E] flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            {safeString(vehicle.hiredByName)}
                          </span>
                        )}
                        {customerFor(vehicle) && (
                          <span className="text-[10px] font-bold text-[#025940] dark:text-[#b3f243] flex items-center gap-1">
                            <Building2 className="w-2.5 h-2.5" />
                            {customerFor(vehicle)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mobile actions — icon only */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => onViewDetails(vehicle)}
                        className="p-2 rounded-lg text-[#4a5e54] dark:text-gray-300 bg-[#f0f4f2] dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 hover:bg-[#e2e8e5] transition-colors"
                        aria-label={t('dashboard.outOnHire.viewDetailsAria')}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onQuickCheckIn(vehicle)}
                        className="p-2 rounded-lg text-[#012619] bg-[#b3f243] hover:bg-[#c8f76a] transition-colors"
                        aria-label={t('dashboard.outOnHire.quickCheckInAria')}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Footer note ── */}
          <div className="px-5 py-2 border-t border-[#f0f4f2] dark:border-gray-800 bg-[#f8faf9] dark:bg-gray-800/40">
            <p className="text-[10px] text-[#8a9e94] dark:text-gray-500 font-medium text-center">
              {t('dashboard.outOnHire.footerNote')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}