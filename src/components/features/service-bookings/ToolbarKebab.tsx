// src/components/features/service-bookings/ToolbarKebab.tsx
// Mobile-only overflow menu for the service-bookings toolbar.
// Presentational + own open/close state; all actions are passed in so the
// real handlers/state stay owned by ServiceBookingsContent.
'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreVertical, RefreshCw, BarChart3, Calendar } from 'lucide-react'

interface ToolbarKebabProps {
  isAdmin: boolean
  refreshing: boolean
  onWorkingReport: () => void
  onCalendar: () => void
  onRefresh: () => void
  labels: { menu: string; workingReport: string; calendar: string; refresh: string }
}

export function ToolbarKebab({
  isAdmin,
  refreshing,
  onWorkingReport,
  onCalendar,
  onRefresh,
  labels,
}: ToolbarKebabProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const itemCls =
    'flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={labels.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden py-1"
        >
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => { setOpen(false); onWorkingReport() }}
            >
              <BarChart3 className="w-4 h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
              {labels.workingReport}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => { setOpen(false); onCalendar() }}
          >
            <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
            {labels.calendar}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => { setOpen(false); onRefresh() }}
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 flex-shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
            {labels.refresh}
          </button>
        </div>
      )}
    </div>
  )
}
