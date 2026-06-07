// src/components/features/dashboard/YardTabsView.tsx
// Tabbed yard view: statuses become tabs (Ready / Pending / On hire / Repairs /
// Non-starter); selecting a tab shows that status's vehicles plus a few metrics.
// A right-hand rail shows Today stats, Alerts and Recent activity.
//
// IMPORTANT: this is a pure PRESENTATION component. It receives exactly the same
// props as PipelineView (vehicles, outOnHireVehicles, onViewVehicle) and derives
// everything else from them. All other dashboard features (incoming transfers,
// garage check-out, hire, modals, filters, realtime, etc.) live in
// DashboardContent and are unaffected by swapping this view in.
//
// NOTE: new UI strings are hard-coded English for this first iteration so the
// look can be reviewed live; they'll be moved into the i18n dictionaries once the
// design is locked.

'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  CheckCircle, Clock, Wrench, XCircle, Truck, Plus,
  ArrowUpRight, ArrowDownLeft, Bell,
  Columns3, LayoutList, LayoutGrid, Map as MapIcon, Filter,
  FileText, Tag, Shield, Trash2, Pencil, StickyNote,
} from 'lucide-react'

type ViewMode = 'table' | 'cards' | 'layout' | 'pipeline'
import { CheckedInVehicle, VehicleStatus, normalizeVehicleStatus } from '@/types'
import { useCheckoutHistory } from '@/hooks/useCheckoutHistory'
import { activityLogService, type ActivityRecord } from '@/lib/services/activityLogService'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'

interface YardTabsViewProps {
  vehicles: CheckedInVehicle[]
  outOnHireVehicles?: CheckedInVehicle[]
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  /** Current search term — when set, the view auto-selects the tab that holds
   *  the matching vehicle(s). */
  searchTerm?: string
  /** View switcher + Filters live on the same row as the status tabs (desktop). */
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  onToggleFilters?: () => void
  filtersOpen?: boolean
  className?: string
}

type TabKey = VehicleStatus | 'on_hire'

interface TabConfig {
  key: TabKey
  label: string
  color: string
  icon: typeof CheckCircle
}

// Order: the four in-yard statuses first, then On hire shown separately (a
// divider is rendered before it because it represents vehicles OUT of the yard).
const TABS: TabConfig[] = [
  { key: 'Ready', label: 'Ready', color: '#16a34a', icon: CheckCircle },
  { key: 'Pending checks', label: 'Pending', color: '#d97706', icon: Clock },
  { key: 'Repairs needed', label: 'Repairs', color: '#dc2626', icon: Wrench },
  { key: 'Non-Starter', label: 'Non-starter', color: '#475569', icon: XCircle },
  { key: 'on_hire', label: 'On hire', color: '#012619', icon: Truck },
]

