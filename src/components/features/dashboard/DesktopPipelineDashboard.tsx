// src/components/features/dashboard/DesktopPipelineDashboard.tsx
// DESKTOP-ONLY search-first yard dashboard. Replaces the crowded "list every
// vehicle" pipeline with: a smart search, a 5-status cockpit (clean counts,
// expandable to contract breakdowns), attention queues (Pending/Repairs/
// Non-Starter) showing only what needs action, Ready/On-hire as summaries, and
// a right rail (Today / Alerts / Recent activity). Mobile is untouched — this
// only renders inside the desktop (lg+) branch of DashboardVehicleList.
//
// Pure presentation: it receives the same vehicle props as YardTabsView plus the
// existing filter/view handlers so "Open full list" drops into the current yard
// list filtered by that status, and clicking any vehicle opens the normal detail
// modal (and therefore the normal checkout flow).
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, CheckCircle, Clock, Wrench, XCircle, Truck, ChevronDown, ChevronRight,
  ArrowRight, Activity, Plus, CalendarPlus, Download, X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CheckedInVehicle } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { activityLogService, type ActivityRecord } from '@/lib/services/activityLogService'
import { buildVocab, parseQuery, matchesQuery, vehicleBucket, type StatusBucket } from '@/lib/search/smartYardSearch'
// The old desktop cards view — reused as the "drill-in" destination when a
// status's "Open full list" is clicked.
import { YardTabsView } from '@/components/features/dashboard/YardTabsView'
import { ArrowLeft } from 'lucide-react'

interface Props {
  vehicles: CheckedInVehicle[]
  outOnHireVehicles?: CheckedInVehicle[]
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  /** Drive the existing yard list when "Open full list" is clicked. */
  onFilterChange?: (key: any, value: any) => void
  onViewModeChange?: (mode: any) => void
  /** Optional quick-action handlers (wired from DashboardContent). */
  onCheckIn?: () => void
  onExport?: () => void
  /** Size facet — owned by DashboardContent so the old Total summary card's
      "Filter by Size" modal can drive it. */
  sizeFilter?: string | null
  onSizeFilterChange?: (size: string | null) => void
  className?: string
}

const LONG_STAY_DAYS = 30
// How many days out counts as an "approaching" MOT / road-tax alert. Lower =
// fewer, more imminent alerts. Tune this one number to taste.
const ALERT_SOON_DAYS = 7

const BUCKETS: { key: StatusBucket; label: string; color: string; icon: typeof CheckCircle }[] = [
  { key: 'Ready', label: 'Ready', color: '#16a34a', icon: CheckCircle },
  { key: 'Pending checks', label: 'Pending', color: '#d97706', icon: Clock },
  { key: 'Repairs needed', label: 'Repairs', color: '#dc2626', icon: Wrench },
  { key: 'Non-Starter', label: 'Non-starter', color: '#475569', icon: XCircle },
  { key: 'on_hire', label: 'On hire', color: '#0a6b4d', icon: Truck },
]
// "Open full list" maps a bucket to the existing yard status filter value.
const FILTER_VALUE: Record<StatusBucket, string> = {
  'Ready': 'Ready', 'Pending checks': 'Pending checks', 'Repairs needed': 'Repairs needed',
  'Non-Starter': 'Non-Starter', 'on_hire': '__on_hire__',
}

const toDate = (v: any): Date | null => {
  if (!v) return null
  try { const d = typeof v === 'object' && v?.toDate ? v.toDate() : new Date(v); return isNaN(d.getTime()) ? null : d } catch { return null }
}
const daysSince = (v: any): number => {
  const d = toDate(v); if (!d) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}
const daysUntil = (v: any): number | null => {
  const d = toDate(v); if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}
