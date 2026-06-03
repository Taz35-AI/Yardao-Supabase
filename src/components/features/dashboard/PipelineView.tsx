// src/components/features/dashboard/PipelineView.tsx
// Kanban / pipeline view for the yard.
// Groups vehicles into 4 status columns: Pending → Ready → Repairs → Non-Starter.
// Uses the same theme tokens, plate styling, days-in-yard colouring, and status
// colours as the rest of the dashboard so it feels native.

'use client'

import React, { useMemo } from 'react'
import { CheckCircle, Clock, Wrench, XCircle, AlertTriangle, Plus, Truck } from 'lucide-react'
import { CheckedInVehicle, VehicleStatus, normalizeVehicleStatus } from '@/types'
import { useT } from '@/lib/i18n'

// Display-only label key per column (keyed by the logic `key`, which stays English)
const COL_LABEL_KEY: Record<string, string> = {
  'Ready': 'dashboard.pipeline.colReady',
  'Pending checks': 'dashboard.pipeline.colPending',
  'on_hire': 'dashboard.pipeline.colOnHire',
  'Repairs needed': 'dashboard.pipeline.colRepairs',
  'Non-Starter': 'dashboard.pipeline.colNonStarter',
}

interface PipelineViewProps {
  vehicles: CheckedInVehicle[]
  outOnHireVehicles?: CheckedInVehicle[]
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  className?: string
}

interface ColumnConfig {
  // Either a base status (sourced from `vehicles`) OR the special 'on_hire'
  // bucket (sourced from `outOnHireVehicles`).
  key: VehicleStatus | 'on_hire'
  label: string
  dot: string
  headerBg: string
  borderLeft: string
  icon: typeof CheckCircle
}

// Order requested by product: Ready · Pending · On Hire · Repairs · Non-Starter.
// On mobile, pairs snap together: (0+1) → (2+3) → (4 standalone, full width).
const COLUMNS: ColumnConfig[] = [
  {
    key: 'Ready',
    label: 'Ready',
    dot: '#16a34a',
    headerBg: 'from-emerald-50 dark:from-emerald-900/20',
    borderLeft: '#16a34a',
    icon: CheckCircle,
  },
  {
    key: 'Pending checks',
    label: 'Pending',
    dot: '#d97706',
    headerBg: 'from-amber-50 dark:from-amber-900/20',
    borderLeft: '#d97706',
    icon: Clock,
  },
  {
    key: 'on_hire',
    label: 'On Hire',
    // Matches the "Checked Out" pill in the metric strip — dark forest brand,
    // signals "out of yard" without introducing a purple that's off-theme.
    dot: '#012619',
    headerBg: 'from-[#e8efeb] dark:from-[#012619]/40',
    borderLeft: '#012619',
    icon: Truck,
  },
  {
    key: 'Repairs needed',
    label: 'Repairs',
    dot: '#dc2626',
    headerBg: 'from-red-50 dark:from-red-900/20',
    borderLeft: '#dc2626',
    icon: Wrench,
  },
  {
    key: 'Non-Starter',
    label: 'Non-Starter',
    dot: '#475569',
    headerBg: 'from-slate-50 dark:from-slate-800/40',
    borderLeft: '#475569',
    icon: XCircle,
  },
]

const getDaysInYard = (createdAt: any): number => {
  if (!createdAt) return 0
  try {
    const d = typeof createdAt === 'object' && createdAt?.toDate
      ? createdAt.toDate()
      : new Date(createdAt)
    if (isNaN(d.getTime())) return 0
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
  } catch { return 0 }
}

const getMotDaysLeft = (motExpiry: any): number | null => {
  if (!motExpiry) return null
  try {
    const d = typeof motExpiry === 'object' && motExpiry?.toDate
      ? motExpiry.toDate()
      : new Date(motExpiry)
    if (isNaN(d.getTime())) return null
    return Math.ceil((d.getTime() - Date.now()) / 86400000)
  } catch { return null }
}

