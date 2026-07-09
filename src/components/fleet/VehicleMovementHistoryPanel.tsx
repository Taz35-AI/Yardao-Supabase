// src/components/fleet/VehicleMovementHistoryPanel.tsx
// Per-vehicle MOVEMENT timeline (distinct from Service History). Mounted on
// demand from the Fleet detail modal's "Movement History" tab and reused by the
// Reports page. Reads the unified activity_log for ONE vehicle over the last
// 365 days — check-outs, garage trips (out + back), hires, transfers, status &
// lifecycle changes — newest first. Read-only; data is written by the flows
// themselves (useVehicleTransfers, useYardData, vehicleHireService, …).
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Route, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Building2,
  Truck, CalendarClock, Activity, Gauge, FileText, ShieldCheck, MessageSquare,
  PlusCircle, MinusCircle, Hash, Clock,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { activityLogService, type ActivityRecord, type ActivityActionType } from '@/lib/services/activityLogService'

interface Props {
  registration: string
  make?: string
  model?: string
  /** Lookback window in days (default 365). */
  days?: number
  /** When true, the org is resolved internally; pass a known orgId to skip that. */
  organizationId?: string | null
}

type Tone = 'green' | 'emerald' | 'orange' | 'amber' | 'purple' | 'indigo' | 'blue' | 'slate' | 'red'

const TONE: Record<Tone, { band: string; chip: string; icon: string }> = {
  green:   { band: 'bg-[#025940]', chip: 'bg-[#e6f4ec] text-[#0d6b2e]', icon: 'text-[#025940]' },
  emerald: { band: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', icon: 'text-emerald-600' },
  orange:  { band: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700', icon: 'text-orange-600' },
  amber:   { band: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', icon: 'text-amber-600' },
  purple:  { band: 'bg-purple-500', chip: 'bg-purple-50 text-purple-700', icon: 'text-purple-600' },
  indigo:  { band: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700', icon: 'text-indigo-600' },
  blue:    { band: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700', icon: 'text-blue-600' },
  slate:   { band: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700', icon: 'text-slate-500' },
  red:     { band: 'bg-red-500', chip: 'bg-red-50 text-red-700', icon: 'text-red-600' },
}

const ACTION: Record<ActivityActionType | 'default', { icon: React.ElementType; label: string; tone: Tone }> = {
  checkout:             { icon: ArrowUpRight,   label: 'Checked out',    tone: 'slate' },
  checkin:              { icon: ArrowDownLeft,  label: 'Checked in',     tone: 'green' },
  garage_out:           { icon: Building2,      label: 'To garage',      tone: 'orange' },
  garage_return:        { icon: Building2,      label: 'From garage',    tone: 'emerald' },
  garage_booking:       { icon: CalendarClock,  label: 'Garage booked',  tone: 'amber' },
  hire:                 { icon: Truck,          label: 'Out on hire',    tone: 'purple' },
  return:               { icon: Truck,          label: 'Off hire',       tone: 'indigo' },
  transfer:             { icon: ArrowLeftRight, label: 'Transfer',       tone: 'blue' },
  status_changed:       { icon: Activity,       label: 'Status',         tone: 'slate' },
  condition_changed:    { icon: Gauge,          label: 'Condition',      tone: 'slate' },
  contract_changed:     { icon: FileText,       label: 'Contract',       tone: 'slate' },
  insurance_changed:    { icon: ShieldCheck,    label: 'Insurance',      tone: 'slate' },
  comment:              { icon: MessageSquare,  label: 'Note',           tone: 'slate' },
  vehicle_added:        { icon: PlusCircle,     label: 'Added',          tone: 'green' },
  defleet:              { icon: MinusCircle,    label: 'Defleeted',      tone: 'red' },
  registration_changed: { icon: Hash,           label: 'Reg changed',    tone: 'slate' },
  rental_on_hire:       { icon: Truck,          label: 'On hire',        tone: 'purple' },
  rental_swap:          { icon: ArrowLeftRight, label: 'Vehicle swap',   tone: 'blue' },
  rental_end:           { icon: Truck,          label: 'Hire ended',     tone: 'indigo' },
  rental_temp_return:   { icon: ArrowDownLeft,  label: 'Temp return',    tone: 'amber' },
  rental_renew:         { icon: Activity,       label: 'Renewed',        tone: 'purple' },
  rental_extend:        { icon: CalendarClock,  label: 'Extended',       tone: 'purple' },
  rental_split_renew:   { icon: Activity,       label: 'Renewed (split)', tone: 'purple' },
  default:              { icon: Activity,       label: 'Event',          tone: 'slate' },
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function VehicleMovementHistoryPanel({ registration, days = 365, organizationId }: Props) {
  const t = useT()
  const { user } = useAuth()

  const [orgId, setOrgId] = useState<string | null>(organizationId ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<ActivityRecord[]>([])

  // Resolve org once (unless the caller supplied it).
  useEffect(() => {
    if (organizationId) { setOrgId(organizationId); return }
    let cancelled = false
    if (!user?.uid) return
    userProfileService.getProfile(user.uid)
      .then(p => { if (!cancelled) setOrgId(p?.organizationId || null) })
      .catch(err => {
        logger.error('MovementHistory: failed to resolve organization', err)
        if (!cancelled) { setError(t('fleet.movementHistory.errorLoad')); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [user?.uid, organizationId, t])

  const load = useCallback(async () => {
    if (!orgId || !registration) return
    setLoading(true)
    setError(null)
    try {
      const data = await activityLogService.getForVehicle(orgId, registration, days)
      setRecords(data)
    } catch {
      setError(t('fleet.movementHistory.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [orgId, registration, days, t])

  useEffect(() => { if (orgId) load() }, [orgId, load])

  return (
    <div className="p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#012619] dark:text-white">{t('fleet.movementHistory.title')}</p>
          <p className="text-[11px] text-[#8a9e94] mt-0.5">
            {!loading && records.length > 0
              ? t('fleet.movementHistory.countLabel', { count: records.length })
              : t('fleet.movementHistory.subtitle')}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#8a9e94]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">{t('fleet.movementHistory.loading')}</span>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-10">
          <Route className="w-8 h-8 text-[#c8d5ce] mx-auto mb-2" />
          <p className="text-sm text-[#8a9e94]">{t('fleet.movementHistory.empty')}</p>
          <p className="text-[11px] text-[#c8d5ce] mt-1 max-w-xs mx-auto">{t('fleet.movementHistory.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => {
            const cfg = ACTION[r.actionType] || ACTION.default
            const tone = TONE[cfg.tone]
            const Icon = cfg.icon
            return (
              <div
                key={r.id}
                className="flex items-stretch gap-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
              >
                <div className={`w-1 flex-shrink-0 ${tone.band}`} />
                <div className="flex items-start gap-3 py-3 pr-3.5 min-w-0 flex-1">
                  <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${tone.chip}`}>
                    <Icon className={`w-3.5 h-3.5 ${tone.icon}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${tone.chip}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[#012619] dark:text-white mt-1 leading-snug break-words">
                      {r.summary}
                    </p>
                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1.5 text-[11px] text-[#8a9e94]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />{fmtDateTime(r.createdAt)}
                      </span>
                      {r.actorName && (
                        <span>{t('fleet.movementHistory.byLabel')} <span className="font-semibold text-[#4a5e54] dark:text-gray-300">{r.actorName}</span></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