const relTime = (iso: string): string => {
  const d = toDate(iso); if (!d) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Per-day localStorage key so dismissed alerts reappear after midnight.
function alertsDismissKey(): string {
  const d = new Date()
  return `yardao_yard_alerts_dismissed_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// Small UK reg plate.
function Reg({ reg }: { reg: string }) {
  return (
    <span className="inline-flex items-center rounded-[4px] px-1.5 py-[3px] select-none flex-shrink-0"
      style={{ background: 'linear-gradient(180deg,#fff,#e9efe9)', border: '1px solid #07251d', fontFamily: "'DM Mono',monospace" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#07251d', letterSpacing: '0.06em', lineHeight: 1 }}>{reg}</span>
    </span>
  )
}

// Status pill metadata per bucket (used when results span multiple statuses).
const STATUS_META: Record<StatusBucket, { label: string; color: string; bg: string }> = {
  'Ready':          { label: 'Ready',       color: '#0d6b2e', bg: '#e6f4ec' },
  'Pending checks': { label: 'Pending',     color: '#a25a00', bg: '#fff4e4' },
  'Repairs needed': { label: 'Repairs',     color: '#bf1d19', bg: '#fff0ee' },
  'Non-Starter':    { label: 'Non-starter', color: '#47566a', bg: '#eef1f4' },
  'on_hire':        { label: 'On hire',     color: '#0a6b4d', bg: '#e3f3ec' },
}

// Crystal-clear location + status so a reg lookup is never ambiguous:
//   On hire · At garage · In transit · In yard · {Ready/Pending/Repairs/…}
function locationState(v: CheckedInVehicle): { label: string; color: string; bg: string } {
  if (v.hireStatus === 'Out on Hire') return { label: 'On hire', color: '#0a6b4d', bg: '#e3f3ec' }
  if (v.transferStatus === 'at_external_garage') return { label: 'At garage', color: '#a25a00', bg: '#fff4e4' }
  if (v.transferStatus === 'in_transit') return { label: 'In transit', color: '#2563eb', bg: '#eaf1fe' }
  const meta = STATUS_META[vehicleBucket(v)]
  return { label: `In yard · ${meta.label}`, color: meta.color, bg: meta.bg }
}

// One compact vehicle row used in queues and search results.
// `showStatus` adds the status pill — essential in search results (which span
// every status), redundant inside a single-status queue column.
function VRow({ v, onClick, showStatus }: { v: CheckedInVehicle; onClick: () => void; showStatus?: boolean }) {
  const days = (v as any).hireStatus === 'Out on Hire' ? daysSince((v as any).hiredAt) : daysSince(v.createdAt)
  const mot = daysUntil(v.motExpiry)
  const tax = daysUntil(v.taxExpiry)
  const notInsured = v.insuranceStatus === 'Not Insured'
  const flag =
    mot !== null && mot < 0 ? { t: 'MOT expired', c: '#bf1d19', bg: '#fff0ee' } :
    tax !== null && tax < 0 ? { t: 'Tax expired', c: '#bf1d19', bg: '#fff0ee' } :
    notInsured ? { t: 'Not insured', c: '#a25a00', bg: '#fff4e4' } :
    mot !== null && mot <= 30 ? { t: `MOT ${mot}d`, c: '#a25a00', bg: '#fff4e4' } :
    days >= LONG_STAY_DAYS ? { t: `${days}d`, c: '#47566a', bg: '#eef1f4' } : null
  const st = locationState(v)
  return (
    <button type="button" onClick={onClick}
      className="w-full grid grid-cols-[auto_1fr_auto] gap-2 items-center py-2 border-b border-[#eef2ee] last:border-b-0 text-left hover:bg-[#f6faf6] rounded-lg px-1 transition-colors">
      <Reg reg={v.registration} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#07251d] truncate">{v.make} {v.model}</div>
        <div className="text-[11px] text-[#6f8177] truncate">
          {[v.colour, v.size, v.contract || 'No contract'].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {showStatus && (
          <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 inline-flex items-center gap-1 whitespace-nowrap" style={{ color: st.color, background: st.bg }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />{st.label}
          </span>
        )}
        {flag && (
          <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ color: flag.c, background: flag.bg }}>{flag.t}</span>
        )}
      </div>
    </button>
  )
}

export function DesktopPipelineDashboard({
  vehicles, outOnHireVehicles = [], onViewVehicle, onFilterChange, onViewModeChange,
  onCheckIn, onExport, sizeFilter = null, onSizeFilterChange, className = '',
}: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState('')
  // Quick filters launched from the Alerts summary lines (no smart-search token).
  const [quickFilter, setQuickFilter] = useState<null | 'no_mot' | 'no_tax' | 'not_insured'>(null)
  const [expanded, setExpanded] = useState<StatusBucket | null>(null)
  const [activity, setActivity] = useState<ActivityRecord[]>([])
  // When set, we drill into the old cards view (YardTabsView) on this status,
  // optionally narrowed to a single contract (clicking a breakdown row).
  const [drillStatus, setDrillStatus] = useState<StatusBucket | null>(null)
  const [drillContract, setDrillContract] = useState<string | null>(null)
  // Free smart-filter applied WITHIN the drilled-in cards view.
  const [drillSearch, setDrillSearch] = useState('')
  // Alerts dismissed for today (persisted; reappear after midnight).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // Faceted SIZE filter — when set it cascades through the whole dashboard
  // (cockpit counts, queues, breakdowns, search, drill-in).
  // Working set = everything (in yard + on hire) so search spans all statuses.
  const all = useMemo(() => [...vehicles, ...outOnHireVehicles], [vehicles, outOnHireVehicles])
  // Everything below the size facet derives from this scoped set.
  const scoped = useMemo(() => sizeFilter ? all.filter(v => (v.size || '').trim().toLowerCase() === sizeFilter.toLowerCase()) : all, [all, sizeFilter])
  const vocab = useMemo(() => buildVocab(all), [all])
  const parsed = useMemo(() => parseQuery(query, vocab), [query, vocab])
  const results = useMemo(() => parsed.isEmpty ? [] : scoped.filter(v => matchesQuery(v, parsed)), [scoped, parsed])
  // Vehicle list + label for a quick filter (clicked from an Alerts summary).
  const quick = useMemo(() => {
    if (quickFilter === 'no_mot') return { label: 'No MOT on file', list: scoped.filter(v => !v.motExpiry) }
    if (quickFilter === 'no_tax') return { label: 'No road tax on file', list: scoped.filter(v => !v.taxExpiry) }
    if (quickFilter === 'not_insured') return { label: 'Ready · not insured', list: scoped.filter(v => v.insuranceStatus === 'Not Insured' && vehicleBucket(v) === 'Ready') }
    return null
  }, [quickFilter, scoped])

  // Bucket the working set by effective status.
  const byBucket = useMemo(() => {
    const m: Record<StatusBucket, CheckedInVehicle[]> = {
      'Ready': [], 'Pending checks': [], 'Repairs needed': [], 'Non-Starter': [], 'on_hire': [],
    }
    for (const v of scoped) m[vehicleBucket(v)].push(v)
    // Most-recently moved to the status first (newest at the top of each queue).
    const movedTs = (v: CheckedInVehicle) => {
      const d = vehicleBucket(v) === 'on_hire'
        ? (toDate((v as any).hiredAt) || toDate(v.updatedAt) || toDate(v.createdAt))
        : (toDate(v.updatedAt) || toDate(v.createdAt))
      return d ? d.getTime() : 0
    }
    for (const k of Object.keys(m) as StatusBucket[]) m[k].sort((a, b) => movedTs(b) - movedTs(a))
    return m
  }, [scoped])

  const count = (b: StatusBucket) => byBucket[b].length

  // Recent activity (best-effort).
  useEffect(() => {
    let cancelled = false
    if (!user?.uid) return
    userProfileService.getProfile(user.uid)
      .then(p => p?.organizationId ? activityLogService.getRecent(p.organizationId, 7) : [])
      .then(rows => { if (!cancelled) setActivity(rows) })
      .catch(() => { /* best-effort */ })
    return () => { cancelled = true }
  }, [user?.uid])

  // Load today's dismissed alerts.
  useEffect(() => {
    try { const raw = localStorage.getItem(alertsDismissKey()); if (raw) setDismissed(new Set(JSON.parse(raw))) } catch { /* ignore */ }
  }, [])

  // Alerts — prioritised: MOT issues first (missing / expired / due-soon), then
  // tax + insurance blockers, then long-running repairs. Severity drives order
  // AND the (blended) dot colour. Dismissible for the day.
  const allAlerts = useMemo(() => {
    const out: { id: string; reg: string; reason: string; sub: string; sev: 0 | 1; v: CheckedInVehicle }[] = []
    for (const v of all) {
      const mot = daysUntil(v.motExpiry)
      const tax = daysUntil(v.taxExpiry)
      // Tier 0 — MOT: only EXPIRED or expiring within the window (time-critical).
      if (v.motExpiry && mot !== null) {
        if (mot < 0) out.push({ id: v.id + ':motx', reg: v.registration, reason: 'MOT expired', sub: `${Math.abs(mot)}d ago`, sev: 0, v })
        else if (mot <= ALERT_SOON_DAYS) out.push({ id: v.id + ':motd', reg: v.registration, reason: `MOT due in ${mot}d`, sub: 'Expiring soon', sev: 0, v })
      }
      // Tier 1 — road tax: expired or expiring within the window.
      if (tax !== null) {
        if (tax < 0) out.push({ id: v.id + ':taxx', reg: v.registration, reason: 'Road tax expired', sub: 'Blocks checkout', sev: 1, v })
        else if (tax <= ALERT_SOON_DAYS) out.push({ id: v.id + ':taxd', reg: v.registration, reason: `Road tax due in ${tax}d`, sub: 'Expiring soon', sev: 1, v })
      }
    }
    out.sort((a, b) => a.sev - b.sev)
    return out
  }, [all])
  const alerts = useMemo(() => allAlerts.filter(a => !dismissed.has(a.id)), [allAlerts, dismissed])
  // Bulk data-hygiene issues shown as compact counts, not one row per vehicle.
  const alertSummary = useMemo(() => {
    let noMot = 0, noTax = 0, notInsured = 0
    for (const v of all) {
      if (!v.motExpiry) noMot++
      if (!v.taxExpiry) noTax++
      if (v.insuranceStatus === 'Not Insured' && vehicleBucket(v) === 'Ready') notInsured++
    }
    return { noMot, noTax, notInsured }
  }, [all])
  const clearAlertsForToday = () => {
    const next = new Set(dismissed)
    for (const a of alerts) next.add(a.id)
    setDismissed(next)
    try { localStorage.setItem(alertsDismissKey(), JSON.stringify([...next])) } catch { /* ignore */ }
  }

  // Contract breakdown for an expanded status card.
  const breakdown = (b: StatusBucket) => {
    const map = new Map<string, number>()
    for (const v of byBucket[b]) {
      const key = v.contract?.trim() || 'No contract'
      map.set(key, (map.get(key) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  // "Open full list" → drill into the old cards view (YardTabsView) on that tab,
  // not the plain table. Optionally narrowed to one contract (breakdown row).
  // A Back button returns to the search-first overview.
  const openFull = (b: StatusBucket, contract?: string) => { setDrillStatus(b); setDrillContract(contract ?? null); setDrillSearch('') }
  // Back to search → also collapse any expanded status card (initial state).
  const closeDrill = () => { setDrillStatus(null); setDrillContract(null); setDrillSearch(''); setExpanded(null) }

  const QUEUES: StatusBucket[] = ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter', 'on_hire']
  const inYardCount = vehicles.length
  const onHireCount = outOnHireVehicles.length

  // Main panel shows a result list when the smart search OR a quick filter is on.
  const showResults = !parsed.isEmpty || !!quick
  const displayList = !parsed.isEmpty ? results : (quick ? quick.list : [])
  const clearResults = () => { setQuery(''); setQuickFilter(null) }

  // ── Drill-in: the original cards view (YardTabsView) on the chosen status,
  //    optionally narrowed to a single contract. ──
  if (drillStatus) {
    const matchContract = (v: CheckedInVehicle) => {
      if (!drillContract) return true
      if (drillContract === 'No contract') return !v.contract || !String(v.contract).trim()
      return String(v.contract || '').trim().toLowerCase() === drillContract.toLowerCase()
    }
    const matchSize = (v: CheckedInVehicle) => !sizeFilter || (v.size || '').trim().toLowerCase() === sizeFilter.toLowerCase()
    let dv = vehicles.filter(v => matchSize(v) && matchContract(v))
    let dh = outOnHireVehicles.filter(v => matchSize(v) && matchContract(v))
    // Further smart-filter within the drill (reg, size, colour, make, …). Tab
    // counts in YardTabsView update to reflect the filtered set.
    const dq = parseQuery(drillSearch, vocab)
    if (!dq.isEmpty) {
      dv = dv.filter(v => matchesQuery(v, dq))
      dh = dh.filter(v => matchesQuery(v, dq))
    }
    return (
      <div className={className}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button type="button" onClick={closeDrill}
            className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[#285b44] hover:text-[#07251d] transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to search
          </button>
          {sizeFilter && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-extrabold rounded-full px-2.5 py-1 bg-[#f0f7e0] text-[#4a6b00]">
              {sizeFilter}
              <button type="button" onClick={() => onSizeFilterChange?.(null)} className="hover:text-[#06251a]"><X className="w-3 h-3" /></button>
            </span>
          )}
          {drillContract && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-extrabold rounded-full px-2.5 py-1 bg-[#eef7ef] text-[#0d6b2e]">
              {drillContract}
              <button type="button" onClick={() => setDrillContract(null)} className="hover:text-[#07251d]"><X className="w-3 h-3" /></button>
            </span>
          )}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-[#9bafa5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={drillSearch}
              onChange={e => setDrillSearch(e.target.value)}
              placeholder="Filter these — reg, size, colour, make…"
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-[#dfe8e1] bg-white text-[13px] font-semibold text-[#06251a] placeholder:text-[#9bafa5] outline-none focus:border-[#8fcc16]"
            />
            {drillSearch && (
              <button type="button" onClick={() => setDrillSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9bafa5] hover:text-[#06251a]"><X className="w-4 h-4" /></button>
            )}
          </div>
        </div>
        <YardTabsView
          vehicles={dv}
          outOnHireVehicles={dh}
          onViewVehicle={onViewVehicle}
          onViewModeChange={onViewModeChange}
          initialTab={drillStatus as any}
          className="w-full"
        />
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 ${className}`}>
      {/* ── Main column ── (flex so we can reorder cockpit below results on
          mobile while searching — see the order class on the cockpit section) */}
      <div className="flex flex-col gap-4">
        {/* Hero + smart search */}
        <section className="rounded-3xl p-6 text-white relative overflow-hidden" style={{ background: '#013b2c' }}>
          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full" style={{ background: 'rgba(143,204,22,.16)' }} />
          <div className="relative">
            <h1 className="text-2xl font-black tracking-tight">Search the yard</h1>
            <p className="text-[#cce0d8] text-sm mt-1 mb-4">Find any vehicle by reg, make, colour, contract, status — or any combination.</p>
            <div className="flex items-center gap-2 bg-white rounded-2xl px-4 h-14 shadow-lg">
              <Search className="w-5 h-5 text-[#74877d]" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setQuickFilter(null) }}
                placeholder='e.g. "blue Kia", "white van repairs", "ready not insured"'
                className="flex-1 bg-transparent outline-none text-[#06251a] font-semibold placeholder:text-[#9bafa5] text-sm"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-[#9bafa5] hover:text-[#06251a]"><X className="w-4 h-4" /></button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {onCheckIn && <QuickAction icon={Plus} label="Check in" onClick={onCheckIn} />}
              <QuickAction icon={CalendarPlus} label="Book service" onClick={() => router.push('/service-bookings')} />
              {onExport && <QuickAction icon={Download} label="Export" onClick={onExport} />}
            </div>
          </div>
        </section>

        {/* Active size — set from the Total summary card's "Filter by Size" modal.
            Everything below is scoped to it; tap × to clear. */}
        {sizeFilter && (
          <section>
            <span className="inline-flex items-center gap-2 text-[12px] font-extrabold rounded-full px-3 py-1.5 bg-[#f0f7e0] text-[#4a6b00] border border-[#d8e8b0]">
              Size: {sizeFilter}
              <button type="button" onClick={() => onSizeFilterChange?.(null)} className="hover:text-[#06251a]"><X className="w-3.5 h-3.5" /></button>
            </span>
          </section>
        )}

        {/* Status cockpit. While searching on mobile, drop it BELOW the results
            (order-last) so results appear right under the search bar; desktop
            keeps the natural cockpit-then-results order (lg:order-none). */}
        <section className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 ${showResults ? 'order-last lg:order-none' : ''}`}>
          {BUCKETS.map(({ key, label, color, icon: Icon }) => {
            const isOpen = expanded === key
            return (
              <div key={key} className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm overflow-hidden">
                <button type="button" onClick={() => setExpanded(isOpen ? null : key)} className="w-full text-left p-4 hover:bg-[#fbfdfb] transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-extrabold text-[13px] text-[#07251d]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{label}
                    </span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-[#9bafa5]" /> : <ChevronRight className="w-4 h-4 text-[#9bafa5]" />}
                  </div>
                  <div className="text-3xl font-black tracking-tight mt-2" style={{ color: '#07251d' }}>{count(key)}</div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 -mt-1">
                    <div className="space-y-0.5 max-h-44 overflow-y-auto">
                      {breakdown(key).map(([name, n]) => (
                        <button key={name} type="button" onClick={() => openFull(key, name)}
                          title={`Open ${label} · ${name}`}
                          className="group w-full flex items-center justify-between gap-2 text-[12px] rounded-lg px-2 py-1 text-left hover:bg-[#eef7ef] transition-colors">
                          <span className="text-[#4a5e54] group-hover:text-[#0d6b2e] group-hover:font-bold truncate inline-flex items-center gap-1 min-w-0">
                            <span className="truncate">{name}</span>
                            <ArrowRight className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                          <span className="font-extrabold text-[#07251d] tabular-nums flex-shrink-0">{n}</span>
                        </button>
                      ))}
                      {count(key) === 0 && <div className="text-[12px] text-[#9bafa5] px-2">None</div>}
                    </div>
                    <button type="button" onClick={() => openFull(key)} className="mt-3 w-full text-[11px] font-extrabold text-[#285b44] border border-dashed border-[#cbd9d1] rounded-lg py-2 hover:bg-[#f0f7f0] flex items-center justify-center gap-1">
                      Open full list <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Search results / quick filter OR operational queues */}
        {showResults ? (
          <section className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black tracking-tight inline-flex items-center gap-2">
                {!parsed.isEmpty ? 'Results' : quick?.label}
                <span className="text-[12px] font-black rounded-full px-2 py-0.5 bg-[#f3f5f4] text-[#47566a]">{displayList.length}</span>
              </h2>
              <button type="button" onClick={clearResults} className="text-[12px] font-extrabold text-[#285b44]">Clear</button>
            </div>
            {displayList.length === 0 ? (
              <p className="text-sm text-[#6f8177] py-8 text-center">No vehicles{!parsed.isEmpty ? ` match “${query}”` : ''}.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                {displayList.slice(0, 50).map(v => <VRow key={v.id} v={v} onClick={() => onViewVehicle(v)} showStatus />)}
              </div>
            )}
            {displayList.length > 50 && <p className="text-[11px] text-[#9bafa5] mt-2 text-center">Showing first 50 of {displayList.length}.</p>}
          </section>
        ) : (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {QUEUES.map(b => {
                const cfg = BUCKETS.find(x => x.key === b)!
                const list = byBucket[b]
                return (
                  <div key={b} className="rounded-2xl bg-[#fbfdfb] border border-[#dfe8e1] p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-2 font-extrabold text-[13px] text-[#07251d]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />{cfg.label}
                      </span>
                      <span className="text-[12px] font-black rounded-full px-2 py-0.5" style={{ background: '#eef4ef', color: '#153d2d' }}>{list.length}</span>
                    </div>
                    <div className="flex-1">
                      {list.length === 0 ? (
                        <p className="text-[12px] text-[#9bafa5] py-5 text-center">Nothing here</p>
                      ) : (
                        list.slice(0, 3).map(v => <VRow key={v.id} v={v} onClick={() => onViewVehicle(v)} />)
                      )}
                    </div>
                    <button type="button" onClick={() => openFull(b)} className="mt-3 w-full text-[11px] font-extrabold text-[#285b44] border border-dashed border-[#cbd9d1] rounded-lg py-2 hover:bg-[#f0f7f0] flex items-center justify-center gap-1">
                      Open all {cfg.label.toLowerCase()} <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </section>
          </>
        )}
      </div>

      {/* ── Right rail ── */}
      <aside className="space-y-4">
        <section className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
          <h3 className="font-black tracking-tight mb-3">Today</h3>
          <div className="grid grid-cols-2 gap-2">
            <Metric n={inYardCount} label="In yard now" />
            <Metric n={onHireCount} label="On hire" />
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="font-black tracking-tight inline-flex items-center gap-2">
              Alerts
              <span className="text-[11px] font-black rounded-full px-2 py-0.5 bg-[#f3f5f4] text-[#47566a]">{alerts.length}</span>
            </h3>
            {alerts.length > 0 && (
              <button type="button" onClick={clearAlertsForToday} className="text-[11px] font-extrabold text-[#9bafa5] hover:text-[#285b44]">Clear for today</button>
            )}
          </div>
          <p className="text-[11px] text-[#9bafa5] mb-2">Expired or due within {ALERT_SOON_DAYS} days · clears till midnight.</p>
          {alerts.length === 0 && alertSummary.noMot === 0 && alertSummary.notInsured === 0 ? (
            <p className="text-[12px] text-[#9bafa5] py-3">All clear for today 🎉</p>
          ) : (
            <>
              {alerts.length > 0 && (
                <div className="space-y-0.5 max-h-[360px] overflow-y-auto pr-1">
                  {alerts.map(a => {
                    const dot = a.sev === 0 ? '#c2410c' : '#a25a00'
                    return (
                      <button key={a.id} type="button" onClick={() => onViewVehicle(a.v)} className="w-full flex items-start gap-2 py-2 border-b border-[#f1f4f1] last:border-b-0 text-left hover:bg-[#f8faf8] rounded-lg px-1">
                        <span className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0" style={{ background: dot }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] text-[#3a4a42]"><span className="font-mono font-bold text-[#07251d]">{a.reg}</span> · {a.reason}</div>
                          <div className="text-[11px] text-[#9bafa5]">{a.sub}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {(alertSummary.notInsured > 0 || alertSummary.noMot > 0 || alertSummary.noTax > 0) && (
                <div className={`${alerts.length > 0 ? 'mt-2 pt-2 border-t border-[#f1f4f1]' : ''} space-y-0.5`}>
                  {alertSummary.notInsured > 0 && (
                    <SummaryRow color="#a25a00" n={alertSummary.notInsured} label="Ready · not insured" onClick={() => { setQuickFilter('not_insured'); setQuery('') }} />
                  )}
                  {alertSummary.noMot > 0 && (
                    <SummaryRow color="#c2410c" n={alertSummary.noMot} label="vehicles · no MOT on file" onClick={() => { setQuickFilter('no_mot'); setQuery('') }} />
                  )}
                  {alertSummary.noTax > 0 && (
                    <SummaryRow color="#a25a00" n={alertSummary.noTax} label="vehicles · no road tax on file" onClick={() => { setQuickFilter('no_tax'); setQuery('') }} />
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
          <h3 className="font-black tracking-tight mb-2">Recent activity</h3>
          {activity.length === 0 ? (
            <p className="text-[12px] text-[#9bafa5] py-3">No recent activity.</p>
          ) : (
            <div className="space-y-0.5">
              {activity.map(a => (
                <div key={a.id} className="grid grid-cols-[auto_1fr] gap-2.5 py-2 border-b border-[#eef2ee] last:border-b-0">
                  <span className="w-7 h-7 rounded-lg grid place-items-center flex-shrink-0" style={{ background: '#e8f8e1', color: '#27803f' }}><Activity className="w-3.5 h-3.5" /></span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-[#07251d] truncate">{a.registration ? `${a.registration} · ` : ''}{a.summary}</div>
                    <div className="text-[11px] text-[#6f8177]">{a.actorName ? `${a.actorName} · ` : ''}{relTime(a.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[#ecf7f0] border border-white/20 rounded-full px-3 py-2 hover:bg-white/10 transition-colors">
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  )
}
function SummaryRow({ color, n, label, onClick }: { color: string; n: number; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group w-full flex items-center gap-2 text-[12px] text-[#3a4a42] hover:bg-[#f8faf8] rounded-lg px-1 py-1.5 text-left">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="flex-1"><span className="font-bold text-[#07251d]">{n}</span> {label}</span>
      <ArrowRight className="w-3 h-3 text-[#9bafa5] opacity-0 group-hover:opacity-100" />
    </button>
  )
}
function Metric({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-[#dfe8e1] bg-[#fbfdfb] p-3">
      <div className="text-2xl font-black tracking-tight text-[#07251d]">{n}</div>
      <div className="text-[11px] text-[#6f8177] font-bold">{label}</div>
    </div>
  )
}
