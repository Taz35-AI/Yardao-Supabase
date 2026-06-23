// src/components/features/hire/HireHub.tsx
// Tabs for the Hire section: Customers | Agreements (renamable label).
'use client'

import React, { useState } from 'react'
import { Users, FileText } from 'lucide-react'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import { HireCustomers } from './HireCustomers'
import { HireAgreements } from './HireAgreements'

type Tab = 'customers' | 'agreements'

export function HireHub() {
  const t = useT()
  const { settings } = useHire()
  const [tab, setTab] = useState<Tab>('customers')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-1 w-fit">
        <TabBtn active={tab === 'customers'} onClick={() => setTab('customers')} icon={<Users className="w-3.5 h-3.5" />} label={t('hire.tabCustomers')} />
        <TabBtn active={tab === 'agreements'} onClick={() => setTab('agreements')} icon={<FileText className="w-3.5 h-3.5" />} label={settings.agreementLabelPlural} />
      </div>

      {tab === 'customers' ? <HireCustomers /> : <HireAgreements />}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        active ? 'bg-[#025940] text-white' : 'text-[#72A68E] dark:text-gray-400 hover:text-[#012619] dark:hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
