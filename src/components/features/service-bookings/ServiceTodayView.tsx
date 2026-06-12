// src/components/features/service-bookings/ServiceTodayView.tsx
// REDESIGNED UI — matches target screenshot aesthetic
// All logic preserved: Check In / Return / Complete / Done / Edit / Delete / showDate
// ✅ ADDITIONS:
//   - Notes displayed at-a-glance on each booking card
//   - "Added by" attribution (name + date) shown on each card
//   - "At External Garage" section is collapsible via chevron (collapsed by default)
'use client'

import React, { useState } from 'react'
import {
  RotateCcw, Clock, MapPin, Wrench,
  Edit2, Trash2, Plus, ChevronDown,
  LayoutGrid, List, Package,
} from 'lucide-react'
import { ServiceBooking } from '@/types/serviceBookings'
import { useT, useLang, localizeWorkRequired } from '@/lib/i18n'
import { BookingDetailsModal } from './BookingDetailsModal'
import { JobPartsModal } from './JobPartsModal'
import { BayGrid } from './BayGrid'
import { useMechanics } from '@/hooks/useMechanics'
import { useServiceBookings } from '@/hooks/useServiceBookings'
import { useBranches } from '@/hooks/useBranches'
import { DEFAULT_SERVICE_BAY_COUNT } from '@/types/branch'
import { getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'

interface ServiceTodayViewProps {
  selectedDate: Date
  bookings: ServiceBooking[]
  onMarkCompleted: (booking: ServiceBooking) => void
  onStartBooking: (booking: ServiceBooking) => void
  onReturnFromGarage: (booking: ServiceBooking) => void
  onCheckInToGarage: (booking: ServiceBooking) => void
  onBookingEdit: (booking: ServiceBooking) => void
  onBookingDelete: (bookingId: string) => void
  onAddBooking: (date: Date) => void
  viewFilter: 'today' | 'all' | 'workshop'
  onViewFilterChange: (filter: 'today' | 'all' | 'workshop') => void
  /** Optional render slot used when viewFilter === 'workshop'. The parent
   *  controls what to show in workshop mode (typically the bay × time
   *  grid). When omitted, workshop mode falls back to the booking list. */
  workshopContent?: React.ReactNode
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(timeStr: string): string {
  if (!timeStr) return ''
  return timeStr.split('-')[0]?.trim() || timeStr
}

function formatEndTime(timeStr: string): string {
  if (!timeStr) return ''
  return timeStr.split('-')[1]?.trim() || ''
}

function formatWorkRequired(work: string | string[], t: ReturnType<typeof useT>): string {
  return localizeWorkRequired(t, work, t('serviceBookings.workFallback.service'))
}

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isSyntheticGarageVehicle(booking: ServiceBooking): boolean {
  return !!(booking as any).isGarageVehicle || booking.id.startsWith('garage-')
}

function accentBar(status: string, isExternal: boolean): string {
  if (isExternal || status === 'checked_in_to_garage') return 'bg-[#72A68E]'
  switch (status) {
    case 'in-progress': return 'bg-amber-400'
    case 'completed':   return 'bg-emerald-400'
    default:            return 'bg-sky-400'
  }
}

// Safely converts a Firestore Timestamp, Date, or string to a readable date string
function formatAddedDate(createdAt: any, locale: string): string {
  if (!createdAt) return ''
  try {
    const d = createdAt instanceof Date
      ? createdAt
      : typeof createdAt.toDate === 'function'
        ? createdAt.toDate()
        : new Date(createdAt)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function StatusPill({ status, isExternal }: { status: string; isExternal: boolean }) {
  const t = useT()
  const base = 'text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide'
  if (isExternal && status === 'checked_in_to_garage')
    return <span className={`${base} bg-[#72A68E]/20 text-[#025940] dark:bg-[#72A68E]/20 dark:text-[#72A68E]`}>{t('serviceBookings.today.statusPillAtGarage')}</span>
  if (isExternal)
    return <span className={`${base} bg-[#025940]/10 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]`}>{t('serviceBookings.today.statusPillScheduled')}</span>
  switch (status) {
    case 'in-progress':
      return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>{t('serviceBookings.today.statusPillInProgress')}</span>
    case 'completed':
      return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>{t('serviceBookings.today.statusPillCompleted')}</span>
    default:
      return <span className={`${base} bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300`}>{t('serviceBookings.today.statusPillScheduled')}</span>
  }
}

function getBayBadge(bay: number): string {
  if (bay === 1) return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
  if (bay === 2) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
}

// ─── Booking Card ─────────────────────────────────────────────────────────────
function BookingCard({
  booking,
  onMarkCompleted,
  onReturnFromGarage,
  onCheckInToGarage,
  onBookingEdit,
  onBookingDelete,
  showDate = false,
}: {
  booking: ServiceBooking
  onMarkCompleted: (b: ServiceBooking) => void
  onReturnFromGarage: (b: ServiceBooking) => void
  onCheckInToGarage: (b: ServiceBooking) => void
  onBookingEdit: (b: ServiceBooking) => void
  onBookingDelete: (id: string) => void
  showDate?: boolean
}) {
  const t = useT()
  const { locale } = useLang()
  const [menuOpen, setMenuOpen] = useState(false)
  // 👁️ Row click opens read-only details (notes, comments, mechanic, etc).
  // Editing is still reachable via the dedicated Edit button on the card.
  const [detailsOpen, setDetailsOpen] = useState(false)
  // 🧩 Live job-parts capture — record the parts used on this job while it's
  // open. Internal jobs only (external garages supply their own parts).
  const [partsOpen, setPartsOpen] = useState(false)

  const isExternal  = !!booking.isExternalProvider
  const isSynthetic = isSyntheticGarageVehicle(booking)
  const showParts   = !isExternal && !isSynthetic

  // 👤 Inline mechanic quick-assign on each card. Shared logic with the
  // "Upcoming" panel: stopPropagation prevents the row click from also
  // opening the details modal when interacting with the dropdown.
  const { mechanics } = useMechanics()
  const { updateBooking } = useServiceBookings()
  const handleMechanicChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation()
    if (!booking.id) return
    const id = e.target.value
    if (!id) {
      await updateBooking(booking.id, {
        assignedMechanicId: null,
        assignedMechanicName: null,
      })
      return
    }
    const picked = mechanics.find(m => m.uid === id)
    await updateBooking(booking.id, {
      assignedMechanicId: id,
      assignedMechanicName: picked?.displayName || picked?.email || 'Unknown',
    })
  }

  const startTime = isExternal
    ? (booking.externalProvider?.customTime || t('serviceBookings.today.externalAllDay'))
    : formatTime(booking.timeSlot)
  // 🕐 Multi-slot aware: end time reflects the booking's full span. Falls
  // back to the standard slot's end for single-slot bookings.
  const span = Math.max(1, booking.slotCount ?? 1)
  const endTime = isExternal
    ? ''
    : (() => {
        const computed = getBookingEndTime(booking.timeSlot, span)
        return computed || formatEndTime(booking.timeSlot)
      })()

  const work        = formatWorkRequired(booking.workRequired, t)
  const vehicleName = [booking.make, booking.model].filter(Boolean).join(' ') || ''

  // Attribution — strip email domain if no display name was set
  const rawAddedBy = (booking as any).createdByName as string | undefined
  const addedBy    = rawAddedBy?.includes('@') ? rawAddedBy.split('@')[0] : rawAddedBy
  const addedDate  = formatAddedDate((booking as any).createdAt, locale)
  const notes      = (booking as any).notes as string | undefined

  // ── Action logic (all preserved) ──────────────────────────────────────────
  const alreadyAtGarage = isSynthetic || booking.status === 'checked_in_to_garage'
  const showCheckIn  = isExternal && !alreadyAtGarage && booking.status === 'scheduled'
  const showReturn   = isExternal && alreadyAtGarage
  const showComplete = !isExternal && (booking.status === 'scheduled' || booking.status === 'in-progress')
  const showDone     = booking.status === 'completed' && !isExternal

  return (
    <div
      className={`
        relative flex flex-col
        bg-white dark:bg-gray-800/70
        rounded-xl border border-gray-100 dark:border-gray-700/60
        shadow-sm hover:shadow-md transition-shadow duration-150
        overflow-hidden
        ${!isSynthetic ? 'cursor-pointer' : 'cursor-default'}
      `}
      onClick={() => { if (!isSynthetic) setDetailsOpen(true) }}
    >
      {/* ── Top row: accent bar + time + content + desktop actions ── */}
      <div className="flex items-stretch">

        {/* Left accent bar */}
        <div className={`w-1 flex-shrink-0 ${accentBar(booking.status, isExternal)}`} />

        {/* Time column */}
        <div className="flex-shrink-0 w-[60px] sm:w-[64px] flex flex-col items-end justify-center px-2 py-3 border-r border-gray-100 dark:border-gray-700/50">
          {showDate && (
            <span className="text-[9px] font-black text-[#025940] dark:text-[#72A68E] uppercase tracking-wide mb-0.5 leading-none">
              {new Date(booking.date + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </span>
          )}
          <span className="text-[13px] font-black text-gray-800 dark:text-white leading-tight">{startTime}</span>
          {endTime && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{endTime}</span>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 px-3 py-2.5">

          {/* Reg + vehicle name + status pill */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="bg-yellow-300 border border-yellow-400/70 text-gray-900 text-[11px] font-black px-2 py-0.5 rounded font-mono tracking-widest flex-shrink-0">
              {booking.registration}
            </span>
            {vehicleName && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{vehicleName}</span>
            )}
            <span className="ml-auto flex-shrink-0">
              <StatusPill status={booking.status} isExternal={isExternal} />
            </span>
          </div>

          {/* Work */}
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1">{work}</p>

          {/* Tags row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {isExternal && booking.externalProvider?.garageName && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#025940] dark:text-[#72A68E]">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {booking.externalProvider.garageName}
              </span>
            )}
            {booking.serviceBay && !isExternal && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${getBayBadge(booking.serviceBay)}`}>
                {t('serviceBookings.today.bayBadge', { bay: booking.serviceBay })}
              </span>
            )}
            {/* 🕐 Multi-slot indicator */}
            {!isExternal && span > 1 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {t('serviceBookings.today.slotsBadge', { count: span })}
              </span>
            )}
            {work.toLowerCase().includes('mot') && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                {t('serviceBookings.today.motDue')}
              </span>
            )}
            {/* 👤 Mechanic — inline quick-assign. Only renders when the org
                has at least one mechanic; synthetic garage entries skip this
                because they're not real bookings yet. */}
            {!isSynthetic && mechanics.length > 0 && (
              <select
                value={booking.assignedMechanicId || ''}
                onChange={handleMechanicChange}
                onClick={e => e.stopPropagation()}
                className="text-[10px] px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[140px]"
                title={booking.assignedMechanicName ? t('serviceBookings.today.mechanicAssignedTitle', { name: booking.assignedMechanicName }) : t('serviceBookings.today.assignMechanicTitle')}
              >
                <option value="">{t('serviceBookings.today.mechanicPlaceholder')}</option>
                {booking.assignedMechanicId &&
                  !mechanics.some(m => m.uid === booking.assignedMechanicId) && (
                    <option value={booking.assignedMechanicId}>
                      {booking.assignedMechanicName || t('serviceBookings.today.formerMechanic')}
                    </option>
                  )}
                {mechanics.map(m => (
                  <option key={m.uid} value={m.uid}>
                    {m.displayName || m.email}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Notes — bolder and clearly visible ── */}
          {notes && notes.trim().length > 0 && (
            <p className="text-[12px] font-semibold text-gray-600 dark:text-gray-300 italic mt-1.5 leading-snug line-clamp-2">
              "{notes.trim()}"
            </p>
          )}

          {/* ── Added by attribution ── */}
          {addedBy && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-medium">
              {t('serviceBookings.today.addedBy', {
                name: addedBy,
                onDate: addedDate ? t('serviceBookings.today.addedOnDate', { date: addedDate }) : '',
              })}
            </p>
          )}
        </div>

        {/* ── Desktop actions (hidden on mobile, shown sm+) ── */}
        <div
          className="hidden sm:flex flex-shrink-0 items-center gap-1 px-2"
          onClick={e => e.stopPropagation()}
        >
          {showCheckIn && (
            <button
              onClick={() => onCheckInToGarage(booking)}
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-[11px] font-black px-2.5 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap"
            >
              <img src="/external.svg" alt="" className="w-3.5 h-3.5 object-contain" />
              {t('serviceBookings.action.checkIn')}
            </button>
          )}
          {showReturn && (
            <button
              onClick={() => onReturnFromGarage(booking)}
              className="flex items-center gap-1.5 bg-[#025940] hover:bg-[#013a29] active:scale-95 text-[#b3f243] text-[11px] font-black px-2.5 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('serviceBookings.action.return')}
            </button>
          )}
          {showComplete && (
            <button
              onClick={() => onMarkCompleted(booking)}
              className="flex items-center gap-1.5 bg-[#025940] hover:bg-[#013a29] active:scale-95 text-white text-[11px] font-black px-2.5 py-1.5 rounded-lg transition-all shadow-sm whitespace-nowrap"
            >
              <img src="/completed.svg" alt="" className="w-3.5 h-3.5 object-contain" />
              {t('serviceBookings.action.complete')}
            </button>
          )}
          {showDone && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-black pr-1">
              <img src="/completed.svg" alt="" className="w-4 h-4 object-contain" />
              {t('serviceBookings.action.done')}
            </span>
          )}
          {showParts && (
            <button
              onClick={() => setPartsOpen(true)}
              className="flex items-center gap-1.5 text-[#025940] dark:text-[#72A68E] border border-[#025940]/25 dark:border-[#72A68E]/30 hover:bg-[#025940]/8 dark:hover:bg-[#025940]/20 active:scale-95 text-[11px] font-black px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap"
              title={t('stock.jobParts.title')}
            >
              <Package className="w-3.5 h-3.5" />
              {t('stock.jobParts.buttonLabel')}
            </button>
          )}
          <div className="flex items-center gap-1">
            {!isSynthetic && (
              <button
                onClick={() => onBookingEdit(booking)}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-gray-400 hover:text-[#025940] dark:hover:text-[#72A68E] hover:bg-[#025940]/8 dark:hover:bg-[#025940]/20 rounded-lg transition-colors"
                title={t('serviceBookings.action.edit')}
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>{t('serviceBookings.action.edit')}</span>
              </button>
            )}
            <button
              onClick={() => onBookingDelete(booking.id)}
              className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title={t('serviceBookings.action.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('serviceBookings.action.delete')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile actions (shown below content on small screens only) ── */}
      <div
        className="flex sm:hidden items-center gap-2 px-3 pb-2.5 pt-0"
        onClick={e => e.stopPropagation()}
      >
        {showCheckIn && (
          <button
            onClick={() => onCheckInToGarage(booking)}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-[11px] font-black px-3 py-1.5 rounded-lg transition-all shadow-sm"
          >
            <img src="/external.svg" alt="" className="w-3.5 h-3.5 object-contain" />
            {t('serviceBookings.action.checkIn')}
          </button>
        )}
        {showReturn && (
          <button
            onClick={() => onReturnFromGarage(booking)}
            className="flex items-center gap-1.5 bg-[#025940] hover:bg-[#013a29] active:scale-95 text-[#b3f243] text-[11px] font-black px-3 py-1.5 rounded-lg transition-all shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('serviceBookings.action.return')}
          </button>
        )}
        {showComplete && (
          <button
            onClick={() => onMarkCompleted(booking)}
            className="flex items-center gap-1.5 bg-[#025940] hover:bg-[#013a29] active:scale-95 text-white text-[11px] font-black px-3 py-1.5 rounded-lg transition-all shadow-sm"
          >
            <img src="/completed.svg" alt="" className="w-3.5 h-3.5 object-contain" />
            {t('serviceBookings.action.complete')}
          </button>
        )}
        {showDone && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-black">
            <img src="/completed.svg" alt="" className="w-4 h-4 object-contain" />
            {t('serviceBookings.action.done')}
          </span>
        )}
        {showParts && (
          <button
            onClick={() => setPartsOpen(true)}
            className="flex items-center gap-1.5 text-[#025940] dark:text-[#72A68E] border border-[#025940]/25 dark:border-[#72A68E]/30 hover:bg-[#025940]/8 active:scale-95 text-[11px] font-black px-3 py-1.5 rounded-lg transition-all"
            title={t('stock.jobParts.title')}
          >
            <Package className="w-3.5 h-3.5" />
            {t('stock.jobParts.buttonLabel')}
          </button>
        )}
        {/* Spacer pushes edit/delete to the right */}
        <div className="flex-1" />
        {!isSynthetic && (
          <button
            onClick={() => onBookingEdit(booking)}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-gray-400 hover:text-[#025940] dark:hover:text-[#72A68E] hover:bg-[#025940]/8 rounded-lg transition-colors"
            title={t('serviceBookings.action.edit')}
          >
            <Edit2 className="w-3.5 h-3.5" />
            {t('serviceBookings.action.edit')}
          </button>
        )}
        <button
          onClick={() => onBookingDelete(booking.id)}
          className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title={t('serviceBookings.action.delete')}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('serviceBookings.action.delete')}
        </button>
      </div>

      {/* 👁️ Read-only details popup. Edit button inside delegates to the
          parent's edit handler (same as the card-level Edit button) so a
          user can switch from "view" to "edit" in one click. */}
      <BookingDetailsModal
        booking={booking}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onEdit={onBookingEdit}
      />

      {/* 🧩 Live job-parts capture popup (internal jobs only). */}
      {showParts && (
        <JobPartsModal
          booking={booking}
          isOpen={partsOpen}
          onClose={() => setPartsOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Collapsible External Garage Section ──────────────────────────────────────
// Collapsed by default so garage vehicles don't visually dominate the list.
// Shows a count pill when closed; expands to full cards on tap.
function CollapsibleGarageSection({
  bookings,
  onMarkCompleted,
  onReturnFromGarage,
  onCheckInToGarage,
  onBookingEdit,
  onBookingDelete,
  showDate = false,
}: {
  bookings: ServiceBooking[]
  onMarkCompleted: (b: ServiceBooking) => void
  onReturnFromGarage: (b: ServiceBooking) => void
  onCheckInToGarage: (b: ServiceBooking) => void
  onBookingEdit: (b: ServiceBooking) => void
  onBookingDelete: (id: string) => void
  showDate?: boolean
}) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)

  if (bookings.length === 0) return null

  return (
    <div className="space-y-1.5">
      {/* ── Clickable section header with chevron ── */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center gap-2 px-0.5 group"
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#72A68E]" />
        <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.12em]">
          {t('serviceBookings.today.garageSectionTitle')}
        </span>
        <span className="text-[10px] font-bold text-gray-300 dark:text-gray-600">{bookings.length}</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700/60" />
        <ChevronDown
          className={`
            w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0
            transition-transform duration-200
            ${isOpen ? 'rotate-180' : ''}
          `}
        />
      </button>

      {/* ── Collapsed summary pill ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 ml-4 px-3 py-2 rounded-lg bg-[#72A68E]/10 border border-[#72A68E]/20 hover:bg-[#72A68E]/20 transition-colors w-full text-left"
        >
          <img src="/external.svg" alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
          <span className="text-[11px] font-semibold text-[#025940] dark:text-[#72A68E]">
            {t('serviceBookings.today.garageCollapsedSummary', { count: bookings.length })}
          </span>
        </button>
      )}

      {/* ── Expanded booking cards ── */}
      {isOpen && (
        <div className="space-y-1.5">
          {bookings.map(booking => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onMarkCompleted={onMarkCompleted}
              onReturnFromGarage={onReturnFromGarage}
              onCheckInToGarage={onCheckInToGarage}
              onBookingEdit={onBookingEdit}
              onBookingDelete={onBookingDelete}
              showDate={showDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section Group ────────────────────────────────────────────────────────────
function BookingSection({
  title, count, bookings, dotColor,
  onMarkCompleted, onReturnFromGarage, onCheckInToGarage, onBookingEdit, onBookingDelete,
  showDate = false,
}: {
  title: string
  count: number
  bookings: ServiceBooking[]
  dotColor: string
  onMarkCompleted: (b: ServiceBooking) => void
  onReturnFromGarage: (b: ServiceBooking) => void
  onCheckInToGarage: (b: ServiceBooking) => void
  onBookingEdit: (b: ServiceBooking) => void
  onBookingDelete: (id: string) => void
  showDate?: boolean
}) {
  if (bookings.length === 0) return null

  return (
    <div className="space-y-1.5">
      {/* Section header */}
      <div className="flex items-center gap-2 px-0.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.12em]">
          {title}
        </span>
        <span className="text-[10px] font-bold text-gray-300 dark:text-gray-600">{count}</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700/60" />
      </div>

      <div className="space-y-1.5">
        {bookings.map(booking => (
          <BookingCard
            key={booking.id}
            booking={booking}
            onMarkCompleted={onMarkCompleted}
            onReturnFromGarage={onReturnFromGarage}
            onCheckInToGarage={onCheckInToGarage}
            onBookingEdit={onBookingEdit}
            onBookingDelete={onBookingDelete}
            showDate={showDate}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function ServiceTodayView({
  selectedDate,
  bookings,
  onMarkCompleted,
  onStartBooking,
  onReturnFromGarage,
  onCheckInToGarage,
  onBookingEdit,
  onBookingDelete,
  onAddBooking,
  viewFilter,
  onViewFilterChange,
  workshopContent,
}: ServiceTodayViewProps) {
  const t = useT()
  const { locale } = useLang()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isToday  = selectedDate.toDateString() === today.toDateString()
  const dateStr  = toDateStr(selectedDate)

  // ── Grid view (Phase 1) ────────────────────────────────────────────────
  // Toggle defaults to 'list' to preserve the long-standing view. Grid mode
  // only makes sense for single-day data, so it auto-falls back to list when
  // the user picks the "All" filter.
  const [bookingsViewMode, setBookingsViewMode] = useState<'list' | 'grid'>('list')
  const { branches } = useBranches()
  const primaryBranch = branches.find(b => b.isMain) ?? branches[0]
  const bayCount = primaryBranch?.serviceBayCount ?? DEFAULT_SERVICE_BAY_COUNT
  const effectiveViewMode: 'list' | 'grid' = viewFilter === 'all' ? 'list' : bookingsViewMode

  const dateBookings = viewFilter === 'all'
    ? bookings.filter(b => b.status !== 'cancelled')
    : bookings.filter(b => b.date === dateStr && b.status !== 'cancelled')

  const sorted = [...dateBookings].sort((a, b) => {
    const at = a.isExternalProvider ? (a.externalProvider?.customTime || '00:00') : (a.timeSlot || '00:00')
    const bt = b.isExternalProvider ? (b.externalProvider?.customTime || '00:00') : (b.timeSlot || '00:00')
    return at.localeCompare(bt)
  })

  const inProgress = sorted.filter(b => b.status === 'in-progress' && !b.isExternalProvider)
  const scheduled  = sorted.filter(b => b.status === 'scheduled')
  const atGarage   = sorted.filter(b => b.status === 'checked_in_to_garage' || isSyntheticGarageVehicle(b))
  const completed  = sorted.filter(b => b.status === 'completed')
  const totalCount = sorted.length

  return (
    <div className="flex flex-col h-full">

      {/* ── Date Header — single compact row (chip + date + count inline)
          so the schedule below isn't pushed down. */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`
            inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase flex-shrink-0
            ${isToday ? 'bg-[#b3f243] text-[#012619]' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}
          `}>
            <Clock className="w-2.5 h-2.5" />
            {isToday
              ? t('serviceBookings.today.headerToday')
              : selectedDate.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase()
            }
          </span>

          <h2 className="text-base font-black text-gray-900 dark:text-white leading-tight tracking-tight truncate">
            {selectedDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^\p{L}/u, c => c.toUpperCase())}
          </h2>

          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">
            · {totalCount === 0
              ? t('serviceBookings.today.headerNoBookings')
              : t('serviceBookings.today.headerBookingCount', {
                  count: totalCount,
                  total: viewFilter === 'all' ? t('serviceBookings.today.headerBookingCountTotalSuffix') : '',
                })
            }
          </span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700/50 p-0.5 rounded-lg flex-shrink-0">
          {(['workshop', 'today', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => onViewFilterChange(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-black transition-all ${
                viewFilter === f
                  ? f === 'today'
                    ? 'bg-[#025940] text-white shadow-sm'
                    : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {f === 'today'
                ? t('serviceBookings.today.viewToggleToday')
                : f === 'all'
                  ? t('serviceBookings.today.viewToggleAll')
                  : t('serviceBookings.today.viewToggleWorkshop')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {/* Workshop sub-view replaces the booking list with whatever the
          parent passes via `workshopContent` (typically the Bay × Time
          grid). Falls back to the list if no slot is supplied so the
          toggle never leaves the user staring at a blank panel. */}
      {viewFilter === 'workshop' && workshopContent ? (
        <div className="flex-1 overflow-hidden -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-0">
          {workshopContent}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center select-none">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700/60 rounded-2xl flex items-center justify-center mb-4">
              <Wrench className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-sm font-bold text-gray-400 dark:text-gray-500">{t('serviceBookings.today.emptyNoBookingsForDate')}</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">{t('serviceBookings.today.emptyTapAllHint')}</p>
          </div>
        ) : effectiveViewMode === 'grid' ? (
          /* ════════════ GRID VIEW — internal bookings only ════════════ */
          <>
            <BayGrid
              bayCount={bayCount}
              bookings={sorted.filter(
                b => !b.isExternalProvider && !isSyntheticGarageVehicle(b)
              )}
              onCellClick={() => onAddBooking(selectedDate)}
              onBookingClick={onBookingEdit}
            />

            {/* External garage section — stays below the grid */}
            {atGarage.length > 0 && (
              <CollapsibleGarageSection
                bookings={atGarage}
                onMarkCompleted={onMarkCompleted}
                onReturnFromGarage={onReturnFromGarage}
                onCheckInToGarage={onCheckInToGarage}
                onBookingEdit={onBookingEdit}
                onBookingDelete={onBookingDelete}
                showDate={viewFilter === 'all'}
              />
            )}
          </>
        ) : (
          /* ════════════ LIST VIEW (default) ════════════ */
          <>
            <BookingSection
              title={t('serviceBookings.today.sectionInProgress')}
              count={inProgress.length}
              bookings={inProgress}
              dotColor="bg-amber-400"
              onMarkCompleted={onMarkCompleted}
              onReturnFromGarage={onReturnFromGarage}
              onCheckInToGarage={onCheckInToGarage}
              onBookingEdit={onBookingEdit}
              onBookingDelete={onBookingDelete}
              showDate={viewFilter === 'all'}
            />
            <BookingSection
              title={t('serviceBookings.today.sectionScheduled')}
              count={scheduled.length}
              bookings={scheduled}
              dotColor="bg-sky-400"
              onMarkCompleted={onMarkCompleted}
              onReturnFromGarage={onReturnFromGarage}
              onCheckInToGarage={onCheckInToGarage}
              onBookingEdit={onBookingEdit}
              onBookingDelete={onBookingDelete}
              showDate={viewFilter === 'all'}
            />

            {/* ✅ External garage section — collapsible, collapsed by default */}
            <CollapsibleGarageSection
              bookings={atGarage}
              onMarkCompleted={onMarkCompleted}
              onReturnFromGarage={onReturnFromGarage}
              onCheckInToGarage={onCheckInToGarage}
              onBookingEdit={onBookingEdit}
              onBookingDelete={onBookingDelete}
              showDate={viewFilter === 'all'}
            />

            <BookingSection
              title={t('serviceBookings.today.sectionCompleted')}
              count={completed.length}
              bookings={completed}
              dotColor="bg-emerald-400"
              onMarkCompleted={onMarkCompleted}
              onReturnFromGarage={onReturnFromGarage}
              onCheckInToGarage={onCheckInToGarage}
              onBookingEdit={onBookingEdit}
              onBookingDelete={onBookingDelete}
              showDate={viewFilter === 'all'}
            />
          </>
        )}
      </div>
      )}
    </div>
  )
}