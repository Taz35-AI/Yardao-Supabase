// src/components/reports/HireB2BReport.tsx
// B2B Hire analytics for the Reports page: how the on-hire fleet is split across
// business customers (pie), headline KPIs, and a per-customer table showing how
// many vans each has, exactly which vans, and the weekly / 4-weekly run-rate.
// Read-only + defensive (missing hire tables → nothing renders). Gated by
// useHireAccess so only the owner / chosen admins see hire revenue.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Building2, KeyRound, Wallet, Loader2, ChevronDown } from 'lucide-react'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { useHireAccess } from '@/hooks/useHireAccess'

interface Van { reg: string; makeModel: string }
interface CustomerRow {
  id: string
  name: string
  isBusiness: boolean
  vans: Van[]
  weekly: number
  monthly: number
}

// Brand-led palette that cycles for the pie slices.
const SLICE_COLORS = ['#025940', '#72A68E', '#b3f243', '#012619', '#9fd93a', '#C5D9D0', '#4a5e54', '#3d6b1f']

export function HireB2BReport({ organizationId }: { organizationId: string }) {
  const access = useHireAccess()
  const [rows, setRows] = useState<CustomerRow[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId || !access.allowed) return
    let cancelled = false
    ;(async () => {
      try {
        const [agreements, customers] = await Promise.all([
          hireAgreementService.getAgreements(organizationId),
          hireCustomerService.getCustomers(organizationId),
        ])
        const custById = new Map(customers.map((c) => [c.id, c]))
        const map = new Map<string, CustomerRow>()
        for (const ag of agreements) {
          const lines = await hireAgreementService.getLines(organizationId, ag.id)
          const active = lines.filter((l) => l.status === 'active')
          if (active.length === 0) continue
          const cid = ag.customerId || `ag-${ag.id}`
          const cust = cid ? custById.get(cid) : undefined
          const row =
            map.get(cid) ??
            {
              id: cid,
              name: cust?.companyName || cust?.name || ag.customerName || '—',
              isBusiness: cust?.isBusiness ?? true,
              vans: [],
              weekly: 0,
              monthly: 0,
            }
          for (const l of active) {
            row.vans.push({
              reg: l.registration || '—',
              makeModel: [l.make, l.model].filter(Boolean).join(' '),
            })
            const amt = l.lineRateAmount ?? ag.rateAmount ?? 0
            const type = l.lineRateType || ag.rateType || 'weekly'
            if (type === 'weekly') row.weekly += amt
            else row.monthly += amt
          }
          map.set(cid, row)
        }
        const list = Array.from(map.values())
          .filter((r) => r.isBusiness && r.vans.length > 0)
          .sort((a, b) => b.vans.length - a.vans.length)
        if (!cancelled) setRows(list)
      } catch {
        if (!cancelled) setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, access.allowed])

  const totals = useMemo(() => {
    const r = rows ?? []
    return {
      customers: r.length,
      vans: r.reduce((s, x) => s + x.vans.length, 0),
      weekly: r.reduce((s, x) => s + x.weekly, 0),
      monthly: r.reduce((s, x) => s + x.monthly, 0),
    }
  }, [rows])

  // Pie: vans per customer, top 6 + "Others" so the chart stays readable.
  const pieData = useMemo(() => {
    const r = rows ?? []
    const top = r.slice(0, 6).map((x) => ({ name: x.name, value: x.vans.length }))
    const rest = r.slice(6).reduce((s, x) => s + x.vans.length, 0)
    if (rest > 0) top.push({ name: 'Others', value: rest })
    return top
  }, [rows])

  // Hidden entirely for users without hire access, and while it resolves.
  if (access.loading || !access.allowed) return null

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[#b3f243]/15 border border-[#b3f243]/30">
          <Building2 className="w-5 h-5 text-[#b3f243]" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white leading-tight">B2B Hire</h2>
          <p className="text-[11px] text-[#72A68E]">Business customers, vans on hire &amp; run-rate</p>
        </div>
      </div>

      {rows === null ? (
        <div className="py-14 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : rows.length === 0 ? (
        <div className="py-14 text-center text-sm text-[#72A68E]">No vans currently on hire to business customers.</div>
      ) : (
        <div className="p-4 sm:p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={<Building2 className="w-4 h-4" />} tone="forest" label="B2B customers" value={String(totals.customers)} />
            <Kpi icon={<KeyRound className="w-4 h-4" />} tone="lime" label="Vans on hire" value={String(totals.vans)} />
            <Kpi icon={<Wallet className="w-4 h-4" />} tone="slate" label="Weekly run-rate" value={`£${totals.weekly.toFixed(0)}`} />
            <Kpi icon={<Wallet className="w-4 h-4" />} tone="slate" label="4-weekly run-rate" value={`£${totals.monthly.toFixed(0)}`} />
          </div>

          {/* Pie + legend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-900/40 p-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#72A68E] mb-2">Vans by customer</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any, n: any) => [`${v} van${Number(v) === 1 ? '' : 's'}`, n]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8e5', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                    <span className="truncate text-[#012619] dark:text-gray-200">{d.name}</span>
                  </span>
                  <span className="font-bold tabular-nums text-[#012619] dark:text-white flex-shrink-0">
                    {d.value} <span className="text-[#72A68E] font-normal">({totals.vans ? Math.round((d.value / totals.vans) * 100) : 0}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-customer table */}
          <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#72A68E] bg-[#f6f8f7] dark:bg-gray-900/40 border-b border-[#e2e8e5] dark:border-gray-700">
                  <th className="px-3 py-2.5 font-bold">Customer</th>
                  <th className="px-3 py-2.5 font-bold text-center">Vans</th>
                  <th className="px-3 py-2.5 font-bold">Which vans</th>
                  <th className="px-3 py-2.5 font-bold text-right">Weekly</th>
                  <th className="px-3 py-2.5 font-bold text-right">4-weekly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                {rows.map((r) => {
                  const open = expanded === r.id
                  const shown = open ? r.vans : r.vans.slice(0, 6)
                  return (
                    <tr key={r.id} className="hover:bg-[#f6f8f7] dark:hover:bg-gray-800/50 align-top">
                      <td className="px-3 py-2.5 font-semibold text-[#012619] dark:text-white">{r.name}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md text-xs font-bold bg-[#025940]/10 text-[#025940] dark:text-[#b3f243]">{r.vans.length}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {shown.map((v, i) => (
                            <span key={i} title={v.makeModel} className="inline-flex items-center px-1.5 py-0.5 rounded bg-white dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 font-mono text-[11px] font-bold text-[#012619] dark:text-white">
                              {v.reg}
                            </span>
                          ))}
                          {!open && r.vans.length > 6 && (
                            <button onClick={() => setExpanded(r.id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold text-[#025940] dark:text-[#72A68E] hover:underline">
                              +{r.vans.length - 6} more <ChevronDown className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#4a5e54] dark:text-gray-300">{r.weekly > 0 ? `£${r.weekly.toFixed(0)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#4a5e54] dark:text-gray-300">{r.monthly > 0 ? `£${r.monthly.toFixed(0)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#025940]/20 bg-[#f6f8f7] dark:bg-gray-900/40 font-bold text-[#012619] dark:text-white">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-center">{totals.vans}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#025940] dark:text-[#b3f243]">{totals.weekly > 0 ? `£${totals.weekly.toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#025940] dark:text-[#b3f243]">{totals.monthly > 0 ? `£${totals.monthly.toFixed(0)}` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'forest' | 'lime' | 'slate' }) {
  const badge =
    tone === 'forest' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-[#b3f243]'
      : tone === 'lime' ? 'bg-[#b3f243] text-[#012619]'
        : 'bg-[#012619] text-[#b3f243]'
  return (
    <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${badge}`}>{icon}</span>
        <p className="text-[10px] uppercase tracking-[0.06em] text-[#72A68E] font-bold">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-black text-[#012619] dark:text-white tabular-nums">{value}</p>
    </div>
  )
}
