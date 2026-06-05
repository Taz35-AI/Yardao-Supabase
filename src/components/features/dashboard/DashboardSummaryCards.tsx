// src/components/features/dashboard/DashboardSummaryCards.tsx
// ─────────────────────────────────────────────────────────────
// METRIC STRIP — replaces the old summary cards with a single
// compact horizontal bar. Same props, same filter callbacks,
// zero changes needed in DashboardContent.tsx.
// ─────────────────────────────────────────────────────────────
'use client'

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { Analytics } from '@/types'
import { UserNotesButton } from '@/components/features/dashboard/UserNotesButton'
import { useT } from '@/lib/i18n'

// ── Long-press hook on the Check In button ──────────────────────────────
// Hold for 3 seconds → fires the global 'yardao:toggle-voice' event that
// VoiceCommandButton listens to (opens the voice overlay). A short tap
// still runs the normal onClick (opens the check-in form). The hook
// also reports a `pressing` flag so the button can show a hold cue.
const VOICE_HOLD_MS = 3000
function useCheckInLongPress(onCheckIn?: () => void) {
  const [pressing, setPressing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setPressing(false)
  }, [])

  const start = useCallback(() => {
    firedRef.current = false
    setPressing(true)
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      setPressing(false)
      window.dispatchEvent(new Event('yardao:toggle-voice'))
    }, VOICE_HOLD_MS)
  }, [])

  useEffect(() => () => cancel(), [cancel])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // If the long-press already fired, swallow the trailing click so
      // the check-in form doesn't also open on top of the voice overlay.
      if (firedRef.current) {
        firedRef.current = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
      onCheckIn?.()
    },
    [onCheckIn],
  )

  return {
    pressing,
    bind: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onClick: handleClick,
    },
  }
}

