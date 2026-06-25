// src/components/features/hire/HireHub.tsx
// Premium hire workspace: KPI strip + segmented tabs (renamable label).
'use client'

import React, { useEffect, useState } from 'react'
import { Users, CalendarRange, Coins, Settings, KeyRound, AlertTriangle, Clock } from 'lucide-react'
import { ContractIcon } from './ContractIcon'
import { useHire } from '@/contexts/HireContext'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { useT } from '@/lib/i18n'
import { HireCustomers } from './HireCustomers'
import { HireAgreements } from './HireAgreements'
import { HireGantt } from './HireGantt'
import { HireCredits } from './HireCredits'
import { HireSettingsModal } from './HireSettingsModal'
import { StatCard } from './hireUi'

type Tab = 'customers' | 'agreements' | 'schedule' | 'credits'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function HireHub() {
  const t = useT()
  const { settings, organizationId, refreshKey } = useHire()
  const [tab, setTab] = useState<Tab>('customers')
  const [showSettings, setShowSettings] = useState(false)
  const [stats, setStats] = useState({ onHire: 0, overdue: 0, reserved: 0, customers: 0 })

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      const [lines, customers] = await Promise.all([
        hireAgreementService.getActiveLines(organizationId),
        hireCustomerService.getCustomers(organizationId),
      ])
      if (cancelled) return
      const today = ymd(new Date())
      setStats({
        onHire: lines.filter((l) => l.status === 'active').length,
        reserved: lines.filter((l) => l.status === 'scheduled').length,
        overdue: lines.filter((l) => l.status === 'active' && l.scheduledEnd && l.scheduledEnd < today).length,
        customers: customers.length,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, refreshKey])

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'customers', icon: <Users className="w-4 h-4" />, label: t('hire.tabCustomers') },
    { key: 'agreements', icon: <ContractIcon className="w-4 h-4" />, label: settings.agreementLabelPlural },
    { key: 'schedule', icon: <CalendarRange className="w-4 h-4" />, label: t('hire.tabSchedule') },
    { key: 'credits', icon: <Coins className="w-4 h-4" />, label: t('hire.tabCredits') },
  ]

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard tone="forest" icon={<KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.kpiOnHire')} value={stats.onHire} />
        <StatCard tone="red" icon={<AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.kpiOverdue')} value={stats.overdue} />
        <StatCard tone="sky" icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.kpiReserved')} value={stats.reserved} />
        <StatCard tone="lime" icon={<Users className="w-4 h-4 sm:w-5 sm:h-5" />} label={t('hire.tabCustomers')} value={stats.customers} />
      </div>

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

      {tab === 'customers' && <HireCustomers />}
      {tab === 'agreements' && <HireAgreements />}
      {tab === 'schedule' && <HireGantt />}
      {tab === 'credits' && <HireCredits />}

      {showSettings && <HireSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
