// src/lib/utils/generateInvoicePDF.ts
// ✅ Generates a professional A4 invoice PDF using jsPDF
// Separated from UI - pure logic, no React dependencies
// Install: npm install jspdf

import jsPDF from 'jspdf'
import { Invoice } from '@/types/stock'
import { FromCompanyDetails, ToCompanyDetails } from '@/lib/services/settingsService'

interface GenerateInvoicePDFParams {
  invoice: Invoice
  fromCompanyDetails: FromCompanyDetails | null
  toCompanyDetails: ToCompanyDetails | null
}

// ── Brand Colours ──
const COLORS = {
  primary: [2, 89, 64] as [number, number, number],       // #025940
  primaryLight: [114, 166, 142] as [number, number, number], // #72A68E
  accent: [179, 242, 67] as [number, number, number],      // #b3f243
  dark: [1, 38, 25] as [number, number, number],           // #012619
  text: [30, 30, 30] as [number, number, number],
  textLight: [120, 120, 120] as [number, number, number],
  tableBorder: [200, 200, 200] as [number, number, number],
  tableHeaderBg: [245, 247, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  statusPaid: [22, 163, 74] as [number, number, number],
  statusIssued: [37, 99, 235] as [number, number, number],
  statusDraft: [107, 114, 128] as [number, number, number],
}

// ── Page Constants ──
const PAGE_WIDTH = 210  // A4 mm
const MARGIN_LEFT = 20
const MARGIN_RIGHT = 20
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

/**
 * Generate and download a professional invoice PDF
 */
export function generateInvoicePDF({ invoice, fromCompanyDetails, toCompanyDetails }: GenerateInvoicePDFParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4')
  let y = 20 // Current Y position tracker

  // ══════════════════════════════════════════
  // HEADER - Invoice title + status badge
  // ══════════════════════════════════════════
  
  // Green accent bar at top
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, PAGE_WIDTH, 4, 'F')

  // "INVOICE" title (top-left)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...COLORS.primary)
  doc.text('INVOICE', MARGIN_LEFT, y + 10)

  // Logo (top-right corner) — embedded if the invoicing business set one.
  let logoBottom = y
  if (invoice.fromLogo && invoice.fromLogo.startsWith('data:image')) {
    try {
      const maxW = 70, maxH = 42
      const props = doc.getImageProperties(invoice.fromLogo)
      const ratio = (props.width || 1) / (props.height || 1)
      let w = maxW, h = maxW / ratio
      if (h > maxH) { h = maxH; w = maxH * ratio }
      const lx = PAGE_WIDTH - MARGIN_RIGHT - w
      doc.addImage(invoice.fromLogo, props.fileType || 'PNG', lx, 8, w, h)
      logoBottom = 8 + h
    } catch {
      // An invalid logo must never break the invoice.
    }
  }

  // Status badge (top-right) — sits BELOW the logo so the two never overlap.
  const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)
  const statusColor = invoice.status === 'paid'
    ? COLORS.statusPaid
    : invoice.status === 'issued'
    ? COLORS.statusIssued
    : COLORS.statusDraft

  doc.setFontSize(10)
  const statusWidth = doc.getTextWidth(statusText) + 10
  const statusX = PAGE_WIDTH - MARGIN_RIGHT - statusWidth
  const badgeY = Math.max(y + 1, logoBottom + 2)

  doc.setFillColor(...statusColor)
  doc.roundedRect(statusX, badgeY, statusWidth, 8, 2, 2, 'F')
  doc.setTextColor(...COLORS.white)
  doc.setFont('helvetica', 'bold')
  doc.text(statusText, statusX + statusWidth / 2, badgeY + 5.5, { align: 'center' })

  y = Math.max(y + 18, badgeY + 12)

  // Invoice number and date
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.textLight)
  doc.text(`#${invoice.invoiceNumber}`, MARGIN_LEFT, y)
  y += 6
  doc.setFontSize(9)
  doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}`, MARGIN_LEFT, y)
  y += 10

  // Thin separator line
  doc.setDrawColor(...COLORS.tableBorder)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 8

  // ══════════════════════════════════════════
  // FROM / TO COMPANIES (side by side)
  // ══════════════════════════════════════════
  const colWidth = CONTENT_WIDTH / 2
  const fromX = MARGIN_LEFT
  const toX = MARGIN_LEFT + colWidth + 5

  // "FROM" header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.primaryLight)
  doc.text('FROM', fromX, y)
  doc.text('TO', toX, y)
  y += 5

  // From company details
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.text(invoice.fromCompany, fromX, y)

  // To company details
  doc.text(invoice.toCompany, toX, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.textLight)

  let fromY = y
  let toY = y

  if (fromCompanyDetails) {
    if (fromCompanyDetails.address) {
      doc.text(fromCompanyDetails.address, fromX, fromY)
      fromY += 4
    }
    if (fromCompanyDetails.postcode) {
      doc.text(fromCompanyDetails.postcode, fromX, fromY)
      fromY += 5
    }
    if (fromCompanyDetails.vatNumber) {
      doc.text(`VAT: ${fromCompanyDetails.vatNumber}`, fromX, fromY)
      fromY += 4
    }
    if (fromCompanyDetails.companyRegNo) {
      doc.text(`Reg: ${fromCompanyDetails.companyRegNo}`, fromX, fromY)
      fromY += 4
    }
  }

  if (toCompanyDetails) {
    if (toCompanyDetails.address) {
      doc.text(toCompanyDetails.address, toX, toY)
      toY += 4
    }
    if (toCompanyDetails.postcode) {
      doc.text(toCompanyDetails.postcode, toX, toY)
      toY += 5
    }
    if (toCompanyDetails.email) {
      doc.text(toCompanyDetails.email, toX, toY)
      toY += 4
    }
  }

  y = Math.max(fromY, toY) + 8

  // ══════════════════════════════════════════
  // VEHICLE INFO BOX
  // ══════════════════════════════════════════
  doc.setFillColor(240, 247, 255)
  doc.setDrawColor(191, 219, 254)
  doc.roundedRect(MARGIN_LEFT, y, CONTENT_WIDTH, 16, 2, 2, 'FD')

  // Left: VEHICLE label + registration
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(30, 64, 175)
  doc.text('VEHICLE', MARGIN_LEFT + 4, y + 5)
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.text)
  doc.text(invoice.vehicleRegistration, MARGIN_LEFT + 4, y + 12)

  // Right: make / model + odometer (ODO)
  const vehRightX = PAGE_WIDTH - MARGIN_RIGHT - 4
  const makeModel = `${invoice.vehicleMake || ''} ${invoice.vehicleModel || ''}`.trim()
  if (makeModel) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.text)
    doc.text(makeModel, vehRightX, y + 6.5, { align: 'right' })
  }
  if (invoice.vehicleMileage) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.textLight)
    doc.text(`ODO: ${invoice.vehicleMileage}`, vehRightX, y + 12.5, { align: 'right' })
  }
  y += 22

  // ══════════════════════════════════════════
  // PARTS TABLE
  // ══════════════════════════════════════════
  if (invoice.parts.length > 0) {
    y = drawSectionTitle(doc, 'Parts', y)
    y = drawPartsTable(doc, invoice.parts, y)
    y += 4
  }

  // ══════════════════════════════════════════
  // LABOUR TABLE
  // ══════════════════════════════════════════
  if (invoice.labour.length > 0) {
    y = drawSectionTitle(doc, 'Labour', y)
    y = drawLabourTable(doc, invoice.labour, y)
    y += 4
  }

  // ══════════════════════════════════════════
  // TOTALS (right-aligned)
  // ══════════════════════════════════════════
  y += 2
  const totalsX = PAGE_WIDTH - MARGIN_RIGHT - 60
  const totalsValueX = PAGE_WIDTH - MARGIN_RIGHT

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.textLight)

  // Subtotal
  doc.text('Subtotal:', totalsX, y)
  doc.text(`£${invoice.subtotal.toFixed(2)}`, totalsValueX, y, { align: 'right' })
  y += 5

  // Discount (applied to the net, before VAT — own line)
  if (invoice.discount !== undefined && invoice.discount > 0) {
    const label = invoice.discountPercent ? `Discount (${invoice.discountPercent}%):` : 'Discount:'
    doc.text(label, totalsX, y)
    doc.text(`-£${invoice.discount.toFixed(2)}`, totalsValueX, y, { align: 'right' })
    y += 5
  }

  // VAT
  if (invoice.vat !== undefined && invoice.vat > 0) {
    doc.text('VAT (20%):', totalsX, y)
    doc.text(`£${invoice.vat.toFixed(2)}`, totalsValueX, y, { align: 'right' })
    y += 6
  }

  // Total line separator
  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(0.5)
  doc.line(totalsX - 2, y, totalsValueX, y)
  y += 5

  // Grand total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...COLORS.primary)
  doc.text('Total:', totalsX, y)
  doc.text(`£${invoice.total.toFixed(2)}`, totalsValueX, y, { align: 'right' })
  y += 14

  // ══════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════
  doc.setDrawColor(...COLORS.tableBorder)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.textLight)
  doc.setFont('helvetica', 'italic')
  doc.text('Thank you for your business', PAGE_WIDTH / 2, y, { align: 'center' })

  // Green accent bar at bottom
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 293, PAGE_WIDTH, 4, 'F')

  // ══════════════════════════════════════════
  // SAVE / DOWNLOAD
  // ══════════════════════════════════════════
  const filename = `Invoice_${invoice.invoiceNumber}_${invoice.vehicleRegistration}.pdf`
  doc.save(filename)
}


// ══════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.text(title, MARGIN_LEFT, y)
  return y + 5
}

function drawPartsTable(doc: jsPDF, parts: Invoice['parts'], startY: number): number {
  const colWidths = [50, 40, 20, 30, 30] // Part Name, Part No, Qty, Price, Total
  const headers = ['Part Name', 'Part Number', 'Qty', 'Price', 'Total']
  let y = startY

  // Table header background
  doc.setFillColor(...COLORS.tableHeaderBg)
  doc.rect(MARGIN_LEFT, y - 3.5, CONTENT_WIDTH, 7, 'F')

  // Header text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.textLight)

  let x = MARGIN_LEFT + 2
  headers.forEach((header, i) => {
    if (i >= 2) {
      // Right-align numeric headers
      doc.text(header, x + colWidths[i] - 2, y, { align: 'right' })
    } else {
      doc.text(header, x, y)
    }
    x += colWidths[i]
  })

  y += 5

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.text)

  parts.forEach((part) => {
    // Check if we need a new page
    if (y > 270) {
      doc.addPage()
      y = 20
    }

    // Row separator
    doc.setDrawColor(...COLORS.tableBorder)
    doc.setLineWidth(0.2)
    doc.line(MARGIN_LEFT, y - 3, PAGE_WIDTH - MARGIN_RIGHT, y - 3)

    x = MARGIN_LEFT + 2
    
    // Part Name (truncate if too long)
    const partName = part.partName.length > 28 ? part.partName.substring(0, 26) + '...' : part.partName
    doc.text(partName, x, y)
    x += colWidths[0]

    // Part Number
    doc.setTextColor(...COLORS.textLight)
    const partNum = part.partNumber.length > 20 ? part.partNumber.substring(0, 18) + '…' : part.partNumber
    doc.text(partNum, x, y)
    x += colWidths[1]

    // Qty (right-aligned)
    doc.setTextColor(...COLORS.text)
    doc.text(String(part.quantity), x + colWidths[2] - 2, y, { align: 'right' })
    x += colWidths[2]

    // Unit Price (right-aligned)
    doc.text(`£${part.unitPrice.toFixed(2)}`, x + colWidths[3] - 2, y, { align: 'right' })
    x += colWidths[3]

    // Total (right-aligned, bold)
    doc.setFont('helvetica', 'bold')
    doc.text(`£${part.total.toFixed(2)}`, x + colWidths[4] - 2, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    y += 6
  })

  return y
}

function drawLabourTable(doc: jsPDF, labour: Invoice['labour'], startY: number): number {
  const colWidths = [80, 25, 30, 35] // Description, Hours, Rate, Total
  const headers = ['Description', 'Hours', 'Rate', 'Total']
  let y = startY

  // Table header background
  doc.setFillColor(...COLORS.tableHeaderBg)
  doc.rect(MARGIN_LEFT, y - 3.5, CONTENT_WIDTH, 7, 'F')

  // Header text
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...COLORS.textLight)

  let x = MARGIN_LEFT + 2
  headers.forEach((header, i) => {
    if (i >= 1) {
      doc.text(header, x + colWidths[i] - 2, y, { align: 'right' })
    } else {
      doc.text(header, x, y)
    }
    x += colWidths[i]
  })

  y += 5

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.text)

  labour.forEach((item) => {
    if (y > 270) {
      doc.addPage()
      y = 20
    }

    doc.setDrawColor(...COLORS.tableBorder)
    doc.setLineWidth(0.2)
    doc.line(MARGIN_LEFT, y - 3, PAGE_WIDTH - MARGIN_RIGHT, y - 3)

    x = MARGIN_LEFT + 2

    // Description
    const desc = item.description.length > 40 ? item.description.substring(0, 38) + '...' : item.description
    doc.text(desc, x, y)
    x += colWidths[0]

    // Hours (right-aligned)
    doc.text(`${item.hours}h`, x + colWidths[1] - 2, y, { align: 'right' })
    x += colWidths[1]

    // Rate (right-aligned)
    doc.text(`£${item.rate.toFixed(2)}/hr`, x + colWidths[2] - 2, y, { align: 'right' })
    x += colWidths[2]

    // Total (right-aligned, bold)
    doc.setFont('helvetica', 'bold')
    doc.text(`£${item.total.toFixed(2)}`, x + colWidths[3] - 2, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    y += 6
  })

  return y
}