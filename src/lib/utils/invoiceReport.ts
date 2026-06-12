// src/lib/utils/invoiceReport.ts
// Builds the "completed jobs" financial export — one row per invoice, with the
// money taken straight off the invoice and Comments matched (best-effort) from
// the vehicle's completed booking. Produces a real .xlsx via the shared helper.

import * as XLSX from 'xlsx'
import { Invoice } from '@/types/stock'
import { downloadExcelFile } from '@/utils/excelDownload'
import { normalizeReg } from '@/lib/utils/registration'

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
    // Guard against reversed inputs.
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

export interface BookingNote {
  registration?: string | null
  date?: string | null
  notes?: string | null
}

// Column keys ARE the spreadsheet headers (human-friendly, in the asked order).
export interface ReportRow {
  Date: string
  Garage: string
  Customer: string
  'Labour time (hrs)': number
  'Parts cost (£)': number
  'Invoice net (£)': number
  'Invoice gross (£)': number
  Comments: string
}

/** Filter invoices to the range and shape one report row per invoice. */
export function buildInvoiceReportRows(
  invoices: Invoice[],
  bookings: BookingNote[],
  fromStr: string,
  toStr: string,
): ReportRow[] {
  // reg → completed-booking notes, newest first (for the Comments match).
  const byReg = new Map<string, { date: string; notes: string }[]>()
  bookings.forEach(b => {
    const key = normalizeReg(b.registration || '')
    if (!key) return
    const arr = byReg.get(key) || []
    arr.push({ date: b.date || '', notes: (b.notes || '').trim() })
    byReg.set(key, arr)
  })
  byReg.forEach(arr => arr.sort((a, b) => (b.date || '').localeCompare(a.date || '')))

  return invoices
    .filter(inv => inv.invoiceDate >= fromStr && inv.invoiceDate <= toStr)
    .sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''))
    .map(inv => {
      const labourHrs = (inv.labour || []).reduce((s, l) => s + (l.hours || 0), 0)
      const partsCost = (inv.parts || []).reduce((s, p) => s + (p.total || 0), 0)
      const net = round2((inv.subtotal || 0) - (inv.discount || 0))

      // Comments: the completed booking for this reg dated on/before the
      // invoice (else the most recent). Best-effort — blank if no match.
      const arr = byReg.get(normalizeReg(inv.vehicleRegistration || '')) || []
      const matched = arr.find(b => b.date && b.date <= inv.invoiceDate) || arr[0]

      return {
        Date: ddmmyyyy(inv.invoiceDate),
        Garage: inv.fromCompany || '',
        Customer: inv.toCompany || '',
        'Labour time (hrs)': round2(labourHrs),
        'Parts cost (£)': round2(partsCost),
        'Invoice net (£)': net,
        'Invoice gross (£)': round2(inv.total || 0),
        Comments: matched?.notes || '',
      }
    })
}

/** Count how many invoices fall in the range (for the live preview). */
export function countInRange(invoices: Invoice[], fromStr: string, toStr: string): number {
  return invoices.filter(inv => inv.invoiceDate >= fromStr && inv.invoiceDate <= toStr).length
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
    { wch: 40 }, // Comments
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Completed Jobs')
  await downloadExcelFile(wb, filename)
}
