// src/lib/services/prorationService.ts
// Calendar-accurate proration for hire billing. Pure functions (no I/O) so the
// math is testable and identical everywhere.
//
//   weekly  → daily rate = weekly / 7
//   monthly → daily rate = monthly / (days in THAT calendar month)
//
// A span that crosses months is summed day-by-day using each day's own month
// length, so a day in February costs slightly more than a day in March.

import type { HireRateType } from '@/types/hire'

const DAY_MS = 86_400_000

function daysInMonth(year: number, monthIndex0: number): number {
  // monthIndex0: 0=Jan … 11=Dec. Day 0 of next month = last day of this month.
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

/** Parse a YYYY-MM-DD (or ISO datetime) to a local midnight Date. */
function toDay(value: string): Date {
  const s = value.length <= 10 ? value + 'T00:00:00' : value
  const d = new Date(s)
  d.setHours(0, 0, 0, 0)
  return d
}

/** The cost of a SINGLE day under the given rate. */
export function dailyRate(rateType: HireRateType, rateAmount: number, onDay: Date): number {
  if (!Number.isFinite(rateAmount) || rateAmount <= 0) return 0
  if (rateType === 'weekly') return rateAmount / 7
  return rateAmount / daysInMonth(onDay.getFullYear(), onDay.getMonth())
}

/**
 * Number of whole days in the half-open interval [start, end).
 * Same-day (start == end) counts as 0; a single hire day is [day, day+1).
 */
export function dayCount(startIso: string, endIso: string): number {
  const start = toDay(startIso).getTime()
  const end = toDay(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) / DAY_MS)
}

/**
 * Calendar-accurate charge for [start, end) (end exclusive). Sums each day's
 * own daily rate, so month-length differences are respected for monthly rates.
 * Returns a value rounded to 2dp.
 */
export function prorate(
  rateType: HireRateType,
  rateAmount: number,
  startIso: string,
  endIso: string,
): number {
  const days = dayCount(startIso, endIso)
  if (days <= 0) return 0
  if (rateType === 'weekly') {
    return round2((rateAmount / 7) * days)
  }
  // monthly: walk day-by-day so each day uses its month's length
  let total = 0
  const cursor = toDay(startIso)
  for (let i = 0; i < days; i++) {
    total += dailyRate('monthly', rateAmount, cursor)
    cursor.setDate(cursor.getDate() + 1)
  }
  return round2(total)
}

/** Add a duration to a start date → end date (YYYY-MM-DD), end-exclusive style
 *  not applied here; this is the contract end DATE (inclusive period end). */
export function computeEndDate(
  startIso: string,
  durationValue: number,
  unit: 'weeks' | 'months',
): string {
  const d = toDay(startIso)
  if (unit === 'weeks') {
    d.setDate(d.getDate() + durationValue * 7)
  } else {
    d.setMonth(d.getMonth() + durationValue)
  }
  // The agreement runs [start, end); store the day the period ends.
  return ymd(d)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const prorationService = { dailyRate, dayCount, prorate, computeEndDate }
