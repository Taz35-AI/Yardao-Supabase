// src/components/features/service-bookings/booking-workspace/workTypeStyles.ts
// Single source of truth for service-type → colour map. Used by the
// WorkshopScheduleGrid blocks AND the legend at the bottom of the grid.
//
// Keys match WORK_TYPES from ServiceBookingsContent.tsx exactly. When
// `workRequired` is an array we colour by the first known type.

export interface WorkTypeStyle {
  /** Solid bar / dot colour (legend swatch). */
  swatch: string
  /** Booking block container classes (bg + border + text). */
  block: string
  /** Plain label for the legend. */
  label: string
}

const STYLES: Record<string, WorkTypeStyle> = {
  Service: {
    swatch: 'bg-blue-400',
    block: 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-100',
    label: 'Service',
  },
  Tyres: {
    swatch: 'bg-amber-400',
    block: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-100',
    label: 'Tyres',
  },
  Driveshafts: {
    swatch: 'bg-teal-400',
    block: 'bg-teal-50 border-teal-300 text-teal-900 dark:bg-teal-900/30 dark:border-teal-600 dark:text-teal-100',
    label: 'Driveshafts',
  },
  MOT: {
    swatch: 'bg-orange-400',
    block: 'bg-orange-50 border-orange-300 text-orange-900 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-100',
    label: 'MOT',
  },
  Repairs: {
    swatch: 'bg-rose-400',
    block: 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-900/30 dark:border-rose-600 dark:text-rose-100',
    label: 'Repairs',
  },
  'Break Pads': {
    swatch: 'bg-emerald-400',
    block: 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-100',
    label: 'Brake / Pads',
  },
  Maintenance: {
    swatch: 'bg-slate-400',
    block: 'bg-slate-50 border-slate-300 text-slate-900 dark:bg-slate-700/40 dark:border-slate-500 dark:text-slate-100',
    label: 'Maintenance',
  },
  Custom: {
    swatch: 'bg-purple-400',
    block: 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-100',
    label: 'Custom',
  },
}

const FALLBACK: WorkTypeStyle = {
  swatch: 'bg-gray-400',
  block: 'bg-gray-50 border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100',
  label: 'Other',
}

export function getWorkTypeStyle(workRequired: string | string[] | undefined | null): WorkTypeStyle {
  if (!workRequired) return FALLBACK
  const first = Array.isArray(workRequired) ? workRequired.find(Boolean) : workRequired
  if (!first) return FALLBACK
  return STYLES[first] ?? FALLBACK
}

/** Ordered list for the grid legend. Matches WORK_TYPES order in ServiceBookingsContent. */
export const LEGEND_ORDER: ReadonlyArray<keyof typeof STYLES> = [
  'Service',
  'MOT',
  'Tyres',
  'Break Pads',
  'Repairs',
  'Driveshafts',
  'Maintenance',
  'Custom',
]

export { STYLES as WORK_TYPE_STYLES }
