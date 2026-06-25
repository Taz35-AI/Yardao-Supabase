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
): ContractSchedule {
  const rateType = agreement.rateType
  const rateAmount = agreement.rateAmount
  const periodDays = rateType === 'weekly' ? 7 : 28
  const start = agreement.startDate
  const end =
    agreement.endDate ||
    prorationService.computeEndDate(start, agreement.durationValue, agreement.durationUnit)

  const regByLine = new Map(lines.map((l) => [l.id, l.registration || '—']))
  // Cancelled lines that never went out don't bill; everything else can.
  const billable = lines.filter((l) => l.status !== 'cancelled' || l.actualOutAt)

  const periods: SchedulePeriod[] = []
  let cursor = start
  let idx = 1
  let guard = 0
  while (cursor < end && guard < 520) {
    guard++
    const boundary = addDays(cursor, periodDays) // fixed grid boundary
    const pEnd = boundary > end ? end : boundary // clip the last period
    const pdays = prorationService.dayCount(cursor, pEnd)
    if (pdays <= 0) break

    const vehicles: SchedulePeriodVehicle[] = []
    for (const l of billable) {
      const vStart = dayOnly(l.actualOutAt) || l.scheduledStart || start
      const vEnd = dayOnly(l.actualReturnAt) || end
      const oStart = vStart > cursor ? vStart : cursor
      const oEnd = vEnd < pEnd ? vEnd : pEnd
      const days = prorationService.dayCount(oStart, oEnd)
      if (days <= 0) continue
      const amount = prorationService.prorate(rateType, rateAmount, oStart, oEnd)

      let swapNote: string | undefined
      const ret = dayOnly(l.actualReturnAt)
      if (l.swappedToLineId && ret && ret > cursor && ret <= pEnd) {
        swapNote = `→ ${regByLine.get(l.swappedToLineId) || ''}`.trim()
      } else if (l.swappedFromLineId && vStart >= cursor && vStart < pEnd) {
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
    periods.push({ index: idx, start: cursor, end: pEnd, days: pdays, vehicles, total })
    cursor = boundary // advance by a FULL period (grid stays fixed)
    idx++
  }

  const grandTotal = round2(periods.reduce((s, p) => s + p.total, 0))
  return { rateType, rateAmount, periodDays, start, end, periods, grandTotal }
}

export const hireScheduleService = { buildContractSchedule }
