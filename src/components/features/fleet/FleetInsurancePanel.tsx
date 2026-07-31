// src/components/features/fleet/FleetInsurancePanel.tsx
// "Insurance Status" section on the Fleet page: at-a-glance counts per policy
// (click a chip to filter the fleet to it), the uninsured count, and a recent
// insurance-change log (reg, make/model, from → to policy, date, who).

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Shield, ShieldOff, ChevronDown, ChevronUp, History, RefreshCw } from 'lucide-react'
import { insuranceLogService, type InsuranceChange } from '@/lib/services/insuranceLogService'

interface VehicleLike {
  insuranceStatus?: string | null
  insurancePolicyName?: string | null
}

interface FleetInsurancePanelProps {
  vehicles: VehicleLike[]            // active (non-defleeted) fleet vehicles
  organizationId?: string | null
  activeFilter: string              // current filters.insurance value
  onSelectInsurance: (value: string) => void  // 'all' | 'not-insured' | 'policy:<name>' | 'not-insured-not-branch'
  notInBranchCount?: number         // not insured AND out on hire / not in any branch
}

const euDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const policyBadge = (status?: string | null, policy?: string | null) =>
  status === 'Insured' ? (policy || 'Insured') : 'Not Insured'

export function FleetInsurancePanel({ vehicles, organizationId, activeFilter, onSelectInsurance, notInBranchCount = 0 }: FleetInsurancePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [log, setLog] = useState<InsuranceChange[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // Counts per policy + uninsured, from the current active fleet.
  const { policyCounts, uninsured, insuredTotal } = useMemo(() => {
    const counts: Record<string, number> = {}
    let uninsured = 0, insuredTotal = 0
    for (const v of vehicles) {
      if (v.insuranceStatus === 'Insured') {
        insuredTotal++
        const name = (v.insurancePolicyName || '(no policy name)').trim()
        counts[name] = (counts[name] || 0) + 1
      } else {
        uninsured++
      }
    }
    const policyCounts = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return { policyCounts, uninsured, insuredTotal }
  }, [vehicles])

  const loadLog = async () => {
    if (!organizationId) return
    setLogLoading(true)
    setLog(await insuranceLogService.getRecent(organizationId, 100))
    setLogLoading(false)
  }
  useEffect(() => {
    if (showLog && organizationId && log.length === 0) void loadLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLog, organizationId])

  const chip = (label: string, count: number, value: string, tone: 'policy' | 'uninsured' | 'alert') => {
    const active = activeFilter === value
    const base = tone === 'uninsured'
      ? (active ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40')
      : tone === 'alert'
      ? (active ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40')
      : (active ? 'bg-[#025940] text-white border-[#025940]' : 'bg-white dark:bg-gray-800 text-[#012619] dark:text-gray-200 border-[#e2e8e5] dark:border-gray-700')
    return (
      <button
        key={value}
        type="button"
        onClick={() => onSelectInsurance(active ? 'all' : value)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors hover:shadow-sm ${base}`}
        title={active ? 'Clear filter' : `Show only ${label}`}
      >
        {tone === 'policy' ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
        <span className="truncate max-w-[240px]">{label}</span>
        <span className={`ml-0.5 tabular-nums font-bold ${active ? '' : tone === 'uninsured' ? 'text-red-700 dark:text-red-300' : tone === 'alert' ? 'text-amber-800 dark:text-amber-300' : 'text-[#025940] dark:text-[#b3f243]'}`}>{count}</span>
      </button>
    )
  }

  return (
    <div className="mb-3 rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-gradient-to-br from-white to-[#025940]/[0.04] dark:from-gray-800 dark:to-[#025940]/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f7faf8] dark:hover:bg-gray-700/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#025940] dark:text-[#b3f243]" />
          <span className="text-sm font-bold text-[#012619] dark:text-white">Insurance Status</span>
          <span className="text-xs text-[#72A68E]">
            {insuredTotal} insured · <span className={uninsured > 0 ? 'text-red-600 font-semibold' : ''}>{uninsured} not insured</span>
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Policy chips */}
          <div className="flex flex-wrap gap-2">
            {policyCounts.map(([name, count]) => chip(name, count, `policy:${name}`, 'policy'))}
            {chip('Not Insured', uninsured, 'not-insured', 'uninsured')}
            {chip('Not insured & not in branch', notInBranchCount, 'not-insured-not-branch', 'alert')}
          </div>

          {/* Change log toggle */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLog(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#025940] dark:text-[#b3f243] hover:underline"
            >
              <History className="w-3.5 h-3.5" />
              {showLog ? 'Hide change history' : 'Show change history'}
            </button>
            {showLog && (
              <button type="button" onClick={loadLog} title="Refresh" className="text-[#72A68E] hover:text-[#025940]">
                <RefreshCw className={`w-3.5 h-3.5 ${logLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {showLog && (
            <div className="mt-2 rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
              {logLoading ? (
                <p className="text-xs text-[#72A68E] text-center py-4">Loading…</p>
              ) : log.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No insurance changes recorded yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                  {log.map(c => (
                    <div key={c.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#012619] dark:text-white">{c.registration || '—'}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{euDateTime(c.createdAt)}</span>
                      </div>
                      <div className="text-[11px] text-[#4a5e54] dark:text-gray-300 mt-0.5">
                        {[c.make, c.model].filter(Boolean).join(' ')}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{policyBadge(c.fromStatus, c.fromPolicyName) || '—'}</span>
                        <span className="text-gray-400">→</span>
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${c.toStatus === 'Insured' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{policyBadge(c.toStatus, c.toPolicyName)}</span>
                        {c.changedByName && <span className="text-gray-400">· {c.changedByName}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FleetInsurancePanel
