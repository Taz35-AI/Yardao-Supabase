// src/components/features/service-bookings/BayGrid.tsx
// Hourly bay-grid view of a single day's internal service bookings.
//
// Layout:
//   - Column 1: hourly time labels (08:00, 09:00, ...)
//   - Columns 2..N+1: one per service bay
//   - Optional column N+2: "Unassigned" — only shown if any booking
//     lacks a serviceBay number.
//
// Bookings are positioned with PIXEL precision (absolute) inside each bay
// column so a 08:30 start lands at exactly the 08:30 line, regardless of
// duration. A 1.5h booking is 1.5 × HOUR_HEIGHT tall; a 3h booking is 3 ×
// HOUR_HEIGHT tall, etc.
//
// External-provider bookings and synthetic garage entries should be filtered
// OUT by the caller — they don't occupy bays.

'use client'

import React from 'react'
import { Plus } from 'lucide-react'
import type { ServiceBooking } from '@/types/serviceBookings'
import { useT, localizeWorkRequired } from '@/lib/i18n'

// ── Time-axis constants ─────────────────────────────────────────────────────
const HOUR_RANGE_START = 8     // 08:00
const HOUR_RANGE_END   = 21    // 21:00 (so the last 19:00-20:30 slot fits)
const HOUR_HEIGHT_PX   = 60    // 1 hour = 60px → 30 min = 30px → 1.5h = 90px
const TOTAL_HOURS      = HOUR_RANGE_END - HOUR_RANGE_START
const BODY_HEIGHT_PX   = TOTAL_HOURS * HOUR_HEIGHT_PX
const RANGE_START_MIN  = HOUR_RANGE_START * 60

