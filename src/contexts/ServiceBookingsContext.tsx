// src/contexts/ServiceBookingsContext.tsx
// 💸 COST OPTIMIZATION: Single shared onSnapshot listener for service bookings.
//
// Before: useServiceBookings was called from 5 places (DashboardDataLayer,
// DashboardBusinessLogic, useNotifications, ServiceBookingsContent,
// ServiceBookingModal). Each call mounted its own onSnapshot, so on the
// dashboard page 2-3 identical listeners ran in parallel — each billed
// separately by Firestore.
//
// After: this provider owns the only listener. All consumers read from it via
// context. Real-time behaviour, lifecycle gating, and the public API of
// useServiceBookings are preserved 1:1.
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
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  deleteField,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { userProfileService } from '@/lib/firestore'
import { logger } from '@/lib/logger'

import type { ServiceBooking } from '@/types/serviceBookings'

const SERVICE_BOOKINGS_COLLECTION = 'serviceBookings'

// Single source of truth for Firestore doc → ServiceBooking.
//
// Spreads the raw doc FIRST (`...v`) so every field — including ones added
// to the schema later — flows through automatically. Only the fields that
// need a type/default fix or a Firestore Timestamp → Date coercion are
// overridden afterwards. This intentionally replaces the old hand-listed
// "allowlist" mappers: under the allowlist, any new booking field was
// silently dropped on read (it bit customerName/Phone/Email and the
// mechanic fields). Used by BOTH the live listener and refreshBookings so
// they can never drift apart again.
function mapBookingDoc(id: string, raw: any): ServiceBooking {
  const v = raw || {}
  const workRequired: string | string[] = Array.isArray(v.workRequired)
    ? v.workRequired
    : typeof v.workRequired === 'string'
      ? v.workRequired
      : 'Service'
  return {
    ...v,
    id,
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
    createdAt: v.createdAt?.toDate?.() ?? new Date(),
    updatedAt: v.updatedAt?.toDate?.() ?? undefined,
    isExternalProvider: v.isExternalProvider || false,
    externalProvider: v.externalProvider || undefined,
    serviceBay: v.serviceBay || 1,
    checkedInToGarageAt: v.checkedInToGarageAt?.toDate?.() ?? undefined,
    completedAt: v.completedAt?.toDate?.() ?? undefined,
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

      logger.log('🔥 CREATING new service bookings listener (single shared subscription)')
      setLoading(true)
      setError(null)

      // 💸 Bound the live listener to a recent window instead of dragging
      // every historical completed booking into memory. As completed
      // bookings accumulate (years), the unbounded listener would balloon
      // the JS heap (real culprit for iOS Safari freezes on weak devices)
      // and re-cost the full collection on every cold attach. Older
      // completed jobs are still fully accessible — the per-vehicle and
      // per-customer history features already query Firestore on demand
      // with their own composite indexes, so no UI loses data.
      const SB_WINDOW_DAYS = 90
      const cutoffDate = new Date(Date.now() - SB_WINDOW_DAYS * 86400000)
      const yyyy = cutoffDate.getFullYear()
      const mm = String(cutoffDate.getMonth() + 1).padStart(2, '0')
      const dd = String(cutoffDate.getDate()).padStart(2, '0')
      const cutoff = `${yyyy}-${mm}-${dd}`
      logger.log(`📅 Service bookings window: from ${cutoff} (last ${SB_WINDOW_DAYS} days + all future)`)

      const q = query(
        collection(db, SERVICE_BOOKINGS_COLLECTION),
        where('organizationId', '==', organizationId),
        where('date', '>=', cutoff),
        orderBy('date', 'asc'),
        orderBy('timeSlot', 'asc'),
      )

      const unsubscribe = onSnapshot(
        q,
        snap => {
          logger.log(`📦 Service bookings snapshot: ${snap.docs.length} documents`)

          const data = snap.docs.map(d => mapBookingDoc(d.id, d.data()))

          logger.log(`🔄 Service bookings updated: ${data.length} bookings`)
          setBookings(data)
          setLoading(false)
          setError(null)
        },
        err => {
          logger.error('❌ Error in service bookings subscription:', err)
          setError('Failed to load service bookings')
          setLoading(false)
        },
      )

      unsubscribeRef.current = unsubscribe
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

    const firestoreData = {
      ...bookingData,
      organizationId,
      createdAt: serverTimestamp(),
      workRequired: bookingData.workRequired,
      serviceBay: bookingData.serviceBay || 1,
    }

    const ref = await addDoc(collection(db, SERVICE_BOOKINGS_COLLECTION), firestoreData)

    // 👥 Upsert the customer record so the contact details are reusable
    // across future bookings. Fire-and-forget — a transient Firestore
    // hiccup here must NOT roll back a successful booking save.
    if (bookingData.customerName && bookingData.customerPhone) {
      try {
        const { customerService } = await import('@/lib/customerService')
        await customerService.upsertCustomerForBooking({
          organizationId,
          name: bookingData.customerName,
          phone: bookingData.customerPhone,
          email: bookingData.customerEmail,
          // Append this vehicle to the customer's registration history.
          // Skipped for lunch-break sentinel bookings.
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

    return ref.id
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
    const ref = doc(db, SERVICE_BOOKINGS_COLLECTION, bookingId)
    const actorName = user.displayName || user.email || 'Unknown User'
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
      lastModifiedBy: user.uid,
      lastModifiedByName: actorName,
    })

    // 👥 Re-upsert customer when an edit changed contact details. We don't
    // bump bookingCount here (the booking already counted on create) — but
    // we do want name/email corrections to flow back to the customer record
    // so the autocomplete stays accurate. Skipped if no contact fields in
    // the patch (e.g. drag-resize updates only timeSlot / serviceBay).
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
    const ref = doc(db, SERVICE_BOOKINGS_COLLECTION, bookingId)
    const actorName = user.displayName || user.email || 'Unknown User'
    // Stamp attribution before delete so the onServiceBookingDeleted trigger
    // can read who cancelled it from the deleted snapshot's data.
    try {
      await updateDoc(ref, {
        cancelledBy: user.uid,
        cancelledByName: actorName,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      logger.warn('Could not stamp cancelledBy before delete:', err)
    }
    await deleteDoc(ref)
  }

  // Find vehicle's original branch before service
  const findVehicleOriginalBranch = async (registration: string) => {
    if (!organizationId) return null

    const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')

    try {
      const vehiclesQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
      )

      const vehicleSnapshot = await getDocs(vehiclesQuery)

      for (const vehicleDoc of vehicleSnapshot.docs) {
        const vehicleData = vehicleDoc.data()
        const vehicleReg = vehicleData.registration?.toUpperCase().replace(/\s+/g, '')

        if (vehicleReg === cleanReg) {
          const branchId = vehicleData.branchId || 'main'

          const { branchService } = await import('@/lib/services/branchService')
          const branches = await branchService.getBranches(organizationId)
          const branch = branches.find(b => b.slug === branchId)

          return {
            branchId,
            branchName: branch?.name || (branchId === 'main' ? 'Main Branch' : branchId),
            vehicleData,
            vehicleDocRef: vehicleDoc.ref,
          }
        }
      }

      return null
    } catch (err) {
      logger.error('Error finding vehicle branch:', err)
      return null
    }
  }

  // Look up original vehicle data from various sources
  const lookupOriginalVehicleData = async (registration: string) => {
    if (!organizationId) return null

    try {
      const cleanReg = registration.toUpperCase().replace(/\s+/g, '')
      logger.log(`Looking up original data for vehicle: ${registration} (cleaned: ${cleanReg})`)

      const externalGarageQuery = query(
        collection(db, 'checkoutHistory'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg),
        where('isExternalGarageCheckout', '==', true),
        orderBy('checkedOutDate', 'desc'),
      )

      const externalGarageSnapshot = await getDocs(externalGarageQuery)
      if (!externalGarageSnapshot.empty) {
        const externalGarageRecord = externalGarageSnapshot.docs[0].data()
        logger.log(`Found external garage checkout record for ${registration}`)
        return {
          make: externalGarageRecord.make || '',
          model: externalGarageRecord.model || '',
          colour: externalGarageRecord.colour || '',
          size: externalGarageRecord.size || '',
          condition: externalGarageRecord.condition || 'Good',
          motExpiry: externalGarageRecord.motExpiry || '',
          taxExpiry: externalGarageRecord.taxExpiry || '',
          contract: externalGarageRecord.contract || null,
          contractColor: externalGarageRecord.contractColor || null,
          insuranceStatus: externalGarageRecord.insuranceStatus || null,
          mileage: externalGarageRecord.mileage || '',
          comments: externalGarageRecord.comments || '',
          originalBranchId: externalGarageRecord.originalBranchId,
          originalBranchName: externalGarageRecord.originalBranchName,
        }
      }

      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg),
      )

      const fleetSnapshot = await getDocs(fleetQuery)
      if (!fleetSnapshot.empty) {
        const fleetVehicle = fleetSnapshot.docs[0].data()
        logger.log(`Found vehicle data in fleet for ${registration}`)
        return {
          make: fleetVehicle.make || '',
          model: fleetVehicle.model || '',
          colour: fleetVehicle.colour || '',
          size: fleetVehicle.size || '',
          condition: fleetVehicle.condition || 'Good',
          motExpiry: fleetVehicle.motExpiry || '',
          taxExpiry: fleetVehicle.taxExpiry || '',
          contract: fleetVehicle.contract || null,
          contractColor: fleetVehicle.contractColor || null,
          insuranceStatus: fleetVehicle.insuranceStatus || null,
          mileage: fleetVehicle.mileage || '',
          comments: fleetVehicle.comments || '',
        }
      }

      const checkoutQuery = query(
        collection(db, 'checkoutHistory'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg),
        orderBy('checkedOutDate', 'desc'),
      )

      const checkoutSnapshot = await getDocs(checkoutQuery)
      if (!checkoutSnapshot.empty) {
        const lastCheckout = checkoutSnapshot.docs[0].data()
        logger.log(`Found vehicle data in checkout history for ${registration}`)
        return {
          make: lastCheckout.make || '',
          model: lastCheckout.model || '',
          colour: lastCheckout.colour || '',
          size: lastCheckout.size || '',
          condition: lastCheckout.condition || 'Good',
          motExpiry: lastCheckout.motExpiry || '',
          taxExpiry: lastCheckout.taxExpiry || '',
          contract: lastCheckout.contract || null,
          contractColor: lastCheckout.contractColor || null,
          insuranceStatus: lastCheckout.insuranceStatus || null,
          mileage: lastCheckout.mileage || '',
          comments: lastCheckout.comments || '',
        }
      }

      const regWithSpaces = cleanReg.replace(/^(.{2})(.{2})(.+)$/, '$1 $2 $3')
      if (regWithSpaces !== cleanReg) {
        logger.log(`Trying alternative format: ${regWithSpaces}`)

        const altFleetQuery = query(
          collection(db, 'vehicles'),
          where('organizationId', '==', organizationId),
          where('registration', '==', regWithSpaces),
        )

        const altFleetSnapshot = await getDocs(altFleetQuery)
        if (!altFleetSnapshot.empty) {
          const fleetVehicle = altFleetSnapshot.docs[0].data()
          logger.log(`Found vehicle data in fleet with alternative format for ${registration}`)
          return {
            make: fleetVehicle.make || '',
            model: fleetVehicle.model || '',
            colour: fleetVehicle.colour || '',
            size: fleetVehicle.size || '',
            condition: fleetVehicle.condition || 'Good',
            motExpiry: fleetVehicle.motExpiry || '',
            taxExpiry: fleetVehicle.taxExpiry || '',
            contract: fleetVehicle.contract || null,
            contractColor: fleetVehicle.contractColor || null,
            mileage: fleetVehicle.mileage || '',
            comments: fleetVehicle.comments || '',
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

  // Check-in vehicle to garage with branch tracking
  const checkInToGarage = async (booking: ServiceBooking): Promise<void> => {
    if (!user || !organizationId) throw new Error('User not authenticated')
    if (!booking.id) throw new Error('Booking ID is required')

    try {
      const batch = writeBatch(db)

      const branchInfo = await findVehicleOriginalBranch(booking.registration)

      if (branchInfo) {
        logger.log(
          `🔧 Vehicle ${booking.registration} found in ${branchInfo.branchName}, setting external garage status...`,
        )

        const vehicleData = branchInfo.vehicleData

        const preservedHireFields: any = {}
        if (vehicleData.hireStatus === 'Out on Hire') {
          logger.log(`📌 Preserving hire status for ${booking.registration}`)
          preservedHireFields.hireStatus = vehicleData.hireStatus
          preservedHireFields.originalStatus = vehicleData.originalStatus
          preservedHireFields.hiredAt = vehicleData.hiredAt
          preservedHireFields.hiredBy = vehicleData.hiredBy
          preservedHireFields.hiredByName = vehicleData.hiredByName
          preservedHireFields.hireNotes = vehicleData.hireNotes
        }

        batch.update(branchInfo.vehicleDocRef, {
          transferStatus: 'at_external_garage',
          externalGarageId: '',
          externalGarageName: booking.externalProvider?.garageName || 'External Garage',
          serviceBookingId: booking.id,
          checkedOutToGarageAt: serverTimestamp(),
          checkedOutToGarageBy: user.uid,
          checkedOutToGarageByName: user.displayName || user.email || 'Unknown User',
          ...preservedHireFields,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Vehicle checked in to ${booking.externalProvider?.garageName || 'external garage'} via service booking${vehicleData.hireStatus === 'Out on Hire' ? ' (hire status preserved)' : ''}`,
            editedBy: user.uid,
            editedByName: user.displayName || user.email || 'Unknown User',
            editedAt: new Date(),
          },
        })

        logger.log(
          `✅ Vehicle ${booking.registration} marked as at external garage (will appear in Dashboard External Garage section)`,
        )
      } else {
        logger.log(
          `ℹ️ Vehicle ${booking.registration} not found in any branch - just updating booking status`,
        )
      }

      const bookingRef = doc(db, SERVICE_BOOKINGS_COLLECTION, booking.id)
      batch.update(bookingRef, {
        status: 'checked_in_to_garage',
        checkedInToGarageAt: serverTimestamp(),
        checkedInToGarageBy: user.uid,
        checkedInToGarageByName: user.displayName || user.email || 'Unknown User',
        updatedAt: serverTimestamp(),
        originalBranchId: branchInfo?.branchId || 'main',
        originalBranchName: branchInfo?.branchName || 'Main Branch',
        vehicleRemovedFromBranch: !!branchInfo,
      })

      await batch.commit()

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

  // Mark as completed with branch return prompt
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
        const batch = writeBatch(db)

        const bookingRef = doc(db, SERVICE_BOOKINGS_COLLECTION, booking.id)
        batch.update(bookingRef, {
          status: 'completed',
          updatedAt: serverTimestamp(),
          // Stamp completion attribution so per-vehicle service history has a
          // trustworthy date + actor going forward (these fields existed in
          // the type but were never written).
          completedAt: serverTimestamp(),
          completedBy: user.uid,
          completedByName: user.displayName || user.email || 'Unknown User',
          // Internal-only odometer reading (optional). Only the internal
          // completion path passes this; external/garage never does.
          ...(typeof mileage === 'number' && !Number.isNaN(mileage)
            ? { mileage }
            : {}),
        })

        if (shouldCheckBackIn) {
          const originalBranch = booking.originalBranchName || 'Main Branch'
          const originalVehicleData = await lookupOriginalVehicleData(booking.registration)

          const checkInData = {
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
            contractColor: originalVehicleData?.contractColor || null,
            insuranceStatus: originalVehicleData?.insuranceStatus || null,
            motExpiry: originalVehicleData?.motExpiry || '',
            taxExpiry: originalVehicleData?.taxExpiry || '',
            branchId: booking.originalBranchId || 'main',
            userId: user.uid,
            organizationId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            checkInTime: serverTimestamp(),
            transferStatus: deleteField(),
            externalGarageId: deleteField(),
            externalGarageName: deleteField(),
            serviceBookingId: deleteField(),
            checkedOutToGarageAt: deleteField(),
            checkedOutToGarageBy: deleteField(),
            checkedOutToGarageByName: deleteField(),
            lastEditLog: {
              action: `Vehicle returned from service at ${booking.externalProvider?.garageName || 'external garage'} to ${originalBranch}`,
              editedBy: user.uid,
              editedByName: user.displayName || user.email || 'Unknown User',
              editedAt: new Date(),
            },
          }

          // 🛠️ Use space-insensitive registration matching to avoid creating
          // a duplicate when the booking's `registration` differs only in
          // whitespace from the existing yard doc (e.g. "AB12CDE" vs
          // "AB12 CDE"). findVehicleOriginalBranch already walks the org's
          // checkedInVehicles and matches on normalized reg.
          const existingBranchInfo = await findVehicleOriginalBranch(booking.registration)

          if (existingBranchInfo) {
            batch.update(existingBranchInfo.vehicleDocRef, checkInData)
            logger.log(`✅ Updating existing vehicle doc for ${booking.registration}`)
          } else {
            const newRef = doc(collection(db, 'checkedInVehicles'))
            batch.set(newRef, checkInData)
            logger.log(`⚠️ No existing doc found — creating new for ${booking.registration}`)
          }
        }

        if (booking.isExternalProvider && booking.status === 'scheduled' && !shouldCheckBackIn) {
          logger.log(`🔧 External garage booking - looking for vehicle to clear garage status...`)

          // 🛠️ Search by serviceBookingId — set on the vehicle doc when
          // checkInToGarage ran. This is a precise reference (no registration
          // normalization issues) and guarantees we touch only the vehicle
          // tied to THIS booking.
          const vehiclesQuery = query(
            collection(db, 'checkedInVehicles'),
            where('organizationId', '==', organizationId),
            where('serviceBookingId', '==', booking.id),
          )

          const vehiclesSnapshot = await getDocs(vehiclesQuery)

          if (!vehiclesSnapshot.empty) {
            const vehicleDoc = vehiclesSnapshot.docs[0]
            const vehicleData = vehicleDoc.data()

            if (
              vehicleData.transferStatus === 'at_external_garage' &&
              vehicleData.serviceBookingId === booking.id
            ) {
              logger.log(`✅ Found vehicle ${booking.registration} at external garage, clearing status...`)

              batch.update(vehicleDoc.ref, {
                transferStatus: deleteField(),
                externalGarageId: deleteField(),
                externalGarageName: deleteField(),
                serviceBookingId: deleteField(),
                checkedOutToGarageAt: deleteField(),
                checkedOutToGarageBy: deleteField(),
                checkedOutToGarageByName: deleteField(),
                returnedFromGarageAt: serverTimestamp(),
                returnedFromGarageBy: user.uid,
                returnedFromGarageByName: user.displayName || user.email || 'Unknown User',
                updatedAt: serverTimestamp(),
              })

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

        await batch.commit()
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
      const snap = await getDocs(
        query(
          collection(db, SERVICE_BOOKINGS_COLLECTION),
          where('organizationId', '==', organizationId),
          orderBy('date', 'asc'),
          orderBy('timeSlot', 'asc'),
        ),
      )
      const data = snap.docs.map(d => mapBookingDoc(d.id, d.data()))

      setBookings(data)
      setError(null)
      logger.log(`✅ Service bookings manual refresh completed: ${data.length} bookings`)
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
