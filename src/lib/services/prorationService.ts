// src/lib/services/prorationService.ts
// Proration for hire billing. Pure functions (no I/O) so the math is testable
// and identical everywhere.
//
//   weekly  → daily rate = weekly / 7
//   monthly → daily rate = monthly / 28   ("a month" = a flat 4 weeks)
//
// A "monthly" period is treated as a flat 4-week (28-day) block, NOT a calendar
// month, so the daily rate is constant and easy to reconcile.

import type { HireRateType } from '@/types/hire'

const DAY_MS = 86_400_000
/** A "month" in hire billing = a flat 4 weeks. */
export const MONTH_DAYS = 28

/** Parse a YYYY-MM-DD (or ISO datetime) to a local midnight Date. */
function toDay(value: string): Date {
  const s = value.length <= 10 ? value + 'T00:00:00' : value
  const d = new Date(s)
  d.setHours(0, 0, 0, 0)
  return d
}

/** The cost of a SINGLE day under the given rate. */
export function dailyRate(rateType: HireRateType, rateAmount: number, _onDay?: Date): number {
  if (!Number.isFinite(rateAmount) || rateAmount <= 0) return 0
  return rateType === 'weekly' ? rateAmount / 7 : rateAmount / MONTH_DAYS
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
 * Charge for [start, end) (end exclusive). Daily rate is flat (weekly/7 or
 * monthly/28), so it's just rate × days. Returns a value rounded to 2dp.
 */
export function prorate(
  rateType: HireRateType,
  rateAmount: number,
  startIso: string,
  endIso: string,
): number {
  const days = dayCount(startIso, endIso)
  if (days <= 0) return 0
  const perDay = rateType === 'weekly' ? rateAmount / 7 : rateAmount / MONTH_DAYS
  return round2(perDay * days)
}

/** Add a duration to a start date → end date (YYYY-MM-DD), end-exclusive style
 *  not applied here; this is the contract end DATE (inclusive period end). */
export function computeEndDate(
  startIso: string,
  durationValue: number,
  unit: 'weeks' | 'months',
): string {
  const d = toDay(startIso)
  // weeks → ×7 days; "months" → ×28 days (a flat 4-week block).
  d.setDate(d.getDate() + durationValue * (unit === 'weeks' ? 7 : MONTH_DAYS))
  // The agreement runs [start, end); store the day the period ends.
  return ymd(d)
}

/**
 * The end (exclusive) of the billing PERIOD that contains `asOf`, counting in
 * whole weeks/months from `periodStartIso`. Used for early-return credits:
 * weekly 23–29 returned 25 → this returns 30 (period [23,30)), so the credit is
 * [25, 30). Returns a YYYY-MM-DD string.
 */
export function currentPeriodEnd(
  periodStartIso: string,
  rateType: HireRateType,
  asOfIso: string,
): string {
  const start = toDay(periodStartIso)
  const asOf = toDay(asOfIso)
  if (asOf.getTime() <= start.getTime()) {
    return ymd(advance(start, rateType, 1))
  }
  // Walk one period at a time until we pass asOf.
  let periodStart = new Date(start)
  let periodEnd = advance(periodStart, rateType, 1)
  let guard = 0
  while (periodEnd.getTime() <= asOf.getTime() && guard < 1000) {
    periodStart = periodEnd
    periodEnd = advance(periodStart, rateType, 1)
    guard++
  }
  return ymd(periodEnd)
}

function advance(from: Date, rateType: HireRateType, count: number): Date {
  const d = new Date(from)
  // weekly period = 7 days; monthly period = 28 days (a flat 4 weeks).
  d.setDate(d.getDate() + (rateType === 'weekly' ? 7 : MONTH_DAYS) * count)
  return d
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

export const prorationService = { dailyRate, dayCount, prorate, computeEndDate, currentPeriodEnd }
