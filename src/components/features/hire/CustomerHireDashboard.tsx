// src/components/features/hire/CustomerHireDashboard.tsx
// Per-customer B2B dashboard: active rentals with calendar-accurate prorated
// amounts to date, plus one-click Excel / PDF Rent Plan export.
'use client'

import React, { useEffect, useState } from 'react'
import { X, FileSpreadsheet, FileText, Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { hireReportService, type RentPlan } from '@/lib/services/hireReportService'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { activityLogService, type ActivityRecord } from '@/lib/services/activityLogService'
import { useT } from '@/lib/i18n'
import { euDate } from './hireFormat'

export function CustomerHireDashboard({
  organizationId,
  customerId,
  customerName,
  isBusiness,
  onClose,
}: {
  organizationId: string | null
  customerId: string
  customerName: string
  isBusiness: boolean
  onClose: () => void
}) {
  const t = useT()
  const [plan, setPlan] = useState<RentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'rentals' | 'timeline'>('rentals')
  const [timeline, setTimeline] = useState<ActivityRecord[] | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const p = await hireReportService.buildRentPlan(organizationId, customerId, customerName)
      if (!cancelled) {
        setPlan(p)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, customerId, customerName])

  // Load the customer's activity timeline (across all their vehicles) on demand.
  useEffect(() => {
    if (view !== 'timeline' || timeline !== null || !organizationId) return
    let cancelled = false
    ;(async () => {
      const ags = await hireAgreementService.getAgreementsForCustomer(organizationId, customerId)
      const regs = new Set<string>()
      for (const ag of ags) {
        const lines = await hireAgreementService.getLines(organizationId, ag.id)
        for (const l of lines) if (l.registration) regs.add(l.registration)
      }
      const all = await Promise.all(Array.from(regs).map((r) => activityLogService.getForVehicle(organizationId, r)))
      const merged = all.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 80)
      if (!cancelled) setTimeline(merged)
    })()
    return () => {
      cancelled = true
    }
  }, [view, timeline, organizationId, customerId])

  const exportExcel = async () => {
    if (!plan) return
    try {
      await hireReportService.exportExcel(plan)
    } catch {
      toast.error('Export failed')
    }
  }
  const exportPdf = () => {
    if (!plan) return
    try {
      hireReportService.exportPdf(plan)
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {isBusiness && <Building2 className="w-4 h-4 text-[#b3f243] flex-shrink-0" />}
            <h2 className="text-base font-bold text-white truncate">{customerName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg flex-shrink-0"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 bg-[#f6f8f7] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-lg p-1">
              <button onClick={() => setView('rentals')} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${view === 'rentals' ? 'bg-[#025940] text-white' : 'text-[#72A68E]'}`}>{t('hire.tabRentals')}</button>
              <button onClick={() => setView('timeline')} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${view === 'timeline' ? 'bg-[#025940] text-white' : 'text-[#72A68E]'}`}>{t('hire.tabTimeline')}</button>
            </div>
            {view === 'rentals' && (
              <div className="flex gap-1.5">
                <button onClick={exportExcel} disabled={!plan || plan.rows.length === 0} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#025940] text-white hover:bg-[#012619] disabled:opacity-50">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> {t('hire.exportExcel')}
                </button>
                <button onClick={exportPdf} disabled={!plan || plan.rows.length === 0} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E] disabled:opacity-50">
                  <FileText className="w-3.5 h-3.5" /> {t('hire.exportPdf')}
                </button>
              </div>
            )}
          </div>

          {view === 'timeline' ? (
            timeline === null ? (
              <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : timeline.length === 0 ? (
              <p className="text-center text-sm text-[#72A68E] py-8">{t('hire.noTimeline')}</p>
            ) : (
              <ul className="space-y-2.5">
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#025940] mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-[#012619] dark:text-gray-200">{e.summary}</p>
                      <p className="text-[11px] text-[#72A68E]">{e.registration ? `${e.registration} · ` : ''}{euDate(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : loading ? (
            <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : !plan || plan.rows.length === 0 ? (
            <p className="text-center text-sm text-[#72A68E] py-8">{t('hire.noActiveRentals')}</p>
          ) : (
            <>
              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-[#72A68E] border-b border-[#e2e8e5] dark:border-gray-700">
                      <th className="px-3 py-2 font-semibold">{t('hire.colReg')}</th>
                      <th className="px-3 py-2 font-semibold">{t('hire.colOut')}</th>
                      <th className="px-3 py-2 font-semibold">{t('hire.colRate')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{t('hire.colDays')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{t('hire.colProrated')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
                    {plan.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono font-bold text-[#012619] dark:text-white">{r.registration}</td>
                        <td className="px-3 py-2 text-[#4a5e54] dark:text-gray-300">{r.outDate}</td>
                        <td className="px-3 py-2 text-[#4a5e54] dark:text-gray-300">{r.rate}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.daysOnHire}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#012619] dark:text-white">£{r.proratedToDate.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-sm">
                <div className="text-[#4a5e54] dark:text-gray-300">{t('hire.totalProrated')}: <span className="font-bold text-[#012619] dark:text-white">£{plan.totalProrated.toFixed(2)}</span></div>
                {plan.totalCredits > 0 && (
                  <>
                    <div className="text-[#72A68E]">{t('hire.approvedCredits')}: −£{plan.totalCredits.toFixed(2)}</div>
                    <div className="text-[#012619] dark:text-white font-bold">{t('hire.net')}: £{plan.net.toFixed(2)}</div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
