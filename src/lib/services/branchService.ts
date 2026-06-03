// src/lib/services/branchService.ts
// NEW FILE - Branch management service

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs, 
  getDoc,
  onSnapshot,
  Timestamp,
  writeBatch,
  runTransaction
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Branch, BranchMigration } from '@/types/branch'
import { logger } from '@/lib/logger'

const BRANCHES_COLLECTION = 'branches'
const MIGRATIONS_COLLECTION = 'branchMigrations'

export const branchService = {
  // Create the main branch (used during migration)
  async createMainBranch(organizationId: string, userId: string, userName: string): Promise<string> {
    const mainBranch: Omit<Branch, 'id'> = {
      slug: 'main',
      name: 'Main Branch',
      isMain: true,
      organizationId,
      createdAt: new Date(),
      createdBy: userId,
      createdByName: userName,
      isActive: true,
      vehicleCount: 0
    }

    const docRef = await addDoc(collection(db, BRANCHES_COLLECTION), {
      ...mainBranch,
      createdAt: Timestamp.fromDate(mainBranch.createdAt)
    })

    return docRef.id
  },

  // Create a new branch
  async createBranch(branchData: {
    name: string
    slug: string
    organizationId: string
    createdBy: string
    createdByName?: string
    // 🛠️ Optional service bay count. When omitted the field is left unset
    // and consumers fall back to DEFAULT_SERVICE_BAY_COUNT.
    serviceBayCount?: number
  }): Promise<string> {
    // Check if slug already exists for this organization
    const existingQuery = query(
      collection(db, BRANCHES_COLLECTION),
      where('organizationId', '==', branchData.organizationId),
      where('slug', '==', branchData.slug)
    )
    const existing = await getDocs(existingQuery)
    
    if (!existing.empty) {
      throw new Error('A branch with this slug already exists')
    }

    const newBranch: Omit<Branch, 'id'> = {
      ...branchData,
      isMain: false,
      createdAt: new Date(),
      isActive: true,
      vehicleCount: 0,
      // Only persist the bay count when explicitly provided so the field
      // stays "unset" for branches that weren't given a value at creation.
      ...(typeof branchData.serviceBayCount === 'number' && {
        serviceBayCount: branchData.serviceBayCount,
      }),
    }

    const docRef = await addDoc(collection(db, BRANCHES_COLLECTION), {
      ...newBranch,
      createdAt: Timestamp.fromDate(newBranch.createdAt)
    })

    return docRef.id
  },

  // Get all branches for an organization
  async getBranches(organizationId: string): Promise<Branch[]> {
    const q = query(
      collection(db, BRANCHES_COLLECTION),
      where('organizationId', '==', organizationId),
      where('isActive', '==', true)
    )
    
    const snapshot = await getDocs(q)
    const branches: Branch[] = []
    
    snapshot.forEach(doc => {
      const data = doc.data()
      branches.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date()
      } as Branch)
    })

    // Sort so main branch is always first
    return branches.sort((a, b) => {
      if (a.isMain) return -1
      if (b.isMain) return 1
      return a.name.localeCompare(b.name)
    })
  },

  // Subscribe to branches (for real-time updates)
  subscribeToBranches(
    organizationId: string, 
    callback: (branches: Branch[]) => void
  ): () => void {
    const q = query(
      collection(db, BRANCHES_COLLECTION),
      where('organizationId', '==', organizationId),
      where('isActive', '==', true)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const branches: Branch[] = []
      snapshot.forEach(doc => {
        const data = doc.data()
        branches.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as Branch)
      })

      // Sort so main branch is always first
      const sorted = branches.sort((a, b) => {
        if (a.isMain) return -1
        if (b.isMain) return 1
        return a.name.localeCompare(b.name)
      })

      callback(sorted)
    })

    return unsubscribe
  },

  // Get branch by slug
  async getBranchBySlug(organizationId: string, slug: string): Promise<Branch | null> {
    const q = query(
      collection(db, BRANCHES_COLLECTION),
      where('organizationId', '==', organizationId),
      where('slug', '==', slug),
      where('isActive', '==', true)
    )
    
    const snapshot = await getDocs(q)
    if (snapshot.empty) return null
    
    const doc = snapshot.docs[0]
    const data = doc.data()
    
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date()
    } as Branch
  },

  // Update branch
  async updateBranch(branchId: string, updates: Partial<Branch>): Promise<void> {
    const docRef = doc(db, BRANCHES_COLLECTION, branchId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now()
    })
  },

  // Soft delete branch (only if no vehicles)
  async deleteBranch(branchId: string): Promise<void> {
    // Resolve the branch's org first (get-by-id) so the vehicle-guard
    // query can be org-scoped — tightened tenant rules reject a
    // checkedInVehicles query that isn't constrained to the org.
    const branchSnap = await getDoc(doc(db, BRANCHES_COLLECTION, branchId))
    const branchOrgId = branchSnap.data()?.organizationId

    // Check if branch has vehicles
    const vehiclesQuery = query(
      collection(db, 'checkedInVehicles'),
      where('organizationId', '==', branchOrgId),
      where('branchId', '==', branchId)
    )
    const vehiclesSnapshot = await getDocs(vehiclesQuery)
    
    if (!vehiclesSnapshot.empty) {
      throw new Error('Cannot delete branch with vehicles. Please transfer or check out all vehicles first.')
    }

    const docRef = doc(db, BRANCHES_COLLECTION, branchId)
    await updateDoc(docRef, {
      isActive: false,
      updatedAt: Timestamp.now()
    })
  },

  // Migration functions
  async checkMigrationStatus(organizationId: string): Promise<boolean> {
    const docRef = doc(db, MIGRATIONS_COLLECTION, organizationId)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) return false
    
    const data = docSnap.data() as BranchMigration
    return data.migrationCompleted === true
  },

  async runMigration(organizationId: string, userId: string, userName: string): Promise<void> {
    // Use a transaction to ensure atomicity
    await runTransaction(db, async (transaction) => {
      // Check if migration already done
      const migrationRef = doc(db, MIGRATIONS_COLLECTION, organizationId)
      const migrationDoc = await transaction.get(migrationRef)
      
      if (migrationDoc.exists() && migrationDoc.data()?.migrationCompleted) {
        logger.log('Migration already completed for organization:', organizationId)
        return
      }

      // Create main branch
      const mainBranchRef = doc(collection(db, BRANCHES_COLLECTION))
      transaction.set(mainBranchRef, {
        slug: 'main',
        name: 'Main Branch',
        isMain: true,
        organizationId,
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
        isActive: true,
        vehicleCount: 0
      })

      // Get all vehicles for this organization
      const vehiclesQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId)
      )
      const vehiclesSnapshot = await getDocs(vehiclesQuery)
      
      let vehicleCount = 0
      
      // Update all vehicles with branchId = 'main'
      vehiclesSnapshot.forEach(vehicleDoc => {
        const vehicleRef = doc(db, 'checkedInVehicles', vehicleDoc.id)
        transaction.update(vehicleRef, {
          branchId: 'main',
          updatedAt: Timestamp.now()
        })
        vehicleCount++
      })

      // Mark migration as complete
      transaction.set(migrationRef, {
        id: organizationId,
        organizationId,
        migrationCompleted: true,
        migrationDate: Timestamp.now(),
        migratedVehicleCount: vehicleCount
      })

      logger.log(`Migration completed: ${vehicleCount} vehicles updated with branchId='main'`)
    })
  }
}