// Display-only label key per segment (keyed by the logic `key`, which stays English)
const SEG_LABEL_KEY: Record<string, string> = {
  total: 'dashboard.summary.totalLabel',
  ready: 'dashboard.summary.readyLabel',
  pending: 'dashboard.summary.pendingLabel',
  repairs: 'dashboard.summary.repairsLabel',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummaryCardsProps {
  analytics: Analytics
  filteredVehicles?: any[]
  currentFilters?: {
    search?: string
    condition?: string
    status?: string
    size?: string
    motExpiring?: boolean
    dateFrom?: string
    dateTo?: string
  }
  hasActiveFilters?: boolean
  statusSizeBreakdown?: Record<string, Record<string, number>>
  onSizeCardClick?: () => void
  onConditionCardClick?: () => void
  onStatusCardClick?: () => void
  onRepairsCardClick?: () => void
  onStatusSizeFilter?: (status: string, size: string) => void
  onClearFilters?: () => void
  onCheckIn?: () => void
  mobileFiltersBadge?: number
  onMobileFiltersOpen?: () => void
  viewMode?: 'table' | 'cards'
  onViewModeChange?: (mode: 'table' | 'cards') => void
  // Render slot — pass <CheckedOutVehiclesSection /> from DashboardContent.
  // Desktop: sits inline at the end of the metric strip row.
  // Mobile: sits in the same row as the pills.
  checkedOutSlot?: React.ReactNode
  // Render slot — pass the In Yard / On Hire tab toggle from DashboardContent.
  // Mobile only: shown inline after the checked-out pill, before notes/check-in.
  // Desktop: not rendered here (tab toggle lives below the strip in DashboardContent).
  yardTabSlot?: React.ReactNode
  // DESKTOP-ONLY: show just the Total pill (hide Ready/Pending/Repairs + progress
  // + the inline check-in). Used by the desktop tabbed pipeline view, whose tabs
  // already carry the status counts. Mobile is unaffected.
  onlyTotal?: boolean
  className?: string
}

// ─── Metric strip config ──────────────────────────────────────────────────────
// Each segment: label, colour dot, which click handler to call, how to derive count

const SEGMENTS = [
  {
    key: 'total',
    label: 'Total',
    dotColor: '#025940',
    // active: lime tint background, dark green border+text
    activeStyle: 'bg-[#b3f243]/20 border-[#025940] text-[#012619] dark:bg-[#b3f243]/15 dark:border-[#b3f243]/60 dark:text-[#b3f243]',
    // default: white bg, grey border, dark text — fully visible on light backgrounds
    defaultStyle: 'bg-white border-[#c8d5ce] text-[#025940] hover:bg-[#f0f7f0] hover:border-[#025940] dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10',
    handler: 'onSizeCardClick' as const,
  },
  {
    key: 'ready',
    label: 'Ready',
    dotColor: '#16a34a',
    activeStyle: 'bg-green-50 border-green-400 text-green-700 dark:bg-[#4ade80]/15 dark:border-[#4ade80]/50 dark:text-[#4ade80]',
    defaultStyle: 'bg-white border-[#c8d5ce] text-[#3a5a44] hover:bg-green-50 hover:border-green-300 dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-[#4ade80]/10',
    handler: 'onStatusCardClick' as const,
  },
  {
    key: 'pending',
    label: 'Pending',
    dotColor: '#d97706',
    activeStyle: 'bg-amber-50 border-amber-400 text-amber-700 dark:bg-[#fbbf24]/15 dark:border-[#fbbf24]/50 dark:text-[#fbbf24]',
    defaultStyle: 'bg-white border-[#c8d5ce] text-[#5a4a2a] hover:bg-amber-50 hover:border-amber-300 dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-[#fbbf24]/10',
    handler: 'onStatusCardClick' as const,
  },
  {
    key: 'repairs',
    label: 'Repairs',
    dotColor: '#dc2626',
    activeStyle: 'bg-red-50 border-red-400 text-red-700 dark:bg-[#f87171]/15 dark:border-[#f87171]/50 dark:text-[#f87171]',
    defaultStyle: 'bg-white border-[#c8d5ce] text-[#5a2a2a] hover:bg-red-50 hover:border-red-300 dark:bg-white/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-[#f87171]/10',
    handler: 'onRepairsCardClick' as const,
  },
] as const

type SegmentKey = typeof SEGMENTS[number]['key']

// ─── Component ────────────────────────────────────────────────────────────────

export const DashboardSummaryCards = React.memo(function DashboardSummaryCards({
  analytics,
  filteredVehicles = [],
  currentFilters = {},
  hasActiveFilters = false,
  statusSizeBreakdown = {},
  onSizeCardClick,
  onConditionCardClick,
  onStatusCardClick,
  onRepairsCardClick,
  onStatusSizeFilter,
  onClearFilters,
  onCheckIn,
  mobileFiltersBadge = 0,
  onMobileFiltersOpen,
  viewMode,
  onViewModeChange,
  checkedOutSlot,
  yardTabSlot,
  onlyTotal = false,
  className = '',
}: DashboardSummaryCardsProps) {

  const t = useT()
  // Desktop strip segments (Total-only when the desktop tabbed view asks for it).
  const desktopSegments = onlyTotal ? SEGMENTS.filter(s => s.key === 'total') : SEGMENTS

  // 🎤 Long-press on the Check In button opens the voice overlay.
  // Single hook instance shared by both the desktop and mobile buttons —
  // the user can only press one at a time per breakpoint.
  const voiceHold = useCheckInLongPress(onCheckIn)

  // ── Derive counts ────────────────────────────────────────────────────────────
  // When filters are active we count from the filtered set; otherwise use analytics

  const totalCount = filteredVehicles.length || analytics.totalCount || 0

  const readyCount = useMemo(() => {
    if (hasActiveFilters && filteredVehicles.length > 0)
      return filteredVehicles.filter(v => v.status === 'Ready').length
    return analytics.readyCount || 0
  }, [hasActiveFilters, filteredVehicles, analytics.readyCount])

  const pendingCount = useMemo(() => {
    if (hasActiveFilters && filteredVehicles.length > 0)
      return filteredVehicles.filter(
        v => v.status === 'Pending Checks' || v.status === 'Pending'
      ).length
    return analytics.pendingChecksCount || analytics.needsCheckingCount || 0
  }, [hasActiveFilters, filteredVehicles, analytics.pendingChecksCount, analytics.needsCheckingCount])

  const repairsCount = useMemo(() => {
    if (hasActiveFilters && filteredVehicles.length > 0)
      return filteredVehicles.filter(
        v => v.status === 'Repairs Needed' || v.status === 'Repairs'
      ).length
    return analytics.repairsNeededCount || 0
  }, [hasActiveFilters, filteredVehicles, analytics.repairsNeededCount])

  const countByKey: Record<SegmentKey, number> = {
    total:   totalCount,
    ready:   readyCount,
    pending: pendingCount,
    repairs: repairsCount,
  }

  // ── Active segment detection ─────────────────────────────────────────────────
  // Highlight the segment whose status matches the current filter

  const activeSegmentKey = useMemo((): SegmentKey | null => {
    if (!hasActiveFilters) return null
    const s = currentFilters.status
    if (!s) return null
    if (s === 'Ready') return 'ready'
    if (s === 'Pending Checks' || s === 'Pending') return 'pending'
    if (s === 'Repairs Needed' || s === 'Repairs') return 'repairs'
    return null
  }, [hasActiveFilters, currentFilters.status])

  // ── Handler map ──────────────────────────────────────────────────────────────

  const handlers: Record<string, (() => void) | undefined> = {
    onSizeCardClick,
    onStatusCardClick,
    onRepairsCardClick,
  }

  // ── Filter badge text ────────────────────────────────────────────────────────

  const filterBadgeText = useMemo(() => {
    const parts: string[] = []
    if (currentFilters.size)      parts.push(currentFilters.size)
    if (currentFilters.condition) parts.push(currentFilters.condition)
    if (currentFilters.status)    parts.push(currentFilters.status)
    if (currentFilters.search)    parts.push(`"${currentFilters.search}"`)
    if (currentFilters.motExpiring) parts.push(t('dashboard.summary.motExpiringBadge'))
    if (currentFilters.dateFrom || currentFilters.dateTo) {
      const d = [currentFilters.dateFrom, currentFilters.dateTo].filter(Boolean)
      parts.push(d.length === 1 ? t('dashboard.summary.fromDate', { date: d[0] as string }) : `${d[0]} → ${d[1]}`)
    }
    return parts.length > 0 ? parts.join(' · ') : t('dashboard.summary.filteredFallback')
  }, [currentFilters, t])

  // ── Progress bar (ready %) ───────────────────────────────────────────────────

  const readyPct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className={`w-full ${className}`}>

      {/* ── DESKTOP: single row ────────────────────────────────────────────────── */}
      <div className="hidden sm:flex items-center gap-1.5 flex-wrap">

        {desktopSegments.map(seg => {
          const count    = countByKey[seg.key]
          const isActive = activeSegmentKey === seg.key
          const handler  = handlers[seg.handler]
          const segLabel = t(SEG_LABEL_KEY[seg.key] ?? '') || seg.label

          return (
            <button
              key={seg.key}
              onClick={handler}
              aria-label={t('dashboard.summary.filterByAria', { label: segLabel })}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5
                rounded-full border text-xs font-semibold
                transition-all duration-150 select-none
                ${isActive ? seg.activeStyle : seg.defaultStyle}
              `}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.dotColor }} />
              <span>{segLabel}</span>
              <span className="ml-0.5 min-w-[1.1rem] h-4 flex items-center justify-center rounded-full text-[10px] font-bold bg-[#e8f0eb] dark:bg-white/10 text-[#025940] dark:text-white/80 px-1">
                {count}
              </span>
            </button>
          )
        })}

        {/* progress bar */}
        {totalCount > 0 && !onlyTotal && (
          <div className="flex items-center gap-1.5 ml-1 text-[10px] text-[#8a9e94] dark:text-white/40 font-medium" title={t('dashboard.summary.readyPctTitle', { readyPct })}>
            <div className="w-20 h-1.5 rounded-full bg-[#e2e8e5] dark:bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-[#4ade80] transition-all duration-500" style={{ width: `${readyPct}%` }} />
            </div>
            <span>{readyPct}%</span>
          </div>
        )}

        {/* ── Checked-out pill — desktop only, inline ───────────────────────── */}
        {checkedOutSlot && (
          <div className="flex-shrink-0">
            {checkedOutSlot}
          </div>
        )}

        {/* active filter badge + clear */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="hidden sm:inline text-[10px] font-medium text-[#4a5e54] dark:text-[#b3f243]/70 max-w-[160px] truncate" title={filterBadgeText}>
              {filterBadgeText}
            </span>
            {onClearFilters && (
              <button
                onClick={onClearFilters}
                aria-label={t('dashboard.summary.clearAllFiltersAria')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-red-400/30 bg-red-500/10 text-red-400 text-[10px] font-semibold hover:bg-red-500/20 transition-all duration-150"
              >
                <X className="w-2.5 h-2.5" />
                <span>{t('dashboard.summary.clearButton')}</span>
              </button>
            )}
          </div>
        )}

        {/* notes + check-in (check-in hidden in the desktop Total-only strip —
            the tabbed view uses a floating check-in button instead) */}
        <div className={`flex items-center gap-2 ${hasActiveFilters ? '' : 'ml-auto'}`}>
          <UserNotesButton />
          {onCheckIn && !onlyTotal && (
            <button
              {...voiceHold.bind}
              aria-label={t('dashboard.summary.checkInVehicleAria')}
              title={t('dashboard.summary.checkInVehicleAria')}
              className={`flex-shrink-0 w-9 h-9 rounded-full shadow-md hover:shadow-lg transition-all duration-150 active:scale-95 bg-transparent border-none p-0 ${voiceHold.pressing ? 'ring-4 ring-[#b3f243]/70 scale-110' : 'hover:scale-105'}`}
            >
              <img src="/Check In Button/check-in-button.png" alt={t('dashboard.summary.checkInImgAlt')} className="w-full h-full object-contain" />
            </button>
          )}
        </div>

      </div>

      {/* ── MOBILE: single row — summary cards/filters scroll, notes+check-in pinned ── */}
      <div className="sm:hidden">

        <div className="flex items-center gap-1.5">

          {/* Scrollable group: summary pills + clear + checked-out + yard tab */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SEGMENTS.map(seg => {
            const count    = countByKey[seg.key]
            const isActive = activeSegmentKey === seg.key
            const handler  = handlers[seg.handler]
            const segLabel = t(SEG_LABEL_KEY[seg.key] ?? '') || seg.label

            return (
              <button
                key={seg.key}
                onClick={handler}
                aria-label={t('dashboard.summary.filterByAria', { label: segLabel })}
                className={`
                  inline-flex items-center gap-1 px-2.5 py-1.5 flex-shrink-0
                  rounded-full border text-xs font-semibold
                  transition-all duration-150 select-none
                  ${isActive ? seg.activeStyle : seg.defaultStyle}
                `}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.dotColor }} />
                <span className="ml-0.5 min-w-[1rem] h-4 flex items-center justify-center rounded-full text-[10px] font-bold bg-[#e8f0eb] dark:bg-white/10 text-[#025940] dark:text-white/80 px-1">
                  {count}
                </span>
              </button>
            )
          })}

          {/* clear on mobile */}
          {hasActiveFilters && onClearFilters && (
            <button onClick={onClearFilters} aria-label={t('dashboard.summary.clearAllFiltersAria')} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-red-400/30 bg-red-500/10 text-red-400 text-[10px] font-semibold flex-shrink-0">
              <X className="w-2.5 h-2.5" />
              {t('dashboard.summary.clearButton')}
            </button>
          )}

          {/* checked-out pill — same row as pills on mobile */}
          {checkedOutSlot && (
            <div className="flex-shrink-0">
              {checkedOutSlot}
            </div>
          )}

          {/* yard tab toggle (In Yard / On Hire) — mobile only slot */}
          {yardTabSlot && (
            <div className="flex-shrink-0">
              {yardTabSlot}
            </div>
          )}

          </div>{/* end scrollable summary/filters group */}

          {/* notes + check-in — pinned on the same row as the summary cards/filters */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <UserNotesButton />
            {onCheckIn && (
              <button
                {...voiceHold.bind}
                aria-label="Check in vehicle"
                title="Check in vehicle (hold 3s for voice)"
                className={`flex-shrink-0 w-9 h-9 rounded-full shadow-md hover:shadow-lg transition-all duration-150 active:scale-95 bg-transparent border-none p-0 ${voiceHold.pressing ? 'ring-4 ring-[#b3f243]/70 scale-110' : 'hover:scale-105'}`}
              >
                <img src="/Check In Button/check-in-button.png" alt="Check in" className="w-full h-full object-contain" />
              </button>
            )}
          </div>
        </div>{/* end mobile single row */}

      </div>
    </div>
  )
})

DashboardSummaryCards.displayName = 'DashboardSummaryCards'