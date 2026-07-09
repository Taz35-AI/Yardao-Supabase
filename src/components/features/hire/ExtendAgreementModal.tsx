// src/components/features/hire/ExtendAgreementModal.tsx
// Extend a fixed-term hire agreement by N of its own duration units
// (weeks/months). Quick +1/+2/+3 picks or a custom number, with a live
// "new end date" preview. Works retroactively on a contract whose end date
// has already passed. Rolling contracts never show this modal (no end date).
'use client'

import React, { useMemo, useState } from 'react'
import { X, Loader2, CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { prorationService } from '@/lib/services/prorationService'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { HireAgreement } from '@/types/hire'
import { euDate } from './hireFormat'

export function ExtendAgreementModal({
  organizationId,
  agreement,
  onClose,
  onSaved,
}: {
  organizationId: string | null
  agreement: HireAgreement
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const [extendBy, setExtendBy] = useState('1')
  const [saving, setSaving] = useState(false)

  const unitLabel = agreement.durationUnit === 'months' ? t('hire.months') : t('hire.weeks')

  const n = parseInt(extendBy, 10)
  const newEnd = useMemo(() => {
    if (!Number.isFinite(n) || n <= 0) return ''
    return prorationService.computeEndDate(agreement.startDate, agreement.durationValue + n, agreement.durationUnit)
  }, [agreement.startDate, agreement.durationValue, agreement.durationUnit, n])

  const save = async () => {
    if (!organizationId || !Number.isFinite(n) || n <= 0) return
    setSaving(true)
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      const end = await hireAgreementService.extendAgreement({
        organizationId,
        agreementId: agreement.id,
        extendBy: n,
        actorId: user?.uid || null,
        actorName: profile?.displayName || user?.email || 'Unknown',
      })
      toast.success(t('hire.extendDone', { date: euDate(end) }))
      onSaved()
    } catch (err) {
      logger.error('ExtendAgreementModal save failed:', err)
      toast.error(t('hire.actionFail'))
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none transition'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-[#025940]/20">
        <div className="sticky top-0 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between sm:rounded-t-2xl">
          <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-[#b3f243]" />
            {t('hire.extendTitle', { label: agreement.reference || agreement.customerName || t('hire.agreement') })}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-[#72A68E]">
            {t('hire.extendCurrentEnd')}:{' '}
            <span className="font-semibold text-[#012619] dark:text-white">{agreement.endDate ? euDate(agreement.endDate) : '—'}</span>
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              {t('hire.extendBy')} ({unitLabel})
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setExtendBy(String(q))}
                  className={`px-3.5 py-2 rounded-xl border text-sm font-bold transition ${
                    n === q
                      ? 'bg-[#025940] border-[#025940] text-white'
                      : 'bg-white dark:bg-gray-800 border-[#e2e8e5] dark:border-gray-700 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E]'
                  }`}
                >
                  +{q}
                </button>
              ))}
              <input
                type="number"
                min="1"
                step="1"
                value={extendBy}
                onChange={(e) => setExtendBy(e.target.value)}
                className={`${inputCls} w-20`}
              />
            </div>
          </div>

          {newEnd && (
            <p className="text-xs text-[#72A68E]">
              {t('hire.extendNewEnd')}:{' '}
              <span className="font-semibold text-[#025940] dark:text-[#b3f243]">{euDate(newEnd)}</span>
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">
              {t('hire.cancel')}
            </button>
            <button
              onClick={save}
              disabled={saving || !Number.isFinite(n) || n <= 0}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : t('hire.extendConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
