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
  renewFrom,
  onClose,
  onSaved,
}: {
  organizationId: string | null
  label: string
  editing?: HireAgreement | null
  renewFrom?: HireAgreement | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const isEdit = !!editing
  const isRenew = !!renewFrom
  const src = editing || renewFrom // prefill source
  const [customers, setCustomers] = useState<RentalCustomer[]>([])
  const [customerId, setCustomerId] = useState(src?.customerId || '')
  const [reference, setReference] = useState(editing?.reference || '')
  const [startDate, setStartDate] = useState(editing?.startDate || renewFrom?.endDate || '')
  const [durationValue, setDurationValue] = useState(String(src?.durationValue ?? 52))
  const [durationUnit, setDurationUnit] = useState<HireDurationUnit>(src?.durationUnit || 'weeks')
  const [rateType, setRateType] = useState<HireRateType>(src?.rateType || 'weekly')
  const [rateAmount, setRateAmount] = useState(src ? String(src.rateAmount) : '')
  const [chargeDay, setChargeDay] = useState<number | null>(src?.chargeDay ?? null)
  const [isRolling, setIsRolling] = useState<boolean>(src?.isRolling ?? false)
  const [eligible, setEligible] = useState<'unknown' | 'ok' | 'blocked'>('unknown')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    hireCustomerService.getCustomers(organizationId).then(setCustomers).catch(() => setCustomers([]))
  }, [organizationId])

  // Check insurance whenever the customer changes. Skip while editing (customer
  // is fixed and we don't re-gate an existing contract on date/rate edits).
  useEffect(() => {
    if (isEdit || isRenew) {
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
  }, [organizationId, customerId, isEdit, isRenew])

  const endDate = useMemo(() => {
    const n = parseInt(durationValue, 10)
    if (!startDate || !Number.isFinite(n) || n <= 0) return ''
    return prorationService.computeEndDate(startDate, n, durationUnit)
  }, [startDate, durationValue, durationUnit])

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none transition'

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
      if (isRenew && renewFrom) {
        await hireAgreementService.renewAgreement({
          organizationId,
          oldAgreementId: renewFrom.id,
          customerId: renewFrom.customerId || customerId,
          customerName: renewFrom.customerName ?? null,
          reference: reference.trim() || null,
          startDate,
          durationValue: n,
          durationUnit,
          rateType,
          rateAmount: amt,
          chargeDay,
          createdBy: user?.uid || null,
          createdByName: profile?.displayName || user?.email || 'Unknown',
          actorId: user?.uid || null,
          actorName: profile?.displayName || user?.email || 'Unknown',
        })
      } else if (isEdit && editing) {
        await hireAgreementService.updateAgreementDetails({
          organizationId,
          agreementId: editing.id,
          reference: reference.trim() || null,
          startDate,
          durationValue: n,
          durationUnit,
          rateType,
          rateAmount: amt,
          chargeDay,
          isRolling,
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
          chargeDay,
          isRolling,
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
          <h2 className="text-base font-bold text-white">{isRenew ? t('hire.renewAgreement', { label }) : isEdit ? t('hire.editAgreement', { label }) : t('hire.newAgreement', { label })}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.selectCustomer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={isEdit || isRenew} className={`${inputCls} ${isEdit || isRenew ? 'opacity-60 cursor-not-allowed' : ''}`}>
              <option value="">{t('hire.selectCustomerPlaceholder')}</option>
              {src && !customers.some((c) => c.id === src.customerId) && (
                <option value={src.customerId || ''}>{src.customerName || '—'}</option>
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

          {/* Rolling / flexi toggle */}
          <label className="flex items-center gap-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800/50 px-3 py-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={isRolling} onChange={(e) => setIsRolling(e.target.checked)} className="w-4 h-4 accent-[#025940]" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#012619] dark:text-white">{t('hire.rollingToggle')}</span>
              <span className="block text-[11px] text-[#72A68E]">{t('hire.rollingHint')}</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.startDate')}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{isRolling ? t('hire.minTerm') : t('hire.duration')}</label>
              {isRolling ? (
                <div className={`${inputCls} flex items-center text-[#72A68E] cursor-not-allowed`}>{t('hire.rollingMin')}</div>
              ) : (
                <div className="flex gap-1.5">
                  <input type="number" min="1" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} className={`${inputCls} w-20`} />
                  <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as HireDurationUnit)} className={inputCls}>
                    <option value="weeks">{t('hire.weeks')}</option>
                    <option value="months">{t('hire.months')}</option>
                  </select>
                </div>
              )}
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

          {rateType === 'weekly' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chargeDay')}</label>
              <select
                value={chargeDay === null ? '' : String(chargeDay)}
                onChange={(e) => setChargeDay(e.target.value === '' ? null : Number(e.target.value))}
                className={inputCls}
              >
                <option value="">{t('hire.chargeDaySame')}</option>
                <option value="1">{t('hire.dowMon')}</option>
                <option value="2">{t('hire.dowTue')}</option>
                <option value="3">{t('hire.dowWed')}</option>
                <option value="4">{t('hire.dowThu')}</option>
                <option value="5">{t('hire.dowFri')}</option>
                <option value="6">{t('hire.dowSat')}</option>
                <option value="0">{t('hire.dowSun')}</option>
              </select>
              <p className="mt-1 text-[11px] text-[#72A68E]">{t('hire.chargeDayHint')}</p>
            </div>
          )}

          {isRolling ? (
            <p className="text-xs text-[#72A68E]">{t('hire.endsOn')}: <span className="font-semibold text-[#025940] dark:text-[#b3f243]">{t('hire.rollingEnds')}</span></p>
          ) : endDate ? (
            <p className="text-xs text-[#72A68E]">{t('hire.endsOn')}: <span className="font-semibold text-[#012619] dark:text-white">{euDate(endDate)}</span></p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={save} disabled={saving || eligible === 'blocked'} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : isRenew ? t('hire.renew') : isEdit ? t('hire.save') : t('hire.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
