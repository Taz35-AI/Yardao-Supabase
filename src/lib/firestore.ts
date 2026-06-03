// src/lib/firestore.ts - UPDATED: Complete version with ID-based vehicle relationships
// ✅ FIXED: organizationService now initializes conditions atomically
// ✅ ADDED: dateAcquired field support in Vehicle interface and service methods
// ✅ ADDED: defleet fields support in Vehicle interface INCLUDING defleetDate
// ✅ ADDED: settingsService export for supplier management
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  updateDoc,
  query,
  where,
  orderBy,
  getDoc,
  setDoc 
} from 'firebase/firestore'
import { updatePassword, updateProfile } from 'firebase/auth'
import { db } from './firebase'
import { UserProfile, Organization, VehicleStatus, isUserDeleted, Contract, InsuranceStatus, DefleetReason } from '@/types'
import { logger } from '@/lib/logger'

// UPDATED: Vehicle interface with ID-based relationships + DEFLEET FIELDS INCLUDING defleetDate
export interface Vehicle {
  insurancePolicyId: null
  insurancePolicyName: null
  insurancePolicyExpiry: null
  id?: string // Firestore document ID - primary key
  registration: string // Still unique, but not primary lookup key
  make: string
  model: string
  colour: string
  size: string
  motExpiry: string
  taxExpiry: string
  comments: string
  condition: string
  contract?: string | null // Contract field (display name)
  contractColor?: string | null // Contract color field (denormalised copy)
  contractId?: string | null // Stable link to the contract doc (source of truth)
  insuranceStatus?: InsuranceStatus | null // Insurance Status field
  dateAcquired?: string | null // ✅ ADDED: Date vehicle was acquired
  createdAt: string
  organizationId: string
  createdBy: string
  
  // NEW: Current status tracking
  currentStatus?: 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted'
  currentLocation?: string // Branch ID where it's currently located
  lastKnownLocation?: string
  updatedAt?: string
  
  // ✅ COMPLETE: Defleet tracking fields
  isDefleeted?: boolean              // Quick filter flag
  defleetDate?: string | null        // ✅ NEW: When it was defleeted (user-provided date) - YYYY-MM-DD format
  defleetProcessedDate?: string      // When the defleet was processed in system (ISO timestamp)
  defleetReason?: DefleetReason      // Why it was defleeted
  defleetReasonDetails?: string      // Additional details/comments
  defleetedBy?: string               // User ID who defleeted it
  defleetedByName?: string           // User display name
}

export interface ConditionCategory {
  id: string
  name: string
  order: number
  organizationId: string
  color: string
  severity: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
}

// UPDATED: YardVehicle interface with ID-based relationships
export interface YardVehicle {
  id?: string
  
  // NEW: ID-based relationship to fleet inventory
  vehicleId?: string | null // Reference to the vehicle in fleet inventory
  
  registration: string
  size: string
  mileage: string
  condition: string
  comments: string
  dateIn: string
  createdAt: string
  organizationId: string
  checkedInBy: string
  status: VehicleStatus
  make?: string
  model?: string
  colour?: string
  contract?: string | null // Contract field (display name)
  contractColor?: string | null // Contract color field (denormalised copy)
  contractId?: string | null // Stable link to the contract doc (source of truth)
  insuranceStatus?: InsuranceStatus | null // Insurance Status field
  motExpiry?: string
  taxExpiry?: string
}

const VEHICLES_COLLECTION = 'vehicles'
const CONDITIONS_COLLECTION = 'conditionCategories'
const CONTRACTS_COLLECTION = 'contracts'
const YARD_VEHICLES_COLLECTION = 'yardVehicles'
const USER_PROFILES_COLLECTION = 'userProfiles'
const ORGANIZATIONS_COLLECTION = 'organizations'

