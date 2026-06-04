// src/components/features/dashboard/DashboardVehicleList.tsx - PROFESSIONAL REDESIGN
// ✅ PRESERVED: All original functions, features, props, logic, tooltips, mobile table, cards grid
// ✨ UPGRADED:  UK reg plate styling, traffic-light MOT/tax dots, monochrome stat structure,
//              stronger status pills, accent comment indicators, cleaner row hover
// 🔄 CHANGED:  MOT & Tax columns removed (live in Fleet page)
//              Colour merged under Vehicle name
//              Days in Yard column added with colour-coded bar
//              Reg plate made bolder/more vibrant (matches preview)
// ✨ PHASE 2:  Yard layout view added — when viewMode === 'layout' the component
//              delegates to <YardLayoutView/> instead of rendering the table/cards.

'use client'

import React, { useState } from 'react'
import {
  CheckCircle, Clock, Wrench, XCircle, AlertTriangle,
  Car, Calendar, History, FileText,
  ArrowUpDown, ArrowUp, ArrowDown,
  MessageSquare, Edit3, AlertCircle
} from 'lucide-react'
import { CheckedInVehicle, FilterConfig, SortConfig } from '@/types'
import { getConditionColor, getConditionTextColor, getConditionDisplayName } from '@/lib/conditionUtils'
import { formatAuditLogForDisplay, getAuditLogColorClass } from '@/lib/auditUtils'
import { ViewMode } from './VehicleViewToggle'
import { VehicleCardsGrid } from './VehicleCardsGrid'
import { ServiceBookingIndicator } from '@/components/common/ServiceBookingIndicator'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
// ✨ PHASE 2: Yard layout view (read-only dashboard map of branch parking spaces)
import { YardLayoutView } from '@/components/yard/layout/YardLayoutView'
// Tabbed yard view (statuses-as-tabs + right rail) — fills the "pipeline" view
// slot, replacing the old kanban PipelineView (still in the repo for revert).
import { YardTabsView } from '@/components/features/dashboard/YardTabsView'

interface ServiceBooking {
  id: string
  registration: string
  date: string
  timeSlot?: string
  customTime?: string
  workRequired: string | string[]
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled'
  isExternalProvider?: boolean
  externalProvider?: {
    garageName: string
    address?: string
  }
}

interface DashboardVehicleListProps {
  vehicles: CheckedInVehicle[]
  filteredVehicles: CheckedInVehicle[]
  filters: FilterConfig
  sortConfig: SortConfig
  activeFilter: string
  serviceBookings?: ServiceBooking[]
  onFilterChange: (key: keyof FilterConfig, value: string | boolean) => void
  onClearFilters: () => void
  onSort: (key: string) => void
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  onBulkCheckout: (vehicleIds: string[]) => Promise<void>
  // ✨ PHASE 2/3: viewMode accepts 'layout' (yard map) and 'pipeline' (kanban)
  viewMode?: ViewMode | 'layout' | 'pipeline'
  onViewModeChange?: (mode: ViewMode | 'layout' | 'pipeline') => void
  className?: string
  // ✨ PHASE 2: branchId is needed by YardLayoutView to load the right yard layout doc
  branchId?: string
  onOpenLayoutEditor?: () => void
  // Cancel a stuck transfer for an in-transit vehicle surfaced in the yard Park modal.
  onCancelTransfer?: (vehicleId: string) => void
  // ✨ PHASE 2 FIX: full unpaginated vehicle list for layout view
  //    (defaults to filteredVehicles when not provided to preserve old behaviour)
  allVehiclesForLayout?: CheckedInVehicle[]
  // ✨ PHASE 3: full FILTERED but unpaginated list — used by pipeline view so
  // filters / summary card clicks / search apply just like in list view.
  allFilteredVehicles?: CheckedInVehicle[]
  // ✨ PHASE 3: filtered out-on-hire vehicles for the 5th pipeline column.
  outOnHireVehicles?: CheckedInVehicle[]
}

