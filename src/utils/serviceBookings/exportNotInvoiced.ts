// src/utils/serviceBookings/exportNotInvoiced.ts
// Excel export of completed jobs still awaiting an invoice (the same set the
// "Not invoiced" stat counts: completed, no invoice linked, not marked
// no-invoice-needed).
import * as XLSX from 'xlsx'
import type { ServiceBooking } from '@/types/serviceBookings'
import { downloadExcelFile } from '@/utils/excelDownload'

export const isNotInvoiced = (b: ServiceBooking) =>
  b.status === 'completed' && !b.invoiceId && !b.noInvoiceNeeded

const fmtDate = (d?: Date | string | null) => {
  if (!d) return ''
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB')
}

export async function exportNotInvoicedJobs(bookings: ServiceBooking[]): Promise<number> {
  const jobs = bookings
    .filter(isNotInvoiced)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.timeSlot || '').localeCompare(b.timeSlot || ''))

  const rows = jobs.map(b => {
    const slots = (b.carriedOverSlots ?? 0) + (b.slotCount ?? 1)
    return {
      'Job Date': fmtDate(b.date),
      'Registration': b.registration || '',
      'Make': b.make || '',
      'Model': b.model || '',
      'Customer': b.customerName || '',
      'Phone': b.customerPhone || '',
      'Email': b.customerEmail || '',
      'Work Done': Array.isArray(b.workRequired) ? b.workRequired.filter(Boolean).join(', ') : (b.workRequired || ''),
      'Booked Hours': slots * 0.5,
      'Mileage': b.mileage ?? '',
      'Mechanic': b.assignedMechanicName || '',
      'Type': b.isExternalProvider ? `External${b.externalProvider?.garageName ? ` — ${b.externalProvider.garageName}` : ''}` : 'Workshop',
      'Branch': b.originalBranchName || '',
      'Completed On': fmtDate(b.completedAt),
      'Completed By': b.completedByName || '',
      'Notes': b.notes || '',
    }
  })

  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [12, 14, 14, 16, 22, 16, 26, 40, 12, 10, 18, 26, 18, 13, 18, 40].map(wch => ({ wch }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Not Invoiced')

  const today = new Date().toISOString().slice(0, 10)
  await downloadExcelFile(workbook, `Not_Invoiced_Jobs_${today}.xlsx`)
  return jobs.length
}
