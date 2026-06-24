// src/components/features/hire/hireUi.tsx
// Shared premium UI primitives for the Hire section — consistent brand styling.
'use client'

import React from 'react'

type Tone = 'forest' | 'lime' | 'amber' | 'red' | 'sky' | 'slate'

const TONE: Record<Tone, { badge: string; icon: string; ring: string }> = {
  forest: { badge: 'bg-[#025940]/10 dark:bg-[#025940]/25', icon: 'text-[#025940] dark:text-[#b3f243]', ring: 'ring-[#025940]/15' },
  lime:   { badge: 'bg-[#b3f243]/20', icon: 'text-[#3d6b1f] dark:text-[#b3f243]', ring: 'ring-[#b3f243]/30' },
  amber:  { badge: 'bg-amber-100 dark:bg-amber-900/30', icon: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-200' },
  red:    { badge: 'bg-red-100 dark:bg-red-900/30', icon: 'text-red-600 dark:text-red-400', ring: 'ring-red-200' },
  sky:    { badge: 'bg-sky-100 dark:bg-sky-900/30', icon: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-200' },
  slate:  { badge: 'bg-slate-100 dark:bg-gray-700', icon: 'text-slate-500 dark:text-gray-300', ring: 'ring-slate-200' },
}

/** Premium KPI stat card with an icon badge. */
export function StatCard({
  icon,
  label,
  value,
  tone = 'forest',
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone?: Tone
}) {
  const tn = TONE[tone]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tn.badge} ${tn.icon}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-lg sm:text-2xl font-extrabold tabular-nums text-[#012619] dark:text-white leading-none">{value}</p>
          <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] font-semibold text-[#72A68E] dark:text-gray-400 mt-1 truncate">{label}</p>
        </div>
      </div>
    </div>
  )
}

/** Premium empty state — soft icon disc + copy. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cdd9d2] dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 text-center py-14 px-6">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#025940]/8 dark:bg-[#025940]/20 flex items-center justify-center text-[#72A68E] dark:text-[#b3f243]">
        {icon}
      </div>
      <p className="text-sm font-bold text-[#012619] dark:text-white">{title}</p>
      {hint && <p className="text-[12.5px] text-[#72A68E] dark:text-gray-400 mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** Small status pill. */
export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'sky' | 'slate' | 'lime' }) {
  const cls =
    tone === 'green' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : tone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        : tone === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          : tone === 'sky' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
            : tone === 'lime' ? 'bg-[#b3f243]/25 text-[#3d6b1f] dark:text-[#b3f243]'
              : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300'
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${cls}`}>{children}</span>
}

/** Premium primary button. */
export function PrimaryBtn({ onClick, children, className = '' }: { onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] shadow-sm hover:shadow-md hover:shadow-[#025940]/20 active:scale-[0.98] transition-all ${className}`}
    >
      {children}
    </button>
  )
}
