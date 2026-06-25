// src/components/features/hire/NewAgreementModal.tsx
// Create a hire agreement: customer (insurance-gated), start date, duration
// (weeks/months), weekly/monthly rate. End date is computed live.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, Loader2, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { prorationService } from '@/lib/services/prorationService'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { RentalCustomer, HireAgreement, HireDurationUnit, HireRateType } from '@/types/hire'
import { euDate } from './hireFormat'

export function NewAgreementModal({
  organizationId,
  label,
  editing,
  onClose,
  onSaved,
}: {
  organizationId: string | null
  label: string
  editing?: HireAgreement | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const isEdit = !!editing
  const [customers, setCustomers] = useState<RentalCustomer[]>([])
  const [customerId, setCustomerId] = useState(editing?.customerId || '')
  const [reference, setReference] = useState(editing?.reference || '')
  const [startDate, setStartDate] = useState(editing?.startDate || '')
  const [durationValue, setDurationValue] = useState(String(editing?.durationValue ?? 52))
  const [durationUnit, setDurationUnit] = useState<HireDurationUnit>(editing?.durationUnit || 'weeks')
  const [rateType, setRateType] = useState<HireRateType>(editing?.rateType || 'weekly')
  const [rateAmount, setRateAmount] = useState(editing ? String(editing.rateAmount) : '')
  const [eligible, setEligible] = useState<'unknown' | 'ok' | 'blocked'>('unknown')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    hireCustomerService.getCustomers(organizationId).then(setCustomers).catch(() => setCustomers([]))
  }, [organizationId])

  // Check insurance whenever the customer changes. Skip while editing (customer
  // is fixed and we don't re-gate an existing contract on date/rate edits).
  useEffect(() => {
    if (isEdit) {
      setEligible('ok')
      return
    }
    if (!organizationId || !customerId) {
      setEligible('unknown')
      return
    }
    let cancelled = false
    hireCustomerService.checkInsuranceEligibility(organizationId, customerId).then((res) => {
      if (!cancelled) setEligible(res.eligible ? 'ok' : 'blocked')
    })
    return () => {
      cancelled = true
    }
  }, [organizationId, customerId, isEdit])

  const endDate = useMemo(() => {
    const n = parseInt(durationValue, 10)
    if (!startDate || !Number.isFinite(n) || n <= 0) return ''
    return prorationService.computeEndDate(startDate, n, durationUnit)
  }, [startDate, durationValue, durationUnit])

  const inputCls =
    'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm'

  const save = async () => {
    if (!organizationId || !customerId) {
      toast.error(t('hire.selectCustomer'))
      return
    }
    if (eligible === 'blocked') {
      toast.error(t('hire.insuranceBlockedBody'))
      return
    }
    const n = parseInt(durationValue, 10)
    const amt = parseFloat(rateAmount)
    if (!startDate || !Number.isFinite(n) || n <= 0 || !Number.isFinite(amt) || amt <= 0) {
      toast.error(t('hire.agreementSaveFail', { label }))
      return
    }
    const customer = customers.find((c) => c.id === customerId)
    setSaving(true)
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      if (isEdit && editing) {
        await hireAgreementService.updateAgreementDetails({
          organizationId,
          agreementId: editing.id,
          reference: reference.trim() || null,
          startDate,
          durationValue: n,
          durationUnit,
          rateType,
          rateAmount: amt,
        })
      } else {
        await hireAgreementService.createAgreement({
          organizationId,
          customerId,
          customerName: customer?.companyName || customer?.name || null,
          reference: reference.trim() || null,
          startDate,
          durationValue: n,
          durationUnit,
          rateType,
          rateAmount: amt,
          createdBy: user?.uid || null,
          createdByName: profile?.displayName || user?.email || 'Unknown',
        })
      }
      toast.success(t('hire.agreementSaved', { label }))
      onSaved()
    } catch (err) {
      logger.error('NewAgreementModal save failed:', err)
      toast.error(t('hire.needMigrations'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{isEdit ? t('hire.editAgreement', { label }) : t('hire.newAgreement', { label })}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.selectCustomer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={isEdit} className={`${inputCls} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <option value="">{t('hire.selectCustomerPlaceholder')}</option>
              {isEdit && editing && !customers.some((c) => c.id === editing.customerId) && (
                <option value={editing.customerId || ''}>{editing.customerName || '—'}</option>
              )}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName ? `${c.companyName} — ${c.name}` : c.name}</option>
              ))}
            </select>
            {eligible === 'blocked' && (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                <ShieldX className="w-3.5 h-3.5" /> {t('hire.insuranceBlockedBody')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.reference')}</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.startDate')}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.duration')}</label>
              <div className="flex gap-1.5">
                <input type="number" min="1" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} className={`${inputCls} w-20`} />
                <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as HireDurationUnit)} className={inputCls}>
                  <option value="weeks">{t('hire.weeks')}</option>
                  <option value="months">{t('hire.months')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.rate')}</label>
              <select value={rateType} onChange={(e) => setRateType(e.target.value as HireRateType)} className={inputCls}>
                <option value="weekly">{t('hire.weekly')}</option>
                <option value="monthly">{t('hire.monthly')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.rateAmount')}</label>
              <input type="number" min="0" step="0.01" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} className={inputCls} placeholder="0.00" />
            </div>
          </div>

          {endDate && (
            <p className="text-xs text-[#72A68E]">{t('hire.endsOn')}: <span className="font-semibold text-[#012619] dark:text-white">{euDate(endDate)}</span></p>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={save} disabled={saving || eligible === 'blocked'} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : isEdit ? t('hire.save') : t('hire.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
