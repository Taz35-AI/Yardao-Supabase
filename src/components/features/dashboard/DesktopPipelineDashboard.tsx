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
  ArrowRight, ShieldAlert, CalendarClock, Activity, Plus, ArrowUpRight, CalendarPlus, Download, X,
} from 'lucide-react'
import { CheckedInVehicle } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { activityLogService, type ActivityRecord } from '@/lib/services/activityLogService'
import { buildVocab, parseQuery, matchesQuery, vehicleBucket, type StatusBucket } from '@/lib/search/smartYardSearch'

interface Props {
  vehicles: CheckedInVehicle[]
  outOnHireVehicles?: CheckedInVehicle[]
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  /** Drive the existing yard list when "Open full list" is clicked. */
  onFilterChange?: (key: any, value: any) => void
  onViewModeChange?: (mode: any) => void
  /** Optional quick-action handlers (wired from DashboardContent). */
  onCheckIn?: () => void
  onBookService?: () => void
  onExport?: () => void
  className?: string
}

const LONG_STAY_DAYS = 30

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

// Small UK reg plate.
function Reg({ reg }: { reg: string }) {
  return (
    <span className="inline-flex items-center rounded-[4px] px-1.5 py-[3px] select-none flex-shrink-0"
      style={{ background: 'linear-gradient(180deg,#fff,#e9efe9)', border: '1px solid #07251d', fontFamily: "'DM Mono',monospace" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#07251d', letterSpacing: '0.06em', lineHeight: 1 }}>{reg}</span>
    </span>
  )
}

// One compact vehicle row used in queues and search results.
function VRow({ v, onClick }: { v: CheckedInVehicle; onClick: () => void }) {
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
      {flag && (
        <span className="text-[10px] font-extrabold rounded-full px-2 py-1 whitespace-nowrap" style={{ color: flag.c, background: flag.bg }}>{flag.t}</span>
      )}
    </button>
  )
}

export function DesktopPipelineDashboard({
  vehicles, outOnHireVehicles = [], onViewVehicle, onFilterChange, onViewModeChange,
  onCheckIn, onBookService, onExport, className = '',
}: Props) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<StatusBucket | null>(null)
  const [activity, setActivity] = useState<ActivityRecord[]>([])

  // Working set = everything (in yard + on hire) so search spans all statuses.
  const all = useMemo(() => [...vehicles, ...outOnHireVehicles], [vehicles, outOnHireVehicles])
  const vocab = useMemo(() => buildVocab(all), [all])
  const parsed = useMemo(() => parseQuery(query, vocab), [query, vocab])
  const results = useMemo(() => parsed.isEmpty ? [] : all.filter(v => matchesQuery(v, parsed)), [all, parsed])

  // Bucket the working set by effective status.
  const byBucket = useMemo(() => {
    const m: Record<StatusBucket, CheckedInVehicle[]> = {
      'Ready': [], 'Pending checks': [], 'Repairs needed': [], 'Non-Starter': [], 'on_hire': [],
    }
    for (const v of all) m[vehicleBucket(v)].push(v)
    // oldest first so the most-overdue surface at the top of each queue
    for (const k of Object.keys(m) as StatusBucket[]) m[k].sort((a, b) => daysSince(b.createdAt) - daysSince(a.createdAt))
    return m
  }, [all])

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

  // Alerts: real blockers only (MOT/tax expired, ready-but-not-insured).
  const alerts = useMemo(() => {
    const out: { reg: string; reason: string; sub: string; v: CheckedInVehicle }[] = []
    for (const v of all) {
      const mot = daysUntil(v.motExpiry), tax = daysUntil(v.taxExpiry)
      if (mot !== null && mot < 0) out.push({ reg: v.registration, reason: 'MOT expired', sub: 'Block checkout', v })
      else if (tax !== null && tax < 0) out.push({ reg: v.registration, reason: 'Road tax expired', sub: 'Block checkout', v })
      else if (v.insuranceStatus === 'Not Insured' && vehicleBucket(v) === 'Ready') out.push({ reg: v.registration, reason: 'Not insured', sub: 'Ready but cannot go out', v })
    }
    return out
  }, [all])

  // Contract breakdown for an expanded status card.
  const breakdown = (b: StatusBucket) => {
    const map = new Map<string, number>()
    for (const v of byBucket[b]) {
      const key = v.contract?.trim() || 'No contract'
      map.set(key, (map.get(key) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  const openFull = (b: StatusBucket) => {
    if (b === 'on_hire') { onViewModeChange?.('table'); return }
    onFilterChange?.('status', FILTER_VALUE[b])
    onViewModeChange?.('table')
  }

  // Ready summary buckets (by size + long-stay).
  const readySummary = useMemo(() => {
    const ready = byBucket['Ready']
    const bySize = new Map<string, number>()
    let longStay = 0
    for (const v of ready) {
      const k = v.size?.trim() || 'Unspecified'
      bySize.set(k, (bySize.get(k) || 0) + 1)
      if (daysSince(v.createdAt) >= LONG_STAY_DAYS) longStay++
    }
    return { total: ready.length, bySize: [...bySize.entries()].sort((a, b) => b[1] - a[1]), longStay }
  }, [byBucket])

  const QUEUES: StatusBucket[] = ['Pending checks', 'Repairs needed', 'Non-Starter']
  const inYardCount = vehicles.length
  const onHireCount = outOnHireVehicles.length

  return (
    <div className={`grid grid-cols-[1fr_360px] gap-4 ${className}`}>
      {/* ── Main column ── */}
      <div className="space-y-4">
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
                onChange={e => setQuery(e.target.value)}
                placeholder='e.g. "blue Kia SDH", "repairs Greythorn", "ready not insured"'
                className="flex-1 bg-transparent outline-none text-[#06251a] font-semibold placeholder:text-[#9bafa5] text-sm"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-[#9bafa5] hover:text-[#06251a]"><X className="w-4 h-4" /></button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {onCheckIn && <QuickAction icon={Plus} label="Check in" onClick={onCheckIn} />}
              <QuickAction icon={ArrowUpRight} label="Check out" onClick={() => onViewModeChange?.('table')} />
              {onBookService && <QuickAction icon={CalendarPlus} label="Book service" onClick={onBookService} />}
              {onExport && <QuickAction icon={Download} label="Export" onClick={onExport} />}
            </div>
          </div>
        </section>

        {/* Status cockpit */}
        <section className="grid grid-cols-5 gap-3">
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
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {breakdown(key).map(([name, n]) => (
                        <div key={name} className="flex items-center justify-between text-[12px]">
                          <span className="text-[#4a5e54] truncate">{name}</span>
                          <span className="font-extrabold text-[#07251d] tabular-nums">{n}</span>
                        </div>
                      ))}
                      {count(key) === 0 && <div className="text-[12px] text-[#9bafa5]">None</div>}
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

        {/* Search results OR operational queues */}
        {!parsed.isEmpty ? (
          <section className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black tracking-tight">Results <span className="text-[#6f8177] font-bold">· {results.length}</span></h2>
              <button type="button" onClick={() => setQuery('')} className="text-[12px] font-extrabold text-[#285b44]">Clear</button>
            </div>
            {results.length === 0 ? (
              <p className="text-sm text-[#6f8177] py-8 text-center">No vehicles match “{query}”.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6">
                {results.slice(0, 50).map(v => <VRow key={v.id} v={v} onClick={() => onViewVehicle(v)} />)}
              </div>
            )}
            {results.length > 50 && <p className="text-[11px] text-[#9bafa5] mt-2 text-center">Showing first 50 of {results.length}.</p>}
          </section>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-3">
              {QUEUES.map(b => {
                const cfg = BUCKETS.find(x => x.key === b)!
                const list = byBucket[b]
                return (
                  <div key={b} className="rounded-2xl bg-[#fbfdfb] border border-[#dfe8e1] p-4 min-h-[220px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-2 font-extrabold text-[13px] text-[#07251d]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />{cfg.label}
                      </span>
                      <span className="text-[12px] font-black rounded-full px-2 py-0.5" style={{ background: '#eef4ef', color: '#153d2d' }}>{list.length}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-[12px] text-[#9bafa5] py-6 text-center">Nothing here 🎉</p>
                    ) : (
                      <div>{list.slice(0, 5).map(v => <VRow key={v.id} v={v} onClick={() => onViewVehicle(v)} />)}</div>
                    )}
                    <button type="button" onClick={() => openFull(b)} className="mt-3 w-full text-[11px] font-extrabold text-[#285b44] border border-dashed border-[#cbd9d1] rounded-lg py-2 hover:bg-[#f0f7f0] flex items-center justify-center gap-1">
                      Open all {cfg.label.toLowerCase()} <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </section>

            {/* Ready & On-hire as summaries, not lists */}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-black tracking-tight inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#16a34a' }} />Ready · {readySummary.total}</h3>
                    <p className="text-[12px] text-[#6f8177] mt-0.5">Available to rent — summarised, not listed.</p>
                  </div>
                  <button type="button" onClick={() => openFull('Ready')} className="text-[11px] font-extrabold text-[#285b44]">Show list →</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {readySummary.bySize.slice(0, 5).map(([size, n]) => (
                    <div key={size} className="rounded-xl border border-[#dfe8e1] bg-[#fbfdfb] p-2.5">
                      <div className="text-xl font-black tracking-tight text-[#07251d]">{n}</div>
                      <div className="text-[11px] text-[#6f8177] font-bold truncate">{size}</div>
                    </div>
                  ))}
                  <div className="rounded-xl border border-[#dfe8e1] bg-[#fbfdfb] p-2.5">
                    <div className="text-xl font-black tracking-tight" style={{ color: readySummary.longStay ? '#a25a00' : '#07251d' }}>{readySummary.longStay}</div>
                    <div className="text-[11px] text-[#6f8177] font-bold">Long-stay &gt;{LONG_STAY_DAYS}d</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-[#dfe8e1] shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-black tracking-tight inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#0a6b4d' }} />On hire · {count('on_hire')}</h3>
                    <p className="text-[12px] text-[#6f8177] mt-0.5">Currently out with customers.</p>
                  </div>
                  <button type="button" onClick={() => openFull('on_hire')} className="text-[11px] font-extrabold text-[#285b44]">Show list →</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[#dfe8e1] bg-[#fbfdfb] p-3">
                    <div className="text-2xl font-black tracking-tight text-[#07251d]">{inYardCount}</div>
                    <div className="text-[11px] text-[#6f8177] font-bold">In yard now</div>
                  </div>
                  <div className="rounded-xl border border-[#dfe8e1] bg-[#fbfdfb] p-3">
                    <div className="text-2xl font-black tracking-tight text-[#07251d]">{onHireCount}</div>
                    <div className="text-[11px] text-[#6f8177] font-bold">Out on hire</div>
                  </div>
                </div>
              </div>
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
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black tracking-tight">Alerts</h3>
            <span className="text-[12px] font-black rounded-full px-2 py-0.5" style={{ background: '#fff0ee', color: '#bf1d19' }}>{alerts.length}</span>
          </div>
          <p className="text-[12px] text-[#6f8177] mb-2">Only blockers — expired MOT/tax, ready-but-uninsured.</p>
          {alerts.length === 0 ? (
            <p className="text-[12px] text-[#9bafa5] py-3">No blockers right now.</p>
          ) : (
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {alerts.slice(0, 12).map((a, i) => (
                <button key={a.v.id + i} type="button" onClick={() => onViewVehicle(a.v)} className="w-full flex items-start gap-2 py-2 border-b border-[#eef2ee] last:border-b-0 text-left hover:bg-[#f6faf6] rounded-lg px-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#dc2626] mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-[#07251d]"><span className="font-mono">{a.reg}</span> · {a.reason}</div>
                    <div className="text-[11px] text-[#6f8177]">{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
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
function Metric({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-[#dfe8e1] bg-[#fbfdfb] p-3">
      <div className="text-2xl font-black tracking-tight text-[#07251d]">{n}</div>
      <div className="text-[11px] text-[#6f8177] font-bold">{label}</div>
    </div>
  )
}
