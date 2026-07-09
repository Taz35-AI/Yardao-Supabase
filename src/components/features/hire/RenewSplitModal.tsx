// src/components/features/hire/RenewSplitModal.tsx
// Renew a hire agreement — optionally SPLITTING it into multiple new contracts
// with different terms (e.g. 20 vans → 52 weeks, 18 vans → 26 weeks). One group
// = a plain renewal (previous behaviour). Vehicles roll straight onto the new
// contract(s) without returning to the yard; the old contract completes once
// all its active lines have been rolled. The start date is the single handover
// point: the old contract bills up to it, the new ones from it — so no gap and
// no double-billing whatever date is picked (a mismatch warning shows anyway).
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, Loader2, RefreshCw, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { prorationService } from '@/lib/services/prorationService'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { HireAgreement, HireAgreementVehicle, HireDurationUnit, HireRateType } from '@/types/hire'
import { euDate } from './hireFormat'

interface GroupDraft {
  reference: string
  durationValue: string
  durationUnit: HireDurationUnit
  rateType: HireRateType
  rateAmount: string
  chargeDay: number | null
}

export function RenewSplitModal({
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
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [loadingLines, setLoadingLines] = useState(true)
  const [startDate, setStartDate] = useState(agreement.endDate || '')
  // Which group (index) each active line rolls into. Default: everyone → group 0.
  const [assignment, setAssignment] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const groupFromAgreement = (): GroupDraft => ({
    reference: '',
    durationValue: String(agreement.durationValue ?? 52),
    durationUnit: agreement.durationUnit || 'weeks',
    rateType: agreement.rateType || 'weekly',
    rateAmount: String(agreement.rateAmount ?? ''),
    chargeDay: agreement.chargeDay ?? null,
  })
  const [groups, setGroups] = useState<GroupDraft[]>([groupFromAgreement()])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setLoadingLines(true)
    hireAgreementService
      .getLines(organizationId, agreement.id)
      .then((all) => {
        if (cancelled) return
        const active = all.filter((l) => l.status === 'active')
        setLines(active)
        setAssignment(Object.fromEntries(active.map((l) => [l.id, 0])))
      })
      .catch(() => { if (!cancelled) setLines([]) })
      .finally(() => { if (!cancelled) setLoadingLines(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, agreement.id])

  const patchGroup = (i: number, patch: Partial<GroupDraft>) =>
    setGroups((gs) => gs.map((g, gi) => (gi === i ? { ...g, ...patch } : g)))

  const addGroup = () => setGroups((gs) => [...gs, groupFromAgreement()])

  const removeGroup = (i: number) => {
    if (groups.length <= 1) return
    setGroups((gs) => gs.filter((_, gi) => gi !== i))
    // Re-home that group's vehicles to group 0 and shift higher indices down.
    setAssignment((a) => {
      const next: Record<string, number> = {}
      for (const [lineId, gi] of Object.entries(a)) {
        next[lineId] = gi === i ? 0 : gi > i ? gi - 1 : gi
      }
      return next
    })
  }

  // Live end-date preview per group.
  const groupEnds = useMemo(
    () =>
      groups.map((g) => {
        const n = parseInt(g.durationValue, 10)
        if (!startDate || !Number.isFinite(n) || n <= 0) return ''
        return prorationService.computeEndDate(startDate, n, g.durationUnit)
      }),
    [groups, startDate],
  )

  const groupCounts = useMemo(() => {
    const counts = groups.map(() => 0)
    for (const gi of Object.values(assignment)) if (counts[gi] !== undefined) counts[gi] += 1
    return counts
  }, [groups, assignment])

  const dateMismatch = !!agreement.endDate && !!startDate && startDate !== agreement.endDate

  const save = async () => {
    if (!organizationId || !agreement.customerId) {
      toast.error(t('hire.actionFail'))
      return
    }
    if (!startDate) {
      toast.error(t('hire.renewNeedDate'))
      return
    }
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const n = parseInt(g.durationValue, 10)
      const amt = parseFloat(g.rateAmount)
      if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(amt) || amt <= 0) {
        toast.error(t('hire.renewGroupInvalid', { n: i + 1 }))
        return
      }
      if (groups.length > 1 && lines.length > 0 && groupCounts[i] === 0) {
        toast.error(t('hire.renewGroupEmpty', { n: i + 1 }))
        return
      }
    }
    setSaving(true)
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      const actorName = profile?.displayName || user?.email || 'Unknown'
      await hireAgreementService.renewAgreementSplit({
        organizationId,
        oldAgreementId: agreement.id,
        customerId: agreement.customerId,
        customerName: agreement.customerName ?? null,
        startDate,
        groups: groups.map((g, i) => ({
          reference: g.reference.trim() || null,
          durationValue: parseInt(g.durationValue, 10),
          durationUnit: g.durationUnit,
          rateType: g.rateType,
          rateAmount: parseFloat(g.rateAmount),
          chargeDay: g.rateType === 'weekly' ? g.chargeDay : null,
          lineIds: lines.filter((l) => (assignment[l.id] ?? 0) === i).map((l) => l.id),
        })),
        createdBy: user?.uid || null,
        createdByName: actorName,
        actorId: user?.uid || null,
        actorName,
      })
      toast.success(t('hire.renewDone'))
      onSaved()
    } catch (err) {
      logger.error('RenewSplitModal save failed:', err)
      toast.error(t('hire.actionFail'))
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none transition'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#b3f243]" />
            {t('hire.renewAgreement', { label: agreement.reference || agreement.customerName || t('hire.agreement') })}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Handover / start date */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.renewStartLabel')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            <p className="mt-1 text-[11px] text-[#72A68E]">{t('hire.renewHandoverHint')}</p>
            {dateMismatch && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                {t('hire.renewEndMismatch', { date: euDate(agreement.endDate!) })}
              </p>
            )}
          </div>

          {/* Contract groups */}
          <div className="space-y-3">
            {groups.map((g, i) => (
              <div key={i} className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 p-3 space-y-2.5 bg-[#f8faf9] dark:bg-gray-800/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#012619] dark:text-white">
                    {t('hire.renewGroupTitle', { n: i + 1 })}
                    <span className="ml-2 inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1.5 rounded-full bg-[#025940] text-white text-[11px] font-bold align-middle">
                      {groupCounts[i] ?? 0}
                    </span>
                  </p>
                  {groups.length > 1 && (
                    <button onClick={() => removeGroup(i)} title={t('hire.renewRemoveGroup')} className="p-1 rounded-md text-[#72A68E] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <input
                  value={g.reference}
                  onChange={(e) => patchGroup(i, { reference: e.target.value })}
                  placeholder={t('hire.reference')}
                  className={inputCls}
                />

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1.5">
                    <input
                      type="number" min="1"
                      value={g.durationValue}
                      onChange={(e) => patchGroup(i, { durationValue: e.target.value })}
                      className={`${inputCls} w-20`}
                    />
                    <select value={g.durationUnit} onChange={(e) => patchGroup(i, { durationUnit: e.target.value as HireDurationUnit })} className={inputCls}>
                      <option value="weeks">{t('hire.weeks')}</option>
                      <option value="months">{t('hire.months')}</option>
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    <select value={g.rateType} onChange={(e) => patchGroup(i, { rateType: e.target.value as HireRateType })} className={inputCls}>
                      <option value="weekly">{t('hire.weekly')}</option>
                      <option value="monthly">{t('hire.monthly')}</option>
                    </select>
                    <input
                      type="number" min="0" step="0.01"
                      value={g.rateAmount}
                      onChange={(e) => patchGroup(i, { rateAmount: e.target.value })}
                      className={inputCls}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {g.rateType === 'weekly' && (
                  <select
                    value={g.chargeDay === null ? '' : String(g.chargeDay)}
                    onChange={(e) => patchGroup(i, { chargeDay: e.target.value === '' ? null : Number(e.target.value) })}
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
                )}

                {groupEnds[i] && (
                  <p className="text-[11px] text-[#72A68E]">
                    {t('hire.endsOn')}: <span className="font-semibold text-[#012619] dark:text-white">{euDate(groupEnds[i])}</span>
                  </p>
                )}
              </div>
            ))}

            <button
              onClick={addGroup}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#72A68E] px-3 py-2.5 text-sm font-bold text-[#025940] dark:text-[#b3f243] hover:bg-[#f0f4f2] dark:hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t('hire.renewAddGroup')}
            </button>
          </div>

          {/* Vehicle assignment */}
          <div>
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              {t('hire.renewVehiclesTitle', { count: lines.length })}
            </p>
            {loadingLines ? (
              <p className="text-xs text-[#72A68E] inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('hire.loading')}</p>
            ) : lines.length === 0 ? (
              <p className="text-xs text-[#72A68E]">{t('hire.noVehicles')}</p>
            ) : groups.length === 1 ? (
              <p className="text-xs text-[#72A68E]">{t('hire.renewAllToOne', { count: lines.length })}</p>
            ) : (
              <>
                <p className="text-[11px] text-[#72A68E] mb-2">{t('hire.renewAssignHint')}</p>
                <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#e2e8e5] dark:border-gray-700 px-2.5 py-1.5">
                      <span className="font-mono text-sm font-bold text-[#012619] dark:text-white flex-shrink-0">{l.registration}</span>
                      <span className="text-[11px] text-[#72A68E] flex-1 truncate">{[l.make, l.model].filter(Boolean).join(' ')}</span>
                      <span className="inline-flex rounded-lg overflow-hidden border border-[#d6e3dc] dark:border-gray-600 flex-shrink-0">
                        {groups.map((_, gi) => (
                          <button
                            key={gi}
                            onClick={() => setAssignment((a) => ({ ...a, [l.id]: gi }))}
                            className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              (assignment[l.id] ?? 0) === gi
                                ? 'bg-[#025940] text-white'
                                : 'bg-white dark:bg-gray-800 text-[#5a6e64] dark:text-gray-300 hover:bg-[#f0f4f2]'
                            }`}
                          >
                            {gi + 1}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">
              {t('hire.cancel')}
            </button>
            <button
              onClick={save}
              disabled={saving || loadingLines}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving
                ? t('hire.saving')
                : groups.length > 1
                  ? t('hire.renewConfirmSplit', { count: groups.length })
                  : t('hire.renew')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
