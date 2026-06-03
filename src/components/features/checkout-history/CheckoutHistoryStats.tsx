// src/components/features/checkout-history/CheckoutHistoryStats.tsx
'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { 
  Car, 
  Users, 
  Calendar,
  TrendingUp,
  Clock,
  BarChart3
} from 'lucide-react'

interface CheckoutHistoryStatsProps {
  totalCheckouts: number
  totalVehicles: number
  uniqueUsers: string[]
  dateRange: number
  loading?: boolean
}

export function CheckoutHistoryStats({
  totalCheckouts,
  totalVehicles,
  uniqueUsers,
  dateRange,
  loading = false
}: CheckoutHistoryStatsProps) {

  const statsCards = [
    {
      title: 'Total Checkouts',
      value: loading ? '...' : totalCheckouts.toString(),
      description: `In the last ${dateRange} days`,
      icon: Car,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      title: 'Unique Vehicles',
      value: loading ? '...' : totalVehicles.toString(),
      description: 'Different vehicles checked out',
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Active Users',
      value: loading ? '...' : uniqueUsers.length.toString(),
      description: 'Users who checked out vehicles',
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    {
      title: 'Date Range',
      value: `${dateRange}d`,
      description: 'Days of history shown',
      icon: Calendar,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30'
    }
  ]

  // Calculate average checkouts per day
  const avgCheckoutsPerDay = dateRange > 0 ? (totalCheckouts / dateRange).toFixed(1) : '0'

  return (
    <div className="space-y-4">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className={`p-2 rounded-lg ${stat.bgColor} mr-3`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stat.value}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Additional Insights */}
      {!loading && totalCheckouts > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Average per day */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 mr-3">
                  <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Average per Day
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {avgCheckoutsPerDay}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Checkouts per day on average
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Utilization */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 mr-3">
                  <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Vehicle Utilization
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {totalVehicles > 0 ? (totalCheckouts / totalVehicles).toFixed(1) : '0'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Average checkouts per vehicle
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Users (if we have data) */}
      {!loading && uniqueUsers.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
              <Users className="w-4 h-4 mr-2 text-gray-500" />
              Most Active Users
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {uniqueUsers.slice(0, 6).map((userName, index) => (
                <div 
                  key={userName}
                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mr-2">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {index + 1}
                      </span>
                    </div>
                    <span className="text-sm text-gray-900 dark:text-white truncate">
                      {userName}
                    </span>
                  </div>
                </div>
              ))}
              {uniqueUsers.length > 6 && (
                <div className="flex items-center justify-center p-2 text-sm text-gray-500 dark:text-gray-400">
                  +{uniqueUsers.length - 6} more
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}