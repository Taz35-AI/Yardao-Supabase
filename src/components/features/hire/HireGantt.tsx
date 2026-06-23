// src/components/features/hire/HireGantt.tsx
// Per-customer schedule. Vehicle lines drawn across time; colour by status.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'

const DAY = 86_400_000

export function HireGantt() {
  const t = useT()
  const { organizationId, refreshKey } = useHire()
  const [span, setSpan] = useState<7 | 14 | 30>(14)
  const [customerId, setCustomerId] = useState<string>('all')
  const [agreements, setAgreements] = useState<HireAgreement[]>([])
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const ags = await hireAgreementService.getAgreements(organizationId)
      let allLines: HireAgreementVehicle[] = []
      try {
        const { data } = await supabase
          .from('rental_agreement_vehicles')
          .select('*')
          .eq('organization_id', organizationId)
        allLines = toCamelList<HireAgreementVehicle>(data)
      } catch {
        allLines = []
      }
      if (!cancelled) {
        setAgreements(ags)
        setLines(allLines)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, refreshKey])

  const agById = useMemo(() => {
    const m = new Map<string, HireAgreement>()
    for (const a of agreements) m.set(a.id, a)
    return m
  }, [agreements])

  const customers = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of agreements) if (a.customerId) m.set(a.customerId, a.customerName || '—')
    return Array.from(m.entries())
  }, [agreements])

  const today0 = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])
  const spanStart = today0
  const spanEnd = today0 + span * DAY

  const rows = useMemo(() => {
    return lines
      .filter((l) => l.status !== 'cancelled')
      .map((l) => ({ line: l, ag: l.agreementId ? agById.get(l.agreementId) : undefined }))
      .filter((r) => (customerId === 'all' ? true : r.ag?.customerId === customerId))
  }, [lines, agById, customerId])

  const dayLabels = useMemo(() => {
    const out: string[] = []
    const step = span === 30 ? 5 : span === 14 ? 2 : 1
    for (let i = 0; i <= span; i += step) {
      const d = new Date(spanStart + i * DAY)
      out.push(`${d.getDate()}/${d.getMonth() + 1}`)
    }
    return out
  }, [span, spanStart])

  const bar = (l: HireAgreementVehicle, ag?: HireAgreement) => {
    const startStr = l.actualOutAt || l.scheduledStart || ag?.startDate
    const endStr = l.actualReturnAt || l.scheduledEnd || ag?.endDate
    if (!startStr) return null
    const start = new Date((startStr.length <= 10 ? startStr + 'T00:00:00' : startStr)).getTime()
    const end = endStr ? new Date(endStr.length <= 10 ? endStr + 'T00:00:00' : endStr).getTime() : start + 2 * DAY
    const cs = Math.max(start, spanStart)
    const ce = Math.min(Math.max(end, cs + DAY), spanEnd)
    if (ce <= spanStart || cs >= spanEnd) return null
    const total = spanEnd - spanStart
    const left = ((cs - spanStart) / total) * 100
    const width = Math.max(2, ((ce - cs) / total) * 100)
    const overdue = l.status === 'active' && endStr && new Date(endStr + 'T00:00:00').getTime() < today0
    const tone =
      overdue ? 'bg-red-500'
        : l.status === 'active' ? 'bg-[#025940]'
          : l.status === 'returned' ? 'bg-gray-400'
            : l.status === 'swapped' ? 'bg-purple-500'
              : 'bg-sky-500'
    return { left, width, tone }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-lg p-1">
          {([7, 14, 30] as const).map((s) => (
            <button key={s} onClick={() => setSpan(s)} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${span === s ? 'bg-[#025940] text-white' : 'text-[#72A68E]'}`}>
              {s === 7 ? t('hire.ganttWeek') : s === 14 ? t('hire.ganttFortnight') : t('hire.ganttMonth')}
            </button>
          ))}
        </div>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="px-2.5 py-1.5 text-xs border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-[#012619] dark:text-white">
          <option value="all">{t('hire.ganttAllCustomers')}</option>
          {customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 text-[11px] text-[#72A68E]">
          <Lg cls="bg-sky-500" l={t('hire.legendScheduled')} />
          <Lg cls="bg-[#025940]" l={t('hire.legendActive')} />
          <Lg cls="bg-red-500" l={t('hire.legendOverdue')} />
          <Lg cls="bg-gray-400" l={t('hire.legendReturned')} />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-center py-12 px-6">
          <CalendarRange className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#012619] dark:text-white">{t('hire.ganttEmpty')}</p>
          <p className="text-[12.5px] text-[#72A68E] mt-1">{t('hire.ganttEmptyHint')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="flex border-b border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800/60">
            <div className="w-32 sm:w-44 flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide font-semibold text-[#72A68E]">{t('hire.vehicles')}</div>
            <div className="relative flex-1 px-2 py-2">
              <div className="flex justify-between text-[10px] text-[#72A68E]">
                {dayLabels.map((d, i) => <span key={i}>{d}</span>)}
              </div>
            </div>
          </div>
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {rows.map(({ line, ag }) => {
              const b = bar(line, ag)
              return (
                <li key={line.id} className="flex items-center">
                  <div className="w-32 sm:w-44 flex-shrink-0 px-3 py-2 min-w-0">
                    <p className="font-mono font-bold text-xs text-[#012619] dark:text-white truncate">{line.registration || '—'}</p>
                    <p className="text-[10px] text-[#72A68E] truncate">{ag?.customerName || ''}</p>
                  </div>
                  <div className="relative flex-1 h-9 mx-2">
                    <div className="absolute top-0 bottom-0 w-px bg-[#b3f243]" style={{ left: '0%' }} />
                    {b && (
                      <div className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md ${b.tone} flex items-center px-1.5 overflow-hidden`} style={{ left: `${b.left}%`, width: `${b.width}%` }} title={`${line.registration} · ${ag?.customerName || ''}`}>
                        <span className="text-[9px] font-bold text-white truncate">{line.registration}</span>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function Lg({ cls, l }: { cls: string; l: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{l}</span>
}
