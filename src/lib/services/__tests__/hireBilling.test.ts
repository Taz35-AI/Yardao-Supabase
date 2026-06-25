// Pure-logic tests for hire billing + scheduling. No framework — run with:
//   npx tsx src/lib/services/__tests__/hireBilling.test.ts
// Exits non-zero if anything fails.
import { prorationService } from '@/lib/services/prorationService'
import { buildContractSchedule } from '@/lib/services/hireScheduleService'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}
const approx = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

const AG = (o: Partial<HireAgreement>): HireAgreement => ({
  id: 'ag1', organizationId: 'o', customerId: 'c', customerName: 'Cust', reference: 'R1',
  startDate: '2026-06-01', durationValue: 4, durationUnit: 'weeks', endDate: null,
  rateType: 'weekly', rateAmount: 100, currency: 'GBP', status: 'active', createdAt: '', ...o,
} as HireAgreement)
const LINE = (o: Partial<HireAgreementVehicle>): HireAgreementVehicle => ({
  id: 'l1', organizationId: 'o', agreementId: 'ag1', vehicleId: 'v1', registration: 'AB12CDE',
  status: 'active', createdAt: '', ...o,
} as HireAgreementVehicle)

// ── prorationService ─────────────────────────────────────────────────────────
ok('weekly daily rate = /7', approx(prorationService.dailyRate('weekly', 70, new Date()), 10))
ok('monthly daily rate = /28', approx(prorationService.dailyRate('monthly', 280, new Date()), 10))
ok('dayCount same day = 0', prorationService.dayCount('2026-06-01', '2026-06-01') === 0)
ok('dayCount one day = 1', prorationService.dayCount('2026-06-01', '2026-06-02') === 1)
ok('dayCount a week = 7', prorationService.dayCount('2026-06-01', '2026-06-08') === 7)
ok('prorate weekly full week = rate', approx(prorationService.prorate('weekly', 100, '2026-06-01', '2026-06-08'), 100))
ok('prorate weekly 3 days', approx(prorationService.prorate('weekly', 100, '2026-06-01', '2026-06-04'), 42.86))
ok('prorate monthly full 28 = rate', approx(prorationService.prorate('monthly', 280, '2026-06-01', '2026-06-29'), 280))
ok('computeEndDate weeks', prorationService.computeEndDate('2026-06-01', 2, 'weeks') === '2026-06-15')
ok('computeEndDate "month" = 28d', prorationService.computeEndDate('2026-06-01', 1, 'months') === '2026-06-29')
ok('currentPeriodEnd weekly', prorationService.currentPeriodEnd('2026-06-01', 'weekly', '2026-06-03') === '2026-06-08')

// ── schedule: weekly, no charge day, full term ───────────────────────────────
{
  const ag = AG({ startDate: '2026-06-01', durationValue: 4, durationUnit: 'weeks', rateAmount: 100 })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-01T00:00:00' })])
  ok('A: 4 weekly periods', s.periods.length === 4, `got ${s.periods.length}`)
  ok('A: each period 7 days', s.periods.every((p) => p.days === 7))
  ok('A: grand total 400', approx(s.grandTotal, 400), `got ${s.grandTotal}`)
  const totalDays = s.periods.reduce((n, p) => n + p.days, 0)
  ok('A: total days = term (28)', totalDays === 28, `got ${totalDays}`)
}

// ── schedule: weekly with Friday charge day, Wed start → stub + tail ──────────
{
  const ag = AG({ startDate: '2026-06-03', durationValue: 4, durationUnit: 'weeks', rateAmount: 100, chargeDay: 5 }) // 2026-06-03 = Wed, Fri=5
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-03T00:00:00' })])
  ok('B: first period is a 2-day stub', s.periods[0].days === 2, `got ${s.periods[0].days}`)
  ok('B: first period starts on start', s.periods[0].start === '2026-06-03')
  ok('B: second period starts Friday', s.periods[1].start === '2026-06-05')
  const totalDays = s.periods.reduce((n, p) => n + p.days, 0)
  ok('B: total days = term (28)', totalDays === 28, `got ${totalDays}`)
  ok('B: grand total = 28 days @ 100/7 (400)', approx(s.grandTotal, 400), `got ${s.grandTotal}`)
  ok('B: stub amount prorated (28.57)', approx(s.periods[0].vehicles[0]?.amount ?? -1, 28.57), `got ${s.periods[0].vehicles[0]?.amount}`)
}

// ── schedule: late pickup (Wed) on a Mon-start weekly contract ────────────────
{
  const ag = AG({ startDate: '2026-06-01', durationValue: 4, durationUnit: 'weeks', rateAmount: 100 })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-03T00:00:00' })]) // out Wed
  const p1 = s.periods[0]
  ok('C: P1 vehicle shows 5 days (Wed→Mon)', p1.vehicles[0]?.days === 5, `got ${p1.vehicles[0]?.days}`)
  ok('C: P1 amount prorated (71.43)', approx(p1.vehicles[0]?.amount ?? -1, 71.43), `got ${p1.vehicles[0]?.amount}`)
  ok('C: P1 marked partial', p1.vehicles[0]?.isPartial === true)
  ok('C: grand total 371.43', approx(s.grandTotal, 371.43), `got ${s.grandTotal}`)
}

