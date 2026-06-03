// src/components/features/service-bookings/booking-workspace/RulesInfoPanel.tsx
// Right column of the booking workspace. Pure presentational — explains how
// the booking rules engine prevents double-booking, mirroring the screenshot.
'use client'

import React from 'react'
import {
  ShieldCheck, Clock, Users, Search, Lock, CheckCircle2,
  Scale, Building, User, Timer, Zap,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

const STEPS = [
  { n: 1, icon: Clock },
  { n: 2, icon: Users },
  { n: 3, icon: Search },
  { n: 4, icon: Lock },
  { n: 5, icon: CheckCircle2 },
]

const RULES = [
  { icon: Building },
  { icon: User },
  { icon: Timer },
  { icon: Zap },
]

export function RulesInfoPanel() {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      {/* How overlap is prevented */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {t('serviceBookings.rules.overlapHeading')}
          </h3>
        </div>
        <ul className="space-y-2.5">
          {STEPS.map(({ n, icon: Icon }) => (
            <li key={n} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#025940] text-white text-[11px] font-bold flex items-center justify-center">
                {n}
              </span>
              <Icon className="w-4 h-4 text-[#025940] dark:text-[#72A68E] mt-1 flex-shrink-0" />
              <span className="text-xs text-gray-700 dark:text-gray-300 leading-snug pt-0.5">
                {t(`serviceBookings.rules.step${n}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Rules engine summary */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {t('serviceBookings.rules.engineHeading')}
          </h3>
        </div>
        <ul className="space-y-2.5">
          {RULES.map(({ icon: Icon }, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <Icon className="w-4 h-4 text-[#025940] dark:text-[#72A68E] mt-0.5 flex-shrink-0" />
              <span className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                {t(`serviceBookings.rules.rule${idx + 1}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default RulesInfoPanel
