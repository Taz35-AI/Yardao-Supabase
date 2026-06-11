// src/components/features/fleet/FleetSizeOverview.tsx
//
// "Fleet by size" overview for the Fleet page. A donut chart of the (already
// filtered) fleet broken down by size, with a clickable legend. Tapping a slice
// or legend row scopes to that size; tapping the donut CENTRE reveals the
// matching vehicles as dashboard-style rows — reg plate + "Make Model" + a
// muted "colour · size · contract" line + Insurance / MOT / Tax pills, so every
// fleet column is preserved, just re-laid in the dashboard drill-in style.
//
// When a search is active upstream, `forceOpen` reveals the list automatically
// (otherwise a search would look like it did nothing).

'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FleetVehicle } from '@/types'

interface Props {
  /** Already filtered + sorted vehicles (hero search, toggles, advanced filters applied). */
  vehicles: FleetVehicle[]
  /** Open the detail modal for a row. */
  onViewVehicle: (v: FleetVehicle) => void
  /** Reveal the list automatically (used when a search query is active). */
  forceOpen?: boolean
}

const SIZE_COLORS = [
  '#0d6b2e', '#2f9e44', '#74c476', '#1f7a8c', '#4dabf7',
  '#9775fa', '#f59f00', '#e8590c', '#e64980', '#7048e8',
]
const MAX_SLICES = 9 // beyond this, the tail collapses into "Other"

const norm = (s?: string | null) => (s ?? '').toString().toUpperCase().trim() || '—'

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null
  const d = new Date(String(iso))
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(String(iso))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ── Reg plate (matches the dashboard's Reg component) ──────────────────────
function Reg({ reg }: { reg: string }) {
  return (
    <span className="inline-flex items-center rounded-[4px] px-1.5 py-[3px] select-none flex-shrink-0"
      style={{ background: 'linear-gradient(180deg,#fff,#e9efe9)', border: '1px solid #07251d', fontFamily: "'DM Mono',monospace" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#07251d', letterSpacing: '0.06em', lineHeight: 1 }}>{reg || '—'}</span>
    </span>
  )
}
function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ color, background: bg }}>{text}</span>
  )
}
function datePill(label: string, iso?: string | null) {
  const d = daysUntil(iso)
  if (!iso || d === null) return <Pill text={`${label} —`} color="#47566a" bg="#eef1f4" />
  // Due soon / expired: show days alongside the date, matching the fleet table.
  if (d < 0) return <Pill text={`${label} ${fmtDate(iso)} · ${Math.abs(d)}d exp`} color="#bf1d19" bg="#fff0ee" />
  if (d === 0) return <Pill text={`${label} ${fmtDate(iso)} · today`} color="#bf1d19" bg="#fff0ee" />
  if (d <= 30) return <Pill text={`${label} ${fmtDate(iso)} · ${d}d left`} color="#a25a00" bg="#fff4e4" />
  return <Pill text={`${label} ${fmtDate(iso)}`} color="#47566a" bg="#eef1f4" />
}
function insurancePill(v: FleetVehicle) {
  return v.insuranceStatus === 'Insured'
    ? <Pill text="Insured" color="#0d6b2e" bg="#e6f4ec" />
    : <Pill text="Not insured" color="#bf1d19" bg="#fff0ee" />
}

// ── One dashboard-style vehicle row (every fleet column preserved) ─────────
function VRow({ v, onClick }: { v: FleetVehicle; onClick: () => void }) {
  const meta = [v.colour, v.size, v.contract || 'No contract'].filter(Boolean).join(' · ')
  return (
    <button type="button" onClick={onClick}
      className="w-full grid grid-cols-[auto_1fr_auto] gap-3 items-center py-2.5 border-b border-[#eef2ee] dark:border-gray-700/60 last:border-b-0 text-left hover:bg-[#f6faf6] dark:hover:bg-gray-700/40 rounded-lg px-2 transition-colors">
      <Reg reg={v.registration} />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#07251d] dark:text-gray-100 truncate">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</div>
        <div className="text-[11px] text-[#6f8177] dark:text-gray-400 truncate">{meta}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {insurancePill(v)}
        <div className="flex gap-1">{datePill('MOT', v.motExpiry)}{datePill('Tax', v.taxExpiry)}</div>
      </div>
    </button>
  )
}

const CAP = 200 // safety cap on rendered rows

