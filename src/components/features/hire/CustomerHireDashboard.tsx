// src/components/features/hire/CustomerHireDashboard.tsx
// Per-customer B2B dashboard: active rentals with calendar-accurate prorated
// amounts to date, plus one-click Excel / PDF Rent Plan export.
'use client'

import React, { useEffect, useState } from 'react'
import { X, FileSpreadsheet, FileText, User, Loader2, Wallet, KeyRound, CalendarRange, History, ClipboardList, Contact, Pencil, Building2, Landmark, Phone, Mail, Globe, MapPin, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { hireReportService, type RentPlan } from '@/lib/services/hireReportService'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { activityLogService, type ActivityRecord } from '@/lib/services/activityLogService'
import { useT } from '@/lib/i18n'
import { euDate, rateLabel } from './hireFormat'
import { StatCard, EmptyState, Pill } from './hireUi'
import { AddCustomerModal } from './AddCustomerModal'
import type { HireAgreement, HireAgreementVehicle, RentalCustomer } from '@/types/hire'

type StatementGroup = { agreement: HireAgreement; lines: HireAgreementVehicle[] }

// True if a dd/mm/yyyy date string is before today (expired MOT / tax).
const isPast = (eu: string): boolean => {
  const [d, m, y] = (eu || '').split('/')
  if (!d || !m || !y) return false
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dt < today
}

export function CustomerHireDashboard({
  organizationId,
  customerId,
  customerName,
  isBusiness,
  onClose,
}: {
  organizationId: string | null
  customerId: string
  customerName: string
  isBusiness: boolean
  onClose: () => void
}) {
  const t = useT()
  const [plan, setPlan] = useState<RentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'rentals' | 'statement' | 'timeline' | 'details'>('rentals')
  const [timeline, setTimeline] = useState<ActivityRecord[] | null>(null)
  const [statement, setStatement] = useState<StatementGroup[] | null>(null)
  const [customer, setCustomer] = useState<RentalCustomer | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  // Full customer record (for the Details tab + edit). Reloaded after an edit.
  const loadCustomer = React.useCallback(async () => {
    if (!organizationId) return
    const c = await hireCustomerService.getCustomer(customerId)
    setCustomer(c)
  }, [organizationId, customerId])
  useEffect(() => { loadCustomer() }, [loadCustomer])

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const p = await hireReportService.buildRentPlan(organizationId, customerId, customerName)
      if (!cancelled) {
        setPlan(p)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, customerId, customerName])

  // Load the customer's activity timeline (across all their vehicles) on demand.
  useEffect(() => {
    if (view !== 'timeline' || timeline !== null || !organizationId) return
    let cancelled = false
    ;(async () => {
      const ags = await hireAgreementService.getAgreementsForCustomer(organizationId, customerId)
      const regs = new Set<string>()
      for (const ag of ags) {
        const lines = await hireAgreementService.getLines(organizationId, ag.id)
        for (const l of lines) if (l.registration) regs.add(l.registration)
      }
      const all = await Promise.all(Array.from(regs).map((r) => activityLogService.getForVehicle(organizationId, r)))
      const merged = all.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 80)
      if (!cancelled) setTimeline(merged)
    })()
    return () => {
      cancelled = true
    }
  }, [view, timeline, organizationId, customerId])

  // Full statement: EVERY contract (active, ended, expired, cancelled) + every
  // vehicle line (current and past) with its out/return dates. Loaded on demand.
  useEffect(() => {
    if (view !== 'statement' || statement !== null || !organizationId) return
    let cancelled = false
    ;(async () => {
      const ags = await hireAgreementService.getAgreementsForCustomer(organizationId, customerId)
      const groups = await Promise.all(
        ags.map(async (ag) => ({ agreement: ag, lines: await hireAgreementService.getLines(organizationId, ag.id) })),
      )
      if (!cancelled) setStatement(groups)
    })()
    return () => {
      cancelled = true
    }
  }, [view, statement, organizationId, customerId])

  const exportExcel = async () => {
    if (!plan) return
    try {
      await hireReportService.exportExcel(plan)
    } catch {
      toast.error('Export failed')
    }
  }
  const exportPdf = () => {
    if (!plan) return
    try {
      hireReportService.exportPdf(plan)
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-4xl sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {isBusiness ? (
              <img src="/b2b.png" alt="B2B" className="w-9 h-9 rounded-xl object-contain bg-white p-1 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#b3f243]/15 border border-[#b3f243]/30 flex items-center justify-center flex-shrink-0 text-[#b3f243]">
                <User className="w-[18px] h-[18px]" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate leading-tight">{customerName}</h2>
              <p className="text-[11px] text-[#72A68E] mt-0.5">{isBusiness ? t('hire.b2bAccount') : t('hire.individualAccount')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg flex-shrink-0"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 bg-[#f6f8f7] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-1">
              <button onClick={() => setView('rentals')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'rentals' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}><KeyRound className="w-3.5 h-3.5" />{t('hire.tabRentals')}</button>
              <button onClick={() => setView('statement')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'statement' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}><ClipboardList className="w-3.5 h-3.5" />{t('hire.tabStatement')}</button>
              <button onClick={() => setView('timeline')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'timeline' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}><History className="w-3.5 h-3.5" />{t('hire.tabTimeline')}</button>
              <button onClick={() => setView('details')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'details' ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm' : 'text-[#72A68E] hover:text-[#025940]'}`}><Contact className="w-3.5 h-3.5" />{t('hire.tabDetails')}</button>
            </div>
            {view === 'rentals' && (
              <div className="flex gap-1.5">
                <button onClick={exportExcel} disabled={!plan || plan.rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] shadow-sm hover:shadow-md hover:shadow-[#025940]/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none disabled:active:scale-100">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> {t('hire.exportExcel')}
                </button>
                <button onClick={exportPdf} disabled={!plan || plan.rows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-[#72A68E] hover:text-[#025940] transition-colors disabled:opacity-50">
                  <FileText className="w-3.5 h-3.5" /> {t('hire.exportPdf')}
                </button>
              </div>
            )}
          </div>

          {view === 'timeline' ? (
            timeline === null ? (
              <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : timeline.length === 0 ? (
              <EmptyState icon={<History className="w-7 h-7" />} title={t('hire.noTimeline')} />
            ) : (
              <ul className="relative space-y-3 pl-1">
                <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-[#e2e8e5] dark:bg-gray-700" aria-hidden />
                {timeline.map((e) => (
                  <li key={e.id} className="relative flex gap-3">
                    <span className="relative z-10 w-2.5 h-2.5 rounded-full bg-[#025940] ring-4 ring-white dark:ring-gray-900 mt-1 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-[#012619] dark:text-gray-200 leading-snug">{e.summary}</p>
                      <p className="text-[11px] text-[#72A68E] mt-0.5">{e.registration ? `${e.registration} · ` : ''}{euDate(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : view === 'statement' ? (
            <StatementView groups={statement} t={t} />
          ) : view === 'details' ? (
            <DetailsView customer={customer} isBusiness={isBusiness} onEdit={() => setShowEdit(true)} t={t} />
          ) : loading ? (
            <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : !plan || plan.rows.length === 0 ? (
            <EmptyState icon={<CalendarRange className="w-7 h-7" />} title={t('hire.noActiveRentals')} />
          ) : (
            <>
              {/* Summary KPI strip */}
              <div className={`grid gap-2.5 ${plan.weeklyTotal > 0 && plan.monthlyTotal > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <StatCard tone="forest" icon={<KeyRound className="w-4 h-4" />} label={t('hire.kpiOnHire')} value={plan.rows.length} />
                {plan.weeklyTotal > 0 && (
                  <StatCard tone="slate" icon={<Wallet className="w-4 h-4" />} label={t('hire.weeklyTotal')} value={`£${plan.weeklyTotal.toFixed(2)}`} />
                )}
                {plan.monthlyTotal > 0 && (
                  <StatCard tone="lime" icon={<Wallet className="w-4 h-4" />} label={t('hire.monthlyTotal')} value={`£${plan.monthlyTotal.toFixed(2)}`} />
                )}
              </div>

              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-x-auto shadow-sm">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#72A68E] bg-[#f6f8f7] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
                      <th className="px-3 py-2.5 font-bold">{t('hire.colContract')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colReg')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colMake')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colModel')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colSize')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colColour')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colMot')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colTax')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colStart')}</th>
                      <th className="px-3 py-2.5 font-bold">{t('hire.colEndDate')}</th>
                      <th className="px-3 py-2.5 font-bold text-right">{t('hire.colRate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                    {plan.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#f6f8f7] dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.agreementRef || '—'}</td>
                        <td className="px-3 py-2.5 font-mono font-bold text-[#012619] dark:text-white">{r.registration}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.make || '—'}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.model || '—'}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.size || '—'}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.colour || '—'}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${isPast(r.motExpiry) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[#4a5e54] dark:text-gray-300'}`}>{r.motExpiry || '—'}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${isPast(r.taxExpiry) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[#4a5e54] dark:text-gray-300'}`}>{r.taxExpiry || '—'}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.outDate}</td>
                        <td className="px-3 py-2.5 text-[#4a5e54] dark:text-gray-300">{r.contractEnd || '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#012619] dark:text-white">{r.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rate totals + any approved credits to apply */}
              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800 p-3.5 space-y-1.5 text-sm">
                {plan.weeklyTotal > 0 && (
                  <div className="flex items-center justify-between text-[#4a5e54] dark:text-gray-300">
                    <span>{t('hire.weeklyTotal')}</span>
                    <span className="font-bold tabular-nums text-[#012619] dark:text-white">£{plan.weeklyTotal.toFixed(2)}/wk</span>
                  </div>
                )}
                {plan.monthlyTotal > 0 && (
                  <div className="flex items-center justify-between text-[#4a5e54] dark:text-gray-300">
                    <span>{t('hire.monthlyTotal')}</span>
                    <span className="font-bold tabular-nums text-[#012619] dark:text-white">£{plan.monthlyTotal.toFixed(2)}/4wk</span>
                  </div>
                )}
                {plan.totalCredits > 0 && (
                  <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-[#e2e8e5] dark:border-gray-700 text-[#72A68E]">
                    <span>{t('hire.approvedCredits')}</span>
                    <span className="font-semibold tabular-nums">−£{plan.totalCredits.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showEdit && customer && (
        <AddCustomerModal
          organizationId={organizationId}
          editing={customer}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            loadCustomer()
          }}
        />
      )}
    </div>
  )
}

// ── Details: full customer record (company / contact / billing / bank) ────────
function DetailsView({
  customer,
  isBusiness,
  onEdit,
  t,
}: {
  customer: RentalCustomer | null
  isBusiness: boolean
  onEdit: () => void
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  if (!customer) {
    return <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
  }
  const c = customer
  const any = (...vals: (string | null | undefined)[]) => vals.some((v) => v && String(v).trim())

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onEdit} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] shadow-sm hover:shadow-md active:scale-[0.98] transition-all">
          <Pencil className="w-3.5 h-3.5" /> {t('hire.editCustomer')}
        </button>
      </div>

      {isBusiness && any(c.companyName, c.companyNumber, c.vatNumber, c.website, c.address) && (
        <DetailSection icon={<Building2 className="w-3.5 h-3.5" />} title={t('hire.secCompany')}>
          <DetailRow icon={<Building2 className="w-3.5 h-3.5" />} label={t('hire.custCompany')} value={c.companyName} />
          <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label={t('hire.custCompanyNo')} value={c.companyNumber} />
          <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label={t('hire.custVat')} value={c.vatNumber} />
          <DetailRow icon={<Globe className="w-3.5 h-3.5" />} label={t('hire.custWebsite')} value={c.website} />
          <DetailRow icon={<MapPin className="w-3.5 h-3.5" />} label={t('hire.custAddress')} value={c.address} />
        </DetailSection>
      )}

      <DetailSection icon={<User className="w-3.5 h-3.5" />} title={t('hire.secContact')}>
        <DetailRow icon={<User className="w-3.5 h-3.5" />} label={t('hire.custContact')} value={c.contactName} />
        <DetailRow icon={<Phone className="w-3.5 h-3.5" />} label={t('hire.custPhone')} value={c.phone} />
        <DetailRow icon={<Mail className="w-3.5 h-3.5" />} label={t('hire.custEmail')} value={c.email} />
        {!isBusiness && <DetailRow icon={<MapPin className="w-3.5 h-3.5" />} label={t('hire.custAddress')} value={c.address} />}
      </DetailSection>

      {any(c.accountNo, c.accountManager, c.billingEmail, c.billingAddress) && (
        <DetailSection icon={<Wallet className="w-3.5 h-3.5" />} title={t('hire.secBilling')}>
          <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label={t('hire.custAccountNo')} value={c.accountNo} />
          <DetailRow icon={<User className="w-3.5 h-3.5" />} label={t('hire.custAccountManager')} value={c.accountManager} />
          <DetailRow icon={<Mail className="w-3.5 h-3.5" />} label={t('hire.custBillingEmail')} value={c.billingEmail} />
          <DetailRow icon={<MapPin className="w-3.5 h-3.5" />} label={t('hire.custBillingAddress')} value={c.billingAddress} />
        </DetailSection>
      )}

      {any(c.bankAccountName, c.bankSortCode, c.bankAccountNumber) && (
        <DetailSection icon={<Landmark className="w-3.5 h-3.5" />} title={t('hire.secBank')}>
          <DetailRow icon={<User className="w-3.5 h-3.5" />} label={t('hire.custBankName')} value={c.bankAccountName} />
          <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label={t('hire.custSortCode')} value={c.bankSortCode} />
          <DetailRow icon={<Hash className="w-3.5 h-3.5" />} label={t('hire.custAccountNumber')} value={c.bankAccountNumber} />
        </DetailSection>
      )}

      {any(c.notes) && (
        <DetailSection icon={<ClipboardList className="w-3.5 h-3.5" />} title={t('hire.custNotes')}>
          <p className="text-sm text-[#012619] dark:text-gray-200 whitespace-pre-wrap leading-snug">{c.notes}</p>
        </DetailSection>
      )}
    </div>
  )
}

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#025940] dark:text-[#72A68E] mb-2.5">{icon}{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value || !String(value).trim()) return null
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-[#72A68E] mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.06em] text-[#72A68E] font-semibold">{label}</p>
        <p className="text-sm text-[#012619] dark:text-gray-200 break-words leading-snug">{value}</p>
      </div>
    </div>
  )
}

// ── Statement: full contract + vehicle history for the customer ───────────────
function StatementView({ groups, t }: { groups: StatementGroup[] | null; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (groups === null) {
    return <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
  }
  if (groups.length === 0) {
    return <EmptyState icon={<ClipboardList className="w-7 h-7" />} title={t('hire.statementEmpty')} hint={t('hire.statementEmptyHint')} />
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isExpired = (g: StatementGroup) =>
    !!g.agreement.endDate && new Date(g.agreement.endDate + 'T00:00:00') < today && g.agreement.status !== 'cancelled'

  const activeContracts = groups.filter((g) => g.agreement.status === 'active' || (g.agreement.status === 'draft' && !isExpired(g))).length
  const vehiclesEver = new Set(
    groups.flatMap((g) => g.lines.map((l) => (l.registration || '').toUpperCase().replace(/\s+/g, '')).filter(Boolean)),
  ).size

  const agStatus = (g: StatementGroup): { label: string; tone: 'green' | 'amber' | 'red' | 'slate' } => {
    if (g.agreement.status === 'cancelled') return { label: t('hire.statusCancelled'), tone: 'red' }
    if (g.agreement.status === 'completed') return { label: t('hire.statusCompleted'), tone: 'slate' }
    if (isExpired(g)) return { label: t('hire.statusExpired'), tone: 'amber' }
    if (g.agreement.status === 'active') return { label: t('hire.statusActive'), tone: 'green' }
    return { label: t('hire.statusDraft'), tone: 'slate' }
  }

  const lineLabel = (s: string) =>
    s === 'active' ? t('hire.lineActive')
      : s === 'returned' ? t('hire.lineReturned')
        : s === 'swapped' ? t('hire.lineSwapped')
          : s === 'cancelled' ? t('hire.statusCancelled')
            : t('hire.lineScheduled')

  const outDate = (l: HireAgreementVehicle) => euDate(l.actualOutAt ? l.actualOutAt.slice(0, 10) : l.scheduledStart)
  const inDate = (l: HireAgreementVehicle) => (l.actualReturnAt ? euDate(l.actualReturnAt.slice(0, 10)) : '—')

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard tone="forest" icon={<ClipboardList className="w-4 h-4" />} label={t('hire.stmtContracts')} value={groups.length} />
        <StatCard tone="lime" icon={<KeyRound className="w-4 h-4" />} label={t('hire.stmtActive')} value={activeContracts} />
        <StatCard tone="slate" icon={<CalendarRange className="w-4 h-4" />} label={t('hire.stmtVehicles')} value={vehiclesEver} />
      </div>

      {groups.map(({ agreement, lines }) => {
        const st = agStatus({ agreement, lines })
        return (
          <div key={agreement.id} className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#f6f8f7] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#012619] dark:text-white truncate">{agreement.reference || t('hire.agreement')}</p>
                <p className="text-[11px] text-[#72A68E]">{euDate(agreement.startDate)} → {agreement.isRolling ? t('hire.rolling') : euDate(agreement.endDate)}</p>
              </div>
              <Pill tone="lime">{rateLabel(agreement.rateType, agreement.rateAmount, t('hire.perWeek'), t('hire.perMonth'))}</Pill>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            {lines.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-[#72A68E]">{t('hire.noVehicles')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#72A68E] border-b border-[#eef2f0] dark:border-gray-700/60">
                    <th className="px-3 py-2 font-bold">{t('hire.colReg')}</th>
                    <th className="px-3 py-2 font-bold">{t('hire.colOut')}</th>
                    <th className="px-3 py-2 font-bold">{t('hire.colReturned')}</th>
                    <th className="px-3 py-2 font-bold text-right">{t('hire.colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f0] dark:divide-gray-700/60">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-mono font-bold text-[#012619] dark:text-white">{l.registration || '—'}</td>
                      <td className="px-3 py-2 text-[#4a5e54] dark:text-gray-300">{outDate(l) || '—'}</td>
                      <td className="px-3 py-2 text-[#4a5e54] dark:text-gray-300">{inDate(l)}</td>
                      <td className="px-3 py-2 text-right text-[#72A68E]">{lineLabel(l.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
