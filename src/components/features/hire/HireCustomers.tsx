// src/components/features/hire/HireCustomers.tsx
// Hire customers list with an at-a-glance insurance eligibility badge.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Users, Plus, Search, Building2, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import type { RentalCustomer } from '@/types/hire'
import { AddCustomerModal } from './AddCustomerModal'
import { CustomerHireDashboard } from './CustomerHireDashboard'

type Elig = 'ok' | 'expired' | 'missing'

export function HireCustomers() {
  const t = useT()
  const { organizationId, refreshKey, refresh } = useHire()
  const [customers, setCustomers] = useState<RentalCustomer[]>([])
  const [elig, setElig] = useState<Record<string, Elig>>({})
  const [q, setQ] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [dash, setDash] = useState<RentalCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const list = await hireCustomerService.getCustomers(organizationId)
      // One query for all fleet-insurance docs → per-customer eligibility.
      const map: Record<string, Elig> = {}
      try {
        const { data } = await supabase
          .from('rental_customer_documents')
          .select('customer_id, expiry_date')
          .eq('organization_id', organizationId)
          .eq('doc_type', 'fleet_insurance')
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const latest: Record<string, string | null> = {}
        for (const d of data ?? []) {
          const cur = latest[d.customer_id]
          if (!cur || (d.expiry_date && d.expiry_date > cur)) latest[d.customer_id] = d.expiry_date
        }
        for (const c of list) {
          const exp = latest[c.id]
          map[c.id] = !exp ? 'missing' : new Date(exp + 'T00:00:00') < today ? 'expired' : 'ok'
        }
      } catch {
        /* leave map empty → treated as missing */
      }
      if (!cancelled) {
        setCustomers(list)
        setElig(map)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, refreshKey])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((c) =>
      [c.name, c.companyName, c.accountNo].filter(Boolean).some((s) => String(s).toLowerCase().includes(term)),
    )
  }, [customers, q])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('hire.searchCustomers')}
            className="w-full pl-10 pr-3 py-2.5 border border-[#e2e8e5] dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm font-medium placeholder:text-[#72A68E] focus:ring-2 focus:ring-[#025940]/20 focus:border-[#025940]"
          />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t('hire.addCustomer')}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-center py-12 px-6">
          <Users className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#012619] dark:text-white">{t('hire.emptyCustomers')}</p>
          <p className="text-[12.5px] text-[#72A68E] mt-1">{t('hire.emptyCustomersHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => setDash(c)}
              className="text-left rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 hover:border-[#72A68E] transition-colors"
            >
              <div className="flex items-center gap-2">
                {c.isBusiness && <Building2 className="w-4 h-4 text-[#025940] dark:text-[#b3f243] flex-shrink-0" />}
                <h3 className="font-bold text-[#012619] dark:text-white truncate">{c.companyName || c.name}</h3>
              </div>
              {c.companyName && <p className="text-xs text-[#72A68E] truncate">{c.name}</p>}
              <div className="mt-2 flex items-center justify-between">
                <EligBadge state={elig[c.id] || 'missing'} t={t} />
                <span className="text-[10px] font-semibold text-[#025940] dark:text-[#b3f243]">{t('hire.openDashboard')} →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <AddCustomerModal
          organizationId={organizationId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            refresh()
          }}
        />
      )}

      {dash && (
        <CustomerHireDashboard
          organizationId={organizationId}
          customerId={dash.id}
          customerName={dash.companyName || dash.name}
          isBusiness={dash.isBusiness}
          onClose={() => setDash(null)}
        />
      )}
    </div>
  )
}

function EligBadge({ state, t }: { state: Elig; t: (k: string) => string }) {
  if (state === 'ok')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        <ShieldCheck className="w-3 h-3" /> {t('hire.eligible')}
      </span>
    )
  if (state === 'expired')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <ShieldAlert className="w-3 h-3" /> {t('hire.expired')}
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <ShieldX className="w-3 h-3" /> {t('hire.missing')}
    </span>
  )
}
