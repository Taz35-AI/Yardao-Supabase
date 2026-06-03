// src/components/common/ServiceBanner.tsx
// 🍞 TOAST REDESIGN - Fixed bottom-right notification
// ✅ ALL LOGIC, HOOKS, CALCULATIONS, NAVIGATION 100% PRESERVED
// 🎯 Only the render output changed — now a fixed toast, no layout shift
// ✅ INSURANCE integrated — replaces standalone InsuranceWarningPopup

'use client'

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTabVisibility } from '@/hooks/common/useTabVisibility'
import { 
  Calendar, 
  Clock, 
  Car, 
  ExternalLink, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  X, 
  CheckCircle,
  AlertCircle,
  Wrench,
  MapPin,
  Timer,
  Eye,
  Users,
  Building,
  Truck,
  TrendingDown,
  AlertTriangle,
  ShieldAlert,
  Download,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { useNotifications } from '@/hooks/useNotifications'
import { useDeliveriesDefleet } from '@/contexts/DeliveriesDefleetContext'
import { useFleetData } from '@/hooks/useFleetData'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isVehicleNotInsured } from '@/lib/insuranceUtils'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

const BANNER_STORAGE_KEY = 'yardao_service_banner_state'
const SESSION_DISMISSED_KEY = 'yardao_banner_dismissed_session'

interface BannerState {
  dismissedDate: string | null
  lastServiceIds: string[]
  lastDeliveryDefleetIds: string[]
  lastMotCriticalCount: number
  hasInteracted: boolean
}

interface MOTStatus {
  expired: number
  expiresToday: number
  expiresIn2Days: number
  expiresIn3Days: number
}

interface DeliveryDefleetStats {
  deliveriesToday: number
  defleetsToday: number
  totalToday: number
  deliveryVehicles: string[]
  defleetVehicles: string[]
}

// ── NEW: Uninsured vehicle type ───────────────────────────────────────────────
interface UninsuredVehicle {
  id: string
  registration: string
  make: string
  model: string
  branchName: string
}

