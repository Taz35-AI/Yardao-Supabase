// src/components/features/profile/UserActivitySection.tsx
// FIXED: Uses new unified useCheckoutHistory hook (sees hires + transfers + checkouts)
'use client'

import React, { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useCheckoutHistory } from '@/hooks/useCheckoutHistory'
import { Car, Calendar, User, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

export function UserActivitySection() {
  const t = useT()
  const { user } = useAuth()

  // Pull from the unified hook — already has all activity types
  const { checkoutHistory, loading } = useCheckoutHistory()

  // Profile page = only MY activity
  const recentActivity = useMemo(() => {
    return checkoutHistory
      .filter(r => r.checkedOutBy === user?.uid)
      .slice(0, 10)
  }, [checkoutHistory, user?.uid])

  const stats = useMemo(() => {
    const mine = checkoutHistory.filter(r => r.checkedOutBy === user?.uid)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 86400000)
    const monthAgo = new Date(today.getTime() - 30 * 86400000)
    return {
      today: mine.filter(a => a.checkedOutDate >= today).length,
      week: mine.filter(a => a.checkedOutDate >= weekAgo).length,
      month: mine.filter(a => a.checkedOutDate >= monthAgo).length,
      total: mine.length,
    }
  }, [checkoutHistory, user?.uid])

  const formatTime = (date: Date) => {
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
    if (diffMin < 1) return t('profile.activity.justNow')
    if (diffMin < 60) return t('profile.activity.minAgo', { count: diffMin })
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return t('profile.activity.hourAgo', { count: diffH })
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return t('profile.activity.dayAgo', { count: diffD })
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const getActivityEmoji = (type?: string) => {
    switch (type) {
      case 'hire': return '🚗'
      case 'transfer': return '🔄'
      case 'external_garage': return '🔧'
      default: return '↗'
    }
  }

  const getActivityDot = (type?: string) => {
    switch (type) {
      case 'hire': return 'bg-purple-500'
      case 'transfer': return 'bg-blue-500'
      case 'external_garage': return 'bg-orange-500'
      default: return 'bg-emerald-500'
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 p-4 flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-[#025940]" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 overflow-hidden">
      {/* Mini stats */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700/60 border-b border-gray-100 dark:border-gray-700/60">
        {[
          { id: 'today', label: t('profile.activity.today'), value: stats.today },
          { id: 'week', label: t('profile.activity.week'), value: stats.week },
          { id: 'month', label: t('profile.activity.month'), value: stats.month },
          { id: 'total', label: t('profile.activity.total'), value: stats.total },
        ].map(s => (
          <div key={s.id} className="px-3 py-2.5 text-center">
            <p className="text-base font-bold text-[#025940] dark:text-[#72A68E]">{s.value}</p>
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div className="divide-y divide-gray-50 dark:divide-gray-700/40">
        {recentActivity.length === 0 ? (
          <div className="py-8 text-center">
            <Car className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-400">{t('profile.activity.noRecentActivity')}</p>
          </div>
        ) : (
          recentActivity.map((record) => (
            <div key={record.id} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
              {/* Type dot */}
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getActivityDot(record.activityType)}`} />

              {/* Vehicle info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-900 dark:text-white font-mono">
                    {record.registration}
                  </span>
                  <span className="text-[10px] text-gray-400 truncate">
                    {record.make} {record.model}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 truncate">
                  {getActivityEmoji(record.activityType)} {record.activityLabel || t('profile.activity.checkedOut')}
                  {record.checkedOutByName && (
                    <span className="ml-1">· {record.checkedOutByName}</span>
                  )}
                </p>
              </div>

              {/* Time */}
              <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
                {formatTime(record.checkedOutDate)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer link */}
      <div className="border-t border-gray-100 dark:border-gray-700/60 px-3.5 py-2.5">
        <Link
          href="/checkout-history"
          className="flex items-center justify-between text-xs font-medium text-[#025940] dark:text-[#72A68E] hover:text-[#012619] dark:hover:text-[#b3f243] transition-colors"
        >
          <span>{t('profile.activity.viewFullLog')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}