export function FleetSizeOverview({ vehicles, onViewVehicle, forceOpen = false }: Props) {
  const [activeSize, setActiveSize] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const total = vehicles.length

  // group by normalised size, sorted by count desc, tail → "Other"
  const groups = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of vehicles) m.set(norm(v.size), (m.get(norm(v.size)) || 0) + 1)
    const arr = Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    if (arr.length > MAX_SLICES + 1) {
      const top = arr.slice(0, MAX_SLICES)
      const other = arr.slice(MAX_SLICES).reduce((s, x) => s + x.count, 0)
      top.push({ name: 'Other', count: other })
      return top
    }
    return arr
  }, [vehicles])

  const colorOf = (name: string) => {
    const i = groups.findIndex(g => g.name === name)
    return SIZE_COLORS[(i < 0 ? 0 : i) % SIZE_COLORS.length]
  }

  // reveal automatically while a search is active
  useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])
  // drop a stale size selection if the data no longer contains it
  useEffect(() => { if (activeSize && !groups.some(g => g.name === activeSize)) setActiveSize(null) }, [groups, activeSize])

  const namedSizes = useMemo(() => new Set(groups.filter(g => g.name !== 'Other').map(g => g.name)), [groups])

  const listVehicles = useMemo(() => {
    if (!activeSize) return vehicles
    if (activeSize === 'Other') return vehicles.filter(v => !namedSizes.has(norm(v.size)))
    return vehicles.filter(v => norm(v.size) === activeSize)
  }, [vehicles, activeSize, namedSizes])

  const centerCount = activeSize ? listVehicles.length : total
  const centerLabel = activeSize || 'Total'

  // donut geometry (stroke-dasharray segments on concentric circles)
  const R = 80, CX = 100, CY = 100, C = 2 * Math.PI * R
  let acc = 0
  const segs = groups.map(g => {
    const len = total ? (C * g.count) / total : 0
    const seg = { name: g.name, len, off: -acc, color: colorOf(g.name) }
    acc += len
    return seg
  })

  const pick = (name: string) => setActiveSize(prev => (prev === name ? null : name))
  const toggleList = () => setOpen(o => !o)

  if (total === 0) return null

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-[#dfe8e1] dark:border-gray-700 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black tracking-tight text-[#07251d] dark:text-white">Fleet by size</h2>
        {activeSize && (
          <button type="button" onClick={() => setActiveSize(null)} className="text-[12px] font-extrabold text-[#285b44] dark:text-[#8fcc16]">Clear size ✕</button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 items-center">
        {/* donut */}
        <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
          <svg viewBox="0 0 200 200" width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
            {segs.map(s => (
              <circle key={s.name} cx={CX} cy={CY} r={R} fill="none" stroke={s.color}
                strokeWidth={activeSize === s.name ? 34 : 28}
                strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={s.off}
                style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
                onClick={() => pick(s.name)} />
            ))}
          </svg>
          {/* clickable centre = reveal / hide the list */}
          <button type="button" onClick={toggleList} title="Tap to view vehicles"
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full hover:scale-105 transition-transform">
            <div className="text-3xl font-black leading-none text-[#07251d] dark:text-white">{centerCount}</div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#6f8177] dark:text-gray-400 mt-0.5">{centerLabel}</div>
            <div className="flex items-center gap-0.5 text-[10px] font-bold text-[#0d6b2e] dark:text-[#8fcc16] mt-1">
              <span>{open ? 'Tap to hide' : 'Tap to view'}</span>
              <ChevronDown className="w-3 h-3" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </div>
          </button>
        </div>

        {/* legend / size list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {groups.map(g => {
            const pct = total ? Math.round((g.count / total) * 100) : 0
            const isActive = activeSize === g.name
            return (
              <button key={g.name} type="button" onClick={() => pick(g.name)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ring-2 ${isActive ? 'ring-[#0d6b2e] bg-[#f0f7f0] dark:bg-gray-700/40' : 'ring-transparent hover:bg-[#f0f7f0] dark:hover:bg-gray-700/40'}`}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(g.name) }} />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-bold text-[#07251d] dark:text-gray-100">{g.name}</span>
                  <span className="block h-1.5 rounded-full mt-1" style={{ background: colorOf(g.name), width: `${pct}%`, minWidth: 6, opacity: 0.35 }} />
                </span>
                <span className="text-right">
                  <span className="text-sm font-black tabular-nums text-[#07251d] dark:text-white">{g.count}</span>
                  <span className="block text-[10px] text-[#6f8177] dark:text-gray-400">{pct}%</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* revealed vehicle list — dashboard drill-in style */}
      {open && (
        <div className="mt-4 pt-4 border-t border-[#eef2ee] dark:border-gray-700">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs sm:text-sm text-[#6f8177] dark:text-gray-400">
              Showing {Math.min(listVehicles.length, CAP)}{listVehicles.length > CAP ? ` of ${listVehicles.length}` : ''}
              {activeSize ? ` · ${activeSize}` : ' vehicles'}
            </span>
          </div>
          {listVehicles.length === 0 ? (
            <p className="text-sm text-[#6f8177] dark:text-gray-400 py-8 text-center">No vehicles match.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
              {listVehicles.slice(0, CAP).map(v => <VRow key={v.id} v={v} onClick={() => onViewVehicle(v)} />)}
            </div>
          )}
          {listVehicles.length > CAP && (
            <p className="text-[11px] text-[#9bafa5] mt-2 text-center">Showing first {CAP}. Narrow with search or pick a size.</p>
          )}
        </div>
      )}
    </section>
  )
}