// UPDATED: Vehicle service with ID-based lookup helper
export const vehicleService = {
  async addVehicle(vehicle: Omit<Vehicle, 'id' | 'createdAt'>) {
    const vehicleData = {
      ...vehicle,
      createdAt: new Date().toISOString(),
      currentStatus: 'in_fleet' as const,
      dateAcquired: vehicle.dateAcquired || null // ✅ ADDED: Preserve dateAcquired
    }
    const docRef = await addDoc(collection(db, VEHICLES_COLLECTION), vehicleData)
    return { id: docRef.id, ...vehicleData }
  },

  async getVehicles(organizationId: string): Promise<Vehicle[]> {
  const q = query(
    collection(db, VEHICLES_COLLECTION),
    where('organizationId', '==', organizationId),
    orderBy('createdAt', 'desc')
  )
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as Vehicle))
    .filter(vehicle => vehicle.isDefleeted !== true && vehicle.currentStatus !== 'defleeted')
},

  // NEW: Get vehicle by document ID (fastest lookup)
  async getVehicleById(vehicleId: string): Promise<Vehicle | null> {
    try {
      const docRef = doc(db, VEHICLES_COLLECTION, vehicleId)
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Vehicle
      }
      return null
    } catch (error) {
      logger.error('Error fetching vehicle by ID:', error)
      return null
    }
  },

  // NEW: Get vehicle by registration (fallback for legacy support)
  async getVehicleByRegistration(organizationId: string, registration: string): Promise<Vehicle | null> {
    try {
      const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
      const q = query(
        collection(db, VEHICLES_COLLECTION),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      const querySnapshot = await getDocs(q)
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0]
        return { id: doc.id, ...doc.data() } as Vehicle
      }
      return null
    } catch (error) {
      logger.error('Error fetching vehicle by registration:', error)
      return null
    }
  },

  // NEW: Search vehicles for check-in form
  async searchVehiclesForCheckIn(organizationId: string, searchTerm: string = ''): Promise<Vehicle[]> {
    try {
      // Get all vehicles for the organization
      const q = query(
        collection(db, VEHICLES_COLLECTION),
        where('organizationId', '==', organizationId),
        orderBy('registration', 'asc')
      )
      const querySnapshot = await getDocs(q)
      
      let vehicles = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Vehicle))

      // Filter by search term if provided
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        vehicles = vehicles.filter(vehicle => {
          const registration = vehicle.registration?.toLowerCase() || ''
          const make = vehicle.make?.toLowerCase() || ''
          const model = vehicle.model?.toLowerCase() || ''
          
          return registration.includes(term) || 
                 make.includes(term) || 
                 model.includes(term) ||
                 `${make} ${model}`.includes(term)
        })
      }

      return vehicles
    } catch (error) {
      logger.error('Error searching vehicles:', error)
      return []
    }
  },

  async updateVehicle(vehicleId: string, updates: Partial<Omit<Vehicle, 'id' | 'createdAt'>>) {
    const cleaned: any = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    )
    if (cleaned.damagePins) {
      cleaned.damagePins = cleaned.damagePins.map((pin: any) =>
        Object.fromEntries(Object.entries(pin).filter(([, v]) => v !== undefined))
      )
    }
    await updateDoc(doc(db, VEHICLES_COLLECTION, vehicleId), {
      ...cleaned,
      updatedAt: new Date().toISOString()
    })
  },

  // NEW: Update vehicle status (e.g., when checked in/out)
  async updateVehicleStatus(
    vehicleId: string, 
    status: 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted',
    location?: string
  ) {
    const updates: Partial<Vehicle> = {
      currentStatus: status,
      updatedAt: new Date().toISOString()
    }

    if (location) {
      updates.currentLocation = location
      updates.lastKnownLocation = location
    }

    await updateDoc(doc(db, VEHICLES_COLLECTION, vehicleId), updates)
  },

  async deleteVehicle(vehicleId: string) {
    await deleteDoc(doc(db, VEHICLES_COLLECTION, vehicleId))
  },

  async clearAllVehicles(organizationId: string) {
    const q = query(
      collection(db, VEHICLES_COLLECTION),
      where('organizationId', '==', organizationId)
    )
    const querySnapshot = await getDocs(q)
    const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref))
    await Promise.all(deletePromises)
  },

  async bulkAddVehicles(vehicles: Omit<Vehicle, 'id' | 'createdAt'>[]) {
    const addPromises = vehicles.map(vehicle => this.addVehicle(vehicle))
    return Promise.all(addPromises)
  }
}

