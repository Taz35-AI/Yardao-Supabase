// src/lib/services/hireScheduleService.ts
// Builds a contract's billing SCHEDULE: a fixed grid of weekly (7-day) or
// 4-weekly (28-day) periods anchored to the contract start, with each vehicle's
// actual on-hire days counted WITHIN each period.
//
//   • The number of periods is fixed by the contract (start → end); the last
//     period is clipped (prorated) if the end doesn't land on a boundary.
//   • A vehicle that started late / returned early / was swapped only shows the
//     days it was actually on hire inside that period (rate ÷ 7 or ÷ 28 × days).
//   • A full period on hire = the full contract rate (per vehicle).
// Pure function — no I/O — so it's testable and identical in UI + export.

import { prorationService } from '@/lib/services/prorationService'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'

export interface SchedulePeriodVehicle {
  lineId: string
  registration: string
  days: number
  amount: number
  isPartial: boolean
  swapNote?: string // e.g. "→ CD34EFG" (swapped out) or "← AB12CDE" (swapped in)
}

export interface SchedulePeriod {
  index: number // 1-based
  start: string // YYYY-MM-DD (inclusive)
  end: string // YYYY-MM-DD (exclusive)
  days: number // length of THIS period (clipped on the last one)
  vehicles: SchedulePeriodVehicle[]
  total: number // sum of vehicle amounts in this period
}

export interface ContractSchedule {
  rateType: 'weekly' | 'monthly'
  rateAmount: number
  periodDays: number // 7 or 28
  start: string
  end: string
  periods: SchedulePeriod[]
  grandTotal: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const dayOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : null)
const maxStr = (a: string, b: string) => (a > b ? a : b)
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Rolling/flexi contracts have a 4-week minimum term. */
const ROLLING_MIN_DAYS = 28

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildContractSchedule(
  agreement: HireAgreement,
  lines: HireAgreementVehicle[],
  asOf: Date = new Date(),
): ContractSchedule {
  const rateType = agreement.rateType
  const rateAmount = agreement.rateAmount
  const periodDays = rateType === 'weekly' ? 7 : 28
  const start = agreement.startDate
  const isRolling = !!agreement.isRolling

  const regByLine = new Map(lines.map((l) => [l.id, l.registration || '—']))
  // Cancelled lines that never went out don't bill; everything else can.
  const billable = lines.filter((l) => l.status !== 'cancelled' || l.actualOutAt)
  const lineOut = (l: HireAgreementVehicle) => dayOnly(l.actualOutAt) || l.scheduledStart || start

  // ── Horizon ('end' of the grid) ───────────────────────────────────────────
  // Fixed term: the contract end date. Rolling: open-ended, so project to today
  // + 2 periods (show upcoming charges), but always far enough to cover the
  // 4-week minimum and any vehicle still billing (incl. an early return that
  // still owes through its minimum term).
  let end: string
  if (isRolling) {
    const today = ymdOf(asOf)
    const lookahead = addDays(today, 2 * periodDays)
    let horizon = maxStr(lookahead, addDays(start, ROLLING_MIN_DAYS))
    for (const l of billable) {
      const ret = dayOnly(l.actualReturnAt)
      const cand = ret ? maxStr(ret, addDays(lineOut(l), ROLLING_MIN_DAYS)) : lookahead
      if (cand > horizon) horizon = cand
    }
    end = horizon
  } else {
    end =
      agreement.endDate ||
      prorationService.computeEndDate(start, agreement.durationValue, agreement.durationUnit)
  }

  // ── Build the period windows ──────────────────────────────────────────────
  // Weekly contracts can bill on a fixed weekday (chargeDay): window 1 is a stub
  // from start → the first charge day, then full 7-day windows align to it. The
  // calendar term is preserved, so the last window may be a short tail stub.
  // 4-weekly always anchors to the start (no stub).
  const chargeDay = rateType === 'weekly' ? agreement.chargeDay ?? null : null
  let anchor = start
  if (chargeDay != null) {
    const diff = (chargeDay - new Date(start + 'T00:00:00').getDay() + 7) % 7
    anchor = diff === 0 ? start : addDays(start, diff)
  }
  const anchorCapped = anchor > end ? end : anchor

  const windows: Array<[string, string]> = []
  if (anchorCapped > start) windows.push([start, anchorCapped]) // front stub
  let cur = anchor
  let guard = 0
  while (cur < end && guard < 520) {
    guard++
    const boundary = addDays(cur, periodDays)
    const wEnd = boundary > end ? end : boundary
    if (prorationService.dayCount(cur, wEnd) > 0) windows.push([cur, wEnd])
    cur = boundary
  }

  const periods: SchedulePeriod[] = windows.map(([wStart, wEnd], i) => {
    const pdays = prorationService.dayCount(wStart, wEnd)
    const vehicles: SchedulePeriodVehicle[] = []
    for (const l of billable) {
      const vStart = lineOut(l)
      const ret = dayOnly(l.actualReturnAt)
      // Rolling: an early return still owes through the 4-week minimum.
      const vEnd = isRolling
        ? (ret ? maxStr(ret, addDays(vStart, ROLLING_MIN_DAYS)) : end)
        : (ret || end)
      const oStart = vStart > wStart ? vStart : wStart
      const oEnd = vEnd < wEnd ? vEnd : wEnd
      const days = prorationService.dayCount(oStart, oEnd)
      if (days <= 0) continue
      const amount = prorationService.prorate(rateType, rateAmount, oStart, oEnd)

      let swapNote: string | undefined
      if (l.swappedToLineId && ret && ret > wStart && ret <= wEnd) {
        swapNote = `→ ${regByLine.get(l.swappedToLineId) || ''}`.trim()
      } else if (l.swappedFromLineId && vStart >= wStart && vStart < wEnd) {
        swapNote = `← ${regByLine.get(l.swappedFromLineId) || ''}`.trim()
      }

      vehicles.push({
        lineId: l.id,
        registration: regByLine.get(l.id) || '—',
        days,
        amount,
        isPartial: days < pdays,
        swapNote,
      })
    }
    const total = round2(vehicles.reduce((s, v) => s + v.amount, 0))
    return { index: i + 1, start: wStart, end: wEnd, days: pdays, vehicles, total }
  })

  const grandTotal = round2(periods.reduce((s, p) => s + p.total, 0))
  return { rateType, rateAmount, periodDays, start, end, periods, grandTotal }
}

export const hireScheduleService = { buildContractSchedule }
