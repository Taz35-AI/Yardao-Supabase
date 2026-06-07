import { useMemo } from 'react'
import { Activity, TrendingUp, AlertCircle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useT } from '@/lib/i18n'

// Types
interface CheckedInVehicle {
  id: string
  registration: string
  status: string
  hireStatus: string
  [key: string]: any
}

interface FleetUtilizationSnapshotProps {
  vehicles: CheckedInVehicle[]
  totalFleetCount?: number
}

interface SnapshotData {
  totalVehicles: number
  outOnHire: number
  inYard: number
  readyToRent: number
  pendingChecks: number
  repairsNeeded: number
  nonStarters: number
  utilizationRate: number
  availableCapacity: number
  unavailableVehicles: number
  snapshotAt: Date
}

// Custom Icon Components - ALL SAME SIZE (32x32px)
const OutOnHireIcon = () => {
  const t = useT()
  return (
    <img
      src="/reports/out-on-hire.png"
      alt={t('dashboard.fleetUtil.altOutOnHire')}
      className="w-8 h-8"
      style={{ objectFit: 'contain' }}
    />
  )
}

const ReadyToRentIcon = () => {
  const t = useT()
  return (
    <img
      src="/reports/ready-to-rent.png"
      alt={t('dashboard.fleetUtil.altReadyToRent')}
      className="w-8 h-8"
      style={{ objectFit: 'contain' }}
    />
  )
}

const PendingChecksIcon = () => {
  const t = useT()
  return (
    <img
      src="/reports/pending-checks.png"
      alt={t('dashboard.fleetUtil.altPendingChecks')}
      className="w-8 h-8"
      style={{ objectFit: 'contain' }}
    />
  )
}

const RepairsNeededIcon = () => {
  const t = useT()
  return (
    <img
      src="/reports/repairs-needed.png"
      alt={t('dashboard.fleetUtil.altRepairsNeeded')}
      className="w-8 h-8"
      style={{ objectFit: 'contain' }}
    />
  )
}

const NonStarterIcon = () => {
  const t = useT()
  return (
    <img
      src="/reports/non-starter.png"
      alt={t('dashboard.fleetUtil.altNonStarter')}
      className="w-8 h-8"
      style={{ objectFit: 'contain' }}
    />
  )
}

