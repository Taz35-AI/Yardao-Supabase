// src/components/features/hire/HireCredits.tsx
// Suggested-credit review board. Auto-scans downtime on open (on-hire vehicles
// that are off-road in garage/service/repair), lists all suggestions (incl.
// early-return ones from end-of-hire), and lets a manager Approve/Ignore/Resolve.
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Coins, AlertTriangle, Check, Ban, CheckCheck, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCreditService } from '@/lib/services/hireCreditService'
import { getDowntimeByReg } from '@/lib/services/hireDowntimeService'
import { prorationService } from '@/lib/services/prorationService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import type { HireCredit, HireCreditStatus } from '@/types/hire'
import { euDate } from './hireFormat'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const normReg = (r?: string | null) => (r || '').toUpperCase().replace(/\s+/g, '')

export function HireCredits() {
  const t = useT()
  const { user } = useAuth()
  const { organizationId } = useHire()
  const [credits, setCredits] = useState<HireCredit[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  // Scan on-hire vehicles that are off-road (external garage, repairs OR an
  // active internal/external service booking) → suggest downtime credits.
  const scanDowntime = useCallback(async () => {
    if (!organizationId) return
    const lines = await hireAgreementService.getActiveLines(organizationId)
    if (lines.length === 0) return
    const downtime = await getDowntimeByReg(organizationId)
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const today = ymd(todayDate)
    const tomorrowDate = new Date(todayDate)
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrow = ymd(tomorrowDate)
    for (const l of lines) {
      if (l.status !== 'active') continue
      const dt = downtime[normReg(l.registration)]
      if (!dt) continue
      // Only price downtime that has actually started (not a future booking).
      if (dt.since > today) continue
      await hireCreditService.suggestCredit({
        organizationId,
        agreementId: l.agreementId,
        lineId: l.id,
        vehicleId: l.vehicleId,
        registration: l.registration,
        reason: 'downtime',
        periodStart: dt.since,
        periodEnd: tomorrow, // inclusive of today, so a same-day garage visit = 1 day
        rateType: (l.lineRateType || 'weekly') as 'weekly' | 'monthly',
        rateAmount: l.lineRateAmount || 0,
        note: dt.label,
      })
    }
  }, [organizationId])

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    await scanDowntime()
    setCredits(await hireCreditService.getCredits(organizationId))
    setLoading(false)
  }, [organizationId, scanDowntime])

  useEffect(() => {
    load()
  }, [load])

  const rescan = async () => {
    setScanning(true)
    await load()
    setScanning(false)
    toast.success(t('hire.creditScanned'))
  }

  const act = async (c: HireCredit, status: HireCreditStatus) => {
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      await hireCreditService.setStatus(c.id, status, user?.uid || null, profile?.displayName || user?.email || 'Unknown')
      toast.success(t('hire.creditUpdated'))
      load()
    } catch {
      toast.error(t('hire.creditUpdated'))
    }
  }

  const reasonLabel = (r: string) =>
    r === 'downtime' ? t('hire.creditDowntime') : r === 'early_return' ? t('hire.creditEarlyReturn') : t('hire.creditManual')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#012619] dark:text-white">{t('hire.creditsTitle')}</h3>
        <button onClick={rescan} disabled={scanning} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E] disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} /> {t('hire.creditScan')}
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : credits.length === 0 ? (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-center py-12 px-6">
          <Coins className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#012619] dark:text-white">{t('hire.noCredits')}</p>
          <p className="text-[12.5px] text-[#72A68E] mt-1">{t('hire.noCreditsHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {credits.map((c) => (
            <div key={c.id} className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#012619] dark:text-white">{c.registration || '—'}</span>
                    <span className="text-xs text-[#72A68E]">{c.notes ? `${reasonLabel(c.reason)} · ${c.notes}` : reasonLabel(c.reason)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[#4a5e54] dark:text-gray-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>{euDate(c.periodStart)} → {euDate(c.periodEnd)}</span>
                    <span className="text-[#72A68E]">· {t('hire.creditDays', { days: c.days ?? 0 })}</span>
                    {typeof c.estimatedCredit === 'number' && (
                      <span className="font-semibold text-[#012619] dark:text-white">· {t('hire.creditEstimated')} £{c.estimatedCredit}</span>
                    )}
                  </div>
                </div>
                <StatusChip status={c.status} t={t} />
              </div>
              {c.status === 'suggested' && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Act onClick={() => act(c, 'approved')} tone="green"><Check className="w-3.5 h-3.5" />{t('hire.approve')}</Act>
                  <Act onClick={() => act(c, 'ignored')} tone="muted"><Ban className="w-3.5 h-3.5" />{t('hire.ignore')}</Act>
                  <Act onClick={() => act(c, 'resolved')} tone="blue"><CheckCheck className="w-3.5 h-3.5" />{t('hire.resolve')}</Act>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusChip({ status, t }: { status: HireCreditStatus; t: (k: string) => string }) {
  const map: Record<HireCreditStatus, { label: string; cls: string }> = {
    suggested: { label: t('hire.creditSuggested'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    approved: { label: t('hire.creditApproved'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    ignored: { label: t('hire.creditIgnored'), cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
    resolved: { label: t('hire.creditResolved'), cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  }
  const m = map[status]
  return <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0 ${m.cls}`}>{m.label}</span>
}

function Act({ onClick, tone, children }: { onClick: () => void; tone: 'green' | 'muted' | 'blue'; children: React.ReactNode }) {
  const cls = tone === 'green' ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
    : tone === 'blue' ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
  return <button onClick={onClick} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors ${cls}`}>{children}</button>
}
