// src/app/reports/page.tsx - REDESIGNED: Shows BOTH Total Fleet AND Yard Stats
// ✅ FIXED: Added ProtectedRoute wrapper
// 💸 COST OPTIMIZED: Replaced 2 collection-wide onSnapshot listeners with
//    - getCountFromServer for fleet count (≤2 read units instead of N)
//    - getDocs + cache-first read for yard data (one-shot per visit, not streaming)
//    - localStorage cache + on-focus revalidation (no manual refresh button)
'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { CheckedInVehicle } from '@/types'
import { Navigation } from '@/components/Navigation'
import VehicleHireLookup from '@/components/dashboard/VehicleHireLookup'
import FleetUtilizationSnapshot from '@/components/dashboard/FleetUtilizationSnapshot'
import ProtectedRoute from '@/components/ProtectedRoute' // ✅ ADDED
import { BarChart3, TrendingUp, Activity, Search, Calendar, Car } from 'lucide-react'
import { logger } from '@/lib/logger'

// Cache TTLs — tuned so a user moving between pages within the same minute
// re-uses cached data, while still feeling fresh.
const FLEET_COUNT_TTL_MS = 5 * 60 * 1000   // fleet size changes rarely (defleet/add)
const YARD_TTL_MS = 60 * 1000              // yard movements happen frequently
const ORG_ID_CACHE_KEY = (uid: string) => `auth.orgId.${uid}`
const FLEET_COUNT_CACHE_KEY = (orgId: string) => `reports.fleetCount.${orgId}`
const YARD_CACHE_KEY = (orgId: string) => `reports.yard.${orgId}`

interface CachedFleetCount { count: number; ts: number }
interface CachedYard { vehicles: CheckedInVehicle[]; ts: number }

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeCache(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled — silently ignore, the page still works
  }
}

export default function AnalyticsDashboard() {
  return (
    <ProtectedRoute> {/* ✅ ADDED */}
      <Suspense fallback={
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#b3f243] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">Loading Analytics...</p>
          </div>
        </div>
      }>
        <AnalyticsDashboardContent />
      </Suspense>
    </ProtectedRoute> // ✅ ADDED
  )
}

