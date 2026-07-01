// src/components/features/service-bookings/ServiceBookingsContent.tsx
// REDESIGNED LAYOUT: Today view default, side-by-side with mini calendar on right
// ✅ ALL ORIGINAL FEATURES PRESERVED: service bay detection, bay conflict modal, 
//    service completion modal, garage vehicle merging, search/navigation, etc.
'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useFleetData } from '@/hooks/useFleetData'
import { useYardData } from '@/contexts/YardDataContext'
import { useVehicleTransfers } from '@/hooks/useVehicleTransfers'
import { ServiceCalendar, ServiceCalendarRef } from './ServiceCalendar'
import ServiceBookingModal from './ServiceBookingModal'
import { ServiceBookingsList } from './ServiceBookingsList'
import { ServiceTodayView } from './ServiceTodayView'
import { BookingWorkspace } from './booking-workspace/BookingWorkspace'
import { WorkshopScheduleGrid } from './booking-workspace/WorkshopScheduleGrid'
import { WorkshopWeekGrid } from './booking-workspace/WorkshopWeekGrid'
import { WorkshopGridFilters } from './booking-workspace/WorkshopGridFilters'
import { ExternalBookingsTicker } from './booking-workspace/ExternalBookingsTicker'
import { BookingDetailsModal } from './BookingDetailsModal'
import { JobPartsModal } from './JobPartsModal'
import { useServiceBookings, setServiceBookingsModalHandler } from '@/hooks/useServiceBookings'
import { usePermissions } from '@/hooks/usePermissions'
import { useMechanics } from '@/hooks/useMechanics'
import { useBranches } from '@/hooks/useBranches'
import { useCustomers } from '@/hooks/useCustomers'
import { DEFAULT_SERVICE_BAY_COUNT } from '@/types/branch'
import { bookingCoversSlot, getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'
import { bayLabel } from '@/utils/serviceBookings/bayLabels'
import type { PartsStatus } from '@/lib/utils/partsStatus'
import { WorkingReportModal } from './WorkingReportModal'
import { ToolbarKebab } from './ToolbarKebab'
import { userProfileService } from '@/lib/firestore'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Calendar, Clock, Car, Wrench, RefreshCw, BarChart3,
  CheckCircle, AlertCircle, Building, LogIn, ChevronRight,
  Plus, Search, Building2, ChevronLeft, X, Package
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT, localizeWorkRequired } from '@/lib/i18n'
import { toast } from 'sonner'

// Professional Modal Components
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { AlertModal } from '@/components/common/Modals/AlertModal'

// shared types
import type { ServiceBooking, TimeSlot } from '@/types/serviceBookings'

// ─── Time Slots ───────────────────────────────────────────────────────────────
// 30-min atomic granularity (24 slots, 08:30 → 20:30). Multi-slot bookings
// span N consecutive slots — a 90-min job = 3 slots, MOT 60-min = 2, etc.
// Legacy bookings (created when slots were 90 min, e.g. timeSlot
// "08:30-10:00") still render correctly because slotHelpers.getSlotIndex
// + getEffectiveSlotCount fall back to start-time matching and infer span
// from the id's duration.
function buildTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = []
  const startMins = 8 * 60 + 30   // 08:30
  const endMins   = 20 * 60 + 30  // 20:30
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  for (let m = startMins; m < endMins; m += 30) {
    const start = fmt(m)
    const end = fmt(m + 30)
    slots.push({
      id: `${start}-${end}`,
      label: `${start} - ${end}`,
      startTime: start,
      endTime: end,
    })
  }
  return slots
}
export const TIME_SLOTS: TimeSlot[] = buildTimeSlots()

export const WORK_TYPES = [
  'Oil Service',          'Pre-MOT Checks',
  'Diagnostics',          'Tyres',
  'Brake Discs',          'Driveshafts',
  'Clutch & Flywheel',    'Timing Belt',
  'Coolant/Cooling System', 'DPF Clean',
  'Battery',              'Alternator',
  'Starter Motor',        'Lights/Bulbs',
  'Windscreen',           'Mirrors',
  'Locks/Doors',          'Ply Lining',
  'Reversing Sensors',    'Pre-Delivery Inspection',
]

// ─── Modal State Interface ────────────────────────────────────────────────────
interface ModalStates {
  showDeleteConfirm: boolean
  showTimeSlotAlert: boolean
  showErrorAlert: boolean
  showSuccessAlert: boolean
  showServiceCompletionModal: boolean
  showServiceBayModal: boolean
  errorMessage: string
  successMessage: string
  deleteBookingId: string | null
  alertMessage: string
  completionBooking: ServiceBooking | null
  completionCallback: {
    onConfirm: () => void
    onCancel: () => void
  } | null
  serviceBayDecision: {
    bookingData: any | null
    conflictingBookings: ServiceBooking[]
    availableBay: number
    onConfirm: (useBay: number) => void
    onCancel: () => void
  } | null
}