const DEFAULT_SLOT_MINUTES = 90 // 1.5h — Phase 1 assumption.

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeMinutes(hhmm: string): number {
  const parts = hhmm.split(':')
  const h = Number(parts[0])
  const m = Number(parts[1] || 0)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

function parseSlotStartMinutes(timeSlot: string): number {
  const start = (timeSlot || '').split('-')[0]?.trim() || '00:00'
  return parseTimeMinutes(start)
}

function formatMinutesAsHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatWorkRequired(work: string | string[]): string {
  if (Array.isArray(work)) return work.join(', ')
  return work || 'Service'
}

function getStatusBorderColor(status: string): string {
  switch (status) {
    case 'in-progress':          return '#f59e0b'   // amber
    case 'completed':            return '#10b981'   // emerald
    case 'cancelled':            return '#8a9e94'   // muted
    case 'checked_in_to_garage': return '#72A68E'   // brand teal
    case 'scheduled':
    default:                     return '#0ea5e9'   // sky
  }
}

function getBookingDurationMin(booking: ServiceBooking): number {
  const span = Math.max(1, booking.slotCount ?? 1)
  return span * DEFAULT_SLOT_MINUTES
}

// Convert minutes-from-midnight to a pixel y-offset within the body column.
function minutesToPx(minutes: number): number {
  const offsetMin = minutes - RANGE_START_MIN
  return (offsetMin / 60) * HOUR_HEIGHT_PX
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface BayGridProps {
  bayCount: number
  bookings: ServiceBooking[]
  onCellClick: () => void
  onBookingClick: (b: ServiceBooking) => void
}

// ── Sub-component: a single bay column body with bookings + hour lines ──

interface BayColumnProps {
  bayIndex: number          // 0..bayCount-1, or -1 for unassigned
  bookings: ServiceBooking[]
  onCellClick: () => void
  onBookingClick: (b: ServiceBooking) => void
  isLastCol: boolean
}

const BayColumn: React.FC<BayColumnProps> = ({
  bayIndex, bookings, onCellClick, onBookingClick, isLastCol,
}) => {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onCellClick}
      className={`relative ${isLastCol ? '' : 'border-r border-[#e2e8e5] dark:border-[#025940]/30'} bg-white dark:bg-[#012619]/40 hover:bg-[#C5D9D0]/10 dark:hover:bg-[#025940]/15 transition-colors cursor-pointer text-left`}
      style={{ height: `${BODY_HEIGHT_PX}px` }}
      aria-label="Add booking"
    >
      {/* Hour gridlines (drawn at 1h intervals, thick) and half-hour lines (thin) */}
      {Array.from({ length: TOTAL_HOURS * 2 + 1 }).map((_, i) => {
        const isHour = i % 2 === 0
        return (
          <div
            key={`line-${i}`}
            className={`absolute left-0 right-0 pointer-events-none ${
              isHour
                ? 'border-t border-[#e2e8e5] dark:border-[#025940]/30'
                : 'border-t border-dashed border-[#e2e8e5]/50 dark:border-[#025940]/15'
            }`}
            style={{ top: `${(i / 2) * HOUR_HEIGHT_PX}px` }}
          />
        )
      })}

      {/* Booking blocks for this bay */}
      {bookings.map(booking => {
        const startMin = parseSlotStartMinutes(booking.timeSlot)
        const durMin   = getBookingDurationMin(booking)
        const top      = minutesToPx(startMin)
        const height   = (durMin / 60) * HOUR_HEIGHT_PX
        const borderColor = getStatusBorderColor(booking.status)
        const startLabel = formatMinutesAsHHMM(startMin)
        const endLabel   = formatMinutesAsHHMM(startMin + durMin)

        return (
          <div
            key={booking.id}
            onClick={(e) => {
              e.stopPropagation()
              onBookingClick(booking)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onBookingClick(booking)
              }
            }}
            className="absolute left-1 right-1 rounded-md bg-white dark:bg-[#012619]/90 shadow-sm border border-[#e2e8e5] dark:border-[#025940]/40 hover:shadow-md hover:z-10 transition-all overflow-hidden cursor-pointer"
            style={{ top: `${top}px`, height: `${height}px` }}
          >
            <span
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
              style={{ backgroundColor: borderColor }}
            />
            <div className="ml-2 mr-1 py-1 h-full flex flex-col">
              <div className="flex items-baseline justify-between gap-1">
                <div className="text-[12.5px] font-bold text-[#012619] dark:text-white truncate leading-tight">
                  {booking.registration}
                </div>
                <div className="text-[9px] text-[#8a9e94] tabular-nums flex-shrink-0 leading-tight">
                  {startLabel}–{endLabel}
                </div>
              </div>
              <div className="text-[11px] text-[#5a6c64] dark:text-[#C5D9D0]/70 truncate leading-tight">
                {localizeWorkRequired(t, booking.workRequired, t('serviceBookings.workFallback.service'), ', ')}
              </div>
              {booking.assignedMechanicName && height >= HOUR_HEIGHT_PX && (
                <div className="text-[10px] text-[#8a9e94] truncate leading-tight mt-auto">
                  {booking.assignedMechanicName}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </button>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function BayGrid({ bayCount, bookings, onCellClick, onBookingClick }: BayGridProps) {
  // Split bookings by bay (1-based) and into an "unassigned" bucket
  const byBay: ServiceBooking[][] = Array.from({ length: bayCount }, () => [])
  const unassigned: ServiceBooking[] = []
  for (const b of bookings) {
    const bay = b.serviceBay
    if (bay && bay >= 1 && bay <= bayCount) byBay[bay - 1].push(b)
    else unassigned.push(b)
  }
  const hasUnassigned = unassigned.length > 0
  const totalCols = bayCount + (hasUnassigned ? 1 : 0)

  return (
    <div className="rounded-xl border border-[#e2e8e5] dark:border-[#025940]/40 bg-white dark:bg-[#012619]/60 overflow-hidden">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `60px repeat(${bayCount}, minmax(140px, 1fr))${hasUnassigned ? ' 120px' : ''}`,
        }}
      >
        {/* ── Header row ────────────────────────────────────────────────── */}
        <div className="bg-[#f5f9f7] dark:bg-[#012619]/80 border-b border-r border-[#e2e8e5] dark:border-[#025940]/40 px-2 py-2 flex items-center justify-center text-[10px] uppercase tracking-widest font-bold text-[#8a9e94]">
          Time
        </div>
        {Array.from({ length: bayCount }, (_, i) => (
          <div
            key={`bay-h-${i}`}
            className="bg-[#f5f9f7] dark:bg-[#012619]/80 border-b border-r border-[#e2e8e5] dark:border-[#025940]/40 px-2 py-2 flex items-center justify-center text-[11px] uppercase tracking-widest font-bold text-[#025940] dark:text-[#72A68E]"
          >
            Bay {i + 1}
          </div>
        ))}
        {hasUnassigned && (
          <div className="bg-[#f5f9f7] dark:bg-[#012619]/80 border-b border-[#e2e8e5] dark:border-[#025940]/40 px-2 py-2 flex items-center justify-center text-[11px] uppercase tracking-widest font-bold text-[#8a9e94]">
            Unassigned
          </div>
        )}

        {/* ── Time-label column (relative, absolute-positioned labels) ──── */}
        <div
          className="relative bg-[#fafbfa] dark:bg-[#012619]/50 border-r border-[#e2e8e5] dark:border-[#025940]/30"
          style={{ height: `${BODY_HEIGHT_PX}px` }}
        >
          {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => {
            const hourMinutes = (HOUR_RANGE_START + i) * 60
            const top = i * HOUR_HEIGHT_PX
            return (
              <div
                key={`hour-${i}`}
                className="absolute left-0 right-0 text-[11px] font-medium text-[#5a6c64] dark:text-[#C5D9D0]/70 tabular-nums text-right pr-2 leading-none pointer-events-none"
                style={{
                  top: `${top}px`,
                  transform: 'translateY(-50%)', // centre the label on the gridline
                }}
              >
                <span className="bg-[#fafbfa] dark:bg-[#012619]/80 px-1">
                  {formatMinutesAsHHMM(hourMinutes)}
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Bay columns (relative, absolute-positioned bookings) ──────── */}
        {Array.from({ length: bayCount }, (_, i) => (
          <BayColumn
            key={`bay-col-${i}`}
            bayIndex={i}
            bookings={byBay[i]}
            onCellClick={onCellClick}
            onBookingClick={onBookingClick}
            isLastCol={!hasUnassigned && i === bayCount - 1}
          />
        ))}

        {hasUnassigned && (
          <BayColumn
            key="bay-col-unassigned"
            bayIndex={-1}
            bookings={unassigned}
            onCellClick={onCellClick}
            onBookingClick={onBookingClick}
            isLastCol={true}
          />
        )}
      </div>
    </div>
  )
}
