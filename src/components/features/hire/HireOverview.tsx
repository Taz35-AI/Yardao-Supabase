// src/components/features/hire/HireOverview.tsx
// Hire overview: org-wide KPIs (vehicles on hire, live contracts, reserved,
// overdue, run-rate) plus a per-customer breakdown.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { KeyRound, FileText, Clock, AlertTriangle, Users, Wallet, Building2, User } from 'lucide-react'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import { StatCard, EmptyState, Pill } from './hireUi'
import type { HireAgreement, HireAgreementVehicle, RentalCustomer } from '@/types/hire'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface Row {
  customerId: string
  name: string
  isBusiness: boolean
  onHire: number
  reserved: number
  contracts: Set<string>
  weekly: number
  monthly: number
}

export function HireOverview() {
  const t = useT()
  const { organizationId, refreshKey } = useHire()
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [agreements, setAgreements] = useState<HireAgreement[]>([])
  const [customers, setCustomers] = useState<RentalCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [ls, ags, cs] = await Promise.all([
        hireAgreementService.getActiveLines(organizationId),
        hireAgreementService.getAgreements(organizationId),
        hireCustomerService.getCustomers(organizationId),
      ])
      if (cancelled) return
      setLines(ls)
      setAgreements(ags)
      setCustomers(cs)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, refreshKey])

  const data = useMemo(() => {
    const today = ymd(new Date())
    const agById = new Map(agreements.map((a) => [a.id, a]))
    const custById = new Map(customers.map((c) => [c.id, c]))
    const active = lines.filter((l) => l.status === 'active')
    const scheduled = lines.filter((l) => l.status === 'scheduled')

    const rows = new Map<string, Row>()
    const rowFor = (cid: string | null | undefined, ag?: HireAgreement): Row => {
      const key = cid || 'unknown'
      let r = rows.get(key)
      if (!r) {
        const c = cid ? custById.get(cid) : undefined
        r = {
          customerId: key,
          name: c?.companyName || c?.name || ag?.customerName || '—',
          isBusiness: c?.isBusiness ?? true,
          onHire: 0,
          reserved: 0,
          contracts: new Set(),
          weekly: 0,
          monthly: 0,
        }
        rows.set(key, r)
      }
      return r
    }

    for (const l of active) {
      const ag = l.agreementId ? agById.get(l.agreementId) : undefined
      const r = rowFor(ag?.customerId, ag)
      r.onHire++
      if (l.agreementId) r.contracts.add(l.agreementId)
      const type = l.lineRateType || ag?.rateType || 'weekly'
      const amt = l.lineRateAmount ?? ag?.rateAmount ?? 0
      if (type === 'weekly') r.weekly += amt
      else r.monthly += amt
    }
    for (const l of scheduled) {
      const ag = l.agreementId ? agById.get(l.agreementId) : undefined
      rowFor(ag?.customerId, ag).reserved++
    }

    const rowList = Array.from(rows.values()).sort((a, b) => b.onHire - a.onHire || b.reserved - a.reserved)
    const liveContracts = new Set(active.map((l) => l.agreementId).filter(Boolean)).size
    const overdue = active.filter((l) => l.scheduledEnd && l.scheduledEnd < today).length
    const b2bOnHire = rowList.filter((r) => r.isBusiness).reduce((s, r) => s + r.onHire, 0)
    const weeklyTotal = rowList.reduce((s, r) => s + r.weekly, 0)
    const monthlyTotal = rowList.reduce((s, r) => s + r.monthly, 0)

    return {
      rows: rowList,
      onHireTotal: active.length,
      b2bOnHire,
      reservedTotal: scheduled.length,
      liveContracts,
      overdue,
      customersOnHire: rowList.filter((r) => r.onHire > 0).length,
      weeklyTotal: Math.round(weeklyTotal * 100) / 100,
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      totalCustomers: customers.length,
    }
  }, [lines, agreements, customers])

  if (loading) {
    return <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatCard tone="forest" icon={<KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.ovVehiclesOnHire')} value={data.onHireTotal} />
        <StatCard tone="lime" icon={<FileText className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.ovLiveContracts')} value={data.liveContracts} />
        <StatCard tone="sky" icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.kpiReserved')} value={data.reservedTotal} />
        <StatCard tone="red" icon={<AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.kpiOverdue')} value={data.overdue} />
        <StatCard tone="slate" icon={<Users className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.ovCustomersActive')} value={`${data.customersOnHire}/${data.totalCustomers}`} />
        <StatCard tone="forest" icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.ovRunRate')} value={`£${data.weeklyTotal.toFixed(0)}${data.monthlyTotal > 0 ? ` +£${data.monthlyTotal.toFixed(0)}/4wk` : '/wk'}`} />
      </div>

      {/* Per-customer breakdown */}
      <div>
        <h3 className="text-sm font-bold text-[#012619] dark:text-white mb-2">{t('hire.ovPerCustomer')}</h3>
        {data.rows.length === 0 ? (
          <EmptyState icon={<Users className="w-7 h-7" />} title={t('hire.ovEmpty')} />
        ) : (
          <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-x-auto shadow-sm">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#72A68E] bg-[#f6f8f7] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
                  <th className="px-3 py-2.5 font-bold">{t('hire.ovColCustomer')}</th>
                  <th className="px-3 py-2.5 font-bold text-right">{t('hire.ovColOnHire')}</th>
                  <th className="px-3 py-2.5 font-bold text-right">{t('hire.kpiReserved')}</th>
                  <th className="px-3 py-2.5 font-bold text-right">{t('hire.ovColContracts')}</th>
                  <th className="px-3 py-2.5 font-bold text-right">{t('hire.weeklyTotal')}</th>
                  <th className="px-3 py-2.5 font-bold text-right">{t('hire.monthlyTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                {data.rows.map((r) => (
                  <tr key={r.customerId} className="hover:bg-[#f6f8f7] dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#012619] dark:text-white">
                        {r.isBusiness ? <Building2 className="w-3.5 h-3.5 text-[#72A68E]" /> : <User className="w-3.5 h-3.5 text-[#72A68E]" />}
                        {r.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#012619] dark:text-white">{r.onHire}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#4a5e54] dark:text-gray-300">{r.reserved || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#4a5e54] dark:text-gray-300">{r.contracts.size}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#4a5e54] dark:text-gray-300">{r.weekly > 0 ? `£${r.weekly.toFixed(0)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#4a5e54] dark:text-gray-300">{r.monthly > 0 ? `£${r.monthly.toFixed(0)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800 font-bold">
                  <td className="px-3 py-2.5 text-[#012619] dark:text-white">{t('hire.ovTotal')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#012619] dark:text-white">{data.onHireTotal}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#012619] dark:text-white">{data.reservedTotal || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#012619] dark:text-white">{data.liveContracts}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#025940] dark:text-[#b3f243]">{data.weeklyTotal > 0 ? `£${data.weeklyTotal.toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#025940] dark:text-[#b3f243]">{data.monthlyTotal > 0 ? `£${data.monthlyTotal.toFixed(0)}` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
