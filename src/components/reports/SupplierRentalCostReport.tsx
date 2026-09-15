// src/components/reports/SupplierRentalCostReport.tsx
// Reports page — what the business PAYS its vehicle suppliers. Groups the active
// fleet by supplier and shows, per vehicle and per supplier, the weekly AND the
// monthly figure side by side. Suppliers quote one or the other, so the quoted
// figure is stored verbatim (vehicle_rental_rates, migration 0071) and the other
// column is derived (52 weeks = 12 months). The quoted one is marked so you can
// tell which is the contract figure and which is the conversion.
// ADMIN ONLY: hidden for every other role, and RLS returns nothing to them anyway.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Truck, Wallet, Loader2, ChevronDown, AlertTriangle, Car } from 'lucide-react'
import { useSupplierCostAccess } from '@/hooks/useSupplierCostAccess'
import { supabase } from '@/lib/supabaseClient'
import { vehicleRentalRateService } from '@/lib/services/vehicleRentalRateService'
import { toWeekly, toMonthly, formatGbp, type RentalRatePeriod } from '@/lib/utils/rentalRate'
import { logger } from '@/lib/logger'

interface VehicleRow {
  id: string
  reg: string
  makeModel: string
  weekly: number | null
  monthly: number | null
  quoted: RentalRatePeriod | null
}

interface SupplierGroup {
  name: string
  vehicles: VehicleRow[]
  priced: number
  weekly: number
  monthly: number
}

const NO_SUPPLIER = 'No supplier set'