// ── schedule: early return ───────────────────────────────────────────────────
{
  const ag = AG({ startDate: '2026-06-01', durationValue: 4, durationUnit: 'weeks', rateAmount: 100 })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-01T00:00:00', actualReturnAt: '2026-06-20T00:00:00' })])
  const billedDays = s.periods.reduce((n, p) => n + (p.vehicles[0]?.days ?? 0), 0)
  ok('D: billed days = 19 (Jun 1→20)', billedDays === 19, `got ${billedDays}`)
  ok('D: grand total = 19 days (271.43)', approx(s.grandTotal, 271.43), `got ${s.grandTotal}`)
}

// ── schedule: 4-weekly anchors to start, ignores charge day ──────────────────
{
  const ag = AG({ startDate: '2026-06-01', durationValue: 1, durationUnit: 'months', rateType: 'monthly', rateAmount: 280, chargeDay: 5 })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-01T00:00:00', lineRateType: 'monthly', lineRateAmount: 280 })])
  ok('E: one 28-day period', s.periods.length === 1 && s.periods[0].days === 28, `got ${s.periods.length}/${s.periods[0]?.days}`)
  ok('E: grand total 280', approx(s.grandTotal, 280), `got ${s.grandTotal}`)
}

// ── schedule: swap mid-term shows both vehicles + notes, no double-billing ────
{
  const ag = AG({ startDate: '2026-06-01', durationValue: 4, durationUnit: 'weeks', rateAmount: 100 })
  const a = LINE({ id: 'A', registration: 'AAA', actualOutAt: '2026-06-01T00:00:00', actualReturnAt: '2026-06-10T00:00:00', status: 'swapped', swappedToLineId: 'B' })
  const b = LINE({ id: 'B', registration: 'BBB', actualOutAt: '2026-06-10T00:00:00', status: 'active', swappedFromLineId: 'A' })
  const s = buildContractSchedule(ag, [a, b])
  const aDays = s.periods.reduce((n, p) => n + (p.vehicles.find((v) => v.lineId === 'A')?.days ?? 0), 0)
  const bDays = s.periods.reduce((n, p) => n + (p.vehicles.find((v) => v.lineId === 'B')?.days ?? 0), 0)
  ok('F: outgoing billed 9 days (Jun1→10)', aDays === 9, `got ${aDays}`)
  ok('F: incoming billed 19 days (Jun10→29)', bDays === 19, `got ${bDays}`)
  ok('F: combined = 28 (no gap, no overlap)', aDays + bDays === 28, `got ${aDays + bDays}`)
  const hasSwapNote = s.periods.some((p) => p.vehicles.some((v) => v.swapNote))
  ok('F: a swap note is shown', hasSwapNote)
}

// ── ROLLING contracts (4-week minimum, open-ended) ───────────────────────────
const asOf = new Date('2026-06-15T00:00:00')
// G: rolling, still on hire → projects to today + horizon, 4 weeks visible
{
  const ag = AG({ startDate: '2026-06-01', isRolling: true, endDate: null, rateAmount: 100, rateType: 'weekly' })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-01T00:00:00' })], asOf)
  const billed = s.periods.reduce((n, p) => n + (p.vehicles[0]?.days ?? 0), 0)
  ok('G: rolling projects ~28 days from start', billed === 28, `got ${billed}`)
  ok('G: grand total ~400', approx(s.grandTotal, 400), `got ${s.grandTotal}`)
}
// H: rolling, returned INSIDE the 4-week minimum → still billed the full 28 days
{
  const ag = AG({ startDate: '2026-06-01', isRolling: true, endDate: null, rateAmount: 100, rateType: 'weekly' })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-01T00:00:00', actualReturnAt: '2026-06-10T00:00:00', status: 'returned' })], asOf)
  const billed = s.periods.reduce((n, p) => n + (p.vehicles[0]?.days ?? 0), 0)
  ok('H: early return still bills the 4-week minimum (28d)', billed === 28, `got ${billed}`)
  ok('H: grand total = 28 days (400)', approx(s.grandTotal, 400), `got ${s.grandTotal}`)
}
// I: rolling, returned AFTER the minimum → billed actual days
{
  const ag = AG({ startDate: '2026-06-01', isRolling: true, endDate: null, rateAmount: 100, rateType: 'weekly' })
  const s = buildContractSchedule(ag, [LINE({ actualOutAt: '2026-06-01T00:00:00', actualReturnAt: '2026-07-05T00:00:00', status: 'returned' })], new Date('2026-07-10T00:00:00'))
  const billed = s.periods.reduce((n, p) => n + (p.vehicles[0]?.days ?? 0), 0)
  ok('I: late return bills actual 34 days', billed === 34, `got ${billed}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
