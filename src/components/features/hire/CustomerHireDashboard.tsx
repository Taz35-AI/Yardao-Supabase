// src/components/features/hire/CustomerHireDashboard.tsx
// Per-customer B2B dashboard: active rentals with calendar-accurate prorated
// amounts to date, plus one-click Excel / PDF Rent Plan export.
'use client'

import React, { useEffect, useState } from 'react'
import { X, FileSpreadsheet, FileText, Building2, User, Loader2, Wallet, KeyRound, CalendarRange, History } from 'lucide-react'
import { toast } from 'sonner'
import { hireReportService, type RentPlan } from '@/lib/services/hireReportService'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { activityLogService, type ActivityRecord } from '@/lib/services/activityLogService'
import { useT } from '@/lib/i18n'
import { euDate } from './hireFormat'
import { StatCard, EmptyState } from './hireUi'

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
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#b3f243]/15 border border-[#b3f243]/30 flex items-center justify-center flex-shrink-0 text-[#b3f243]">
              {isBusiness ? <Building2 className="w-[18px] h-[18px]" /> : <User className="w-[18px] h-[18px]" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate leading-tight">{customerName}</h2>
              <p className="text-[11px] text-[#72A68E] mt-0.5">{isBusiness ? t('hire.b2bAccount') : t('hire.individualAccount')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg flex-shrink-0"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 bg-[#f6f8f7] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-1">
              <button onClick={() => setView('rentals')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'rentals' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}><KeyRound className="w-3.5 h-3.5" />{t('hire.tabRentals')}</button>
              <button onClick={() => setView('timeline')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'timeline' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}><History className="w-3.5 h-3.5" />{t('hire.tabTimeline')}</button>
            </div>
            {view === 'rentals' && (
              <div className="flex gap-1.5">
                <button onClick={exportExcel} disabled={!plan || plan.rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] shadow-sm hover:shadow-md hover:shadow-[#025940]/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none disabled:active:scale-100">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> {t('hire.exportExcel')}
                </button>
                <button onClick={exportPdf} disabled={!plan || plan.rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-[#72A68E] hover:text-[#025940] transition-colors disabled:opacity-50">
                  <FileText className="w-3.5 h-3.5" /> {t('hire.exportPdf')}
                </button>
              </div>
            )}
          </div>

          {view === 'timeline' ? (
            timeline === null ? (
              <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : timeline.length === 0 ? (
              <EmptyState icon={<History className="w-7 h-7" />} title={t('hire.noTimeline')} />
            ) : (
              <ul className="relative space-y-3 pl-1">
                <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-[#e2e8e5] dark:bg-gray-700" aria-hidden />
                {timeline.map((e) => (
                  <li key={e.id} className="relative flex gap-3">
                    <span className="relative z-10 w-2.5 h-2.5 rounded-full bg-[#025940] ring-4 ring-white dark:ring-gray-900 mt-1 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-[#012619] dark:text-gray-200 leading-snug">{e.summary}</p>
                      <p className="text-[11px] text-[#72A68E] mt-0.5">{e.registration ? `${e.registration} · ` : ''}{euDate(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : loading ? (
            <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : !plan || plan.rows.length === 0 ? (
            <EmptyState icon={<CalendarRange className="w-7 h-7" />} title={t('hire.noActiveRentals')} />
          ) : (
            <>
              {/* Summary KPI strip */}
              <div className={`grid gap-2.5 ${plan.weeklyTotal > 0 && plan.monthlyTotal > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <StatCard tone="forest" icon={<KeyRound className="w-4 h-4" />} label={t('hire.kpiOnHire')} value={plan.rows.length} />
                {plan.weeklyTotal > 0 && (
                  <StatCard tone="slate" icon={<Wallet className="w-4 h-4" />} label={t('hire.weeklyTotal')} value={`£${plan.weeklyTotal.toFixed(2)}`} />
                )}
                {plan.monthlyTotal > 0 && (
                  <StatCard tone="lime" icon={<Wallet className="w-4 h-4" />} label={t('hire.monthlyTotal')} value={`£${plan.monthlyTotal.toFixed(2)}`} />
                )}
              </div>

              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#72A68E] bg-[#f6f8f7] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
                      <th className="px-3 py-2.5 font-bold">{t('hire.colReg')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colOut')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colEnd')}</th>
                      <th className="px-3 py-2.5 font-bold text-right">{t('hire.colRate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                    {plan.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#f6f8f7] dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-3 py-2.5 font-mono font-bold text-[#012619] dark:text-white">{r.registration}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.outDate}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.contractEnd || '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#012619] dark:text-white">{r.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rate totals + any approved credits to apply */}
              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800 p-3.5 space-y-1.5 text-sm">
                {plan.weeklyTotal > 0 && (
                  <div className="flex items-center justify-between text-[#4a5e54] dark:text-gray-300">
                    <span>{t('hire.weeklyTotal')}</span>
                    <span className="font-bold tabular-nums text-[#012619] dark:text-white">£{plan.weeklyTotal.toFixed(2)}/wk</span>
                  </div>
                )}
                {plan.monthlyTotal > 0 && (
                  <div className="flex items-center justify-between text-[#4a5e54] dark:text-gray-300">
                    <span>{t('hire.monthlyTotal')}</span>
                    <span className="font-bold tabular-nums text-[#012619] dark:text-white">£{plan.monthlyTotal.toFixed(2)}/mo</span>
                  </div>
                )}
                {plan.totalCredits > 0 && (
                  <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-[#e2e8e5] dark:border-gray-700 text-[#72A68E]">
                    <span>{t('hire.approvedCredits')}</span>
                    <span className="font-semibold tabular-nums">−£{plan.totalCredits.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
