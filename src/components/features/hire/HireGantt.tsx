// src/components/features/hire/HireGantt.tsx
// Hire scheduler — a resource-style Gantt: sticky vehicle columns (Reg / Group /
// Model / Current) on the left, a day grid (Day / Week / Month / 3 Months) on the
// right with weekend shading + today highlight, and status bars per hire line
// (label = customer), with an amber downtime overlay. Horizontal scroll for the
// wider views; left columns stay pinned.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search, CalendarRange } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { getDowntimeByReg, type DowntimeInfo } from '@/lib/services/hireDowntimeService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import { EmptyState } from './hireUi'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'

type View = 'day' | 'week' | 'month' | '3months'
const DAY = 86_400_000
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] // getDay() 0=Sun
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAY_W: Record<View, number> = { day: 280, week: 132, month: 40, '3months': 22 }
const LEFT_W = 372 // sum of the four left columns

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const mondayOf = (d: Date) => { const x = startOfDay(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x }
const normReg = (r?: string | null) => (r || '').toUpperCase().replace(/\s+/g, '')

// Bar colours — purple primary / green secondary to match the resource view.
const TONE: Record<string, string> = {
  active: '#8b6db3',
  scheduled: '#3fae5a',
  overdue: '#dc2626',
  returned: '#9aa5b1',
  swapped: '#6366f1',
}

interface VMeta { group: string; model: string; location: string }

export function HireGantt() {
  const t = useT()
  const { organizationId, refreshKey, refresh } = useHire()
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [customerId, setCustomerId] = useState<string>('all')
  const [q, setQ] = useState('')
  const [agreements, setAgreements] = useState<HireAgreement[]>([])
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [downtimeByReg, setDowntimeByReg] = useState<Record<string, DowntimeInfo>>({})
  const [meta, setMeta] = useState<Record<string, VMeta>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const ags = await hireAgreementService.getAgreements(organizationId)
      let allLines: HireAgreementVehicle[] = []
      try {
        const { data } = await supabase.from('rental_agreement_vehicles').select('*').eq('organization_id', organizationId)
        allLines = toCamelList<HireAgreementVehicle>(data)
      } catch { allLines = [] }
      // Vehicle meta (group=size, model, current location) keyed by reg.
      const m: Record<string, VMeta> = {}
      try {
        const { data } = await supabase
          .from('vehicles')
          .select('registration, model, size, current_location, contract')
          .eq('organization_id', organizationId)
        for (const v of data ?? []) {
          m[normReg(v.registration)] = {
            group: v.size || '',
            model: v.model || '',
            location: v.current_location || v.contract || '',
          }
        }
      } catch { /* no meta */ }
      const dt = await getDowntimeByReg(organizationId)
      if (!cancelled) {
        setAgreements(ags); setLines(allLines); setDowntimeByReg(dt); setMeta(m); setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [organizationId, refreshKey])

  const agById = useMemo(() => new Map(agreements.map((a) => [a.id, a])), [agreements])
  const customers = useMemo(() => {
    const mp = new Map<string, string>()
    for (const a of agreements) if (a.customerId) mp.set(a.customerId, a.customerName || '—')
    return Array.from(mp.entries())
  }, [agreements])

  // Visible window [start, end) + day list.
  const today0 = useMemo(() => startOfDay(new Date()).getTime(), [])
  const { winStart, days, label } = useMemo(() => {
    let s: Date
    let n: number
    if (view === 'day') { s = startOfDay(anchor); n = 1 }
    else if (view === 'week') { s = mondayOf(anchor); n = 7 }
    else if (view === 'month') { s = new Date(anchor.getFullYear(), anchor.getMonth(), 1); n = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() }
    else { s = new Date(anchor.getFullYear(), anchor.getMonth(), 1); n = Math.round((new Date(anchor.getFullYear(), anchor.getMonth() + 3, 1).getTime() - s.getTime()) / DAY) }
    s = startOfDay(s)
    const list: Date[] = []
    for (let i = 0; i < n; i++) list.push(new Date(s.getTime() + i * DAY))
    const last = list[list.length - 1]
    let lab = ''
    if (view === 'day') lab = `${DOW[s.getDay()] === 'S' ? '' : ''}${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
    else if (view === 'week') lab = `${s.getDate()} ${MONTHS[s.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`
    else if (view === 'month') lab = `${MONTHS[s.getMonth()]} ${s.getFullYear()}`
    else lab = `${MONTHS[s.getMonth()]} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`
    return { winStart: s.getTime(), days: list, label: lab }
  }, [view, anchor])

  const dayW = DAY_W[view]
  const gridW = days.length * dayW
  const winEnd = winStart + days.length * DAY

  const step = (dir: 1 | -1) => {
    const d = new Date(anchor)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else if (view === 'month') d.setMonth(d.getMonth() + dir)
    else d.setMonth(d.getMonth() + dir * 3)
    setAnchor(startOfDay(d))
  }

  const rows = useMemo(() => {
    const term = q.trim().toUpperCase().replace(/\s+/g, '')
    return lines
      .filter((l) => l.status !== 'cancelled')
      .map((l) => ({ line: l, ag: l.agreementId ? agById.get(l.agreementId) : undefined, vm: meta[normReg(l.registration)] }))
      .filter((r) => (customerId === 'all' ? true : r.ag?.customerId === customerId))
      .filter((r) => {
        if (!term) return true
        const hay = `${r.line.registration || ''}${r.line.make || ''}${r.vm?.model || r.line.model || ''}${r.ag?.customerName || ''}`.toUpperCase().replace(/\s+/g, '')
        return hay.includes(term)
      })
  }, [lines, agById, meta, customerId, q])

  const bar = (l: HireAgreementVehicle, ag?: HireAgreement) => {
    const startStr = l.actualOutAt || l.scheduledStart || ag?.startDate
    const endStr = l.actualReturnAt || l.scheduledEnd || ag?.endDate
    if (!startStr) return null
    const start = new Date(startStr.length <= 10 ? startStr + 'T00:00:00' : startStr).getTime()
    const end = endStr ? new Date(endStr.length <= 10 ? endStr + 'T00:00:00' : endStr).getTime() : start + 2 * DAY
    if (end <= winStart || start >= winEnd) return null
    const cs = Math.max(start, winStart)
    const ce = Math.min(Math.max(end, cs + DAY), winEnd)
    const overdue = l.status === 'active' && endStr && new Date(endStr + 'T00:00:00').getTime() < today0
    const tone = TONE[overdue ? 'overdue' : l.status] || TONE.active
    return {
      left: ((cs - winStart) / DAY) * dayW,
      width: Math.max(dayW * 0.6, ((ce - cs) / DAY) * dayW),
      tone,
      overflowL: start < winStart,
      overflowR: end > winEnd,
    }
  }

  const downtimeBar = (l: HireAgreementVehicle) => {
    if (l.status !== 'active') return null
    const info = downtimeByReg[normReg(l.registration)]
    if (!info?.since) return null
    const start = new Date(info.since + 'T00:00:00').getTime()
    const endMs = start > today0 ? start + DAY : today0 + DAY
    if (endMs <= winStart || start >= winEnd) return null
    const cs = Math.max(start, winStart)
    const ce = Math.min(endMs, winEnd)
    return { left: ((cs - winStart) / DAY) * dayW, width: Math.max(dayW * 0.5, ((ce - cs) / DAY) * dayW), label: info.label }
  }

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
  const isToday = (d: Date) => d.getTime() === today0
  const ROW_H = 40

  const views: View[] = ['day', 'week', 'month', '3months']
  const viewLabel: Record<View, string> = {
    day: t('hire.ganttDay'), week: t('hire.ganttWeekView'), month: t('hire.ganttMonth'), '3months': t('hire.gantt3m'),
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="px-3 py-2 text-xs border border-[#e2e8e5] dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white">
          <option value="all">{t('hire.ganttAllCustomers')}</option>
          {customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#72A68E]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hire.ganttSearch')} className="w-full pl-9 pr-3 py-2 text-xs border border-[#e2e8e5] dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white" />
        </div>
        <div className="flex-1" />
        <button onClick={refresh} title={t('hire.refresh')} className="p-2 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940] hover:border-[#72A68E] transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Date nav + view toggles */}
      <div className="flex items-center gap-2">
        <button onClick={() => setAnchor(startOfDay(new Date()))} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#012619] text-white hover:bg-[#025940]">{t('hire.ganttToday')}</button>
        <button onClick={() => step(-1)} className="p-1.5 rounded-lg text-[#025940] hover:bg-[#f0f4f2] dark:hover:bg-gray-700"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => step(1)} className="p-1.5 rounded-lg text-[#025940] hover:bg-[#f0f4f2] dark:hover:bg-gray-700"><ChevronRight className="w-4 h-4" /></button>
        <span className="flex-1 text-center text-sm font-bold text-[#012619] dark:text-white">{label}</span>
        <div className="flex gap-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-1">
          {views.map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${view === v ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}>{viewLabel[v]}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarRange className="w-7 h-7" />} title={t('hire.ganttEmpty')} hint={t('hire.ganttEmptyHint')} />
      ) : (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-x-auto bg-white dark:bg-gray-800">
          <div style={{ width: LEFT_W + gridW }}>
            {/* Header */}
            <div className="flex sticky top-0 z-20">
              <div className="sticky left-0 z-30 flex bg-[#f6f8f7] dark:bg-gray-800 border-b border-r border-[#e2e8e5] dark:border-gray-700" style={{ width: LEFT_W }}>
                {[t('hire.colReg'), t('hire.ovColGroup'), t('hire.colModel'), t('hire.ganttCurrent')].map((h, i) => (
                  <div key={i} className="px-2 py-2 text-[10px] uppercase tracking-wide font-bold text-[#72A68E]" style={{ width: [90, 70, 100, 112][i] }}>{h}</div>
                ))}
              </div>
              <div className="flex bg-[#f6f8f7] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700" style={{ width: gridW }}>
                {days.map((d, i) => (
                  <div key={i} className={`flex flex-col items-center justify-center py-1.5 border-r border-[#eef2f0] dark:border-gray-700/60 ${isWeekend(d) ? 'bg-[#eef1f4] dark:bg-gray-700/40' : ''} ${isToday(d) ? 'ring-1 ring-inset ring-red-400' : ''}`} style={{ width: dayW }}>
                    <span className="text-[10px] text-[#72A68E] leading-none">{DOW[d.getDay()]}</span>
                    <span className={`text-[11px] font-bold leading-tight ${isToday(d) ? 'text-red-500' : 'text-[#012619] dark:text-white'}`}>{d.getDate()}</span>
                    {(view === 'month' || view === '3months') && d.getDate() === 1 && <span className="text-[8px] text-[#72A68E]">{MONTHS[d.getMonth()]}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            {rows.map(({ line, ag, vm }) => {
              const b = bar(line, ag)
              const dt = downtimeBar(line)
              return (
                <div key={line.id} className="flex border-b border-[#eef2f0] dark:border-gray-700/60">
                  <div className="sticky left-0 z-10 flex items-center bg-white dark:bg-gray-800 border-r border-[#e2e8e5] dark:border-gray-700" style={{ width: LEFT_W, height: ROW_H }}>
                    <span className="px-2 font-mono font-bold text-[11px] text-[#012619] dark:text-white truncate" style={{ width: 90 }}>{line.registration || '—'}</span>
                    <span className="px-2 text-[11px] text-[#4a5e54] dark:text-gray-300 truncate" style={{ width: 70 }}>{vm?.group || '—'}</span>
                    <span className="px-2 text-[11px] text-[#4a5e54] dark:text-gray-300 truncate" style={{ width: 100 }}>{vm?.model || line.model || '—'}</span>
                    <span className="px-2 text-[11px] text-[#72A68E] truncate" style={{ width: 112 }}>{vm?.location || '—'}</span>
                  </div>
                  <div className="relative" style={{ width: gridW, height: ROW_H }}>
                    {/* grid background */}
                    <div className="absolute inset-0 flex">
                      {days.map((d, i) => (
                        <div key={i} className={`border-r border-[#f3f6f4] dark:border-gray-700/40 ${isWeekend(d) ? 'bg-[#f6f8f9] dark:bg-gray-700/20' : ''} ${isToday(d) ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`} style={{ width: dayW }} />
                      ))}
                    </div>
                    {/* hire bar */}
                    {b && (
                      <div className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 overflow-hidden shadow-sm" style={{ left: b.left, width: b.width, background: b.tone }} title={`${line.registration} · ${ag?.customerName || ''}`}>
                        {b.overflowL && <ChevronLeft className="w-3 h-3 text-white/80 -ml-1 flex-shrink-0" />}
                        <span className="text-[10px] font-bold text-white truncate flex-1">{ag?.customerName || line.registration}</span>
                        {b.overflowR && <ChevronRight className="w-3 h-3 text-white/80 -mr-1 flex-shrink-0" />}
                      </div>
                    )}
                    {/* downtime overlay */}
                    {dt && (
                      <div className="absolute bottom-0.5 h-1.5 rounded-sm" style={{ left: dt.left, width: dt.width, backgroundImage: 'repeating-linear-gradient(45deg, rgba(245,158,11,0.9) 0, rgba(245,158,11,0.9) 4px, transparent 4px, transparent 8px)' }} title={dt.label} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#72A68E]">
        <Lg c={TONE.active} l={t('hire.legendActive')} />
        <Lg c={TONE.scheduled} l={t('hire.legendScheduled')} />
        <Lg c={TONE.overdue} l={t('hire.legendOverdue')} />
        <Lg c={TONE.returned} l={t('hire.legendReturned')} />
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(245,158,11,0.9) 0, rgba(245,158,11,0.9) 3px, transparent 3px, transparent 6px)' }} />{t('hire.legendDowntime')}</span>
      </div>
    </div>
  )
}

function Lg({ c, l }: { c: string; l: string }) {
  return <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: c }} />{l}</span>
}
