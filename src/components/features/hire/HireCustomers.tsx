// src/components/features/hire/HireCustomers.tsx
// Hire customers list with an at-a-glance insurance eligibility badge.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Users, Plus, Search, Building2, User, ShieldCheck, ShieldAlert, ShieldX, ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PrimaryBtn } from './hireUi'
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
  const [editCustomer, setEditCustomer] = useState<RentalCustomer | null>(null)
  const [dash, setDash] = useState<RentalCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  const deleteCustomer = async (c: RentalCustomer) => {
    if (!organizationId) return
    if (!window.confirm(t('hire.deleteCustomerConfirm', { name: c.companyName || c.name }))) return
    try {
      await hireCustomerService.deleteCustomer(organizationId, c.id)
      toast.success(t('hire.deleteCustomerDone', { name: c.companyName || c.name }))
      refresh()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

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
        <PrimaryBtn onClick={() => setShowAdd(true)} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          <span>{t('hire.addCustomer')}</span>
        </PrimaryBtn>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users className="w-7 h-7" />} title={t('hire.emptyCustomers')} hint={t('hire.emptyCustomersHint')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:shadow-md hover:border-[#72A68E]/60 transition-all"
            >
              <div className="absolute top-2.5 right-2.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button onClick={() => setEditCustomer(c)} title={t('hire.editCustomerShort')} className="p-1.5 rounded-lg bg-white/90 dark:bg-gray-700 text-[#72A68E] hover:text-[#025940] shadow-sm border border-[#e2e8e5] dark:border-gray-600">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteCustomer(c)} title={t('hire.deleteCustomerShort')} className="p-1.5 rounded-lg bg-white/90 dark:bg-gray-700 text-[#72A68E] hover:text-red-600 shadow-sm border border-[#e2e8e5] dark:border-gray-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => setDash(c)} className="w-full text-left">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#025940] to-[#012619] flex items-center justify-center flex-shrink-0 text-[#b3f243]">
                    {c.isBusiness ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1 pr-12">
                    <h3 className="font-bold text-[#012619] dark:text-white truncate leading-tight">{c.companyName || c.name}</h3>
                    {c.companyName && <p className="text-xs text-[#72A68E] truncate mt-0.5">{c.name}</p>}
                    {c.isBusiness && (
                      <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#b3f243]/25 text-[#3d6b1f] dark:text-[#b3f243]">B2B</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#eef2f0] dark:border-gray-700/60 flex items-center justify-between">
                  <EligBadge state={elig[c.id] || 'missing'} t={t} />
                  <span className="text-[11px] font-bold text-[#025940] dark:text-[#b3f243] inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
                    {t('hire.openDashboard')} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            </div>
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

      {editCustomer && (
        <AddCustomerModal
          organizationId={organizationId}
          editing={editCustomer}
          onClose={() => setEditCustomer(null)}
          onSaved={() => {
            setEditCustomer(null)
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