export default function FleetUtilizationSnapshot({ vehicles, totalFleetCount }: FleetUtilizationSnapshotProps) {
  const t = useT()

  // Calculate snapshot data
  const snapshot = useMemo((): SnapshotData => {
    const totalVehicles = vehicles.length

    const outOnHire = vehicles.filter(v => v.hireStatus === 'Out on Hire').length
    // Physically in the yard: In Yard hire-state AND not away at a garage / in transit.
    const inYard = vehicles.filter(v => v.hireStatus === 'In Yard' && !v.transferStatus).length

    const readyToRent = vehicles.filter(
      v => v.status === 'Ready' && v.hireStatus === 'In Yard'
    ).length

    const pendingChecks = vehicles.filter(
      v => v.status === 'Pending checks' && v.hireStatus === 'In Yard'
    ).length

    const repairsNeeded = vehicles.filter(
      v => v.status === 'Repairs needed' && v.hireStatus === 'In Yard'
    ).length

    const nonStarters = vehicles.filter(
      v => v.status === 'Non-Starter' && v.hireStatus === 'In Yard'
    ).length

    const utilizationRate = totalVehicles > 0 
      ? Math.round((outOnHire / totalVehicles) * 100 * 10) / 10 
      : 0

    const unavailableVehicles = repairsNeeded + nonStarters

    return {
      totalVehicles,
      outOnHire,
      inYard,
      readyToRent,
      pendingChecks,
      repairsNeeded,
      nonStarters,
      utilizationRate,
      availableCapacity: readyToRent,
      unavailableVehicles,
      snapshotAt: new Date()
    }
  }, [vehicles])

  // Prepare pie chart data - ORDERED BY PRIORITY
  const statusPieData = [
    { name: t('dashboard.fleetUtil.pieOutOnHire'), value: snapshot.outOnHire, color: '#025940', priority: 1 },
    { name: t('dashboard.fleetUtil.pieReadyToRent'), value: snapshot.readyToRent, color: '#72A68E', priority: 2 },
    { name: t('dashboard.fleetUtil.piePendingChecks'), value: snapshot.pendingChecks, color: '#fcd34d', priority: 3 },
    { name: t('dashboard.fleetUtil.pieRepairsNeeded'), value: snapshot.repairsNeeded, color: '#fb923c', priority: 4 },
    { name: t('dashboard.fleetUtil.pieNonStarters'), value: snapshot.nonStarters, color: '#dc2626', priority: 5 }
  ].filter(item => item.value > 0)

  const availabilityPieData = [
    { name: t('dashboard.fleetUtil.availAvailable'), value: snapshot.readyToRent, color: '#72A68E', priority: 1 },
    { name: t('dashboard.fleetUtil.availPending'), value: snapshot.pendingChecks, color: '#fcd34d', priority: 2 },
    { name: t('dashboard.fleetUtil.availUnavailable'), value: snapshot.unavailableVehicles, color: '#dc2626', priority: 3 }
  ].filter(item => item.value > 0)

  const getUtilizationColor = (rate: number) => {
    if (rate >= 70) return 'text-[#b3f243]'
    if (rate >= 40) return 'text-[#72A68E]'
    return 'text-yellow-500'
  }

  const getProgressColor = (rate: number) => {
    if (rate >= 70) return 'bg-[#b3f243]'
    if (rate >= 40) return 'bg-[#72A68E]'
    return 'bg-yellow-500'
  }

  const getUtilizationStatus = (rate: number) => {
    if (rate >= 70) return { text: t('dashboard.fleetUtil.statusExcellent'), icon: '🚀', color: 'text-[#b3f243]' }
    if (rate >= 40) return { text: t('dashboard.fleetUtil.statusGood'), icon: '✓', color: 'text-[#72A68E]' }
    return { text: t('dashboard.fleetUtil.statusLow'), icon: '⚠️', color: 'text-yellow-500' }
  }

  const status = getUtilizationStatus(snapshot.utilizationRate)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden h-full flex flex-col">
      {/* Header - PROFESSIONAL & MOBILE OPTIMIZED */}
      <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-4 sm:px-6 py-3 sm:py-4 border-b border-[#b3f243]/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#b3f243]/20 rounded-lg border border-[#b3f243]/30">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[#b3f243]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-white">
                {t('dashboard.fleetUtil.title')}
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 hidden sm:block">
                {t('dashboard.fleetUtil.realtimeSnapshot')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-[#b3f243]/20 rounded-lg border border-[#b3f243]/30">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#b3f243] animate-pulse" />
            <span className="text-xs sm:text-sm text-[#b3f243] font-semibold">{t('dashboard.fleetUtil.live')}</span>
          </div>
        </div>
      </div>

      {/* PROFESSIONAL LAYOUT - MOBILE FIRST */}
      <div className="flex-1 overflow-auto">
        {/* TOP SECTION: Key Metrics Row */}
        <div className="p-4 sm:p-6 bg-gradient-to-br from-[#b3f243]/5 to-[#72A68E]/5 dark:from-[#012619] dark:to-[#025940] border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* Utilization Rate - HERO METRIC */}
            <div className="col-span-2 sm:col-span-2 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 sm:p-6 border-2 border-gray-200 dark:border-gray-700 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-[#025940] dark:text-[#72A68E]" />
                  <span className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('dashboard.fleetUtil.utilizationRate')}</span>
                </div>
                <span className={`text-xs sm:text-sm font-bold ${status.color} flex items-center gap-1`}>
                  {status.icon} {status.text}
                </span>
              </div>
              <div className={`text-4xl sm:text-5xl font-bold mb-2 ${getUtilizationColor(snapshot.utilizationRate)}`}>
                {snapshot.utilizationRate}%
              </div>
              <div className="h-2 sm:h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getProgressColor(snapshot.utilizationRate)} transition-all duration-500 rounded-full`}
                  style={{ width: `${snapshot.utilizationRate}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                {t('dashboard.fleetUtil.outOnHireOverTotal')}
              </p>
            </div>

            {/* Fleet Summary Cards */}
            {totalFleetCount !== undefined && (
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 rounded-xl p-3 sm:p-4 border border-purple-200 dark:border-purple-600">
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">{t('dashboard.fleetUtil.totalFleet')}</p>
                <p className="text-2xl sm:text-3xl font-bold text-purple-900 dark:text-purple-300">
                  {totalFleetCount}
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-500 mt-1">{t('dashboard.fleetUtil.vehiclesLower')}</p>
              </div>
            )}
            
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl p-3 sm:p-4 border border-blue-200 dark:border-blue-600">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">{t('dashboard.fleetUtil.inYard')}</p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-300">
                {snapshot.inYard}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-500 mt-1">{t('dashboard.fleetUtil.checkedIn')}</p>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: Visual Charts */}
        <div className="p-4 sm:p-6 bg-white dark:bg-gray-800">
          <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <div className="w-1 h-5 bg-[#025940] rounded-full" />
            {t('dashboard.fleetUtil.fleetDistribution')}
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Status Distribution Chart */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-700 dark:to-gray-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
              <h4 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                {t('dashboard.fleetUtil.statusBreakdown')}
              </h4>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '3px solid #025940', 
                      borderRadius: '12px',
                      fontSize: '14px',
                      color: '#012619',
                      fontWeight: 'bold',
                      padding: '12px 16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                    formatter={(value: any, name: any) => [t('dashboard.fleetUtil.tooltipVehicles', { value }), name]}
                    labelStyle={{ color: '#025940', fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {statusPieData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-xs sm:text-sm p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Availability Chart */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-xl p-4 sm:p-6 border border-emerald-200 dark:border-emerald-700 shadow-sm">
              <h4 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                {t('dashboard.fleetUtil.availabilityAnalysis')}
              </h4>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={availabilityPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {availabilityPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '3px solid #025940', 
                      borderRadius: '12px',
                      fontSize: '14px',
                      color: '#012619',
                      fontWeight: 'bold',
                      padding: '12px 16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                    formatter={(value: any, name: any) => [t('dashboard.fleetUtil.tooltipVehicles', { value }), name]}
                    labelStyle={{ color: '#025940', fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {availabilityPieData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-xs sm:text-sm p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: Detailed Status Cards - PRIORITIZED ORDER */}
        <div className="p-4 sm:p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <div className="w-1 h-5 bg-[#025940] rounded-full" />
            {t('dashboard.fleetUtil.detailedStatus')}
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* 1. OUT ON HIRE - Most Important */}
            <div className="bg-gradient-to-br from-[#025940] to-[#012619] rounded-xl p-4 border-2 border-[#b3f243]/30 shadow-lg transform hover:scale-105 transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-[#b3f243]/20 rounded-lg border-2 border-[#b3f243]/50 flex items-center justify-center w-12 h-12">
                  <OutOnHireIcon />
                </div>
                <div className="text-right">
                  <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                    {snapshot.outOnHire}
                  </div>
                  <div className="text-xs text-gray-300">
                    {t('dashboard.fleetUtil.percentOfYard', { percent: Math.round((snapshot.outOnHire / snapshot.totalVehicles) * 100) })}
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-white">{t('dashboard.fleetUtil.cardOutOnHire')}</p>
              <div className="mt-2 pt-2 border-t border-[#b3f243]/20">
                <p className="text-xs text-gray-300">{t('dashboard.fleetUtil.earningRevenue')}</p>
              </div>
            </div>

            {/* 2. READY TO RENT */}
            <div className="bg-gradient-to-br from-[#72A68E] to-[#C5D9D0] rounded-xl p-4 border-2 border-[#025940]/30 shadow-lg transform hover:scale-105 transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-white/80 rounded-lg border-2 border-[#025940]/30 flex items-center justify-center w-12 h-12">
                  <ReadyToRentIcon />
                </div>
                <div className="text-right">
                  <div className="text-3xl sm:text-4xl font-bold text-[#012619] mb-1">
                    {snapshot.readyToRent}
                  </div>
                  <div className="text-xs text-[#012619]/70">
                    {t('dashboard.fleetUtil.availableNow')}
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-[#012619]">{t('dashboard.fleetUtil.cardReadyToRent')}</p>
              <div className="mt-2 pt-2 border-t border-[#025940]/20">
                <p className="text-xs text-[#012619]/70">{t('dashboard.fleetUtil.immediateCapacity')}</p>
              </div>
            </div>

            {/* 3. PENDING CHECKS */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-xl p-4 border-2 border-yellow-300 dark:border-yellow-700 shadow-md transform hover:scale-105 transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-yellow-400 dark:border-yellow-600 flex items-center justify-center w-12 h-12">
                  <PendingChecksIcon />
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold text-yellow-900 dark:text-yellow-300 mb-1">
                    {snapshot.pendingChecks}
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">{t('dashboard.fleetUtil.cardPendingChecks')}</p>
              <div className="mt-2 pt-2 border-t border-yellow-300 dark:border-yellow-700">
                <p className="text-xs text-yellow-700 dark:text-yellow-500">{t('dashboard.fleetUtil.awaitingInspection')}</p>
              </div>
            </div>

            {/* 4. REPAIRS NEEDED */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-4 border-2 border-orange-300 dark:border-orange-700 shadow-md transform hover:scale-105 transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-orange-400 dark:border-orange-600 flex items-center justify-center w-12 h-12">
                  <RepairsNeededIcon />
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold text-orange-900 dark:text-orange-300 mb-1">
                    {snapshot.repairsNeeded}
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-400">{t('dashboard.fleetUtil.cardRepairsNeeded')}</p>
              <div className="mt-2 pt-2 border-t border-orange-300 dark:border-orange-700">
                <p className="text-xs text-orange-700 dark:text-orange-500">{t('dashboard.fleetUtil.inMaintenance')}</p>
              </div>
            </div>

            {/* 5. NON-STARTERS */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-4 border-2 border-red-300 dark:border-red-700 shadow-md transform hover:scale-105 transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-red-400 dark:border-red-600 flex items-center justify-center w-12 h-12">
                  <NonStarterIcon />
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold text-red-900 dark:text-red-300 mb-1">
                    {snapshot.nonStarters}
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-400">{t('dashboard.fleetUtil.cardNonStarters')}</p>
              <div className="mt-2 pt-2 border-t border-red-300 dark:border-red-700">
                <p className="text-xs text-red-700 dark:text-red-500">{t('dashboard.fleetUtil.criticalAttention')}</p>
              </div>
            </div>

            {/* 6. UNAVAILABLE SUMMARY */}
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-xl p-4 border-2 border-gray-300 dark:border-gray-600 shadow-md">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border-2 border-gray-400 dark:border-gray-500 flex items-center justify-center w-12 h-12">
                  <AlertCircle className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {snapshot.unavailableVehicles}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {t('dashboard.fleetUtil.percentOfYard', { percent: Math.round((snapshot.unavailableVehicles / snapshot.totalVehicles) * 100) })}
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('dashboard.fleetUtil.totalUnavailable')}</p>
              <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('dashboard.fleetUtil.lostCapacity')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* INSIGHTS - SMART ALERTS */}
        {(snapshot.utilizationRate < 40 || snapshot.unavailableVehicles > snapshot.totalVehicles * 0.15 || snapshot.utilizationRate >= 70) && (
          <div className="p-4 sm:p-6 space-y-3">
            {snapshot.utilizationRate >= 70 && (
              <div className="p-4 bg-gradient-to-r from-[#b3f243]/20 to-[#72A68E]/20 border-2 border-[#b3f243] rounded-xl shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="text-sm font-bold text-[#012619] dark:text-[#b3f243]">{t('dashboard.fleetUtil.excellentUtilTitle')}</p>
                    <p className="text-xs text-[#025940] dark:text-gray-300 mt-1">
                      {t('dashboard.fleetUtil.excellentUtilBody', { rate: snapshot.utilizationRate })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {snapshot.utilizationRate < 40 && (
              <div className="p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💡</span>
                  <div>
                    <p className="text-sm font-bold text-yellow-900 dark:text-yellow-400">{t('dashboard.fleetUtil.lowUtilTitle')}</p>
                    <p className="text-xs text-yellow-800 dark:text-yellow-500 mt-1">
                      {t('dashboard.fleetUtil.lowUtilBody', { count: snapshot.readyToRent })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {snapshot.unavailableVehicles > snapshot.totalVehicles * 0.15 && (
              <div className="p-4 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-2 border-red-300 dark:border-red-700 rounded-xl shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-red-900 dark:text-red-400">{t('dashboard.fleetUtil.highMaintTitle')}</p>
                    <p className="text-xs text-red-800 dark:text-red-500 mt-1">
                      {t('dashboard.fleetUtil.highMaintBody', { count: snapshot.unavailableVehicles, percent: Math.round((snapshot.unavailableVehicles / snapshot.totalVehicles) * 100) })}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}