export function SupplierRentalCostReport({ organizationId }: { organizationId: string }) {
  // Owner + admins picked in Settings > Supplier costs (RLS enforces the same).
  const access = useSupplierCostAccess()
  const isAdmin = access.allowed
  const [groups, setGroups] = useState<SupplierGroup[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId || !isAdmin) return
    let cancelled = false
    ;(async () => {
      try {
        const [{ data: vehicles, error }, rates] = await Promise.all([
          supabase
            .from('vehicles')
            .select('id, registration, make, model, supplier, is_defleeted, current_status')
            .eq('organization_id', organizationId),
          vehicleRentalRateService.getRates(organizationId),
        ])
        if (error) throw error
        const map = new Map<string, SupplierGroup>()
        for (const v of vehicles ?? []) {
          // Active fleet only — a defleeted van no longer costs anything.
          if (v.is_defleeted || v.current_status === 'defleeted') continue
          // Group case-insensitively and ignore stray spaces so "Fleet assist"
          // and "Fleet Assist " land in one row. Display name = first seen.
          const rawName = (v.supplier as string | null)?.replace(/\s+/g, ' ').trim() || NO_SUPPLIER
          const key = rawName.toLowerCase()
          const name = map.get(key)?.name ?? rawName
          const rate = rates.get(v.id as string)
          const row: VehicleRow = {
            id: v.id as string,
            reg: (v.registration as string) || '—',
            makeModel: [v.make, v.model].filter(Boolean).join(' '),
            weekly: rate ? toWeekly(rate) : null,
            monthly: rate ? toMonthly(rate) : null,
            quoted: rate?.period ?? null,
          }
          const g = map.get(key) ?? { name, vehicles: [], priced: 0, weekly: 0, monthly: 0 }
          g.vehicles.push(row)
          if (rate) {
            g.priced += 1
            g.weekly += row.weekly ?? 0
            g.monthly += row.monthly ?? 0
          }
          map.set(key, g)
        }
        const list = Array.from(map.values())
          .map((g) => ({ ...g, vehicles: g.vehicles.sort((a, b) => a.reg.localeCompare(b.reg)) }))
          .sort((a, b) => {
            if (a.name === NO_SUPPLIER) return 1
            if (b.name === NO_SUPPLIER) return -1
            return b.monthly - a.monthly || b.vehicles.length - a.vehicles.length
          })
        if (!cancelled) setGroups(list)
      } catch (err) {
        logger.error('SupplierRentalCostReport failed:', err)
        if (!cancelled) setGroups([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, isAdmin])

  const totals = useMemo(() => {
    const g = groups ?? []
    const vehicles = g.reduce((s, x) => s + x.vehicles.length, 0)
    const priced = g.reduce((s, x) => s + x.priced, 0)
    return {
      suppliers: g.filter((x) => x.name !== NO_SUPPLIER).length,
      vehicles,
      priced,
      missing: vehicles - priced,
      weekly: g.reduce((s, x) => s + x.weekly, 0),
      monthly: g.reduce((s, x) => s + x.monthly, 0),
    }
  }, [groups])

  if (access.loading || !isAdmin) return null

  return (
    <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[#b3f243]/15 border border-[#b3f243]/30">
          <Truck className="w-5 h-5 text-[#b3f243]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Supplier Rental Costs</h2>
          <p className="text-[11px] text-[#72A68E]">What we pay per vehicle, weekly and monthly · admin only</p>
        </div>
      </div>

      {groups === null ? (
        <div className="py-14 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : groups.length === 0 ? (
        <div className="py-14 text-center text-sm text-[#72A68E]">No active vehicles found.</div>
      ) : (
        <div className="p-4 sm:p-6 space-y-5">
          {/* KPIs */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<Truck className="w-4 h-4" />} tone="forest" label="Suppliers" value={String(totals.suppliers)} />
            <Kpi icon={<Car className="w-4 h-4" />} tone="lime" label="Vehicles priced" value={`${totals.priced} / ${totals.vehicles}`} />
            <Kpi icon={<Wallet className="w-4 h-4" />} tone="slate" label="Weekly spend" value={formatGbp(totals.weekly)} />
            <Kpi icon={<Wallet className="w-4 h-4" />} tone="slate" label="Monthly spend" value={formatGbp(totals.monthly)} />
          </div>

          {totals.missing > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {totals.missing === 1
                  ? '1 active vehicle has no rate yet, so the totals above are an under-count.'
                  : `${totals.missing} active vehicles have no rate yet, so the totals above are an under-count.`}
                {' '}Add the rate from the vehicle&apos;s Edit dialog on the Fleet page.
              </span>
            </div>
          )}

          {/* Per-supplier table */}
          <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 bg-[#f6f8f7] dark:bg-gray-900/40 text-[11px] font-bold uppercase tracking-[0.08em] text-[#72A68E]">
              <span>Supplier</span>
              <span className="text-right w-16">Vehicles</span>
              <span className="text-right w-24">Weekly</span>
              <span className="text-right w-24">Monthly</span>
              <span className="w-5" />
            </div>
            {groups.map((g) => {
              const open = expanded === g.name
              return (
                <div key={g.name} className="border-t border-[#e2e8e5] dark:border-gray-700 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : g.name)}
                    className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 gap-y-1 items-center px-4 py-3 text-left hover:bg-[#f6f8f7] dark:hover:bg-gray-700/40 transition-colors"
                  >
                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                      {g.name}
                      {g.priced < g.vehicles.length && (
                        <span className="ml-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                          {g.vehicles.length - g.priced} unpriced
                        </span>
                      )}
                    </span>
                    <span className="hidden sm:block text-right w-16 tabular-nums text-gray-700 dark:text-gray-300">{g.vehicles.length}</span>
                    <span className="hidden sm:block text-right w-24 tabular-nums font-semibold text-gray-900 dark:text-white">{formatGbp(g.weekly)}</span>
                    <span className="hidden sm:block text-right w-24 tabular-nums font-semibold text-gray-900 dark:text-white">{formatGbp(g.monthly)}</span>
                    <ChevronDown className={`w-5 h-5 text-[#72A68E] transition-transform ${open ? 'rotate-180' : ''}`} />
                    <span className="sm:hidden col-span-2 text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                      {g.vehicles.length} vehicles · {formatGbp(g.weekly)}/wk · {formatGbp(g.monthly)}/mo
                    </span>
                  </button>

                  {open && (
                    <div className="bg-[#f6f8f7] dark:bg-gray-900/40 border-t border-[#e2e8e5] dark:border-gray-700">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-[0.08em] text-[#72A68E]">
                              <th className="text-left font-bold px-4 py-2">Reg</th>
                              <th className="text-left font-bold px-2 py-2">Make / model</th>
                              <th className="text-right font-bold px-2 py-2">Weekly</th>
                              <th className="text-right font-bold px-4 py-2">Monthly</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.vehicles.map((v) => (
                              <tr key={v.id} className="border-t border-[#e2e8e5]/70 dark:border-gray-700/60">
                                <td className="px-4 py-1.5 font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">{v.reg}</td>
                                <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{v.makeModel || '—'}</td>
                                <RateCell value={v.weekly} quoted={v.quoted === 'weekly'} />
                                <RateCell value={v.monthly} quoted={v.quoted === 'monthly'} last />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="px-4 py-2 text-[10px] text-[#72A68E]">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#025940] dark:bg-[#b3f243] mr-1 align-middle" />
                        marks the figure the supplier quoted; the other column is converted at 52 weeks = 12 months.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function RateCell({ value, quoted, last }: { value: number | null; quoted: boolean; last?: boolean }) {
  return (
    <td className={`py-1.5 text-right tabular-nums whitespace-nowrap ${last ? 'px-4' : 'px-2'}`}>
      {value === null ? (
        <span className="text-amber-600 dark:text-amber-400 text-xs">not set</span>
      ) : (
        <span className={quoted ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}>
          {quoted && <span className="inline-block w-2 h-2 rounded-full bg-[#025940] dark:bg-[#b3f243] mr-1.5 align-middle" />}
          {formatGbp(value, 2)}
        </span>
      )}
    </td>
  )
}

function Kpi({ icon, tone, label, value }: { icon: React.ReactNode; tone: 'forest' | 'lime' | 'slate'; label: string; value: string }) {
  const tones = {
    forest: 'bg-[#025940] text-white',
    lime: 'bg-[#b3f243] text-[#012619]',
    slate: 'bg-[#f6f8f7] dark:bg-gray-900/40 text-gray-900 dark:text-white border border-[#e2e8e5] dark:border-gray-700',
  }[tone]
  return (
    <div className={`rounded-xl px-4 py-3 ${tones}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] opacity-80">{icon}{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
    </div>
  )
}