function AnalyticsDashboardContent() {
  const { user } = useAuth()
  const [yardVehicles, setYardVehicles] = useState<CheckedInVehicle[]>([])
  const [totalFleetCount, setTotalFleetCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [organizationId, setOrganizationId] = useState<string>('')
  const [showSearchModal, setShowSearchModal] = useState(false)

  // Fetch the active fleet count via aggregation queries.
  // Cost: typically 2 read units total, regardless of fleet size, vs N reads
  // before. Honors a cache window so rapid re-visits don't re-hit the server.
  const refreshFleetCount = useCallback(async (orgId: string, force: boolean) => {
    const key = FLEET_COUNT_CACHE_KEY(orgId)
    const cached = readCache<CachedFleetCount>(key)
    if (cached && !force && Date.now() - cached.ts < FLEET_COUNT_TTL_MS) {
      setTotalFleetCount(cached.count)
      return
    }
    try {
      const baseQ = query(collection(db, 'vehicles'), where('organizationId', '==', orgId))
      const totalSnap = await getCountFromServer(baseQ)
      const total = totalSnap.data().count

      // Subtract defleeted. Defleet always writes both `currentStatus` and
      // `isDefleeted` together (see useFleetActions, useFleetData,
      // enhancedVehicleService) so a single field is enough.
      let defleeted = 0
      try {
        const defleetedQ = query(
          collection(db, 'vehicles'),
          where('organizationId', '==', orgId),
          where('currentStatus', '==', 'defleeted'),
        )
        const defleetedSnap = await getCountFromServer(defleetedQ)
        defleeted = defleetedSnap.data().count
      } catch (err) {
        // Composite index (organizationId + currentStatus) may not be deployed
        // yet — fall back to total. Slight overcount until the index is live.
        logger.error('Defleeted count query failed, falling back to total:', err)
      }

      const active = Math.max(total - defleeted, 0)
      setTotalFleetCount(active)
      writeCache(key, { count: active, ts: Date.now() } as CachedFleetCount)
    } catch (err) {
      logger.error('Failed to refresh fleet count:', err)
    }
  }, [])

  // Fetch the yard vehicle list. One-shot getDocs per visit instead of an
  // open onSnapshot stream, with localStorage caching so quick re-visits skip
  // the network entirely.
  const refreshYard = useCallback(async (orgId: string, force: boolean) => {
    const key = YARD_CACHE_KEY(orgId)
    const cached = readCache<CachedYard>(key)
    if (cached && !force && Date.now() - cached.ts < YARD_TTL_MS) {
      setYardVehicles(cached.vehicles)
      return
    }
    try {
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
      )
      const snap = await getDocs(yardQuery)
      const data: CheckedInVehicle[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as CheckedInVehicle))
      setYardVehicles(data)
      writeCache(key, { vehicles: data, ts: Date.now() } as CachedYard)
    } catch (err) {
      logger.error('Failed to refresh yard vehicles:', err)
    }
  }, [])

  // Initial load: resolve orgId (cached if seen before), paint from cache
  // immediately, then revalidate from server.
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let cancelled = false

    const init = async () => {
      try {
        // 1. Resolve organizationId — cache it so we don't re-fetch the user
        //    profile on every analytics visit.
        const orgKey = ORG_ID_CACHE_KEY(user.uid)
        let orgId = readCache<{ orgId: string }>(orgKey)?.orgId

        if (!orgId) {
          const userDocSnap = await getDoc(doc(db, 'userProfiles', user.uid))
          if (!userDocSnap.exists()) {
            logger.error('User profile not found')
            if (!cancelled) setLoading(false)
            return
          }
          orgId = userDocSnap.data().organizationId
          if (!orgId) {
            logger.error('No organization ID found')
            if (!cancelled) setLoading(false)
            return
          }
          writeCache(orgKey, { orgId })
        }

        if (cancelled) return
        setOrganizationId(orgId)

        // 2. Paint from cache instantly if available
        const cachedYard = readCache<CachedYard>(YARD_CACHE_KEY(orgId))
        if (cachedYard) setYardVehicles(cachedYard.vehicles)
        const cachedCount = readCache<CachedFleetCount>(FLEET_COUNT_CACHE_KEY(orgId))
        if (cachedCount) setTotalFleetCount(cachedCount.count)

        // 3. Revalidate from server (skipped if cache is still fresh)
        await Promise.all([
          refreshYard(orgId, false),
          refreshFleetCount(orgId, false),
        ])

        if (!cancelled) setLoading(false)
      } catch (err) {
        logger.error('Error initializing reports page:', err)
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [user, refreshYard, refreshFleetCount])

  // Refresh when the user re-focuses the tab — replaces the "always-live"
  // feel of the old listener without any manual button. The TTL gates inside
  // the refresh fns keep this from hammering the server.
  useEffect(() => {
    if (!organizationId) return
    const onVisible = () => {
      if (typeof document === 'undefined') return
      if (document.visibilityState !== 'visible') return
      void refreshYard(organizationId, false)
      void refreshFleetCount(organizationId, false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [organizationId, refreshYard, refreshFleetCount])

  // Calculate comprehensive stats
  const notCheckedIn = totalFleetCount - yardVehicles.length // Active vehicles not in yard
  const outOnHire = yardVehicles.filter(v => v.hireStatus === 'Out on Hire').length
  const inYard = yardVehicles.filter(v => v.hireStatus === 'In Yard').length

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#b3f243] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">Loading Analytics...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        {/* Compact Header */}
        <div className="bg-white dark:bg-gray-800 shadow-md border-b-2 border-gray-200 dark:border-gray-700">
          <div className="px-3 sm:px-4 lg:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-[#b3f243] to-[#72A68E] rounded-xl shadow-lg">
                  <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-[#012619]" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    Analytics Dashboard
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Activity className="w-3 h-3 sm:w-4 sm:h-4" />
                    Real-time fleet insights
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg shadow-lg border-2 border-purple-400">
                  <TrendingUp className="w-5 h-5 text-white" />
                  <div className="text-right">
                    <p className="text-xs text-purple-100 font-medium">Active Fleet</p>
                    <p className="text-xl font-bold text-white">{totalFleetCount || '...'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Full Width Layout */}
        <div className="px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
            {/* Left Column - Fleet Utilization (2/3 width on xl) */}
            <div className="xl:col-span-2">
              <FleetUtilizationSnapshot
                vehicles={yardVehicles}
                totalFleetCount={totalFleetCount}
              />
            </div>

            {/* Right Column - Quick Stats (1/3 width on xl) */}
            <div className="space-y-4">
              {/* Fleet Summary Card - COMPREHENSIVE STATS */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Car className="w-5 h-5 text-[#b3f243]" />
                  Fleet Summary
                </h3>
                <div className="space-y-4">
                  {/* ACTIVE FLEET */}
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg border-2 border-purple-300 dark:border-purple-600 shadow-md">
                    <div>
                      <span className="text-sm font-bold text-purple-700 dark:text-purple-300">Active Fleet</span>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Excluding defleeted</p>
                    </div>
                    <span className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                      {totalFleetCount || '...'}
                    </span>
                  </div>

                  {/* IN YARD */}
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">In Yard</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {yardVehicles.length}
                    </span>
                  </div>

                  {/* OUT ON HIRE */}
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Out on Hire</span>
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {outOnHire}
                    </span>
                  </div>

                  {/* NOT CHECKED IN / OTHER LOCATIONS */}
                  <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Not in Yard</span>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">With customers/other locations</p>
                    </div>
                    <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {notCheckedIn}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              <div className="bg-gradient-to-br from-[#012619] to-[#025940] rounded-xl shadow-lg p-6 border border-[#b3f243]/20">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#b3f243]" />
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowSearchModal(true)}
                    className="w-full p-3 bg-[#b3f243] hover:bg-[#a3e233] text-[#012619] font-semibold rounded-lg
                             transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    Search Vehicle History
                  </button>
                  <div className="text-xs text-gray-300 text-center pt-2">
                    More analytics features coming soon
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Info Card - Full Width */}
          <div className="mt-6 bg-gradient-to-r from-[#012619] to-[#025940] rounded-xl p-4 sm:p-6 border border-[#b3f243]/20 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="p-3 bg-[#b3f243]/10 rounded-lg border border-[#b3f243]/30">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-[#b3f243]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                  About Analytics Dashboard
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-[#b3f243] font-medium">Complete Fleet View</p>
                      <p className="text-gray-300 text-xs mt-0.5">Active fleet (excluding defleeted vehicles), yard status, and location tracking</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#72A68E] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-[#72A68E] font-medium">Profitability Analysis</p>
                      <p className="text-gray-300 text-xs mt-0.5">Calculate revenue, costs, and profit for any vehicle</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C5D9D0] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-[#C5D9D0] font-medium">Live Updates</p>
                      <p className="text-gray-300 text-xs mt-0.5">Dashboard updates automatically across all locations</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search Modal - Full Featured */}
        {showSearchModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between z-10">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Search className="w-6 h-6 text-[#b3f243]" />
                  Vehicle Hire History & Profitability
                </h2>
                <button
                  onClick={() => setShowSearchModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <VehicleHireLookup organizationId={organizationId} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
