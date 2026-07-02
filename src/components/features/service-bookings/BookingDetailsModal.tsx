// src/components/features/service-bookings/BookingDetailsModal.tsx
// 👁️ Read-only details view of a service booking — opened by clicking a
// booking row. Shows full info including notes/comments, assigned mechanic,
// metadata, and (for external bookings) garage info.
//
// Editing happens via the dedicated Edit button on the parent row, which
// triggers the existing edit modal. This component intentionally has no
// editable inputs to keep the responsibilities clear.
'use client'

import React, { useState } from 'react'
import {
  X,
  Clock,
  Wrench,
  StickyNote,
  MapPin,
  User,
  ChevronRight,
  Pencil,
  Phone,
  Mail,
  Trash2,
  Package,
  Receipt,
  Ban,
  CalendarClock,
} from 'lucide-react'
import type { ServiceBooking } from '@/types/serviceBookings'
import type { Customer } from '@/types/customer'
import type { Invoice } from '@/types/stock'
import { getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'
import { bayLabel } from '@/utils/serviceBookings/bayLabels'
import { normalizePhone } from '@/lib/utils/phone'
import { useT, localizeWorkType } from '@/lib/i18n'
import { useServiceBookings } from '@/hooks/useServiceBookings'
import { usePermissions } from '@/hooks/usePermissions'
import { JobPartsModal } from './JobPartsModal'
import { CreateInvoiceModal } from '@/components/stock/CreateInvoiceModal'

interface BookingDetailsModalProps {
  booking: ServiceBooking
  isOpen: boolean
  onClose: () => void
  onEdit?: (booking: ServiceBooking) => void
  onDelete?: (bookingId: string) => void
  /** Mark complete — wired to the same handler the today-view list uses
   *  (handleMarkCompleted), which has built-in handling for synthetic
   *  garage vehicles (returns them from garage instead of marking
   *  completed). When omitted or the booking is already completed /
   *  cancelled, the button is hidden. */
  onComplete?: (booking: ServiceBooking) => void
  /** Carry an unfinished job to another day — opens the workshop booking view
   *  on the next day with this vehicle pre-loaded. Owner / Garage Manager only. */
  onCarryOver?: (booking: ServiceBooking) => void
  /** Optional customer list — when provided, the matched customer's
   *  saved "preferred notes" is shown inside the Customer section.
   *  Lookup is by normalised phone. */
  customers?: Customer[]
  /** Optional custom bay names (display only). Index 0 = bay 1. */
  bayNames?: string[]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateTime(value: any): string {
  if (!value) return ''
  try {
    const d = value instanceof Date ? value : value?.toDate?.() ?? new Date(value)
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function formatWorkList(work: string | string[]): string[] {
  if (Array.isArray(work)) return work.filter(Boolean)
  if (typeof work === 'string' && work.trim()) return [work.trim()]
  return []
}

function statusLabel(
  status: ServiceBooking['status'],
  t: (key: string, vars?: Record<string, string | number>) => string,
): { text: string; classes: string } {
  switch (status) {
    case 'completed':
      return { text: t('serviceBookings.status.completed'), classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
    case 'in-progress':
      return { text: t('serviceBookings.status.inProgressLower'), classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
    case 'checked_in_to_garage':
      return { text: t('serviceBookings.status.atGarageLower'), classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' }
    case 'cancelled':
      return { text: t('serviceBookings.status.cancelled'), classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
    case 'scheduled':
    default:
      return { text: t('serviceBookings.status.scheduled'), classes: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' }
  }
}

export function BookingDetailsModal({
  booking,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onComplete,
  onCarryOver,
  customers,
  bayNames,
}: BookingDetailsModalProps) {
  const t = useT()
  const { raiseInvoiceForBooking, updateBooking } = useServiceBookings()
  // Regular admins keep operational actions (complete, scan parts) but cannot
  // edit/delete bookings or raise invoices — owner / Garage Manager only.
  const { canManageBookings, canCreateInvoices } = usePermissions()
  // 🧩 Live job-parts capture, reachable straight from the details view.
  const [partsOpen, setPartsOpen] = useState(false)
  // 🧾 When set, the invoice editor is layered on top for review after the
  // draft is raised from this job.
  const [invoiceDraft, setInvoiceDraft] = useState<Invoice | null>(null)
  const [raising, setRaising] = useState(false)
  const [savingNoInvoice, setSavingNoInvoice] = useState(false)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  if (!isOpen) return null

  // Match the booking's customerPhone to a saved customer record so we
  // can surface their preferred notes (e.g. "Prefers WhatsApp", "VIP").
  const matchedCustomer = (() => {
    const phoneKey = normalizePhone(booking.customerPhone)
    if (!phoneKey || !customers) return undefined
    return customers.find((c) => c.phoneNormalized === phoneKey)
  })()
  const customerPreferredNotes = matchedCustomer?.notes?.trim() || ''

  const isExternal = !!booking.isExternalProvider
  // A carried-over trail marker is a read-only record of a day the job ran
  // before moving on — no actions apply to it.
  const isMarker = !!booking.carriedForward
  // Parts only make sense for our own (internal, real) jobs — external garages
  // supply their own parts, and synthetic garage rows aren't real bookings.
  const showParts = !isExternal && !(booking as any).isGarageVehicle
  const works = formatWorkList(booking.workRequired).map(w => localizeWorkType(t, w))
  const status = statusLabel(booking.status, t)
  // 🕐 Multi-slot aware time display: shows the full range when the booking
  // spans more than one slot.
  const span = Math.max(1, booking.slotCount ?? 1)
  const time = (() => {
    if (isExternal) return booking.externalProvider?.customTime || t('serviceBookings.details.allDay')
    if (!booking.timeSlot) return ''
    if (span <= 1) return booking.timeSlot
    const startStr = booking.timeSlot.split('-')[0]?.trim() || booking.timeSlot
    const endStr = getBookingEndTime(booking.timeSlot, span)
    return endStr ? `${startStr} – ${endStr}` : booking.timeSlot
  })()

  // strip email-domain from display names if no real name set
  const stripDomain = (s?: string) => (s?.includes('@') ? s.split('@')[0] : s) || ''

  const vehicleName = [booking.make, booking.model].filter(Boolean).join(' ')

  const handleEditClick = () => {
    if (!onEdit) return
    onEdit(booking)
    onClose()
  }

  const handleDeleteClick = () => {
    if (!onDelete) return
    onDelete(booking.id)
    onClose()
  }

  const handleCompleteClick = () => {
    if (!onComplete) return
    onComplete(booking)
    onClose()
  }
  // Hide Complete when there's nothing meaningful to complete.
  const canComplete =
    !!onComplete && !isMarker &&
    booking.status !== 'completed' &&
    booking.status !== 'cancelled'
  // Garage vehicles get a friendlier label — handleMarkCompleted treats
  // "complete" as "return from external garage" for them.
  const completeLabel = (booking as any).isGarageVehicle
    ? t('serviceBookings.action.returnFromGarage')
    : t('serviceBookings.action.markComplete')

  // 🧾 Invoice state for this job. Only our own completed jobs can be invoiced
  // (external garages bill us; synthetic garage rows aren't real bookings).
  const isInvoiced = !!booking.invoiceId
  const noInvoiceNeeded = !!booking.noInvoiceNeeded
  const canInvoice =
    canCreateInvoices && !isMarker &&
    booking.status === 'completed' && !isInvoiced && !noInvoiceNeeded &&
    !isExternal && !(booking as any).isGarageVehicle

  // ⏭️ Carry-over: an UNFINISHED internal job whose day is today or earlier
  // (scheduled / checked-in / in-progress). Future bookings aren't "spillover" —
  // reschedule those via Edit. Owner / Garage Manager only.
  const todayYmd = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const canCarryOver =
    !!onCarryOver && canManageBookings && !isExternal && !isMarker && !(booking as any).isGarageVehicle &&
    booking.status !== 'completed' && booking.status !== 'cancelled' &&
    (booking.date || '') <= todayYmd

  const handleRaiseInvoice = async () => {
    if (raising) return
    setRaising(true)
    setInvoiceError(null)
    try {
      const inv = await raiseInvoiceForBooking(booking)
      setInvoiceDraft(inv)
    } catch {
      // Leave the modal open so the user can retry, with a visible reason.
      setInvoiceError(t('serviceBookings.invoice.error'))
    } finally {
      setRaising(false)
    }
  }

  const handleNoInvoice = async () => {
    if (savingNoInvoice) return
    setSavingNoInvoice(true)
    setInvoiceError(null)
    try {
      await updateBooking(booking.id, { noInvoiceNeeded: true })
      onClose()
    } catch {
      setInvoiceError(t('serviceBookings.invoice.error'))
      setSavingNoInvoice(false)
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-[#025940] to-[#72A68E] text-white px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold bg-yellow-300 text-gray-900 px-2 py-0.5 rounded font-mono tracking-wide border border-yellow-400">
                  {booking.registration || '—'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${status.classes}`}>
                  {status.text}
                </span>
                {booking.status === 'completed' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                    isInvoiced
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : noInvoiceNeeded
                        ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}>
                    {isInvoiced
                      ? t('serviceBookings.invoice.invoiced')
                      : noInvoiceNeeded
                        ? t('serviceBookings.invoice.noInvoiceNeeded')
                        : t('serviceBookings.invoice.notInvoiced')}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black truncate">
                {vehicleName || t('serviceBookings.details.customVehicle')}
              </h2>
              {booking.isCustomVehicle && (
                <p className="text-xs text-white/80 mt-1">
                  {t('serviceBookings.details.notInFleet')}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
              aria-label={t('serviceBookings.common.closeAria')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

          {/* Carried-over marker banner — this is a record only. */}
          {isMarker && (
            <div className="flex items-center gap-2 rounded-xl border border-[#025940]/30 bg-[#025940]/5 px-3 py-2.5 text-sm text-[#025940] dark:text-[#72A68E]">
              <CalendarClock className="w-4 h-4 flex-shrink-0" />
              <span>{t('serviceBookings.carryOver.markerNote', { date: booking.carriedToDate ? formatDate(booking.carriedToDate) : '' })}</span>
            </div>
          )}

          {/* Continued job banner — hours were carried in from previous day(s). */}
          {!isMarker && (booking.carriedOverCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-[#b3f243]/50 bg-[#b3f243]/10 px-3 py-2.5 text-sm text-[#025940] dark:text-[#b3f243]">
              <CalendarClock className="w-4 h-4 flex-shrink-0" />
              <span>{t('serviceBookings.carryOver.continuedNote', { hours: ((booking.carriedOverSlots ?? 0) * 0.5).toFixed(1) })}</span>
            </div>
          )}

          {/* When + where */}
          <Section icon={<img src="/calendar.svg" alt="" className="w-8 h-8 object-contain" />} title={t('serviceBookings.details.sectionWhen')}>
            <p className="text-sm text-gray-900 dark:text-white">
              {formatDate(booking.date)}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              <Clock className="w-3 h-3" />
              {time || '—'}
              {!isExternal && booking.serviceBay ? (
                <span className="ml-2 inline-flex items-center text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/30 px-1.5 py-0.5 rounded">
                  {bayLabel(bayNames, booking.serviceBay, t('serviceBookings.details.bayBadge', { count: booking.serviceBay }))}
                </span>
              ) : null}
              {!isExternal && span > 1 ? (
                <span className="inline-flex items-center text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                  {t('serviceBookings.details.slotsBadge', { count: span })}
                </span>
              ) : null}
            </p>
          </Section>

          {/* Customer details — only renders when at least the name is set
              (older bookings predate these fields). Phone is a tel: link
              and email is a mailto: link for one-tap contact on mobile. */}
          {(booking.customerName || booking.customerPhone || booking.customerEmail) && (
            <Section icon={<User className="w-4 h-4" />} title={t('serviceBookings.details.sectionCustomer')}>
              {booking.customerName && (
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {booking.customerName}
                </p>
              )}
              <div className="mt-1 space-y-0.5">
                {booking.customerPhone && (
                  <a
                    href={`tel:${booking.customerPhone}`}
                    className="text-xs text-gray-700 dark:text-gray-300 hover:text-[#025940] dark:hover:text-[#72A68E] flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    {booking.customerPhone}
                  </a>
                )}
                {booking.customerEmail && (
                  <a
                    href={`mailto:${booking.customerEmail}`}
                    className="text-xs text-gray-700 dark:text-gray-300 hover:text-[#025940] dark:hover:text-[#72A68E] flex items-center gap-1 break-all"
                  >
                    <Mail className="w-3 h-3" />
                    {booking.customerEmail}
                  </a>
                )}
              </div>
              {/* Saved "preferred notes" from the customer record (looked
                  up by phone). Distinct from the booking's own notes —
                  these are sticky per-customer (e.g. "Prefers WhatsApp"). */}
              {customerPreferredNotes && (
                <p className="mt-2 text-xs text-gray-700 dark:text-gray-200 italic bg-[#C5D9D0]/40 dark:bg-[#025940]/20 border border-[#72A68E]/40 dark:border-[#72A68E]/30 rounded px-2 py-1.5">
                  📝 {customerPreferredNotes}
                </p>
              )}
            </Section>
          )}

          {isExternal && (
            <Section icon={<img src="/external.svg" alt="" className="w-8 h-8 object-contain" />} title={t('serviceBookings.details.sectionExternalGarage')}>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {booking.externalProvider?.garageName || '—'}
              </p>
              {booking.externalProvider?.address && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {booking.externalProvider.address}
                </p>
              )}
            </Section>
          )}

          {/* Work required */}
          <Section icon={<Wrench className="w-4 h-4" />} title={t('serviceBookings.details.sectionWorkRequired')}>
            {works.length > 0 ? (
              <ul className="space-y-1">
                {works.map((w, i) => (
                  <li
                    key={`${w}-${i}`}
                    className="flex items-center gap-2 text-sm text-gray-900 dark:text-white"
                  >
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    {w}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">{t('serviceBookings.details.noWorkSpecified')}</p>
            )}
          </Section>

          {/* Notes / comments — the thing the user asked for */}
          <Section icon={<StickyNote className="w-4 h-4" />} title={t('serviceBookings.details.sectionNotes')}>
            {booking.notes && booking.notes.trim() ? (
              <p className="text-sm text-gray-900 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {booking.notes}
              </p>
            ) : (
              <p className="text-sm text-gray-500 italic">{t('serviceBookings.details.noNotes')}</p>
            )}
          </Section>

          {/* Mechanic */}
          {booking.assignedMechanicName && (
            <Section icon={<img src="/technician.svg" alt="" className="w-8 h-8 object-contain" />} title={t('serviceBookings.details.sectionAssignedMechanic')}>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                👤 {booking.assignedMechanicName}
              </p>
            </Section>
          )}

          {/* Branch (for external bookings only) */}
          {isExternal && booking.originalBranchName && (
            <Section icon={<MapPin className="w-4 h-4" />} title={t('serviceBookings.details.sectionOriginalBranch')}>
              <p className="text-sm text-gray-900 dark:text-white">
                {booking.originalBranchName}
              </p>
            </Section>
          )}

          {/* Garage check-in info */}
          {booking.checkedInToGarageAt && (
            <Section icon={<img src="/external.svg" alt="" className="w-8 h-8 object-contain" />} title={t('serviceBookings.details.sectionCheckedInToGarage')}>
              <p className="text-sm text-gray-900 dark:text-white">
                {formatDateTime(booking.checkedInToGarageAt)}
              </p>
              {booking.checkedInToGarageByName && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {t('serviceBookings.details.checkedInBy', { name: stripDomain(booking.checkedInToGarageByName) })}
                </p>
              )}
            </Section>
          )}

          {/* Audit metadata */}
          <Section icon={<User className="w-4 h-4" />} title={t('serviceBookings.details.sectionAudit')}>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {booking.createdByName && (
                <p>
                  {t('serviceBookings.details.addedBy', { name: stripDomain(booking.createdByName) })}
                  {booking.createdAt && t('serviceBookings.details.addedOn', { date: formatDateTime(booking.createdAt) })}
                </p>
              )}
              {booking.updatedAt && (
                <p>{t('serviceBookings.details.lastUpdated', { date: formatDateTime(booking.updatedAt) })}</p>
              )}
              {booking.completedAt && (
                <p>
                  {t('serviceBookings.details.completedOn', { date: formatDateTime(booking.completedAt) })}
                  {booking.completedByName && t('serviceBookings.details.completedBy', { name: stripDomain(booking.completedByName) })}
                </p>
              )}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          {/* Delete on the left so it's visually separated from the
              positive Edit / Close actions on the right. */}
          {onDelete && canManageBookings && !isMarker ? (
            <button
              onClick={handleDeleteClick}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {t('serviceBookings.action.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {invoiceError && (
              <span className="text-xs font-medium text-red-600 dark:text-red-400 mr-1">{invoiceError}</span>
            )}
            {showParts && (
              <button
                onClick={() => setPartsOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-white dark:bg-gray-700 border border-[#025940]/40 hover:bg-[#025940]/10 text-[#025940] dark:text-[#72A68E] transition-colors"
              >
                <Package className="w-4 h-4" />
                {t('stock.jobParts.buttonLabel')}
              </button>
            )}
            {/* Carry over → opens the workshop view on the next day with this
                vehicle pre-loaded. Owner / Garage Manager only. */}
            {canCarryOver && (
              <button
                onClick={() => { onCarryOver!(booking); onClose() }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-white dark:bg-gray-700 border border-[#025940]/40 hover:bg-[#025940]/10 text-[#025940] dark:text-[#72A68E] transition-colors"
              >
                <CalendarClock className="w-4 h-4" />
                {t('serviceBookings.carryOver.button')}
              </button>
            )}
            {onEdit && canManageBookings && !isMarker && (
              <button
                onClick={handleEditClick}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-white dark:bg-gray-700 border border-[#025940]/40 hover:bg-[#025940]/10 text-[#025940] dark:text-[#72A68E] transition-colors"
              >
                <Pencil className="w-4 h-4" />
                {t('serviceBookings.action.edit')}
              </button>
            )}
            {canComplete && (
              // Sized to match the sibling Edit / Close buttons: px-3 py-2 +
              // 16px icon. Previously the icon was w-8 h-8 (32px), which
               // blew the button up to ~2× the height of its neighbours.
              <button
                onClick={handleCompleteClick}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-[#025940] hover:bg-[#012619] text-white transition-colors shadow-sm"
              >
                <img src="/completed.svg" alt="" className="w-4 h-4 object-contain" />
                {completeLabel}
              </button>
            )}
            {canInvoice && (
              <button
                onClick={handleRaiseInvoice}
                disabled={raising}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-[#025940] hover:bg-[#012619] text-white transition-colors shadow-sm disabled:opacity-60"
              >
                <Receipt className="w-4 h-4" />
                {t('serviceBookings.invoice.raiseInvoice')}
              </button>
            )}
            {canInvoice && (
              <button
                onClick={handleNoInvoice}
                disabled={savingNoInvoice}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-60"
              >
                <Ban className="w-4 h-4" />
                {t('serviceBookings.invoice.noInvoiceNeeded')}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors"
            >
              {t('serviceBookings.common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* 🧩 Live job-parts capture — layers above this modal (z-100 > z-50). */}
    {showParts && (
      <JobPartsModal
        booking={booking}
        isOpen={partsOpen}
        onClose={() => setPartsOpen(false)}
      />
    )}

    {/* 🧾 Invoice editor — layered above (z-100 > z-50). Opened by "Raise
        invoice"; created as a draft already linked to this job. */}
    {invoiceDraft && (
      <CreateInvoiceModal
        isOpen={!!invoiceDraft}
        editInvoice={invoiceDraft}
        onClose={() => { setInvoiceDraft(null); onClose() }}
        onSuccess={() => { setInvoiceDraft(null); onClose() }}
      />
    )}
    </>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center gap-2 mb-2 text-gray-500 dark:text-gray-400">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  )
}
