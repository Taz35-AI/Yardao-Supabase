// src/components/features/service-bookings/booking-workspace/WorkshopScheduleGrid.tsx
// Bay × Time grid that visualises the workshop day. Reuses bookingCoversSlot
// + TIME_SLOTS from the existing slotHelpers + ServiceBookingsContent.
//
// - Rows: TIME_SLOTS (24 rows of 30 min, 08:30 → 20:30)
// - Columns: bays 1..bayCount (or filtered to a single bay)
// - Booking blocks span `getEffectiveSlotCount(b)` rows — handles both
//   30-min-native bookings and legacy 90-min bookings transparently.
// - Form's selected (bay, timeSlot, slotCount) lights up matching cells:
//     • green dashed = "would land here"
//     • red overlay = conflict with an existing booking
// - Clicking an empty cell sets formSelection bay+timeSlot
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, GripHorizontal } from 'lucide-react'
import { ServiceBooking } from '@/types/serviceBookings'
import { Customer } from '@/types/customer'
import { TIME_SLOTS } from '@/components/features/service-bookings/ServiceBookingsContent'
import {
  bookingCoversSlot,
  getSlotIndex,
  getBookingEndTime,
  getEffectiveSlotCount,
} from '@/utils/serviceBookings/slotHelpers'
import { formatDate } from '@/utils/serviceBookings/dateHelpers'
import { formatDuration } from '@/lib/utils/duration'
import { normalizePhone } from '@/lib/utils/phone'
import { useT, localizeWorkRequired } from '@/lib/i18n'
import {
  PARTS_STATUS_META,
  nextPartsStatus,
  type PartsStatus,
} from '@/lib/utils/partsStatus'

// Occupied-slot colour is driven by STATUS (not work type) so a busy slot
// reads instantly and a finished job is unmistakably the app's green.
//  • completed                → solid app forest green
//  • in-progress              → bright brand-lime "happening now"
//  • scheduled / at-garage /… → on-theme teal = booked & busy
function getStatusBlockClass(status: string | undefined | null): string {
  if (status === 'completed') {
    // Solid deep app-forest green, light text — unmistakably "done".
    return 'bg-[#025940] border-[#012619] text-white dark:bg-[#025940] dark:border-[#72A68E] dark:text-white'
  }
  // Everything not done (scheduled / in-progress / at-garage) → the
  // original neutral grey. The earlier greenish tint read as "almost
  // done" and clashed with the workshop-mode completed shade.
  return 'bg-gray-50 border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100'
}

export interface FormSelection {
  serviceBay: number | null
  timeSlot: string | null
  slotCount: number
  /** When the form is for an external provider, the grid should not flag
   *  in-house conflicts — external bookings have no bay and no slot. */
  isExternalProvider: boolean
}

export interface WorkshopScheduleGridProps {
  selectedDate: Date
  bookings: ServiceBooking[]
  bayCount: number
  /** Optional bay filter — when set, only this bay's column is rendered. */
  bayFilter: number | 'all'
  /** Optional technician filter — bookings assigned to other mechanics dim. */
  mechanicFilter: string | 'all'
  /** Optional parts filter — bookings whose partsStatus differs dim out. */
  partsFilter: PartsStatus | 'all'
  /** Live form state from the BookingFormPanel. The grid uses this to draw
   *  the "your booking would land here" highlight. */
  formSelection: FormSelection
  /** Empty-cell click OR drag-select. Single click → slotCount = 1
   *  (a 30-min booking). Drag across N consecutive empty cells → slotCount
   *  = N. The drag is conflict-clamped client-side so the value passed
   *  here can always be created safely. */
  onCellClick: (bay: number, timeSlot: string, slotCount?: number) => void
  /** Click on an existing booking block → typically open the edit modal. */
  onBookingClick?: (booking: ServiceBooking) => void
  /** Drag/resize commit handler. Called when the user releases after an
   *  actual drag (not a plain click) and the new position has no conflict.
   *  When omitted, drag/resize is disabled (read-only grid). */
  onBookingUpdate?: (
    bookingId: string,
    changes: {
      serviceBay?: number
      timeSlot?: string
      slotCount?: number
      partsStatus?: PartsStatus
    },
  ) => void
  /** Optional customer list — when provided, blocks render the matched
   *  customer's saved "preferred notes" in brackets after their name +
   *  phone. Lookup is by normalised phone. */
  customers?: Customer[]
  /** Booking currently being edited in the form. Excluded from conflict
   *  detection + drag-clamp so its own slot doesn't flag a false
   *  "occupied" against itself when the form prefills its slot. */
  excludeBookingId?: string
  /** Double-click a booking block → edit it directly. Week view wires
   *  this; day view leaves it undefined (no behaviour change there). */
  onBookingDoubleClick?: (booking: ServiceBooking) => void
  /** When false, the empty-cell pointer handlers are NOT attached, so the
   *  grid never captures the pointer — lets a parent (the week view)
   *  drag-pan across it. Defaults to true (day view = fully interactive). */
  interactive?: boolean
  /** Touch only: when true, a stationary tap sets a range *anchor* and a
   *  second tap in the same bay commits a conflict-clamped multi-slot
   *  range (mouse keeps drag-select). Off by default so the today /
   *  workshop view keeps its single-tap, scroll-safe behaviour exactly. */
  enableTouchRangeSelect?: boolean
}

// Width of the leftmost time-label column (must match the gridTemplateColumns
// value below). Used to convert pointer X into bay-column deltas.
const TIME_COL_PX = 72

