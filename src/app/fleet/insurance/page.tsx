// src/app/fleet/insurance/page.tsx
// Standalone Insurance Status page: at-a-glance counts per policy, the
// uninsured list, the "not insured & not in branch" list, a searchable vehicle
// table you can filter by clicking a policy, and the full change history.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { Shield, ShieldOff, ShieldAlert, ArrowLeft, RefreshCw, Search, History, Car, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { insuranceLogService, type InsuranceChange } from '@/lib/services/insuranceLogService'

const normReg = (r?: string | null) => (r || '').toUpperCase().replace(/\s+/g, '')
const euDate = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
const policyBadge = (status?: string | null, policy?: string | null) =>
  status === 'Insured' ? (policy || 'Insured') : 'Not Insured'

interface Veh {
  id: string; registration: string; make?: string | null; model?: string | null
  size?: string | null; insuranceStatus?: string | null; insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
}

type Sel = 'all' | 'not-insured' | 'not-branch' | string // 'policy:<name>'

export default function InsuranceStatusPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [vehicles, setVehicles] = useState<Veh[]>([])
  const [inBranch, setInBranch] = useState<Set<string>>(new Set())
  const [settingsPolicies, setSettingsPolicies] = useState<string[]>([])
  const [log, setLog] = useState<InsuranceChange[]>([])
  const [sel, setSel] = useState<Sel>('all')
  const [q, setQ] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [histQ, setHistQ] = useState('')

  const load = async () => {
    if (!user?.uid) return
    const profile = await userProfileService.getProfile(user.uid)
    const org = profile?.organizationId
    if (!org) { setLoading(false); return }
    const [{ data: vs }, { data: yard }, { data: settings }, changes] = await Promise.all([
      supabase.from('vehicles')
        .select('id, registration, make, model, size, insurance_status, insurance_policy_name, insurance_policy_expiry')
        .eq('organization_id', org).eq('is_defleeted', false),
      supabase.from('checked_in_vehicles')
        .select('vehicle_id, registration, hire_status')
        .eq('organization_id', org).eq('hire_status', 'In Yard'),
      supabase.from('organization_settings').select('insurance_policies').eq('organization_id', org).maybeSingle(),
      insuranceLogService.getRecent(org, 500),
    ])
    // Policy list comes from settings — so any policy you add (e.g. "Own
    // Insurance Policy") is picked up automatically, nothing hardcoded.
    setSettingsPolicies(((settings?.insurance_policies as any[]) || []).map((p: any) => (p?.name || '').trim()).filter(Boolean))
    const keys = new Set<string>()
    for (const y of yard ?? []) { if (y.vehicle_id) keys.add('id:' + y.vehicle_id); keys.add('reg:' + normReg(y.registration)) }
    setInBranch(keys)
    setVehicles((vs ?? []).map((v: any) => ({
      id: v.id, registration: v.registration, make: v.make, model: v.model, size: v.size,
      insuranceStatus: v.insurance_status, insurancePolicyName: v.insurance_policy_name, insurancePolicyExpiry: v.insurance_policy_expiry,
    })))
    setLog(changes)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.uid])
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const isInBranch = (v: Veh) => inBranch.has('id:' + v.id) || inBranch.has('reg:' + normReg(v.registration))

  const { policyCounts, noPolicyCount, insuredTotal, uninsured, notBranch } = useMemo(() => {
    const counts: Record<string, number> = {}
    let insuredTotal = 0, uninsured = 0, notBranch = 0, noPolicyCount = 0
    for (const v of vehicles) {
      if (v.insuranceStatus === 'Insured') {
        insuredTotal++
        const n = (v.insurancePolicyName || '').trim()
        if (!n) noPolicyCount++
        else counts[n] = (counts[n] || 0) + 1
      } else { uninsured++; if (!isInBranch(v)) notBranch++ }
    }
    // Every policy from settings shows as a chip (count 0 if unused yet), plus
    // any policy name found on a vehicle that isn't in settings.
    const allNames = new Set<string>([...settingsPolicies, ...Object.keys(counts)])
    const policyCounts = [...allNames].map(n => [n, counts[n] || 0] as [string, number]).sort((a, b) => b[1] - a[1])
    return { policyCounts, noPolicyCount, insuredTotal, uninsured, notBranch }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, inBranch, settingsPolicies])

  const filtered = useMemo(() => {
    let list = vehicles
    if (sel === 'not-insured') list = list.filter(v => v.insuranceStatus !== 'Insured')
    else if (sel === 'not-branch') list = list.filter(v => v.insuranceStatus !== 'Insured' && !isInBranch(v))
    else if (sel === 'no-policy') list = list.filter(v => v.insuranceStatus === 'Insured' && !(v.insurancePolicyName || '').trim())
    else if (sel.startsWith('policy:')) { const w = sel.slice(7); list = list.filter(v => v.insuranceStatus === 'Insured' && (v.insurancePolicyName || '') === w) }
    const term = normReg(q)
    if (term) list = list.filter(v => (normReg(v.registration) + normReg(v.make) + normReg(v.model)).includes(term))
    return [...list].sort((a, b) => a.registration.localeCompare(b.registration))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, sel, q, inBranch])

  // Change history is search-driven: type a registration to get a TIMELINE of
  // that vehicle's insurance periods. Each logged change starts a new period
  // that runs until the next change (or "Present"). Grouped by registration.
  const histGroups = useMemo(() => {
    const term = normReg(histQ)
    if (!term) return []
    const byReg: Record<string, InsuranceChange[]> = {}
    for (const c of log) {
      if (!normReg(c.registration).includes(term)) continue
      const k = normReg(c.registration);(byReg[k] ||= []).push(c)
    }
    return Object.values(byReg).map(evs => {
      const asc = [...evs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      const periods = asc.map((e, i) => ({
        id: e.id,
        label: policyBadge(e.toStatus, e.toPolicyName),
        insured: e.toStatus === 'Insured',
        start: e.createdAt,
        end: i < asc.length - 1 ? asc[i + 1].createdAt : null, // null = Present
        by: e.changedByName,
      })).reverse() // newest period first (current "Present" on top)
      const head = asc[asc.length - 1]
      return { reg: head.registration || '—', makeModel: [head.make, head.model].filter(Boolean).join(' '), periods }
    })
  }, [log, histQ])

  const StatCard = ({ icon, label, value, tone, value2 }: { icon: React.ReactNode; label: string; value: number; tone: string; value2?: string }) => (
    <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: tone }}>{icon}{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums text-[#012619] dark:text-white">{value}</div>
      {value2 && <div className="text-[11px] text-[#72A68E]">{value2}</div>}
    </div>
  )

  const chip = (label: string, count: number, value: Sel, tone: 'policy' | 'red' | 'amber') => {
    const active = sel === value
    const cls = tone === 'red'
      ? (active ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40')
      : tone === 'amber'
      ? (active ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40')
      : (active ? 'bg-[#025940] text-white border-[#025940]' : 'bg-white dark:bg-gray-800 text-[#012619] dark:text-gray-200 border-[#e2e8e5] dark:border-gray-700')
    return (
      <button key={value} type="button" onClick={() => setSel(active ? 'all' : value)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors hover:shadow-sm ${cls}`}>
        {tone === 'policy' ? <Shield className="w-3.5 h-3.5" /> : tone === 'amber' ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
        <span className="truncate max-w-[240px]">{label}</span>
        <span className="ml-0.5 tabular-nums font-bold">{count}</span>
      </button>
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
              <Shield className="w-5 h-5 text-[#025940] dark:text-[#b3f243]" />
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#012619] dark:text-white">Insurance Status</h1>
            </div>
            <button onClick={refresh} className="ml-auto p-2 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940]" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-[#72A68E]">Loading insurance status…</div>
          ) : (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={<Shield className="w-3.5 h-3.5" />} label="Insured" value={insuredTotal} tone="#025940" value2={`${policyCounts.length} policies`} />
                <StatCard icon={<ShieldOff className="w-3.5 h-3.5" />} label="Not Insured" value={uninsured} tone="#dc2626" />
                <StatCard icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Not insured & not in branch" value={notBranch} tone="#d97706" value2="out on hire / not checked in" />
              </div>

              {/* Policy chips */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#72A68E] mb-2">Filter by policy</p>
                <div className="flex flex-wrap gap-2">
                  {policyCounts.map(([name, count]) => chip(name, count, `policy:${name}`, 'policy'))}
                  {noPolicyCount > 0 && chip('Insured — no policy set', noPolicyCount, 'no-policy', 'amber')}
                  {chip('Not Insured', uninsured, 'not-insured', 'red')}
                  {chip('Not insured & not in branch', notBranch, 'not-branch', 'amber')}
                </div>
              </div>

              {/* Vehicle list */}
              <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#eef2f0] dark:border-gray-700">
                  <Car className="w-4 h-4 text-[#025940]" />
                  <span className="text-sm font-bold text-[#012619] dark:text-white">
                    {sel === 'all' ? 'All active vehicles' : sel === 'not-insured' ? 'Not insured' : sel === 'not-branch' ? 'Not insured & not in branch' : sel.slice(7)}
                  </span>
                  <span className="text-xs text-[#72A68E]">{filtered.length}</span>
                  <div className="relative ml-auto w-44 sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#72A68E]" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reg / make…"
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e2e8e5] dark:border-gray-700 bg-[#f7faf8] dark:bg-gray-900 text-sm text-[#012619] dark:text-white" />
                  </div>
                </div>
                <div className="max-h-[460px] overflow-y-auto divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No vehicles.</p>
                  ) : filtered.map(v => {
                    const insured = v.insuranceStatus === 'Insured'
                    const branch = isInBranch(v)
                    return (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="font-mono font-bold text-sm text-[#012619] dark:text-white w-28 flex-shrink-0">{v.registration}</span>
                        <span className="text-xs text-[#4a5e54] dark:text-gray-300 flex-1 min-w-0 truncate">{[v.make, v.model].filter(Boolean).join(' ')}</span>
                        {!insured && !branch && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex-shrink-0">not in branch</span>
                        )}
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${insured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                          {insured ? (v.insurancePolicyName || 'Insured') : 'Not Insured'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Change history — collapsed; search a registration to see just
                  that vehicle's insurance movements. */}
              <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setHistOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#f7faf8] dark:hover:bg-gray-700/40 transition-colors"
                >
                  <History className="w-4 h-4 text-[#025940]" />
                  <span className="text-sm font-bold text-[#012619] dark:text-white">Change history</span>
                  <span className="text-xs text-[#72A68E]">search a registration</span>
                  <ChevronRight className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${histOpen ? 'rotate-90' : ''}`} />
                </button>

                {histOpen && (
                  <div className="px-4 pb-4">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#72A68E]" />
                      <input
                        value={histQ}
                        onChange={e => setHistQ(e.target.value)}
                        autoFocus
                        placeholder="Registration… e.g. HK72XPA"
                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#e2e8e5] dark:border-gray-700 bg-[#f7faf8] dark:bg-gray-900 text-sm text-[#012619] dark:text-white"
                      />
                    </div>

                    {!histQ.trim() ? (
                      <p className="text-xs text-gray-400 text-center py-6">Type a registration above to see its insurance history.</p>
                    ) : histGroups.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">No insurance changes recorded for “{histQ.trim().toUpperCase()}”.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {histGroups.map(g => (
                          <div key={g.reg} className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
                            <div className="px-3 py-2 bg-[#f7faf8] dark:bg-gray-900/40 border-b border-[#eef2f0] dark:border-gray-700">
                              <span className="font-mono font-bold text-sm text-[#012619] dark:text-white">{g.reg}</span>
                              {g.makeModel && <span className="text-[11px] text-[#72A68E] ml-2">{g.makeModel}</span>}
                            </div>
                            <div className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                              {g.periods.map(p => (
                                <div key={p.id} className="px-3 py-2 flex items-center gap-2 flex-wrap text-xs">
                                  <span className={`px-2 py-0.5 rounded font-semibold flex-shrink-0 ${p.insured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{p.label}</span>
                                  <span className="text-[#4a5e54] dark:text-gray-300 font-medium tabular-nums">
                                    {euDate(p.start)} – {p.end ? euDate(p.end) : <span className="text-[#025940] dark:text-[#b3f243] font-bold">Present</span>}
                                  </span>
                                  {p.by && <span className="text-gray-400">· changed by {p.by} on {euDate(p.start)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
