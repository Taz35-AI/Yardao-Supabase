// src/components/features/hire/HireSwapModal.tsx
// Swap the vehicle on an active line: close it, open a new line for the
// replacement on the same agreement (swap date as the hinge), logged.
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X, Car, Search, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'

interface Hit { id: string; registration: string; make?: string; model?: string }

export function HireSwapModal({
  organizationId,
  agreement,
  fromLine,
  onClose,
  onDone,
}: {
  organizationId: string | null
  agreement: HireAgreement
  fromLine: HireAgreementVehicle
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [vehicle, setVehicle] = useState<Hit | null>(null)
  const [reason, setReason] = useState('')
  const [swapDate, setSwapDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [saving, setSaving] = useState(false)
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
            .filter((d) => (d.registration || '').toUpperCase().replace(/\s+/g, '').includes(term) && d.registration !== fromLine.registration)
            .slice(0, 6),
        )
      } catch {
        setHits([])
      }
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [q, organizationId, fromLine.registration])

  const doSwap = async () => {
    if (!organizationId || !vehicle) {
      toast.error(t('hire.swapTo'))
      return
    }
    setSaving(true)
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      await hireAgreementService.swapLine({
        organizationId,
        agreementId: agreement.id,
        fromLineId: fromLine.id,
        fromRegistration: fromLine.registration,
        toVehicleId: vehicle.id,
        toRegistration: vehicle.registration,
        toMake: vehicle.make,
        toModel: vehicle.model,
        swappedAt: swapDate,
        scheduledEnd: agreement.endDate ?? null,
        rateType: agreement.rateType,
        rateAmount: agreement.rateAmount,
        reason: reason || null,
        performedBy: user?.uid || null,
        performedByName: profile?.displayName || user?.email || 'Unknown',
      })
      toast.success(t('hire.swapDone'))
      onDone()
    } catch (err) {
      logger.error('HireSwapModal failed:', err)
      toast.error(t('hire.swapFail'))
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{t('hire.swapTitle')}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-[#72A68E]">{t('hire.swapFrom')}</p>
              <p className="font-mono font-bold text-[#012619] dark:text-white">{fromLine.registration || '—'}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-[#72A68E] flex-shrink-0" />
            <div className="flex-1 rounded-lg border-2 border-[#b3f243]/50 bg-[#b3f243]/10 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-[#025940] dark:text-[#b3f243]">{t('hire.swapTo')}</p>
              <p className="font-mono font-bold text-[#012619] dark:text-white">{vehicle?.registration || '…'}</p>
            </div>
          </div>

          {!vehicle && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
              <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder={t('hire.vehicleSearch')} className={`${inputCls} pl-10 font-mono`} autoComplete="off" />
              {hits.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-[#025940] rounded-lg shadow-lg overflow-hidden">
                  {hits.map((h) => (
                    <button key={h.id} onMouseDown={() => { setVehicle(h); setHits([]) }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#025940]/10 text-left">
                      <Car className="w-3.5 h-3.5 text-[#72A68E]" />
                      <span className="font-mono font-bold text-sm text-[#012619] dark:text-white">{h.registration}</span>
                      <span className="text-xs text-gray-500 flex-1 truncate">{h.make} {h.model}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.swapDate')}</label>
              <input type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.swapReason')}</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('hire.swapReasonPlaceholder')} className={inputCls} />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={doSwap} disabled={saving || !vehicle} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {saving ? t('hire.saving') : t('hire.swapConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
