// src/lib/services/hireReportService.ts
// Builds the per-customer "Rent Plan / Active Rentals" report (calendar-accurate
// prorated amounts to date) and exports it to Excel / PDF. Reuses the app's xlsx
// + jspdf. Defensive: missing tables → empty plan.

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { downloadExcelFile } from '@/utils/excelDownload'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCreditService } from '@/lib/services/hireCreditService'
import { prorationService } from '@/lib/services/prorationService'
import type { HireAgreement, HireCredit } from '@/types/hire'

export interface RentPlanRow {
  registration: string
  agreementRef: string
  contractStart: string
  contractEnd: string
  rate: string
  status: string
  outDate: string
  daysOnHire: number
  proratedToDate: number
}

export interface RentPlan {
  customerName: string
  rows: RentPlanRow[]
  credits: HireCredit[]
  totalProrated: number
  totalCredits: number
  net: number
  generatedAt: string
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const euDate = (iso?: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}
const round2 = (n: number) => Math.round(n * 100) / 100

export const hireReportService = {
  /** Active-rentals plan for one customer, prorated to today. */
  async buildRentPlan(organizationId: string, customerId: string, customerName: string): Promise<RentPlan> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowYmd = ymd(tomorrow)

    const rows: RentPlanRow[] = []
    const credits: HireCredit[] = []
    let agreements: HireAgreement[] = []
    if (organizationId && customerId) {
      agreements = await hireAgreementService.getAgreementsForCustomer(organizationId, customerId)
      for (const ag of agreements) {
        const lines = await hireAgreementService.getLines(organizationId, ag.id)
        for (const l of lines) {
          if (l.status !== 'active') continue
          const rateType = (l.lineRateType || ag.rateType) as 'weekly' | 'monthly'
          const rateAmount = l.lineRateAmount ?? ag.rateAmount
          const startStr = (l.actualOutAt ? l.actualOutAt.slice(0, 10) : l.scheduledStart) || ag.startDate
          const days = prorationService.dayCount(startStr, tomorrowYmd)
          const prorated = prorationService.prorate(rateType, rateAmount, startStr, tomorrowYmd)
          rows.push({
            registration: l.registration || '—',
            agreementRef: ag.reference || ag.id.slice(0, 8),
            contractStart: euDate(ag.startDate),
            contractEnd: euDate(ag.endDate),
            rate: `£${rateAmount}/${rateType === 'monthly' ? 'mo' : 'wk'}`,
            status: l.status,
            outDate: euDate(startStr),
            daysOnHire: days,
            proratedToDate: prorated,
          })
        }
        const agCredits = await hireCreditService.getCreditsForAgreement(organizationId, ag.id)
        credits.push(...agCredits)
      }
    }

    const totalProrated = round2(rows.reduce((s, r) => s + r.proratedToDate, 0))
    const approvedCredits = credits.filter((c) => c.status === 'approved')
    const totalCredits = round2(approvedCredits.reduce((s, c) => s + (c.estimatedCredit || 0), 0))
    return {
      customerName,
      rows,
      credits,
      totalProrated,
      totalCredits,
      net: round2(totalProrated - totalCredits),
      generatedAt: ymd(today),
    }
  },

  exportExcel(plan: RentPlan): Promise<void> {
    const sheet = plan.rows.map((r) => ({
      Registration: r.registration,
      Agreement: r.agreementRef,
      'Hire start': r.outDate,
      'Contract start': r.contractStart,
      'Contract end': r.contractEnd,
      Rate: r.rate,
      'Days on hire': r.daysOnHire,
      'Prorated to date (£)': r.proratedToDate,
    }))
    sheet.push({
      Registration: '', Agreement: '', 'Hire start': '', 'Contract start': '', 'Contract end': '',
      Rate: 'TOTAL', 'Days on hire': '' as any, 'Prorated to date (£)': plan.totalProrated,
    })
    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Active Rentals')
    const safe = plan.customerName.replace(/[^a-z0-9]+/gi, '_')
    return downloadExcelFile(wb, `RentPlan_${safe}_${plan.generatedAt}.xlsx`)
  },

  exportPdf(plan: RentPlan): void {
    const doc = new jsPDF()
    let y = 16
    doc.setFontSize(16)
    doc.text(`Rent Plan — ${plan.customerName}`, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Generated ${euDate(plan.generatedAt)}`, 14, y)
    y += 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Reg', 14, y); doc.text('Agreement', 40, y); doc.text('Out', 78, y)
    doc.text('Rate', 104, y); doc.text('Days', 134, y); doc.text('£ to date', 158, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    for (const r of plan.rows) {
      if (y > 275) { doc.addPage(); y = 16 }
      doc.text(String(r.registration), 14, y)
      doc.text(String(r.agreementRef), 40, y)
      doc.text(String(r.outDate), 78, y)
      doc.text(String(r.rate), 104, y)
      doc.text(String(r.daysOnHire), 134, y)
      doc.text(String(r.proratedToDate.toFixed(2)), 158, y)
      y += 5
    }
    y += 3
    doc.setFont('helvetica', 'bold')
    doc.text(`Total prorated: £${plan.totalProrated.toFixed(2)}`, 14, y); y += 5
    if (plan.totalCredits > 0) {
      doc.text(`Approved credits: -£${plan.totalCredits.toFixed(2)}`, 14, y); y += 5
      doc.text(`Net: £${plan.net.toFixed(2)}`, 14, y)
    }
    const safe = plan.customerName.replace(/[^a-z0-9]+/gi, '_')
    doc.save(`RentPlan_${safe}_${plan.generatedAt}.pdf`)
  },
}
