// src/lib/utils/invoiceReport.ts
// Builds the "completed jobs" financial export — ONE ROW PER COMPLETED BOOKING
// (so cash / un-invoiced jobs still appear). Labour comes from the booking's
// slots, parts cost from the parts logged to the job (falling back to the
// invoice's parts for older un-linked jobs), and the invoice net/gross are
// joined in when a matching invoice exists. Produces a real .xlsx.

import * as XLSX from 'xlsx'
import { Invoice } from '@/types/stock'
import { downloadExcelFile } from '@/utils/excelDownload'
import { normalizeReg } from '@/lib/utils/registration'
import { getEffectiveSlotCount } from '@/utils/serviceBookings/slotHelpers'

export type RangeKey = '7d' | '30d' | '3m' | '6m' | 'custom'

const round2 = (n: number) => Math.round((n || 0) * 100) / 100
const ymd = (d: Date) => d.toISOString().split('T')[0]

/** Resolve a range key (+ optional custom dates) to inclusive YYYY-MM-DD bounds. */
export function getRangeDates(
  key: RangeKey,
  customFrom: string,
  customTo: string,
  today: Date,
): { fromStr: string; toStr: string } {
  const toStr = ymd(today)
  if (key === 'custom') {
    const a = customFrom || toStr
    const b = customTo || toStr
    return a <= b ? { fromStr: a, toStr: b } : { fromStr: b, toStr: a }
  }
  const from = new Date(today)
  if (key === '7d') from.setDate(from.getDate() - 7)
  else if (key === '30d') from.setDate(from.getDate() - 30)
  else if (key === '3m') from.setMonth(from.getMonth() - 3)
  else if (key === '6m') from.setMonth(from.getMonth() - 6)
  return { fromStr: ymd(from), toStr }
}

function ddmmyyyy(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function dayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00`)
  const db = Date.parse(`${b}T00:00:00`)
  if (isNaN(da) || isNaN(db)) return Infinity
  return Math.abs(Math.round((db - da) / 86400000))
}

/** Completed-booking shape this report needs (camelCase). */
export interface JobBooking {
  id: string
  registration?: string | null
  date?: string | null
  notes?: string | null
  customerName?: string | null
  slotCount?: number | null
  timeSlot?: string | null
  isExternalProvider?: boolean | null
  externalProvider?: { garageName?: string } | null
}

// Column keys ARE the spreadsheet headers (human-friendly, in the asked order).
export interface ReportRow {
  Date: string
  Garage: string
  Customer: string
  'Labour time (hrs)': number
  'Parts cost (£)': number
  'Invoice net (£)': number | string
  'Invoice gross (£)': number | string
  Invoiced: string
  Comments: string
}

export function inRange(dateStr: string | null | undefined, fromStr: string, toStr: string): boolean {
  return !!dateStr && dateStr >= fromStr && dateStr <= toStr
}

/**
 * One row per completed booking in range. Each booking is matched to the
 * nearest invoice for the same registration (within ~120 days) to pull the
 * net/gross; un-matched bookings are flagged Invoiced = No with blank money.
 */
export function buildJobReportRows(
  bookings: JobBooking[],
  invoices: Invoice[],
  partsCostByBooking: Record<string, number>,
  fromStr: string,
  toStr: string,
): ReportRow[] {
  // reg → invoices (for nearest-date matching).
  const invByReg = new Map<string, Invoice[]>()
  invoices.forEach(inv => {
    const key = normalizeReg(inv.vehicleRegistration || '')
    if (!key) return
    const arr = invByReg.get(key) || []
    arr.push(inv)
    invByReg.set(key, arr)
  })

  return bookings
    .filter(b => inRange(b.date, fromStr, toStr))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(b => {
      // Nearest invoice for this reg (best-effort).
      const cands = invByReg.get(normalizeReg(b.registration || '')) || []
      let inv: Invoice | null = null
      let best = Infinity
      for (const c of cands) {
        const diff = dayDiff(b.date || '', c.invoiceDate || '')
        if (diff < best) { best = diff; inv = c }
      }
      if (best > 120) inv = null

      const slots = getEffectiveSlotCount({
        timeSlot: b.timeSlot ?? '',
        slotCount: typeof b.slotCount === 'number' ? b.slotCount : 1,
      })
      const labourHrs = round2(slots * 0.5)

      // Parts cost: logged-to-job cost first; else the invoice's parts (older
      // jobs whose parts were never linked).
      const linkedCost = partsCostByBooking[b.id] || 0
      const invPartsCost = inv ? (inv.parts || []).reduce((s, p) => s + (p.total || 0), 0) : 0
      const partsCost = round2(linkedCost > 0 ? linkedCost : invPartsCost)

      const garage = inv?.fromCompany || (b.isExternalProvider ? b.externalProvider?.garageName || '' : '')

      return {
        Date: ddmmyyyy(b.date || ''),
        Garage: garage,
        Customer: (b.customerName || inv?.toCompany || '').trim(),
        'Labour time (hrs)': labourHrs,
        'Parts cost (£)': partsCost,
        'Invoice net (£)': inv ? round2((inv.subtotal || 0) - (inv.discount || 0)) : '',
        'Invoice gross (£)': inv ? round2(inv.total || 0) : '',
        Invoiced: inv ? 'Yes' : 'No',
        Comments: (b.notes || '').trim(),
      }
    })
}

/** Generate + download the .xlsx. */
export async function downloadInvoiceReport(rows: ReportRow[], filename: string): Promise<void> {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 24 }, // Garage
    { wch: 24 }, // Customer
    { wch: 14 }, // Labour
    { wch: 14 }, // Parts
    { wch: 14 }, // Net
    { wch: 14 }, // Gross
    { wch: 10 }, // Invoiced
    { wch: 40 }, // Comments
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Completed Jobs')
  await downloadExcelFile(wb, filename)
}
