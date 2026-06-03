// src/hooks/useCheckoutHistory.ts
// FIXED: Now merges ALL vehicle movement types:
//   1. checkoutHistory   — direct branch checkouts
//   2. hireHistory       — vehicles set out on hire
//   3. checkedInVehicles — vehicles in_transit or at_external_garage (current)
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { checkoutHistoryService } from '@/lib/checkoutHistoryService'
import { userProfileService } from '@/lib/firestore'
import { 
  collection, getDocs, query, where, limit, orderBy
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// Unified record shape for the UI — covers all movement types
export interface UnifiedActivityRecord {
  id: string
  // Vehicle
  registration: string
  make: string
  model: string
  colour?: string
  size?: string
  condition?: string
  status?: string
  mileage?: string
  contract?: string | null
  contractColor?: string | null
  motExpiry?: string
  taxExpiry?: string
  notes?: string
  comments?: string
  insuranceStatus?: string

  // Movement
  activityType: 'checkout' | 'hire' | 'transfer' | 'external_garage'
  activityLabel: string          // Human-readable: "Checked Out", "Out on Hire", etc.
  checkedOutDate: Date           // When the movement happened
  checkedOutBy: string           // User ID
  checkedOutByName: string       // Display name

  // Destination / context
  originalBranchId?: string | null
  originalBranchName?: string | null
  targetBranchId?: string | null
  targetBranchName?: string | null
  externalGarageName?: string | null
  isExternalGarageCheckout?: boolean
  serviceBookingId?: string | null

  organizationId: string
}

interface UseCheckoutHistoryReturn {
  checkoutHistory: UnifiedActivityRecord[]
  filteredHistory: UnifiedActivityRecord[]
  loading: boolean
  error: string | null
  searchTerm: string
  setSearchTerm: (t: string) => void
  selectedUser: string
  setSelectedUser: (u: string) => void
  dateRange: number
  setDateRange: (d: number) => void
  refreshHistory: () => Promise<void>
  exportToCSV: () => void
  totalCheckouts: number
  uniqueUsers: string[]
  totalVehicles: number
}

function toDate(val: any): Date | null {
  if (!val) return null
  if (typeof val?.toDate === 'function') return val.toDate()
  if (val instanceof Date) return val
  try { return new Date(val) } catch { return null }
}

function safeDate(val: any): Date {
  return toDate(val) || new Date(0)
}

export function useCheckoutHistory(): UseCheckoutHistoryReturn {
  const { user } = useAuth()
  const t = useT()
  const [checkoutHistory, setCheckoutHistory] = useState<UnifiedActivityRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState('all')
  const [dateRange, setDateRange] = useState(30)

  // Load org ID once
  useEffect(() => {
    if (!user) return
    userProfileService.getProfile(user.uid).then(profile => {
      if (profile?.organizationId) {
        setOrgId(profile.organizationId)
      } else {
        setError(t('checkout.err.noOrg'))
        setLoading(false)
      }
    }).catch(err => {
      setError(t('checkout.err.failedProfile'))
      setLoading(false)
    })
  }, [user])

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - Math.min(dateRange, 30))

    try {
      const results: UnifiedActivityRecord[] = []

      // ── 1. Direct checkouts (checkoutHistory collection) ─────────────────
      try {
        const coSnap = await getDocs(query(
          collection(db, 'checkoutHistory'),
          where('organizationId', '==', orgId),
          limit(500)
        ))
        coSnap.docs.forEach(doc => {
          const d = doc.data()
          const date = safeDate(d.checkedOutDate)
          if (date < cutoff) return
          results.push({
            id: `co_${doc.id}`,
            registration: d.registration || '',
            make: d.make || '',
            model: d.model || '',
            colour: d.colour,
            size: d.size,
            condition: d.condition,
            status: d.status,
            mileage: d.mileage,
            contract: d.contract,
            contractColor: d.contractColor,
            motExpiry: d.motExpiry,
            taxExpiry: d.taxExpiry,
            notes: d.notes,
            comments: d.comments,
            insuranceStatus: d.insuranceStatus,
            activityType: d.isExternalGarageCheckout ? 'external_garage' : 'checkout',
            activityLabel: d.isExternalGarageCheckout
              ? t('checkout.activity.externalGarageFull') + (d.externalGarageName ? `: ${d.externalGarageName}` : '')
              : t('checkout.activity.checkedOut'),
            checkedOutDate: date,
            checkedOutBy: d.checkedOutBy || '',
            checkedOutByName: d.checkedOutByName || '',
            originalBranchId: d.originalBranchId,
            originalBranchName: d.originalBranchName,
            targetBranchId: null,
            targetBranchName: null,
            externalGarageName: d.externalGarageName,
            isExternalGarageCheckout: !!d.isExternalGarageCheckout,
            serviceBookingId: d.serviceBookingId,
            organizationId: orgId
          })
        })
        logger.log(`✅ checkoutHistory: ${coSnap.docs.length} docs`)
      } catch (e) {
        logger.log('checkoutHistory query failed:', e)
      }

      // ── 2. Hire events (hireHistory collection) ───────────────────────────
      try {
        const hireSnap = await getDocs(query(
          collection(db, 'hireHistory'),
          where('organizationId', '==', orgId),
          limit(500)
        ))
        hireSnap.docs.forEach(doc => {
          const d = doc.data()
          const date = safeDate(d.hireStartDate)
          if (date < cutoff) return
          results.push({
            id: `hire_${doc.id}`,
            registration: d.registration || '',
            make: d.make || '',
            model: d.model || '',
            activityType: 'hire',
            activityLabel: t('checkout.activity.outOnHire') + (d.hireNotes ? ` — ${d.hireNotes}` : ''),
            checkedOutDate: date,
            checkedOutBy: d.hiredBy || '',
            checkedOutByName: d.hiredByName || '',
            originalBranchId: d.branchId,
            originalBranchName: d.branchName,
            organizationId: orgId
          })
        })
        logger.log(`✅ hireHistory: ${hireSnap.docs.length} docs`)
      } catch (e) {
        logger.log('hireHistory query failed:', e)
      }

      // ── 3. Active transfers & external garage (checkedInVehicles) ─────────
      // These are vehicles currently in_transit or at_external_garage
      // They haven't completed yet so they don't have a checkoutHistory entry
      try {
        const transferSnap = await getDocs(query(
          collection(db, 'checkedInVehicles'),
          where('organizationId', '==', orgId),
          limit(500)
        ))
        transferSnap.docs.forEach(doc => {
          const d = doc.data()
          const status = d.transferStatus
          if (status !== 'in_transit' && status !== 'at_external_garage') return

          const date = safeDate(
            status === 'at_external_garage'
              ? (d.checkedOutToGarageAt || d.updatedAt)
              : (d.transferInitiatedAt || d.updatedAt)
          )
          if (date < cutoff) return

          const isGarage = status === 'at_external_garage'
          results.push({
            id: `transfer_${doc.id}`,
            registration: d.registration || '',
            make: d.make || '',
            model: d.model || '',
            colour: d.colour,
            size: d.size,
            condition: d.condition,
            status: d.status,
            mileage: d.mileage,
            contract: d.contract,
            contractColor: d.contractColor,
            motExpiry: d.motExpiry,
            taxExpiry: d.taxExpiry,
            notes: d.notes,
            comments: d.comments,
            insuranceStatus: d.insuranceStatus,
            activityType: isGarage ? 'external_garage' : 'transfer',
            activityLabel: isGarage
              ? t('checkout.activity.atExternalGarage') + (d.externalGarageName ? `: ${d.externalGarageName}` : '')
              : t('checkout.activity.transferTo', { branch: d.targetBranchName || t('checkout.activity.branchFallback') }),
            checkedOutDate: date,
            checkedOutBy: isGarage
              ? (d.checkedOutToGarageBy || '')
              : (d.transferInitiatedBy || ''),
            checkedOutByName: isGarage
              ? (d.checkedOutToGarageByName || '')
              : (d.transferInitiatedByName || ''),
            originalBranchId: d.branchId,
            originalBranchName: d.sourceBranchName || d.branchId,
            targetBranchId: d.targetBranchId,
            targetBranchName: d.targetBranchName,
            externalGarageName: d.externalGarageName,
            isExternalGarageCheckout: isGarage,
            serviceBookingId: d.serviceBookingId,
            organizationId: orgId
          })
        })
        logger.log(`✅ active transfers/garage from checkedInVehicles processed`)
      } catch (e) {
        logger.log('checkedInVehicles transfer query failed:', e)
      }

      // Sort newest first
      results.sort((a, b) => b.checkedOutDate.getTime() - a.checkedOutDate.getTime())
      logger.log(`📊 Total unified activity records: ${results.length}`)
      setCheckoutHistory(results)

    } catch (err) {
      logger.error('loadAll error:', err)
      setError(err instanceof Error ? err.message : t('checkout.errFailedLoadTitle'))
    } finally {
      setLoading(false)
    }
  }, [orgId, dateRange, t])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const refreshHistory = async () => { await loadAll() }

  // Client-side filtering
  const filteredHistory = checkoutHistory.filter(r => {
    const matchSearch = searchTerm === '' ||
      r.registration?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.model?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchUser = selectedUser === 'all' ||
      r.checkedOutBy === selectedUser ||
      r.checkedOutByName?.toLowerCase().includes(selectedUser.toLowerCase())
    return matchSearch && matchUser
  })

  const totalCheckouts = filteredHistory.length
  const uniqueUsers = [...new Set(filteredHistory.map(r => r.checkedOutByName).filter(Boolean))] as string[]
  const totalVehicles = new Set(filteredHistory.map(r => r.registration).filter(Boolean)).size

  const exportToCSV = () => {
    if (!filteredHistory.length) { alert(t('checkout.err.noDataExport')); return }

    const headers = [
      t('checkout.csv.registration'), t('checkout.csv.make'), t('checkout.csv.model'), t('checkout.csv.activityType'), t('checkout.csv.description'),
      t('checkout.csv.date'), t('checkout.csv.byUser'), t('checkout.csv.fromBranch'), t('checkout.csv.toBranchGarage'),
      t('checkout.csv.colour'), t('checkout.csv.size'), t('checkout.csv.condition'), t('checkout.csv.mileage'), t('checkout.csv.motExpiry'), t('checkout.csv.taxExpiry')
    ]

    const fmt = (d: any) => {
      if (!d) return ''
      const dt = d instanceof Date ? d : new Date(d)
      return isNaN(dt.getTime()) ? '' : `${dt.toLocaleDateString('en-GB')} ${dt.toLocaleTimeString('en-GB')}`
    }

    const esc = (s: string) => {
      const str = String(s || '')
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str
    }

    const rows = filteredHistory.map(r => [
      r.registration, r.make, r.model, r.activityType, r.activityLabel,
      fmt(r.checkedOutDate), r.checkedOutByName,
      r.originalBranchName || '', r.targetBranchName || r.externalGarageName || '',
      r.colour || '', r.size || '', r.condition || '', r.mileage || '',
      r.motExpiry || '', r.taxExpiry || ''
    ])

    const csv = [headers, ...rows].map(row => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vehicle-activity-${new Date().toISOString().split('T')[0]}.csv`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return {
    checkoutHistory,
    filteredHistory,
    loading,
    error,
    searchTerm, setSearchTerm,
    selectedUser, setSelectedUser,
    dateRange, setDateRange,
    refreshHistory,
    exportToCSV,
    totalCheckouts,
    uniqueUsers,
    totalVehicles
  }
}