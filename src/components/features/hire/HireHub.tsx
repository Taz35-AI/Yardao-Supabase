// src/components/features/hire/HireHub.tsx
// Premium hire workspace: segmented tabs (renamable label). KPIs live in Overview.
'use client'

import React, { useState } from 'react'
import { Users, CalendarRange, Coins, Settings, LayoutDashboard, Receipt } from 'lucide-react'
import { ContractIcon } from './ContractIcon'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import { HireOverview } from './HireOverview'
import { HireCustomers } from './HireCustomers'
import { HireAgreements } from './HireAgreements'
import { HireGantt } from './HireGantt'
import { HireCredits } from './HireCredits'
import { HireCharges } from './HireCharges'
import { HireSettingsModal } from './HireSettingsModal'

type Tab = 'overview' | 'customers' | 'agreements' | 'schedule' | 'credits' | 'charges'

export function HireHub() {
  const t = useT()
  const { settings } = useHire()
  const [tab, setTab] = useState<Tab>('overview')
  const [showSettings, setShowSettings] = useState(false)

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'overview', icon: <LayoutDashboard className="w-4 h-4" />, label: t('hire.tabOverview') },
    { key: 'customers', icon: <Users className="w-4 h-4" />, label: t('hire.tabCustomers') },
    { key: 'agreements', icon: <ContractIcon className="w-4 h-4" />, label: settings.agreementLabelPlural },
    { key: 'schedule', icon: <CalendarRange className="w-4 h-4" />, label: t('hire.tabSchedule') },
    { key: 'credits', icon: <Coins className="w-4 h-4" />, label: t('hire.tabCredits') },
    { key: 'charges', icon: <Receipt className="w-4 h-4" />, label: t('hire.tabCharges') },
  ]

  return (
    <div className="space-y-4">
      {/* Tabs + settings */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-1 shadow-sm overflow-x-auto">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-xs sm:text-[13px] font-semibold whitespace-nowrap transition-all ${
                tab === tb.key
                  ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm'
                  : 'text-[#4a5e54] dark:text-gray-400 hover:bg-[#f0f4f2] dark:hover:bg-gray-700/50'
              }`}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowSettings(true)}
          title={t('hire.settings')}
          className="p-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940] hover:border-[#72A68E] dark:hover:text-[#b3f243] shadow-sm transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {tab === 'overview' && <HireOverview />}
      {tab === 'customers' && <HireCustomers />}
      {tab === 'agreements' && <HireAgreements />}
      {tab === 'schedule' && <HireGantt />}
      {tab === 'credits' && <HireCredits />}
      {tab === 'charges' && <HireCharges />}

      {showSettings && <HireSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
