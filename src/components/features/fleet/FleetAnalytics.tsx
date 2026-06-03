// src/components/features/fleet/FleetAnalytics.tsx
// ─────────────────────────────────────────────────────────────
// METRIC STRIP — pills left, Add Vehicle + ⋮ menu right.
// Bulk Insurance lives inside the three-dots dropdown.
// All existing filter props preserved exactly.
// ─────────────────────────────────────────────────────────────
'use client'

import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react'
import { MoreVertical, Shield, Plus } from 'lucide-react'
import { FleetVehicle } from '@/types'
import { useT } from '@/lib/i18n'

interface FleetAnalyticsProps {
  // ── existing props (unchanged) ──────────────────────────────
  vehicles: FleetVehicle[]
  totalVehicles: number
  motFilter: boolean
  sizeFilter: string
  insuranceFilter?: string
  onToggleMotFilter: () => void
  onSizeFilter: (size: string) => void
  onInsuranceFilter?: (status: string) => void
  // ── new action props ─────────────────────────────────────────
  onAddVehicle?: () => void
  onBulkInsurance?: (insuranceStatus: any, vehicleIds?: string[]) => Promise<void>
  filteredVehicles?: FleetVehicle[]
  vehicleCount?: number
  bulkInsuranceLoading?: boolean
  onClearAll?: () => Promise<void>
  clearingAll?: boolean
  // Slot for Excel actions rendered by FleetHeader (download/share/upload/template)
  excelActionsSlot?: ReactNode
}