// ── helpers ────────────────────────────────────────────────────────────────
const toDate = (val: any): Date | null => {
  if (!val) return null
  try {
    const d = typeof val === 'object' && val?.toDate ? val.toDate() : new Date(val)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}
const getDaysInYard = (createdAt: any): number => {
  const d = toDate(createdAt)
  if (!d) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}
// Days until an expiry date (negative = already expired). Shared by the MOT and
// road-tax badges so both behave identically.
const getDaysLeft = (expiry: any): number | null => {
  const d = toDate(expiry)
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}
const getMotDaysLeft = getDaysLeft
const relTime = (d: Date): string => {
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

const RegPlate = ({ registration }: { registration: string }) => (
  <span
    className="inline-flex items-center rounded-[4px] px-2 py-[3px] select-none flex-shrink-0"
    style={{
      // UK front-plate style: glossy white with a bevelled black edge + embossed
      // black characters (rear plates are yellow — too much yellow).
      background: 'linear-gradient(180deg,#ffffff 0%,#f4f4f4 52%,#e3e3e3 100%)',
      border: '1px solid #012619',
      fontFamily: "'DM Mono', 'JetBrains Mono', 'SF Mono', monospace",
      boxShadow: '0 1.5px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -2px 3px rgba(0,0,0,0.14)',
    }}
  >
    <span style={{ fontSize: '12px', fontWeight: 800, color: '#012619', letterSpacing: '0.10em', lineHeight: 1, textShadow: '0 1px 0 rgba(255,255,255,0.55)' }}>
      {registration}
    </span>
  </span>
)

// ── vehicle tile ─────────────────────────────────────────────────────────────
// Deliberately calm + compact: no left status stripe (the tab already says the
// status), no inner divider, no bordered pills. Just plate + days, make/model,
// one muted attribute line (colour · size · condition), one contract line, and
// a lightweight alert line only when MOT / road tax needs attention. Every data
// point from the old card is still here, just quieter.
const VehicleRow = ({
  vehicle, color, onView,
}: { vehicle: CheckedInVehicle; color: string; onView: (v: CheckedInVehicle) => void }) => {
  // On-hire vehicles show days OUT ON HIRE (from hired_at); in-yard vehicles show
  // days in the yard (from check-in). The small truck icon disambiguates the two.
  const onHire = (vehicle as any).hireStatus === 'Out on Hire'
  const hireDays = getDaysInYard((vehicle as any).hiredAt)
  const days = onHire && (vehicle as any).hiredAt ? hireDays : getDaysInYard(vehicle.createdAt || (vehicle as any).checkInTime)
  const motDays = getDaysLeft(vehicle.motExpiry)
  const taxDays = getDaysLeft((vehicle as any).taxExpiry)
  const daysColor = onHire ? '#256089' : days >= 30 ? '#dc2626' : days >= 14 ? '#d97706' : '#9aa3ab'
  const contract = vehicle.contract
  const contractColor = vehicle.contractColor

  // colour · size · condition condensed into a single muted line.
  const attrs = [vehicle.colour, vehicle.size, vehicle.condition].filter(Boolean).join(' · ')

  const alerts: { key: string; label: string; expired: boolean }[] = []
  if (motDays !== null && motDays <= 30) alerts.push({ key: 'mot', expired: motDays < 0, label: motDays < 0 ? 'MOT expired' : `MOT ${motDays}d` })
  if (taxDays !== null && taxDays <= 30) alerts.push({ key: 'tax', expired: taxDays < 0, label: taxDays < 0 ? 'Road Tax expired' : `Road Tax ${taxDays}d` })

  return (
    <button
      type="button"
      onClick={() => onView(vehicle)}
      className="group flex flex-col text-left bg-white dark:bg-gray-800 hover:bg-[#f7faf8] dark:hover:bg-gray-700/70
                 border border-[#e2e8e5] dark:border-gray-700 rounded-lg p-2 transition-colors duration-150
                 hover:border-[#cfdcd6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#025940]"
    >
      {/* plate + days */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <RegPlate registration={vehicle.registration} />
        <span
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums leading-none flex-shrink-0"
          style={{ color: daysColor }}
          title={onHire ? `${days} day${days === 1 ? '' : 's'} out on hire` : `${days} day${days === 1 ? '' : 's'} in yard`}
        >
          {onHire && <Truck className="w-2.5 h-2.5" />}
          {days}d
        </span>
      </div>

      {/* make / model */}
      <div className="text-[12px] font-semibold text-[#012619] dark:text-white leading-tight truncate">
        {`${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown vehicle'}
      </div>

      {/* colour swatch + colour · size · condition */}
      <div className="text-[10.5px] text-[#7a8a82] dark:text-gray-400 truncate mt-0.5 flex items-center gap-1">
        {vehicle.colour && (
          <span className="w-2 h-2 rounded-full border border-black/10 inline-block flex-shrink-0" style={{ background: colourToHex(vehicle.colour) }} />
        )}
        <span className="truncate">{attrs || '—'}</span>
      </div>

      {/* contract (colour kept as a small dot only) */}
      <div className="text-[10.5px] truncate mt-0.5 flex items-center gap-1">
        {contract ? (
          <>
            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: contractColor || '#8a9e94' }} />
            <span className="truncate text-[#5b6b63] dark:text-gray-400" title={contract}>{contract}</span>
          </>
        ) : (
          <span className="italic text-[#9aa8a1] dark:text-gray-500">No contract</span>
        )}
      </div>

      {/* MOT / Road Tax — quiet coloured text, no boxes. Shown only when due/expired. */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
          {alerts.map((a) => (
            <span key={a.key} className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: a.expired ? '#dc2626' : '#c2780a' }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.expired ? '#dc2626' : '#c2780a' }} />
              {a.label}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// crude colour-name → swatch hex so the dot looks right; falls back to grey.
function colourToHex(name?: string): string {
  if (!name) return '#cbd5d0'
  const n = name.toLowerCase().trim()
  const map: Record<string, string> = {
    white: '#ffffff', black: '#1a1a1a', silver: '#c8ccd0', grey: '#9aa3ab', gray: '#9aa3ab',
    blue: '#1f4ea1', red: '#d12b2b', green: '#1f8a4c', yellow: '#f5c800', orange: '#f97316',
    brown: '#7b5234', gold: '#d4af37', beige: '#d8c9a3', purple: '#7c3aed',
  }
  return map[n] || '#cbd5d0'
}

// ── main ─────────────────────────────────────────────────────────────────────
export const YardTabsView = React.memo(function YardTabsView({
  vehicles,
  outOnHireVehicles = [],
  onViewVehicle,
  searchTerm = '',
  viewMode,
  onViewModeChange,
  onToggleFilters,
  filtersOpen = false,
  className = '',
}: YardTabsViewProps) {
  const VIEW_BTNS: { mode: ViewMode; icon: typeof Columns3; label: string }[] = [
    { mode: 'pipeline', icon: Columns3, label: 'Pipeline' },
    { mode: 'table', icon: LayoutList, label: 'List' },
    { mode: 'cards', icon: LayoutGrid, label: 'Cards' },
    { mode: 'layout', icon: MapIcon, label: 'Map' },
  ]
  const [activeTab, setActiveTab] = useState<TabKey>('Ready')
  // Real movement feed (check-outs, hires, transfers, garage) with who + when.
  const { checkoutHistory } = useCheckoutHistory()

  // Full activity feed — every logged action (check-in/out, status, comment,
  // garage, hire, condition/contract/insurance, defleet, reg change…) with who.
  const orgId = (vehicles[0] as any)?.organizationId ?? (outOnHireVehicles[0] as any)?.organizationId ?? null
  const [activityRows, setActivityRows] = useState<ActivityRecord[]>([])
  useEffect(() => {
    if (!orgId) return
    let alive = true
    const load = () => activityLogService.getRecent(orgId, 12).then((r) => { if (alive) setActivityRows(r) })
    load()
    const unsub = activityLogService.subscribe(orgId, load)
    return () => { alive = false; unsub() }
  }, [orgId])

  // My personal notes due today (per-user — only the signed-in user sees these).
  const { user } = useAuth()
  const [myNotes, setMyNotes] = useState<{ id: string; text: string; priority: string; scheduledTime: string | null }[]>([])
  const loadMyNotes = useCallback(async () => {
    if (!user?.uid) { setMyNotes([]); return }
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('user_notes')
      .select('id, text, priority, scheduled_time')
      .eq('user_id', user.uid)
      .eq('date', today)
      .eq('done', false)
    const order: Record<string, number> = { urgent: 0, medium: 1, low: 2 }
    setMyNotes((data ?? [])
      .map((n: any) => ({ id: n.id, text: n.text, priority: n.priority || 'medium', scheduledTime: n.scheduled_time }))
      .sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1)))
  }, [user?.uid])

  useEffect(() => {
    loadMyNotes()
    // Stay in sync when notes change anywhere (the sticky-note panel dispatches
    // this after add/delete/toggle) — no page refresh needed.
    const onChange = () => loadMyNotes()
    window.addEventListener('yardao:notes-changed', onChange)
    return () => window.removeEventListener('yardao:notes-changed', onChange)
  }, [loadMyNotes])

  // Mark a note done straight from the rail. Optimistic; reverts on failure.
  const markNoteDone = useCallback(async (id: string) => {
    if (!user?.uid) return
    setMyNotes(prev => prev.filter(n => n.id !== id))
    try {
      await supabase.from('user_notes').update({ done: true, archived_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.uid)
      window.dispatchEvent(new Event('yardao:notes-changed')) // keep the popup list in sync too
    } catch { loadMyNotes() }
  }, [user?.uid, loadMyNotes])

  const grouped = useMemo(() => {
    const buckets: Record<TabKey, CheckedInVehicle[]> = {
      'Ready': [], 'Pending checks': [], 'Repairs needed': [], 'Non-Starter': [], 'on_hire': [],
    }
    for (const v of vehicles) {
      const s = normalizeVehicleStatus(v.status as string)
      if (buckets[s]) buckets[s].push(v)
    }
    buckets['on_hire'] = [...outOnHireVehicles]
    for (const k of Object.keys(buckets) as TabKey[]) {
      buckets[k].sort((a, b) =>
        getDaysInYard(b.createdAt || (b as any).checkInTime) -
        getDaysInYard(a.createdAt || (a as any).checkInTime))
    }
    return buckets
  }, [vehicles, outOnHireVehicles])

  // When the user searches, jump to the tab that actually contains the match.
  // (vehicles/outOnHireVehicles are already filtered upstream by the search, so
  // a non-empty bucket = a hit.) We only move if the current tab has no hits,
  // so manually browsing an empty tab without a search isn't disturbed.
  useEffect(() => {
    if (!searchTerm.trim()) return
    if ((grouped[activeTab]?.length || 0) > 0) return
    const order: TabKey[] = ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter', 'on_hire']
    const firstHit = order.find(k => (grouped[k]?.length || 0) > 0)
    if (firstHit) setActiveTab(firstHit)
  }, [searchTerm, grouped, activeTab])

  const activeCfg = TABS.find(t => t.key === activeTab)!
  const items = grouped[activeTab] || []

  // Today stats (whole yard)
  const inYard = vehicles.length
  const onHire = outOnHireVehicles.length
  const utilisation = inYard + onHire > 0 ? Math.round((onHire / (inYard + onHire)) * 100) : 0

  // alerts
  const alerts = useMemo(() => {
    const all = [...vehicles, ...outOnHireVehicles]
    const list: { id: string; v: CheckedInVehicle; color: string; text: string; ts: string; sort: number }[] = []
    for (const v of all) {
      const motDays = getDaysLeft(v.motExpiry)
      if (motDays !== null && motDays <= 30) {
        list.push({ id: v.id + '-mot', v, color: motDays < 0 ? '#dc2626' : '#d99a06',
          text: `${v.registration} · MOT ${motDays < 0 ? 'expired' : `due in ${motDays}d`}`, ts: '', sort: motDays })
      }
      const taxDays = getDaysLeft((v as any).taxExpiry)
      if (taxDays !== null && taxDays <= 30) {
        list.push({ id: v.id + '-tax', v, color: taxDays < 0 ? '#dc2626' : '#d99a06',
          text: `${v.registration} · Road Tax ${taxDays < 0 ? 'expired' : `due in ${taxDays}d`}`, ts: '', sort: taxDays })
      }
      if (v.insuranceStatus === 'Not Insured') {
        list.push({ id: v.id + '-ins', v, color: '#dc2626', text: `${v.registration} · not insured`, ts: '', sort: -1000 })
      }
      if (normalizeVehicleStatus(v.status as string) === 'Repairs needed') {
        const d = getDaysInYard(v.createdAt || (v as any).checkInTime)
        if (d >= 3) list.push({ id: v.id + '-rep', v, color: '#dc2626', text: `${v.registration} · in repairs over ${d}d`, ts: '', sort: -d })
      }
      if (v.transferStatus === 'in_transit') {
        list.push({ id: v.id + '-tr', v, color: '#2f74a0', text: `${v.registration} · in transit to ${v.targetBranchName || 'branch'}`, ts: '', sort: 5 })
      }
      if (v.transferStatus === 'at_external_garage') {
        list.push({ id: v.id + '-gar', v, color: '#2f74a0', text: `${v.registration} · at ${v.externalGarageName || 'external garage'}`, ts: '', sort: 6 })
      }
    }
    return list.sort((a, b) => a.sort - b.sort).slice(0, 8)
  }, [vehicles, outOnHireVehicles])

  // Recent activity. Primary source = the activity_log (every logged action,
  // with who did it). Until that table has accumulated events it falls back to
  // the derived movement feed (check-ins + checkout history) so the panel is
  // never blank. Newest first.
  const activity = useMemo(() => {
    const norm = (r?: string) => (r || '').toUpperCase().replace(/\s+/g, '')
    const byReg = new Map<string, CheckedInVehicle>()
    for (const v of [...vehicles, ...outOnHireVehicles]) byReg.set(norm(v.registration), v)

    // ── Primary: activity_log ──
    if (activityRows.length > 0) {
      return activityRows.map((r) => ({
        id: r.id,
        t: new Date(r.createdAt).getTime(),
        kind: r.actionType as string,
        text: r.registration ? `${r.registration} · ${r.summary}` : r.summary,
        by: r.actorName || '',
        v: r.registration ? (byReg.get(norm(r.registration)) || null) : null,
      })).slice(0, 8)
    }

    // ── Fallback: derived movements (pre-activity-log) ──
    const ev: { id: string; t: number; kind: string; text: string; by: string; v: CheckedInVehicle | null }[] = []
    for (const v of vehicles) {
      const d = toDate(v.createdAt || (v as any).checkInTime)
      if (!d) continue
      ev.push({
        id: v.id + '-ci', t: d.getTime(), kind: 'checkin',
        text: `${v.registration} checked in to yard`,
        by: (v as any).parkedByName || (v as any).checkedInByName || '', v,
      })
    }
    for (const r of checkoutHistory) {
      const d = r.checkedOutDate instanceof Date ? r.checkedOutDate : new Date(r.checkedOutDate as any)
      if (!d || isNaN(d.getTime())) continue
      const kind =
        r.activityType === 'hire' ? 'hire' :
        r.activityType === 'external_garage' ? 'garage' :
        r.activityType === 'transfer' ? 'transfer' : 'checkout'
      ev.push({
        id: r.id, t: d.getTime(), kind,
        text: `${r.registration} · ${r.activityLabel}`,
        by: r.checkedOutByName || '',
        v: byReg.get(norm(r.registration)) || null,
      })
    }
    return ev.sort((a, b) => b.t - a.t).slice(0, 7)
  }, [vehicles, outOnHireVehicles, checkoutHistory, activityRows])

  const openCheckIn = () => window.dispatchEvent(new Event('yardao:open-checkin'))

  return (
    <div className={`${className} flex flex-col lg:flex-row gap-4 items-stretch lg:items-start`}>

      {/* ════ LEFT: tabs + metrics + list ════ */}
      <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        {/* tabs + controls row */}
        <div className="flex items-center gap-2 px-2 pt-1.5 border-b border-[#e2e8e5] dark:border-gray-700">
          <div className="flex gap-1 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'thin' }}>
          {TABS.map(tab => {
            const on = tab.key === activeTab
            const btn = (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-3.5 py-3 text-[13.5px] font-semibold whitespace-nowrap
                            border-b-[3px] transition-colors ${on
                    ? 'text-[#012619] dark:text-white border-[#b3f243]'
                    : 'text-[#8a9e94] dark:text-gray-400 border-transparent hover:text-[#4a5e54] dark:hover:text-gray-200'}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: tab.color }} />
                {tab.label}
                <span className={`text-[11px] font-extrabold rounded-full px-1.5 min-w-[20px] text-center ${on
                    ? 'bg-[#012619] text-[#b3f243]'
                    : 'bg-[#f0f4f2] dark:bg-gray-700 text-[#8a9e94] dark:text-gray-400'}`}>
                  {grouped[tab.key]?.length ?? 0}
                </span>
              </button>
            )
            // On hire is out of the yard — separate it from the in-yard tabs.
            if (tab.key === 'on_hire') {
              return (
                <React.Fragment key="on_hire_group">
                  <span aria-hidden className="self-center w-px h-6 mx-1.5 bg-[#e2e8e5] dark:bg-gray-700 flex-shrink-0" />
                  {btn}
                </React.Fragment>
              )
            }
            return btn
          })}
          </div>

          {/* view switcher + Filters — same row as the status tabs (desktop) */}
          {onViewModeChange && (
            <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0 pb-1.5">
              <div className="flex items-center gap-0.5 bg-[#f0f4f2] dark:bg-gray-700/50 rounded-lg p-0.5">
                {VIEW_BTNS.map(b => {
                  const on = viewMode === b.mode
                  const Icon = b.icon
                  return (
                    <button key={b.mode} onClick={() => onViewModeChange(b.mode)} title={b.label} aria-label={b.label}
                      className={`p-1.5 rounded-md transition-colors ${on ? 'bg-[#012619] text-white shadow-sm' : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'}`}>
                      <Icon className="w-4 h-4" />
                    </button>
                  )
                })}
              </div>
              {onToggleFilters && (
                <button onClick={onToggleFilters} title="Filters" aria-label="Filters"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filtersOpen ? 'bg-[#012619] border-[#012619] text-white' : 'bg-white dark:bg-gray-800 border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#c8d5ce]'}`}>
                  <Filter className="w-3.5 h-3.5" /> Filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              {/* icon badge */}
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5
                              bg-gradient-to-br from-[#f1f7f3] to-[#e1efe8] dark:from-gray-700/50 dark:to-gray-800/50
                              ring-1 ring-[#025940]/10 dark:ring-white/5 shadow-sm">
                <activeCfg.icon className="w-9 h-9 text-[#025940] dark:text-[#72A68E]" strokeWidth={1.75} />
              </div>

              <h3 className="text-[17px] font-bold text-[#012619] dark:text-white tracking-tight">
                No vehicles in {activeCfg.label}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#6b7a70] dark:text-gray-400 max-w-[260px]">
                Vehicles you check in will show up here. Add your first one to get started.
              </p>

              <button
                onClick={openCheckIn}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-[#025940] hover:bg-[#012619] text-white text-[13.5px] font-semibold
                           shadow-lg shadow-[#025940]/25 hover:shadow-xl hover:-translate-y-0.5
                           transition-all duration-150
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-[#025940] focus-visible:ring-offset-2"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} /> Check in a vehicle
              </button>
            </div>
          ) : (
            <div
              className="grid gap-2.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
            >
              {items.map(v => (
                <VehicleRow key={v.id} vehicle={v} color={activeCfg.color} onView={onViewVehicle} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════ RIGHT RAIL ════ */}
      <div className="w-full lg:w-96 lg:shrink-0 flex flex-col gap-4 lg:sticky lg:top-2 lg:self-start">
        {/* Today */}
        <div className="bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-2xl shadow-sm p-4">
          <h3 className="text-[14px] font-bold text-[#012619] dark:text-white mb-3">Today</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {[{ n: inYard, l: 'In yard' }, { n: onHire, l: 'On hire' }, { n: `${utilisation}%`, l: 'Utilisation' }].map((s, i) => (
              <div key={i} className="text-center rounded-xl border border-[#e7edea] dark:border-gray-700 py-2.5">
                <div className="text-[19px] font-bold text-[#012619] dark:text-white leading-none">{s.n}</div>
                <div className="text-[10.5px] text-[#6b7a70] dark:text-gray-400 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* My Notes — personal reminders due today (only the signed-in user sees these) */}
        {myNotes.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <StickyNote className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
              <h3 className="text-[14px] font-bold text-[#012619] dark:text-white">My Notes</h3>
              <span className="text-[11px] font-extrabold bg-[#025940] text-white rounded-full px-2 py-[1px]">{myNotes.length}</span>
              <span className="text-[10.5px] text-[#8a9e94] dark:text-gray-500 ml-auto">Today</span>
            </div>
            <div className="flex flex-col">
              {myNotes.map((n, i) => (
                <div key={n.id}
                     className={`group flex items-start gap-2.5 py-2.5 ${i < myNotes.length - 1 ? 'border-b border-[#f1f5f3] dark:border-gray-700/60' : ''}`}>
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: n.priority === 'urgent' ? '#dc2626' : n.priority === 'low' ? '#72A68E' : '#d97706' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[#0c1f17] dark:text-gray-200 leading-snug">{n.text}</span>
                    {n.scheduledTime && (
                      <span className="block text-[11px] font-semibold text-[#025940] dark:text-[#72A68E] mt-0.5">{n.scheduledTime}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => markNoteDone(n.id)}
                    title="Mark done"
                    aria-label="Mark note done"
                    className="flex-shrink-0 -m-1 p-1 rounded-md text-[#b6c2bb] hover:text-[#025940] hover:bg-[#025940]/8 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alerts */}
        <div className="bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-[#012619] dark:text-white" />
            <h3 className="text-[14px] font-bold text-[#012619] dark:text-white">Alerts</h3>
            {alerts.length > 0 && (
              <span className="text-[11px] font-extrabold bg-[#025940] text-white rounded-full px-2 py-[1px]">{alerts.length}</span>
            )}
          </div>
          {alerts.length === 0 ? (
            <p className="text-[12.5px] text-[#8a9e94] dark:text-gray-500 py-2">Nothing needs attention. 🎉</p>
          ) : (
            <div className="flex flex-col">
              {alerts.map((a, i) => (
                <button key={a.id} onClick={() => onViewVehicle(a.v)}
                        className={`flex items-start gap-2.5 text-left py-2.5 ${i < alerts.length - 1 ? 'border-b border-[#f1f5f3] dark:border-gray-700/60' : ''}`}>
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.color }} />
                  <span className="text-[13px] text-[#0c1f17] dark:text-gray-200 font-medium leading-snug">{a.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-2xl shadow-sm p-4">
          <h3 className="text-[14px] font-bold text-[#012619] dark:text-white mb-3">Recent activity</h3>
          {activity.length === 0 ? (
            <p className="text-[12.5px] text-[#8a9e94] dark:text-gray-500 py-2">No recent activity.</p>
          ) : (
            <div className="flex flex-col">
              {activity.map((e, i) => {
                const meta = ACTIVITY_META[e.kind] || ACTIVITY_META.checkin
                const Icon = meta.icon
                return (
                  <button key={e.id} onClick={() => e.v && onViewVehicle(e.v)} disabled={!e.v}
                          className={`flex items-start gap-3 text-left py-2.5 ${e.v ? '' : 'cursor-default'} ${i < activity.length - 1 ? 'border-b border-[#f1f5f3] dark:border-gray-700/60' : ''}`}>
                    <span className="rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: meta.bg, color: meta.fg, width: 26, height: 26 }}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-[#0c1f17] dark:text-gray-200 leading-snug">{e.text}</span>
                      <span className="block text-[11px] text-[#9fb0a8] mt-0.5">
                        {e.by ? `${e.by} · ` : ''}{relTime(new Date(e.t))}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

const ACTIVITY_META: Record<string, { icon: typeof ArrowUpRight; bg: string; fg: string }> = {
  checkin:              { icon: ArrowDownLeft, bg: '#e7f6ee', fg: '#0e7a4f' },
  checkout:             { icon: ArrowUpRight,  bg: '#e9f2f8', fg: '#256089' },
  hire:                 { icon: Truck,         bg: '#e9f2f8', fg: '#256089' },
  return:               { icon: ArrowDownLeft, bg: '#e7f6ee', fg: '#0e7a4f' },
  transfer:             { icon: Truck,         bg: '#eef0ef', fg: '#525f59' },
  garage:               { icon: Wrench,        bg: '#fdf3e2', fg: '#b5790a' },
  garage_booking:       { icon: Wrench,        bg: '#fdf3e2', fg: '#b5790a' },
  garage_out:           { icon: Wrench,        bg: '#fdf3e2', fg: '#b5790a' },
  garage_return:        { icon: ArrowDownLeft, bg: '#e7f6ee', fg: '#0e7a4f' },
  status_changed:       { icon: Pencil,        bg: '#eef0ef', fg: '#525f59' },
  comment:              { icon: FileText,      bg: '#eef0ef', fg: '#525f59' },
  condition_changed:    { icon: Pencil,        bg: '#eef0ef', fg: '#525f59' },
  contract_changed:     { icon: Tag,           bg: '#eef2f6', fg: '#3a6ea5' },
  insurance_changed:    { icon: Shield,        bg: '#eef2f6', fg: '#3a6ea5' },
  vehicle_added:        { icon: Plus,          bg: '#e7f6ee', fg: '#0e7a4f' },
  defleet:              { icon: Trash2,        bg: '#fdecec', fg: '#c0392b' },
  registration_changed: { icon: Pencil,        bg: '#eef0ef', fg: '#525f59' },
}
