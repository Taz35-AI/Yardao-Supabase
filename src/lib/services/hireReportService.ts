// src/lib/services/hireReportService.ts
// Builds the per-customer "Rent Plan / Active Rentals" report. Lists each active
// vehicle line with its contractual weekly/monthly rate (NOT prorated) and
// exports it to Excel / PDF. Reuses the app's xlsx + jspdf. Defensive: missing
// tables → empty plan.

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { downloadExcelFile } from '@/utils/excelDownload'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCreditService } from '@/lib/services/hireCreditService'
import type { HireAgreement, HireCredit } from '@/types/hire'

export interface RentPlanRow {
  registration: string
  agreementRef: string
  contractStart: string
  contractEnd: string
  rate: string
  rateType: 'weekly' | 'monthly'
  rateAmount: number
  status: string
  outDate: string
}

export interface RentPlan {
  customerName: string
  rows: RentPlanRow[]
  credits: HireCredit[]
  weeklyTotal: number
  monthlyTotal: number
  totalCredits: number
  generatedAt: string
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const euDate = (iso?: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}
const round2 = (n: number) => Math.round(n * 100) / 100
const rateLabel = (type: 'weekly' | 'monthly', amount: number) => `£${amount}/${type === 'monthly' ? 'mo' : 'wk'}`

export const hireReportService = {
  /** Active-rentals plan for one customer at the contractual rate (not prorated). */
  async buildRentPlan(organizationId: string, customerId: string, customerName: string): Promise<RentPlan> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

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
          rows.push({
            registration: l.registration || '—',
            agreementRef: ag.reference || ag.id.slice(0, 8),
            contractStart: euDate(ag.startDate),
            contractEnd: euDate(ag.endDate),
            rate: rateLabel(rateType, rateAmount),
            rateType,
            rateAmount,
            status: l.status,
            outDate: euDate(startStr),
          })
        }
        const agCredits = await hireCreditService.getCreditsForAgreement(organizationId, ag.id)
        credits.push(...agCredits)
      }
    }

    const weeklyTotal = round2(rows.filter((r) => r.rateType === 'weekly').reduce((s, r) => s + r.rateAmount, 0))
    const monthlyTotal = round2(rows.filter((r) => r.rateType === 'monthly').reduce((s, r) => s + r.rateAmount, 0))
    const approvedCredits = credits.filter((c) => c.status === 'approved')
    const totalCredits = round2(approvedCredits.reduce((s, c) => s + (c.estimatedCredit || 0), 0))
    return {
      customerName,
      rows,
      credits,
      weeklyTotal,
      monthlyTotal,
      totalCredits,
      generatedAt: ymd(today),
    }
  },

  exportExcel(plan: RentPlan): Promise<void> {
    const sheet: Record<string, string | number>[] = plan.rows.map((r) => ({
      Registration: r.registration,
      Agreement: r.agreementRef,
      'Hire start': r.outDate,
      'Contract start': r.contractStart,
      'Contract end': r.contractEnd,
      Rate: r.rate,
    }))
    if (plan.weeklyTotal > 0) {
      sheet.push({ Registration: '', Agreement: '', 'Hire start': '', 'Contract start': '', 'Contract end': 'WEEKLY TOTAL', Rate: `£${plan.weeklyTotal}/wk` })
    }
    if (plan.monthlyTotal > 0) {
      sheet.push({ Registration: '', Agreement: '', 'Hire start': '', 'Contract start': '', 'Contract end': 'MONTHLY TOTAL', Rate: `£${plan.monthlyTotal}/mo` })
    }
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
    doc.text('Reg', 14, y); doc.text('Agreement', 44, y); doc.text('Out', 90, y)
    doc.text('Contract end', 120, y); doc.text('Rate', 168, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    for (const r of plan.rows) {
      if (y > 275) { doc.addPage(); y = 16 }
      doc.text(String(r.registration), 14, y)
      doc.text(String(r.agreementRef), 44, y)
      doc.text(String(r.outDate), 90, y)
      doc.text(String(r.contractEnd || '—'), 120, y)
      doc.text(String(r.rate), 168, y)
      y += 5
    }
    y += 3
    doc.setFont('helvetica', 'bold')
    if (plan.weeklyTotal > 0) { doc.text(`Weekly total: £${plan.weeklyTotal.toFixed(2)}/wk`, 14, y); y += 5 }
    if (plan.monthlyTotal > 0) { doc.text(`Monthly total: £${plan.monthlyTotal.toFixed(2)}/mo`, 14, y); y += 5 }
    if (plan.totalCredits > 0) {
      doc.setFont('helvetica', 'normal')
      doc.text(`Approved credits to apply: -£${plan.totalCredits.toFixed(2)}`, 14, y)
    }
    const safe = plan.customerName.replace(/[^a-z0-9]+/gi, '_')
    doc.save(`RentPlan_${safe}_${plan.generatedAt}.pdf`)
  },
}