export function FleetAnalytics({
  vehicles,
  totalVehicles,
  motFilter,
  sizeFilter,
  insuranceFilter = '',
  onToggleMotFilter,
  onSizeFilter,
  onInsuranceFilter,
  onAddVehicle,
  onBulkInsurance,
  filteredVehicles,
  vehicleCount = 0,
  bulkInsuranceLoading = false,
  onClearAll,
  clearingAll = false,
  excelActionsSlot,
}: FleetAnalyticsProps) {

  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const analytics = useMemo(() => {
    const motExpiring = vehicles.filter(vehicle => {
      if (!vehicle.motExpiry) return false
      const motDate = new Date(vehicle.motExpiry)
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      return motDate <= thirtyDaysFromNow && motDate >= new Date()
    }).length

    const notInsured = vehicles.filter(vehicle =>
      !vehicle.insuranceStatus || vehicle.insuranceStatus === 'Not Insured'
    ).length

    return { totalVehicles, motExpiring, notInsured }
  }, [vehicles, totalVehicles])

  const isInsuranceActive =
    insuranceFilter === 'Not Insured' || insuranceFilter === 'not-insured'

  const pillBase =
    'inline-flex items-center gap-1.5 sm:gap-2.5 px-3 py-1.5 sm:px-5 sm:py-3 rounded-full border text-xs sm:text-sm font-semibold transition-all duration-150 select-none'

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5 flex-nowrap mb-3 min-w-0">

      {/* ── Total Vehicles ────────────────────────────────────── */}
      <div className={`${pillBase} bg-white border-[#c8d5ce] text-[#025940] cursor-default flex-shrink-0`}>
        <img
          src="/Fleet stats/total-vehicles.png"
          alt={t('fleet.analytics.totalVehiclesAlt')}
          className="w-4 h-4 sm:w-6 sm:h-6 flex-shrink-0"
          style={{
            filter:
              'brightness(0) saturate(100%) invert(18%) sepia(47%) saturate(2576%) hue-rotate(145deg) brightness(95%) contrast(101%)',
          }}
        />
        <span className="hidden sm:inline">{t('fleet.analytics.totalLabel')}</span>
        <span className="min-w-[1.2rem] h-5 sm:h-6 flex items-center justify-center rounded-full text-[10px] sm:text-xs font-bold bg-[#e8f0eb] text-[#025940] px-1.5 sm:px-2">
          {analytics.totalVehicles}
        </span>
      </div>

      {/* ── MOT Expiring ──────────────────────────────────────── */}
      <button
        onClick={onToggleMotFilter}
        aria-label={t('fleet.analytics.toggleMotFilterAria')}
        className={`${pillBase} flex-shrink-0 ${
          motFilter
            ? 'bg-red-50 border-red-400 text-red-700'
            : 'bg-white border-[#c8d5ce] text-[#5a2a2a] hover:bg-red-50 hover:border-red-300'
        }`}
      >
        <img
          src="/Fleet stats/mot.png"
          alt={t('fleet.analytics.motExpiringAlt')}
          className="w-4 h-4 sm:w-6 sm:h-6 flex-shrink-0"
        />
        <span className="hidden sm:inline">{t('fleet.analytics.motSoonLabel')}</span>
        <span
          className={`min-w-[1.2rem] h-5 sm:h-6 flex items-center justify-center rounded-full text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 ${
            motFilter ? 'bg-red-200 text-red-800' : 'bg-[#fde8e8] text-red-700'
          }`}
        >
          {analytics.motExpiring}
        </span>
      </button>

      {/* ── Not Insured ───────────────────────────────────────── */}
      <button
        onClick={() => onInsuranceFilter?.(isInsuranceActive ? '' : 'not-insured')}
        aria-label={t('fleet.analytics.toggleUninsuredFilterAria')}
        className={`${pillBase} flex-shrink-0 ${
          isInsuranceActive
            ? 'bg-orange-50 border-orange-400 text-orange-700'
            : 'bg-white border-[#c8d5ce] text-[#5a3a1a] hover:bg-orange-50 hover:border-orange-300'
        }`}
      >
        <img
          src="/Fleet stats/auto-insurance.png"
          alt={t('fleet.analytics.notInsuredAlt')}
          className="w-4 h-4 sm:w-6 sm:h-6 flex-shrink-0"
          style={{
            filter:
              'brightness(0) saturate(100%) invert(48%) sepia(79%) saturate(2476%) hue-rotate(356deg) brightness(101%) contrast(97%)',
          }}
        />
        <span className="hidden sm:inline">{t('fleet.analytics.noInsuranceLabel')}</span>
        <span
          className={`min-w-[1.2rem] h-5 sm:h-6 flex items-center justify-center rounded-full text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 ${
            isInsuranceActive
              ? 'bg-orange-200 text-orange-800'
              : 'bg-orange-50 text-orange-700'
          }`}
        >
          {analytics.notInsured}
        </span>
      </button>

      {/* ── Right-side actions — pushed to far right ──────────── */}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">

        {/* Add Vehicle button */}
        {onAddVehicle && (
          <button
            onClick={onAddVehicle}
            className="
              inline-flex items-center justify-center
              w-9 h-9 sm:w-auto sm:h-auto sm:gap-2 sm:px-5 sm:py-3
              rounded-full border border-[#025940] bg-[#025940]
              text-white text-sm font-semibold
              shadow-sm hover:bg-[#012619] hover:border-[#012619]
              transition-all duration-150 hover:scale-105 active:scale-95
            "
            aria-label={t('fleet.analytics.addVehicleAria')}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('fleet.analytics.addVehicle')}</span>
          </button>
        )}

        {/* Three-dots menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="
              inline-flex items-center justify-center
              w-9 h-9 sm:w-12 sm:h-12 rounded-full border border-[#c8d5ce] bg-white
              text-[#4a5e54] hover:border-[#025940] hover:bg-[#f5faf7]
              transition-all duration-150
            "
            aria-label={t('fleet.analytics.moreActionsAria')}
          >
            <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {menuOpen && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">

              {/* Excel actions slot — passed from parent (FleetHeader handles all xlsx logic) */}
              {excelActionsSlot && (
                <div className="border-b border-gray-100">
                  {excelActionsSlot}
                </div>
              )}

              {/* Bulk Insurance */}
              {onBulkInsurance && vehicleCount > 0 && (
                <div className="p-2 border-b border-gray-100">
                  <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {t('fleet.analytics.bulkInsuranceHeading')}
                  </p>
                  {(['Insured', 'Not Insured', 'Unknown'] as const).map(status => (
                    <button
                      key={status}
                      disabled={bulkInsuranceLoading}
                      onClick={async () => {
                        await onBulkInsurance(status)
                        setMenuOpen(false)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Shield
                        className="w-4 h-4 flex-shrink-0"
                        style={{
                          color:
                            status === 'Insured'
                              ? '#16a34a'
                              : status === 'Not Insured'
                              ? '#dc2626'
                              : '#d97706',
                        }}
                      />
                      <span>{bulkInsuranceLoading ? t('fleet.analytics.processing') : t('fleet.analytics.setStatus', { status: t(status === 'Insured' ? 'fleet.insuranceLabel.insured' : status === 'Not Insured' ? 'fleet.insuranceLabel.notInsured' : 'fleet.insuranceLabel.unknown') })}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Clear All */}
              {onClearAll && vehicleCount > 0 && (
                <div className="p-2">
                  <button
                    onClick={() => { setMenuOpen(false); onClearAll() }}
                    disabled={clearingAll}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <span>{clearingAll ? t('fleet.analytics.clearing') : t('fleet.analytics.clearAllVehicles')}</span>
                  </button>
                </div>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  )
}