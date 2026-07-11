// src/components/features/hire/HireCharges.tsx
// PCNs & damages charge ledger (migration 0062). Everything a hire customer
// owes beyond the rental itself: PCNs (nominated → admin fee only; paid →
// fine + admin fee) and damages. Entries link customer + contract + vehicle
// (auto-resolved from the hire lines), carry the money breakdown and a simple
// settlement status. Includes the paste-parser for PCN department emails.
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Receipt, ClipboardPaste, Plus, Pencil, Trash2, Check, RotateCcw, Ban,
  Download, X, Loader2, Link2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import {
  hireChargeService, computeChargeMoney, parsePcnPaste,
  type ParsedPcnRow,
} from '@/lib/services/hireChargeService'
import type { HireChargeCandidate } from '@/lib/services/hireChargeService'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import type { HireCharge, HireChargeStatus, HireChargeType, HirePcnKind, RentalCustomer } from '@/types/hire'
import { euDate } from './hireFormat'
import { EmptyState } from './hireUi'

const gbp = (n: number) => `£${(Number.isFinite(n) ? n : 0).toFixed(2)}`
const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none transition'
const smallInputCls =
  'px-2 py-1.5 rounded-lg border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-xs focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none'

function statusPill(status: HireChargeStatus, t: (k: string) => string) {
  const cls =
    status === 'paid'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
      : status === 'waived'
        ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  const label =
    status === 'paid' ? t('hire.chStatusPaid') : status === 'waived' ? t('hire.chStatusWaived') : t('hire.chStatusOutstanding')
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${cls}`}>{label}</span>
}

function typePill(c: HireCharge, t: (k: string) => string) {
  if (c.chargeType === 'damage') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{t('hire.chTypeDamage')}</span>
  }
  const kind = c.pcnKind === 'paid' ? t('hire.chKindPaid') : t('hire.chKindNominated')
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">PCN · {kind}</span>
}

export function HireCharges() {
  const t = useT()
  const { user } = useAuth()
  const { organizationId } = useHire()
  const [charges, setCharges] = useState<HireCharge[]>([])
  const [customers, setCustomers] = useState<RentalCustomer[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [fCustomer, setFCustomer] = useState('all')
  const [fType, setFType] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fSearch, setFSearch] = useState('')

  // Modals
  const [showPaste, setShowPaste] = useState(false)
  const [editCharge, setEditCharge] = useState<HireCharge | null>(null)
  const [showNew, setShowNew] = useState<HireChargeType | null>(null)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const [ch, cu] = await Promise.all([
        hireChargeService.getCharges(organizationId),
        hireCustomerService.getCustomers(organizationId),
      ])
      setCharges(ch)
      setCustomers(cu)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { load() }, [load])

  const actor = useCallback(async () => {
    const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
    return { id: user?.uid || null, name: profile?.displayName || user?.email || 'Unknown' }
  }, [user])

  const filtered = useMemo(() => {
    const q = fSearch.trim().toUpperCase().replace(/\s+/g, '')
    return charges.filter((c) => {
      if (fCustomer !== 'all' && c.customerId !== fCustomer) return false
      if (fType === 'pcn' && c.chargeType !== 'pcn') return false
      if (fType === 'damage' && c.chargeType !== 'damage') return false
      if (fStatus !== 'all' && c.status !== fStatus) return false
      if (q) {
        const reg = (c.registration || '').toUpperCase().replace(/\s+/g, '')
        const ref = (c.reference || '').toUpperCase()
        if (!reg.includes(q) && !ref.includes(q)) return false
      }
      return true
    })
  }, [charges, fCustomer, fType, fStatus, fSearch])

  const totals = useMemo(() => {
    let outAmt = 0, outN = 0, paidAmt = 0, paidN = 0
    for (const c of filtered) {
      if (c.status === 'outstanding') { outAmt += c.totalAmount; outN++ }
      else if (c.status === 'paid') { paidAmt += c.totalAmount; paidN++ }
    }
    return { outAmt, outN, paidAmt, paidN }
  }, [filtered])

  const setStatus = async (c: HireCharge, status: HireChargeStatus) => {
    try {
      await hireChargeService.setStatus(c.id, status)
      toast.success(t('hire.chStatusUpdated'))
      load()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  const remove = async (c: HireCharge) => {
    if (!window.confirm(t('hire.chDeleteConfirm'))) return
    try {
      await hireChargeService.deleteCharge(c.id)
      toast.success(t('hire.chDeleted'))
      load()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  const exportExcel = () => {
    const data = filtered.map((c) => ({
      'Date': c.incidentDate ? euDate(c.incidentDate) : euDate(c.createdAt.slice(0, 10)),
      'Type': c.chargeType === 'damage' ? 'Damage' : `PCN (${c.pcnKind || ''})`,
      'Registration': c.registration || '',
      'Reference': c.reference || '',
      'Issuer': c.issuer || '',
      'Customer': c.customerName || '',
      'Contract': c.agreementReference || '',
      'Description': c.description || '',
      'Base £': c.baseAmount,
      'Admin fee £': c.adminFee,
      'VAT £': c.vatAmount,
      'Total £': c.totalAmount,
      'Status': c.status,
      'Paid on': c.paidAt ? euDate(c.paidAt) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PCNs & damages')
    XLSX.writeFile(wb, `pcn-damages-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-3">
      {/* Header row: totals + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">{t('hire.chStatusOutstanding')}</span>
          <span className="text-sm font-extrabold text-amber-800 dark:text-amber-300">{gbp(totals.outAmt)}</span>
          <span className="text-[11px] text-amber-700/70 dark:text-amber-400/70">({totals.outN})</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">{t('hire.chStatusPaid')}</span>
          <span className="text-sm font-extrabold text-green-800 dark:text-green-300">{gbp(totals.paidAmt)}</span>
          <span className="text-[11px] text-green-700/70 dark:text-green-400/70">({totals.paidN})</span>
        </div>
        <div className="flex-1" />
        <button onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-bold text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E] transition-colors">
          <Download className="w-3.5 h-3.5" /> {t('hire.chExport')}
        </button>
        <button onClick={() => setShowPaste(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#025940] bg-white dark:bg-gray-800 px-3 py-2 text-xs font-bold text-[#025940] dark:text-[#b3f243] hover:bg-[#f0f4f2] dark:hover:bg-gray-700 transition-colors">
          <ClipboardPaste className="w-3.5 h-3.5" /> {t('hire.chPastePcns')}
        </button>
        <button onClick={() => setShowNew('damage')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#025940] hover:bg-[#012619] px-3 py-2 text-xs font-bold text-white transition-colors">
          <Plus className="w-3.5 h-3.5" /> {t('hire.chAddDamage')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={fSearch}
          onChange={(e) => setFSearch(e.target.value)}
          placeholder={t('hire.chSearchPlaceholder')}
          className={`${smallInputCls} w-44 uppercase`}
        />
        <select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} className={smallInputCls}>
          <option value="all">{t('hire.chAllCustomers')}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.companyName || c.name}</option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={smallInputCls}>
          <option value="all">{t('hire.chAllTypes')}</option>
          <option value="pcn">PCN</option>
          <option value="damage">{t('hire.chTypeDamage')}</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={smallInputCls}>
          <option value="all">{t('hire.chAllStatuses')}</option>
          <option value="outstanding">{t('hire.chStatusOutstanding')}</option>
          <option value="paid">{t('hire.chStatusPaid')}</option>
          <option value="waived">{t('hire.chStatusWaived')}</option>
        </select>
      </div>

      {/* Ledger */}
      {loading ? (
        <p className="text-xs text-[#72A68E] inline-flex items-center gap-1.5 py-6"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('hire.loading')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Receipt className="w-8 h-8" />} title={t('hire.chEmptyTitle')} hint={t('hire.chEmptyBody')} />
      ) : (
        <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-[#025940] text-white text-left text-xs">
                <th className="px-3 py-2.5 font-semibold">{t('hire.chColDate')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('hire.chColType')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('hire.chColVehicle')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('hire.chColRef')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('hire.chColCustomer')}</th>
                <th className="px-3 py-2.5 font-semibold text-right">{t('hire.chColBase')}</th>
                <th className="px-3 py-2.5 font-semibold text-right">{t('hire.chColAdmin')}</th>
                <th className="px-3 py-2.5 font-semibold text-right">{t('hire.chColTotal')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('hire.chColStatus')}</th>
                <th className="px-3 py-2.5 font-semibold text-right">{t('hire.chColActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-[#f8faf9] dark:hover:bg-gray-700/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-[#4a5e54] dark:text-gray-300">
                    {c.incidentDate ? euDate(c.incidentDate) : euDate(c.createdAt.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{typePill(c, t)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono font-bold text-[#012619] dark:text-white">{c.registration || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-[#4a5e54] dark:text-gray-300">
                    {c.reference || (c.chargeType === 'damage' ? (c.description || '—') : '—')}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-semibold text-[#012619] dark:text-white">{c.customerName || '—'}</span>
                    {c.agreementReference && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-[#72A68E]"><Link2 className="w-2.5 h-2.5" />{c.agreementReference}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-xs text-[#4a5e54] dark:text-gray-300">{gbp(c.baseAmount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-xs text-[#4a5e54] dark:text-gray-300">{gbp(c.adminFee)}<span className="text-[9px] text-[#9db0a6]"> +VAT</span></td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-bold text-[#012619] dark:text-white">{gbp(c.totalAmount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{statusPill(c.status, t)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <div className="inline-flex items-center gap-0.5">
                      {c.status !== 'paid' && (
                        <button onClick={() => setStatus(c, 'paid')} title={t('hire.chMarkPaid')} className="p-1.5 rounded-md text-[#72A68E] hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.status !== 'outstanding' && (
                        <button onClick={() => setStatus(c, 'outstanding')} title={t('hire.chMarkOutstanding')} className="p-1.5 rounded-md text-[#72A68E] hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {c.status === 'outstanding' && (
                        <button onClick={() => setStatus(c, 'waived')} title={t('hire.chWaive')} className="p-1.5 rounded-md text-[#72A68E] hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setEditCharge(c)} title={t('hire.chEdit')} className="p-1.5 rounded-md text-[#72A68E] hover:text-[#025940] hover:bg-[#f0f4f2] dark:hover:bg-gray-700 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(c)} title={t('hire.chDelete')} className="p-1.5 rounded-md text-[#72A68E] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPaste && organizationId && (
        <PastePcnModal
          organizationId={organizationId}
          customers={customers}
          actor={actor}
          onClose={() => setShowPaste(false)}
          onSaved={() => { setShowPaste(false); load() }}
        />
      )}

      {(showNew || editCharge) && organizationId && (
        <ChargeFormModal
          organizationId={organizationId}
          customers={customers}
          charge={editCharge}
          defaultType={showNew || 'damage'}
          actor={actor}
          onClose={() => { setShowNew(null); setEditCharge(null) }}
          onSaved={() => { setShowNew(null); setEditCharge(null); load() }}
        />
      )}
    </div>
  )
}

// ── Charge form (add damage / edit any charge) ───────────────────────────────

function ChargeFormModal({
  organizationId,
  customers,
  charge,
  defaultType,
  actor,
  onClose,
  onSaved,
}: {
  organizationId: string
  customers: RentalCustomer[]
  charge: HireCharge | null
  defaultType: HireChargeType
  actor: () => Promise<{ id: string | null; name: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const isEdit = !!charge
  const [chargeType, setChargeType] = useState<HireChargeType>(charge?.chargeType || defaultType)
  const [pcnKind, setPcnKind] = useState<HirePcnKind>(charge?.pcnKind || 'nominated')
  const [registration, setRegistration] = useState(charge?.registration || '')
  const [reference, setReference] = useState(charge?.reference || '')
  const [issuer, setIssuer] = useState(charge?.issuer || '')
  const [incidentDate, setIncidentDate] = useState(charge?.incidentDate || '')
  const [description, setDescription] = useState(charge?.description || '')
  const [baseAmount, setBaseAmount] = useState(charge ? String(charge.baseAmount) : '')
  const [adminFee, setAdminFee] = useState(charge ? String(charge.adminFee) : '')
  const [customerId, setCustomerId] = useState(charge?.customerId || '')
  const [match, setMatch] = useState<HireChargeCandidate | null>(null)
  const [saving, setSaving] = useState(false)
  const regTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-resolve the liable customer from the hire lines when the reg (or the
  // incident date) changes. Manual customer choice always wins afterwards.
  useEffect(() => {
    if (!registration.trim()) { setMatch(null); return }
    if (regTimer.current) clearTimeout(regTimer.current)
    regTimer.current = setTimeout(async () => {
      const cands = await hireChargeService.getCandidatesForReg(organizationId, registration, incidentDate || null)
      const best = cands[0] || null
      setMatch(best)
      if (best?.customerId) {
        setCustomerId((prev) => prev || best.customerId!)
      }
    }, 450)
    return () => { if (regTimer.current) clearTimeout(regTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registration, incidentDate, organizationId])

  // Prefill the admin fee from the selected customer's rate.
  useEffect(() => {
    if (!customerId) return
    const cust = customers.find((c) => c.id === customerId)
    if (cust?.pcnAdminFee != null) setAdminFee(String(cust.pcnAdminFee))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const base = chargeType === 'pcn' && pcnKind === 'nominated' ? 0 : parseFloat(baseAmount) || 0
  const admin = parseFloat(adminFee) || 0
  const money = computeChargeMoney(chargeType, base, admin)

  const save = async () => {
    if (!registration.trim()) { toast.error(t('hire.chNeedReg')); return }
    setSaving(true)
    try {
      const a = await actor()
      const cust = customers.find((c) => c.id === customerId)
      const custName = cust ? (cust.companyName || cust.name) : charge?.customerName ?? null
      // Agreement link: from the live match when the matched customer is the
      // selected one; otherwise keep whatever the charge already had.
      const useMatch = match && match.customerId === customerId
      const common = {
        pcnKind: chargeType === 'pcn' ? pcnKind : null,
        reference: reference || null,
        issuer: issuer || null,
        registration,
        customerId: customerId || null,
        customerName: customerId ? custName : null,
        agreementId: useMatch ? match!.agreementId : charge?.agreementId ?? null,
        agreementReference: useMatch ? match!.agreementReference : charge?.agreementReference ?? null,
        lineId: useMatch ? match!.lineId : charge?.lineId ?? null,
        incidentDate: incidentDate || null,
        description: description || null,
        baseAmount: base,
        adminFee: admin,
        vatAmount: money.vatAmount,
        totalAmount: money.totalAmount,
      }
      if (isEdit && charge) {
        await hireChargeService.updateCharge(charge.id, common)
      } else {
        await hireChargeService.createCharge({
          organizationId,
          chargeType,
          ...common,
          createdBy: a.id,
          createdByName: a.name,
        })
      }
      toast.success(t('hire.chSaved'))
      onSaved()
    } catch (err) {
      toast.error(t('hire.needMigrations'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">
            {isEdit ? t('hire.chEditTitle') : chargeType === 'damage' ? t('hire.chAddDamage') : t('hire.chAddPcn')}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chColType')}</label>
              <select value={chargeType} onChange={(e) => setChargeType(e.target.value as HireChargeType)} className={inputCls}>
                <option value="pcn">PCN</option>
                <option value="damage">{t('hire.chTypeDamage')}</option>
              </select>
            </div>
            {chargeType === 'pcn' ? (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chKindLabel')}</label>
                <select value={pcnKind} onChange={(e) => setPcnKind(e.target.value as HirePcnKind)} className={inputCls}>
                  <option value="nominated">{t('hire.chKindNominated')}</option>
                  <option value="paid">{t('hire.chKindPaid')}</option>
                </select>
              </div>
            ) : <div />}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chColVehicle')}</label>
              <input value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} placeholder="AB12 CDE" className={`${inputCls} uppercase`} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chIncidentDate')}</label>
              <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {chargeType === 'pcn' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chColRef')}</label>
                <input value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chIssuer')}</label>
                <input value={issuer} onChange={(e) => setIssuer(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {chargeType === 'damage' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chDescription')}</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('hire.chDescriptionPh')} className={inputCls} />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chColCustomer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
              <option value="">{t('hire.chNoCustomer')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName || c.name}</option>
              ))}
            </select>
            {match && (
              <p className="mt-1 text-[11px] text-[#72A68E] inline-flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                {t('hire.chMatched', { customer: match.customerName || '—', contract: match.agreementReference || '—' })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                {chargeType === 'damage' ? t('hire.chDamageCost') : t('hire.chFineAmount')}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={chargeType === 'pcn' && pcnKind === 'nominated' ? '' : baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                disabled={chargeType === 'pcn' && pcnKind === 'nominated'}
                placeholder={chargeType === 'pcn' && pcnKind === 'nominated' ? t('hire.chNominatedNoFine') : '0.00'}
                className={`${inputCls} ${chargeType === 'pcn' && pcnKind === 'nominated' ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.chAdminFee')}</label>
              <input type="number" min="0" step="0.01" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
          </div>

          <p className="text-xs text-[#72A68E]">
            {t('hire.chVat')}: <span className="font-semibold text-[#012619] dark:text-white">{gbp(money.vatAmount)}</span>
            <span className="mx-2">·</span>
            {t('hire.chColTotal')}: <span className="font-bold text-[#025940] dark:text-[#b3f243]">{gbp(money.totalAmount)}</span>
          </p>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : t('hire.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Paste-PCNs modal ─────────────────────────────────────────────────────────

interface PreviewRow extends ParsedPcnRow {
  include: boolean
  customerId: string
  candidate: HireChargeCandidate | null
  adminFee: string
}

function PastePcnModal({
  organizationId,
  customers,
  actor,
  onClose,
  onSaved,
}: {
  organizationId: string
  customers: RentalCustomer[]
  actor: () => Promise<{ id: string | null; name: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)

  const feeFor = useCallback((custId: string | null): string => {
    if (!custId) return ''
    const c = customers.find((x) => x.id === custId)
    return c?.pcnAdminFee != null ? String(c.pcnAdminFee) : ''
  }, [customers])

  const parse = async () => {
    const parsed = parsePcnPaste(text)
    if (parsed.length === 0) {
      toast.error(t('hire.chParseNone'))
      return
    }
    setParsing(true)
    try {
      // Resolve the liable customer per unique registration (paid date as the
      // best available approximation of the incident date).
      const uniqueRegs = Array.from(new Set(parsed.map((r) => r.registration)))
      const candByReg = new Map<string, HireChargeCandidate | null>()
      for (const reg of uniqueRegs) {
        const dated = parsed.find((r) => r.registration === reg && r.paidDate)
        const cands = await hireChargeService.getCandidatesForReg(organizationId, reg, dated?.paidDate || null)
        candByReg.set(reg, cands[0] || null)
      }
      setRows(parsed.map((r) => {
        const cand = candByReg.get(r.registration) || null
        const custId = cand?.customerId || ''
        return { ...r, include: true, customerId: custId, candidate: cand, adminFee: feeFor(custId || null) }
      }))
    } finally {
      setParsing(false)
    }
  }

  const patchRow = (i: number, patch: Partial<PreviewRow>) =>
    setRows((rs) => (rs ? rs.map((r, ri) => (ri === i ? { ...r, ...patch } : r)) : rs))

  const included = (rows || []).filter((r) => r.include)

  const save = async () => {
    if (!rows || included.length === 0) return
    setSaving(true)
    try {
      const a = await actor()
      let created = 0
      for (const r of included) {
        const cust = customers.find((c) => c.id === r.customerId)
        const base = r.kind === 'paid' ? (r.paidAmount ?? r.pcnAmount ?? 0) : 0
        const admin = parseFloat(r.adminFee) || 0
        const money = computeChargeMoney('pcn', base, admin)
        const useCand = r.candidate && r.candidate.customerId === r.customerId ? r.candidate : null
        await hireChargeService.createCharge({
          organizationId,
          chargeType: 'pcn',
          pcnKind: r.kind,
          reference: r.reference,
          issuer: r.issuer,
          registration: r.registration,
          customerId: r.customerId || null,
          customerName: cust ? (cust.companyName || cust.name) : null,
          agreementId: useCand?.agreementId ?? null,
          agreementReference: useCand?.agreementReference ?? null,
          lineId: useCand?.lineId ?? null,
          incidentDate: r.paidDate,
          baseAmount: base,
          adminFee: admin,
          vatAmount: money.vatAmount,
          totalAmount: money.totalAmount,
          createdBy: a.id,
          createdByName: a.name,
        })
        created++
      }
      toast.success(t('hire.chPasteDone', { count: created }))
      onSaved()
    } catch {
      toast.error(t('hire.needMigrations'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4 text-[#b3f243]" /> {t('hire.chPastePcns')}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          {!rows ? (
            <>
              <p className="text-xs text-[#72A68E]">{t('hire.chPasteHint')}</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={'VK25NZB\tYT74355207\tPARKING SOLUTIONS\nVK25NKO\t73563280\t£85.09\t£85.09\t29.06.2026'}
                className={`${inputCls} font-mono text-xs`}
              />
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
                <button onClick={parse} disabled={parsing || !text.trim()} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {parsing ? t('hire.loading') : t('hire.chParse')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-[#72A68E]">{t('hire.chPreviewHint', { count: rows.length })}</p>
              <div className="overflow-x-auto rounded-xl border border-[#e2e8e5] dark:border-gray-700">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="bg-[#f0f4f2] dark:bg-gray-800 text-left text-[11px] text-[#4a5e54] dark:text-gray-300">
                      <th className="px-2 py-2"></th>
                      <th className="px-2 py-2 font-semibold">{t('hire.chColVehicle')}</th>
                      <th className="px-2 py-2 font-semibold">{t('hire.chColRef')}</th>
                      <th className="px-2 py-2 font-semibold">{t('hire.chKindLabel')}</th>
                      <th className="px-2 py-2 font-semibold text-right">{t('hire.chFineAmount')}</th>
                      <th className="px-2 py-2 font-semibold">{t('hire.chColCustomer')}</th>
                      <th className="px-2 py-2 font-semibold text-right">{t('hire.chAdminFee')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.include ? '' : 'opacity-40'}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={r.include} onChange={(e) => patchRow(i, { include: e.target.checked })} className="w-4 h-4 accent-[#025940]" />
                        </td>
                        <td className="px-2 py-1.5 font-mono font-bold text-[#012619] dark:text-white whitespace-nowrap">{r.registration}</td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.reference || '—'}</td>
                        <td className="px-2 py-1.5">
                          <select value={r.kind} onChange={(e) => patchRow(i, { kind: e.target.value as HirePcnKind })} className={smallInputCls}>
                            <option value="nominated">{t('hire.chKindNominated')}</option>
                            <option value="paid">{t('hire.chKindPaid')}</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {r.kind === 'paid' ? gbp(r.paidAmount ?? r.pcnAmount ?? 0) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={r.customerId}
                            onChange={(e) => patchRow(i, { customerId: e.target.value, adminFee: feeFor(e.target.value || null) })}
                            className={`${smallInputCls} max-w-[170px]`}
                          >
                            <option value="">{t('hire.chNoCustomer')}</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>{c.companyName || c.name}</option>
                            ))}
                          </select>
                          {r.candidate && r.candidate.customerId === r.customerId && r.candidate.agreementReference && (
                            <span className="block text-[10px] text-[#72A68E] mt-0.5">{r.candidate.agreementReference}</span>
                          )}
                          {!r.customerId && (
                            <span className="block text-[10px] text-amber-600 mt-0.5">{t('hire.chNoMatch')}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number" min="0" step="0.01"
                            value={r.adminFee}
                            onChange={(e) => patchRow(i, { adminFee: e.target.value })}
                            className={`${smallInputCls} w-20 text-right`}
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRows(null)} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.chBack')}</button>
                <button onClick={save} disabled={saving || included.length === 0} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {saving ? t('hire.saving') : t('hire.chCreateN', { count: included.length })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
