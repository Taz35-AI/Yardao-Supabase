// src/lib/services/vehicleHireService.ts
// ✅ FIXED: quickCheckIn now resets createdAt to serverTimestamp() so Days in Yard
//           counter restarts from 0 when a vehicle returns from hire.
//           Previously createdAt was never touched, so the counter kept running
//           from the original check-in date even across hire periods.
// ✨ PHASE 2.5a: Now also clears `parkingSpaceId` when a vehicle goes on hire,
//                so the yard layout doesn't keep ghost-occupying its parking
//                space while the vehicle is off-yard. On return, the vehicle
//                comes back unparked — user re-parks it manually (Option A).

import { 
  doc, 
  updateDoc, 
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  Timestamp,
  getDoc
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { 
  CheckedInVehicle, 
  VehicleHireStatus, 
  createHireAuditLog
} from '@/types'
import { logger } from '@/lib/logger'

export class VehicleHireService {
  private static readonly VEHICLES_COLLECTION = 'checkedInVehicles'
  private static readonly HIRE_HISTORY_COLLECTION = 'hireHistory'

  /**
   * Calculate days between two dates — COUNTS NIGHTS
   * Same day = 1 day, otherwise count nights slept away
   */
  private static calculateDurationInDays(startDate: Date, endDate: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    const startTime = new Date(startDate).setHours(0, 0, 0, 0)
    const endTime   = new Date(endDate).setHours(0, 0, 0, 0)
    const diffMs    = endTime - startTime
    const nightCount = Math.floor(diffMs / msPerDay)
    // Same day = 0 nights → count as 1 day; otherwise return night count
    return nightCount === 0 ? 1 : nightCount
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SET OUT ON HIRE
  // Creates a hire history record and marks the vehicle as Out on Hire.
  // createdAt is deliberately NOT touched here — the vehicle is still in the
  // same yard document it was checked into.
  // ✨ Phase 2.5a: parkingSpaceId is cleared so the yard layout no longer
  //               considers the slot occupied while the vehicle is off-yard.
  // ─────────────────────────────────────────────────────────────────────────────
  static async setOutOnHire(
    vehicleId: string,
    userId: string,
    userDisplayName: string,
    hireNotes?: string
  ): Promise<void> {
    try {
      logger.log(`🚗 Setting vehicle ${vehicleId} out on hire by ${userDisplayName}`)
      
      const hireAuditLog = createHireAuditLog('hired', userDisplayName, userId, hireNotes)

      // Fetch current vehicle data
      const vehicleDoc = await getDocs(
        query(
          collection(db, this.VEHICLES_COLLECTION),
          where('__name__', '==', vehicleId)
        )
      )

      if (vehicleDoc.empty) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleDoc.docs[0].data() as CheckedInVehicle

      if (vehicleData.hireStatus === 'Out on Hire') {
        throw new Error(`Vehicle ${vehicleData.registration} is already out on hire`)
      }

      // Create hire history record
      const hireHistoryRecord = {
        vehicleId,
        registration: vehicleData.registration.trim().toUpperCase().replace(/\s+/g, ''),
        make: vehicleData.make || '',
        model: vehicleData.model || '',
        hireStartDate: serverTimestamp(),
        hireEndDate: null,
        hiredBy: userId,
        hiredByName: userDisplayName,
        hireNotes: hireNotes || '',
        organizationId: vehicleData.organizationId,
        branchId: vehicleData.branchId || 'main',
        branchName: vehicleData.branchId || 'Main Branch',
        createdAt: serverTimestamp()
      }

      const hireHistoryRef = await addDoc(
        collection(db, this.HIRE_HISTORY_COLLECTION),
        hireHistoryRecord
      )

      logger.log(`✅ Created hire history record: ${hireHistoryRef.id}`)

      // Update vehicle — mark as out on hire
      const vehicleRef = doc(db, this.VEHICLES_COLLECTION, vehicleId)
      await updateDoc(vehicleRef, {
        hireStatus: 'Out on Hire' as VehicleHireStatus,
        originalStatus: vehicleData.status,
        hiredAt: serverTimestamp(),
        hiredBy: userId,
        hiredByName: userDisplayName,
        hireNotes: hireNotes || '',
        lastEditLog: hireAuditLog,
        updatedAt: serverTimestamp(),
        currentHireHistoryId: hireHistoryRef.id,
        // ✨ Phase 2.5a: free the parking space — vehicle is leaving the yard
        parkingSpaceId: null,
        // ⚠️  createdAt intentionally NOT reset here — vehicle is still checked in,
        //     the "days in yard" counter should keep running while it's out on hire
        //     so managers can see how long it's been on-site total.
        //     The counter resets in quickCheckIn() when the vehicle actually returns.
      })

      logger.log(`✅ Vehicle ${vehicleData.registration} set out on hire (parking space released)`)
    } catch (error) {
      logger.error('Error setting vehicle out on hire:', error)
      throw new Error(`Failed to set vehicle out on hire: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUICK CHECK-IN  (return from hire)
  // ✅ FIX: Now resets createdAt + checkInTime to serverTimestamp() so the
  //         "Days in Yard" bar resets to 0d when the vehicle comes back.
  // ✨ Phase 2.5a: parkingSpaceId stays null so user has to manually re-park
  //                the vehicle when it returns from hire (Option A).
  // ─────────────────────────────────────────────────────────────────────────────
  static async quickCheckIn(
    vehicleId: string,
    userId: string,
    userDisplayName: string,
    returnNotes?: string
  ): Promise<void> {
    try {
      logger.log(`🔄 Returning vehicle ${vehicleId} from hire by ${userDisplayName}`)
      
      const returnAuditLog = createHireAuditLog('returned', userDisplayName, userId, returnNotes)

      // Fetch current vehicle data
      const vehicleDoc = await getDocs(
        query(
          collection(db, this.VEHICLES_COLLECTION),
          where('__name__', '==', vehicleId)
        )
      )

      if (vehicleDoc.empty) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleDoc.docs[0].data() as CheckedInVehicle & { currentHireHistoryId?: string }

      if (vehicleData.hireStatus !== 'Out on Hire') {
        throw new Error(`Vehicle ${vehicleData.registration} is not currently on hire`)
      }

      // ── Update hire history record ──────────────────────────────────────────
      if (vehicleData.currentHireHistoryId) {
        try {
          const hireHistoryRef = doc(db, this.HIRE_HISTORY_COLLECTION, vehicleData.currentHireHistoryId)
          const hireHistoryDoc = await getDoc(hireHistoryRef)

          if (hireHistoryDoc.exists()) {
            const hireData = hireHistoryDoc.data()

            const hireStartDate = hireData.hireStartDate instanceof Timestamp
              ? hireData.hireStartDate.toDate()
              : new Date(hireData.hireStartDate)

            const now = new Date()
            const durationInDays = this.calculateDurationInDays(hireStartDate, now)

            await updateDoc(hireHistoryRef, {
              hireEndDate: serverTimestamp(),
              durationInDays,
              returnedBy: userId,
              returnedByName: userDisplayName,
              returnNotes: returnNotes || '',
              updatedAt: serverTimestamp()
            })

            logger.log(`✅ Updated hire history: ${vehicleData.currentHireHistoryId} (${durationInDays} days)`)
          }
        } catch (historyError) {
          // Non-fatal — vehicle update still proceeds
          logger.error('Error updating hire history:', historyError)
        }
      } else {
        logger.log(`⚠️ No hire history ID found for vehicle ${vehicleId}`)
      }

      // ── Update vehicle record ───────────────────────────────────────────────
      const vehicleRef = doc(db, this.VEHICLES_COLLECTION, vehicleId)

      await updateDoc(vehicleRef, {
        hireStatus: 'In Yard' as VehicleHireStatus,
        status: vehicleData.originalStatus || vehicleData.status,
        lastEditLog: returnAuditLog,
        updatedAt: serverTimestamp(),
        // ✅ FIX: Reset the yard clock so "Days in Yard" starts fresh from return
        createdAt: serverTimestamp(),
        checkInTime: serverTimestamp(),
        // ✨ Phase 2.5a: defensive — vehicle returns unparked. Even if some
        // edge case set parkingSpaceId during the hire window (shouldn't
        // happen), this guarantees the user re-parks intentionally.
        parkingSpaceId: null,
        // Clear all hire fields
        originalStatus: null,
        hiredAt: null,
        hiredBy: null,
        hiredByName: null,
        hireNotes: null,
        currentHireHistoryId: null
      })

      logger.log(`✅ Vehicle ${vehicleData.registration} returned from hire — Days in Yard reset to 0, unparked`)
    } catch (error) {
      logger.error('Error returning vehicle from hire:', error)
      throw new Error(`Failed to return vehicle from hire: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET CURRENTLY HIRED VEHICLES
  // ─────────────────────────────────────────────────────────────────────────────
  static async getCurrentlyHiredVehicles(
    organizationId: string,
    branchId?: string
  ): Promise<CheckedInVehicle[]> {
    try {
      let q = query(
        collection(db, this.VEHICLES_COLLECTION),
        where('organizationId', '==', organizationId),
        where('hireStatus', '==', 'Out on Hire')
      )

      if (branchId) {
        q = query(q, where('branchId', '==', branchId))
      }

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CheckedInVehicle))
    } catch (error) {
      logger.error('Error fetching currently hired vehicles:', error)
      throw new Error(`Failed to fetch hired vehicles: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET ALL VEHICLES WITH HIRE STATUS
  // ─────────────────────────────────────────────────────────────────────────────
  static async getAllVehiclesWithHireStatus(
    organizationId: string,
    branchId?: string
  ): Promise<CheckedInVehicle[]> {
    try {
      let q = query(
        collection(db, this.VEHICLES_COLLECTION),
        where('organizationId', '==', organizationId)
      )

      if (branchId) {
        q = query(q, where('branchId', '==', branchId))
      }

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CheckedInVehicle))
    } catch (error) {
      logger.error('Error fetching vehicles with hire status:', error)
      throw new Error(`Failed to fetch vehicles: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}