export const conditionService = {
  async getConditions(organizationId: string): Promise<ConditionCategory[]> {
    const q = query(
      collection(db, CONDITIONS_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('order', 'asc')
    )
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ConditionCategory))
  },

  async addCondition(condition: Omit<ConditionCategory, 'id'>) {
    const docRef = await addDoc(collection(db, CONDITIONS_COLLECTION), condition)
    return { id: docRef.id, ...condition }
  },

  async updateCondition(conditionId: string, updates: Partial<Omit<ConditionCategory, 'id'>> | string) {
    const updateData = typeof updates === 'string' 
      ? { name: updates }
      : updates
    
    await updateDoc(doc(db, CONDITIONS_COLLECTION, conditionId), updateData)
  },

  async deleteCondition(conditionId: string) {
    await deleteDoc(doc(db, CONDITIONS_COLLECTION, conditionId))
  },

  async initializeDefaultConditions(organizationId: string): Promise<ConditionCategory[]> {
    const defaultConditions = [
      {
        name: 'Excellent',
        order: 0,
        color: '#16a34a',
        severity: 'excellent' as const,
        organizationId
      },
      {
        name: 'Good', 
        order: 1,
        color: '#22c55e',
        severity: 'good' as const,
        organizationId
      },
      {
        name: 'Fair',
        order: 2, 
        color: '#eab308',
        severity: 'fair' as const,
        organizationId
      },
      {
        name: 'Poor',
        order: 3,
        color: '#f97316', 
        severity: 'poor' as const,
        organizationId
      },
      {
        name: 'Critical',
        order: 4,
        color: '#ef4444',
        severity: 'critical' as const,
        organizationId
      }
    ]

    const addPromises = defaultConditions.map(condition => this.addCondition(condition))
    return await Promise.all(addPromises)
  }
}

// Contract Service
export const contractService = {
  async getContracts(organizationId: string): Promise<Contract[]> {
    const q = query(
      collection(db, CONTRACTS_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('name', 'asc')
    )
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Contract))
  },

  async addContract(contract: Omit<Contract, 'id'>) {
    const docRef = await addDoc(collection(db, CONTRACTS_COLLECTION), contract)
    return { id: docRef.id, ...contract }
  },

  async updateContract(contractId: string, updates: Partial<Omit<Contract, 'id'>>) {
    await updateDoc(doc(db, CONTRACTS_COLLECTION, contractId), {
      ...updates,
      updatedAt: new Date().toISOString()
    })
  },

  async deleteContract(contractId: string) {
    await deleteDoc(doc(db, CONTRACTS_COLLECTION, contractId))
  }
}

