// src/lib/utils/partsStatus.ts
// Single source of truth for a booking's parts state. Replaces the old
// free-text "need to order parts" note with a glanceable, filterable flag.
//
//   (unset)        → no chip — most in-stock services, keeps the grid clean
//   'needed'       → flagged, nothing ordered yet  (dark yellow)
//   'ordered'      → on order, waiting on supplier  (marine blue)
//   'in'           → parts arrived, job can run     (green)
//
// Manual flag only (v1): staff set it on the booking form and advance it
// with one tap on the workshop grid. NOT wired into the stock/order
// system — deliberately decoupled so it's trivial and low-risk.

export type PartsStatus = 'needed' | 'ordered' | 'in'

export interface PartsStatusMeta {
  value: PartsStatus
  label: string
  /** Solid pill — readable on the coloured grid blocks. Always carries
   *  the word + colour (never colour alone) to avoid confusion. */
  chip: string
  /** Selector button styling when this option is the active choice. */
  active: string
}

// Tap-advance order on the grid: needed → ordered → in (then stays "in").
export const PARTS_STATUS_ORDER: PartsStatus[] = ['needed', 'ordered', 'in']

export const PARTS_STATUS_META: Record<PartsStatus, PartsStatusMeta> = {
  needed: {
    value: 'needed',
    label: 'Parts needed',
    chip: 'bg-yellow-600 text-black border border-yellow-800',
    active: 'bg-yellow-600 text-black border-yellow-800',
  },
  ordered: {
    value: 'ordered',
    label: 'Parts ordered',
    chip: 'bg-blue-700 text-white border border-blue-900',
    active: 'bg-blue-700 text-white border-blue-900',
  },
  in: {
    value: 'in',
    label: 'Parts in',
    chip: 'bg-emerald-600 text-white border border-emerald-700',
    active: 'bg-emerald-600 text-white border-emerald-700',
  },
}

/** One-tap advance used by the grid chip. "in" is terminal (a stray tap
 *  can't wipe a flagged job — clearing/stepping back is done from the
 *  booking form, which is deliberate and rare). */
export function nextPartsStatus(s: PartsStatus | undefined | null): PartsStatus {
  if (s === 'needed') return 'ordered'
  if (s === 'ordered') return 'in'
  if (s === 'in') return 'in'
  return 'needed'
}

export function partsStatusLabel(s: PartsStatus | undefined | null): string {
  return s ? PARTS_STATUS_META[s].label : ''
}
