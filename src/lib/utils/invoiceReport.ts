// src/lib/utils/invoiceReport.ts
// Builds the completed-jobs financial export — ONE ROW PER INVOICE. Every money
// column comes straight off the invoice (its own stored, internally-consistent
// figures), so the maths ties out exactly:
//   Labour cost + Parts cost − Discount = Net,  Net + VAT = Gross.
// Comments are matched (best-effort) from the vehicle's completed booking.

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

// Column keys ARE the spreadsheet headers (human-friendly, in order).
export interface ReportRow {
  Date: string
  Garage: string
  Customer: string
  Registration: string
  Make: string
  Model: string
  'Labour time (hrs)': number
  'Labour cost (£)': number
  'Labour descriptions': string
  'Parts cost (£)': number
  'Parts descriptions': string
  'Discount (£)': number
  'Net (£)': number
  'VAT (£)': number
  'Gross (£)': number
  Comments: string
}

export function countInRange(invoices: Invoice[], fromStr: string, toStr: string): number {
  return invoices.filter(inv => inv.invoiceDate >= fromStr && inv.invoiceDate <= toStr).length
}

/** One row per invoice in range, fully broken down from the invoice's figures. */
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
      const labourHrs = round2((inv.labour || []).reduce((s, l) => s + (l.hours || 0), 0))
      const labourCost = round2((inv.labour || []).reduce((s, l) => s + (l.total || 0), 0))
      const partsCost = round2((inv.parts || []).reduce((s, p) => s + (p.total || 0), 0))
      const discount = round2(inv.discount || 0)
      // Net = subtotal (parts + labour) − discount; tie out to the stored totals.
      const net = round2((inv.subtotal || 0) - discount)
      const vat = round2(inv.vat || 0)
      const gross = round2(inv.total || 0)

      // Comments: the completed booking for this reg dated on/before the
      // invoice (else most recent). Best-effort — blank if no match.
      const arr = byReg.get(normalizeReg(inv.vehicleRegistration || '')) || []
      const matched = arr.find(b => b.date && b.date <= inv.invoiceDate) || arr[0]

      // Detail breakdowns — each line item's description, comma-separated.
      const labourDescriptions = (inv.labour || [])
        .map(l => (l.description || '').trim())
        .filter(Boolean)
        .join(', ')
      const partsDescriptions = (inv.parts || [])
        .map(p => (p.partName || '').trim())
        .filter(Boolean)
        .join(', ')

      return {
        Date: ddmmyyyy(inv.invoiceDate),
        Garage: inv.fromCompany || '',
        Customer: inv.toCompany || '',
        Registration: inv.vehicleRegistration || '',
        Make: inv.vehicleMake || '',
        Model: inv.vehicleModel || '',
        'Labour time (hrs)': labourHrs,
        'Labour cost (£)': labourCost,
        'Labour descriptions': labourDescriptions,
        'Parts cost (£)': partsCost,
        'Parts descriptions': partsDescriptions,
        'Discount (£)': discount,
        'Net (£)': net,
        'VAT (£)': vat,
        'Gross (£)': gross,
        Comments: matched?.notes || '',
      }
    })
}

/** Generate + download the .xlsx. */
export async function downloadInvoiceReport(rows: ReportRow[], filename: string): Promise<void> {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 22 }, // Garage
    { wch: 22 }, // Customer
    { wch: 12 }, // Registration
    { wch: 14 }, // Make
    { wch: 14 }, // Model
    { wch: 13 }, // Labour time
    { wch: 13 }, // Labour cost
    { wch: 40 }, // Labour descriptions
    { wch: 13 }, // Parts cost
    { wch: 40 }, // Parts descriptions
    { wch: 12 }, // Discount
    { wch: 12 }, // Net
    { wch: 12 }, // VAT
    { wch: 12 }, // Gross
    { wch: 40 }, // Comments
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Completed Jobs')
  await downloadExcelFile(wb, filename)
}
