// src/components/fleet/DefleetAlertsBanner.tsx
// Fleet-page banner surfacing vehicles approaching / past their defleet-due
// date. Continuous window (default 30 days) with colour buckets at the
// 1 / 3 / 7 / 15 / 30-day milestones. Click a chip to open its detail modal.
'use client'

import React, { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { FleetVehicle } from '@/types'
import { computeDefleetDue } from '@/lib/utils/defleetDue'
import { useT } from '@/lib/i18n'

interface Props {
  vehicles: FleetVehicle[]
  onView: (v: FleetVehicle) => void
  windowDays?: number
}

interface AlertItem {
  v: FleetVehicle
  dueDate: string
  daysLeft: number
  overdue: boolean
}

// Colour bucket by nearest milestone (1/3/7/15/30 days).
const pillClass = (daysLeft: number, overdue: boolean): string => {
  if (overdue || daysLeft <= 1) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  if (daysLeft <= 3)  return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
  if (daysLeft <= 7)  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  if (daysLeft <= 15) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
  return 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300'
}

export function DefleetAlertsBanner({ vehicles, onView, windowDays = 30 }: Props) {
  const t = useT()

  const items = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = []
    for (const v of vehicles) {
      if (v.isDefleeted) continue
      const due = computeDefleetDue(
        v.dateAcquired,
        (v as any).rentalTermWeeks,
        windowDays,
        (v as any).defleetDueDate,
      )
      if (!due.dueDate || due.daysLeft == null) continue
      if (due.daysLeft > windowDays) continue
      out.push({ v, dueDate: due.dueDate, daysLeft: due.daysLeft, overdue: due.daysLeft < 0 })
    }
    out.sort((a, b) => a.daysLeft - b.daysLeft)
    return out
  }, [vehicles, windowDays])

  const overdueCount = items.filter(i => i.overdue).length

  // Default: expanded when anything is already overdue, otherwise collapsed.
  const [open, setOpen] = useState<boolean | null>(null)
  const expanded = open == null ? overdueCount > 0 : open

  if (items.length === 0) return null

  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB')

  const daysBadge = (daysLeft: number, overdue: boolean) => {
    if (overdue) return t('fleet.defleetAlerts.overdueBadge', { days: Math.abs(daysLeft) })
    if (daysLeft === 0) return t('fleet.defleetAlerts.dueToday')
    return t('fleet.defleetAlerts.inDays', { days: daysLeft })
  }

  return (
    <div className="mb-3 rounded-2xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-amber-900 dark:text-amber-200">
            {t('fleet.defleetAlerts.title', { count: items.length })}
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-300/70">
            {overdueCount > 0
              ? t('fleet.defleetAlerts.overdueSummary', { overdue: overdueCount, soon: items.length - overdueCount })
              : t('fleet.defleetAlerts.soonSummary', { count: items.length })}
          </div>
        </div>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-wrap gap-2">
          {items.map(({ v, dueDate, daysLeft, overdue }) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onView(v)}
              className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-gray-800 border border-amber-200 dark:border-gray-700 px-2.5 py-1.5 hover:shadow-sm transition-shadow"
              title={fmt(dueDate)}
            >
              <span className="font-mono text-[11px] font-bold text-[#06251a] dark:text-gray-100">{v.registration}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{fmt(dueDate)}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pillClass(daysLeft, overdue)}`}>
                {daysBadge(daysLeft, overdue)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
