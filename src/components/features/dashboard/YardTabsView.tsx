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

import React, { useMemo, useState } from 'react'
import {
  CheckCircle, Clock, Wrench, XCircle, Truck, AlertTriangle, Plus, ChevronRight,
  ArrowUpRight, ArrowDownLeft, Bell,
} from 'lucide-react'
import { CheckedInVehicle, VehicleStatus, normalizeVehicleStatus } from '@/types'

interface YardTabsViewProps {
  vehicles: CheckedInVehicle[]
  outOnHireVehicles?: CheckedInVehicle[]
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  className?: string
}

type TabKey = VehicleStatus | 'on_hire'

interface TabConfig {
  key: TabKey
  label: string
  color: string
  icon: typeof CheckCircle
}

const TABS: TabConfig[] = [
  { key: 'Ready', label: 'Ready', color: '#16a34a', icon: CheckCircle },
  { key: 'Pending checks', label: 'Pending', color: '#d97706', icon: Clock },
  { key: 'on_hire', label: 'On hire', color: '#012619', icon: Truck },
  { key: 'Repairs needed', label: 'Repairs', color: '#dc2626', icon: Wrench },
  { key: 'Non-Starter', label: 'Non-starter', color: '#475569', icon: XCircle },
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
const getMotDaysLeft = (motExpiry: any): number | null => {
  const d = toDate(motExpiry)
  if (!d) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}
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
      background: '#f5c800',
      border: '1.5px solid #c8a000',
      fontFamily: "'DM Mono', 'JetBrains Mono', 'SF Mono', monospace",
      boxShadow: '0 1px 3px rgba(200,160,0,0.25)',
    }}
  >
    <span style={{ fontSize: '12px', fontWeight: 800, color: '#111000', letterSpacing: '0.10em', lineHeight: 1 }}>
      {registration}
    </span>
  </span>
)

