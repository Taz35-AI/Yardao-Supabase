// src/lib/externalGarageService.ts
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  limit, // ⬅️ necesar pentru testCollectionAccess
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ExternalGarage, ExternalGarageFormData } from '@/types'
import { logger } from '@/lib/logger'

const COLLECTION_NAME = 'externalGarages'

class ExternalGarageService {
  private getCollectionRef() {
    return collection(db, COLLECTION_NAME)
  }

  private getDocRef(id: string) {
    return doc(db, COLLECTION_NAME, id)
  }

  // Get all active external garages for an organization
  async getExternalGarages(organizationId: string): Promise<ExternalGarage[]> {
    try {
      const q = query(
        this.getCollectionRef(),
        where('organizationId', '==', organizationId),
        where('isActive', '==', true),
        orderBy('name', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as ExternalGarage[]
    } catch (error) {
      logger.error('Error fetching external garages:', error)
      throw new Error('Failed to fetch external garages')
    }
  }

  // Get all external garages (including inactive) for management
  async getAllExternalGarages(organizationId: string): Promise<ExternalGarage[]> {
    try {
      const q = query(
        this.getCollectionRef(),
        where('organizationId', '==', organizationId),
        orderBy('name', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as ExternalGarage[]
    } catch (error) {
      logger.error('Error fetching all external garages:', error)
      throw new Error('Failed to fetch external garages')
    }
  }

  // Get a single external garage by ID
  async getExternalGarage(id: string): Promise<ExternalGarage | null> {
    try {
      const docSnap = await getDoc(this.getDocRef(id))
      
      if (!docSnap.exists()) {
        return null
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate?.() || docSnap.data().createdAt,
        updatedAt: docSnap.data().updatedAt?.toDate?.() || docSnap.data().updatedAt
      } as ExternalGarage
    } catch (error) {
      logger.error('Error fetching external garage:', error)
      throw new Error('Failed to fetch external garage')
    }
  }

  // Create a new external garage
  async createExternalGarage(
    garageData: ExternalGarageFormData,
    organizationId: string,
    createdBy: string
  ): Promise<ExternalGarage> {
    try {
      logger.log('Creating external garage:', { garageData, organizationId, createdBy })
      
      // Validate input
      this.validateGarageData(garageData)

      if (!organizationId || !createdBy) {
        throw new Error('Organization ID and created by user ID are required')
      }

      const now = Timestamp.now()
      const docData = {
        ...garageData,
        name: garageData.name.trim(),
        address: garageData.address.trim(),
        organizationId,
        createdBy,
        createdAt: now,
        updatedAt: now,
        isActive: true
      }

      logger.log('Document data to be saved:', docData)

      const docRef = await addDoc(this.getCollectionRef(), docData)
      
      logger.log('Document created with ID:', docRef.id)
      
      return {
        id: docRef.id,
        ...docData,
        createdAt: now.toDate(),
        updatedAt: now.toDate()
      }
    } catch (error) {
      logger.error('Error creating external garage:', error)
      if (error instanceof Error && error.message.includes('validation')) {
        throw error
      }
      throw new Error('Failed to create external garage')
    }
  }

  // Update an existing external garage
  async updateExternalGarage(
    id: string,
    garageData: Partial<ExternalGarageFormData>,
    organizationId: string
  ): Promise<void> {
    try {
      // Verify the garage belongs to the organization
      const existingGarage = await this.getExternalGarage(id)
      if (!existingGarage || existingGarage.organizationId !== organizationId) {
        throw new Error('External garage not found or access denied')
      }

      // Validate input if provided
      if (garageData.name !== undefined || garageData.address !== undefined) {
        this.validateGarageData({
          name: garageData.name || existingGarage.name,
          address: garageData.address || existingGarage.address
        })
      }

      const updateData: any = {
        updatedAt: Timestamp.now()
      }

      if (garageData.name !== undefined) {
        updateData.name = garageData.name.trim()
      }
      if (garageData.address !== undefined) {
        updateData.address = garageData.address.trim()
      }

      await updateDoc(this.getDocRef(id), updateData)
    } catch (error) {
      logger.error('Error updating external garage:', error)
      if (error instanceof Error && error.message.includes('validation')) {
        throw error
      }
      throw new Error('Failed to update external garage')
    }
  }

  // Toggle active status of an external garage
  async toggleExternalGarageStatus(
    id: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      // Verify the garage belongs to the organization
      const existingGarage = await this.getExternalGarage(id)
      if (!existingGarage || existingGarage.organizationId !== organizationId) {
        throw new Error('External garage not found or access denied')
      }

      const newStatus = !existingGarage.isActive
      
      await updateDoc(this.getDocRef(id), {
        isActive: newStatus,
        updatedAt: Timestamp.now()
      })

      return newStatus
    } catch (error) {
      logger.error('Error toggling external garage status:', error)
      throw new Error('Failed to update external garage status')
    }
  }

  // Soft delete an external garage (set isActive to false)
  async deleteExternalGarage(id: string, organizationId: string): Promise<void> {
    try {
      // Verify the garage belongs to the organization
      const existingGarage = await this.getExternalGarage(id)
      if (!existingGarage || existingGarage.organizationId !== organizationId) {
        throw new Error('External garage not found or access denied')
      }

      await updateDoc(this.getDocRef(id), {
        isActive: false,
        updatedAt: Timestamp.now()
      })
    } catch (error) {
      logger.error('Error deleting external garage:', error)
      throw new Error('Failed to delete external garage')
    }
  }

  // Hard delete an external garage (permanent removal)
  async permanentlyDeleteExternalGarage(
    id: string,
    organizationId: string
  ): Promise<void> {
    try {
      // Verify the garage belongs to the organization
      const existingGarage = await this.getExternalGarage(id)
      if (!existingGarage || existingGarage.organizationId !== organizationId) {
        throw new Error('External garage not found or access denied')
      }

      await deleteDoc(this.getDocRef(id))
    } catch (error) {
      logger.error('Error permanently deleting external garage:', error)
      throw new Error('Failed to permanently delete external garage')
    }
  }

  // Bulk operations for admin
  async bulkUpdateExternalGarages(
    operations: Array<{
      id: string
      operation: 'activate' | 'deactivate' | 'delete'
    }>,
    organizationId: string
  ): Promise<{ successful: number; failed: number; errors: string[] }> {
    const batch = writeBatch(db)
    const results = { successful: 0, failed: 0, errors: [] as string[] }

    try {
      for (const op of operations) {
        try {
          // Verify garage belongs to organization
          const garage = await this.getExternalGarage(op.id)
          if (!garage || garage.organizationId !== organizationId) {
            results.failed++
            results.errors.push(`Garage ${op.id}: Access denied or not found`)
            continue
          }

          const updateData: any = { updatedAt: Timestamp.now() }

          switch (op.operation) {
            case 'activate':
              updateData.isActive = true
              break
            case 'deactivate':
              updateData.isActive = false
              break
            case 'delete':
              updateData.isActive = false
              break
          }

          batch.update(this.getDocRef(op.id), updateData)
          results.successful++
        } catch (error) {
          results.failed++
          results.errors.push(`Garage ${op.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      if (results.successful > 0) {
        await batch.commit()
      }

      return results
    } catch (error) {
      logger.error('Error in bulk update:', error)
      throw new Error('Failed to complete bulk operations')
    }
  }

  // Validation helper
  private validateGarageData(data: ExternalGarageFormData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Garage name is required')
    }

    if (!data.address || data.address.trim().length === 0) {
      throw new Error('Garage address is required')
    }

    if (data.name.trim().length > 100) {
      throw new Error('Garage name must be 100 characters or less')
    }

    if (data.address.trim().length > 200) {
      throw new Error('Garage address must be 200 characters or less')
    }

    // Basic format validation
    if (data.name.trim().length < 2) {
      throw new Error('Garage name must be at least 2 characters long')
    }

    if (data.address.trim().length < 5) {
      throw new Error('Garage address must be at least 5 characters long')
    }
  }

  // Check if a garage name already exists for the organization
  async isGarageNameExists(
    name: string,
    organizationId: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      const q = query(
        this.getCollectionRef(),
        where('organizationId', '==', organizationId),
        where('name', '==', name.trim()),
        where('isActive', '==', true)
      )

      const snapshot = await getDocs(q)
      
      if (excludeId) {
        return snapshot.docs.some(doc => doc.id !== excludeId)
      }
      
      return !snapshot.empty
    } catch (error) {
      logger.error('Error checking garage name existence:', error)
      return false
    }
  }

  /**
   * Dev-only helper: verifică accesul la colecția de garaje.
   * În producție returnează true imediat pentru a nu afecta build-ul.
   */
  async testCollectionAccess(organizationId?: string): Promise<boolean> {
    if (process.env.NODE_ENV !== 'development') return true
    try {
      const col = this.getCollectionRef()
      const q = organizationId
        ? query(col, where('organizationId', '==', organizationId), limit(1))
        : query(col, limit(1))
      const snap = await getDocs(q)
      logger.log('[externalGarageService] testCollectionAccess OK; docs:', snap.size)
      return true
    } catch (err) {
      logger.error('[externalGarageService] testCollectionAccess FAILED', err)
      throw err
    }
  }
}

// Export singleton instance
export const externalGarageService = new ExternalGarageService()
