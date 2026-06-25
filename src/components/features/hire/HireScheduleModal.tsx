// src/components/features/hire/HireScheduleModal.tsx
// Per-contract billing schedule: the fixed grid of weekly / 4-weekly periods,
// each showing the vehicles on hire that period, their actual days + amount,
// swaps, and a period total. Exports to Excel.
'use client'

import React, { useEffect, useState } from 'react'
import { X, CalendarClock, FileSpreadsheet, Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireReportService } from '@/lib/services/hireReportService'
import { buildContractSchedule, type ContractSchedule } from '@/lib/services/hireScheduleService'
import { useT } from '@/lib/i18n'
import { euDate } from './hireFormat'
import { Pill, EmptyState } from './hireUi'
import type { HireAgreement } from '@/types/hire'

export function HireScheduleModal({
  organizationId,
  agreement,
  onClose,
}: {
  organizationId: string | null
  agreement: HireAgreement
  onClose: () => void
}) {
  const t = useT()
  const [schedule, setSchedule] = useState<ContractSchedule | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const lines = await hireAgreementService.getLines(organizationId, agreement.id)
      if (!cancelled) {
        setSchedule(buildContractSchedule(agreement, lines))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, agreement])

  const freq = agreement.rateType === 'weekly' ? t('hire.perWeek') : t('hire.perMonth')
  const freqLabel = agreement.rateType === 'weekly' ? t('hire.weekly') : t('hire.monthly')

  const exportExcel = () => {
    if (!schedule) return
    try {
      hireReportService.exportScheduleExcel(schedule, {
        reference: agreement.reference || 'contract',
        customerName: agreement.customerName || '',
      })
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
              <CalendarClock className="w-[18px] h-[18px]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate leading-tight">{t('hire.scheduleTitle')}</h2>
              <p className="text-[11px] text-[#72A68E] mt-0.5 truncate">
                {agreement.reference || agreement.customerName || '—'} · {freqLabel} · {euDate(agreement.startDate)} → {agreement.isRolling ? t('hire.rolling') : euDate(agreement.endDate)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg flex-shrink-0"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[#72A68E]">
              {schedule ? t('hire.scheduleSummary', { periods: schedule.periods.length, rate: `£${schedule.rateAmount}${freq}` }) : ''}
            </p>
            <button
              onClick={exportExcel}
              disabled={!schedule || schedule.periods.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] shadow-sm hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> {t('hire.exportExcel')}
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : !schedule || schedule.periods.length === 0 ? (
            <EmptyState icon={<CalendarClock className="w-7 h-7" />} title={t('hire.scheduleEmpty')} />
          ) : (
            <>
              <ul className="space-y-2">
                {schedule.periods.map((p) => (
                  <li key={p.index} className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#f6f8f7] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
                      <span className="text-xs font-bold text-[#012619] dark:text-white">
                        {t('hire.periodN', { n: p.index })} · {euDate(p.start)} → {euDate(p.end)}
                        <span className="text-[#72A68E] font-semibold"> · {t('hire.daysN', { n: p.days })}</span>
                      </span>
                      <span className="text-xs font-extrabold tabular-nums text-[#025940] dark:text-[#b3f243]">£{p.total.toFixed(2)}</span>
                    </div>
                    {p.vehicles.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-[#72A68E]">{t('hire.periodNoVehicles')}</p>
                    ) : (
                      <ul className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                        {p.vehicles.map((v) => (
                          <li key={v.lineId} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <span className="font-mono font-bold text-[#012619] dark:text-white">{v.registration}</span>
                            <span className="text-xs text-[#72A68E]">{t('hire.daysN', { n: v.days })}</span>
                            {v.isPartial && <Pill tone="amber">{t('hire.partPeriod')}</Pill>}
                            {v.swapNote && (
                              <Pill tone="sky"><Repeat className="w-2.5 h-2.5" /> {v.swapNote}</Pill>
                            )}
                            <span className="flex-1" />
                            <span className="tabular-nums font-semibold text-[#012619] dark:text-white">£{v.amount.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800 p-3.5 flex items-center justify-between">
                <span className="font-bold text-[#012619] dark:text-white">{t('hire.grandTotal')}</span>
                <span className="font-extrabold tabular-nums text-[#025940] dark:text-[#b3f243]">£{schedule.grandTotal.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
