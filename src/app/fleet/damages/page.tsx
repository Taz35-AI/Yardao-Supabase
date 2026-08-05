// src/app/fleet/damages/page.tsx
// Damages overview: every vehicle carrying at least one damage pin, grouped by
// the branch it's checked into (vehicles not in any branch get their own group).
// Click a vehicle → its diagram with the pins (read-only DamageMapView, same
// component as the detail modals, including the tap-a-pin photo preview).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { AlertTriangle, ArrowLeft, RefreshCw, Search, X, MapPin, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { DamageMapView } from '@/components/common/DamageMapper/DamageMapView'
import type { DamagePin } from '@/components/common/DamageMapper/DamageMapper'

const normReg = (r?: string | null) => (r || '').toUpperCase().replace(/\s+/g, '')
const euDate = (iso?: string | null) => {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10).split('-')
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : '—'
}
const isPast = (iso?: string | null) => !!iso && String(iso).slice(0, 10) < new Date().toISOString().slice(0, 10)

interface DamagedVehicle {
  key: string
  registration: string
  make?: string | null
  model?: string | null
  contract?: string | null
  contractColor?: string | null
  diagramType?: string | null
  motExpiry?: string | null
  taxExpiry?: string | null
  pins: DamagePin[]
  branchKey: string      // branch id/slug, or '' when not in any branch
  hireStatus?: string | null
}

const SEV_ORDER = { severe: 0, moderate: 1, minor: 2 } as const
const sevCounts = (pins: DamagePin[]) => ({
  severe: pins.filter(p => p.severity === 'severe').length,
  moderate: pins.filter(p => p.severity === 'moderate').length,
  minor: pins.filter(p => p.severity === 'minor').length,
})
const worstSev = (pins: DamagePin[]): keyof typeof SEV_ORDER =>
  pins.some(p => p.severity === 'severe') ? 'severe' : pins.some(p => p.severity === 'moderate') ? 'moderate' : 'minor'

