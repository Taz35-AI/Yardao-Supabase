// src/contexts/ServiceBookingsContext.tsx — SUPABASE re-implementation.
// 💸 COST OPTIMIZATION: Single shared realtime listener for service bookings.
//
// Before: useServiceBookings was called from 5 places (DashboardDataLayer,
// DashboardBusinessLogic, useNotifications, ServiceBookingsContent,
// ServiceBookingModal). Each call mounted its own listener; this provider owns
// the only one and all consumers read it via context.
//
// Data-layer swap only — the public ServiceBookingsContextValue API and the
// mapped ServiceBooking shape are preserved 1:1. Firestore semantics mapped:
//   * onSnapshot(window query)  → initial select(date>=cutoff, ordered) then
//     refetch on any postgres_changes for the org's service_bookings.
//   * addDoc/updateDoc/deleteDoc → insert/update/delete
//   * serverTimestamp()          → new Date().toISOString() / server default
//   * deleteField()              → null (snake_case column cleared)
//   * writeBatch                 → sequential updates (no client-side multi-row
//                                  txn in supabase-js; same end state)
// Rows are snake_case; toCamel maps top-level keys and jsonb columns
// (work_required, external_provider, last_edit_log) pass through verbatim.
'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePathname } from 'next/navigation'
import { useTabVisibility } from '@/hooks/common/useTabVisibility'
import { useAppState } from '@/hooks/common/useAppState'
import { supabase } from '@/lib/supabaseClient'
import { userProfileService } from '@/lib/firestore'
import { toCamel } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { activityLogService } from '@/lib/services/activityLogService'

import type { ServiceBooking } from '@/types/serviceBookings'

const SERVICE_BOOKINGS_TABLE = 'service_bookings'
const CHECKED_IN_VEHICLES_TABLE = 'checked_in_vehicles'
const VEHICLES_TABLE = 'vehicles'
const CHECKOUT_HISTORY_TABLE = 'checkout_history'

const nowIso = () => new Date().toISOString()
const toDate = (v: any) => (v ? new Date(v) : undefined)

// Single source of truth for service_bookings row → ServiceBooking.
//
// toCamel maps every top-level snake_case key to camelCase (so any column added
// to the schema later flows through automatically — replacing the old
// hand-listed allowlist that silently dropped new fields). Only the fields that
// need a type/default fix or a timestamptz → Date coercion are overridden
// afterwards. Used by BOTH the live listener and refreshBookings so they can
// never drift apart.
function mapBookingRow(row: any): ServiceBooking {
  const v = toCamel<any>(row) || {}
  const workRequired: string | string[] = Array.isArray(v.workRequired)
    ? v.workRequired
    : typeof v.workRequired === 'string'
      ? v.workRequired
      : 'Service'
  return {
    ...v,
    id: v.id,
    date: v.date || '',
    timeSlot: v.timeSlot || '',
    registration: v.registration || '',
    make: v.make || '',
    model: v.model || '',
    workRequired,
    isCustomVehicle: v.isCustomVehicle || false,
    notes: v.notes || '',
    organizationId: v.organizationId || '',
    createdBy: v.createdBy || '',
    createdByName: v.createdByName || '',
    status: v.status || 'scheduled',
    createdAt: toDate(v.createdAt) ?? new Date(),
    updatedAt: toDate(v.updatedAt),
    isExternalProvider: v.isExternalProvider || false,
    externalProvider: v.externalProvider || undefined,
    serviceBay: v.serviceBay || 1,
    checkedInToGarageAt: toDate(v.checkedInToGarageAt),
    completedAt: toDate(v.completedAt),
    originalBranchId: v.originalBranchId || null,
    originalBranchName: v.originalBranchName || null,
    vehicleRemovedFromBranch: v.vehicleRemovedFromBranch || false,
    assignedMechanicId: v.assignedMechanicId ?? null,
    assignedMechanicName: v.assignedMechanicName ?? null,
    slotCount: typeof v.slotCount === 'number' && v.slotCount >= 1 ? v.slotCount : 1,
    mileage: typeof v.mileage === 'number' ? v.mileage : undefined,
  } as ServiceBooking
}

interface ModalHandler {
  showConfirmation: (options: {
    title: string
    message: string
    onConfirm: () => void
    onCancel?: () => void
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'danger' | 'warning'
  }) => void
  showAlert: (options: {
    title: string
    message: string
    variant?: 'success' | 'error' | 'info'
  }) => void
}

// Module-scoped — the modal system registers itself via setServiceBookingsModalHandler
// from any consumer (typically ServiceBookingsContent) and the provider's actions
// dispatch to it.
let globalModalHandler: ModalHandler | null = null

