// src/components/features/service-bookings/WorkingReportModal.tsx
// 📊 Admin-only working report — shows what each mechanic worked on for a
// chosen period, grouped by day, with slot tallies. Default period is today.
// Mounted from the Service Bookings header behind a role check.
//
// Data comes from the existing `useServiceBookings` context — no extra
// Firestore reads. We just slice + group the bookings already in memory.
'use client'

import React, { useMemo, useState } from 'react'
import { X, BarChart3, Calendar, Wrench, Clock } from 'lucide-react'
import type { ServiceBooking } from '@/types/serviceBookings'
import { getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'
import { useT, localizeWorkRequired } from '@/lib/i18n'

interface WorkingReportModalProps {
  isOpen: boolean
  onClose: () => void
  bookings: ServiceBooking[]
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | '90days'

const PRESETS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: '90days', label: 'Last 90 days' },
]

/** Returns YYYY-MM-DD for a Date in the user's local timezone. */
function toIsoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayBoundsFor(period: Period): { fromIso: string; toIso: string; label: string } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const todayIso = toIsoDay(now)

  if (period === 'today') {
    return { fromIso: todayIso, toIso: todayIso, label: 'Today' }
  }
  if (period === 'yesterday') {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    const yIso = toIsoDay(y)
    return { fromIso: yIso, toIso: yIso, label: 'Yesterday' }
  }
  const offsetDays = period === 'week' ? 6 : period === 'month' ? 29 : 89
  const from = new Date(now)
  from.setDate(from.getDate() - offsetDays)
  return {
    fromIso: toIsoDay(from),
    toIso: todayIso,
    label: PRESETS.find(p => p.id === period)?.label || '',
  }
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

function formatDayHeader(iso: string, t: Translator): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = toIsoDay(today)
  if (iso === todayIso) {
    return t('serviceBookings.report.dayHeaderToday', {
      date: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
    })
  }
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTimeRange(b: ServiceBooking, t: Translator): string {
  if (b.isExternalProvider) {
    return b.externalProvider?.customTime || t('serviceBookings.report.externalAllDay')
  }
  if (!b.timeSlot) return ''
  const span = Math.max(1, b.slotCount ?? 1)
  const startStr = b.timeSlot.split('-')[0]?.trim() || b.timeSlot
  if (span <= 1) return b.timeSlot
  const endStr = getBookingEndTime(b.timeSlot, span)
  return endStr ? `${startStr} – ${endStr}` : b.timeSlot
}

function formatWork(b: ServiceBooking, t: Translator): string {
  return localizeWorkRequired(t, b.workRequired, t('serviceBookings.workFallback.service'))
}

function statusPillClasses(status: ServiceBooking['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'in-progress':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    case 'checked_in_to_garage':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
    case 'cancelled':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    case 'scheduled':
    default:
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
  }
}

interface MechanicReport {
  mechanicId: string
  mechanicName: string
  totalJobs: number
  totalSlots: number
  // Per-day grouping. Days are ISO strings, sorted descending (most recent first).
  byDay: Map<string, ServiceBooking[]>
}

/** Maps a Period id (logic, never translated) to its display i18n key. */
const PERIOD_LABEL_KEY: Record<Period, string> = {
  today: 'serviceBookings.report.periodToday',
  yesterday: 'serviceBookings.report.periodYesterday',
  week: 'serviceBookings.report.periodWeek',
  month: 'serviceBookings.report.periodMonth',
  '90days': 'serviceBookings.report.period90days',
}

