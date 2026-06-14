// src/utils/serviceBookings/invoiceFromBooking.ts
// Build a draft invoice from a completed service booking. The parts logged
// against the job (part_usage, linked by service_booking_id — migration 0039)
// become invoice part lines; the booked work + time become labour lines. The
// draft is created as status 'draft' and opened in the invoice editor so the
// user can set rates / markup / VAT / discount and issue it.
import type { Invoice, InvoicePart, LabourLine, PartUsageRecord } from '@/types/stock'
import type { ServiceBooking } from '@/types/serviceBookings'

const round2 = (n: number) => Math.round(n * 100) / 100

// Sum part-usage rows into one invoice line per distinct part.
export function aggregateUsageToParts(usage: PartUsageRecord[]): InvoicePart[] {
  const byPart = new Map<string, InvoicePart>()
  for (const u of usage) {
    const key = u.partId || `${u.partName}|${u.partNumber}`
    const qty = Number(u.quantityUsed) || 0
    const unitPrice = Number(u.netPrice) || 0
    const existing = byPart.get(key)
    if (existing) {
      existing.quantity += qty
      existing.total = round2(existing.quantity * existing.unitPrice)
    } else {
      byPart.set(key, {
        partId: u.partId || '',
        partName: u.partName || '',
        partNumber: u.partNumber || '',
        quantity: qty,
        unitPrice,
        total: round2(qty * unitPrice),
      })
    }
  }
  return Array.from(byPart.values())
}

// Turn the booking's work + booked span into labour lines. The number of
// 30-minute slots gives the total hours, split evenly across each work item.
export function labourFromBooking(booking: ServiceBooking, rate: number): LabourLine[] {
  const span = Math.max(1, booking.slotCount ?? 1)
  const totalHours = span * 0.5
  const work: string[] = Array.isArray(booking.workRequired)
    ? booking.workRequired.filter(Boolean)
    : booking.workRequired
      ? [String(booking.workRequired)]
      : []
  const items = work.length > 0 ? work : ['Service']
  const perItem = round2(totalHours / items.length)
  return items.map((w, i) => ({
    id: `labour-${i}-${w}`,
    description: w,
    hours: perItem,
    rate,
    total: round2(perItem * rate),
  }))
}

interface BuildDraftInput {
  booking: ServiceBooking
  usage: PartUsageRecord[]
  organizationId: string
  createdBy: string
  createdByName: string
  invoiceNumber: string
  invoiceDate: string // YYYY-MM-DD
  labourRate: number
}

// Assemble a ready-to-save draft. Totals are a plain parts + labour sum (no
// markup / discount / VAT yet) — the invoice editor recomputes those on save.
export function buildInvoiceDraft(input: BuildDraftInput): Omit<Invoice, 'id' | 'createdAt'> {
  const { booking, usage, organizationId, createdBy, createdByName, invoiceNumber, invoiceDate, labourRate } = input
  const parts = aggregateUsageToParts(usage)
  const labour = labourFromBooking(booking, labourRate)
  const subtotal = round2(
    parts.reduce((s, p) => s + (p.total || 0), 0) +
    labour.reduce((s, l) => s + (l.total || 0), 0),
  )
  return {
    invoiceNumber,
    invoiceDate,
    vehicleId: '',
    vehicleRegistration: booking.registration || '',
    vehicleMake: booking.make || '',
    vehicleModel: booking.model || '',
    vehicleMileage: typeof booking.mileage === 'number' ? String(booking.mileage) : '',
    fromCompany: '',
    toCompany: booking.customerName || '',
    parts,
    labour,
    subtotal,
    total: subtotal,
    organizationId,
    createdBy,
    createdByName,
    status: 'draft',
  }
}