// ─── Helper: date string ──────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Upcoming mini-list item ──────────────────────────────────────────────────
function UpcomingItem({
  booking,
  onClick,
  bayNames,
}: {
  booking: ServiceBooking
  onClick: () => void
  bayNames?: string[]
}) {
  const t = useT()
  const date = new Date(booking.date + 'T00:00:00')
  const dayNum = date.getDate()
  const monthShort = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
  // 🕐 Multi-slot aware: when span > 1 we show "08:30 → 5 slots" so the
  // tight upcoming row still hints at the full duration.
  const upcomingSpan = Math.max(1, booking.slotCount ?? 1)
  const startTime = booking.timeSlot?.split('-')[0]?.trim() || ''
  const time = booking.isExternalProvider
    ? (booking.externalProvider?.customTime || t('serviceBookings.content.upcomingExternalAllDay'))
    : upcomingSpan > 1
      ? t('serviceBookings.content.upcomingSlotsSuffix', { startTime, count: upcomingSpan })
      : startTime
  const location = booking.isExternalProvider
    ? (booking.externalProvider?.garageName || t('serviceBookings.content.upcomingLocationExternal'))
    : bayLabel(bayNames, booking.serviceBay ?? 1, t('serviceBookings.content.upcomingLocationBay', { bay: booking.serviceBay ?? 1 }))
  const work = localizeWorkRequired(t, booking.workRequired, t('serviceBookings.workFallback.service'))

  // 👤 Inline mechanic quick-assign. The select uses the same useMechanics
  // hook the modal uses, and writes via updateBooking. stopPropagation keeps
  // the click from bubbling to the row's onClick (which opens the edit modal).
  const { mechanics } = useMechanics()
  const { updateBooking } = useServiceBookings()
  const handleAssignChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
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

  return (
    <div
      className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-1 transition-colors"
      onClick={onClick}
    >
      {/* Date badge */}
      <div className="flex-shrink-0 w-9 text-center">
        <div className="text-sm font-bold text-[#025940] dark:text-[#72A68E] leading-none">{dayNum}</div>
        <div className="text-[9px] text-gray-400 uppercase leading-none mt-0.5">{monthShort}</div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold bg-yellow-300 text-gray-900 px-1.5 py-0.5 rounded font-mono tracking-wide border border-yellow-400 flex-shrink-0">
            {booking.registration}
          </span>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{work}</div>
        {/* Garage name — bold purple, truncated, only for external */}
        {booking.isExternalProvider && booking.externalProvider?.garageName && (
          <div className="text-xs font-bold text-purple-700 dark:text-purple-300 truncate mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
            {booking.externalProvider.garageName}
          </div>
        )}
        {/* 👤 Mechanic quick-assign — only renders if the org has at least
            one mechanic. Click handlers stop propagation so the row's
            modal-open onClick doesn't fire when the select is interacted with. */}
        {mechanics.length > 0 && (
          <select
            value={booking.assignedMechanicId || ''}
            onChange={handleAssignChange}
            onClick={e => e.stopPropagation()}
            className="mt-1 text-[10px] px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-full"
            title={booking.assignedMechanicName ? t('serviceBookings.content.upcomingMechanicAssignedTitle', { name: booking.assignedMechanicName }) : t('serviceBookings.content.upcomingAssignMechanicTitle')}
          >
            <option value="">{t('serviceBookings.content.upcomingUnassignedPlaceholder')}</option>
            {booking.assignedMechanicId &&
              !mechanics.some(m => m.uid === booking.assignedMechanicId) && (
                <option value={booking.assignedMechanicId}>
                  {booking.assignedMechanicName || t('serviceBookings.content.upcomingFormerMechanic')}
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

      {/* Time + location — hide location for external (already shown above) */}
      <div className="flex-shrink-0 text-right min-w-0 max-w-[56px]">
        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{time}</div>
        {!booking.isExternalProvider && (
          <div className="text-[10px] text-gray-400 truncate">{location}</div>
        )}
      </div>
    </div>
  )
}

// ─── Compact mini calendar (right panel) ─────────────────────────────────────
function MiniCalendar({
  selectedDate,
  bookings,
  onDateSelect,
  focusDate,
}: {
  selectedDate: Date
  bookings: ServiceBooking[]
  onDateSelect: (date: Date) => void
  focusDate?: Date | null
}) {
  const t = useT()
  const [viewDate, setViewDate] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  )

  // When parent passes a new focusDate (from search), jump to that month
  useEffect(() => {
    if (focusDate) {
      setViewDate(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1))
    }
  }, [focusDate])

  const monthNames = [
    t('serviceBookings.month.january'), t('serviceBookings.month.february'),
    t('serviceBookings.month.march'), t('serviceBookings.month.april'),
    t('serviceBookings.month.may'), t('serviceBookings.month.june'),
    t('serviceBookings.month.july'), t('serviceBookings.month.august'),
    t('serviceBookings.month.september'), t('serviceBookings.month.october'),
    t('serviceBookings.month.november'), t('serviceBookings.month.december'),
  ]
  const dayNames = [
    t('serviceBookings.miniCalDay.su'), t('serviceBookings.miniCalDay.mo'),
    t('serviceBookings.miniCalDay.tu'), t('serviceBookings.miniCalDay.we'),
    t('serviceBookings.miniCalDay.th'), t('serviceBookings.miniCalDay.fr'),
    t('serviceBookings.miniCalDay.sa'),
  ]

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build booking count map
  const bookingCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    bookings.forEach(b => {
      if (b.status === 'cancelled') return
      if (!map[b.date]) map[b.date] = 0
      map[b.date]++
    })
    return map
  }, [bookings])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-900 dark:text-white">
          {monthNames[month]} {year}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-[9px] font-semibold text-gray-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />

          const cellDate = new Date(year, month, day)
          cellDate.setHours(0, 0, 0, 0)
          const dateStr = toDateStr(cellDate)
          const isToday = cellDate.getTime() === today.getTime()
          const isSelected = cellDate.toDateString() === selectedDate.toDateString()
          const count = bookingCountMap[dateStr] || 0
          const hasBookings = count > 0

          return (
            <button
              key={day}
              onClick={() => onDateSelect(cellDate)}
              className={`
                relative flex flex-col items-center justify-center h-8 w-full rounded-lg text-xs font-medium
                transition-all duration-150
                ${isSelected
                  ? 'bg-[#025940] text-white shadow-md'
                  : isToday
                  ? 'bg-[#b3f243] text-[#012619] font-bold shadow-sm'
                  : hasBookings
                  ? 'hover:bg-[#025940]/10 text-gray-800 dark:text-gray-200'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                }
              `}
            >
              <span>{day}</span>
              {hasBookings && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#025940] dark:bg-[#72A68E]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ServiceBookingsContent() {
  const t = useT()
  const { user } = useAuth()
  const { vehicles, loading: fleetLoading } = useFleetData()
  const { checkedInVehicles } = useYardData()
  const { returnFromGarage } = useVehicleTransfers()
  const {
    bookings,
    loading: bookingsLoading,
    error,
    createBooking,
    updateBooking,
    deleteBooking,
    checkInToGarage,
    markAsCompleted,
    refreshBookings
  } = useServiceBookings()

  const { branches } = useBranches()
  // Customers used for the workshop blocks + details modal — looked up by
  // phone so we can show each customer's saved "preferred notes" inline.
  const { customers } = useCustomers()

  // 🛠️ Resolve the user's current branch from the URL (?branch=slug). Falls
  // back to the org's main branch when no slug is set or unknown. The bay
  // count from this branch caps how many bookings can share a time slot —
  // passed down to the modal and used by the conflict-handling logic below.
  const searchParams = useSearchParams()
  const branchSlugParam = searchParams?.get('branch') || 'main'
  const currentBranch = useMemo(() => {
    if (branches.length === 0) return null
    const direct = branches.find(b => b.slug === branchSlugParam)
    if (direct) return direct
    return branches.find(b => b.isMain) || branches[0] || null
  }, [branches, branchSlugParam])
  const currentBayCount =
    currentBranch?.serviceBayCount ?? DEFAULT_SERVICE_BAY_COUNT
  // Custom bay names for the current branch (display only). Index 0 = bay 1.
  const currentBayNames = currentBranch?.serviceBayNames

  // Branch name for subtitle + admin role gate for the Working Report button.
  // Both come from the same profile fetch so we don't pay for two reads.
  const [branchName, setBranchName] = useState<string>('')
  const [userRole, setUserRole] = useState<'admin' | 'member' | 'mechanic' | 'garage_manager' | null>(null)
  // Owner / Garage Manager may add / edit / reschedule / delete bookings;
  // regular admins keep operational actions only.
  const { canManageBookings } = usePermissions()
  useEffect(() => {
    if (!user?.uid) return
    userProfileService.getProfile(user.uid).then(p => {
      if (p?.role) setUserRole(p.role)
      if (branches.length > 0) {
        const mainBranch = branches.find(b => b.isMain)
        setBranchName(mainBranch?.name || '')
      }
    }).catch(() => {})
  }, [user?.uid, branches])
  const isAdmin = userRole === 'admin'

  // 📊 Working Report modal — admin-only.
  const [showWorkingReport, setShowWorkingReport] = useState(false)

  // ─── State ─────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  // selectedDateForModal is the date passed to the booking modal (can be null for "no date pre-selected")
  const [selectedDateForModal, setSelectedDateForModal] = useState<Date | null>(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [editingBooking, setEditingBooking] = useState<ServiceBooking | null>(null)
  const [viewMode, setViewMode] = useState<'today' | 'upcoming' | 'calendar' | 'list'>('today')
  // 🏭 Workshop view local filters — only used when the today view's
  // sub-toggle is set to 'workshop'. Kept separate from the booking
  // workspace's filters so switching between the two modes doesn't
  // cross-contaminate.
  const [workshopBayFilter, setWorkshopBayFilter] = useState<number | 'all'>('all')
  const [workshopMechanicFilter, setWorkshopMechanicFilter] = useState<string | 'all'>('all')
  const [workshopPartsFilter, setWorkshopPartsFilter] = useState<PartsStatus | 'all'>('all')
  // 🗓️ Workshop Day | Week sub-view. Week is a tablet/desktop-only
  // planning overview — never shown on phones (<768px). isWideScreen
  // tracks the breakpoint so resizing down from week snaps back to day.
  const [workshopView, setWorkshopView] = useState<'day' | 'week'>('day')
  const [isWideScreen, setIsWideScreen] = useState(true)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => {
      setIsWideScreen(mq.matches)
      if (!mq.matches) setWorkshopView('day') // phones: day only
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  // 🆕 Workspace mode replaces the booking modal for the create flow.
  // 'browse' = normal page (Today / Upcoming / Calendar / List).
  // 'new-booking' = the 3-column workspace (form + grid).
  // The workspace also handles EDIT now — when workspaceEditingBooking is
  // set the form prefills from it (minus the slot, which the user re-picks
  // by clicking the grid).
  const [pageMode, setPageMode] = useState<'browse' | 'new-booking'>('browse')
  const [workspaceEditingBooking, setWorkspaceEditingBooking] = useState<ServiceBooking | null>(null)
  // Read-only details modal that workshop block clicks open. From there the
  // user picks Edit (→ workspace edit mode) or Delete (→ confirmation).
  const [detailsBooking, setDetailsBooking] = useState<ServiceBooking | null>(null)
  // 🛞 Internal-only odometer prompt shown before completing a workshop job.
  const [mileagePromptBooking, setMileagePromptBooking] = useState<ServiceBooking | null>(null)
  const [mileageInput, setMileageInput] = useState('')
  // 🧩 Final parts review opened from the completion prompt (same JobPartsModal
  // used live on the card) — lets staff confirm/add the job's parts before
  // completing. Purely additive: never blocks completion.
  const [showCompletionParts, setShowCompletionParts] = useState(false)
  // 🍴 Pending lunch-break selection awaiting confirmation. Set when the
  // user clicks/drags empty cells in the workshop sub-view; a confirm
  // dialog gates the actual write so a stray tap can't create one.
  const [pendingLunch, setPendingLunch] = useState<{
    bay: number
    timeSlot: string
    slotCount: number
  } | null>(null)
  const [todayViewFilter, setTodayViewFilter] = useState<'today' | 'all' | 'workshop'>('workshop')
  const [searchReg, setSearchReg] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [miniCalendarFocusDate, setMiniCalendarFocusDate] = useState<Date | null>(null)

  // Calendar ref for navigation
  const calendarRef = useRef<ServiceCalendarRef>(null)

  // ─── Modal States ───────────────────────────────────────────────────────────
  const [modalStates, setModalStates] = useState<ModalStates>({
    showDeleteConfirm: false,
    showTimeSlotAlert: false,
    showErrorAlert: false,
    showSuccessAlert: false,
    showServiceCompletionModal: false,
    showServiceBayModal: false,
    errorMessage: '',
    successMessage: '',
    deleteBookingId: null,
    alertMessage: '',
    completionBooking: null,
    completionCallback: null,
    serviceBayDecision: null
  })

  // ─── Merge bookings with garage vehicles ────────────────────────────────────
  // ✅ PRESERVED: Exact same logic as original
  const mergedBookings = useMemo(() => {
    const existingBookingIds = new Set(bookings.map(b => b.id))

    const garageVehicles = (checkedInVehicles || [])
      .filter(v => {
        if (v.transferStatus !== 'at_external_garage') return false
        if (v.serviceBookingId && existingBookingIds.has(v.serviceBookingId)) {
          logger.log(`⏭️ Skipping fake booking for ${v.registration} - real booking ${v.serviceBookingId} exists`)
          return false
        }
        return true
      })
      .map(v => ({
        id: `garage-${v.id}`,
        date: new Date().toISOString().split('T')[0],
        registration: v.registration,
        make: v.make || '',
        model: v.model || '',
        workRequired: 'At External Garage',
        notes: v.externalGarageName ? `Currently at ${v.externalGarageName}` : 'At external garage',
        status: 'checked_in_to_garage' as const,
        isExternalProvider: true,
        externalProvider: {
          garageName: v.externalGarageName || 'External Garage',
          garageId: v.externalGarageName || ''
        },
        isCustomVehicle: false,
        organizationId: v.organizationId || '',
        createdBy: v.checkedOutToGarageBy || '',
        createdByName: v.checkedOutToGarageByName || '',
        createdAt: v.checkedOutToGarageAt || new Date(),
        serviceBay: 1,
        isGarageVehicle: true
      }))

    return [...bookings, ...garageVehicles] as ServiceBooking[]
  }, [bookings, checkedInVehicles])

  // ─── Set up modal handler for useServiceBookings hook ──────────────────────
  // ✅ PRESERVED: Exact same logic as original
  useEffect(() => {
    const modalHandler = {
      showConfirmation: (options: {
        title: string
        message: string
        onConfirm: () => void
        onCancel?: () => void
        confirmText?: string
        cancelText?: string
        variant?: 'default' | 'danger' | 'warning'
      }) => {
        if (options.title === 'Service Completed') {
          const booking = mergedBookings.find(b => options.message.includes(b.registration))
          if (booking) {
            setModalStates(prev => ({
              ...prev,
              showServiceCompletionModal: true,
              completionBooking: booking,
              completionCallback: {
                onConfirm: options.onConfirm,
                onCancel: options.onCancel || (() => {})
              }
            }))
          }
        } else {
          if (options.title.includes('Delete')) {
            setModalStates(prev => ({
              ...prev,
              showDeleteConfirm: true,
              deleteBookingId: 'temp'
            }))
          }
        }
      },
      showAlert: (options: {
        title: string
        message: string
        variant?: 'success' | 'error' | 'info'
      }) => {
        if (options.variant === 'error') {
          setModalStates(prev => ({ ...prev, errorMessage: options.message, showErrorAlert: true }))
        } else if (options.variant === 'success') {
          setModalStates(prev => ({ ...prev, successMessage: options.message, showSuccessAlert: true }))
        }
      }
    }

    setServiceBookingsModalHandler(modalHandler)

    return () => {
      setServiceBookingsModalHandler({ showConfirmation: () => {}, showAlert: () => {} })
    }
  }, [mergedBookings])

  // Reset match index when search changes
  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [searchReg])

  // ─── Modal helper functions ─────────────────────────────────────────────────
  const showError = (message: string) =>
    setModalStates(prev => ({ ...prev, errorMessage: message, showErrorAlert: true }))

  const showSuccess = (message: string) =>
    setModalStates(prev => ({ ...prev, successMessage: message, showSuccessAlert: true }))

  const showTimeSlotConflict = (message: string) =>
    setModalStates(prev => ({ ...prev, alertMessage: message, showTimeSlotAlert: true }))

  const closeError = () =>
    setModalStates(prev => ({ ...prev, showErrorAlert: false, errorMessage: '' }))

  const closeSuccess = () =>
    setModalStates(prev => ({ ...prev, showSuccessAlert: false, successMessage: '' }))

  const closeTimeSlotAlert = () =>
    setModalStates(prev => ({ ...prev, showTimeSlotAlert: false, alertMessage: '' }))

  // ─── Service Bay Logic ──────────────────────────────────────────────────────
  // 🛠️ Cap-aware + multi-slot aware. Walks bays 1..currentBayCount and
  // returns the lowest one that's free across **every** slot the booking
  // would occupy. Returns `null` when no bay is free across the full span
  // (caller must refuse the booking with a clear message).
  //
  // `excludeBookingId` is critical when editing: the booking being edited
  // shouldn't count against itself, otherwise extending its own span makes
  // it look like the slot is double-booked.
  const getNextAvailableBay = (
    date: string,
    timeSlot: string,
    excludeBookingId?: string,
    slotCount: number = 1,
  ): number | null => {
    // Build the requested slot range by walking forward N slots from start.
    const startIdx = TIME_SLOTS.findIndex(s => s.id === timeSlot)
    const span = Math.max(1, slotCount)
    const requestedSlotIds: string[] =
      startIdx >= 0
        ? TIME_SLOTS.slice(startIdx, startIdx + span).map(s => s.id)
        : [timeSlot]

    // Collect every bay that's busy in ANY slot of the range. Other bookings
    // contribute their own range to the busy set (multi-slot aware via
    // bookingCoversSlot).
    const busy = new Set<number>()
    for (const b of mergedBookings) {
      if (b.id === excludeBookingId) continue
      if (b.date !== date) continue
      if (b.status === 'cancelled' || b.isExternalProvider) continue
      const bay = b.serviceBay || 1
      const overlaps = requestedSlotIds.some(slotId => bookingCoversSlot(b, slotId))
      if (overlaps) busy.add(bay)
    }

    for (let bay = 1; bay <= currentBayCount; bay++) {
      if (!busy.has(bay)) return bay
    }
    return null
  }

  const showServiceBayConfirmation = (
    bookingData: any,
    conflictingBookings: ServiceBooking[],
    availableBay: number,
    onConfirm: (useBay: number) => void,
    onCancel: () => void
  ) => {
    setModalStates(prev => ({
      ...prev,
      showServiceBayModal: true,
      serviceBayDecision: { bookingData, conflictingBookings, availableBay, onConfirm, onCancel }
    }))
  }

  // ─── Booking Handlers ───────────────────────────────────────────────────────

  // Calendar date click → open new booking modal for that specific date
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setSelectedDateForModal(date)
    setEditingBooking(null)
    setShowBookingModal(true)
  }

  // Mini-calendar click in today view → select date (don't open modal).
  // Default to the Workshop schedule for whichever day you land on (today OR a
  // future date), so planning ahead opens the same workshop grid as the current day.
  const handleMiniCalendarDateSelect = (date: Date) => {
    setSelectedDate(date)
    setTodayViewFilter('workshop')
    // Switch to today view if not already
    if (viewMode !== 'today') setViewMode('today')
  }

  // ✅ PRESERVED: Full create with service bay conflict detection (exact same as original)
  const handleCreateBooking = async (
    bookingData: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >
  ) => {
    if (!user) return false
    if (!canManageBookings) { toast.error(t('serviceBookings.perm.managerOnly')); return false }

    if (!bookingData.isExternalProvider) {
      // 🕐 Multi-slot + bay-aware conflict scan. The user picked a bay on
      // the workshop grid (or the form's bay buttons), so a "conflict"
      // only exists when ANOTHER booking is on THAT SAME BAY at any slot
      // in the requested range. Bookings on a different bay at the same
      // time are fine — that's what extra bays are for.
      const requestedSpan = Math.max(1, bookingData.slotCount ?? 1)
      const requestedStartIdx = TIME_SLOTS.findIndex(s => s.id === bookingData.timeSlot)
      const requestedSlotIds = requestedStartIdx >= 0
        ? TIME_SLOTS.slice(requestedStartIdx, requestedStartIdx + requestedSpan).map(s => s.id)
        : [bookingData.timeSlot]

      const requestedBay =
        typeof bookingData.serviceBay === 'number' && bookingData.serviceBay >= 1
          ? bookingData.serviceBay
          : 1

      const conflictingBookings = mergedBookings.filter(
        b => b.date === bookingData.date &&
             b.status !== 'cancelled' &&
             !b.isExternalProvider &&
             (b.serviceBay || 1) === requestedBay &&
             requestedSlotIds.some(sid => bookingCoversSlot(b, sid))
      )

      if (conflictingBookings.length > 0) {
        const nextBay = getNextAvailableBay(
          bookingData.date,
          bookingData.timeSlot,
          undefined,
          requestedSpan,
        )

        // 🛠️ Slot full — every bay in the branch's cap is occupied across
        // at least one slot in the requested range. Refuse the booking
        // with a clear message instead of inventing bay N+1.
        if (nextBay === null) {
          showError(
            t('serviceBookings.content.errAllBaysOccupied', {
              count: currentBayCount,
              range: requestedSpan === 1
                ? t('serviceBookings.content.rangeSelectedSlot')
                : t('serviceBookings.content.rangeMultiSlot', { count: requestedSpan }),
            }),
          )
          return false
        }

        return new Promise<boolean>((resolve) => {
          showServiceBayConfirmation(
            bookingData,
            conflictingBookings,
            nextBay,
            async (bayNumber: number) => {
              try {
                await createBooking({
                  ...bookingData,
                  serviceBay: bayNumber,
                  organizationId: user.uid,
                  createdBy: user.uid,
                  createdByName: user.displayName || user.email || 'Unknown User',
                  createdAt: new Date(),
                  status: 'scheduled'
                })
                setShowBookingModal(false)
                setSelectedDateForModal(null)
                setModalStates(prev => ({ ...prev, showServiceBayModal: false, serviceBayDecision: null }))
                showSuccess(t('serviceBookings.content.createSuccessWithBay', { bay: bayNumber }))
                resolve(true)
              } catch (err) {
                logger.error('Error creating booking:', err)
                showError(
                  (err as { code?: string })?.code === '23505'
                    ? t('serviceBookings.content.errDuplicateSlot')
                    : t('serviceBookings.content.createError'),
                )
                resolve(false)
              }
            },
            () => {
              setModalStates(prev => ({ ...prev, showServiceBayModal: false, serviceBayDecision: null }))
              resolve(false)
            }
          )
        })
      }
    }

    try {
      // Respect the bay picked on the workshop grid. Only fall back to
      // bay 1 when the booking has no bay (legacy modal path or external).
      const bayToSave =
        typeof bookingData.serviceBay === 'number' && bookingData.serviceBay >= 1
          ? bookingData.serviceBay
          : 1
      await createBooking({
        ...bookingData,
        serviceBay: bayToSave,
        organizationId: user.uid,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Unknown User',
        createdAt: new Date(),
        status: 'scheduled'
      })
      setShowBookingModal(false)
      setSelectedDateForModal(null)
      showSuccess(t('serviceBookings.content.createSuccess'))
      return true
    } catch (err) {
      logger.error('Error creating booking:', err)
      showError(
        (err as { code?: string })?.code === '23505'
          ? t('serviceBookings.content.errDuplicateSlot')
          : t('serviceBookings.content.createError'),
      )
      return false
    }
  }

  // edit button → open modal (structural edit — owner / Garage Manager only)
  const handleEditBooking = (booking: ServiceBooking) => {
    if (!canManageBookings) { toast.error(t('serviceBookings.perm.managerOnly')); return }
    setEditingBooking(booking)
    setSelectedDateForModal(new Date(booking.date + 'T00:00:00'))
    setShowBookingModal(true)
  }

  // ✅ PRESERVED: Full update with service bay conflict detection (exact same as original)
  const handleUpdateBooking = async (
    bookingData: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >
  ) => {
    if (!editingBooking?.id) return false

    if (!bookingData.isExternalProvider) {
      // 🛠️ If the user didn't move the booking to a different date/slot AND
      // the span is unchanged, there's no bay re-allocation needed — preserve
      // the existing bay and skip both the "full" check and the confirmation
      // modal entirely.
      const slotUnchanged =
        bookingData.date === editingBooking.date &&
        bookingData.timeSlot === editingBooking.timeSlot &&
        (bookingData.slotCount ?? 1) === (editingBooking.slotCount ?? 1) &&
        editingBooking.isExternalProvider === bookingData.isExternalProvider

      // 🕐 Multi-slot + bay-aware conflict scan. The user explicitly picked
      // a bay on the workshop grid, so a "conflict" only exists when
      // ANOTHER booking is on THAT SAME BAY at any slot in the requested
      // range. Bookings on other bays at the same time are NOT conflicts —
      // that's the whole point of having multiple bays.
      const requestedSpan = Math.max(1, bookingData.slotCount ?? 1)
      const requestedStartIdx = TIME_SLOTS.findIndex(s => s.id === bookingData.timeSlot)
      const requestedSlotIds = requestedStartIdx >= 0
        ? TIME_SLOTS.slice(requestedStartIdx, requestedStartIdx + requestedSpan).map(s => s.id)
        : [bookingData.timeSlot]

      const requestedBay =
        typeof bookingData.serviceBay === 'number' && bookingData.serviceBay >= 1
          ? bookingData.serviceBay
          : (editingBooking.serviceBay || 1)

      const conflictingBookings = mergedBookings.filter(
        b => b.id !== editingBooking.id &&
             b.date === bookingData.date &&
             b.status !== 'cancelled' &&
             !b.isExternalProvider &&
             (b.serviceBay || 1) === requestedBay &&
             requestedSlotIds.some(sid => bookingCoversSlot(b, sid))
      )

      if (!slotUnchanged && conflictingBookings.length > 0) {
        // Bay the user wanted is taken — find any free alternative.
        const nextBay = getNextAvailableBay(
          bookingData.date,
          bookingData.timeSlot,
          editingBooking.id,
          requestedSpan,
        )

        // 🛠️ Slot full across every bay — refuse the update.
        if (nextBay === null) {
          showError(
            t('serviceBookings.content.errAllBaysOccupied', {
              count: currentBayCount,
              range: requestedSpan === 1
                ? t('serviceBookings.content.rangeSelectedSlot')
                : t('serviceBookings.content.rangeMultiSlot', { count: requestedSpan }),
            }),
          )
          return false
        }

        return new Promise<boolean>((resolve) => {
          showServiceBayConfirmation(
            bookingData,
            conflictingBookings,
            nextBay,
            async (bayNumber: number) => {
              try {
                await updateBooking(editingBooking.id, {
                  ...bookingData,
                  serviceBay: bayNumber
                })
                setShowBookingModal(false)
                setEditingBooking(null)
                setSelectedDateForModal(null)
                setModalStates(prev => ({ ...prev, showServiceBayModal: false, serviceBayDecision: null }))
                showSuccess(t('serviceBookings.content.updateSuccessWithBay', { bay: bayNumber }))
                resolve(true)
              } catch (err) {
                logger.error('Error updating booking:', err)
                showError(
                  (err as { code?: string })?.code === '23505'
                    ? t('serviceBookings.content.errDuplicateSlot')
                    : t('serviceBookings.content.updateError'),
                )
                resolve(false)
              }
            },
            () => {
              setModalStates(prev => ({ ...prev, showServiceBayModal: false, serviceBayDecision: null }))
              resolve(false)
            }
          )
        })
      }
    }

    try {
      // Respect the bay the user picked on the grid. Falls back to the
      // booking's existing bay only when serviceBay isn't supplied (legacy
      // modal path or external provider).
      const bayToSave =
        typeof bookingData.serviceBay === 'number' && bookingData.serviceBay >= 1
          ? bookingData.serviceBay
          : (editingBooking.serviceBay || 1)
      await updateBooking(editingBooking.id, {
        ...bookingData,
        serviceBay: bayToSave,
      })
      setShowBookingModal(false)
      setEditingBooking(null)
      setSelectedDateForModal(null)
      showSuccess(t('serviceBookings.content.updateSuccess'))
      return true
    } catch (err) {
      logger.error('Error updating booking:', err)
      showError(
        (err as { code?: string })?.code === '23505'
          ? t('serviceBookings.content.errDuplicateSlot')
          : t('serviceBookings.content.updateError'),
      )
      return false
    }
  }

  // delete - Professional modal version
  // ⚠️ IMPORTANT: IDs starting with "garage-" are SYNTHETIC entries built from
  // checkedInVehicles (transferStatus === 'at_external_garage'). They have no
  // Firestore doc in serviceBookings, so we must clear the vehicle's garage
  // status via returnFromGarage instead of calling deleteBooking.
  const handleDeleteBooking = async (bookingId: string) => {
    if (!canManageBookings) { toast.error(t('serviceBookings.perm.managerOnly')); return }
    setModalStates(prev => ({ ...prev, deleteBookingId: bookingId, showDeleteConfirm: true }))
  }

  const handleDeleteConfirm = async () => {
    const bookingId = modalStates.deleteBookingId
    if (!bookingId) return

    const isSyntheticGarage = bookingId.startsWith('garage-')

    try {
      if (isSyntheticGarage) {
        // Synthetic entry — the real data is in checkedInVehicles.
        // Clear the garage status by calling returnFromGarage with the real vehicle ID.
        const vehicleId = bookingId.replace('garage-', '')
        const result = await returnFromGarage(vehicleId)
        if (!result.success) {
          throw new Error(result.message || t('serviceBookings.content.deleteErrorRemoveGarageEntry'))
        }
      } else {
        // Real Firestore serviceBookings document — delete it normally
        await deleteBooking(bookingId)
      }

      setModalStates(prev => ({ ...prev, showDeleteConfirm: false, deleteBookingId: null }))
      showSuccess(t('serviceBookings.content.deleteSuccess'))
    } catch (err) {
      logger.error('Error deleting booking:', err)
      showError(t('serviceBookings.content.deleteError'))
    }
  }

  // Check-in to garage handler
  const handleCheckInToGarage = async (booking: ServiceBooking) => {
    try {
      await checkInToGarage(booking)
      showSuccess(t('serviceBookings.checkin.successMessageNoGarage', { registration: booking.registration }))
    } catch (err) {
      logger.error('Error checking in to garage:', err)
      showError(t('serviceBookings.checkin.errorMessage'))
    }
  }

  // ✅ PRESERVED: Mark as completed with garage vehicle handling (exact same as original)
  // Shared completion finisher — used by the external/garage path and by
  // the internal mileage prompt (with or without a reading).
  const finalizeMarkCompleted = async (booking: ServiceBooking, mileage?: number) => {
    try {
      await markAsCompleted(booking, mileage)
      showSuccess(t('serviceBookings.content.completeMarkedCompletedSuccess', { registration: booking.registration }))
    } catch (err) {
      logger.error('Error marking as completed:', err)
      showError(t('serviceBookings.content.completeErrorMarkCompleted'))
    }
  }

  const handleMarkCompleted = async (booking: ServiceBooking) => {
    if ((booking as any).isGarageVehicle) {
      const vehicleId = booking.id.replace('garage-', '')
      try {
        const result = await returnFromGarage(vehicleId)
        if (result.success) {
          showSuccess(t('serviceBookings.content.completeReturnedFromGarageSuccess', { registration: booking.registration, garageName: booking.externalProvider?.garageName || t('serviceBookings.content.completeFallbackGarage') }))
        } else {
          showError(result.message || t('serviceBookings.content.completeErrorReturnFromGarage'))
        }
      } catch (err) {
        logger.error('Error returning vehicle from garage:', err)
        showError(t('serviceBookings.content.completeErrorReturnFromGarageRetry'))
      }
      return
    }
    // INTERNAL workshop job → ask for an optional odometer reading first.
    // External-provider / vehicle-at-garage completions skip the prompt (the
    // context shows its own check-back-in confirmation for those).
    const isInternal = !booking.isExternalProvider && booking.status !== 'checked_in_to_garage'
    if (isInternal) {
      setMileageInput('')
      setMileagePromptBooking(booking)
      return
    }
    await finalizeMarkCompleted(booking)
  }

  // "Start" a scheduled booking → mark as in-progress
  const handleStartBooking = async (booking: ServiceBooking) => {
    try {
      await updateBooking(booking.id, { ...booking, status: 'in-progress' })
      showSuccess(t('serviceBookings.content.startSuccessInProgress', { registration: booking.registration }))
    } catch (err) {
      showError(t('serviceBookings.content.startError'))
    }
  }

  // Return from garage (from today view)
  const handleReturnFromGarage = async (booking: ServiceBooking) => {
    if ((booking as any).isGarageVehicle) {
      const vehicleId = booking.id.replace('garage-', '')
      try {
        const result = await returnFromGarage(vehicleId)
        if (result.success) {
          showSuccess(t('serviceBookings.content.returnSuccessFromGarage', { registration: booking.registration }))
        } else {
          showError(result.message || t('serviceBookings.content.returnErrorReturnVehicle'))
        }
      } catch (err) {
        showError(t('serviceBookings.content.returnErrorReturnFromGarage'))
      }
      return
    }
    await handleMarkCompleted(booking)
  }

  // modal close
  const handleCloseModal = () => {
    setShowBookingModal(false)
    setEditingBooking(null)
    setSelectedDateForModal(null)
  }

  // 🍴 Lunch break — clicking or drag-selecting empty cells in the
  // workshop sub-view drops a "Lunch Break" booking straight into
  // Firestore, no form, no modal. The grid already conflict-clamps
  // drag-select so the slots are guaranteed empty; we skip the create
  // pipeline's bay-conflict modal too. Click the resulting block to
  // delete via the details modal.
  const handleAddLunchBreak = async (
    bay: number,
    timeSlot: string,
    slotCount: number = 1,
  ) => {
    if (!user || !timeSlot) return
    try {
      await createBooking({
        date: toDateStr(selectedDate),
        timeSlot,
        slotCount,
        serviceBay: bay,
        registration: 'LUNCH',
        make: '',
        model: '',
        workRequired: 'Lunch Break',
        isCustomVehicle: true,
        notes: '',
        status: 'scheduled' as const,
        isExternalProvider: false,
        organizationId: user.uid,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Unknown User',
        createdAt: new Date(),
      })
      showSuccess(t('serviceBookings.content.lunchSuccessAdded', { bay, minutes: slotCount * 30 }))
    } catch (err) {
      logger.error('Error adding lunch break:', err)
      showError(t('serviceBookings.content.lunchErrorAdd'))
    }
  }

  // Drag/resize from the workshop schedule grid. Conflict detection
  // already ran client-side in the grid (the grid wouldn't have called
  // this if the drop was red), so we update Firestore directly without
  // re-running the bay-conflict modal flow. Synthetic garage entries can't
  // be dragged — they have no real document — so guard those.
  const handleBookingDragUpdate = async (
    bookingId: string,
    changes: {
      serviceBay?: number
      timeSlot?: string
      slotCount?: number
      partsStatus?: PartsStatus
    },
  ) => {
    if (bookingId.startsWith('garage-')) return
    if (!canManageBookings) { toast.error(t('serviceBookings.perm.managerOnly')); return }
    try {
      await updateBooking(bookingId, changes)
    } catch (err) {
      logger.error('Error updating booking from drag:', err)
      showError(t('serviceBookings.content.dragUpdateError'))
    }
  }

  // Workspace edit-mode save. Delegates to handleUpdateBooking (which
  // already runs the bay-conflict pipeline + writes), then returns the
  // page to browse mode and clears the workspace edit state. The form
  // panel awaits this result and skips its post-save reset when ok=true
  // (it's pointless — the workspace has already closed).
  const handleWorkspaceUpdate = async (
    bookingData: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >,
  ) => {
    const ok = await handleUpdateBooking(bookingData)
    if (ok) {
      setPageMode('browse')
      setWorkspaceEditingBooking(null)
      // editingBooking was already cleared by handleUpdateBooking on its
      // success path; no need to clear again.
    }
    return ok
  }

  // Refresh handler with spinner
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try { await refreshBookings() } catch {} finally { setIsRefreshing(false) }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const isTimeSlotAvailable = (date: string, slot: string) => {
    const conflictingBookings = mergedBookings.filter(b =>
      b.date === date &&
      b.timeSlot === slot &&
      b.status !== 'cancelled' &&
      !b.isExternalProvider
    )
    return true
  }

  const getBookingsForDate = (date: string): ServiceBooking[] =>
    mergedBookings.filter(b => b.date === date && b.status !== 'cancelled')

  const getMatchingBookings = (reg: string): ServiceBooking[] => {
    if (!reg || reg.length === 0) return []
    return mergedBookings.filter(b =>
      b.registration &&
      b.registration.toLowerCase().includes(reg.toLowerCase()) &&
      b.status !== 'cancelled'
    )
  }

  const getMatchingDates = (reg: string): string[] => {
    const matchingBookings = getMatchingBookings(reg)
    return [...new Set(matchingBookings.map(b => b.date))].sort()
  }

  const handleNavigateToMatchingDate = () => {
    const matchingDates = getMatchingDates(searchReg)
    if (matchingDates.length === 0) return
    const nextIndex = currentMatchIndex % matchingDates.length
    const targetDateStr = matchingDates[nextIndex]
    const [year, month, day] = targetDateStr.split('-').map(Number)
    const targetDate = new Date(year, month - 1, day)
    targetDate.setHours(0, 0, 0, 0)

    // Navigate big calendar if in calendar view
    if (calendarRef.current) {
      calendarRef.current.navigateToDate(targetDate)
    }

    // In today/upcoming view: select the date + drive mini calendar to that month
    if (viewMode === 'today' || viewMode === 'upcoming') {
      setSelectedDate(targetDate)
      setMiniCalendarFocusDate(new Date(year, month - 1, 1))
      setTodayViewFilter('today')
      if (viewMode !== 'today') setViewMode('today')
    }

    setCurrentMatchIndex(nextIndex + 1)
  }

  // ─── Statistics ─────────────────────────────────────────────────────────────
  const totalBookings = mergedBookings.length
  const scheduledBookings = mergedBookings.filter(b => b.status === 'scheduled').length
  const checkedInToGarageBookings = mergedBookings.filter(b => b.status === 'checked_in_to_garage').length
  const completedBookings = mergedBookings.filter(b => b.status === 'completed').length
  // 🧾 Completed jobs awaiting an invoice (clean-slate: pre-existing completed
  // jobs were marked no_invoice_needed by migration 0040, so only jobs
  // completed from now on surface here).
  const notInvoicedBookings = mergedBookings.filter(
    b => b.status === 'completed' && !b.invoiceId && !b.noInvoiceNeeded,
  ).length
  const externalBookings = mergedBookings.filter(b => b.isExternalProvider).length

  // Upcoming bookings (future, not completed/cancelled) for the right-panel mini list
  const todayStr = toDateStr(new Date())
  const upcomingBookings = mergedBookings
    .filter(b => b.date > todayStr && b.status !== 'cancelled' && b.status !== 'completed')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.timeSlot || '').localeCompare(b.timeSlot || ''))
    .slice(0, 5)

  const matchingDates = getMatchingDates(searchReg)
  const currentlyShowingIndex = currentMatchIndex > 0
    ? ((currentMatchIndex - 1) % matchingDates.length) + 1
    : 0

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (fleetLoading || bookingsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-[#025940]" />
            <p className="text-lg font-medium text-[#0D0D0D] dark:text-white">
              {t('serviceBookings.content.loadingBookings')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 px-4 sm:px-6 lg:px-8 pt-2 pb-6 sm:pt-6">

      {/* ══════════════════════════════════════════════════════════════════════
          TOP BAR: Title + Search + View Toggles + Book button
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Mobile toolbar (sm:hidden): 3 compact rows ── */}
      <div className="sm:hidden flex flex-col gap-2">
        {/* Row 1: title + ⋮ menu (Working Report / Calendar / Refresh) */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight truncate">
              {t('serviceBookings.content.pageTitle')}
            </h1>
            {branchName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{branchName}</p>
            )}
          </div>
          <ToolbarKebab
            isAdmin={isAdmin}
            refreshing={isRefreshing || bookingsLoading}
            onWorkingReport={() => setShowWorkingReport(true)}
            onCalendar={() => { setViewMode('calendar'); setPageMode('browse') }}
            onRefresh={handleRefresh}
            labels={{
              menu: t('serviceBookings.content.moreMenu'),
              workingReport: t('serviceBookings.content.workingReportButton'),
              calendar: t('serviceBookings.content.viewModeCalendar'),
              refresh: t('serviceBookings.common.refresh'),
            }}
          />
        </div>

        {/* Row 2: Today / Upcoming toggle + Book */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {(['today', 'upcoming'] as const).map(key => (
              <button
                key={key}
                onClick={() => {
                  setViewMode(key)
                  setPageMode('browse')
                  if (key === 'today') {
                    const now = new Date()
                    now.setHours(0, 0, 0, 0)
                    setSelectedDate(now)
                    setMiniCalendarFocusDate(new Date(now.getFullYear(), now.getMonth(), 1))
                    setTodayViewFilter('workshop')
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === key
                    ? key === 'today'
                      ? 'bg-[#025940] text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {key === 'today'
                  ? t('serviceBookings.content.viewModeToday')
                  : t('serviceBookings.content.viewModeUpcoming')}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setEditingBooking(null)
              setPageMode('new-booking')
            }}
            className={`flex items-center gap-1.5 ${
              pageMode === 'new-booking'
                ? 'bg-[#9fd93a] ring-2 ring-[#025940]/40'
                : 'bg-[#b3f243] hover:bg-[#9fd93a]'
            } text-[#012619] text-sm font-bold px-4 py-1.5 rounded-lg transition-colors shadow-sm whitespace-nowrap`}
          >
            <Plus className="w-4 h-4" />
            {pageMode === 'new-booking'
              ? t('serviceBookings.content.bookButtonInProgress')
              : t('serviceBookings.content.bookButton')}
          </button>
        </div>

        {/* Row 3: search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchReg}
            onChange={e => setSearchReg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNavigateToMatchingDate()}
            placeholder={t('serviceBookings.content.searchPlaceholder')}
            className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940]"
          />
          {searchReg && (
            <button
              onClick={() => setSearchReg('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Desktop / tablet toolbar (sm+): original single row, unchanged ── */}
      <div className="hidden sm:flex sm:flex-row sm:items-center gap-3">

        {/* Left: title + branch */}
        <div className="flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
            {t('serviceBookings.content.pageTitle')}
          </h1>
          {branchName && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{branchName}</p>
          )}
        </div>

        {/* Centre: search */}
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchReg}
              onChange={e => setSearchReg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNavigateToMatchingDate()}
              placeholder={t('serviceBookings.content.searchPlaceholder')}
              className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940]"
            />
            {searchReg && (
              <button
                onClick={() => setSearchReg('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Search result badges */}
          {searchReg && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="flex items-center gap-1 whitespace-nowrap">
                <Car className="w-3 h-3" />
                {t('serviceBookings.content.searchMatchesBadge', { count: getMatchingBookings(searchReg).length })}
              </Badge>
              {matchingDates.length > 0 && (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 text-[#025940] border-[#72A68E] cursor-pointer hover:bg-[#72A68E]/20 hover:border-[#025940] transition-all duration-200 hover:shadow-md active:scale-95 whitespace-nowrap"
                  onClick={handleNavigateToMatchingDate}
                  title={t('serviceBookings.content.searchNavigateTitle', { current: currentlyShowingIndex, total: matchingDates.length })}
                >
                  <Calendar className="w-3 h-3" />
                  <span className="select-none">{matchingDates.length} {matchingDates.length === 1 ? t('serviceBookings.content.searchDaysSingular') : t('serviceBookings.content.searchDaysPlural')}</span>
                  {matchingDates.length > 1 && (
                    <>
                      <span className="text-xs opacity-70 select-none">({currentlyShowingIndex}/{matchingDates.length})</span>
                      <ChevronRight className="w-3 h-3 transition-transform hover:translate-x-0.5" />
                    </>
                  )}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Right: view toggles + refresh + Book */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {/* View mode buttons */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {([
              { key: 'today' as const, label: t('serviceBookings.content.viewModeToday') },
              { key: 'upcoming' as const, label: t('serviceBookings.content.viewModeUpcoming') },
              { key: 'calendar' as const, label: t('serviceBookings.content.viewModeCalendar') },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setViewMode(key)
                  setPageMode('browse')
                  // Clicking "Today" resets to actual current day
                  if (key === 'today') {
                    const now = new Date()
                    now.setHours(0, 0, 0, 0)
                    setSelectedDate(now)
                    setMiniCalendarFocusDate(new Date(now.getFullYear(), now.getMonth(), 1))
                    setTodayViewFilter('workshop')
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === key
                    ? key === 'today'
                      ? 'bg-[#025940] text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || bookingsLoading}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title={t('serviceBookings.common.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing || bookingsLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* 📊 Working Report — admin-only. Hidden for members & mechanics. */}
          {isAdmin && (
            <button
              onClick={() => setShowWorkingReport(true)}
              className="flex items-center gap-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-[#025940] dark:text-[#72A68E] text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border border-[#72A68E]/40 whitespace-nowrap"
              title={t('serviceBookings.content.workingReportButtonTitle')}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {t('serviceBookings.content.workingReportButton')}
            </button>
          )}

          {/* + Book — opens the 3-column workspace (form + workshop schedule
              grid + rules panel). Owner / Garage Manager only; editing an
              existing booking still opens the old modal via handleEditBooking. */}
          {canManageBookings && (
          <button
            onClick={() => {
              setEditingBooking(null)
              setPageMode('new-booking')
            }}
            className={`flex items-center gap-1.5 ${
              pageMode === 'new-booking'
                ? 'bg-[#9fd93a] ring-2 ring-[#025940]/40'
                : 'bg-[#b3f243] hover:bg-[#9fd93a]'
            } text-[#012619] text-sm font-bold px-4 py-1.5 rounded-lg transition-colors shadow-sm whitespace-nowrap`}
          >
            <Plus className="w-4 h-4" />
            {pageMode === 'new-booking' ? t('serviceBookings.content.bookButtonInProgress') : t('serviceBookings.content.bookButton')}
          </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          STATS BAR: 4 stat cards — hidden on mobile to maximise vertical space
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: t('serviceBookings.content.statsTotal'),      value: totalBookings,             bg: 'bg-[#025940]/8 dark:bg-[#025940]/20',   color: 'text-[#025940] dark:text-[#72A68E]', img: '/total.svg'  },
          { label: t('serviceBookings.content.statsScheduled'),  value: scheduledBookings,         bg: 'bg-[#72A68E]/15 dark:bg-[#72A68E]/10',  color: 'text-[#025940] dark:text-[#72A68E]', img: '/appointments.svg' },
          { label: t('serviceBookings.content.statsCompleted'),  value: completedBookings,         bg: 'bg-[#b3f243]/20 dark:bg-[#b3f243]/10',  color: 'text-[#012619] dark:text-[#b3f243]', img: '/completed.svg' },
          { label: t('serviceBookings.content.statsAtGarage'),  value: checkedInToGarageBookings, bg: 'bg-[#025940]/5 dark:bg-[#025940]/15',   color: 'text-[#025940] dark:text-[#72A68E]', img: '/external.svg'    },
          { label: t('serviceBookings.invoice.notInvoiced'),   value: notInvoicedBookings,       bg: 'bg-amber-100/70 dark:bg-amber-900/20',  color: 'text-amber-700 dark:text-amber-300', img: ''                },
        ].map(({ label, value, bg, color, img }) => (
          <div
            key={label}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl ${bg} border border-[#025940]/20 dark:border-[#025940]/40`}
          >
            {img && (
              <img
                src={img}
                alt={label}
                className="w-8 h-8 object-contain flex-shrink-0"
              />
            )}
            <div>
              <div className={`text-xl font-bold ${color} leading-none`}>{value}</div>
              <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-0.5">
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-4 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
      ══════════════════════════════════════════════════════════════════════ */}

      {/* ── 🆕 BOOKING WORKSPACE (replaces modal for create flow) ──────────── */}
      {pageMode === 'new-booking' && (
        <BookingWorkspace
          bookings={mergedBookings}
          vehicles={vehicles}
          bayCount={currentBayCount}
          bayNames={currentBayNames}
          initialDate={selectedDate}
          editingBooking={workspaceEditingBooking}
          customers={customers}
          onCreate={handleCreateBooking}
          onUpdate={handleWorkspaceUpdate}
          onClose={() => {
            setPageMode('browse')
            setWorkspaceEditingBooking(null)
            setEditingBooking(null)
          }}
          // Block clicks open the read-only details modal — Edit there
          // switches the workspace into edit mode for that booking.
          onBookingEdit={setDetailsBooking}
          onBookingUpdate={canManageBookings ? handleBookingDragUpdate : undefined}
        />
      )}

      {/* ── TODAY VIEW ─────────────────────────────────────────────────────── */}
      {pageMode === 'browse' && viewMode === 'today' && (
        <div className="flex flex-col lg:flex-row gap-4">

          {/* Left: Today agenda */}
          <div className="flex-1 min-w-0 bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-5 shadow-sm">
            <ServiceTodayView
              selectedDate={selectedDate}
              bookings={mergedBookings}
              onMarkCompleted={handleMarkCompleted}
              onStartBooking={handleStartBooking}
              onReturnFromGarage={handleReturnFromGarage}
              onCheckInToGarage={handleCheckInToGarage}
              onBookingEdit={handleEditBooking}
              onBookingDelete={handleDeleteBooking}
              onAddBooking={(date) => {
                setSelectedDateForModal(date)
                setEditingBooking(null)
                setShowBookingModal(true)
              }}
              viewFilter={todayViewFilter}
              onViewFilterChange={setTodayViewFilter}
              // 🏭 Workshop sub-view: bay × time grid for the selected date.
              // View-only — clicking a booking opens the edit modal, drag /
              // resize updates Firestore, empty cells are inert (use the
              // page's "+ Book" button to create new bookings).
              workshopContent={
                <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-b-2xl overflow-hidden">
                  <WorkshopGridFilters
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    bayCount={currentBayCount}
                    bayNames={currentBayNames}
                    bayFilter={workshopBayFilter}
                    onBayFilterChange={setWorkshopBayFilter}
                    mechanicFilter={workshopMechanicFilter}
                    onMechanicFilterChange={setWorkshopMechanicFilter}
                    partsFilter={workshopPartsFilter}
                    onPartsFilterChange={setWorkshopPartsFilter}
                  />
                  {/* Day | Week — Week is a tablet/desktop-only planning
                      overview; the toggle is hidden on phones and the
                      >=768px guard forces 'day' there. */}
                  {isWideScreen && (
                    <div className="hidden md:flex items-center gap-1 px-3 sm:px-4 py-1 border-b border-gray-100 dark:border-gray-700">
                      {(['day', 'week'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setWorkshopView(v)}
                          className={`px-3 py-1 rounded-md text-xs font-black transition-all ${
                            workshopView === v
                              ? 'bg-[#025940] text-white shadow-sm'
                              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                          }`}
                        >
                          {v === 'day' ? t('serviceBookings.today.workshopDayToggle') : t('serviceBookings.today.workshopWeekToggle')}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 📡 NASDAQ-style ticker for external-provider bookings on
                      the selected day. External jobs have no bay column, so
                      they'd otherwise be invisible in workshop view. Hidden
                      automatically when there are none. Click a chip to open
                      the booking details modal. */}
                  <ExternalBookingsTicker
                    bookings={mergedBookings}
                    selectedDate={selectedDate}
                    onBookingClick={setDetailsBooking}
                  />
                  {workshopView === 'week' && isWideScreen ? (
                    <WorkshopWeekGrid
                      selectedDate={selectedDate}
                      bookings={mergedBookings}
                      bayCount={currentBayCount}
                      bayNames={currentBayNames}
                      mechanicFilter={workshopMechanicFilter}
                      partsFilter={workshopPartsFilter}
                      onPickDate={setSelectedDate}
                      onOpenDay={(d) => {
                        setSelectedDate(d)
                        setWorkshopView('day')
                      }}
                      onBookingEdit={(b) => {
                        if (b.id.startsWith('garage-')) return
                        setWorkspaceEditingBooking(b)
                        setEditingBooking(b)
                        setPageMode('new-booking')
                      }}
                    />
                  ) : (
                  <div className="flex-1 overflow-auto">
                    <WorkshopScheduleGrid
                      selectedDate={selectedDate}
                      bookings={mergedBookings}
                      bayCount={currentBayCount}
                      bayNames={currentBayNames}
                      bayFilter={workshopBayFilter}
                      mechanicFilter={workshopMechanicFilter}
                      partsFilter={workshopPartsFilter}
                      formSelection={{
                        serviceBay: null,
                        timeSlot: null,
                        slotCount: 1,
                        isExternalProvider: false,
                      }}
                      // 🍴 Empty-cell click / drag-select → stage a lunch
                      // break and ask for confirmation (so a stray tap
                      // can't create one). Single click = 30 min, drag =
                      // N×30 min.
                      onCellClick={(bay, timeSlot, slotCount) =>
                        setPendingLunch({ bay, timeSlot, slotCount: slotCount ?? 1 })
                      }
                      // Block click → details modal (read-only summary;
                      // Edit jumps to workspace edit mode, Delete removes).
                      onBookingClick={setDetailsBooking}
                      onBookingUpdate={canManageBookings ? handleBookingDragUpdate : undefined}
                      customers={customers}
                    />
                  </div>
                  )}
                </div>
              }
            />
          </div>

          {/* Right: Mini calendar + Upcoming list */}
          <div className="w-full lg:w-[280px] flex-shrink-0 flex flex-col gap-4">

            {/* Mini calendar — clicking a day selects it and shows bookings */}
            <MiniCalendar
              selectedDate={selectedDate}
              bookings={mergedBookings}
              onDateSelect={handleMiniCalendarDateSelect}
              focusDate={miniCalendarFocusDate}
            />

            {/* Upcoming mini list */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-900 dark:text-white">{t('serviceBookings.content.upcomingPanelTitle')}</span>
                <button
                  onClick={() => setViewMode('upcoming')}
                  className="text-[11px] text-[#025940] dark:text-[#72A68E] font-medium hover:underline"
                >
                  {t('serviceBookings.content.upcomingPanelAllLink')}
                </button>
              </div>
              {upcomingBookings.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">{t('serviceBookings.content.upcomingPanelEmpty')}</p>
              ) : (
                <div>
                  {upcomingBookings.map(b => (
                    <UpcomingItem
                      key={b.id}
                      booking={b}
                      onClick={() => handleEditBooking(b)}
                      bayNames={currentBayNames}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── UPCOMING VIEW ──────────────────────────────────────────────────── */}
      {pageMode === 'browse' && viewMode === 'upcoming' && (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-w-0 bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-5 shadow-sm">
            <ServiceTodayView
              selectedDate={selectedDate}
              bookings={mergedBookings}
              onMarkCompleted={handleMarkCompleted}
              onStartBooking={handleStartBooking}
              onReturnFromGarage={handleReturnFromGarage}
              onCheckInToGarage={handleCheckInToGarage}
              onBookingEdit={handleEditBooking}
              onBookingDelete={handleDeleteBooking}
              onAddBooking={(date) => {
                setSelectedDateForModal(date)
                setEditingBooking(null)
                setShowBookingModal(true)
              }}
              viewFilter="all"
              onViewFilterChange={() => {}}
            />
          </div>
          <div className="w-full lg:w-[280px] flex-shrink-0">
            <MiniCalendar
              selectedDate={selectedDate}
              bookings={mergedBookings}
              onDateSelect={(date) => {
                setSelectedDate(date)
                setViewMode('today')
                setTodayViewFilter('workshop')
              }}
              focusDate={miniCalendarFocusDate}
            />
          </div>
        </div>
      )}

      {/* ── CALENDAR VIEW ──────────────────────────────────────────────────── */}
      {pageMode === 'browse' && viewMode === 'calendar' && (
        <ServiceCalendar
          ref={calendarRef}
          bookings={mergedBookings}
          onDateSelect={handleDateSelect}
          onBookingEdit={handleEditBooking}
          onBookingDelete={handleDeleteBooking}
          onMarkCompleted={handleMarkCompleted}
          onCheckInToGarage={handleCheckInToGarage}
          isTimeSlotAvailable={isTimeSlotAvailable}
          getBookingsForDate={getBookingsForDate}
          searchReg={searchReg}
          matchingDates={matchingDates}
          bayNames={currentBayNames}
        />
      )}

      {/* ── LIST VIEW (preserved) ───────────────────────────────────────────── */}
      {pageMode === 'browse' && viewMode === 'list' && (
        <ServiceBookingsList
          bookings={mergedBookings}
          onBookingEdit={handleEditBooking}
          onBookingDelete={handleDeleteBooking}
          onStatusChange={handleUpdateBooking}
          onMarkCompleted={handleMarkCompleted}
          onCheckInToGarage={handleCheckInToGarage}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BOOKING MODAL
          selectedDateForModal is pre-populated when clicking a day cell or + Book
      ══════════════════════════════════════════════════════════════════════ */}
      {showBookingModal && (
        <ServiceBookingModal
          isOpen={showBookingModal}
          onClose={handleCloseModal}
          selectedDate={selectedDateForModal}
          vehicles={vehicles}
          existingBooking={editingBooking}
          onSave={editingBooking ? handleUpdateBooking : handleCreateBooking}
          isTimeSlotAvailable={isTimeSlotAvailable}
          bayCount={currentBayCount}
          bayNames={currentBayNames}
        />
      )}

      {/* 📊 Working Report — admin-only modal. Shows mechanic-by-mechanic
          breakdown of jobs + slots covered for the chosen period. */}
      {isAdmin && (
        <WorkingReportModal
          isOpen={showWorkingReport}
          onClose={() => setShowWorkingReport(false)}
          bookings={mergedBookings}
        />
      )}

      {/* 👁️ Read-only booking details — opened by clicking a workshop block.
          From here the user picks Edit (→ workspace edit mode, slot
          cleared so they re-pick) or Delete (→ existing confirmation
          flow). Synthetic at-garage entries (id starts with "garage-")
          aren't editable / deletable through this path so we hide both
          buttons for them. */}
      {detailsBooking && (
        <BookingDetailsModal
          isOpen={!!detailsBooking}
          booking={detailsBooking}
          customers={customers}
          bayNames={currentBayNames}
          onClose={() => setDetailsBooking(null)}
          onEdit={
            detailsBooking.id.startsWith('garage-')
              ? undefined
              : (b) => {
                  setDetailsBooking(null)
                  setWorkspaceEditingBooking(b)
                  // Also set editingBooking — handleUpdateBooking reads
                  // its id from this state. Cleared when the workspace
                  // closes (see onClose above).
                  setEditingBooking(b)
                  setPageMode('new-booking')
                }
          }
          onDelete={
            detailsBooking.id.startsWith('garage-')
              ? undefined
              : (id) => {
                  setDetailsBooking(null)
                  handleDeleteBooking(id)
                }
          }
          // Mark complete from any block click — same handler the today
          // view's per-row Complete button uses, including its garage-
          // vehicle "return from garage" branch.
          onComplete={handleMarkCompleted}
        />
      )}

      {/* 🍴 Lunch-break confirmation — gates the write so a stray tap in
          the workshop view can't silently create a lunch break. Shows the
          exact bay + time range so the user can sanity-check before
          committing. */}
      <ConfirmationModal
        isOpen={!!pendingLunch}
        onClose={() => setPendingLunch(null)}
        onConfirm={() => {
          if (pendingLunch) {
            handleAddLunchBreak(
              pendingLunch.bay,
              pendingLunch.timeSlot,
              pendingLunch.slotCount,
            )
          }
          setPendingLunch(null)
        }}
        title={t('serviceBookings.content.lunchModalTitle')}
        message={
          pendingLunch
            ? t('serviceBookings.content.lunchModalMessage', {
                bay: pendingLunch.bay,
                start: pendingLunch.timeSlot.split('-')[0],
                end: getBookingEndTime(
                  pendingLunch.timeSlot,
                  pendingLunch.slotCount,
                ),
                minutes: pendingLunch.slotCount * 30,
              })
            : ''
        }
        confirmText={t('serviceBookings.content.lunchModalConfirm')}
        cancelText={t('serviceBookings.common.cancel')}
        variant="default"
      />

      {/* 🛞 Internal-only mileage prompt — shown before completing a workshop
          job. Cancel/X aborts (nothing completes); the two action buttons
          each complete (with or without a reading). */}
      {mileagePromptBooking && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-[60]"
          onClick={() => setMileagePromptBooking(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-[#012619]/10 dark:border-gray-700 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-[#012619] px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-bold text-sm">{t('serviceBookings.content.mileagePromptTitle')}</p>
                <p className="text-[#72A68E] text-xs mt-0.5 truncate">{mileagePromptBooking.registration}</p>
              </div>
              <button
                type="button"
                onClick={() => setMileagePromptBooking(null)}
                className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                aria-label={t('serviceBookings.content.mileageCancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#4a5e54] dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  {t('serviceBookings.content.mileagePromptLabel')}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={mileageInput}
                  onChange={e => setMileageInput(e.target.value)}
                  placeholder={t('serviceBookings.content.mileagePromptPlaceholder')}
                  className="w-full px-3.5 py-3 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm"
                />
                <p className="text-[10px] text-[#8a9e94] mt-1.5">{t('serviceBookings.content.mileagePromptHint')}</p>
              </div>

              {/* 🧩 Final parts review — confirm/add the parts used on this job
                  before completing. Opens the same live parts modal. */}
              <button
                type="button"
                onClick={() => setShowCompletionParts(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#025940] dark:text-[#72A68E] border border-[#025940]/25 dark:border-[#72A68E]/30 hover:bg-[#025940]/8 dark:hover:bg-[#025940]/20 transition-colors"
              >
                <Package className="w-4 h-4" />
                {t('serviceBookings.content.reviewPartsBtn')}
              </button>

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  onClick={() => {
                    const b = mileagePromptBooking
                    if (!b) return
                    const n = parseInt(mileageInput, 10)
                    setMileagePromptBooking(null)
                    finalizeMarkCompleted(b, Number.isFinite(n) && n >= 0 ? n : undefined)
                  }}
                  className="w-full bg-[#025940] hover:bg-[#012619] text-white font-bold py-2.5 text-sm border-0 shadow-none"
                >
                  {t('serviceBookings.content.mileageSaveComplete')}
                </Button>
                <Button
                  onClick={() => {
                    const b = mileagePromptBooking
                    if (!b) return
                    setMileagePromptBooking(null)
                    finalizeMarkCompleted(b)
                  }}
                  className="w-full bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
                >
                  {t('serviceBookings.content.mileageSkipComplete')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🧩 Parts review launched from the completion prompt — layers above it
          (z-100 > z-60) and returns to the prompt on close. */}
      {mileagePromptBooking && (
        <JobPartsModal
          booking={mileagePromptBooking}
          isOpen={showCompletionParts}
          onClose={() => setShowCompletionParts(false)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PROFESSIONAL MODAL DIALOGS (all preserved from original)
      ══════════════════════════════════════════════════════════════════════ */}
      <ConfirmationModal
        isOpen={modalStates.showDeleteConfirm}
        onClose={() => setModalStates(prev => ({ ...prev, showDeleteConfirm: false, deleteBookingId: null }))}
        onConfirm={handleDeleteConfirm}
        title={t('serviceBookings.content.deleteModalTitle')}
        message={t('serviceBookings.content.deleteModalMessage')}
        confirmText={t('serviceBookings.content.deleteModalConfirm')}
        cancelText={t('serviceBookings.common.cancel')}
        variant="danger"
      />

      <AlertModal
        isOpen={modalStates.showTimeSlotAlert}
        onClose={closeTimeSlotAlert}
        title={t('serviceBookings.content.timeSlotConflictTitle')}
        message={modalStates.alertMessage}
        variant="error"
        actionText={t('serviceBookings.common.ok')}
      />

      <AlertModal
        isOpen={modalStates.showErrorAlert}
        onClose={closeError}
        title={t('serviceBookings.common.errorTitle')}
        message={modalStates.errorMessage}
        variant="error"
        actionText={t('serviceBookings.common.ok')}
      />

      <AlertModal
        isOpen={modalStates.showSuccessAlert}
        onClose={closeSuccess}
        title={t('serviceBookings.common.successTitle')}
        message={modalStates.successMessage}
        variant="success"
        actionText={t('serviceBookings.common.ok')}
      />

      {/* ✅ PRESERVED: Service Bay Confirmation Modal (exact same as original) */}
      <ConfirmationModal
        isOpen={modalStates.showServiceBayModal}
        onClose={() => {
          if (modalStates.serviceBayDecision?.onCancel) {
            modalStates.serviceBayDecision.onCancel()
          }
        }}
        onConfirm={() => {
          if (modalStates.serviceBayDecision) {
            modalStates.serviceBayDecision.onConfirm(modalStates.serviceBayDecision.availableBay)
          }
        }}
        title={t('serviceBookings.content.bayModalTitle')}
        message={
          modalStates.serviceBayDecision
            ? t('serviceBookings.content.bayModalMessage', {
                count: modalStates.serviceBayDecision.conflictingBookings.length,
                list: modalStates.serviceBayDecision.conflictingBookings.map(b =>
                  `• ${b.registration} - ${b.make} ${b.model}${b.serviceBay && b.serviceBay > 1 ? t('serviceBookings.content.bayModalListItemBay', { bay: b.serviceBay }) : ''}`
                ).join('\n'),
                bay: modalStates.serviceBayDecision.availableBay,
              })
            : ''
        }
        confirmText={t('serviceBookings.content.bayModalConfirm', { bay: modalStates.serviceBayDecision?.availableBay || 2 })}
        cancelText={t('serviceBookings.content.bayModalCancel')}
        variant="warning"
      />

      {/* ✅ PRESERVED: Service Completion Modal (exact same as original) */}
      <ConfirmationModal
        isOpen={modalStates.showServiceCompletionModal}
        onClose={() => {
          if (modalStates.completionCallback?.onCancel) {
            modalStates.completionCallback.onCancel()
          }
          setModalStates(prev => ({
            ...prev,
            showServiceCompletionModal: false,
            completionBooking: null,
            completionCallback: null
          }))
        }}
        onConfirm={() => {
          if (modalStates.completionCallback?.onConfirm) {
            modalStates.completionCallback.onConfirm()
          }
          setModalStates(prev => ({
            ...prev,
            showServiceCompletionModal: false,
            completionBooking: null,
            completionCallback: null
          }))
        }}
        title={t('serviceBookings.content.completionModalTitle')}
        message={
          modalStates.completionBooking
            ? t('serviceBookings.content.completionModalMessage', {
                registration: modalStates.completionBooking.registration,
                branchName: modalStates.completionBooking.originalBranchName || t('serviceBookings.content.completionModalFallbackBranch'),
              })
            : t('serviceBookings.content.completionModalMessageFallback')
        }
        confirmText={t('serviceBookings.content.completionModalConfirm')}
        cancelText={t('serviceBookings.content.completionModalCancel')}
        variant="default"
      />
    </div>
  )
}

export default ServiceBookingsContent