export function WorkingReportModal({ isOpen, onClose, bookings }: WorkingReportModalProps) {
  const t = useT()
  const [period, setPeriod] = useState<Period>('today')

  const { fromIso, toIso } = useMemo(() => dayBoundsFor(period), [period])
  const isSingleDay = fromIso === toIso
  const label = t(PERIOD_LABEL_KEY[period])

  // Filter bookings: must be assigned, not cancelled, within the date window.
  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (!b.assignedMechanicId) return false
      if (b.status === 'cancelled') return false
      if (!b.date) return false
      return b.date >= fromIso && b.date <= toIso
    })
  }, [bookings, fromIso, toIso])

  // Group by mechanic, then by day.
  const reports: MechanicReport[] = useMemo(() => {
    const map = new Map<string, MechanicReport>()
    for (const b of filtered) {
      const id = b.assignedMechanicId || 'unknown'
      if (!map.has(id)) {
        map.set(id, {
          mechanicId: id,
          mechanicName: b.assignedMechanicName || t('serviceBookings.report.unknownMechanic'),
          totalJobs: 0,
          totalSlots: 0,
          byDay: new Map(),
        })
      }
      const entry = map.get(id)!
      entry.totalJobs += 1
      entry.totalSlots += Math.max(1, b.slotCount ?? 1)
      const dayKey = b.date
      if (!entry.byDay.has(dayKey)) entry.byDay.set(dayKey, [])
      entry.byDay.get(dayKey)!.push(b)
    }
    // Sort each mechanic's days descending (newest first), and bookings within
    // a day ascending by start time.
    map.forEach(r => {
      r.byDay = new Map(
        Array.from(r.byDay.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
          .map(([day, list]) => [
            day,
            [...list].sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || '')),
          ]),
      )
    })
    return Array.from(map.values()).sort((a, b) => a.mechanicName.localeCompare(b.mechanicName))
  }, [filtered, t])

  const grandTotalJobs = reports.reduce((s, r) => s + r.totalJobs, 0)
  const grandTotalSlots = reports.reduce((s, r) => s + r.totalSlots, 0)

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-[#025940] to-[#72A68E] text-white px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <BarChart3 className="w-6 h-6 flex-shrink-0" />
              <div>
                <h2 className="text-xl sm:text-2xl font-black">{t('serviceBookings.report.title')}</h2>
                <p className="text-xs text-white/80 mt-0.5">
                  {t('serviceBookings.report.headerSummary', {
                    label,
                    count: grandTotalJobs,
                    countSlots: grandTotalSlots,
                  })}
                </p>
              </div>
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

        {/* Period selector */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-900/40">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                  period === p.id
                    ? 'bg-[#025940] text-white border-[#025940]'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#72A68E]'
                }`}
              >
                {t(PERIOD_LABEL_KEY[p.id])}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {reports.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('serviceBookings.report.emptyTitle')}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {t('serviceBookings.report.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {reports.map(r => (
                <div
                  key={r.mechanicId}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  {/* Mechanic header */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/10 px-4 py-2.5 border-b border-blue-200 dark:border-blue-700 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">👤</span>
                      <span className="font-bold text-gray-900 dark:text-white truncate">{r.mechanicName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {t('serviceBookings.report.mechanicJobs', { count: r.totalJobs })}
                      </span>
                      <span className="font-bold text-[#025940] dark:text-[#72A68E]">
                        {t('serviceBookings.report.slotsCovered', { count: r.totalSlots })}
                      </span>
                    </div>
                  </div>

                  {/* Days */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {Array.from(r.byDay.entries()).map(([dayIso, dayBookings]) => {
                      const daySlots = dayBookings.reduce(
                        (s, b) => s + Math.max(1, b.slotCount ?? 1),
                        0,
                      )
                      return (
                        <div key={dayIso} className="px-4 py-3">
                          {/* Day header — hidden when single-day view (everything is the same day) */}
                          {!isSingleDay && (
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDayHeader(dayIso, t)}
                              </div>
                              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                {t('serviceBookings.report.dayJobsSlots', {
                                  countJobs: dayBookings.length,
                                  countSlots: daySlots,
                                })}
                              </span>
                            </div>
                          )}

                          {/* Booking rows */}
                          <div className="space-y-1.5">
                            {dayBookings.map(b => {
                              const span = Math.max(1, b.slotCount ?? 1)
                              return (
                                <div
                                  key={b.id}
                                  className="flex items-center gap-3 px-2.5 py-1.5 rounded-md bg-gray-50 dark:bg-gray-900/40"
                                >
                                  {/* Reg badge */}
                                  <span className="text-[10px] font-black bg-yellow-300 text-gray-900 px-1.5 py-0.5 rounded font-mono tracking-wide flex-shrink-0">
                                    {b.registration || '—'}
                                  </span>
                                  {/* Time + work */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                                      {formatWork(b, t)}
                                    </p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                      <Clock className="w-3 h-3 flex-shrink-0" />
                                      {formatTimeRange(b, t)}
                                    </p>
                                  </div>
                                  {/* Slot count + status */}
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                      {t('serviceBookings.report.slotsBadge', { count: span })}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusPillClasses(
                                        b.status,
                                      )}`}
                                    >
                                      {b.status === 'checked_in_to_garage' ? t('serviceBookings.report.atGarageStatus') : b.status}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors"
          >
            {t('serviceBookings.common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
