// src/components/features/hire/HireAgreements.tsx
// Hire agreements list. Each card shows the schedule + attached vehicle lines,
// and lets you attach vehicles by 3-digit registration search.
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Car, ChevronDown } from 'lucide-react'
import { EmptyState, PrimaryBtn, Pill } from './hireUi'
import { ContractIcon } from './ContractIcon'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'
import { NewAgreementModal } from './NewAgreementModal'
import { HireSwapModal } from './HireSwapModal'
import { euDate, rateLabel } from './hireFormat'

export function HireAgreements() {
  const t = useT()
  const { organizationId, settings, refreshKey, refresh } = useHire()
  const label = settings.agreementLabelSingular
  const [agreements, setAgreements] = useState<HireAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const rows = await hireAgreementService.getAgreements(organizationId)
      if (!cancelled) {
        setAgreements(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, refreshKey])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <PrimaryBtn onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" />
          <span>{t('hire.newAgreement', { label })}</span>
        </PrimaryBtn>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : agreements.length === 0 ? (
        <EmptyState icon={<ContractIcon className="w-10 h-10" />} title={t('hire.emptyAgreements')} hint={t('hire.emptyAgreementsHint')} />
      ) : (
        <div className="space-y-2">
          {agreements.map((a) => (
            <AgreementCard key={a.id} agreement={a} organizationId={organizationId} onChange={refresh} />
          ))}
        </div>
      )}

      {showNew && (
        <NewAgreementModal
          organizationId={organizationId}
          label={label}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function AgreementCard({
  agreement,
  organizationId,
  onChange,
}: {
  agreement: HireAgreement
  organizationId: string | null
  onChange: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [swapLine, setSwapLine] = useState<HireAgreementVehicle | null>(null)

  const loadLines = async () => {
    if (!organizationId) return
    setLines(await hireAgreementService.getLines(organizationId, agreement.id))
    setLoaded(true)
  }

  useEffect(() => {
    if (open && !loaded) loadLines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const actor = async () => {
    const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
    return { id: user?.uid || null, name: profile?.displayName || user?.email || 'Unknown' }
  }

  const todayYmd = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const setOnHire = async (l: HireAgreementVehicle) => {
    if (!organizationId) return
    // Future-dated warning: starting earlier than the agreement's start date.
    if (agreement.startDate && agreement.startDate > todayYmd()) {
      const msg = t('hire.futureWarnBody', {
        reg: l.registration || '',
        customer: agreement.customerName || '',
        date: euDate(agreement.startDate),
      })
      if (!window.confirm(msg)) return
    }
    try {
      const a = await actor()
      await hireAgreementService.setLineOnHire({
        organizationId,
        lineId: l.id,
        registration: l.registration,
        actorId: a.id,
        actorName: a.name,
      })
      toast.success(t('hire.onHireDone'))
      loadLines()
      onChange()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  const endHire = async (l: HireAgreementVehicle) => {
    if (!organizationId) return
    try {
      const a = await actor()
      const periodStart = (l.actualOutAt ? l.actualOutAt.slice(0, 10) : l.scheduledStart) || agreement.startDate
      await hireAgreementService.endLine({
        organizationId,
        agreementId: agreement.id,
        lineId: l.id,
        vehicleId: l.vehicleId,
        registration: l.registration,
        periodStart,
        rateType: agreement.rateType,
        rateAmount: agreement.rateAmount,
        actorId: a.id,
        actorName: a.name,
      })
      toast.success(t('hire.endHireDone'))
      loadLines()
      onChange()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  const attach = async (v: { id: string; registration: string; make?: string; model?: string }) => {
    if (!organizationId) return
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      await hireAgreementService.attachVehicle({
        organizationId,
        agreementId: agreement.id,
        vehicleId: v.id,
        registration: v.registration,
        make: v.make,
        model: v.model,
        scheduledStart: agreement.startDate,
        scheduledEnd: agreement.endDate ?? null,
        rateType: agreement.rateType,
        rateAmount: agreement.rateAmount,
        createdBy: user?.uid || null,
        createdByName: profile?.displayName || user?.email || 'Unknown',
      })
      toast.success(t('hire.attached', { reg: v.registration }))
      loadLines()
      onChange()
    } catch (err) {
      const e = err as Error & { code?: string }
      if (e?.code === 'VEHICLE_ALREADY_ON_HIRE') {
        toast.error(e.message || t('hire.alreadyOnHire', { reg: v.registration }))
      } else {
        toast.error(t('hire.attachFail'))
      }
    }
  }

  return (
    <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-4 text-left">
        <ContractIcon className="w-10 h-10 flex-shrink-0 drop-shadow-sm" />
        <div className="min-w-0 flex-1">
          <span className="block font-bold text-[#012619] dark:text-white truncate leading-tight">{agreement.customerName || '—'}</span>
          <p className="text-xs text-[#72A68E] mt-0.5">
            {euDate(agreement.startDate)} → {euDate(agreement.endDate)}{agreement.reference ? ` · ${agreement.reference}` : ''}
          </p>
        </div>
        <Pill tone="lime">{rateLabel(agreement.rateType, agreement.rateAmount, t('hire.perWeek'), t('hire.perMonth'))}</Pill>
        <ChevronDown className={`w-4 h-4 text-[#72A68E] transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-[#e2e8e5] dark:border-gray-700 p-3.5 space-y-3">
          <VehicleAttach organizationId={organizationId} onPick={attach} />
          {lines.length === 0 ? (
            <p className="text-xs text-[#72A68E]">{t('hire.noVehicles')}</p>
          ) : (
            <ul className="space-y-1.5">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border border-[#e2e8e5] dark:border-gray-700 px-2.5 py-1.5">
                  <span className="font-mono font-bold text-[#012619] dark:text-white flex-shrink-0">{l.registration}</span>
                  <span className="text-xs text-[#72A68E] flex-1">{lineStatusLabel(l.status, t)}</span>
                  {l.status === 'scheduled' && (
                    <button onClick={() => setOnHire(l)} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[#025940] text-white hover:bg-[#012619]">{t('hire.setOnHire')}</button>
                  )}
                  {l.status === 'active' && (
                    <>
                      <button onClick={() => setSwapLine(l)} className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E]">{t('hire.swap')}</button>
                      <button onClick={() => endHire(l)} className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E]">{t('hire.endHire')}</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {swapLine && (
        <HireSwapModal
          organizationId={organizationId}
          agreement={agreement}
          fromLine={swapLine}
          onClose={() => setSwapLine(null)}
          onDone={() => {
            setSwapLine(null)
            loadLines()
            onChange()
          }}
        />
      )}
    </div>
  )
}

function VehicleAttach({
  organizationId,
  onPick,
}: {
  organizationId: string | null
  onPick: (v: { id: string; registration: string; make?: string; model?: string }) => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ id: string; registration: string; make?: string; model?: string }[]>([])
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!organizationId) return
    if (debounce.current) clearTimeout(debounce.current)
    const term = q.trim().toUpperCase().replace(/\s+/g, '')
    if (term.length < 3) {
      setHits([])
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('vehicles')
          .select('id, registration, make, model')
          .eq('organization_id', organizationId)
        setHits(
          (data ?? [])
            .filter((d) => (d.registration || '').toUpperCase().replace(/\s+/g, '').includes(term))
            .slice(0, 6),
        )
      } catch {
        setHits([])
      }
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [q, organizationId])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
          placeholder={t('hire.vehicleSearch')}
          className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
        />
      </div>
      {hits.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-[#025940] rounded-lg shadow-lg overflow-hidden">
          {hits.map((h) => (
            <button
              key={h.id}
              onMouseDown={() => { onPick(h); setQ(''); setHits([]) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#025940]/10 text-left"
            >
              <Car className="w-3.5 h-3.5 text-[#72A68E]" />
              <span className="font-mono font-bold text-sm text-[#012619] dark:text-white">{h.registration}</span>
              <span className="text-xs text-gray-500 flex-1 truncate">{h.make} {h.model}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function lineStatusLabel(s: string, t: (k: string) => string): string {
  return s === 'active' ? t('hire.lineActive')
    : s === 'returned' ? t('hire.lineReturned')
      : s === 'swapped' ? t('hire.lineSwapped')
        : t('hire.lineScheduled')
}