export function setServiceBookingsModalHandler(handler: ModalHandler) {
  globalModalHandler = handler
}

export interface ServiceBookingsContextValue {
  bookings: ServiceBooking[]
  loading: boolean
  error: string | null
  createBooking: (bookingData: Omit<ServiceBooking, 'id'>) => Promise<string>
  createBookingWithGarageCheckout: (
    bookingData: Omit<ServiceBooking, 'id'>,
    vehicleId?: string,
  ) => Promise<string>
  updateBooking: (
    bookingId: string,
    updates: Partial<
      Omit<
        ServiceBooking,
        'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
      >
    >,
  ) => Promise<void>
  deleteBooking: (bookingId: string) => Promise<void>
  checkInToGarage: (booking: ServiceBooking) => Promise<void>
  markAsCompleted: (booking: ServiceBooking, mileage?: number) => Promise<void>
  refreshBookings: () => Promise<void>
}

const ServiceBookingsContext = createContext<ServiceBookingsContextValue | null>(null)

export function useServiceBookingsContext(): ServiceBookingsContextValue {
  const ctx = useContext(ServiceBookingsContext)
  if (!ctx) {
    throw new Error(
      'useServiceBookings must be used within a ServiceBookingsProvider. ' +
        'Make sure ServiceBookingsProvider is mounted in the React tree.',
    )
  }
  return ctx
}

// camelCase ServiceBooking write payload → snake_case service_bookings row.
// Explicit so id/createdAt are never written and the jsonb columns
// (work_required, external_provider) map correctly. undefined keys are dropped
// so an update never blanks a column it didn't mean to touch.
function bookingToRow(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    date: 'date',
    timeSlot: 'time_slot',
    registration: 'registration',
    make: 'make',
    model: 'model',
    workRequired: 'work_required',
    isCustomVehicle: 'is_custom_vehicle',
    notes: 'notes',
    status: 'status',
    serviceBay: 'service_bay',
    slotCount: 'slot_count',
    isExternalProvider: 'is_external_provider',
    externalProvider: 'external_provider',
    partsStatus: 'parts_status',
    mileage: 'mileage',
    assignedMechanicId: 'assigned_mechanic_id',
    assignedMechanicName: 'assigned_mechanic_name',
    customerName: 'customer_name',
    customerPhone: 'customer_phone',
    customerEmail: 'customer_email',
    originalBranchId: 'original_branch_id',
    originalBranchName: 'original_branch_name',
    vehicleRemovedFromBranch: 'vehicle_removed_from_branch',
    checkedInToGarageAt: 'checked_in_to_garage_at',
    checkedInToGarageBy: 'checked_in_to_garage_by',
    checkedInToGarageByName: 'checked_in_to_garage_by_name',
    completedFromDashboard: 'completed_from_dashboard',
    completedAt: 'completed_at',
    completedBy: 'completed_by',
    completedByName: 'completed_by_name',
    createdBy: 'created_by',
    createdByName: 'created_by_name',
    lastModifiedBy: 'last_modified_by',
    lastModifiedByName: 'last_modified_by_name',
    cancelledBy: 'cancelled_by',
    cancelledByName: 'cancelled_by_name',
  }
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    const col = map[k]
    if (col) out[col] = v
  }
  return out
}

