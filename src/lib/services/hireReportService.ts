// src/lib/services/hireReportService.ts
// Builds the per-customer "Rent Plan / Active Rentals" report. Lists each active
// vehicle line with its contractual weekly/monthly rate (NOT prorated) and
// exports it to Excel / PDF. Reuses the app's xlsx + jspdf. Defensive: missing
// tables → empty plan.

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { supabase } from '@/lib/supabaseClient'
import { downloadExcelFile } from '@/utils/excelDownload'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCreditService } from '@/lib/services/hireCreditService'
import type { ContractSchedule } from '@/lib/services/hireScheduleService'
import type { HireAgreement, HireCredit } from '@/types/hire'

export interface RentPlanRow {
  registration: string
  make: string
  model: string
  agreementRef: string
  contractStart: string
  contractEnd: string
  rate: string
  rateType: 'weekly' | 'monthly'
  rateAmount: number
  status: string
  outDate: string
  size: string
  colour: string
  motExpiry: string
  taxExpiry: string
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
const rateLabel = (type: 'weekly' | 'monthly', amount: number) => `£${amount}/${type === 'monthly' ? '4wk' : 'wk'}`

export const hireReportService = {
  /** Batch-fetch size / colour / MOT / tax for a set of vehicle ids. */
  async fetchVehicleDetail(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Record<string, { size?: string; colour?: string; motExpiry?: string; taxExpiry?: string }>> {
    const map: Record<string, { size?: string; colour?: string; motExpiry?: string; taxExpiry?: string }> = {}
    if (!organizationId || vehicleIds.length === 0) return map
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, size, colour, mot_expiry, tax_expiry')
        .eq('organization_id', organizationId)
        .in('id', vehicleIds)
      if (error) throw error
      for (const v of data ?? []) {
        map[v.id] = { size: v.size, colour: v.colour, motExpiry: v.mot_expiry, taxExpiry: v.tax_expiry }
      }
    } catch {
      /* missing/locked table → no detail, rows just show blanks */
    }
    return map
  },

  /** Active-rentals plan for one customer at the contractual rate (not prorated). */
  async buildRentPlan(organizationId: string, customerId: string, customerName: string): Promise<RentPlan> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const rows: RentPlanRow[] = []
    const credits: HireCredit[] = []
    let agreements: HireAgreement[] = []
    // Build the active lines first so we can batch-fetch vehicle detail in one go.
    type Pending = { row: RentPlanRow; vehicleId: string | null }
    const pending: Pending[] = []
    const vehicleIds = new Set<string>()
    if (organizationId && customerId) {
      agreements = await hireAgreementService.getAgreementsForCustomer(organizationId, customerId)
      for (const ag of agreements) {
        const lines = await hireAgreementService.getLines(organizationId, ag.id)
        for (const l of lines) {
          if (l.status !== 'active') continue
          const rateType = (l.lineRateType || ag.rateType) as 'weekly' | 'monthly'
          const rateAmount = l.lineRateAmount ?? ag.rateAmount
          const startStr = (l.actualOutAt ? l.actualOutAt.slice(0, 10) : l.scheduledStart) || ag.startDate
          if (l.vehicleId) vehicleIds.add(l.vehicleId)
          pending.push({
            vehicleId: l.vehicleId || null,
            row: {
              registration: l.registration || '—',
              make: l.make || '',
              model: l.model || '',
              agreementRef: ag.reference || ag.id.slice(0, 8),
              contractStart: euDate(ag.startDate),
              contractEnd: ag.isRolling ? 'Rolling' : euDate(ag.endDate),
              rate: rateLabel(rateType, rateAmount),
              rateType,
              rateAmount,
              status: l.status,
              outDate: euDate(startStr),
              size: '',
              colour: '',
              motExpiry: '',
              taxExpiry: '',
            },
          })
        }
        const agCredits = await hireCreditService.getCreditsForAgreement(organizationId, ag.id)
        credits.push(...agCredits)
      }
    }

    // Decorate each row with the vehicle's size / colour / MOT / tax (one query).
    const detail = await this.fetchVehicleDetail(organizationId, Array.from(vehicleIds))
    for (const p of pending) {
      const d = p.vehicleId ? detail[p.vehicleId] : undefined
      if (d) {
        p.row.size = d.size || ''
        p.row.colour = d.colour || ''
        p.row.motExpiry = euDate(d.motExpiry)
        p.row.taxExpiry = euDate(d.taxExpiry)
      }
      rows.push(p.row)
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
    const blank = {
      Registration: '', Make: '', Model: '', Size: '', Colour: '', MOT: '', Tax: '',
      Agreement: '', 'Start date': '', 'End date': '', Rate: '',
    }
    const sheet: Record<string, string | number>[] = plan.rows.map((r) => ({
      Registration: r.registration,
      Make: r.make,
      Model: r.model,
      Size: r.size,
      Colour: r.colour,
      MOT: r.motExpiry,
      Tax: r.taxExpiry,
      Agreement: r.agreementRef,
      'Start date': r.outDate,
      'End date': r.contractEnd,
      Rate: r.rate,
    }))
    if (plan.weeklyTotal > 0) {
      sheet.push({ ...blank, 'End date': 'WEEKLY TOTAL', Rate: `£${plan.weeklyTotal}/wk` })
    }
    if (plan.monthlyTotal > 0) {
      sheet.push({ ...blank, 'End date': '4-WEEKLY TOTAL', Rate: `£${plan.monthlyTotal}/4wk` })
    }
    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Active Rentals')
    const safe = plan.customerName.replace(/[^a-z0-9]+/gi, '_')
    return downloadExcelFile(wb, `RentPlan_${safe}_${plan.generatedAt}.xlsx`)
  },

  exportPdf(plan: RentPlan): void {
    // Landscape to fit Reg / Make / Model / Size / Colour / MOT / Tax / Start / End / Rate.
    const doc = new jsPDF({ orientation: 'landscape' })
    const X = { reg: 14, make: 44, model: 72, size: 104, colour: 126, mot: 150, tax: 176, start: 202, end: 228, rate: 268 }
    let y = 16
    doc.setFontSize(16)
    doc.text(`Rent Plan — ${plan.customerName}`, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Generated ${euDate(plan.generatedAt)}`, 14, y)
    y += 8
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text('Reg', X.reg, y); doc.text('Make', X.make, y); doc.text('Model', X.model, y)
    doc.text('Size', X.size, y); doc.text('Colour', X.colour, y); doc.text('MOT', X.mot, y)
    doc.text('Tax', X.tax, y); doc.text('Start date', X.start, y); doc.text('End date', X.end, y)
    doc.text('Rate', X.rate, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
    for (const r of plan.rows) {
      if (y > 190) { doc.addPage(); y = 16 }
      doc.text(String(r.registration), X.reg, y)
      doc.text(trunc(String(r.make || '—'), 14), X.make, y)
      doc.text(trunc(String(r.model || '—'), 16), X.model, y)
      doc.text(trunc(String(r.size || '—'), 10), X.size, y)
      doc.text(trunc(String(r.colour || '—'), 11), X.colour, y)
      doc.text(String(r.motExpiry || '—'), X.mot, y)
      doc.text(String(r.taxExpiry || '—'), X.tax, y)
      doc.text(String(r.outDate), X.start, y)
      doc.text(String(r.contractEnd || '—'), X.end, y)
      doc.text(String(r.rate), X.rate, y)
      y += 5
    }
    y += 3
    doc.setFont('helvetica', 'bold')
    if (plan.weeklyTotal > 0) { doc.text(`Weekly total: £${plan.weeklyTotal.toFixed(2)}/wk`, 14, y); y += 5 }
    if (plan.monthlyTotal > 0) { doc.text(`4-weekly total: £${plan.monthlyTotal.toFixed(2)}/4wk`, 14, y); y += 5 }
    if (plan.totalCredits > 0) {
      doc.setFont('helvetica', 'normal')
      doc.text(`Approved credits to apply: -£${plan.totalCredits.toFixed(2)}`, 14, y)
    }
    const safe = plan.customerName.replace(/[^a-z0-9]+/gi, '_')
    doc.save(`RentPlan_${safe}_${plan.generatedAt}.pdf`)
  },

  /**
   * Export a contract's billing schedule to Excel: one row per (period, vehicle)
   * with days + amount, a subtotal row per period, and a grand total.
   */
  exportScheduleExcel(schedule: ContractSchedule, meta: { reference: string; customerName: string }): Promise<void> {
    const freq = schedule.rateType === 'weekly' ? '/wk' : '/4wk'
    const sheet: Record<string, string | number>[] = []
    for (const p of schedule.periods) {
      if (p.vehicles.length === 0) {
        sheet.push({ Period: p.index, 'Period start': euDate(p.start), 'Period end': euDate(p.end), Registration: '—', Days: 0, 'Amount (£)': 0, Note: '' })
      }
      for (const v of p.vehicles) {
        sheet.push({
          Period: p.index,
          'Period start': euDate(p.start),
          'Period end': euDate(p.end),
          Registration: v.registration,
          Days: v.days,
          'Amount (£)': v.amount,
          Note: v.swapNote || (v.isPartial ? 'Part period' : ''),
        })
      }
      sheet.push({ Period: '', 'Period start': '', 'Period end': '', Registration: '', Days: 'Period total', 'Amount (£)': p.total, Note: '' })
    }
    sheet.push({ Period: '', 'Period start': '', 'Period end': '', Registration: '', Days: 'GRAND TOTAL', 'Amount (£)': schedule.grandTotal, Note: `Rate £${schedule.rateAmount}${freq}/vehicle` })

    const ws = XLSX.utils.json_to_sheet(sheet)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule')
    const safeRef = (meta.reference || 'contract').replace(/[^a-z0-9]+/gi, '_')
    const safeCust = (meta.customerName || '').replace(/[^a-z0-9]+/gi, '_')
    return downloadExcelFile(wb, `Schedule_${safeCust}_${safeRef}.xlsx`)
  },
}
