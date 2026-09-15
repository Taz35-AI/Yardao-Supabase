// src/lib/utils/rentalRate.ts
// Supplier rental rate maths. Suppliers quote either weekly or monthly; we keep
// the quoted figure verbatim and derive the other one so every vehicle can be
// compared on the same footing. Calendar-month basis: 52 weeks = 12 months.

export type RentalRatePeriod = 'weekly' | 'monthly'

export interface RentalRate {
  amount: number
  period: RentalRatePeriod
}

const WEEKS_PER_MONTH = 52 / 12

export function toWeekly(rate: RentalRate): number {
  return rate.period === 'weekly' ? rate.amount : rate.amount / WEEKS_PER_MONTH
}

export function toMonthly(rate: RentalRate): number {
  return rate.period === 'monthly' ? rate.amount : rate.amount * WEEKS_PER_MONTH
}

export function formatGbp(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}
