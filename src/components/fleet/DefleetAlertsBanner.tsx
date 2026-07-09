// src/components/fleet/DefleetAlertsBanner.tsx
// Inline "Upcoming defleets" panel for the fleet page. It's toggled open from a
// chip in the FleetAnalytics metric strip, so it reads as part of the page
// rather than a floating banner. Colour buckets at the 1/3/7/15/30-day
// milestones; click a chip to open the vehicle; Download exports the list.
'use client'

import React, { useMemo } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { FleetVehicle } from '@/types'
import { computeDefleetDue } from '@/lib/utils/defleetDue'
import { useT } from '@/lib/i18n'

export interface DefleetAlertItem {
  v: FleetVehicle
  dueDate: string
  daysLeft: number
  overdue: boolean
}

// Shared: vehicles overdue or due within `windowDays`, soonest-first.
export function computeDefleetItems(vehicles: FleetVehicle[], windowDays = 30): DefleetAlertItem[] {
  const out: DefleetAlertItem[] = []
  for (const v of vehicles) {
    if (v.isDefleeted) continue
    const due = computeDefleetDue(v.dateAcquired, (v as any).rentalTermWeeks, windowDays, (v as any).defleetDueDate)
    if (!due.dueDate || due.daysLeft == null) continue
    if (due.daysLeft > windowDays) continue
    out.push({ v, dueDate: due.dueDate, daysLeft: due.daysLeft, overdue: due.daysLeft < 0 })
  }
  out.sort((a, b) => a.daysLeft - b.daysLeft)
  return out
}

// Colour bucket by nearest milestone (1/3/7/15/30 days).
const pillClass = (daysLeft: number, overdue: boolean): string => {
  if (overdue || daysLeft <= 1) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  if (daysLeft <= 3)  return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
  if (daysLeft <= 7)  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  if (daysLeft <= 15) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
  return 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300'
}

interface Props {
  vehicles: FleetVehicle[]
  onView: (v: FleetVehicle) => void
  windowDays?: number
}

export function DefleetAlertsBanner({ vehicles, onView, windowDays = 30 }: Props) {
  const t = useT()
  const items = useMemo(() => computeDefleetItems(vehicles, windowDays), [vehicles, windowDays])
  const overdueCount = items.filter(i => i.overdue).length

  if (items.length === 0) return null

  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB')

  const daysBadge = (daysLeft: number, overdue: boolean) => {
    if (overdue) return t('fleet.defleetAlerts.overdueBadge', { days: Math.abs(daysLeft) })
    if (daysLeft === 0) return t('fleet.defleetAlerts.dueToday')
    return t('fleet.defleetAlerts.inDays', { days: daysLeft })
  }

  const handleDownload = () => {
    const data = items.map(({ v, dueDate, daysLeft, overdue }) => ({
      'Registration': v.registration || '',
      'Make': v.make || '',
      'Model': v.model || '',
      'Supplier': (v as any).supplier || '',
      'Defleet due': fmt(dueDate),
      'Status': overdue ? `Overdue ${Math.abs(daysLeft)}d` : daysLeft === 0 ? 'Due today' : `In ${daysLeft}d`,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 11 }, { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Upcoming defleets')
    XLSX.writeFile(wb, `upcoming-defleets-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="rounded-2xl border border-[#d9e3de] dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#eef2f0] dark:border-gray-800 bg-amber-50/50 dark:bg-amber-950/10">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-sm font-bold text-[#06251a] dark:text-amber-200 truncate">
            {t('fleet.defleetAlerts.title', { count: items.length })}
          </span>
          <span className="hidden sm:inline text-[11px] text-amber-700/80 dark:text-amber-300/70 truncate">
            {overdueCount > 0
              ? t('fleet.defleetAlerts.overdueSummary', { overdue: overdueCount, soon: items.length - overdueCount })
              : t('fleet.defleetAlerts.soonSummary', { count: items.length })}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          title={t('fleet.defleetAlerts.download')}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-white dark:bg-amber-900/30 border border-amber-300/70 dark:border-amber-700/50 hover:bg-amber-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('fleet.defleetAlerts.download')}</span>
        </button>
      </div>

      <div className="px-3 py-3 flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        {items.map(({ v, dueDate, daysLeft, overdue }) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#f8faf9] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 px-2.5 py-1.5 hover:shadow-sm hover:border-amber-300 transition-all"
            title={`${(v as any).supplier ? (v as any).supplier + ' · ' : ''}${fmt(dueDate)}`}
          >
            <span className="font-mono text-[11px] font-bold text-[#06251a] dark:text-gray-100">{v.registration}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{fmt(dueDate)}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pillClass(daysLeft, overdue)}`}>
              {daysBadge(daysLeft, overdue)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