export function ServiceBookingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const { isVisible } = useTabVisibility()
  const { isAppActive } = useAppState()

  const [bookings, setBookings] = useState<ServiceBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  const unsubscribeRef = useRef<(() => void) | null>(null)

  const showConfirmationModal = (options: {
    title: string
    message: string
    onConfirm: () => void
    onCancel?: () => void
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'danger' | 'warning'
  }) => {
    if (globalModalHandler) {
      globalModalHandler.showConfirmation(options)
    } else {
      const confirmed = window.confirm(options.message)
      if (confirmed) {
        options.onConfirm()
      } else if (options.onCancel) {
        options.onCancel()
      }
    }
  }

  // Determine if we should have an active listener
  const shouldHaveActiveListener = useCallback(() => {
    if (!user || !organizationId) return false
    if (!isAppActive) return false // Stop when app in background

    const serviceRelevantPages = ['/dashboard', '/service-bookings']
    const isServicePage = serviceRelevantPages.some(page => pathname.startsWith(page))

    return isVisible && isServicePage
  }, [user, organizationId, pathname, isVisible, isAppActive])

  // load user's org
  useEffect(() => {
    if (!user) {
      setOrganizationId(null)
      return
    }
    userProfileService
      .getProfile(user.uid)
      .then(p => setOrganizationId(p?.organizationId || user.uid))
      .catch(() => setOrganizationId(user.uid))
  }, [user])

  // 🔥 CRITICAL: Properly manage listener lifecycle based on app state
  useEffect(() => {
    const cleanupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 UNSUBSCRIBING from service bookings listener')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }

    const setupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('⚠️ Listener already exists, skipping setup')
        return
      }

      if (!organizationId) {
        logger.log('⚠️ No organization ID, cannot setup listener')
        return
      }

      const orgId = organizationId
      logger.log('🔥 CREATING new service bookings listener (single shared subscription)')
      setLoading(true)
      setError(null)

      // 💸 Bound the live listener to a recent window instead of dragging
      // every historical completed booking into memory. Older completed jobs
      // are still fully accessible — the per-vehicle and per-customer history
      // features query on demand, so no UI loses data.
      const SB_WINDOW_DAYS = 90
      const cutoffDate = new Date(Date.now() - SB_WINDOW_DAYS * 86400000)
      const yyyy = cutoffDate.getFullYear()
      const mm = String(cutoffDate.getMonth() + 1).padStart(2, '0')
      const dd = String(cutoffDate.getDate()).padStart(2, '0')
      const cutoff = `${yyyy}-${mm}-${dd}`
      logger.log(`📅 Service bookings window: from ${cutoff} (last ${SB_WINDOW_DAYS} days + all future)`)

      const fetchBookings = async () => {
        try {
          const { data, error: fetchError } = await supabase
            .from(SERVICE_BOOKINGS_TABLE)
            .select('*')
            .eq('organization_id', orgId)
            .gte('date', cutoff)
            .order('date', { ascending: true })
            .order('time_slot', { ascending: true })
          if (fetchError) throw fetchError

          logger.log(`📦 Service bookings snapshot: ${(data ?? []).length} documents`)
          const mapped = (data ?? []).map(mapBookingRow)
          logger.log(`🔄 Service bookings updated: ${mapped.length} bookings`)
          setBookings(mapped)
          setLoading(false)
          setError(null)
        } catch (err) {
          logger.error('❌ Error in service bookings subscription:', err)
          setError('Failed to load service bookings')
          setLoading(false)
        }
      }

      // initial fetch
      fetchBookings()

      // refetch on any change to this org's service_bookings.
      // Coalesce bursts into ONE refetch (behaviour-preserving: fetchBookings
      // reads current DB state, so the end result is identical).
      let refreshTimer: ReturnType<typeof setTimeout> | null = null
      const scheduleFetch = () => {
        if (refreshTimer) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          refreshTimer = null
          fetchBookings()
        }, 250)
      }
      const channel = supabase
        .channel(`service_bookings:${orgId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: SERVICE_BOOKINGS_TABLE,
            filter: `organization_id=eq.${orgId}`,
          },
          () => {
            scheduleFetch()
          }
        )
        .subscribe()

      unsubscribeRef.current = () => {
        if (refreshTimer) clearTimeout(refreshTimer)
        supabase.removeChannel(channel)
      }
    }

    const shouldListen = shouldHaveActiveListener()

    logger.log('🎯 Service bookings listener decision:', {
      shouldListen,
      hasUser: !!user,
      hasOrg: !!organizationId,
      isVisible,
      isAppActive,
      pathname,
      currentListener: !!unsubscribeRef.current,
    })

    if (shouldListen) {
      if (!unsubscribeRef.current) {
        logger.log('✅ CONDITIONS MET: Setting up service bookings listener')
        setupListener()
      } else {
        logger.log('ℹ️ Service bookings listener already active, keeping it')
      }
    } else {
      if (unsubscribeRef.current) {
        logger.log('🛑 CONDITIONS NOT MET: Removing service bookings listener')
        logger.log(
          'Reason:',
          !user
            ? 'No user'
            : !organizationId
              ? 'No org'
              : !isAppActive
                ? '🔴 APP IN BACKGROUND'
                : !isVisible
                  ? 'Tab hidden'
                  : 'Wrong page',
        )
        cleanupListener()
        setLoading(false)
      }
    }

    return () => {
      logger.log('🧹 Provider unmounting, cleaning up service bookings')
      cleanupListener()
    }
  }, [shouldHaveActiveListener, organizationId, isVisible, isAppActive, pathname, user])

  const createBooking = async (bookingData: Omit<ServiceBooking, 'id'>) => {
    if (!user || !organizationId) throw new Error('Not authenticated')

    const row = {
      ...bookingToRow(bookingData as Record<string, any>),
      organization_id: organizationId,
      work_required: bookingData.workRequired,
      service_bay: bookingData.serviceBay || 1,
      // created_at defaults to now() server-side
    }

    const { data, error: insertError } = await supabase
      .from(SERVICE_BOOKINGS_TABLE)
      .insert(row)
      .select('id')
      .single()
    if (insertError) throw insertError
    const newId = data.id as string

    activityLogService.log({
      organizationId, actorId: user.uid, actorName: user.displayName || user.email || 'Unknown',
      actionType: 'garage_booking', entityType: 'booking', entityId: newId, registration: bookingData.registration,
      summary: bookingData.isExternalProvider
        ? `Booked to external garage${bookingData.externalProvider?.garageName ? `: ${bookingData.externalProvider.garageName}` : ''}`
        : `Booked to workshop${bookingData.date ? ` for ${bookingData.date}` : ''}`,
      details: { date: bookingData.date, timeSlot: bookingData.timeSlot, external: !!bookingData.isExternalProvider },
    })

    // 👥 Upsert the customer record so the contact details are reusable across
    // future bookings. Fire-and-forget — a transient hiccup here must NOT roll
    // back a successful booking save.
    if (bookingData.customerName && bookingData.customerPhone) {
      try {
        const { customerService } = await import('@/lib/customerService')
        await customerService.upsertCustomerForBooking({
          organizationId,
          name: bookingData.customerName,
          phone: bookingData.customerPhone,
          email: bookingData.customerEmail,
          registration:
            bookingData.registration && bookingData.registration !== 'LUNCH'
              ? bookingData.registration
              : undefined,
          bookingDate: bookingData.date,
          actorId: user.uid,
          actorName: user.displayName || user.email || 'Unknown',
        })
      } catch (err) {
        logger.error('Customer upsert after booking failed (non-fatal):', err)
      }
    }

    return newId
  }

  const createBookingWithGarageCheckout = async (
    bookingData: Omit<ServiceBooking, 'id'>,
    vehicleId?: string,
  ) => {
    if (!user || !organizationId) throw new Error('Not authenticated')

    const bookingId = await createBooking(bookingData)

    if (bookingData.isExternalProvider && vehicleId) {
      try {
        const { transferService } = await import('@/lib/services/transferService')
        const garageName = bookingData.externalProvider?.garageName || 'External Garage'
        const userName = user.displayName || user.email || 'Unknown User'

        await transferService.checkoutToExternalGarage(
          vehicleId,
          garageName,
          bookingId,
          user.uid,
          userName,
        )

        logger.log(`✅ Vehicle ${bookingData.registration} checked out to ${garageName}`)
      } catch (err) {
        logger.error('Failed to mark vehicle as checked out to garage:', err)
      }
    }

    return bookingId
  }

  const updateBooking = async (
    bookingId: string,
    updates: Partial<
      Omit<
        ServiceBooking,
        'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
      >
    >,
  ) => {
    if (!user) throw new Error('Not authenticated')
    const actorName = user.displayName || user.email || 'Unknown User'

    // ⚡ Optimistic update: reflect the change in local state IMMEDIATELY so a
    // drag / resize / move on the workshop grid snaps to its new position
    // without waiting for the DB write + 250ms-debounced realtime refetch
    // round-trip (the old ~½s "is it working?" lag). The realtime refetch
    // reconciles to DB truth a moment later; on failure we roll back.
    let prevBookings: ServiceBooking[] = []
    setBookings(prev => {
      prevBookings = prev
      return prev.map(b =>
        b.id === bookingId ? { ...b, ...(updates as Partial<ServiceBooking>) } : b,
      )
    })

    const { error: updateError } = await supabase
      .from(SERVICE_BOOKINGS_TABLE)
      .update({
        ...bookingToRow(updates as Record<string, any>),
        updated_at: nowIso(),
        last_modified_by: user.uid,
        last_modified_by_name: actorName,
      })
      .eq('id', bookingId)
    if (updateError) {
      setBookings(prevBookings) // roll back the optimistic change
      throw updateError
    }

    // 👥 Re-upsert customer when an edit changed contact details. We don't bump
    // bookingCount here — but name/email corrections should flow back to the
    // customer record. Skipped if no contact fields in the patch.
    if (organizationId && (updates.customerName || updates.customerPhone || updates.customerEmail)) {
      try {
        const { customerService } = await import('@/lib/customerService')
        const phone = updates.customerPhone || ''
        if (phone) {
          const existing = await customerService.findByPhone(organizationId, phone)
          if (existing) {
            const patch: Record<string, unknown> = {}
            if (updates.customerName && updates.customerName !== existing.name) {
              patch.name = updates.customerName
            }
            if (updates.customerEmail !== undefined && updates.customerEmail !== existing.email) {
              patch.email = updates.customerEmail || ''
            }
            if (Object.keys(patch).length > 0) {
              await customerService.updateCustomer(existing.id, patch as any, user.uid, actorName)
            }
          }
        }
      } catch (err) {
        logger.error('Customer re-upsert after booking update failed (non-fatal):', err)
      }
    }
  }

  const deleteBooking = async (bookingId: string) => {
    if (!user) throw new Error('Not authenticated')
    const actorName = user.displayName || user.email || 'Unknown User'
    // Stamp attribution before delete so any delete-side handling can read who
    // cancelled it from the row before it's gone.
    try {
      const { error: stampError } = await supabase
        .from(SERVICE_BOOKINGS_TABLE)
        .update({
          cancelled_by: user.uid,
          cancelled_by_name: actorName,
          updated_at: nowIso(),
        })
        .eq('id', bookingId)
      if (stampError) throw stampError
    } catch (err) {
      logger.warn('Could not stamp cancelledBy before delete:', err)
    }
    const { error: deleteError } = await supabase
      .from(SERVICE_BOOKINGS_TABLE)
      .delete()
      .eq('id', bookingId)
    if (deleteError) throw deleteError
  }

  // Find vehicle's original branch before service. Returns the matched row + its
  // id (replaces the Firestore vehicleDocRef) plus the resolved branch.
  const findVehicleOriginalBranch = async (registration: string) => {
    if (!organizationId) return null

    const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')

    try {
      const { data: vehicles, error: vehiclesError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
      if (vehiclesError) throw vehiclesError

      for (const vehicleData of vehicles ?? []) {
        const vehicleReg = vehicleData.registration?.toUpperCase().replace(/\s+/g, '')

        if (vehicleReg === cleanReg) {
          const branchId = vehicleData.branch_id || 'main'

          const { branchService } = await import('@/lib/services/branchService')
          const branches = await branchService.getBranches(organizationId)
          const branch = branches.find(b => b.slug === branchId)

          return {
            branchId,
            branchName: branch?.name || (branchId === 'main' ? 'Main Branch' : branchId),
            vehicleData,
            vehicleId: vehicleData.id as string,
          }
        }
      }

      return null
    } catch (err) {
      logger.error('Error finding vehicle branch:', err)
      return null
    }
  }

  // Look up original vehicle data from various sources (checkout_history /
  // vehicles), preserving the original's fallback order + alternative-format try.
  const lookupOriginalVehicleData = async (registration: string) => {
    if (!organizationId) return null

    try {
      const cleanReg = registration.toUpperCase().replace(/\s+/g, '')
      logger.log(`Looking up original data for vehicle: ${registration} (cleaned: ${cleanReg})`)

      // 1) external garage checkout record
      const { data: externalRows } = await supabase
        .from(CHECKOUT_HISTORY_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)
        .eq('is_external_garage_checkout', true)
        .order('checked_out_date', { ascending: false })
        .limit(1)
      if (externalRows && externalRows.length > 0) {
        const r = externalRows[0]
        logger.log(`Found external garage checkout record for ${registration}`)
        return {
          make: r.make || '',
          model: r.model || '',
          colour: r.colour || '',
          size: r.size || '',
          condition: r.condition || 'Good',
          motExpiry: r.mot_expiry || '',
          taxExpiry: r.tax_expiry || '',
          contract: r.contract || null,
          contractColor: r.contract_color || null,
          insuranceStatus: r.insurance_status || null,
          mileage: r.mileage || '',
          comments: r.comments || '',
          originalBranchId: r.original_branch_id,
          originalBranchName: r.original_branch_name,
        }
      }

      // 2) fleet vehicle
      const { data: fleetRows } = await supabase
        .from(VEHICLES_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)
        .limit(1)
      if (fleetRows && fleetRows.length > 0) {
        const r = fleetRows[0]
        logger.log(`Found vehicle data in fleet for ${registration}`)
        return {
          make: r.make || '',
          model: r.model || '',
          colour: r.colour || '',
          size: r.size || '',
          condition: r.condition || 'Good',
          motExpiry: r.mot_expiry || '',
          taxExpiry: r.tax_expiry || '',
          contract: r.contract || null,
          contractColor: r.contract_color || null,
          insuranceStatus: r.insurance_status || null,
          mileage: r.mileage || '',
          comments: r.comments || '',
        }
      }

      // 3) most recent checkout (any)
      const { data: checkoutRows } = await supabase
        .from(CHECKOUT_HISTORY_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)
        .order('checked_out_date', { ascending: false })
        .limit(1)
      if (checkoutRows && checkoutRows.length > 0) {
        const r = checkoutRows[0]
        logger.log(`Found vehicle data in checkout history for ${registration}`)
        return {
          make: r.make || '',
          model: r.model || '',
          colour: r.colour || '',
          size: r.size || '',
          condition: r.condition || 'Good',
          motExpiry: r.mot_expiry || '',
          taxExpiry: r.tax_expiry || '',
          contract: r.contract || null,
          contractColor: r.contract_color || null,
          insuranceStatus: r.insurance_status || null,
          mileage: r.mileage || '',
          comments: r.comments || '',
        }
      }

      // 4) alternative spaced format against the fleet
      const regWithSpaces = cleanReg.replace(/^(.{2})(.{2})(.+)$/, '$1 $2 $3')
      if (regWithSpaces !== cleanReg) {
        logger.log(`Trying alternative format: ${regWithSpaces}`)
        const { data: altFleetRows } = await supabase
          .from(VEHICLES_TABLE)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('registration', regWithSpaces)
          .limit(1)
        if (altFleetRows && altFleetRows.length > 0) {
          const r = altFleetRows[0]
          logger.log(`Found vehicle data in fleet with alternative format for ${registration}`)
          return {
            make: r.make || '',
            model: r.model || '',
            colour: r.colour || '',
            size: r.size || '',
            condition: r.condition || 'Good',
            motExpiry: r.mot_expiry || '',
            taxExpiry: r.tax_expiry || '',
            contract: r.contract || null,
            contractColor: r.contract_color || null,
            mileage: r.mileage || '',
            comments: r.comments || '',
          }
        }
      }

      logger.log(`No original vehicle data found for ${registration} in any source`)
      return null
    } catch (err) {
      logger.error('Error looking up original vehicle data:', err)
      return null
    }
  }

  // Check-in vehicle to garage with branch tracking.
  // Firestore writeBatch → two sequential updates (vehicle then booking).
  const checkInToGarage = async (booking: ServiceBooking): Promise<void> => {
    if (!user || !organizationId) throw new Error('User not authenticated')
    if (!booking.id) throw new Error('Booking ID is required')

    try {
      const branchInfo = await findVehicleOriginalBranch(booking.registration)

      if (branchInfo) {
        logger.log(
          `🔧 Vehicle ${booking.registration} found in ${branchInfo.branchName}, setting external garage status...`,
        )

        const vehicleData = branchInfo.vehicleData

        // Hire fields are preserved by simply not overwriting them — the update
        // below only touches transfer/garage columns, so 'Out on Hire' state
        // and its attribution stay intact on the row.
        const hirePreserved = vehicleData.hire_status === 'Out on Hire'
        if (hirePreserved) {
          logger.log(`📌 Preserving hire status for ${booking.registration}`)
        }

        const { error: vehUpdateError } = await supabase
          .from(CHECKED_IN_VEHICLES_TABLE)
          .update({
            transfer_status: 'at_external_garage',
            external_garage_id: null,
            external_garage_name: booking.externalProvider?.garageName || 'External Garage',
            service_booking_id: booking.id,
            checked_out_to_garage_at: nowIso(),
            checked_out_to_garage_by: user.uid,
            checked_out_to_garage_by_name: user.displayName || user.email || 'Unknown User',
            updated_at: nowIso(),
            last_edit_log: {
              action: `Vehicle checked in to ${booking.externalProvider?.garageName || 'external garage'} via service booking${hirePreserved ? ' (hire status preserved)' : ''}`,
              editedBy: user.uid,
              editedByName: user.displayName || user.email || 'Unknown User',
              editedAt: new Date().toISOString(),
            },
          })
          .eq('id', branchInfo.vehicleId)
        if (vehUpdateError) throw vehUpdateError

        logger.log(
          `✅ Vehicle ${booking.registration} marked as at external garage (will appear in Dashboard External Garage section)`,
        )
      } else {
        logger.log(
          `ℹ️ Vehicle ${booking.registration} not found in any branch - just updating booking status`,
        )
      }

      const { error: bookingUpdateError } = await supabase
        .from(SERVICE_BOOKINGS_TABLE)
        .update({
          status: 'checked_in_to_garage',
          checked_in_to_garage_at: nowIso(),
          checked_in_to_garage_by: user.uid,
          checked_in_to_garage_by_name: user.displayName || user.email || 'Unknown User',
          updated_at: nowIso(),
          original_branch_id: branchInfo?.branchId || 'main',
          original_branch_name: branchInfo?.branchName || 'Main Branch',
          vehicle_removed_from_branch: !!branchInfo,
        })
        .eq('id', booking.id)
      if (bookingUpdateError) throw bookingUpdateError

      activityLogService.log({
        organizationId, actorId: user.uid, actorName: user.displayName || user.email || 'Unknown User',
        actionType: 'garage_out', entityType: 'booking', entityId: booking.id, registration: booking.registration,
        summary: `Sent to garage${booking.externalProvider?.garageName ? `: ${booking.externalProvider.garageName}` : ''}`,
      })

      if (branchInfo) {
        logger.log(
          `✅ Vehicle ${booking.registration} checked into ${booking.externalProvider?.garageName || 'external garage'} and marked in Dashboard External Garage section`,
        )
      } else {
        logger.log(`✅ Service booking updated for ${booking.registration}`)
      }
    } catch (err) {
      logger.error('Error checking in vehicle to garage:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to check in vehicle to garage'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }

  // Mark as completed with branch return prompt.
  // Firestore writeBatch → sequential updates/inserts.
  const markAsCompleted = async (booking: ServiceBooking, mileage?: number): Promise<void> => {
    if (!user || !organizationId) throw new Error('User not authenticated')
    if (!booking.id) throw new Error('Booking ID is required')

    if ((booking as any).completedFromDashboard) {
      setError(
        'This service has already been completed from the Dashboard. The vehicle has been returned.',
      )
      return
    }

    const executeCompletion = async (shouldCheckBackIn: boolean = false) => {
      try {
        const { error: bookingUpdateError } = await supabase
          .from(SERVICE_BOOKINGS_TABLE)
          .update({
            status: 'completed',
            updated_at: nowIso(),
            // Stamp completion attribution so per-vehicle service history has a
            // trustworthy date + actor.
            completed_at: nowIso(),
            completed_by: user.uid,
            completed_by_name: user.displayName || user.email || 'Unknown User',
            // Internal-only odometer reading (optional). Only the internal
            // completion path passes this; external/garage never does.
            ...(typeof mileage === 'number' && !Number.isNaN(mileage)
              ? { mileage }
              : {}),
          })
          .eq('id', booking.id)
        if (bookingUpdateError) throw bookingUpdateError

        activityLogService.log({
          organizationId, actorId: user.uid, actorName: user.displayName || user.email || 'Unknown User',
          actionType: 'garage_return', entityType: 'booking', entityId: booking.id, registration: booking.registration,
          summary: booking.isExternalProvider ? 'Returned from external garage (service completed)' : 'Service completed in workshop',
        })

        if (shouldCheckBackIn) {
          const originalBranch = booking.originalBranchName || 'Main Branch'
          const originalVehicleData = await lookupOriginalVehicleData(booking.registration)

          // checked_in_vehicles row payload (snake_case). Cleared transfer/garage
          // columns use null (Firestore deleteField equivalent).
          const checkInData: Record<string, any> = {
            registration: booking.registration,
            make: originalVehicleData?.make || booking.make || '',
            model: originalVehicleData?.model || booking.model || '',
            colour: originalVehicleData?.colour || '',
            size: originalVehicleData?.size || '',
            condition: originalVehicleData?.condition || 'Good',
            status: 'Ready',
            mileage: originalVehicleData?.mileage || '',
            notes: `Returned from service at ${booking.externalProvider?.garageName || 'external garage'}`,
            comments: originalVehicleData?.comments || '',
            contract: originalVehicleData?.contract || null,
            contract_color: originalVehicleData?.contractColor || null,
            insurance_status: originalVehicleData?.insuranceStatus || null,
            mot_expiry: originalVehicleData?.motExpiry || null,
            tax_expiry: originalVehicleData?.taxExpiry || null,
            branch_id: booking.originalBranchId || 'main',
            user_id: user.uid,
            organization_id: organizationId,
            created_at: nowIso(),
            updated_at: nowIso(),
            check_in_time: nowIso(),
            transfer_status: null,
            external_garage_id: null,
            external_garage_name: null,
            service_booking_id: null,
            checked_out_to_garage_at: null,
            checked_out_to_garage_by: null,
            checked_out_to_garage_by_name: null,
            last_edit_log: {
              action: `Vehicle returned from service at ${booking.externalProvider?.garageName || 'external garage'} to ${originalBranch}`,
              editedBy: user.uid,
              editedByName: user.displayName || user.email || 'Unknown User',
              editedAt: new Date().toISOString(),
            },
          }

          // 🛠️ Space-insensitive registration matching to avoid creating a
          // duplicate when the booking's reg differs only in whitespace from
          // the existing yard row. findVehicleOriginalBranch normalizes reg.
          const existingBranchInfo = await findVehicleOriginalBranch(booking.registration)

          if (existingBranchInfo) {
            const { error: updErr } = await supabase
              .from(CHECKED_IN_VEHICLES_TABLE)
              .update(checkInData)
              .eq('id', existingBranchInfo.vehicleId)
            if (updErr) throw updErr
            logger.log(`✅ Updating existing vehicle doc for ${booking.registration}`)
          } else {
            const { error: insErr } = await supabase
              .from(CHECKED_IN_VEHICLES_TABLE)
              .insert(checkInData)
            if (insErr) throw insErr
            logger.log(`⚠️ No existing doc found — creating new for ${booking.registration}`)
          }
        }

        if (booking.isExternalProvider && booking.status === 'scheduled' && !shouldCheckBackIn) {
          logger.log(`🔧 External garage booking - looking for vehicle to clear garage status...`)

          // 🛠️ Search by serviceBookingId — set on the vehicle row when
          // checkInToGarage ran. Precise reference, touches only THIS booking's
          // vehicle.
          const { data: vehicleRows } = await supabase
            .from(CHECKED_IN_VEHICLES_TABLE)
            .select('*')
            .eq('organization_id', organizationId)
            .eq('service_booking_id', booking.id)
            .limit(1)

          if (vehicleRows && vehicleRows.length > 0) {
            const vehicleData = vehicleRows[0]

            if (
              vehicleData.transfer_status === 'at_external_garage' &&
              vehicleData.service_booking_id === booking.id
            ) {
              logger.log(`✅ Found vehicle ${booking.registration} at external garage, clearing status...`)

              const { error: clearErr } = await supabase
                .from(CHECKED_IN_VEHICLES_TABLE)
                .update({
                  transfer_status: null,
                  external_garage_id: null,
                  external_garage_name: null,
                  service_booking_id: null,
                  checked_out_to_garage_at: null,
                  checked_out_to_garage_by: null,
                  checked_out_to_garage_by_name: null,
                  returned_from_garage_at: nowIso(),
                  returned_from_garage_by: user.uid,
                  returned_from_garage_by_name: user.displayName || user.email || 'Unknown User',
                  updated_at: nowIso(),
                })
                .eq('id', vehicleData.id)
              if (clearErr) throw clearErr

              logger.log(`✅ Vehicle ${booking.registration} returned from external garage`)
            } else {
              logger.log(`ℹ️ Vehicle found but not at external garage or booking ID mismatch - skipping`)
            }
          } else {
            logger.log(
              `ℹ️ No vehicle found in yard for ${booking.registration} - may have been already checked out`,
            )
          }
        }

        logger.log(`Service booking ${booking.id} marked as completed`)
      } catch (err) {
        logger.error('Error marking booking as completed:', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to mark booking as completed'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    }

    try {
      if (booking.status === 'checked_in_to_garage') {
        const originalBranch = booking.originalBranchName || 'Main Branch'
        const bayInfo = booking.serviceBay && booking.serviceBay > 1 ? ` (Bay ${booking.serviceBay})` : ''

        showConfirmationModal({
          title: 'Service Completed',
          message: `Service completed for ${booking.registration}${bayInfo}.\n\nThis vehicle was originally from: ${originalBranch}\n\nWould you like to check this vehicle back into ${originalBranch}?`,
          confirmText: 'Yes, Check Back In',
          cancelText: 'No, Just Complete',
          variant: 'default',
          onConfirm: () => executeCompletion(true),
          onCancel: () => executeCompletion(false),
        })
      } else if (booking.isExternalProvider && booking.status === 'scheduled') {
        const originalBranch = booking.originalBranchName || 'Main Branch'
        const garageName = booking.externalProvider?.garageName || 'external garage'

        showConfirmationModal({
          title: 'External Service Completed',
          message: `Service completed for ${booking.registration} at ${garageName}.\n\nVehicle will be returned from external garage.\n\nOriginal branch: ${originalBranch}\n\nWould you like to check this vehicle back into ${originalBranch}?`,
          confirmText: 'Yes, Check Back In',
          cancelText: 'No, Just Clear Garage Status',
          variant: 'default',
          onConfirm: () => executeCompletion(true),
          onCancel: () => executeCompletion(false),
        })
      } else {
        await executeCompletion(false)
      }
    } catch (err) {
      logger.error('Error marking booking as completed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to mark booking as completed'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }

  const refreshBookings = async () => {
    if (!shouldHaveActiveListener()) {
      logger.log('⏭️ Skipping service bookings refresh - conditions not met')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from(SERVICE_BOOKINGS_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .order('date', { ascending: true })
        .order('time_slot', { ascending: true })
      if (fetchError) throw fetchError

      const mapped = (data ?? []).map(mapBookingRow)
      setBookings(mapped)
      setError(null)
      logger.log(`✅ Service bookings manual refresh completed: ${mapped.length} bookings`)
    } catch (err) {
      logger.error('❌ Error refreshing service bookings:', err)
      setError('Failed to refresh bookings')
    } finally {
      setLoading(false)
    }
  }

  const value: ServiceBookingsContextValue = {
    bookings,
    loading,
    error,
    createBooking,
    createBookingWithGarageCheckout,
    updateBooking,
    deleteBooking,
    checkInToGarage,
    markAsCompleted,
    refreshBookings,
  }

  return (
    <ServiceBookingsContext.Provider value={value}>{children}</ServiceBookingsContext.Provider>
  )
}