const RegPlate = ({ registration }: { registration: string }) => (
  <span
    className="inline-flex items-center rounded-[4px] px-2 py-[3px] select-none"
    style={{
      background: '#f5c800',
      border: '1.5px solid #c8a000',
      fontFamily: "'DM Mono', 'JetBrains Mono', 'SF Mono', monospace",
      boxShadow: '0 1px 3px rgba(200,160,0,0.25)',
    }}
  >
    <span style={{ fontSize: '12px', fontWeight: 800, color: '#111000', letterSpacing: '0.10em', lineHeight: 1 }}>
      {registration}
    </span>
  </span>
)

const VehicleCard = ({
  vehicle,
  borderLeft,
  onView,
}: {
  vehicle: CheckedInVehicle
  borderLeft: string
  onView: (v: CheckedInVehicle) => void
}) => {
  const t = useT()
  const days = getDaysInYard(vehicle.createdAt || (vehicle as any).checkInTime)
  const motDays = getMotDaysLeft(vehicle.motExpiry)
  const daysColor = days >= 30 ? '#dc2626' : days >= 14 ? '#d97706' : '#6b7a70'
  const daysWeight = days >= 14 ? 700 : 500

  const contract = vehicle.contract
  const contractColor = vehicle.contractColor

  return (
    <button
      type="button"
      onClick={() => onView(vehicle)}
      className="w-full text-left bg-white dark:bg-gray-800 hover:bg-[#f7faf8] dark:hover:bg-gray-700/70
                 border border-[#e2e8e5] dark:border-gray-700 rounded-lg p-2.5
                 transition-all duration-150 hover:shadow-md hover:-translate-y-[1px]
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#025940]"
      style={{ borderLeft: `3px solid ${borderLeft}` }}
    >
      {/* Top row: plate + days */}
      <div className="flex items-center justify-between mb-2">
        <RegPlate registration={vehicle.registration} />
        <span
          className="text-[11px] tabular-nums leading-none"
          style={{ color: daysColor, fontWeight: daysWeight, fontFamily: "'DM Mono', monospace" }}
        >
          {t('dashboard.pipeline.daysInYardSuffix', { days })}
        </span>
      </div>

      {/* Vehicle info */}
      <div className="mb-1.5">
        <div className="text-[13px] font-semibold text-[#012619] dark:text-white leading-tight truncate">
          {`${vehicle.make || ''} ${vehicle.model || ''}`.trim() || t('dashboard.pipeline.unknownVehicle')}
        </div>
        <div className="text-[11px] text-[#6b7a70] dark:text-gray-400 truncate">
          {[vehicle.size, vehicle.colour].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {/* Alerts */}
      {motDays !== null && motDays <= 30 && (
        <div className="mb-1.5">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              motDays < 0
                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40'
            }`}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            {motDays < 0 ? t('dashboard.pipeline.motExpired') : t('dashboard.pipeline.motDaysLeft', { motDays })}
          </span>
        </div>
      )}

      {/* Bottom row: contract + condition */}
      <div className="flex items-center justify-between gap-2">
        {contract ? (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border max-w-[60%] truncate"
            style={{
              backgroundColor: contractColor ? `${contractColor}15` : '#f0f4f2',
              borderColor: contractColor ? `${contractColor}40` : '#d8d6cd',
              color: contractColor || '#4a5e54',
            }}
            title={contract}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: contractColor || '#8a9e94' }}
            />
            <span className="truncate">{contract}</span>
          </span>
        ) : (
          <span className="text-[10px] italic text-[#8a9e94] dark:text-gray-500">{t('dashboard.pipeline.noContract')}</span>
        )}
        <span className="text-[10px] text-[#6b7a70] dark:text-gray-400 truncate flex-shrink-0">
          {vehicle.condition || ''}
        </span>
      </div>
    </button>
  )
}

export const PipelineView = React.memo(function PipelineView({
  vehicles,
  outOnHireVehicles = [],
  onViewVehicle,
  className = '',
}: PipelineViewProps) {
  const t = useT()
  // Group in-yard vehicles by normalized status; on-hire is kept as its own
  // bucket sourced from a separate prop so search/filters can flow through both.
  const grouped = useMemo(() => {
    const buckets: Record<VehicleStatus | 'on_hire', CheckedInVehicle[]> = {
      'Ready': [],
      'Pending checks': [],
      'Repairs needed': [],
      'Non-Starter': [],
      'on_hire': [],
    }
    for (const v of vehicles) {
      const s = normalizeVehicleStatus(v.status as string)
      if (buckets[s]) buckets[s].push(v)
    }
    buckets['on_hire'] = [...outOnHireVehicles]

    // Sort each column by days in yard (oldest first) so the most-urgent
    // floats to the top.
    for (const k of Object.keys(buckets) as (VehicleStatus | 'on_hire')[]) {
      buckets[k].sort((a, b) =>
        getDaysInYard(b.createdAt || (b as any).checkInTime) -
        getDaysInYard(a.createdAt || (a as any).checkInTime)
      )
    }
    return buckets
  }, [vehicles, outOnHireVehicles])

  return (
    <div className={`${className} w-full`}>
      {/*
        Layout:
        • Mobile (< lg): flex row with horizontal snap.
            - Cols 0..3 (Ready, Pending, On Hire, Repairs) are ~50% wide each.
            - Col 4 (Non-Starter) is full-width so it sits standalone after
              swiping past the last pair.
            - snap-start sits on indices 0, 2, 4 so each swipe advances a pair:
              (Ready+Pending) → (On Hire+Repairs) → (Non-Starter alone) and back.
        • Desktop (lg+): 5-column grid, no scroll, no snap.
      */}
      <div
        className="
          flex items-start gap-3 overflow-x-auto snap-x snap-mandatory pb-2
          lg:grid lg:grid-cols-5 lg:items-start lg:overflow-visible lg:snap-none
        "
        style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
      >
        {COLUMNS.map((col, idx) => {
          const items = grouped[col.key] || []
          const Icon = col.icon
          // Snap on indices 0, 2, 4 so each swipe advances exactly one pair
          // (and the trailing standalone column).
          const isPairStart = idx % 2 === 0
          // Last column (Non-Starter) is full-width on mobile so it sits alone.
          const isStandalone = idx === COLUMNS.length - 1
          const colLabel = t(COL_LABEL_KEY[col.key] ?? '') || col.label
          return (
            <section
              key={col.key}
              className={`
                flex flex-col bg-[#f7faf8] dark:bg-gray-900/40
                border border-[#e2e8e5] dark:border-gray-700 rounded-xl
                overflow-hidden
                shrink-0 lg:w-auto lg:shrink
                ${isStandalone ? 'w-[calc(100%-6px)]' : 'w-[calc(50%-6px)]'}
                ${isPairStart ? 'snap-start snap-always' : ''}
              `}
            >
              {/* Header */}
              <header
                className={`flex items-center justify-between gap-2 px-3 py-2.5
                            border-b border-[#e2e8e5] dark:border-gray-700
                            bg-gradient-to-b ${col.headerBg} to-transparent`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Status pill — circular icon badge + bold uppercase label,
                      outlined in the status colour (see ON HIRE reference). */}
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-3 shadow-sm"
                    style={{ backgroundColor: col.dot }}
                  >
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white flex-shrink-0">
                      <Icon className="w-3 h-3" style={{ color: col.dot }} />
                    </span>
                    <span className="text-[12px] font-extrabold uppercase tracking-wide whitespace-nowrap text-white">
                      {colLabel}
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold text-[#6b7a70] dark:text-gray-400 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 px-1.5 py-0.5 rounded-full min-w-[22px] text-center flex-shrink-0">
                    {items.length}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-[#8a9e94] hover:text-[#025940] dark:hover:text-white p-0.5"
                  aria-label={t('dashboard.pipeline.addVehicleAria', { label: colLabel })}
                  onClick={() => window.dispatchEvent(new Event('yardao:open-checkin'))}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </header>

              {/* Cards — lane hugs its content; only once a lane gets tall
                  does it cap at the viewport and scroll internally. */}
              <div className="p-2 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-300px)] sm:max-h-[calc(100vh-260px)] lg:max-h-[calc(100vh-220px)]">
                {items.length === 0 ? (
                  <div className="text-center py-8 px-2">
                    <Icon className="w-6 h-6 text-[#c8d5ce] dark:text-gray-600 mx-auto mb-1.5" />
                    <p className="text-[11px] text-[#8a9e94] dark:text-gray-500">
                      {t('dashboard.pipeline.emptyColumn', { label: colLabel })}
                    </p>
                  </div>
                ) : (
                  items.map((v) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      borderLeft={col.borderLeft}
                      onView={onViewVehicle}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
})