// ── vehicle row ──────────────────────────────────────────────────────────────
const VehicleRow = ({
  vehicle, color, onView,
}: { vehicle: CheckedInVehicle; color: string; onView: (v: CheckedInVehicle) => void }) => {
  const days = getDaysInYard(vehicle.createdAt || (vehicle as any).checkInTime)
  const motDays = getMotDaysLeft(vehicle.motExpiry)
  const daysColor = days >= 30 ? '#dc2626' : days >= 14 ? '#d97706' : '#6b7a70'

  return (
    <button
      type="button"
      onClick={() => onView(vehicle)}
      className="group relative w-full text-left flex items-center gap-3 bg-white dark:bg-gray-800
                 hover:bg-[#f7faf8] dark:hover:bg-gray-700/70 border border-[#e2e8e5] dark:border-gray-700
                 rounded-xl pl-4 pr-3 py-3 transition-all duration-150 hover:shadow-md hover:-translate-y-[1px]
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#025940]"
    >
      <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-full" style={{ background: color }} />
      <RegPlate registration={vehicle.registration} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-[#012619] dark:text-white leading-tight truncate">
          {`${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown vehicle'}
        </div>
        <div className="text-[11.5px] text-[#6b7a70] dark:text-gray-400 truncate flex items-center gap-2 mt-0.5">
          {vehicle.colour && (
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border border-black/10 inline-block"
                    style={{ background: colourToHex(vehicle.colour) }} />
              {vehicle.colour}
            </span>
          )}
          {vehicle.size && <span>· {vehicle.size}</span>}
          {motDays !== null && motDays <= 30 && (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${motDays < 0 ? 'text-red-600' : 'text-amber-600'}`}>
              <AlertTriangle className="w-3 h-3" />
              {motDays < 0 ? 'MOT expired' : `MOT ${motDays}d`}
            </span>
          )}
        </div>
      </div>
      {vehicle.condition && (
        <span className="hidden sm:inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0
                         bg-[#f0f4f2] text-[#4a5e54] dark:bg-gray-700 dark:text-gray-300">
          {vehicle.condition}
        </span>
      )}
      <span className="text-[12px] font-bold tabular-nums flex-shrink-0 w-8 text-right" style={{ color: daysColor }}>
        {days}d
      </span>
      <ChevronRight className="w-4 h-4 text-[#c2cfc9] dark:text-gray-600 flex-shrink-0 group-hover:text-[#025940]" />
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
  className = '',
}: YardTabsViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('Ready')

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

  const activeCfg = TABS.find(t => t.key === activeTab)!
  const items = grouped[activeTab] || []

  // per-tab metrics
  const metrics = useMemo(() => {
    const dayList = items.map(v => getDaysInYard(v.createdAt || (v as any).checkInTime))
    const avg = dayList.length ? (dayList.reduce((a, b) => a + b, 0) / dayList.length) : 0
    const oldest = dayList.length ? Math.max(...dayList) : 0
    return { count: items.length, avg: avg.toFixed(1), oldest }
  }, [items])

  // Today stats (whole yard)
  const inYard = vehicles.length
  const onHire = outOnHireVehicles.length
  const utilisation = inYard + onHire > 0 ? Math.round((onHire / (inYard + onHire)) * 100) : 0

  // alerts
  const alerts = useMemo(() => {
    const all = [...vehicles, ...outOnHireVehicles]
    const list: { id: string; v: CheckedInVehicle; color: string; text: string; ts: string; sort: number }[] = []
    for (const v of all) {
      const motDays = getMotDaysLeft(v.motExpiry)
      if (motDays !== null && motDays <= 30) {
        list.push({ id: v.id + '-mot', v, color: motDays < 0 ? '#dc2626' : '#d99a06',
          text: `${v.registration} · MOT ${motDays < 0 ? 'expired' : `due in ${motDays}d`}`, ts: '', sort: motDays })
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

  // recent activity
  const activity = useMemo(() => {
    const ev: { id: string; t: number; kind: string; text: string; v: CheckedInVehicle }[] = []
    const push = (date: any, kind: string, text: string, v: CheckedInVehicle, suffix: string) => {
      const d = toDate(date); if (!d) return
      ev.push({ id: v.id + suffix, t: d.getTime(), kind, text, v })
    }
    for (const v of vehicles) {
      push(v.createdAt || (v as any).checkInTime, 'checkin', `${v.registration} checked in to yard`, v, '-ci')
      if (v.transferStatus === 'in_transit') push(v.transferInitiatedAt, 'transfer', `${v.registration} transfer to ${v.targetBranchName || 'branch'}`, v, '-tr')
      if (v.transferStatus === 'at_external_garage') push(v.checkedOutToGarageAt, 'garage', `${v.registration} sent to ${v.externalGarageName || 'garage'}`, v, '-ga')
    }
    for (const v of outOnHireVehicles) {
      push(v.hiredAt, 'hire', `${v.registration} checked out — out on hire`, v, '-hi')
    }
    return ev.sort((a, b) => b.t - a.t).slice(0, 6)
  }, [vehicles, outOnHireVehicles])

  const openCheckIn = () => window.dispatchEvent(new Event('yardao:open-checkin'))

  return (
    <div className={`${className} flex flex-col lg:flex-row gap-4 items-stretch lg:items-start`}>

      {/* ════ LEFT: tabs + metrics + list ════ */}
      <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        {/* tabs */}
        <div className="flex gap-1 px-2 pt-1.5 border-b border-[#e2e8e5] dark:border-gray-700 overflow-x-auto"
             style={{ scrollbarWidth: 'thin' }}>
          {TABS.map(tab => {
            const on = tab.key === activeTab
            return (
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
          })}
        </div>

        <div className="p-4">
          {/* metrics */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'linear-gradient(135deg,#04231a,#013a29)' }}>
              <div className="text-[22px] font-bold tracking-tight text-[#b3f243] leading-none">{metrics.count}</div>
              <div className="text-[11px] text-[#a9c6b9] mt-1.5 font-medium">In {activeCfg.label.toLowerCase()}</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-[#fbfdfc] dark:bg-gray-900/40 border border-[#e7edea] dark:border-gray-700">
              <div className="text-[22px] font-bold tracking-tight text-[#012619] dark:text-white leading-none">{metrics.avg}d</div>
              <div className="text-[11px] text-[#6b7a70] dark:text-gray-400 mt-1.5 font-medium">Avg time in yard</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-[#fbfdfc] dark:bg-gray-900/40 border border-[#e7edea] dark:border-gray-700">
              <div className="text-[22px] font-bold tracking-tight text-[#012619] dark:text-white leading-none">{metrics.oldest}d</div>
              <div className="text-[11px] text-[#6b7a70] dark:text-gray-400 mt-1.5 font-medium">Longest waiting</div>
            </div>
          </div>

          {/* list */}
          <div className="flex flex-col gap-2.5">
            {items.length === 0 ? (
              <div className="text-center py-14 px-4">
                <activeCfg.icon className="w-8 h-8 text-[#c8d5ce] dark:text-gray-600 mx-auto mb-2" />
                <p className="text-[13px] text-[#8a9e94] dark:text-gray-500">No vehicles in {activeCfg.label}</p>
                <button onClick={openCheckIn}
                        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#025940] hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Check in a vehicle
                </button>
              </div>
            ) : (
              items.map(v => (
                <VehicleRow key={v.id} vehicle={v} color={activeCfg.color} onView={onViewVehicle} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ════ RIGHT RAIL ════ */}
      <div className="w-full lg:w-80 lg:shrink-0 flex flex-col gap-4 lg:sticky lg:top-2 lg:self-start">
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
                  <button key={e.id} onClick={() => onViewVehicle(e.v)}
                          className={`flex items-start gap-3 text-left py-2.5 ${i < activity.length - 1 ? 'border-b border-[#f1f5f3] dark:border-gray-700/60' : ''}`}>
                    <span className="w-6.5 h-6.5 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: meta.bg, color: meta.fg, width: 26, height: 26 }}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-[#0c1f17] dark:text-gray-200 leading-snug">{e.text}</span>
                      <span className="block text-[11px] text-[#9fb0a8] mt-0.5">{relTime(new Date(e.t))}</span>
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
  checkin:  { icon: Plus,          bg: '#eef0ef', fg: '#525f59' },
  hire:     { icon: ArrowUpRight,  bg: '#e9f2f8', fg: '#256089' },
  transfer: { icon: ArrowUpRight,  bg: '#e9f2f8', fg: '#256089' },
  garage:   { icon: Wrench,        bg: '#fdf3e2', fg: '#b5790a' },
  return:   { icon: ArrowDownLeft, bg: '#e7f6ee', fg: '#0e7a4f' },
}
