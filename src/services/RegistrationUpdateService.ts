// src/services/RegistrationUpdateService.ts - Simplified version
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  doc,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

export interface RegistrationUpdateResult {
  success: boolean
  collections: {
    checkedInVehicles: number
    serviceBookings: number
    externalServices: number
    total: number
  }
  errors: string[]
  oldRegistration: string
  newRegistration: string
}

/**
 * Service to cascade registration changes across ONLY essential collections
 * Updates: checkedInVehicles, serviceBookings, externalServiceVehicles
 */
export class RegistrationUpdateService {
  
  static async cascadeRegistrationUpdate(
    vehicleId: string,
    oldRegistration: string,
    newRegistration: string,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<RegistrationUpdateResult> {
    
    logger.log(`🔄 REGISTRATION UPDATE: ${oldRegistration} → ${newRegistration}`)
    
    const result: RegistrationUpdateResult = {
      success: false,
      collections: {
        checkedInVehicles: 0,
        serviceBookings: 0,
        externalServices: 0,
        total: 0
      },
      errors: [],
      oldRegistration,
      newRegistration
    }

    // Normalize registrations
    const oldRegClean = oldRegistration.trim().toUpperCase().replace(/\s+/g, '')
    const newRegClean = newRegistration.trim().toUpperCase()

    try {
      const batch = writeBatch(db)
      let batchCount = 0
      const MAX_BATCH = 500

      // 1. UPDATE CHECKED-IN VEHICLES (ALL BRANCHES)
      logger.log('📍 Updating checked-in vehicles...')
      
      try {
        // Try by vehicleId first
        const checkedInByIdQuery = query(
          collection(db, 'checkedInVehicles'),
          where('organizationId', '==', organizationId),
          where('vehicleId', '==', vehicleId)
        )
        
        const byIdSnapshot = await getDocs(checkedInByIdQuery)
        
        // Also check by registration for legacy data
        const checkedInByRegQuery = query(
          collection(db, 'checkedInVehicles'),
          where('organizationId', '==', organizationId)
        )
        
        const byRegSnapshot = await getDocs(checkedInByRegQuery)
        
        const processedIds = new Set<string>()
        
        // Update by vehicleId matches
        byIdSnapshot.forEach(docSnap => {
          if (batchCount >= MAX_BATCH) return
          
          batch.update(doc(db, 'checkedInVehicles', docSnap.id), {
            registration: newRegistration,
            updatedAt: serverTimestamp()
          })
          
          processedIds.add(docSnap.id)
          batchCount++
          result.collections.checkedInVehicles++
        })
        
        // Update by registration matches (avoiding duplicates)
        byRegSnapshot.forEach(docSnap => {
          if (processedIds.has(docSnap.id)) return
          if (batchCount >= MAX_BATCH) return
          
          const data = docSnap.data()
          const docReg = (data.registration || '').toUpperCase().replace(/\s+/g, '')
          
          if (docReg === oldRegClean) {
            batch.update(doc(db, 'checkedInVehicles', docSnap.id), {
              registration: newRegistration,
              updatedAt: serverTimestamp()
            })
            
            batchCount++
            result.collections.checkedInVehicles++
          }
        })
        
        logger.log(`  ✓ Found ${result.collections.checkedInVehicles} checked-in vehicles`)
        
      } catch (error) {
        logger.log('Could not update checked-in vehicles:', error)
        // Continue with other collections
      }

      // 2. UPDATE SERVICE BOOKINGS
      logger.log('🔧 Updating service bookings...')
      
      try {
        const serviceBookingsQuery = query(
          collection(db, 'serviceBookings'),
          where('organizationId', '==', organizationId)
        )
        
        const serviceSnapshot = await getDocs(serviceBookingsQuery)
        
        serviceSnapshot.forEach(docSnap => {
          if (batchCount >= MAX_BATCH) return
          
          const data = docSnap.data()
          const docReg = (data.registration || '').toUpperCase().replace(/\s+/g, '')
          
          if (docReg === oldRegClean) {
            batch.update(doc(db, 'serviceBookings', docSnap.id), {
              registration: newRegistration,
              updatedAt: serverTimestamp()
            })
            
            batchCount++
            result.collections.serviceBookings++
          }
        })
        
        logger.log(`  ✓ Found ${result.collections.serviceBookings} service bookings`)
        
      } catch (error) {
        logger.log('Could not update service bookings:', error)
        // Continue with other collections
      }

      // 3. UPDATE EXTERNAL SERVICE VEHICLES (if collection exists)
      logger.log('🏭 Updating external service records...')
      
      try {
        const externalServiceQuery = query(
          collection(db, 'externalServiceVehicles'),
          where('organizationId', '==', organizationId)
        )
        
        const externalSnapshot = await getDocs(externalServiceQuery)
        
        externalSnapshot.forEach(docSnap => {
          if (batchCount >= MAX_BATCH) return
          
          const data = docSnap.data()
          const docReg = (data.registration || '').toUpperCase().replace(/\s+/g, '')
          
          if (docReg === oldRegClean) {
            batch.update(doc(db, 'externalServiceVehicles', docSnap.id), {
              registration: newRegistration,
              updatedAt: serverTimestamp()
            })
            
            batchCount++
            result.collections.externalServices++
          }
        })
        
        logger.log(`  ✓ Found ${result.collections.externalServices} external service records`)
        
      } catch (error) {
        logger.log('Could not update external service vehicles:', error)
        // This collection might not exist, that's OK
      }

      // Commit the batch
      if (batchCount > 0) {
        logger.log(`💾 Updating ${batchCount} documents...`)
        await batch.commit()
        logger.log('✅ All updates committed successfully!')
      } else {
        logger.log('ℹ️ No documents needed updating')
      }

      // Calculate total
      result.collections.total = 
        result.collections.checkedInVehicles +
        result.collections.serviceBookings +
        result.collections.externalServices

      result.success = true

      logger.log(`\n✅ REGISTRATION UPDATE COMPLETE!`)
      logger.log(`📊 Updated ${result.collections.total} total documents:`)
      logger.log(`  • Checked-in vehicles: ${result.collections.checkedInVehicles}`)
      logger.log(`  • Service bookings: ${result.collections.serviceBookings}`)
      logger.log(`  • External services: ${result.collections.externalServices}`)

      return result

    } catch (error) {
      logger.error('❌ Registration update failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
      return result
    }
  }

  /**
   * Validate that new registration doesn't already exist
   */
  static async validateNewRegistration(
    newRegistration: string,
    organizationId: string,
    excludeVehicleId?: string
  ): Promise<{ valid: boolean; error?: string }> {
    
    const cleanReg = newRegistration.trim().toUpperCase().replace(/\s+/g, '')
    
    // Check in fleet
    const fleetQuery = query(
      collection(db, 'vehicles'),
      where('organizationId', '==', organizationId)
    )
    
    const fleetSnapshot = await getDocs(fleetQuery)
    
    for (const doc of fleetSnapshot.docs) {
      if (excludeVehicleId && doc.id === excludeVehicleId) continue
      
      const data = doc.data()
      const existingReg = (data.registration || '').toUpperCase().replace(/\s+/g, '')
      
      if (existingReg === cleanReg) {
        return { 
          valid: false, 
          error: `Registration ${newRegistration} already exists in fleet` 
        }
      }
    }
    
    return { valid: true }
  }
}