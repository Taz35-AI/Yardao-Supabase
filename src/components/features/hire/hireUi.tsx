// src/components/features/hire/hireUi.tsx
// Shared premium UI primitives for the Hire section — consistent brand styling.
'use client'

import React from 'react'

type Tone = 'forest' | 'lime' | 'amber' | 'red' | 'sky' | 'slate'

// Per-tone: soft card gradient, gradient icon badge (white icon), glow blob.
const TONE: Record<Tone, { card: string; badge: string; blob: string }> = {
  forest: { card: 'from-white to-[#025940]/[0.07] dark:from-gray-800 dark:to-[#025940]/20', badge: 'from-[#025940] to-[#012619]', blob: 'bg-[#025940]' },
  lime:   { card: 'from-white to-[#b3f243]/25 dark:from-gray-800 dark:to-[#b3f243]/10',      badge: 'from-[#6f9e22] to-[#3d6b1f]', blob: 'bg-[#b3f243]' },
  amber:  { card: 'from-white to-amber-50 dark:from-gray-800 dark:to-amber-900/15',          badge: 'from-amber-500 to-amber-700', blob: 'bg-amber-400' },
  red:    { card: 'from-white to-red-50 dark:from-gray-800 dark:to-red-900/15',              badge: 'from-red-500 to-red-700',     blob: 'bg-red-400' },
  sky:    { card: 'from-white to-sky-50 dark:from-gray-800 dark:to-sky-900/15',              badge: 'from-sky-500 to-sky-700',     blob: 'bg-sky-400' },
  slate:  { card: 'from-white to-slate-50 dark:from-gray-800 dark:to-gray-700/40',           badge: 'from-slate-500 to-slate-700', blob: 'bg-slate-400' },
}

/** Premium KPI stat card — gradient badge, tinted card, soft glow, hover lift. */
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
    <div className={`group relative overflow-hidden rounded-2xl border border-[#e2e8e5]/70 dark:border-gray-700 bg-gradient-to-br ${tn.card} px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
      <div className={`pointer-events-none absolute -right-5 -top-5 w-20 h-20 rounded-full ${tn.blob} opacity-[0.10] blur-2xl group-hover:opacity-20 transition-opacity`} />
      <div className="relative flex items-center gap-3">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${tn.badge} text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-black/10 ring-1 ring-white/15`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-[1.6rem] font-extrabold tabular-nums text-[#012619] dark:text-white leading-none tracking-tight">{value}</p>
          <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] font-bold text-[#72A68E] dark:text-gray-400 mt-1.5 truncate">{label}</p>
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
    <div className="rounded-2xl border border-dashed border-[#cdd9d2] dark:border-gray-700 bg-gradient-to-b from-[#f6f8f7] to-white dark:from-gray-800/40 dark:to-gray-900/20 text-center py-14 px-6">
      <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl bg-gradient-to-br from-[#025940]/10 to-[#b3f243]/15 dark:from-[#025940]/25 dark:to-[#b3f243]/10 flex items-center justify-center text-[#025940] dark:text-[#b3f243] ring-1 ring-[#025940]/10 shadow-sm">
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