// Pixels of pointer travel before we treat a pointer-down as a drag (rather
// than a click → opens edit modal). Below this threshold we fire onBookingClick.
const DRAG_THRESHOLD_PX = 5
// Touch only: max finger travel that still counts as a "tap" (vs a scroll).
// Slightly looser than DRAG_THRESHOLD_PX to tolerate normal finger jitter.
const TOUCH_TAP_TOLERANCE_PX = 10
// Touch only: how long the finger must hold still on a booking block before
// it becomes draggable (move/resize). Stops a casual touch or scroll-start
// from accidentally rescheduling a booking. Mouse/pen are unaffected.
const BLOCK_LONG_PRESS_MS = 300

interface Interaction {
  mode: 'move' | 'resize'
  bookingId: string
  startBay: number
  startSlotIdx: number
  startSpan: number
  startX: number
  startY: number
  /** Pixel width of one bay column at drag-start (cached so a window resize
   *  mid-drag doesn't change snapping). */
  colWidth: number
  // Live preview, updated on every pointer move:
  previewBay: number
  previewSlotIdx: number
  previewSpan: number
  hasConflict: boolean
  /** Set true once the pointer has moved past DRAG_THRESHOLD_PX. Until then
   *  we treat the gesture as a click and don't render the preview. */
  dragActive: boolean
  /** Touch only: false until the long-press completes. While false, finger
   *  movement does NOT move the booking (a small jitter waits, a larger
   *  move abandons). Mouse/pen set this true immediately. */
  armed: boolean
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

// Parts-state chip rendered on a booking block. Always shows the WORD +
// colour (never colour alone). When onAdvance is supplied (workspace
// context) it's a one-tap control: tap advances needed → ordered → in.
// It lives inside the block's pointer-events-none content, so it opts
// back in with pointer-events-auto and stops propagation so a tap
// doesn't start a block drag or open the edit modal.
function PartsChip({
  status,
  onAdvance,
}: {
  status: PartsStatus
  onAdvance?: () => void
}) {
  const t = useT()
  const meta = PARTS_STATUS_META[status]
  const interactive = !!onAdvance
  return (
    <span
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={interactive ? (e) => e.stopPropagation() : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation()
              onAdvance!()
            }
          : undefined
      }
      title={interactive ? t('serviceBookings.grid.partsAdvanceTitle', { label: meta.label }) : meta.label}
      className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-[1px] rounded text-[10px] font-bold leading-tight ${meta.chip} ${
        interactive ? 'pointer-events-auto cursor-pointer' : ''
      }`}
    >
      <img src="/parts.svg" alt="" className="w-3 h-3 object-contain flex-shrink-0" />
      {meta.label}
    </span>
  )
}

// 30-min rows × 24 = 720px total (was 64×8 = 512). Slightly tighter per row
// keeps the grid roughly the same overall height as before.
const ROW_PX = 30

// UK rear-plate styling — yellow background + black text + black border, in
// a monospaced font with wide tracking. Same look the upcoming list uses,
// shared here so every booking block surfaces the registration the same way.
// Intentionally NOT theme-aware: the plate colour is iconic and reads
// the same in light + dark modes.
const UK_PLATE_CLASS =
  'flex-shrink-0 inline-block bg-yellow-300 text-black font-mono font-black tracking-[0.06em] ' +
  'border-[1.5px] border-black rounded-[3px] px-1.5 py-[1px] text-[11px] leading-tight ' +
  'shadow-[0_1px_2px_rgba(0,0,0,0.15)]'

// Time + duration chips — kept readable against the coloured block bg by
// using a translucent white pill (light on light blocks, faintly visible
// on dark blocks). Bold + tabular nums so the digits line up.
const TIME_CHIP_CLASS =
  'flex-shrink-0 inline-block bg-white/80 dark:bg-black/40 text-gray-900 dark:text-white ' +
  'font-mono font-bold tabular-nums text-[11px] leading-tight px-1.5 py-[1px] rounded shadow-sm'
const DURATION_CHIP_CLASS =
  'flex-shrink-0 inline-block bg-black/15 dark:bg-white/20 text-gray-900 dark:text-white ' +
  'font-extrabold tabular-nums text-[11px] leading-tight px-1.5 py-[1px] rounded'

export function WorkshopScheduleGrid({
  selectedDate,
  bookings,
  bayCount,
  bayFilter,
  mechanicFilter,
  partsFilter,
  formSelection,
  onCellClick,
  onBookingClick,
  onBookingDoubleClick,
  onBookingUpdate,
  customers,
  excludeBookingId,
  interactive = true,
  enableTouchRangeSelect = false,
}: WorkshopScheduleGridProps) {
  const t = useT()
  // Phone-normalised lookup so we can append a booking's customer
  // "preferred notes" inline without re-walking the customers array
  // for every block.
  const customerNotesByPhone = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers ?? []) {
      if (c.notes && c.phoneNormalized) {
        map.set(c.phoneNormalized, c.notes)
      }
    }
    return map
  }, [customers])
  const lookupCustomerNotes = (phone?: string): string | undefined => {
    if (!phone) return undefined
    return customerNotesByPhone.get(normalizePhone(phone))
  }
  const dateStr = formatDate(selectedDate)
  const visibleBays = useMemo(
    () => (bayFilter === 'all'
      ? Array.from({ length: bayCount }, (_, i) => i + 1)
      : [bayFilter]),
    [bayFilter, bayCount],
  )

  // ── Drag / resize state ────────────────────────────────────────────────
  // The grid container ref is used to measure the bay column width when a
  // drag starts (so X-pixel deltas snap to bay changes).
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  // Latest interaction in a ref so the conflict closure inside pointer
  // handlers always sees fresh state without re-binding listeners.
  const interactionRef = useRef<Interaction | null>(null)
  interactionRef.current = interaction
  // Pending touch long-press timer for block move/resize (cleared on
  // up/cancel/abandon and on unmount).
  const blockLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearBlockLongPress = () => {
    if (blockLongPressRef.current) {
      clearTimeout(blockLongPressRef.current)
      blockLongPressRef.current = null
    }
  }
  useEffect(() => () => clearBlockLongPress(), [])
  const dragEnabled = !!onBookingUpdate

  // ── Empty-cell range selection ─────────────────────────────────────────
  // Click an empty cell → 30-min slot. Click + drag across consecutive
  // empty cells → N×30-min range. Conflict-clamped during drag so the
  // selection can never extend into an existing booking — the highlight
  // simply stops at the first obstacle.
  interface CellSelect {
    bay: number
    startSlotIdx: number
    startY: number
    /** Currently-hovered slot idx, clamped at conflict boundaries. */
    currentSlotIdx: number
    /** True once pointer travelled past the click/drag threshold. */
    dragActive: boolean
  }
  const [cellSelect, setCellSelect] = useState<CellSelect | null>(null)
  const cellSelectRef = useRef<CellSelect | null>(null)
  cellSelectRef.current = cellSelect

  // Cancel any in-flight interaction on Escape.
  useEffect(() => {
    if (!interaction && !cellSelect) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInteraction(null)
        setCellSelect(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [interaction, cellSelect])

  // Bookings that belong on this day, in-house, not cancelled, with a real
  // bay assigned. External-provider bookings don't render in the grid.
  const dayBookings = useMemo(
    () => bookings.filter(
      (b) =>
        b.date === dateStr &&
        b.status !== 'cancelled' &&
        !b.isExternalProvider &&
        typeof b.serviceBay === 'number' &&
        b.serviceBay >= 1,
    ),
    [bookings, dateStr],
  )

  // Bookings that belong to this day + bay but whose start time does NOT
  // resolve to a grid slot (e.g. a legacy 08:45 start, or any time that
  // isn't on a 30-min boundary). bookingsByBayStart/isCovered both drop
  // these silently via `getSlotIndex(...) < 0`, so without this they are
  // invisible on the grid even though they DO occupy a bay — a real
  // double-booking trap. We surface them in a strip so the user can open
  // and re-slot them.
  const offGridBookings = useMemo(
    () => dayBookings.filter((b) => getSlotIndex(b.timeSlot) < 0),
    [dayBookings],
  )

  // Slot ids covered by the form's pending range (used for conflict and
  // green-suggestion overlays).
  const pendingSlotIds = useMemo(() => {
    if (!formSelection.timeSlot || formSelection.isExternalProvider) return []
    const start = getSlotIndex(formSelection.timeSlot)
    if (start < 0) return []
    const span = Math.max(1, formSelection.slotCount)
    return TIME_SLOTS.slice(start, start + span).map((s) => s.id)
  }, [formSelection.timeSlot, formSelection.slotCount, formSelection.isExternalProvider])

  // Resolve conflict bookings: same bay + any slot in the pending range.
  // The booking being edited is skipped — its prefilled slot must not
  // flag a false conflict against itself.
  const conflictBookingIds = useMemo(() => {
    if (!formSelection.serviceBay || pendingSlotIds.length === 0) return new Set<string>()
    const out = new Set<string>()
    for (const b of dayBookings) {
      if (excludeBookingId && b.id === excludeBookingId) continue
      if (b.serviceBay !== formSelection.serviceBay) continue
      if (pendingSlotIds.some((sid) => bookingCoversSlot(b, sid))) {
        out.add(b.id)
      }
    }
    return out
  }, [dayBookings, formSelection.serviceBay, pendingSlotIds, excludeBookingId])

  // ── Drag conflict checker ──────────────────────────────────────────────
  // Walks the day's bookings and returns true when the candidate range
  // (bay + atomic-slot start + span) overlaps any *other* booking in that
  // bay. Used live during drag/resize to gate commits and drive the red
  // outline on the moving block.
  const checkDragConflict = (
    bookingId: string,
    bay: number,
    slotIdx: number,
    span: number,
  ): boolean => {
    if (slotIdx < 0 || span < 1) return true
    const slotIds = TIME_SLOTS.slice(slotIdx, slotIdx + span).map((s) => s.id)
    for (const b of dayBookings) {
      if (b.id === bookingId) continue
      if (b.serviceBay !== bay) continue
      if (slotIds.some((sid) => bookingCoversSlot(b, sid))) return true
    }
    return false
  }

  // ── Pointer event handlers (move + resize) ─────────────────────────────
  // Both gestures share the same handlers. Mode is set on pointer-down via
  // a `data-handle` attribute on the resize grip; everywhere else inside
  // the block is a "move" handle.
  const handleBlockPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    booking: ServiceBooking,
    bay: number,
    slotIdx: number,
    span: number,
  ) => {
    if (!dragEnabled) return
    // Determine mode from the actual click target (resize grip vs body).
    const targetEl = e.target as HTMLElement
    const mode: 'move' | 'resize' =
      targetEl.dataset.handle === 'resize' ? 'resize' : 'move'

    const grid = gridContainerRef.current
    if (!grid) return
    const rect = grid.getBoundingClientRect()
    const colWidth =
      (rect.width - TIME_COL_PX) / Math.max(1, visibleBays.length)

    // Capture so move/up keep firing on this element when the cursor
    // wanders outside it during the drag.
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()

    // Touch must hold still for BLOCK_LONG_PRESS_MS before the booking can
    // be moved/resized — prevents accidental reschedules from a brush or a
    // scroll-start. Mouse/pen arm instantly (unchanged behaviour).
    const isTouch = e.pointerType === 'touch'
    clearBlockLongPress()

    setInteraction({
      mode,
      bookingId: booking.id,
      startBay: bay,
      startSlotIdx: slotIdx,
      startSpan: span,
      startX: e.clientX,
      startY: e.clientY,
      colWidth,
      previewBay: bay,
      previewSlotIdx: slotIdx,
      previewSpan: span,
      hasConflict: false,
      dragActive: false,
      armed: !isTouch,
    })

    if (isTouch) {
      blockLongPressRef.current = setTimeout(() => {
        blockLongPressRef.current = null
        setInteraction(prev =>
          prev && prev.bookingId === booking.id ? { ...prev, armed: true } : prev,
        )
      }, BLOCK_LONG_PRESS_MS)
    }
  }

  const handleBlockPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = interactionRef.current
    if (!s) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY

    // Touch long-press not satisfied yet: small jitter just waits for the
    // hold; a larger move means it wasn't a deliberate press-hold, so
    // abandon (no move, no edit-open). Mouse/pen are armed from the start.
    if (!s.armed) {
      if (Math.hypot(dx, dy) > TOUCH_TAP_TOLERANCE_PX) {
        clearBlockLongPress()
        setInteraction(null)
      }
      return
    }

    // Threshold gate — until the user has actually moved the pointer this
    // gesture is treated as a click (no preview, no commit).
    if (!s.dragActive && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return

    const dSlots = Math.round(dy / ROW_PX)
    let nextBay = s.startBay
    let nextSlotIdx = s.startSlotIdx
    let nextSpan = s.startSpan

    if (s.mode === 'move') {
      // Y → start slot; X → bay column. Both clamped.
      nextSlotIdx = clamp(
        s.startSlotIdx + dSlots,
        0,
        TIME_SLOTS.length - s.startSpan,
      )
      const dBays = Math.round(dx / s.colWidth)
      const startVisIdx = visibleBays.indexOf(s.startBay)
      const nextVisIdx = clamp(
        startVisIdx + dBays,
        0,
        visibleBays.length - 1,
      )
      nextBay = visibleBays[nextVisIdx]
    } else {
      // resize: span grows downward; can't go below 1 slot or past the day.
      nextSpan = clamp(
        s.startSpan + dSlots,
        1,
        TIME_SLOTS.length - s.startSlotIdx,
      )
    }

    const hasConflict = checkDragConflict(
      s.bookingId,
      nextBay,
      nextSlotIdx,
      nextSpan,
    )

    setInteraction({
      ...s,
      previewBay: nextBay,
      previewSlotIdx: nextSlotIdx,
      previewSpan: nextSpan,
      hasConflict,
      dragActive: true,
    })
  }

  const handleBlockPointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    booking: ServiceBooking,
  ) => {
    clearBlockLongPress()
    const s = interactionRef.current
    if (!s) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // captured pointer was already released — ignore
    }
    // Plain click (no real drag) → open the edit modal.
    if (!s.dragActive) {
      setInteraction(null)
      onBookingClick?.(booking)
      return
    }
    const changed =
      s.previewBay !== s.startBay ||
      s.previewSlotIdx !== s.startSlotIdx ||
      s.previewSpan !== s.startSpan
    if (!s.hasConflict && changed) {
      onBookingUpdate?.(s.bookingId, {
        serviceBay: s.previewBay,
        timeSlot: TIME_SLOTS[s.previewSlotIdx]?.id,
        slotCount: s.previewSpan,
      })
    }
    setInteraction(null)
  }

  const handleBlockPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    clearBlockLongPress()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    setInteraction(null)
  }

  // ── Empty-cell pointer handlers ───────────────────────────────────────
  // Walks forward / backward from `startIdx` in the given bay, returning
  // the furthest slot the user can drag to without hitting an existing
  // booking. Used to clamp the live drag range so the selection never
  // crosses a booked cell.
  const computeMaxValidSlot = (bay: number, startIdx: number, attemptIdx: number): number => {
    if (attemptIdx === startIdx) return startIdx
    const dir = attemptIdx > startIdx ? 1 : -1
    let limit = startIdx
    for (
      let i = startIdx + dir;
      dir > 0 ? i <= attemptIdx : i >= attemptIdx;
      i += dir
    ) {
      const slot = TIME_SLOTS[i]
      if (!slot) break
      const isOccupied = Array.from(dayBookings).some(
        (b) =>
          b.serviceBay === bay &&
          !(excludeBookingId && b.id === excludeBookingId) &&
          bookingCoversSlot(b, slot.id),
      )
      if (isOccupied) break
      limit = i
    }
    return limit
  }

  const handleCellPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    bay: number,
    slotIdx: number,
  ) => {
    // Capture on mouse/pen always. On touch, capture only when range-select
    // is enabled (booking workspace — cells are touch-action:none there so
    // the finger drag selects and scrolling is done via the time strip).
    // When range-select is OFF (today/workshop view) we must NOT capture
    // touch, or the browser can't pan and the grid becomes unscrollable.
    if (e.pointerType !== 'touch' || enableTouchRangeSelect) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setCellSelect({
      bay,
      startSlotIdx: slotIdx,
      startY: e.clientY,
      currentSlotIdx: slotIdx,
      dragActive: false,
    })
  }

  const handleCellPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Today/workshop view (range-select OFF): touch never builds a range —
    // a vertical drag there is a scroll (browser pans, fires pointercancel).
    // Booking workspace (range-select ON): touch DOES drag-select, exactly
    // like the mouse, because those cells are touch-action:none.
    if (e.pointerType === 'touch' && !enableTouchRangeSelect) return
    const s = cellSelectRef.current
    if (!s) return
    const dy = e.clientY - s.startY
    if (!s.dragActive && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    const slotsDelta = Math.round(dy / ROW_PX)
    const target = clamp(
      s.startSlotIdx + slotsDelta,
      0,
      TIME_SLOTS.length - 1,
    )
    const clamped = computeMaxValidSlot(s.bay, s.startSlotIdx, target)
    setCellSelect({ ...s, currentSlotIdx: clamped, dragActive: true })
  }

  const handleCellPointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    bay: number,
    slotIdx: number,
  ) => {
    const s = cellSelectRef.current
    // Touch: a real tap (finger barely moved) adds a single slot; anything
    // that moved was a scroll attempt — or the browser already cancelled
    // this pointer (s === null) when it took over panning — so do nothing.
    // Today/workshop view (range-select OFF): scroll-safe — only a
    // stationary tap adds a single slot; any movement was a scroll.
    if (e.pointerType === 'touch' && !enableTouchRangeSelect) {
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      if (s && Math.abs(e.clientY - s.startY) <= TOUCH_TAP_TOLERANCE_PX) {
        onCellClick(bay, TIME_SLOTS[slotIdx]?.id ?? '', 1)
      }
      setCellSelect(null)
      return
    }
    // Mouse/pen, OR touch in the booking workspace → shared logic below:
    // a plain tap = 1 slot, a real drag = the conflict-clamped range.
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!s) {
      onCellClick(bay, TIME_SLOTS[slotIdx]?.id ?? '', 1)
      return
    }
    if (!s.dragActive) {
      // Plain click on a single cell.
      onCellClick(bay, TIME_SLOTS[s.startSlotIdx]?.id ?? '', 1)
    } else {
      // Drag-selected range. Pick min / max so reverse drags also work.
      const start = Math.min(s.startSlotIdx, s.currentSlotIdx)
      const end = Math.max(s.startSlotIdx, s.currentSlotIdx)
      const slotCount = end - start + 1
      onCellClick(s.bay, TIME_SLOTS[start]?.id ?? '', slotCount)
    }
    setCellSelect(null)
  }

  const handleCellPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    setCellSelect(null)
  }

  // For each visible bay, return a map from start-slot-id → booking that starts
  // there. The grid cell for that start renders the block (others are skipped).
  const bookingsByBayStart = useMemo(() => {
    const map = new Map<number, Map<string, ServiceBooking>>()
    for (const bay of visibleBays) map.set(bay, new Map())
    for (const b of dayBookings) {
      const bay = b.serviceBay as number
      if (!visibleBays.includes(bay)) continue
      const idx = getSlotIndex(b.timeSlot)
      if (idx < 0) continue
      const start = TIME_SLOTS[idx]
      if (!start) continue
      map.get(bay)!.set(start.id, b)
    }
    return map
  }, [dayBookings, visibleBays])

  // For each (bay, slot) cell — is the cell *covered* by a booking that
  // started in an earlier slot? If so, we don't render an empty cell at all
  // (the block from earlier already grid-spans into this row).
  const isCovered = (bay: number, slotId: string): boolean => {
    for (const b of dayBookings) {
      if (b.serviceBay !== bay) continue
      const startIdx = getSlotIndex(b.timeSlot)
      if (startIdx < 0) continue
      const startsHere = TIME_SLOTS[startIdx]?.id === slotId
      if (startsHere) return false
      if (bookingCoversSlot(b, slotId)) return true
    }
    return false
  }

  // The form's pending block (green suggestion) — only render if no conflict
  // and the form has both bay + timeSlot picked.
  const pendingHighlight =
    !formSelection.isExternalProvider &&
    formSelection.serviceBay &&
    formSelection.timeSlot &&
    pendingSlotIds.length > 0 &&
    visibleBays.includes(formSelection.serviceBay)
      ? {
          bay: formSelection.serviceBay,
          startSlot: formSelection.timeSlot,
          span: Math.max(1, formSelection.slotCount),
          isConflict: conflictBookingIds.size > 0,
        }
      : null

  const colCount = visibleBays.length + 1 // +1 for the time label column

  return (
    <div className="flex flex-col h-full">
      {enableTouchRangeSelect && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
          <GripHorizontal className="w-3 h-3 flex-shrink-0" />
          {t('serviceBookings.grid.touchRangeHint')}
        </div>
      )}
      {/* Off-grid bookings strip — these occupy a bay but their start time
          doesn't land on a 30-min slot, so they can't render in the grid
          below. Surfacing them here prevents a silent double-booking trap;
          clicking opens the booking so the user can re-pick a valid slot. */}
      {offGridBookings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b-2 border-amber-300 dark:border-amber-700 text-[11px]">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="font-bold text-amber-800 dark:text-amber-200">
            {t('serviceBookings.grid.offGridNotShown', { count: offGridBookings.length })}
          </span>
          {offGridBookings.map((b) => (
            <button
              key={`offgrid-${b.id}`}
              type="button"
              onClick={() => onBookingClick?.(b)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 font-mono font-bold text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-800/40"
              title={t('serviceBookings.grid.offGridChipTitle', { registration: b.registration, bay: b.serviceBay ?? 1, timeSlot: b.timeSlot ?? '' })}
            >
              {b.registration} · Bay {b.serviceBay} · {b.timeSlot}
            </button>
          ))}
        </div>
      )}

      {/* Bay header row — premium feel: subtle gradient, bolder bay names,
          stronger column dividers between bays. */}
      <div
        className="grid border-b-2 border-gray-200 dark:border-gray-600 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/60 dark:to-gray-800/30"
        style={{ gridTemplateColumns: `72px repeat(${visibleBays.length}, minmax(0, 1fr))` }}
      >
        <div className="px-3 py-3 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.12em]">
          {t('serviceBookings.grid.timeHeader')}
        </div>
        {visibleBays.map((bay) => (
          <div
            key={bay}
            className="px-3 py-3 flex items-center gap-2 text-[13px] font-black text-gray-900 dark:text-white border-l-2 border-gray-200 dark:border-gray-600/80 tracking-tight"
          >
            {/* Custom bay icon (public/bay.svg) — replaces the generic
                lucide Building icon for branded look. */}
            <img src="/bay.svg" alt="" className="w-6 h-6 object-contain" />
            {t('serviceBookings.grid.bayHeader', { count: bay })}
          </div>
        ))}
      </div>

      {/* Body grid: column 1 = time labels, columns 2..N = bay cells.
          Rows are TIME_SLOTS — bookings span via grid-row. */}
      <div
        ref={gridContainerRef}
        className="relative grid flex-1 overflow-auto"
        style={{
          gridTemplateColumns: `${TIME_COL_PX}px repeat(${visibleBays.length}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${TIME_SLOTS.length}, ${ROW_PX}px)`,
          // pan-y lets the user scroll the schedule vertically on touch while
          // mouse/pen drag-to-create still works (mouse ignores touch-action).
          touchAction: interaction ? 'pan-y' : undefined,
        }}
      >
        {/* Time labels column — major 90-min marks (08:30, 10:00, 11:30,
            13:00, 14:30, 16:00, 17:30, 19:00, 20:30) render heavy with a
            stronger ruler line. The in-between 30-min ticks stay light so
            the eye still sees the rhythm at a glance. */}
        {TIME_SLOTS.map((slot, rIdx) => {
          // 30-min slots starting at 08:30 → indices 0,3,6,9... are the
          // 90-min major marks the user wants emphasised.
          const isMajor = rIdx % 3 === 0
          return (
            <div
              key={`time-${slot.id}`}
              className={`px-2 py-0.5 flex items-start tabular-nums ${
                isMajor
                  ? 'text-[12px] font-black text-gray-900 dark:text-white border-t-2 border-gray-400/70 dark:border-gray-500'
                  : 'text-[10px] font-medium text-gray-400 dark:text-gray-500/80 border-t border-dashed border-gray-200/60 dark:border-gray-700/50'
              }`}
              style={{ gridColumn: 1, gridRow: rIdx + 1 }}
            >
              {slot.startTime}
            </div>
          )
        })}

        {/* Empty cells (clickable) per bay × slot — drawn first so blocks
            stack on top via grid-row spans. Skip cells that a multi-slot
            booking already covers. */}
        {visibleBays.map((bay, cIdx) =>
          TIME_SLOTS.map((slot, rIdx) => {
            const covered = isCovered(bay, slot.id)
            const startBooking = bookingsByBayStart.get(bay)?.get(slot.id)
            // Don't render an empty clickable cell if a booking starts here
            // (the block element will own the grid space) OR the cell is
            // covered by a multi-slot booking from above.
            if (startBooking || covered) return null
            const inPending =
              !!pendingHighlight &&
              pendingHighlight.bay === bay &&
              pendingSlotIds.includes(slot.id)
            // Major rule on every 90-min boundary so the cell grid lines
            // up with the bold time labels (08:30, 10:00, 11:30, …).
            const isMajor = rIdx % 3 === 0
            // Live drag-select highlight (local to the grid) — distinct from
            // `inPending` which reflects the form's committed selection.
            const inLiveDrag =
              !!cellSelect &&
              cellSelect.bay === bay &&
              rIdx >= Math.min(cellSelect.startSlotIdx, cellSelect.currentSlotIdx) &&
              rIdx <= Math.max(cellSelect.startSlotIdx, cellSelect.currentSlotIdx)
            return (
              <button
                type="button"
                key={`cell-${bay}-${slot.id}`}
                onPointerDown={interactive ? (e) => handleCellPointerDown(e, bay, rIdx) : undefined}
                onPointerMove={interactive ? handleCellPointerMove : undefined}
                onPointerUp={interactive ? (e) => handleCellPointerUp(e, bay, rIdx) : undefined}
                onPointerCancel={interactive ? handleCellPointerCancel : undefined}
                className={`relative border-l-2 border-gray-200/80 dark:border-gray-700/70 text-left transition-colors ${
                  isMajor
                    ? 'border-t-2 border-t-gray-300/70 dark:border-t-gray-600'
                    : 'border-t border-t-dashed border-t-gray-200/50 dark:border-t-gray-700/40'
                } ${
                  inLiveDrag
                    ? 'bg-emerald-200/70 dark:bg-emerald-700/30'
                    : inPending
                      ? 'bg-emerald-50/60 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                      : 'hover:bg-[#025940]/[0.04] dark:hover:bg-[#72A68E]/10'
                }`}
                style={{
                  gridColumn: cIdx + 2,
                  gridRow: rIdx + 1,
                  // Workspace: 'none' so a finger drag selects a range
                  // (scroll via the time strip). Today/workshop view:
                  // 'pan-y' so the grid scrolls and a tap adds one slot.
                  touchAction: enableTouchRangeSelect ? 'none' : 'pan-y',
                }}
                title={t('serviceBookings.grid.cellTitle', { bay, slotLabel: slot.label })}
              />
            )
          }),
        )}

        {/* Booking blocks — render per visible bay & start slot, spanning
            slotCount rows. When this block is being dragged/resized we
            place it at the live preview position instead so the block
            visually snaps with the cursor. */}
        {visibleBays.map((bay, cIdx) =>
          Array.from(bookingsByBayStart.get(bay)?.entries() ?? []).map(
            ([startId, b]) => {
              const startIdx = getSlotIndex(startId)
              if (startIdx < 0) return null
              const span = getEffectiveSlotCount(b)
              const isConflict = conflictBookingIds.has(b.id)
              const isCompleted = b.status === 'completed'
              const dim =
                (mechanicFilter !== 'all' &&
                  b.assignedMechanicId !== mechanicFilter) ||
                (partsFilter !== 'all' && b.partsStatus !== partsFilter)
              const advanceParts =
                onBookingUpdate && b.registration !== 'LUNCH'
                  ? () =>
                      onBookingUpdate(b.id, {
                        partsStatus: nextPartsStatus(b.partsStatus),
                      })
                  : undefined
              const work = localizeWorkRequired(t, b.workRequired, t('serviceBookings.workFallback.service'))

              // Live preview: when this block is the active drag target,
              // render it at the preview position with a conflict outline
              // if applicable. Otherwise use its stored position.
              const meDragging =
                !!interaction &&
                interaction.dragActive &&
                interaction.bookingId === b.id
              const liveStartIdx = meDragging ? interaction.previewSlotIdx : startIdx
              const liveSpan = meDragging ? interaction.previewSpan : span
              const liveBay = meDragging ? interaction.previewBay : bay
              const liveColIdx = visibleBays.indexOf(liveBay)
              const liveGridCol = liveColIdx >= 0 ? liveColIdx + 2 : cIdx + 2
              const dragConflict = meDragging && interaction.hasConflict

              const liveStartTime = TIME_SLOTS[liveStartIdx]?.startTime || ''
              const liveEndTime = getBookingEndTime(
                TIME_SLOTS[liveStartIdx]?.id ?? b.timeSlot,
                liveSpan,
              )
              const isShort = liveSpan <= 1
              // 🍴 Lunch breaks render distinct: no fake yellow plate, no
              // customer/work crowding — just a slate-tinted block with a
              // fork emoji and the time range. Marker is the registration
              // sentinel "LUNCH" set in handleAddLunchBreak.
              const isLunchBreak = b.registration === 'LUNCH'

              return (
                <button
                  type="button"
                  key={`block-${b.id}`}
                  // Pointer events drive both click-to-edit (no movement)
                  // and drag/resize (movement past threshold). We do NOT
                  // use onClick — pointer-up decides which behaviour to
                  // fire so click never races with a drag commit.
                  onDoubleClick={
                    onBookingDoubleClick
                      ? () => onBookingDoubleClick(b)
                      : undefined
                  }
                  onPointerDown={(e) =>
                    handleBlockPointerDown(e, b, bay, startIdx, span)
                  }
                  onPointerMove={handleBlockPointerMove}
                  onPointerUp={(e) => handleBlockPointerUp(e, b)}
                  onPointerCancel={handleBlockPointerCancel}
                  // items-start + flex-col on the inner container makes the
                  // content cling to the TOP-LEFT corner regardless of how
                  // tall the block is. Padding is tight (px-1.5 py-1) so
                  // the plate sits flush with the corner.
                  className={`relative m-px ${isShort ? 'px-1.5 py-0.5' : 'px-1.5 py-1'} rounded-md ${
                    isLunchBreak
                      ? 'border-2 border-dashed border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                      : `border ${getStatusBlockClass(b.status)}`
                  } text-left font-semibold leading-tight overflow-hidden flex flex-col items-start justify-start ${
                    meDragging ? 'shadow-xl z-20' : 'hover:shadow-md transition-all'
                  } ${
                    dim ? 'opacity-30' : ''
                  } ${
                    dragConflict
                      ? 'ring-2 ring-red-500'
                      : isConflict
                        ? 'ring-2 ring-red-500 ring-offset-1'
                        : isCompleted
                          ? 'ring-1 ring-emerald-500/60'
                          : ''
                  } ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  style={{
                    gridColumn: liveGridCol,
                    gridRow: `${liveStartIdx + 1} / span ${liveSpan}`,
                    touchAction: 'none',
                  }}
                  title={
                    isLunchBreak
                      ? t('serviceBookings.grid.lunchTitle', { bay, start: liveStartTime, end: liveEndTime })
                      : t('serviceBookings.grid.blockTitle', { registration: b.registration, work, start: liveStartTime, end: liveEndTime }) +
                        (dragEnabled ? t('serviceBookings.grid.blockTitleDragSuffix') : '')
                  }
                >
                  {isLunchBreak ? (
                    // 🍴 Lunch break — minimal block content. Title attr
                    // above carries the full detail for hover tooltips.
                    <div className="pointer-events-none flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      <span aria-hidden>🍴</span>
                      <span>{t('serviceBookings.grid.lunchBreak')}</span>
                      {liveSpan > 1 && (
                        <span className="text-[10px] font-semibold opacity-70 tabular-nums">
                          {liveStartTime} – {liveEndTime}
                        </span>
                      )}
                    </div>
                  ) : (() => {
                    // Customer's saved preferred notes (from the customers
                    // collection, looked up by phone). Booking-specific
                    // notes live on b.notes and render separately below.
                    const customerNotes = lookupCustomerNotes(b.customerPhone)
                    if (isShort) {
                      // 30-min blocks are one line tall — plate first, then
                      // a prominent time chip, then customer/work, then the
                      // duration chip. Everything left-aligned, nothing
                      // floats right.
                      return (
                        <div className="flex items-center gap-1.5 text-[10px] pointer-events-none w-full">
                          <span className={UK_PLATE_CLASS}>{b.registration}</span>
                          <span className={TIME_CHIP_CLASS}>{liveStartTime}</span>
                          <span className={DURATION_CHIP_CLASS}>
                            {formatDuration(liveSpan * 30)}
                          </span>
                          {b.partsStatus && (
                            <PartsChip status={b.partsStatus} onAdvance={advanceParts} />
                          )}
                          {isCompleted && (
                            <img
                              src="/completed.svg"
                              alt={t('serviceBookings.grid.completedAlt')}
                              className="w-3.5 h-3.5 object-contain flex-shrink-0"
                            />
                          )}
                          <span className={`truncate min-w-0 ${isCompleted ? 'line-through opacity-70' : 'opacity-90'}`}>
                            {b.customerName || b.customerPhone ? (
                              <>
                                {b.customerName}
                                {b.customerName && b.customerPhone ? ' · ' : ''}
                                {b.customerPhone}
                                {customerNotes && (
                                  <span className="opacity-70 italic"> ({customerNotes})</span>
                                )}
                              </>
                            ) : (
                              work
                            )}
                          </span>
                        </div>
                      )
                    }
                    // Multi-slot blocks — content stacks at the top-left.
                    // Plate + time chip + duration chip on row 1; work,
                    // mechanic, customer (+ preferred notes), booking
                    // notes below.
                    return (
                      <div className="pointer-events-none flex flex-col gap-0.5 w-full">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={UK_PLATE_CLASS}>{b.registration}</span>
                          <span className={TIME_CHIP_CLASS}>
                            {liveStartTime} – {liveEndTime}
                          </span>
                          <span className={DURATION_CHIP_CLASS}>
                            {formatDuration(liveSpan * 30)}
                          </span>
                          {b.partsStatus && (
                            <PartsChip status={b.partsStatus} onAdvance={advanceParts} />
                          )}
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-[1px] rounded">
                              <img src="/completed.svg" alt="" className="w-3 h-3 object-contain" />
                              {t('serviceBookings.grid.done')}
                            </span>
                          )}
                        </div>
                        <div className={`text-[12px] font-bold truncate ${isCompleted ? 'line-through opacity-80' : ''}`}>{work}</div>
                        {b.assignedMechanicName && (
                          <div className="flex items-center gap-1 text-[11px] truncate opacity-90">
                            <img src="/technician.svg" alt="" className="w-3 h-3 object-contain flex-shrink-0" />
                            {b.assignedMechanicName}
                          </div>
                        )}
                        {(b.customerName || b.customerPhone) && (
                          <div className="text-[11px] truncate opacity-90">
                            {b.customerName && <>👤 {b.customerName}</>}
                            {b.customerName && b.customerPhone && <span className="opacity-60"> · </span>}
                            {b.customerPhone && <>📞 {b.customerPhone}</>}
                            {customerNotes && (
                              <span className="opacity-70 italic"> ({customerNotes})</span>
                            )}
                          </div>
                        )}
                        {/* Booking-specific notes (the "Additional Notes"
                            box on the form). Only render when set; tall
                            blocks have room — short ones fall through to
                            the title attribute on hover. */}
                        {b.notes && b.notes.trim() && (
                          <div className="text-[11px] truncate opacity-80 italic">
                            📝 {b.notes}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Resize grip — bottom edge. data-handle="resize" tells
                      the parent pointerDown which mode to enter; pointer
                      events still bubble so capture stays on the button. */}
                  {dragEnabled && (
                    <div
                      data-handle="resize"
                      className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize flex items-center justify-center group/handle hover:bg-black/15 dark:hover:bg-white/15 rounded-b-md"
                      title={t('serviceBookings.grid.resizeTitle')}
                    >
                      <GripHorizontal
                        data-handle="resize"
                        className="w-3 h-2 opacity-0 group-hover/handle:opacity-60 transition-opacity"
                      />
                    </div>
                  )}
                </button>
              )
            },
          ),
        )}