// UPDATED: Yard vehicle service with ID-based relationships
export const yardVehicleService = {
  async addYardVehicle(vehicle: Omit<YardVehicle, 'id' | 'createdAt'>) {
    const vehicleData = {
      ...vehicle,
      createdAt: new Date().toISOString()
    }
    
    // If vehicleId is provided, update fleet status
    if (vehicle.vehicleId) {
      try {
        await vehicleService.updateVehicleStatus(
          vehicle.vehicleId, 
          'checked_in',
          vehicle.organizationId // Use organizationId as location for now
        )
      } catch (error) {
        logger.error('Failed to update fleet vehicle status:', error)
        // Continue with yard check-in even if fleet update fails
      }
    }
    
    const docRef = await addDoc(collection(db, YARD_VEHICLES_COLLECTION), vehicleData)
    return { id: docRef.id, ...vehicleData }
  },

  async getYardVehicles(organizationId: string): Promise<YardVehicle[]> {
    const q = query(
      collection(db, YARD_VEHICLES_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('createdAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as YardVehicle))
  },

  async updateYardVehicle(vehicleId: string, updates: Partial<YardVehicle>) {
    await updateDoc(doc(db, YARD_VEHICLES_COLLECTION, vehicleId), {
      ...updates,
      updatedAt: new Date().toISOString()
    })
  },

  async deleteYardVehicle(vehicleId: string) {
    // Get the yard vehicle first to check if it has a fleet reference
    const docRef = doc(db, YARD_VEHICLES_COLLECTION, vehicleId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const yardVehicle = docSnap.data() as YardVehicle
      
      // If it references a fleet vehicle, update the fleet status back to 'in_fleet'
      if (yardVehicle.vehicleId) {
        try {
          await vehicleService.updateVehicleStatus(yardVehicle.vehicleId, 'in_fleet')
        } catch (error) {
          logger.error('Failed to update fleet vehicle status on checkout:', error)
          // Continue with yard checkout even if fleet update fails
        }
      }
    }
    
    await deleteDoc(docRef)
  },

  async clearAllYardVehicles(organizationId: string) {
    const q = query(
      collection(db, YARD_VEHICLES_COLLECTION),
      where('organizationId', '==', organizationId)
    )
    const querySnapshot = await getDocs(q)
    const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref))
    await Promise.all(deletePromises)
  }
}

// ENHANCED userProfileService with proper typing and additional methods
export const userProfileService = {
  async createProfile(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>) {
    const profileData: UserProfile = {
      ...profile,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Ensure proper defaults for new properties
      isActive: profile.isActive !== undefined ? profile.isActive : true,
      isDeleted: profile.isDeleted !== undefined ? profile.isDeleted : false
    }
    await setDoc(doc(db, USER_PROFILES_COLLECTION, profile.uid), profileData)
    return { id: profile.uid, ...profileData }
  },

  async getProfile(uid: string): Promise<UserProfile | null> {
    const docRef = doc(db, USER_PROFILES_COLLECTION, uid)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const data = docSnap.data() as UserProfile
      
      // Ensure backwards compatibility for missing properties
      return { 
        id: docSnap.id, 
        ...data,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isDeleted: data.isDeleted !== undefined ? data.isDeleted : false
      }
    }
    return null
  },

  async updateProfile(uid: string, updates: Partial<Omit<UserProfile, 'id' | 'uid' | 'createdAt'>>) {
    await updateDoc(doc(db, USER_PROFILES_COLLECTION, uid), {
      ...updates,
      updatedAt: new Date().toISOString()
    })
  },

  async updateLastLogin(uid: string): Promise<void> {
    try {
      await updateDoc(doc(db, USER_PROFILES_COLLECTION, uid), {
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Error updating last login:', error)
    }
  },

  async getUsersByOrganization(organizationId: string): Promise<UserProfile[]> {
    const q = query(
      collection(db, USER_PROFILES_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('createdAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => {
      const data = doc.data() as UserProfile
      
      return {
        id: doc.id,
        ...data,
        isActive: data.isActive !== undefined ? data.isActive : true,
        isDeleted: data.isDeleted !== undefined ? data.isDeleted : false
      }
    })
  },

  async getActiveUsersByOrganization(organizationId: string): Promise<UserProfile[]> {
    const allUsers = await this.getUsersByOrganization(organizationId)
    return allUsers.filter(user => !isUserDeleted(user))
  },

  async softDeleteUser(uid: string, deletedBy: string): Promise<void> {
    await this.updateProfile(uid, {
      isActive: false,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy
    })
  },

  async restoreUser(uid: string): Promise<void> {
    await this.updateProfile(uid, {
      isActive: true,
      isDeleted: false,
      deletedAt: undefined,
      deletedBy: undefined
    })
  },

  async toggleUserStatus(uid: string): Promise<boolean> {
    const profile = await this.getProfile(uid)
    if (!profile) {
      throw new Error('User profile not found')
    }

    const newStatus = !profile.isActive
    await this.updateProfile(uid, {
      isActive: newStatus
    })

    return newStatus
  },

  async isUserActiveAndExists(uid: string): Promise<boolean> {
    const profile = await this.getProfile(uid)
    if (!profile) return false
    
    return !isUserDeleted(profile) && (profile.isActive !== false)
  },

  async getUserCountByOrganization(organizationId: string): Promise<number> {
    const users = await this.getActiveUsersByOrganization(organizationId)
    return users.length
  },

  async searchUsers(organizationId: string, searchTerm: string): Promise<UserProfile[]> {
    const allUsers = await this.getActiveUsersByOrganization(organizationId)
    
    if (!searchTerm.trim()) {
      return allUsers
    }

    const term = searchTerm.toLowerCase().trim()
    return allUsers.filter(user => 
      user.displayName.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term)
    )
  },

  async getRecentlyCreatedUsers(organizationId: string, days: number = 7): Promise<UserProfile[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    
    const allUsers = await this.getActiveUsersByOrganization(organizationId)
    
    return allUsers.filter(user => {
      const createdAt = new Date(user.createdAt)
      return createdAt >= cutoffDate
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  async updateUserPassword(user: any, newPassword: string) {
    await updatePassword(user, newPassword)
  },

  async updateUserDisplayName(user: any, displayName: string) {
    await updateProfile(user, { displayName })
  }
}

// ✅ FIXED: organizationService now initializes conditions atomically
export const organizationService = {
  /**
   * ✅ FIXED: Create organization AND initialize default conditions atomically
   */
  async createOrganization(
    organization: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>
  ): Promise<Organization> {
    logger.log('🏢 Creating organization:', organization.name)
    
    try {
      // Step 1: Create organization
      const organizationData = {
        ...organization,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberCount: 1
      }
      
      const docRef = await addDoc(collection(db, ORGANIZATIONS_COLLECTION), organizationData)
      const orgId = docRef.id
      
      logger.log(`✅ Organization created with ID: ${orgId}`)
      
      // Step 2: ✅ CRITICAL FIX - Initialize default conditions IMMEDIATELY
      logger.log('🎨 Initializing default conditions for new organization...')
      try {
        await conditionService.initializeDefaultConditions(orgId)
        logger.log('✅ Default conditions initialized')
      } catch (error) {
        logger.error('❌ Failed to initialize conditions:', error)
        // Rollback: Delete the organization if condition creation fails
        await deleteDoc(docRef)
        throw new Error('Failed to initialize organization conditions')
      }
      
      return { 
        id: orgId, 
        ...organizationData 
      }
    } catch (error) {
      logger.error('❌ Failed to create organization:', error)
      throw new Error('Failed to create organization')
    }
  },

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const docRef = doc(db, ORGANIZATIONS_COLLECTION, organizationId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Organization
    }
    return null
  },

  async getOrganizationByName(name: string): Promise<Organization | null> {
    const q = query(
      collection(db, ORGANIZATIONS_COLLECTION),
      where('name', '==', name)
    )
    const querySnapshot = await getDocs(q)
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0]
      return { id: doc.id, ...doc.data() } as Organization
    }
    return null
  },

  async updateOrganization(organizationId: string, updates: Partial<Omit<Organization, 'id' | 'createdAt'>>) {
    await updateDoc(doc(db, ORGANIZATIONS_COLLECTION, organizationId), {
      ...updates,
      updatedAt: new Date().toISOString()
    })
  },

  async incrementMemberCount(organizationId: string) {
    const org = await this.getOrganization(organizationId)
    if (org) {
      await this.updateOrganization(organizationId, {
        memberCount: (org.memberCount || 0) + 1
      })
    }
  },

  async decrementMemberCount(organizationId: string) {
    const org = await this.getOrganization(organizationId)
    if (org && org.memberCount && org.memberCount > 0) {
      await this.updateOrganization(organizationId, {
        memberCount: org.memberCount - 1
      })
    }
  }
}

// ✅ NEW: Export settingsService for supplier management
export { settingsService } from '@/lib/services/settingsService'