export default function DamagesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [vehicles, setVehicles] = useState<DamagedVehicle[]>([])
  const [branchNames, setBranchNames] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [viewing, setViewing] = useState<DamagedVehicle | null>(null)

  const load = async () => {
    if (!user?.uid) return
    const profile = await userProfileService.getProfile(user.uid)
    const org = profile?.organizationId
    if (!org) { setLoading(false); return }

    const [{ data: fleet }, { data: yard }, { data: branches }] = await Promise.all([
      supabase.from('vehicles')
        .select('id, registration, make, model, contract, contract_color, vehicle_diagram_type, damage_pins, mot_expiry, tax_expiry')
        .eq('organization_id', org).eq('is_defleeted', false),
      supabase.from('checked_in_vehicles')
        .select('vehicle_id, registration, make, model, contract, contract_color, vehicle_diagram_type, damage_pins, branch_id, hire_status, mot_expiry, tax_expiry')
        .eq('organization_id', org),
      supabase.from('branches').select('id, name, slug').eq('organization_id', org),
    ])

    const names: Record<string, string> = {}
    for (const b of branches ?? []) { names[(b as any).id] = (b as any).name; if ((b as any).slug) names[(b as any).slug] = (b as any).name }
    setBranchNames(names)

    // Yard rows give us branch presence; a vehicle in the yard uses the yard
    // copy of its pins (kept in sync with fleet, and freshest on check-in).
    const yardByKey = new Map<string, any>()
    for (const y of yard ?? []) {
      const yy = y as any
      if (yy.vehicle_id) yardByKey.set('id:' + yy.vehicle_id, yy)
      yardByKey.set('reg:' + normReg(yy.registration), yy)
    }

    const out: DamagedVehicle[] = []
    const seenYard = new Set<any>()
    for (const v of fleet ?? []) {
      const vv = v as any
      const y = yardByKey.get('id:' + vv.id) || yardByKey.get('reg:' + normReg(vv.registration))
      if (y) seenYard.add(y)
      const pins: DamagePin[] = (y?.damage_pins?.length ? y.damage_pins : vv.damage_pins) || []
      if (pins.length === 0) continue
      out.push({
        key: vv.id,
        registration: vv.registration,
        make: y?.make ?? vv.make, model: y?.model ?? vv.model,
        contract: y?.contract ?? vv.contract, contractColor: y?.contract_color ?? vv.contract_color,
        diagramType: y?.vehicle_diagram_type ?? vv.vehicle_diagram_type,
        motExpiry: vv.mot_expiry ?? y?.mot_expiry, taxExpiry: vv.tax_expiry ?? y?.tax_expiry,
        pins,
        branchKey: y && y.hire_status !== 'Out on Hire' ? String(y.branch_id || '') : '',
        hireStatus: y?.hire_status ?? null,
      })
    }
    // Yard-only vehicles (no fleet record — visitors etc.) with pins
    for (const y of yard ?? []) {
      const yy = y as any
      if (seenYard.has(yy)) continue
      const pins: DamagePin[] = yy.damage_pins || []
      if (pins.length === 0) continue
      out.push({
        key: 'yard:' + normReg(yy.registration),
        registration: yy.registration, make: yy.make, model: yy.model,
        contract: yy.contract, contractColor: yy.contract_color,
        diagramType: yy.vehicle_diagram_type,
        motExpiry: yy.mot_expiry, taxExpiry: yy.tax_expiry,
        pins,
        branchKey: yy.hire_status !== 'Out on Hire' ? String(yy.branch_id || '') : '',
        hireStatus: yy.hire_status ?? null,
      })
    }
    setVehicles(out)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.uid])
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const filtered = useMemo(() => {
    const term = normReg(q)
    if (!term) return vehicles
    return vehicles.filter(v => (normReg(v.registration) + normReg(v.make) + normReg(v.model) + normReg(v.contract)).includes(term))
  }, [vehicles, q])

  // Group by branch, severe-first inside each group.
  const groups = useMemo(() => {
    const byBranch = new Map<string, DamagedVehicle[]>()
    for (const v of filtered) {
      const k = v.branchKey || '__none__'
      if (!byBranch.has(k)) byBranch.set(k, [])
      byBranch.get(k)!.push(v)
    }
    const sortVehicles = (a: DamagedVehicle, b: DamagedVehicle) =>
      SEV_ORDER[worstSev(a.pins)] - SEV_ORDER[worstSev(b.pins)] || b.pins.length - a.pins.length || a.registration.localeCompare(b.registration)
    const entries = [...byBranch.entries()].map(([k, list]) => ({
      key: k,
      name: k === '__none__' ? 'Not in a branch (on hire / not checked in)' : (branchNames[k] || k),
      list: [...list].sort(sortVehicles),
    }))
    // Named branches first (alphabetical), the "not in a branch" bucket last.
    return entries.sort((a, b) => (a.key === '__none__' ? 1 : b.key === '__none__' ? -1 : a.name.localeCompare(b.name)))
  }, [filtered, branchNames])

  const totals = useMemo(() => {
    const pins = vehicles.reduce((s, v) => s + v.pins.length, 0)
    const severe = vehicles.filter(v => v.pins.some(p => p.severity === 'severe')).length
    return { vehicles: vehicles.length, pins, severe }
  }, [vehicles])

  const SevChips = ({ pins }: { pins: DamagePin[] }) => {
    const c = sevCounts(pins)
    return (
      <span className="inline-flex items-center gap-1 flex-shrink-0">
        {c.severe > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">{c.severe} severe</span>}
        {c.moderate > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">{c.moderate} moderate</span>}
        {c.minor > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{c.minor} minor</span>}
      </span>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#edf1ee] dark:bg-gray-900">
        <Navigation />
        <div className="w-full px-2 sm:px-4 lg:px-6 py-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => router.push('/fleet')} className="p-2 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940]" title="Back to Fleet">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#012619] dark:text-white">Damages</h1>
            </div>
            <button onClick={refresh} className="ml-auto p-2 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940]" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-[#72A68E]">Loading damages…</div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Damaged vehicles', value: totals.vehicles, tone: '#025940' },
                  { label: 'Damage pins', value: totals.pins, tone: '#d97706' },
                  { label: 'With severe damage', value: totals.severe, tone: '#dc2626' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: s.tone }}>{s.label}</div>
                    <div className="mt-1 text-3xl font-extrabold tabular-nums text-[#012619] dark:text-white">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reg / make / contract…"
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-[#012619] dark:text-white placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none" />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9db0a6] hover:text-[#025940]"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>

              {/* Branch groups */}
              {groups.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No vehicles with damage pins{q ? ' matching your search' : ''} 🎉</p>
              ) : groups.map(g => (
                <div key={g.key} className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-[#f7faf8] dark:bg-gray-900/40 border-b border-[#eef2f0] dark:border-gray-700">
                    <Building2 className="w-4 h-4 text-[#025940]" />
                    <span className="text-sm font-bold text-[#012619] dark:text-white">{g.name}</span>
                    <span className="text-xs text-[#72A68E]">{g.list.length} vehicle{g.list.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#f0f4f2] dark:bg-gray-900/60">
                          {['Reg', 'Make', 'Model', 'MOT', 'Road Tax', 'Contract', 'Damages'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#4a5e54] dark:text-gray-300 border border-[#e2e8e5] dark:border-gray-700 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.list.map(v => (
                          <tr key={v.key} onClick={() => setViewing(v)}
                            className="cursor-pointer hover:bg-[#f7faf8] dark:hover:bg-gray-700/40 transition-colors">
                            <td className="px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                <span className="font-mono font-bold text-[#012619] dark:text-white">{v.registration}</span>
                                {v.hireStatus === 'Out on Hire' && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">on hire</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 text-[#4a5e54] dark:text-gray-300 whitespace-nowrap">{v.make || '—'}</td>
                            <td className="px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 text-[#4a5e54] dark:text-gray-300">{v.model || '—'}</td>
                            <td className={`px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 tabular-nums whitespace-nowrap ${isPast(v.motExpiry) ? 'text-red-600 font-bold' : 'text-[#4a5e54] dark:text-gray-300'}`}>{euDate(v.motExpiry)}</td>
                            <td className={`px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 tabular-nums whitespace-nowrap ${isPast(v.taxExpiry) ? 'text-red-600 font-bold' : 'text-[#4a5e54] dark:text-gray-300'}`}>{euDate(v.taxExpiry)}</td>
                            <td className="px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 whitespace-nowrap">
                              {v.contract ? (
                                <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border max-w-[140px]"
                                  style={{ backgroundColor: v.contractColor ? `${v.contractColor}15` : '#f0f4f2', borderColor: v.contractColor ? `${v.contractColor}40` : '#d8d6cd', color: v.contractColor || '#4a5e54' }}>
                                  <span className="truncate">{v.contract}</span>
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 whitespace-nowrap"><SevChips pins={v.pins} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Diagram modal — read-only mapper with pins + photo preview */}
        {viewing && (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={() => setViewing(null)}>
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-[#012619] text-white rounded-t-2xl z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold">{viewing.registration}</span>
                  <span className="text-xs text-[#72A68E] truncate">{[viewing.make, viewing.model].filter(Boolean).join(' ')}</span>
                </div>
                <button type="button" onClick={() => setViewing(null)} className="p-1.5 rounded-full hover:bg-white/10 flex-shrink-0" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <DamageMapView diagramType={viewing.diagramType} pins={viewing.pins} readOnly />
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
