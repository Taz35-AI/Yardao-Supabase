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
import { hireCustomerService } from '@/lib/services/hireCustomerService'
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

/** One vehicle line, flattened with its agreement + customer, for the org-wide export. */
export interface HireExportRow {
  status: string
  customer: string
  accountNo: string
  agreementRef: string
  registration: string
  make: string
  model: string
  size: string
  colour: string
  motExpiry: string
  taxExpiry: string
  scheduledStart: string
  scheduledEnd: string
  outDate: string
  returnDate: string
  daysOnHire: number | ''
  rate: string
  rateType: string
  rateAmount: number
  branch: string
  notes: string
}

export interface HireExport {
  rows: HireExportRow[]
  generatedAt: string
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

/** Line status → the wording the yard uses, so the export reads like the UI. */
const HIRE_STATUS_LABEL: Record<string, string> = {
  active: 'On hire',
  scheduled: 'Reserved',
  returned: 'Returned',
  swapped: 'Swapped',
  cancelled: 'Cancelled',
}

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

  /**
   * Org-wide export: every vehicle line (on hire, returned, reserved, swapped,
   * cancelled) flattened with its agreement, customer and vehicle detail.
   */
  async buildHireExport(organizationId: string): Promise<HireExport> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (!organizationId) return { rows: [], generatedAt: ymd(today) }

    const [lines, agreements, customers] = await Promise.all([
      hireAgreementService.getAllLines(organizationId),
      hireAgreementService.getAgreements(organizationId),
      hireCustomerService.getCustomers(organizationId),
    ])

    const agById = new Map(agreements.map((a) => [a.id, a]))
    const custById = new Map(customers.map((c) => [c.id, c]))
    const detail = await this.fetchVehicleDetail(
      organizationId,
      Array.from(new Set(lines.map((l) => l.vehicleId).filter(Boolean) as string[])),
    )

    const rows: HireExportRow[] = lines.map((l) => {
      const ag = l.agreementId ? agById.get(l.agreementId) : undefined
      const cust = ag?.customerId ? custById.get(ag.customerId) : undefined
      const d = l.vehicleId ? detail[l.vehicleId] : undefined
      const rateType = (l.lineRateType || ag?.rateType || 'weekly') as 'weekly' | 'monthly'
      const rateAmount = l.lineRateAmount ?? ag?.rateAmount ?? 0

      // Days on hire: out → return, or out → today while still running.
      const outIso = l.actualOutAt ? l.actualOutAt.slice(0, 10) : ''
      const backIso = l.actualReturnAt ? l.actualReturnAt.slice(0, 10) : ''
      let daysOnHire: number | '' = ''
      if (outIso) {
        const end = backIso ? new Date(backIso + 'T00:00:00') : today
        const days = Math.round((end.getTime() - new Date(outIso + 'T00:00:00').getTime()) / 86_400_000)
        if (Number.isFinite(days) && days >= 0) daysOnHire = days
      }

      return {
        status: l.status,
        customer: cust?.companyName || cust?.name || ag?.customerName || '—',
        accountNo: cust?.accountNo || '',
        agreementRef: ag?.reference || (ag ? ag.id.slice(0, 8) : ''),
        registration: l.registration || '—',
        make: l.make || '',
        model: l.model || '',
        size: d?.size || '',
        colour: d?.colour || '',
        motExpiry: euDate(d?.motExpiry),
        taxExpiry: euDate(d?.taxExpiry),
        scheduledStart: euDate(l.scheduledStart),
        scheduledEnd: euDate(l.scheduledEnd),
        outDate: euDate(outIso),
        returnDate: euDate(backIso),
        daysOnHire,
        rate: rateLabel(rateType, rateAmount),
        rateType,
        rateAmount,
        branch: ag?.branchName || '',
        notes: l.notes || '',
      }
    })

    // On hire first, then reserved, returned, and the closed states.
    const ORDER: Record<string, number> = { active: 0, scheduled: 1, returned: 2, swapped: 3, cancelled: 4 }
    rows.sort((a, b) =>
      (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) ||
      a.customer.localeCompare(b.customer) ||
      a.registration.localeCompare(b.registration))

    return { rows, generatedAt: ymd(today) }
  },

  /**
   * Excel workbook for the org-wide export: a tab per status plus "All vehicles".
   * Empty statuses are skipped so the book only holds tabs that mean something.
   */
  exportHireExcel(data: HireExport): Promise<void> {
    const sheetRow = (r: HireExportRow) => ({
      Status: HIRE_STATUS_LABEL[r.status] || r.status,
      Customer: r.customer,
      'Account no': r.accountNo,
      Agreement: r.agreementRef,
      Registration: r.registration,
      Make: r.make,
      Model: r.model,
      Size: r.size,
      Colour: r.colour,
      MOT: r.motExpiry,
      Tax: r.taxExpiry,
      'Scheduled start': r.scheduledStart,
      'Scheduled end': r.scheduledEnd,
      'Out on hire': r.outDate,
      Returned: r.returnDate,
      'Days on hire': r.daysOnHire,
      Rate: r.rate,
      Branch: r.branch,
      Notes: r.notes,
    })

    const wb = XLSX.utils.book_new()
    const addSheet = (name: string, rows: HireExportRow[]) => {
      if (rows.length === 0) return
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sheetRow)), name)
    }

    addSheet('On hire', data.rows.filter((r) => r.status === 'active'))
    addSheet('Reserved', data.rows.filter((r) => r.status === 'scheduled'))
    addSheet('Returned', data.rows.filter((r) => r.status === 'returned'))
    addSheet('Swapped', data.rows.filter((r) => r.status === 'swapped'))
    addSheet('Cancelled', data.rows.filter((r) => r.status === 'cancelled'))
    addSheet('All vehicles', data.rows)
    // A book with no sheets can't be written — guarantee at least the summary.
    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), 'All vehicles')
    }

    return downloadExcelFile(wb, `Hire_Vehicles_${data.generatedAt}.xlsx`)
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
    // Landscape. PDF omits MOT/Tax (kept in Excel + on-screen) to give the long
    // Contract name room, and truncates text so columns never overlap.
    const doc = new jsPDF({ orientation: 'landscape' })
    const X = { contract: 14, reg: 60, make: 92, model: 120, size: 152, colour: 172, start: 200, end: 232, rate: 266 }
    let y = 16
    doc.setFontSize(16)
    doc.text(`Rent Plan — ${plan.customerName}`, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Generated ${euDate(plan.generatedAt)}`, 14, y)
    y += 8
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Contract', X.contract, y); doc.text('Reg', X.reg, y); doc.text('Make', X.make, y)
    doc.text('Model', X.model, y); doc.text('Size', X.size, y); doc.text('Colour', X.colour, y)
    doc.text('Start date', X.start, y); doc.text('End date', X.end, y); doc.text('Rate', X.rate, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
    for (const r of plan.rows) {
      if (y > 190) { doc.addPage(); y = 16 }
      doc.text(trunc(String(r.agreementRef || '—'), 22), X.contract, y)
      doc.text(trunc(String(r.registration), 10), X.reg, y)
      doc.text(trunc(String(r.make || '—'), 13), X.make, y)
      doc.text(trunc(String(r.model || '—'), 14), X.model, y)
      doc.text(trunc(String(r.size || '—'), 9), X.size, y)
      doc.text(trunc(String(r.colour || '—'), 11), X.colour, y)
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