        {/* Pending booking highlight — green dashed (or red on conflict) */}
        {pendingHighlight && (() => {
          const startIdx = getSlotIndex(pendingHighlight.startSlot)
          if (startIdx < 0) return null
          const cIdx = visibleBays.indexOf(pendingHighlight.bay)
          if (cIdx < 0) return null
          // Conflict overlays are intentionally drawn ABOVE the existing block
          // (pointer-events: none so the block is still clickable). The green
          // suggestion only renders when there's NO conflict.
          if (pendingHighlight.isConflict) {
            return (
              <div
                className="pointer-events-none m-0.5 rounded-lg border-2 border-red-500 bg-red-500/10 flex flex-col items-center justify-center gap-1 px-2 text-center"
                style={{
                  gridColumn: cIdx + 2,
                  gridRow: `${startIdx + 1} / span ${pendingHighlight.span}`,
                }}
              >
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-[10px] font-bold text-red-700 dark:text-red-300 leading-tight">
                  {t('serviceBookings.grid.overlapPrevented')}
                </span>
              </div>
            )
          }
          return (
            <div
              className="pointer-events-none m-0.5 rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-500/5 flex items-center justify-center"
              style={{
                gridColumn: cIdx + 2,
                gridRow: `${startIdx + 1} / span ${pendingHighlight.span}`,
              }}
            >
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {t('serviceBookings.grid.selectedSlot')}
              </span>
            </div>
          )
        })()}
      </div>

    </div>
  )
}

export default WorkshopScheduleGrid
