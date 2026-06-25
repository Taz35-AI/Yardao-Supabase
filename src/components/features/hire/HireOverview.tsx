// src/components/features/hire/HireOverview.tsx
// Hire overview: org-wide KPIs (vehicles on hire, live contracts, reserved,
// overdue, run-rate) plus a per-customer breakdown.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { KeyRound, FileText, Clock, AlertTriangle, Users, Wallet, Building2, User, ShieldAlert, RefreshCw } from 'lucide-react'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import { StatCard, EmptyState, Pill } from './hireUi'
import { euDate } from './hireFormat'
import { NewAgreementModal } from './NewAgreementModal'
import type { HireAgreement, HireAgreementVehicle, RentalCustomer } from '@/types/hire'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const EXPIRY_DAYS = 30 // "soon" window
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(toIso + 'T00:00:00').getTime() - new Date(fromIso + 'T00:00:00').getTime()) / 86_400_000)

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
  const { organizationId, refreshKey, refresh } = useHire()
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [agreements, setAgreements] = useState<HireAgreement[]>([])
  const [customers, setCustomers] = useState<RentalCustomer[]>([])
  const [insByCustomer, setInsByCustomer] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [renewTarget, setRenewTarget] = useState<HireAgreement | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [ls, ags, cs, ins] = await Promise.all([
        hireAgreementService.getActiveLines(organizationId),
        hireAgreementService.getAgreements(organizationId),
        hireCustomerService.getCustomers(organizationId),
        hireCustomerService.getFleetInsuranceByCustomer(organizationId),
      ])
      if (cancelled) return
      setLines(ls)
      setAgreements(ags)
      setCustomers(cs)
      setInsByCustomer(ins)
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
    const liveAgreementIds = new Set(active.map((l) => l.agreementId).filter(Boolean) as string[])
    const liveContracts = liveAgreementIds.size
    const overdue = active.filter((l) => l.scheduledEnd && l.scheduledEnd < today).length
    const b2bOnHire = rowList.filter((r) => r.isBusiness).reduce((s, r) => s + r.onHire, 0)
    const weeklyTotal = rowList.reduce((s, r) => s + r.weekly, 0)
    const monthlyTotal = rowList.reduce((s, r) => s + r.monthly, 0)

    // Active vehicles per agreement (for the expiring rows).
    const vehiclesByAg = new Map<string, number>()
    for (const l of active) if (l.agreementId) vehiclesByAg.set(l.agreementId, (vehiclesByAg.get(l.agreementId) || 0) + 1)

    // Soonest live-contract end per customer (for the table's Ends column).
    const endsByCustomer = new Map<string, string>()
    for (const agId of liveAgreementIds) {
      const ag = agById.get(agId)
      if (!ag?.endDate || !ag.customerId) continue
      const cur = endsByCustomer.get(ag.customerId)
      if (!cur || ag.endDate < cur) endsByCustomer.set(ag.customerId, ag.endDate)
    }

    // Contracts expiring within the window (or overdue), soonest first.
    const horizon = ymd(new Date(Date.now() + EXPIRY_DAYS * 86_400_000))
    const expiringContracts = Array.from(liveAgreementIds)
      .map((agId) => agById.get(agId))
      .filter((ag): ag is HireAgreement => !!ag && !!ag.endDate && ag.endDate <= horizon)
      .map((ag) => ({ agreement: ag, vehicles: vehiclesByAg.get(ag.id) || 0, endDate: ag.endDate as string, days: daysBetween(today, ag.endDate as string) }))
      .sort((a, b) => a.endDate.localeCompare(b.endDate))

    // Fleet insurance expiring within the window / expired / missing.
    const insuranceExpiring = customers
      .map((c) => {
        const exp = insByCustomer[c.id]
        return { customer: c, expiry: exp ?? null, days: exp ? daysBetween(today, exp) : null }
      })
      .filter((r) => r.expiry === null || (r.expiry as string) <= horizon)
      .sort((a, b) => {
        if (a.expiry === null) return b.expiry === null ? 0 : -1
        if (b.expiry === null) return 1
        return (a.expiry as string).localeCompare(b.expiry as string)
      })

    return {
      rows: rowList,
      endsByCustomer,
      expiringContracts,
      insuranceExpiring,
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
  }, [lines, agreements, customers, insByCustomer])

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

      {/* Flags: contracts + insurance expiring soon */}
      {(data.expiringContracts.length > 0 || data.insuranceExpiring.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Contracts expiring */}
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-bold text-[#012619] dark:text-white">{t('hire.ovExpiringContracts')}</h3>
              <Pill tone="amber">{data.expiringContracts.length}</Pill>
            </div>
            {data.expiringContracts.length === 0 ? (
              <p className="text-[12px] text-[#72A68E]">{t('hire.ovExpiringNone')}</p>
            ) : (
              <ul className="space-y-1.5">
                {data.expiringContracts.map(({ agreement, vehicles, endDate, days }) => (
                  <li key={agreement.id} className="flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#012619] dark:text-white truncate">{agreement.customerName || '—'}{agreement.reference ? ` · ${agreement.reference}` : ''}</p>
                      <p className="text-[11px] text-[#72A68E]">{t('hire.ends')} {euDate(endDate)} · {t('hire.ovVehiclesN', { n: vehicles })}</p>
                    </div>
                    <Pill tone={days < 0 ? 'red' : 'amber'}>{days < 0 ? t('hire.ovOverdueByN', { n: Math.abs(days) }) : t('hire.ovDaysLeftN', { n: days })}</Pill>
                    <button onClick={() => setRenewTarget(agreement)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] hover:shadow-sm flex-shrink-0">
                      <RefreshCw className="w-3 h-3" /> {t('hire.renew')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fleet insurance expiring */}
          <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/15 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
              <h3 className="text-sm font-bold text-[#012619] dark:text-white">{t('hire.ovInsuranceExpiring')}</h3>
              <Pill tone="red">{data.insuranceExpiring.length}</Pill>
            </div>
            {data.insuranceExpiring.length === 0 ? (
              <p className="text-[12px] text-[#72A68E]">{t('hire.ovInsuranceNone')}</p>
            ) : (
              <ul className="space-y-1.5">
                {data.insuranceExpiring.map((r) => (
                  <li key={r.customer.id} className="flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 px-2.5 py-1.5">
                    <span className="text-xs font-semibold text-[#012619] dark:text-white truncate flex-1">{r.customer.companyName || r.customer.name}</span>
                    {r.expiry === null ? (
                      <Pill tone="red">{t('hire.ovInsuranceMissing')}</Pill>
                    ) : (
                      <>
                        <span className="text-[11px] text-[#72A68E]">{euDate(r.expiry)}</span>
                        <Pill tone={(r.days ?? 0) < 0 ? 'red' : 'amber'}>{(r.days ?? 0) < 0 ? t('hire.ovExpired') : t('hire.ovDaysLeftN', { n: r.days ?? 0 })}</Pill>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

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
                  <th className="px-3 py-2.5 font-bold text-right">{t('hire.ovColEnds')}</th>
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
                    <td className={`px-3 py-2.5 text-right tabular-nums ${(() => { const e = data.endsByCustomer.get(r.customerId); return e && daysBetween(ymd(new Date()), e) <= EXPIRY_DAYS ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-[#4a5e54] dark:text-gray-300' })()}`}>{data.endsByCustomer.get(r.customerId) ? euDate(data.endsByCustomer.get(r.customerId)!) : '—'}</td>
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
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#012619] dark:text-white">—</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#025940] dark:text-[#b3f243]">{data.weeklyTotal > 0 ? `£${data.weeklyTotal.toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#025940] dark:text-[#b3f243]">{data.monthlyTotal > 0 ? `£${data.monthlyTotal.toFixed(0)}` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {renewTarget && (
        <NewAgreementModal
          organizationId={organizationId}
          label={renewTarget.reference || t('hire.agreement')}
          renewFrom={renewTarget}
          onClose={() => setRenewTarget(null)}
          onSaved={() => {
            setRenewTarget(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
