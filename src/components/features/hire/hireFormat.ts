// src/components/features/hire/hireFormat.ts
// Small display helpers for the Hire UI.
import type { HireRateType } from '@/types/hire'

/** EU date dd/mm/yyyy from a YYYY-MM-DD or ISO string; '' if absent/invalid. */
export function euDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${m}/${d.getFullYear()}`
}

/** "£250/wk" or "£900/mo". */
export function rateLabel(rateType: HireRateType, amount: number, wk: string, mo: string): string {
  return `£${amount}${rateType === 'monthly' ? mo : wk}`
}
