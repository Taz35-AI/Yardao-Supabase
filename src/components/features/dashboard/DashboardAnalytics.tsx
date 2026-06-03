// src/components/features/dashboard/DashboardAnalytics.tsx
'use client'

import React from 'react'
import { AnalyticsCard } from '@/components/common/Analytics/AnalyticsCard'
import { Car, CheckCircle2, Activity, TrendingUp } from 'lucide-react'
import { Analytics } from '@/types'
import { useT } from '@/lib/i18n'

interface DashboardAnalyticsProps {
  analytics: Analytics
  onSizeCardClick?: () => void
  onConditionCardClick?: () => void
  onStatusCardClick?: () => void
  className?: string
}

export const DashboardAnalytics = React.memo(function DashboardAnalytics({
  analytics,
  onSizeCardClick,
  onConditionCardClick,
  onStatusCardClick,
  className = ''
}: DashboardAnalyticsProps) {
  const t = useT()
  const {
    totalCount,
    readyCount,
    needsCheckingCount
  } = analytics

  const utilizationRate = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 ${className}`}>
      <AnalyticsCard
        title={t('dashboard.analytics.totalVehicles')}
        value={totalCount}
        icon={Car}
        gradientFrom="from-blue-500"
        gradientTo="to-blue-600"
        onClick={onSizeCardClick}
      />
      
      <AnalyticsCard
        title={t('dashboard.analytics.readyVehicles')}
        value={readyCount}
        icon={CheckCircle2}
        gradientFrom="from-green-500"
        gradientTo="to-green-600"
        onClick={onStatusCardClick}
      />
      
      <AnalyticsCard
        title={t('dashboard.analytics.needsChecking')}
        value={needsCheckingCount}
        icon={Activity}
        gradientFrom="from-orange-500"
        gradientTo="to-orange-600"
        onClick={onConditionCardClick}
      />
      
      <AnalyticsCard
        title={t('dashboard.analytics.utilizationRate')}
        value={`${utilizationRate}%`}
        icon={TrendingUp}
        gradientFrom="from-purple-500"
        gradientTo="to-purple-600"
      />
    </div>
  )
})