// ── NEW: Excel export for uninsured vehicles ──────────────────────────────────
function exportUninsuredToExcel(vehicles: UninsuredVehicle[], t: (k: string, v?: any) => string) {
  const C = { DARK: '012619', MED: '025940', CRIT: 'DC2626', WHITE: 'FFFFFF', LGREY: 'F9FAFB' }
  const fnt = (bold: boolean, color: string, sz: number) => ({ bold, color: { rgb: color }, sz, name: 'Calibri' })
  const fill = (fgColor: string) => ({ type: 'pattern' as const, patternType: 'solid' as const, fgColor: { rgb: fgColor } })
  const bdr = () => ({ top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } })
  const aln = (horizontal: string) => ({ horizontal, vertical: 'center' })

  const ws: XLSX.WorkSheet = {}
  ws['A1'] = { v: t('serviceBanner.xlsxTitle'), t: 's', s: { font: fnt(true, C.WHITE, 14), fill: fill(C.DARK), alignment: aln('center') } }
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]
  ws['A2'] = { v: t('serviceBanner.xlsxGenerated', { date: new Date().toLocaleDateString('en-GB') }), t: 's', s: { font: fnt(false, C.MED, 10), fill: fill('E8F5EE'), alignment: aln('center') } }
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } })
  const hdrs = [t('serviceBanner.xlsxColRegistration'), t('serviceBanner.xlsxColMake'), t('serviceBanner.xlsxColModel'), t('serviceBanner.xlsxColBranch'), t('serviceBanner.xlsxColStatus'), t('serviceBanner.xlsxColAction')]
  hdrs.forEach((h, i) => {
    ws[`${String.fromCharCode(65 + i)}3`] = { v: h, t: 's', s: { font: fnt(true, C.WHITE, 10), fill: fill(C.DARK), border: bdr(), alignment: aln('center') } }
  })
  vehicles.forEach((v, idx) => {
    const r = idx + 4
    const bg = idx % 2 === 0 ? C.WHITE : C.LGREY
    const defs: [string, XLSX.CellObject][] = [
      [`A${r}`, { v: v.registration, t: 's', s: { font: fnt(true, C.DARK, 10), fill: fill(bg), border: bdr(), alignment: aln('center') } }],
      [`B${r}`, { v: v.make, t: 's', s: { font: fnt(false, '1A2E25', 10), fill: fill(bg), border: bdr(), alignment: aln('left') } }],
      [`C${r}`, { v: v.model, t: 's', s: { font: fnt(false, '1A2E25', 10), fill: fill(bg), border: bdr(), alignment: aln('left') } }],
      [`D${r}`, { v: v.branchName, t: 's', s: { font: fnt(true, C.MED, 10), fill: fill('E8F5EE'), border: bdr(), alignment: aln('center') } }],
      [`E${r}`, { v: t('serviceBanner.xlsxNotInsured'), t: 's', s: { font: fnt(true, C.WHITE, 9), fill: fill(C.CRIT), border: bdr(), alignment: aln('center') } }],
      [`F${r}`, { v: t('serviceBanner.xlsxActionText'), t: 's', s: { font: fnt(false, '7F1D1D', 10), fill: fill('FFF1F0'), border: bdr(), alignment: aln('left') } }],
    ]
    defs.forEach(([ref, c]) => { ws[ref] = c })
  })
  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 36 }]
  ws['!rows'] = [{ hpt: 30 }, { hpt: 16 }, { hpt: 24 }, ...vehicles.map(() => ({ hpt: 18 }))]
  ws['!ref'] = `A1:F${vehicles.length + 3}`
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, t('serviceBanner.xlsxSheetName'))
  XLSX.writeFile(wb, `yardao-uninsured-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── NEW: Insurance modal (slides up on mobile, centered on desktop) ───────────
function InsuranceModal({
  vehicles,
  onClose,
  exporting,
  onExport,
}: {
  vehicles: UninsuredVehicle[]
  onClose: () => void
  exporting: boolean
  onExport: () => void
}) {
  const t = useT()
  const byBranch = useMemo(() => {
    const map: Record<string, UninsuredVehicle[]> = {}
    vehicles.forEach(v => {
      if (!map[v.branchName]) map[v.branchName] = []
      map[v.branchName].push(v)
    })
    return Object.entries(map)
  }, [vehicles])

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg bg-[#012619] border border-[#025940] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#025940] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{t('serviceBanner.insuranceWarning')}</h2>
              <p className="text-[11px] text-[#72A68E]">{t('serviceBanner.dailyComplianceCheck')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#025940] rounded-xl transition-colors">
            <X className="w-4 h-4 text-[#72A68E]" />
          </button>
        </div>

        {/* Alert bar */}
        <div className="px-5 py-3 bg-red-900/20 border-b border-red-900/30 flex-shrink-0">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-red-300">
              {t(vehicles.length === 1 ? 'serviceBanner.notInsuredSummaryOne' : 'serviceBanner.notInsuredSummaryMany', { count: vehicles.length, branches: byBranch.length })}
            </p>
          </div>
        </div>

        {/* Vehicle list — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {byBranch.map(([branch, bVehicles]) => (
            <div key={branch}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-3.5 h-3.5 text-[#72A68E]" />
                <span className="text-xs font-bold text-[#72A68E] uppercase tracking-wider">{branch}</span>
                <span className="text-[10px] text-[#72A68E]/60">{t(bVehicles.length === 1 ? 'serviceBanner.branchVehicleOne' : 'serviceBanner.branchVehicleMany', { count: bVehicles.length })}</span>
              </div>
              <div className="space-y-1.5">
                {bVehicles.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-[#025940]/20 border border-[#025940]/40 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-[#b3f243] bg-[#012619] px-2 py-0.5 rounded">
                        {v.registration}
                      </span>
                      <span className="text-xs text-[#C5D9D0]">{v.make} {v.model}</span>
                    </div>
                    <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded-full border border-red-800/40">
                      {t('serviceBanner.notInsured')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#025940] flex gap-2 flex-shrink-0">
          <button
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#025940] hover:bg-[#03704f] text-[#b3f243] text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {t('serviceBanner.exportExcel')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#012619] border border-[#025940] hover:bg-[#025940]/30 text-[#72A68E] text-xs font-semibold transition-colors"
          >
            {t('serviceBanner.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ========================================
// ALL ORIGINAL LOGIC — UNTOUCHED
// ========================================

function ServiceBannerComponent() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const { isVisible: tabIsVisible } = useTabVisibility()
  const { todaysServiceBookings, todayString } = useNotifications()
  const { entries: deliveryDefleetEntries } = useDeliveriesDefleet()
  const { vehicles } = useFleetData()
  const { user } = useAuth()

  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showAllServices, setShowAllServices] = useState(false)
  const [showAllItems, setShowAllItems] = useState(false)
  // 🍞 Toast-specific: expanded state
  const [isExpanded, setIsExpanded] = useState(false)
  // ⏳ NEW: Delay appearance on first load so dashboard renders cleanly first
  const [delayComplete, setDelayComplete] = useState(false)
  // 🚫 NEW: Session-level dismiss — once dismissed, stays gone until tab refresh
  const [sessionDismissed, setSessionDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(SESSION_DISMISSED_KEY) === 'true'
  })

  // ── NEW: Insurance state ─────────────────────────────────────────────────────
  const [uninsuredVehicles, setUninsuredVehicles] = useState<UninsuredVehicle[]>([])
  const [insuranceLoading, setInsuranceLoading] = useState(false)
  const [showInsuranceModal, setShowInsuranceModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [insuranceCheckedToday, setInsuranceCheckedToday] = useState(false)

  // 🔥 PERFORMANCE: Only show banner on relevant pages
  const shouldShowBanner = useMemo(() => {
    const relevantPages = ['/dashboard']
    return relevantPages.some(page => pathname.startsWith(page)) && tabIsVisible
  }, [pathname, tabIsVisible])

  // ── NEW: Fetch uninsured vehicles once per session ────────────────────────────
  useEffect(() => {
    if (!shouldShowBanner || !user?.uid || insuranceCheckedToday) return

    const load = async () => {
      setInsuranceLoading(true)
      try {
        const profile = await userProfileService.getProfile(user.uid)
        const orgId = profile?.organizationId
        if (!orgId) return

        const branchSnap = await getDocs(
          query(collection(db, 'branches'), where('organizationId', '==', orgId), where('isActive', '==', true))
        )
        const branchMap: Record<string, string> = { main: 'Main Branch' }
        branchSnap.forEach(doc => {
          const d = doc.data()
          branchMap[d.slug] = d.name
        })

        // Step 1: Get ALL fleet vehicles — master source of truth for insurance
        const fleetSnap = await getDocs(
          query(collection(db, 'vehicles'), where('organizationId', '==', orgId))
        )

        // Step 2: Get all checked-in vehicles to know which branch each vehicle is at
        const yardSnap = await getDocs(
          query(collection(db, 'checkedInVehicles'), where('organizationId', '==', orgId))
        )

        // Build a reg → branchId lookup from yard
        const regToBranch: Record<string, string> = {}
        yardSnap.forEach(doc => {
          const d = doc.data()
          const reg = (d.registration || '').toUpperCase().replace(/\s+/g, '')
          if (reg) regToBranch[reg] = d.branchId || 'main'
        })

        // Step 3: Find uninsured fleet vehicles, attach branch
        const uninsured: UninsuredVehicle[] = []
        fleetSnap.forEach(doc => {
          const d = doc.data()
          if (d.isDefleeted === true || d.currentStatus === 'defleeted') return
          if (!isVehicleNotInsured(d.insuranceStatus)) return

          const reg = (d.registration || '').toUpperCase().replace(/\s+/g, '')
          const branchId = regToBranch[reg] || d.currentLocation || d.lastKnownLocation || 'main'

          uninsured.push({
            id: doc.id,
            registration: d.registration || '',
            make: d.make || '',
            model: d.model || '',
            branchName: branchMap[branchId] || branchId,
          })
        })

        // Sort by branch name, then registration
        uninsured.sort((a, b) =>
          a.branchName.localeCompare(b.branchName) || a.registration.localeCompare(b.registration)
        )
        setUninsuredVehicles(uninsured)
        setInsuranceCheckedToday(true)
      } catch (err) {
        logger.log('Insurance check failed:', err)
      } finally {
        setInsuranceLoading(false)
      }
    }

    load()
  }, [shouldShowBanner, user?.uid, insuranceCheckedToday])

  // 🔥 PERFORMANCE: Memoized time calculations (reduced frequency)
  const dateCalculations = useMemo(() => {
    const now = new Date()
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    return {
      now,
      todayLocal,
      hourKey
    }
  }, [])

  // 🔥 PERFORMANCE: Conditional debug logging (only in development)
  useEffect(() => {
    if (!shouldShowBanner || process.env.NODE_ENV !== 'development') return

    logger.log('🔍 Enhanced ServiceBanner Debug Info:')
    logger.log('- todaysServiceBookings length:', todaysServiceBookings?.length)
    logger.log('- deliveryDefleetEntries length:', deliveryDefleetEntries?.length)
    logger.log('- vehicles length:', vehicles?.length)
    logger.log('- Today string:', todayString)
  }, [todaysServiceBookings, deliveryDefleetEntries, vehicles, todayString, shouldShowBanner])

  // 🔥 PERFORMANCE: Memoized service calculations
  const serviceStats = useMemo(() => {
    if (!shouldShowBanner || !todaysServiceBookings?.length) {
      return { total: 0, completed: 0, inProgress: 0, scheduled: 0, external: 0, internal: 0 }
    }

    const total = todaysServiceBookings.length
    const completed = todaysServiceBookings.filter(s => s.status === 'completed').length
    const inProgress = todaysServiceBookings.filter(s => s.status === 'in-progress').length
    const scheduled = todaysServiceBookings.filter(s => s.status === 'scheduled').length
    const external = todaysServiceBookings.filter(s => s.isExternalProvider).length
    const internal = total - external

    return { total, completed, inProgress, scheduled, external, internal }
  }, [todaysServiceBookings, shouldShowBanner])

  // 🔥 PERFORMANCE: Memoized delivery/defleet calculations
  const deliveryDefleetStats = useMemo((): DeliveryDefleetStats => {
    if (!shouldShowBanner || !deliveryDefleetEntries) {
      return { 
        deliveriesToday: 0, 
        defleetsToday: 0, 
        totalToday: 0,
        deliveryVehicles: [],
        defleetVehicles: []
      }
    }

    const todayEntries = deliveryDefleetEntries.filter(entry => entry.date === todayString)
    const deliveries = todayEntries.filter(entry => entry.operationType === 'delivery')
    const defleets = todayEntries.filter(entry => entry.operationType === 'defleet')
    
    const deliveryVehicles = deliveries
      .map(entry => entry.registration)
      .filter(Boolean)
    
    const defleetVehicles = defleets
      .map(entry => entry.registration)
      .filter(Boolean)

    return {
      deliveriesToday: deliveries.length,
      defleetsToday: defleets.length,
      totalToday: deliveries.length + defleets.length,
      deliveryVehicles,
      defleetVehicles
    }
  }, [deliveryDefleetEntries, todayString, shouldShowBanner])

  // 🔥 PERFORMANCE: Optimized MOT calculations with caching
  const motStats = useMemo(() => {
    if (!shouldShowBanner || !vehicles || vehicles.length === 0) {
      return { 
        expired: 0, 
        expiresToday: 0, 
        expiresIn2Days: 0, 
        expiresIn3Days: 0,
        expiredVehicles: [],
        expiresTodayVehicles: [],
        expiresIn2DaysVehicles: [],
        expiresIn3DaysVehicles: []
      }
    }

    const todayLocal = dateCalculations.todayLocal
    
    let expired = 0
    let expiresToday = 0
    let expiresIn2Days = 0
    let expiresIn3Days = 0
    
    const expiredVehicles: string[] = []
    const expiresTodayVehicles: string[] = []
    const expiresIn2DaysVehicles: string[] = []
    const expiresIn3DaysVehicles: string[] = []

    vehicles.forEach(vehicle => {
      if (!vehicle.motExpiry || !vehicle.registration) return
      // 🛠️ Skip defleeted vehicles — they aren't part of the active fleet
      // and shouldn't appear in the MOT-alerts banner. (`useFleetData`
      // intentionally returns ALL vehicles incl. defleeted so the
      // showDefleeted toggle has data; we filter here at the alert layer.)
      if ((vehicle as any).isDefleeted === true || (vehicle as any).currentStatus === 'defleeted') return

      const motDate = new Date(vehicle.motExpiry + 'T00:00:00')
      const motLocal = new Date(motDate.getFullYear(), motDate.getMonth(), motDate.getDate())
      const timeDiff = motLocal.getTime() - todayLocal.getTime()
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

      if (daysDiff < 0) {
        expired++
        expiredVehicles.push(vehicle.registration)
      } else if (daysDiff === 0) {
        expiresToday++
        expiresTodayVehicles.push(vehicle.registration)
      } else if (daysDiff === 2) {
        expiresIn2Days++
        expiresIn2DaysVehicles.push(vehicle.registration)
      } else if (daysDiff === 3) {
        expiresIn3Days++
        expiresIn3DaysVehicles.push(vehicle.registration)
      }
    })

    return { 
      expired, 
      expiresToday, 
      expiresIn2Days, 
      expiresIn3Days,
      expiredVehicles,
      expiresTodayVehicles,
      expiresIn2DaysVehicles,
      expiresIn3DaysVehicles
    }
  }, [vehicles, dateCalculations.todayLocal, shouldShowBanner])

  // 🔥 PERFORMANCE: Memoized total critical items — now includes insurance
  const totalCriticalItems = useMemo(() => {
    if (!shouldShowBanner) return 0
    
    return serviceStats.total + 
           deliveryDefleetStats.totalToday + 
           motStats.expired + 
           motStats.expiresToday + 
           motStats.expiresIn2Days + 
           motStats.expiresIn3Days +
           (uninsuredVehicles.length > 0 ? 1 : 0)
  }, [serviceStats, deliveryDefleetStats, motStats, shouldShowBanner, uninsuredVehicles.length])

  // 🔥 PERFORMANCE: Optimized time parser (cached)
  const parseAnyTimeFormat = useMemo(() => {
    const timeCache = new Map<string, string | null>()
    
    return (timeInput: string): string | null => {
      if (!timeInput) return null
      
      if (timeCache.has(timeInput)) {
        return timeCache.get(timeInput)!
      }
      
      const timeStr = timeInput.trim().toLowerCase().replace(/\s+/g, ' ')
      
      const flexibleWords = ['anytime', 'flexible', 'tbc', 'asap', 'soon', 'later']
      if (flexibleWords.some(word => timeStr.includes(word))) {
        const result = '23:59'
        timeCache.set(timeInput, result)
        return result
      }
      
      const timePatterns = [
        { pattern: /(\d{1,2}):(\d{2})\s*(am|pm)/i, hourIdx: 1, minIdx: 2, ampmIdx: 3 },
        { pattern: /(\d{1,2})\.(\d{2})\s*(am|pm)/i, hourIdx: 1, minIdx: 2, ampmIdx: 3 },
        { pattern: /(\d{1,2})\s*(am|pm)/i, hourIdx: 1, minIdx: null, ampmIdx: 2 },
        { pattern: /^(\d{1,2}):(\d{2})$/, hourIdx: 1, minIdx: 2, ampmIdx: null },
        { pattern: /^(\d{1,2})\.(\d{2})$/, hourIdx: 1, minIdx: 2, ampmIdx: null },
        { pattern: /^(\d{4})$/, hourIdx: null, minIdx: null, ampmIdx: null },
        { pattern: /^(\d{3})$/, hourIdx: null, minIdx: null, ampmIdx: null },
        { pattern: /^(\d{1,2})$/, hourIdx: 1, minIdx: null, ampmIdx: null },
        { pattern: /(\d{1,2}):(\d{2})\s*hrs?/i, hourIdx: 1, minIdx: 2, ampmIdx: null },
        { pattern: /(\d{1,2})\s*hrs?\s*(\d{2})?/i, hourIdx: 1, minIdx: 2, ampmIdx: null },
      ]
      
      for (const { pattern, hourIdx, minIdx, ampmIdx } of timePatterns) {
        const match = timeStr.match(pattern)
        if (match) {
          let hours: number
          let minutes: number = 0
          
          if (pattern.source === '^(\\d{4})$') {
            const fourDigit = match[1]
            hours = parseInt(fourDigit.slice(0, 2))
            minutes = parseInt(fourDigit.slice(2, 4))
          } else if (pattern.source === '^(\\d{3})$') {
            const threeDigit = match[1]
            hours = parseInt(threeDigit.slice(0, 1))
            minutes = parseInt(threeDigit.slice(1, 3))
          } else {
            hours = hourIdx ? parseInt(match[hourIdx]) : 0
            minutes = minIdx && match[minIdx] ? parseInt(match[minIdx]) : 0
          }
          
          if (ampmIdx && match[ampmIdx]) {
            const ampm = match[ampmIdx].toLowerCase()
            if (ampm.includes('pm') && hours !== 12) {
              hours += 12
            } else if (ampm.includes('am') && hours === 12) {
              hours = 0
            }
          }
          
          if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            const result = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
            timeCache.set(timeInput, result)
            return result
          }
        }
      }
      
      timeCache.set(timeInput, null)
      return null
    }
  }, [])

  // 🔥 PERFORMANCE: Memoized next service calculation
  const nextService = useMemo(() => {
    if (!shouldShowBanner || !todaysServiceBookings || todaysServiceBookings.length === 0) return null
    
    const currentTime = dateCalculations.now
    const currentTimeString = currentTime.toTimeString().slice(0, 5)
    
    const upcomingServices = todaysServiceBookings
      .filter(service => service.status === 'scheduled')
      .map(service => {
        let serviceTime: string | null = null
        let sortableTime: string = '23:59'
        let originalTimeDisplay: string = ''
        
        if (service.isExternalProvider) {
          const customTime = service.externalProvider?.customTime
          if (customTime) {
            originalTimeDisplay = customTime
            serviceTime = parseAnyTimeFormat(customTime)
            if (serviceTime) {
              sortableTime = serviceTime
            }
          }
        } else {
          const timeSlot = service.timeSlot
          if (timeSlot) {
            originalTimeDisplay = timeSlot
            const startTime = timeSlot.split('-')[0] || timeSlot
            serviceTime = parseAnyTimeFormat(startTime)
            if (serviceTime) {
              sortableTime = serviceTime
            }
          }
        }
        
        return {
          ...service,
          parsedTime: serviceTime,
          sortableTime: sortableTime,
          originalTimeDisplay: originalTimeDisplay
        }
      })
      .filter(service => {
        if (service.parsedTime && service.sortableTime !== '23:59') {
          return service.sortableTime >= currentTimeString
        }
        return service.isExternalProvider
      })
      .sort((a, b) => a.sortableTime.localeCompare(b.sortableTime))
    
    return upcomingServices[0] || null
  }, [todaysServiceBookings, parseAnyTimeFormat, dateCalculations.now, shouldShowBanner])

  // Load banner state from localStorage
  const loadBannerState = (): BannerState => {
    if (typeof window === 'undefined') {
      return { 
        dismissedDate: null, 
        lastServiceIds: [], 
        lastDeliveryDefleetIds: [],
        lastMotCriticalCount: 0,
        hasInteracted: false 
      }
    }

    try {
      const saved = localStorage.getItem(BANNER_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          dismissedDate: parsed.dismissedDate || null,
          lastServiceIds: parsed.lastServiceIds || [],
          lastDeliveryDefleetIds: parsed.lastDeliveryDefleetIds || [],
          lastMotCriticalCount: parsed.lastMotCriticalCount || 0,
          hasInteracted: parsed.hasInteracted || false
        }
      }
    } catch (error) {
      logger.log('Failed to load banner state:', error)
    }

    return { 
      dismissedDate: null, 
      lastServiceIds: [], 
      lastDeliveryDefleetIds: [],
      lastMotCriticalCount: 0,
      hasInteracted: false 
    }
  }

  // 🔥 PERFORMANCE: Save banner state function
  const saveBannerState = useCallback((state: BannerState) => {
    if (typeof window === 'undefined') return

    try {
      localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      logger.log('Failed to save banner state:', error)
    }
  }, [])

  // 🔥 PERFORMANCE: Check if banner should be shown (memoized)
  const shouldShowBannerContent = useMemo(() => {
    if (!shouldShowBanner || totalCriticalItems === 0) return false
    
    const bannerState = loadBannerState()
    const currentServiceIds = todaysServiceBookings
      ?.map(s => s.id)
      .filter((id): id is string => typeof id === 'string')
      .sort() || []
    
    const currentDeliveryDefleetIds = deliveryDefleetEntries
      ? deliveryDefleetEntries
          .filter(entry => entry.date === todayString)
          .map(entry => entry.id)
          .filter((id): id is string => typeof id === 'string')
          .sort()
      : []
    
    const currentMotCriticalCount = motStats.expired + motStats.expiresToday + motStats.expiresIn2Days + motStats.expiresIn3Days
    
    if (serviceStats.completed === serviceStats.total && 
        deliveryDefleetStats.totalToday === 0 && 
        motStats.expired === 0 && 
        motStats.expiresToday === 0 && 
        motStats.expiresIn2Days === 0 && 
        motStats.expiresIn3Days === 0 &&
        uninsuredVehicles.length === 0) {
      return false
    }

    if (bannerState.dismissedDate === todayString) {
      const servicesUnchanged = JSON.stringify(bannerState.lastServiceIds) === JSON.stringify(currentServiceIds)
      const deliveryDefleetsUnchanged = JSON.stringify(bannerState.lastDeliveryDefleetIds) === JSON.stringify(currentDeliveryDefleetIds)
      const motUnchanged = bannerState.lastMotCriticalCount === currentMotCriticalCount
      
      if (servicesUnchanged && deliveryDefleetsUnchanged && motUnchanged) {
        return false
      }
    }

    return true
  }, [shouldShowBanner, totalCriticalItems, todaysServiceBookings, deliveryDefleetEntries, serviceStats, deliveryDefleetStats, motStats, todayString, uninsuredVehicles.length])

  // Update visibility state
  useEffect(() => {
    if (sessionDismissed) return // Don't even start the timer if dismissed this session
    const timer = setTimeout(() => setDelayComplete(true), 2500)
    return () => clearTimeout(timer)
  }, [sessionDismissed])

  // Update visibility state — now gated by delay + session dismiss
  useEffect(() => {
    if (sessionDismissed) {
      setIsVisible(false)
      return
    }
    // Only show after the 2.5s delay has passed
    setIsVisible(shouldShowBannerContent && delayComplete)
  }, [shouldShowBannerContent, delayComplete, sessionDismissed])

  // 🔥 PERFORMANCE: Optimized dismiss handler
  const handleDismiss = useCallback(() => {
    setIsAnimating(true)
// 🚫 NEW: Mark dismissed for the entire session
    setSessionDismissed(true)
    if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_DISMISSED_KEY, 'true')
    
    setTimeout(() => {
      setIsVisible(false)
      setIsAnimating(false)
      
      const currentServiceIds = todaysServiceBookings
        ?.map(s => s.id)
        .filter((id): id is string => typeof id === 'string')
        .sort() || []
      
      const currentDeliveryDefleetIds = deliveryDefleetEntries
        ? deliveryDefleetEntries
            .filter(entry => entry.date === todayString)
            .map(entry => entry.id)
            .filter((id): id is string => typeof id === 'string')
            .sort()
        : []
      
      const currentMotCriticalCount = motStats.expired + motStats.expiresToday + motStats.expiresIn2Days + motStats.expiresIn3Days
        
      saveBannerState({
        dismissedDate: todayString,
        lastServiceIds: currentServiceIds,
        lastDeliveryDefleetIds: currentDeliveryDefleetIds,
        lastMotCriticalCount: currentMotCriticalCount,
        hasInteracted: true
      })
    }, 300)
  }, [todaysServiceBookings, deliveryDefleetEntries, motStats, todayString, saveBannerState])

  // Navigation handlers — ALL PRESERVED
  const handleViewServices = useCallback(() => {
    router.push('/service-bookings')
  }, [router])

  const handleViewDeliveries = useCallback(() => {
    router.push('/deliveries-defleet')
  }, [router])

  const handleViewFleet = useCallback(() => {
    router.push('/fleet')
  }, [router])

  // Helper function for time until service
  const getTimeUntilService = useCallback((service: any) => {
    const now = dateCalculations.now
    const currentTimeStr = now.toTimeString().slice(0, 5)
    
    let serviceTime: string | null = null
    
    if (service.isExternalProvider) {
      const customTime = service.externalProvider?.customTime
      serviceTime = customTime ? parseAnyTimeFormat(customTime) : null
    } else {
      const timeSlot = service.timeSlot?.split('-')[0] || service.timeSlot
      serviceTime = timeSlot ? parseAnyTimeFormat(timeSlot) : null
    }
    
    if (!serviceTime) return t('serviceBanner.soon')
    if (serviceTime === '23:59') return t('serviceBanner.soon')
    
    const [currentHour, currentMin] = currentTimeStr.split(':').map(Number)
    const [serviceHour, serviceMin] = serviceTime.split(':').map(Number)
    
    const currentMinutes = currentHour * 60 + currentMin
    const serviceMinutes = serviceHour * 60 + serviceMin
    const diffMinutes = serviceMinutes - currentMinutes
    
    if (diffMinutes <= 0) return t('serviceBanner.now')
    if (diffMinutes < 60) return t('serviceBanner.minutes', { count: diffMinutes })

    const hours = Math.floor(diffMinutes / 60)
    const mins = diffMinutes % 60
    return mins > 0 ? t('serviceBanner.hoursMinutes', { hours, mins }) : t('serviceBanner.hours', { hours })
  }, [dateCalculations.now, parseAnyTimeFormat, t])

  // Don't render if conditions not met
  if (!isVisible || !shouldShowBanner) return null

  // Determine alert severity — now also critical if uninsured vehicles exist
  const getAlertSeverity = () => {
    if (motStats.expired > 0 || motStats.expiresToday > 0 || uninsuredVehicles.length > 0) return 'critical'
    if (serviceStats.inProgress > 0 || motStats.expiresIn2Days > 0) return 'warning'
    return 'info'
  }

  const severity = getAlertSeverity()

  // ========================================
  // 🍞 TOAST RENDER — fixed bottom-right
  // All logic above is untouched
  // ========================================

  const motCount = motStats.expired + motStats.expiresToday + motStats.expiresIn2Days + motStats.expiresIn3Days

  return (
    <>
      {/* ─── FIXED TOAST CONTAINER ─────────────────────────────────────
          • Full width on mobile with side margins (no cut-off)
          • max-w-[340px] floating on desktop
          • z-50 so it floats above content but below modals (z-[60]+)
      ──────────────────────────────────────────────────────────────── */}
      <div
        data-service-banner
        className={`
          fixed z-40
          top-[calc(5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2
          w-[calc(100%-16px)]
          md:top-2 md:w-[360px]
          transition-all duration-500 ease-out
          ${isAnimating
            ? 'opacity-0 -translate-y-full pointer-events-none'
            : 'opacity-100 translate-y-0'
          }
        `}
      >
        <div className="
          bg-[#012619]
          border border-[#025940]
          border-l-4 border-l-[#b3f243]
          rounded-2xl
          shadow-2xl shadow-black/40
          overflow-hidden
          backdrop-blur-sm
        ">

          {/* ── HEADER ROW (always visible, click anywhere to expand) ── */}
          <div
            onClick={() => setIsExpanded(v => !v)}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[#025940]/30 transition-colors"
          >

            {/* Severity icon + pulsing dot */}
            <div className="relative flex-shrink-0">
              <div className={`
                w-8 h-8 rounded-xl flex items-center justify-center
                ${severity === 'critical'
                  ? 'bg-red-500/20'
                  : severity === 'warning'
                  ? 'bg-amber-500/20'
                  : 'bg-[#b3f243]/15'
                }
              `}>
                {severity === 'critical'
                  ? <AlertTriangle className="w-4 h-4 text-red-400" />
                  : severity === 'warning'
                  ? <AlertCircle className="w-4 h-4 text-amber-400" />
                  : <Calendar className="w-4 h-4 text-[#b3f243]" />
                }
              </div>
              {/* Pulsing green dot */}
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#b3f243] ring-2 ring-[#012619]">
                <span className="absolute inset-0 rounded-full bg-[#b3f243] animate-ping opacity-75" />
              </span>
            </div>

            {/* Title + count */}
            <div className="flex-1 min-w-0">
              <p className="text-[#b3f243] font-semibold text-sm leading-tight">
                {t('serviceBanner.dailyOps')}
              </p>
              <p className="text-[#72A68E] text-xs truncate">
                {t(totalCriticalItems === 1 ? 'serviceBanner.needAttentionOne' : 'serviceBanner.needAttentionMany', { count: totalCriticalItems })}
                {nextService && (
                  <span className="text-[#C5D9D0]">
                    {' · '}
                    <span className="font-mono font-semibold">{nextService.registration}</span>
                    {t('serviceBanner.connectorIn')}
                    <span className="text-[#b3f243] font-semibold">{getTimeUntilService(nextService)}</span>
                  </span>
                )}
              </p>
            </div>

            {/* Chevron indicator */}
            <div className="flex-shrink-0 text-[#72A68E]">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>

            {/* Dismiss — stop propagation so it doesn't toggle expand */}
            <button
              onClick={e => { e.stopPropagation(); handleDismiss() }}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#72A68E] hover:text-white hover:bg-red-500/20 transition-colors"
              aria-label={t('serviceBanner.dismiss')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── EXPANDED BODY ── */}
          {isExpanded && (
            <div className="border-t border-[#025940]/60 max-h-[50vh] overflow-y-auto">

              {/* Quick status chips */}
              <div className="flex flex-wrap gap-1.5 px-4 py-3">
                {serviceStats.scheduled > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#025940]/50 text-[#C5D9D0] text-xs border border-[#025940]">
                    <Timer className="w-3 h-3 text-[#b3f243]" />
                    {t('serviceBanner.chipScheduled', { count: serviceStats.scheduled })}
                  </span>
                )}
                {serviceStats.inProgress > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#025940]/50 text-[#C5D9D0] text-xs border border-[#025940]">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {t('serviceBanner.chipInProgress', { count: serviceStats.inProgress })}
                  </span>
                )}
                {deliveryDefleetStats.deliveriesToday > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-900/30 text-green-300 text-xs border border-green-800/50">
                    <Truck className="w-3 h-3" />
                    {t('serviceBanner.chipDeliveries', { count: deliveryDefleetStats.deliveriesToday })}
                  </span>
                )}
                {deliveryDefleetStats.defleetsToday > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-900/30 text-orange-300 text-xs border border-orange-800/50">
                    <TrendingDown className="w-3 h-3" />
                    {t('serviceBanner.chipDefleets', { count: deliveryDefleetStats.defleetsToday })}
                  </span>
                )}
                {motStats.expired > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-900/30 text-red-300 text-xs border border-red-800/50">
                    <AlertTriangle className="w-3 h-3" />
                    {t('serviceBanner.chipMotExpired', { count: motStats.expired })}
                  </span>
                )}
                {motStats.expiresToday > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-900/30 text-red-300 text-xs border border-red-800/50">
                    <Car className="w-3 h-3" />
                    {t('serviceBanner.chipMotToday', { count: motStats.expiresToday })}
                  </span>
                )}
                {motStats.expiresIn2Days > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-900/30 text-orange-300 text-xs border border-orange-800/50">
                    <Car className="w-3 h-3" />
                    {t('serviceBanner.chipMotIn2', { count: motStats.expiresIn2Days })}
                  </span>
                )}
                {motStats.expiresIn3Days > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-900/30 text-yellow-300 text-xs border border-yellow-800/50">
                    <Car className="w-3 h-3" />
                    {t('serviceBanner.chipMotIn3', { count: motStats.expiresIn3Days })}
                  </span>
                )}
                {serviceStats.completed > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-900/30 text-green-300 text-xs border border-green-800/50">
                    <CheckCircle className="w-3 h-3" />
                    {t('serviceBanner.chipDone', { count: serviceStats.completed })}
                  </span>
                )}
                {serviceStats.external > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-900/30 text-purple-300 text-xs border border-purple-800/50">
                    <Building className="w-3 h-3" />
                    {t('serviceBanner.chipExternal', { count: serviceStats.external })}
                  </span>
                )}
              </div>

              {/* ── NEW: Insurance warning row — always show while loading or if vehicles found ── */}
              {(insuranceLoading || uninsuredVehicles.length > 0 || !insuranceCheckedToday) && (
                <div className="px-4 pb-2">
                  <button
                    onClick={() => uninsuredVehicles.length > 0 ? setShowInsuranceModal(true) : undefined}
                    disabled={insuranceLoading || !insuranceCheckedToday}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors active:scale-[0.98] text-left ${
                      insuranceCheckedToday && uninsuredVehicles.length === 0
                        ? 'bg-green-900/20 border border-green-800/40 cursor-default'
                        : 'bg-red-900/20 border border-red-800/40 hover:bg-red-900/35 cursor-pointer'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                      insuranceCheckedToday && uninsuredVehicles.length === 0
                        ? 'bg-green-500/20'
                        : 'bg-red-500/20'
                    }`}>
                      {insuranceLoading || !insuranceCheckedToday
                        ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                        : uninsuredVehicles.length === 0
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        : <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-red-300 text-xs font-semibold leading-tight">
                        {insuranceLoading || !insuranceCheckedToday
                          ? t('serviceBanner.checkingInsurance')
                          : uninsuredVehicles.length === 0
                          ? t('serviceBanner.allInsured')
                          : t(uninsuredVehicles.length === 1 ? 'serviceBanner.notInsuredCountOne' : 'serviceBanner.notInsuredCountMany', { count: uninsuredVehicles.length })
                        }
                      </p>
                      {insuranceCheckedToday && !insuranceLoading && (
                        <p className={`text-[10px] mt-0.5 ${uninsuredVehicles.length === 0 ? 'text-green-500/70' : 'text-red-400/70'}`}>
                          {uninsuredVehicles.length === 0 ? t('serviceBanner.compliancePassed') : t('serviceBanner.tapToSeeDetails')}
                        </p>
                      )}
                    </div>
                    {insuranceCheckedToday && !insuranceLoading && uninsuredVehicles.length > 0 && (
                      <span className="text-red-400 flex-shrink-0 text-[10px] font-bold">{t('serviceBanner.viewArrow')}</span>
                    )}
                  </button>
                </div>
              )}

              {/* Next service spotlight */}
              {nextService && (
                <div className="mx-4 mb-3 p-3 rounded-xl bg-[#025940]/30 border border-[#025940]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#72A68E]">{t('serviceBanner.nextUp')}</span>
                    <span className="text-xs font-bold text-[#b3f243] font-mono">
                      {nextService.isExternalProvider
                        ? nextService.externalProvider?.customTime || t('serviceBanner.externalTime')
                        : nextService.timeSlot
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-sm">{nextService.registration}</span>
                    {nextService.make && nextService.model && (
                      <span className="text-[#72A68E] text-xs truncate">{nextService.make} {nextService.model}</span>
                    )}
                    {nextService.isExternalProvider && (
                      <span className="ml-auto flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/50">{t('serviceBanner.extBadge')}</span>
                    )}
                  </div>
                  {nextService.workRequired && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Wrench className="w-3 h-3 text-[#72A68E] flex-shrink-0" />
                      <span className="text-[#C5D9D0] text-xs truncate">
                        {Array.isArray(nextService.workRequired)
                          ? nextService.workRequired.join(', ')
                          : nextService.workRequired
                        }
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── ACTION BUTTONS ─────────────────────────────────────
                  All 3 navigation handlers preserved exactly
              ──────────────────────────────────────────────────────── */}
              <div className="px-4 pb-4 flex flex-col gap-2">

                {/* Row 1: main actions */}
                <div className="flex gap-2">
                  {serviceStats.total > 0 && (
                    <button
                      onClick={handleViewServices}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#025940] hover:bg-[#03704f] text-white text-xs font-semibold transition-colors active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t('serviceBanner.btnServices', { count: serviceStats.total })}
                    </button>
                  )}

                  {deliveryDefleetStats.totalToday > 0 && (
                    <button
                      onClick={handleViewDeliveries}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#72A68E]/30 hover:bg-[#72A68E]/50 text-[#C5D9D0] text-xs font-semibold border border-[#72A68E]/40 transition-colors active:scale-95"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      {t('serviceBanner.btnDnd', { count: deliveryDefleetStats.totalToday })}
                    </button>
                  )}
                </div>

                {/* Row 2: MOT + secondary actions */}
                <div className="flex gap-2">
                  {motCount > 0 && (
                    <button
                      onClick={handleViewFleet}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors active:scale-95"
                    >
                      <Car className="w-3.5 h-3.5" />
                      {t('serviceBanner.btnMot', { count: motCount })}
                    </button>
                  )}

                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={handleDismiss}
                      className="flex items-center gap-1 px-3 h-8 rounded-xl bg-[#025940]/40 hover:bg-[#025940]/70 text-[#72A68E] hover:text-white text-xs font-medium transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t('serviceBanner.btnDone')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── NEW: Insurance modal ─────────────────────────────────────────────── */}
      {showInsuranceModal && (
        <InsuranceModal
          vehicles={uninsuredVehicles}
          onClose={() => setShowInsuranceModal(false)}
          exporting={exporting}
          onExport={async () => {
            setExporting(true)
            try { exportUninsuredToExcel(uninsuredVehicles, t) } finally { setExporting(false) }
          }}
        />
      )}
    </>
  )
}

// 🔥 PERFORMANCE OPTIMIZATION: Export wrapped with React.memo
export const ServiceBanner = memo(ServiceBannerComponent)
export { ServiceBannerComponent }
export default ServiceBanner