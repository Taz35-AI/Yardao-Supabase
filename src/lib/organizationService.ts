// src/lib/organizationService.ts
// ✅ FIXED: Initialize conditions DURING organization creation to prevent duplicates

import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  doc, 
  updateDoc,
  deleteDoc 
} from 'firebase/firestore'
import { db } from './firebase'
import { conditionService } from './conditionService'
import { logger } from '@/lib/logger'

export interface Organization {
  id?: string
  name: string
  description?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  memberCount: number
}

const ORGANIZATIONS_COLLECTION = 'organizations'

export const organizationService = {
  /**
   * ✅ FIXED: Create organization AND initialize default conditions atomically
   * This ensures conditions are created ONCE during org creation
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
      // This happens ONCE during org creation, preventing race conditions
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
    const q = query(
      collection(db, ORGANIZATIONS_COLLECTION),
      where('__name__', '==', organizationId)
    )
    const querySnapshot = await getDocs(q)
    
    if (querySnapshot.empty) {
      return null
    }
    
    const doc = querySnapshot.docs[0]
    return {
      id: doc.id,
      ...doc.data()
    } as Organization
  },

  async getAllOrganizations(): Promise<Organization[]> {
    const querySnapshot = await getDocs(collection(db, ORGANIZATIONS_COLLECTION))
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Organization))
  },

  async updateOrganization(
    organizationId: string,
    updates: Partial<Omit<Organization, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await updateDoc(doc(db, ORGANIZATIONS_COLLECTION, organizationId), updateData)
  },

  async deleteOrganization(organizationId: string): Promise<void> {
    await deleteDoc(doc(db, ORGANIZATIONS_COLLECTION, organizationId))
  },

  async incrementMemberCount(organizationId: string): Promise<void> {
    const org = await this.getOrganization(organizationId)
    if (org) {
      await this.updateOrganization(organizationId, {
        memberCount: org.memberCount + 1
      })
    }
  },

  async decrementMemberCount(organizationId: string): Promise<void> {
    const org = await this.getOrganization(organizationId)
    if (org && org.memberCount > 0) {
      await this.updateOrganization(organizationId, {
        memberCount: org.memberCount - 1
      })
    }
  }
}