export const DashboardVehicleList = React.memo(function DashboardVehicleList({
  vehicles,
  filteredVehicles,
  filters,
  sortConfig,
  activeFilter,
  serviceBookings = [],
  onFilterChange,
  onClearFilters,
  onSort,
  onViewVehicle,
  onBulkCheckout,
  viewMode,
  onViewModeChange,
  className = '',
  // ✨ PHASE 2
  branchId,
  onOpenLayoutEditor,
  onCancelTransfer,
  allVehiclesForLayout,
  // ✨ PHASE 3
  allFilteredVehicles,
  outOnHireVehicles,
}: DashboardVehicleListProps) {
  const [localViewMode, setLocalViewMode] = useState<ViewMode>('table')
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const currentViewMode = viewMode || localViewMode
  const t = useT()

  // ─── SAFE STRING ────────────────────────────────────────────────────────────
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      logger.log('Attempted to render object as string:', value)
      return ''
    }
    try { return String(value) } catch { return '' }
  }

  // ─── SORT HELPERS ────────────────────────────────────────────────────────────
  const getSortInfo = (field: string) => {
    const currentField =
      (sortConfig as any).field ||
      (sortConfig as any).key ||
      (sortConfig as any).sortBy ||
      (sortConfig as any).column
    const currentDirection =
      (sortConfig as any).direction ||
      (sortConfig as any).order ||
      (sortConfig as any).sort ||
      'asc'
    const isActive = currentField === field
    const direction = isActive ? currentDirection : null
    return { isActive, direction }
  }

  // ─── DATE HELPERS ────────────────────────────────────────────────────────────
  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    try {
      const d = typeof date === 'object' && date.toDate ? date.toDate() : new Date(date)
      return d.toLocaleDateString('en-GB')
    } catch { return 'N/A' }
  }

  const formatDateTime = (date: any) => {
    if (!date) return 'N/A'
    try {
      const d = typeof date === 'object' && date.toDate ? date.toDate() : new Date(date)
      return d.toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    } catch { return 'N/A' }
  }

  const formatMileage = (mileage: any) => {
    if (!mileage) return 'N/A'
    const s = safeString(mileage)
    if (!s) return 'N/A'
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  // ─── DAYS IN YARD ─────────────────────────────────────────────────────────────
  // Calculates how many days since the vehicle was checked in
  const getDaysInYard = (createdAt: any): number => {
    if (!createdAt) return 0
    try {
      const d = typeof createdAt === 'object' && createdAt.toDate
        ? createdAt.toDate()
        : new Date(createdAt)
      if (isNaN(d.getTime())) return 0
      const diff = Date.now() - d.getTime()
      return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
    } catch { return 0 }
  }

  // ─── DAYS IN YARD CELL ────────────────────────────────────────────────────────
  // Green < 14d | Amber 14–29d | Red 30d+
  const DaysInYardCell = ({ createdAt }: { createdAt: any }) => {
    const days = getDaysInYard(createdAt)
    const color  = days >= 30 ? '#dc2626' : days >= 14 ? '#d97706' : '#16a34a'
    const barPct = Math.min((days / 45) * 100, 100)

    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: '#e2e8e4' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barPct}%`, backgroundColor: color }}
          />
        </div>
        <span
          className="text-[12px] font-bold tabular-nums leading-none"
          style={{ color, fontFamily: "'DM Mono', monospace" }}
        >
          {t('dashboard.vehicleList.daysInYardSuffix', { days })}
        </span>
      </div>
    )
  }

  // ─── MOT / TAX EXPIRY STATUS (kept for potential use elsewhere) ───────────────
  const getExpiryStatus = (dateValue: any): 'expired' | 'warning' | 'ok' | 'unknown' => {
    if (!dateValue) return 'unknown'
    try {
      const d = typeof dateValue === 'object' && dateValue.toDate
        ? dateValue.toDate()
        : new Date(dateValue)
      if (isNaN(d.getTime())) return 'unknown'
      const now = new Date()
      const diffMs = d.getTime() - now.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays < 0) return 'expired'
      if (diffDays <= 30) return 'warning'
      return 'ok'
    } catch { return 'unknown' }
  }

  // ─── UK REG PLATE — bolder, high-contrast yellow ─────────────────────────────
  // Matches the preview exactly: deep yellow bg, strong dark text, visible border
  const RegPlate = ({ registration }: { registration: string }) => (
    <span
      className="inline-flex items-center rounded-[4px] px-2 py-[3px] select-none"
      style={{
        background: '#f5c800',          // rich yellow — much more vibrant than before
        border: '1.5px solid #c8a000',  // strong amber border
        fontFamily: "'DM Mono', 'JetBrains Mono', 'SF Mono', monospace",
        boxShadow: '0 1px 3px rgba(200,160,0,0.25)',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 800,
          color: '#111000',             // near-black for max contrast
          letterSpacing: '0.10em',
          lineHeight: 1,
        }}
      >
        {registration}
      </span>
    </span>
  )

  // ─── STATUS CONFIG ────────────────────────────────────────────────────────────
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Ready':
        return {
          icon: CheckCircle,
          color: 'text-emerald-700 dark:text-emerald-400',
          bgColor: 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40',
          dotColor: '#16a34a',
          label: t('dashboard.statusLabel.ready')
        }
      case 'Pending checks':
        return {
          icon: Clock,
          color: 'text-amber-700 dark:text-amber-400',
          bgColor: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40',
          dotColor: '#d97706',
          label: t('dashboard.statusLabel.pending')
        }
      case 'Repairs needed':
        return {
          icon: Wrench,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40',
          dotColor: '#dc2626',
          label: t('dashboard.statusLabel.repairs')
        }
      case 'Non-Starter':
        return {
          icon: XCircle,
          color: 'text-red-700 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40',
          dotColor: '#b91c1c',
          label: t('dashboard.statusLabel.nonStarter')
        }
      default:
        return {
          icon: AlertTriangle,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
          dotColor: '#9ca3af',
          label: status || t('dashboard.statusLabel.unknown')
        }
    }
  }

  // ─── CONTRACT DISPLAY ─────────────────────────────────────────────────────────
  const getContractDisplay = (vehicle: CheckedInVehicle, isCompact = false) => {
    if (!vehicle.contract) {
      return (
        <span className="text-xs text-[#9eb5ac] dark:text-gray-500 italic">{t('dashboard.vehicleList.noContract')}</span>
      )
    }
    const contractColor = vehicle.contractColor || '#6366f1'
    const contractName = safeString(vehicle.contract)
    const displayName =
      isCompact && contractName.length > 8 ? `${contractName.substring(0, 8)}…` : contractName

    return (
      <span
        className={`inline-flex items-center ${isCompact ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-lg text-xs font-semibold`}
        style={{
          backgroundColor: `${contractColor}10`,
          color: contractColor,
          border: `1px solid ${contractColor}20`
        }}
      >
        <span
          className={`${isCompact ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full mr-1.5 flex-shrink-0`}
          style={{ backgroundColor: contractColor }}
        />
        <span className={isCompact ? 'truncate max-w-[60px]' : ''}>{displayName}</span>
      </span>
    )
  }

  // ─── COMMENT INDICATOR ───────────────────────────────────────────────────────
  const CommentIndicator = ({ comments }: { comments: any }) => {
    const text = safeString(comments)
    if (!text) return null
    const isDamage = text.startsWith('🔴 DAMAGE:')
    if (isDamage) {
      return (
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/40 flex-shrink-0"
          title={text}
          style={{ animation: 'pulse 1.5s infinite' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        </span>
      )
    }
    return (
      <MessageSquare className="w-3.5 h-3.5 text-[#b3f243] flex-shrink-0" />
    )
  }

  // ─── SORTABLE HEADER ─────────────────────────────────────────────────────────
  const SortableHeader = ({
    field,
    children,
    className: cls = '',
    minWidth
  }: {
    field: string
    children: React.ReactNode
    className?: string
    minWidth?: string
  }) => {
    const { isActive, direction } = getSortInfo(field)

    const getSortIcon = () => {
      if (direction === 'asc') return <ArrowUp className="w-3 h-3" />
      if (direction === 'desc') return <ArrowDown className="w-3 h-3" />
      return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" />
    }

    return (
      <th
        className={`
          py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wider
          cursor-pointer select-none group transition-colors duration-150
          bg-[#f4f6f5] dark:bg-gray-800/80
          border-b border-[#e2e8e4] dark:border-gray-700
          whitespace-nowrap
          ${isActive
            ? 'text-[#025940] dark:text-[#72A68E]'
            : 'text-[#9eb5ac] dark:text-gray-500'}
          hover:text-[#025940] dark:hover:text-[#72A68E]
          ${cls}
        `}
        onClick={() => onSort(field)}
        style={minWidth ? { minWidth } : {}}
      >
        <div className="flex items-center gap-1">
          <span>{children}</span>
          <span className={`transition-all duration-150 ${isActive ? 'text-[#025940] dark:text-[#72A68E]' : 'text-[#9eb5ac]'}`}>
            {getSortIcon()}
          </span>
        </div>
      </th>
    )
  }

  const Header = ({
    children,
    className: cls = '',
    minWidth
  }: {
    children: React.ReactNode
    className?: string
    minWidth?: string
  }) => (
    <th
      className={`
        py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wider
        bg-[#f4f6f5] dark:bg-gray-800/80
        border-b border-[#e2e8e4] dark:border-gray-700
        text-[#9eb5ac] dark:text-gray-500
        whitespace-nowrap
        ${cls}
      `}
      style={minWidth ? { minWidth } : {}}
    >
      <span>{children}</span>
    </th>
  )

  // ─── MOUSE HANDLERS ───────────────────────────────────────────────────────────
  const handleMouseEnter = (vehicleId: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    setHoveredVehicle(vehicleId)
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltipPosition({ x: rect.right - 300, y: rect.top + window.scrollY })
  }

  const handleMouseLeave = () => setHoveredVehicle(null)

  // ─── DISPLAY VEHICLES ─────────────────────────────────────────────────────────
  const displayVehicles = filteredVehicles || vehicles

  // ═══════════════════════════════════════════════════════════════════════════
  // ✨ PHASE 2: LAYOUT VIEW BRANCH
  // When the user picks the Map toggle, we delegate the entire content area to
  // YardLayoutView. This must come BEFORE the empty-state check below — even if
  // there are zero vehicles, the user might still want to view/design the layout.
  // ═══════════════════════════════════════════════════════════════════════════
  if (currentViewMode === 'layout' && branchId) {
    return (
      <div className={`${className} w-full`}>
        <YardLayoutView
          branchId={branchId}
          // ✨ PHASE 2 FIX: prefer the full vehicle list when provided.
          // Falls back to displayVehicles (paginated) only if parent didn't pass one.
          vehicles={allVehiclesForLayout || displayVehicles}
          onViewVehicle={onViewVehicle}
          onOpenLayoutEditor={onOpenLayoutEditor}
          onCancelTransfer={onCancelTransfer}
          className="w-full"
        />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ✨ PHASE 3: PIPELINE (KANBAN) VIEW BRANCH — DEFAULT VIEW
  // Groups vehicles into status columns. Uses the FULL FILTERED (unpaginated)
  // list so filters, summary-card clicks, and search work exactly like the
  // other views. Falls back to displayVehicles if the parent didn't pass it.
  // ═══════════════════════════════════════════════════════════════════════════
  if (currentViewMode === 'pipeline') {
    return (
      <div className={`${className} w-full`}>
        <YardTabsView
          vehicles={allFilteredVehicles || displayVehicles}
          outOnHireVehicles={outOnHireVehicles}
          onViewVehicle={onViewVehicle}
          searchTerm={filters?.search || ''}
          className="w-full"
        />
      </div>
    )
  }

  // ─── EMPTY STATE ─────────────────────────────────────────────────────────────
  if (displayVehicles.length === 0) {
    return (
      <div className={`${className} text-center py-16`}>
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#f0f4f2] dark:bg-[#025940]/30 mb-4">
          <Car className="w-10 h-10 text-[#025940] dark:text-[#72A68E]" />
        </div>
        <p className="text-lg font-bold text-[#012619] dark:text-[#72A68E]">{t('dashboard.vehicleList.emptyTitle')}</p>
        <p className="text-sm text-[#8a9e94] dark:text-[#C5D9D0] mt-1">{t('dashboard.vehicleList.emptySubtitle')}</p>
      </div>
    )
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className={`${className} w-full`}>
      {currentViewMode === 'cards' ? (
        <VehicleCardsGrid
          vehicles={displayVehicles}
          serviceBookings={serviceBookings}
          onViewVehicle={onViewVehicle}
          getStatusConfig={getStatusConfig}
          safeString={safeString}
          formatDate={formatDate}
          formatMileage={formatMileage}
        />
      ) : (
        <>
          {/* ═══════════════════════════════════════════
              MOBILE — Option 5 Rich Rows
              Gradient left border (status colour)
              Yellow plate badge | Make + Model
              Size + Colour + Days tags | Status pill
          ═══════════════════════════════════════════ */}
          <div className="block lg:hidden">
            <div className="flex flex-col gap-2">
              {displayVehicles.map((vehicle) => {
                const statusConfig = getStatusConfig(vehicle.status)
                const days = getDaysInYard(vehicle.createdAt)
                const daysColor  = days >= 30 ? '#dc2626' : days >= 14 ? '#d97706' : '#16a34a'
                const daysBg     = days >= 30 ? '#fff5f5' : days >= 14 ? '#fffbeb' : '#f0fdf4'
                const daysBorder = days >= 30 ? '#fecaca' : days >= 14 ? '#fde68a' : '#bbf7d0'

                // Left border gradient matches status colour
                const borderGradient =
                  vehicle.status === 'Ready'           ? 'linear-gradient(180deg,#16a34a,#4ade80)' :
                  vehicle.status === 'Pending checks'  ? 'linear-gradient(180deg,#d97706,#fbbf24)' :
                  vehicle.status === 'Repairs needed'  ? 'linear-gradient(180deg,#dc2626,#f87171)' :
                  vehicle.status === 'Non-Starter'     ? 'linear-gradient(180deg,#b91c1c,#f87171)' :
                                                         'linear-gradient(180deg,#9ca3af,#d1d5db)'

                return (
                  <div
                    key={vehicle.id}
                    onClick={() => onViewVehicle(vehicle)}
                    className="relative flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl border border-[#e2e8e4] dark:border-gray-700 px-3 py-3 cursor-pointer active:scale-[0.99] transition-all duration-100"
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}
                  >
                    {/* Left gradient status bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl flex-shrink-0"
                      style={{ background: borderGradient }}
                    />

                    {/* Reg plate badge */}
                    <div className="flex-shrink-0 ml-1">
                      <span
                        className="inline-flex items-center rounded-[4px] px-2 py-[4px]"
                        style={{
                          background: '#f5c800',
                          border: '1.5px solid #c8a000',
                          fontFamily: "'DM Mono','JetBrains Mono',monospace",
                          boxShadow: '0 1px 3px rgba(200,160,0,0.2)',
                          minWidth: '80px',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0d0a00', letterSpacing: '0.09em', lineHeight: 1 }}>
                          {safeString(vehicle.registration)}
                        </span>
                      </span>
                      {/* Icons below plate */}
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <ServiceBookingIndicator
                          vehicleRegistration={vehicle.registration}
                          serviceBookings={serviceBookings}
                          className="flex-shrink-0 scale-75"
                        />
                        <CommentIndicator comments={vehicle.comments} />
                      </div>
                    </div>

                    {/* Middle — vehicle info + tags */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="font-bold text-[13px] text-[#012619] dark:text-white leading-tight">
                          {safeString(vehicle.make)}
                        </span>
                        {vehicle.model && (
                          <span className="text-[12px] text-[#9eb5ac] dark:text-gray-400 font-medium leading-tight">
                            {safeString(vehicle.model)}
                          </span>
                        )}
                      </div>

                      {/* Tags row — size, colour, days */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {vehicle.size && (
                          <span
                            className="text-[10px] font-700 px-1.5 py-[2px] rounded-[5px]"
                            style={{ background: '#f0f4f2', color: '#72A68E', fontWeight: 700 }}
                          >
                            {safeString(vehicle.size)}
                          </span>
                        )}
                        {vehicle.colour && (
                          <span
                            className="text-[10px] font-600 px-1.5 py-[2px] rounded-[5px]"
                            style={{ background: '#f0f4f2', color: '#72A68E', fontWeight: 600 }}
                          >
                            {safeString(vehicle.colour)}
                          </span>
                        )}
                        {/* Days in yard tag */}
                        <span
                          className="text-[10px] font-bold px-1.5 py-[2px] rounded-[5px]"
                          style={{
                            background: daysBg,
                            color: daysColor,
                            border: `1px solid ${daysBorder}`,
                            fontFamily: "'DM Mono',monospace",
                          }}
                        >
                          {t('dashboard.vehicleList.daysInYardSuffix', { days })}
                        </span>
                      </div>
                    </div>

                    {/* Right — status pill */}
                    <div className="flex-shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-[4px] rounded-full text-[10px] font-bold whitespace-nowrap ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.dotColor }} />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ═══════════════════════════════════════════
              DESKTOP TABLE
              Columns: Registration | Vehicle (+ Colour) | Size | Status | Condition | Days | Check-in | Contract | Mileage
              Removed: MOT, Tax (now live in Fleet page only)
              Merged:  Colour folded under vehicle name (saves a column)
              Added:   Days in Yard with colour-coded bar
          ═══════════════════════════════════════════ */}
          <div className="hidden lg:block w-full relative">
            <div className="w-full overflow-hidden rounded-xl border border-[#e2e8e4] dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <SortableHeader field="registration" minWidth="160px">{t('dashboard.vehicleList.colRegistration')}</SortableHeader>
                      {/* Vehicle column now includes colour as a subtitle — Colour column removed */}
                      <SortableHeader field="make" minWidth="190px">{t('dashboard.vehicleList.colVehicle')}</SortableHeader>
                      <SortableHeader field="size" minWidth="80px">{t('dashboard.vehicleList.colSize')}</SortableHeader>
                      <SortableHeader field="status" minWidth="110px">{t('dashboard.vehicleList.colStatus')}</SortableHeader>
                      <SortableHeader field="condition" minWidth="100px">{t('dashboard.vehicleList.colCondition')}</SortableHeader>
                      {/* NEW: Days in Yard — replaces MOT & Tax */}
                      <SortableHeader field="createdAt" minWidth="110px">{t('dashboard.vehicleList.colDays')}</SortableHeader>
                      <SortableHeader field="createdAt" minWidth="100px">{t('dashboard.vehicleList.colCheckIn')}</SortableHeader>
                      <SortableHeader field="contract" minWidth="130px">{t('dashboard.vehicleList.colContract')}</SortableHeader>
                      <SortableHeader field="mileage" minWidth="100px">{t('dashboard.vehicleList.colMileage')}</SortableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {displayVehicles.map((vehicle, index) => {
                      const statusConfig = getStatusConfig(vehicle.status)

                      return (
                        <tr
                          key={vehicle.id}
                          className={`
                            border-b border-[#e2e8e4]/60 dark:border-gray-800
                            cursor-pointer group transition-all duration-100
                            hover:bg-[#f4f6f5] dark:hover:bg-[#72A68E]/5
                            ${index % 2 === 0
                              ? 'bg-white dark:bg-gray-900'
                              : 'bg-[#fafbfa] dark:bg-gray-800/20'}
                          `}
                          onClick={() => onViewVehicle(vehicle)}
                          onMouseEnter={(e) => handleMouseEnter(vehicle.id, e)}
                          onMouseLeave={handleMouseLeave}
                        >
                          {/* ── Registration — vibrant UK plate badge ── */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <RegPlate registration={safeString(vehicle.registration)} />
                              <ServiceBookingIndicator
                                vehicleRegistration={vehicle.registration}
                                serviceBookings={serviceBookings}
                                className="flex-shrink-0"
                              />
                              <CommentIndicator comments={vehicle.comments} />
                            </div>
                          </td>

                          {/* ── Vehicle — Make + Model + Colour subtitle ── */}
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-semibold text-[13px] text-[#0d1f18] dark:text-white">
                                {safeString(vehicle.make)}
                              </span>
                              {vehicle.model && (
                                <span className="text-[13px] text-[#9eb5ac] dark:text-gray-400 ml-1.5">
                                  {safeString(vehicle.model)}
                                </span>
                              )}
                            </div>
                            {/* Colour merged here as a subtle subtitle — no separate column */}
                            {vehicle.colour && (
                              <div className="text-[10px] text-[#aabdb5] dark:text-gray-500 mt-0.5 leading-none">
                                {safeString(vehicle.colour)}
                              </div>
                            )}
                          </td>

                          {/* ── Size ── */}
                          <td className="py-3 px-4">
                            {vehicle.size ? (
                              <span className="text-[12px] text-[#4a5e54] dark:text-gray-300 bg-[#f4f6f5] dark:bg-gray-800 px-2 py-0.5 rounded-md">
                                {safeString(vehicle.size)}
                              </span>
                            ) : (
                              <span className="text-[#c5d9d0] dark:text-gray-600">—</span>
                            )}
                          </td>

                          {/* ── Status — pill with dot ── */}
                          <td className="py-3 px-4">
                            <span
                              className={`
                                inline-flex items-center gap-1.5
                                px-2.5 py-[5px] rounded-full
                                text-[11px] font-semibold
                                ${statusConfig.bgColor} ${statusConfig.color}
                              `}
                            >
                              <span
                                className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                                style={{ backgroundColor: statusConfig.dotColor }}
                              />
                              {statusConfig.label}
                            </span>
                          </td>

                          {/* ── Condition ── */}
                          <td className="py-3 px-4">
                            <span
                              className="text-[12px] font-semibold"
                              style={{ color: getConditionColor(vehicle.condition) }}
                            >
                              {getConditionDisplayName(vehicle.condition) || (
                                <span className="text-[#c5d9d0] dark:text-gray-600 font-normal">—</span>
                              )}
                            </span>
                          </td>

                          {/* ── Days in Yard — colour-coded bar ── */}
                          {/* Green <14d | Amber 14-29d | Red 30d+ */}
                          <td className="py-3 px-4">
                            <DaysInYardCell createdAt={vehicle.createdAt} />
                          </td>

                          {/* ── Check-in date ── */}
                          <td className="py-3 px-4">
                            <span className="text-[12px] text-[#4a5e54] dark:text-gray-300 tabular-nums">
                              {formatDate(vehicle.createdAt) === 'N/A'
                                ? <span className="text-[#c5d9d0] dark:text-gray-600">—</span>
                                : formatDate(vehicle.createdAt)
                              }
                            </span>
                          </td>

                          {/* ── Contract ── */}
                          <td className="py-3 px-4">
                            <div className="truncate">
                              {getContractDisplay(vehicle, false)}
                            </div>
                          </td>

                          {/* ── Mileage ── */}
                          <td className="py-3 px-4">
                            {formatMileage(vehicle.mileage) === 'N/A' ? (
                              <span className="text-[#c5d9d0] dark:text-gray-600">—</span>
                            ) : (
                              <span
                                className="text-[12px] text-[#4a5e54] dark:text-gray-300 tabular-nums"
                                style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace" }}
                              >
                                {formatMileage(vehicle.mileage)}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ═══════════════════════════════════════════
                FLOATING TOOLTIP — Comments & Last Edit
                (FULLY PRESERVED — zero changes to logic)
            ═══════════════════════════════════════════ */}
            {hoveredVehicle && displayVehicles.find(v => v.id === hoveredVehicle) && (
              <div
                className="fixed z-50 pointer-events-none animate-in fade-in duration-200"
                style={{
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y}px`,
                }}
              >
                {(() => {
                  const vehicle = displayVehicles.find(v => v.id === hoveredVehicle)!
                  const hasComments = vehicle.comments && safeString(vehicle.comments)
                  const hasLastEdit = vehicle.lastEditLog

                  if (!hasComments && !hasLastEdit) return null

                  return (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-[#e2e8e5] dark:border-gray-700 p-4 min-w-[280px] max-w-[350px]">
                      <div className="absolute left-[-8px] top-6 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-white dark:border-r-gray-800" />

                      {/* Comments Section */}
                      {hasComments && (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <MessageSquare className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                            <span className="text-xs font-bold text-[#012619] dark:text-gray-300">{t('dashboard.vehicleList.tooltipComments')}</span>
                          </div>
                          <p className="text-sm text-[#4a5e54] dark:text-gray-400 leading-relaxed">
                            {safeString(vehicle.comments)}
                          </p>
                        </div>
                      )}

                      {hasComments && hasLastEdit && (
                        <div className="border-t border-[#e2e8e5] dark:border-gray-700 my-3" />
                      )}

                      {/* Last Edit Section */}
                      {hasLastEdit && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Edit3 className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                            <span className="text-xs font-bold text-[#012619] dark:text-gray-300">{t('dashboard.vehicleList.tooltipLastEdit')}</span>
                          </div>
                          <div className="text-sm">
                            <span className={`font-medium ${getAuditLogColorClass(vehicle.lastEditLog?.action || '')}`}>
                              {formatAuditLogForDisplay(vehicle.lastEditLog)}
                            </span>
                            {vehicle.lastEditLog?.timestamp && (
                              <div className="text-xs text-[#8a9e94] dark:text-gray-400 mt-1">
                                {formatDateTime(vehicle.lastEditLog.timestamp)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
})