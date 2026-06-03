// src/lib/externalGarageService.ts — SUPABASE re-implementation.
// Public interface (class + singleton export) and every method signature are
// kept identical; only the internals swap Firestore → Supabase. Created/updated
// timestamps are revived into Date objects, matching the Firestore version's
// .toDate() behaviour so consumers keep working unchanged.

import { supabase } from '@/lib/supabaseClient'
import { toCamel } from '@/lib/dbMap'
import type { ExternalGarage, ExternalGarageFormData } from '@/types'
import { logger } from '@/lib/logger'

const COLLECTION_NAME = 'external_garages'

// Row → ExternalGarage: snake→camel + revive timestamps into Date objects.
const toDate = (v: any) => (v ? new Date(v) : v)
function rowToGarage(row: any): ExternalGarage {
  const g = toCamel<any>(row)!
  g.createdAt = toDate(g.createdAt)
  g.updatedAt = toDate(g.updatedAt)
  return g as ExternalGarage
}

class ExternalGarageService {
  // Get all active external garages for an organization
  async getExternalGarages(organizationId: string): Promise<ExternalGarage[]> {
    try {
      const { data, error } = await supabase
        .from(COLLECTION_NAME)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map(rowToGarage)
    } catch (error) {
      logger.error('Error fetching external garages:', error)
      throw new Error('Failed to fetch external garages')
    }
  }

  // Get all external garages (including inactive) for management
  async getAllExternalGarages(organizationId: string): Promise<ExternalGarage[]> {
    try {
      const { data, error } = await supabase
        .from(COLLECTION_NAME)
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map(rowToGarage)
    } catch (error) {
      logger.error('Error fetching all external garages:', error)
      throw new Error('Failed to fetch external garages')
    }
  }

  // Get a single external garage by ID
  async getExternalGarage(id: string): Promise<ExternalGarage | null> {
    try {
      const { data, error } = await supabase
        .from(COLLECTION_NAME)
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return rowToGarage(data)
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

      const docData = {
        ...garageData,
        name: garageData.name.trim(),
        address: garageData.address.trim(),
        organization_id: organizationId,
        created_by: createdBy,
        is_active: true,
      }

      logger.log('Document data to be saved:', docData)

      const { data, error } = await supabase
        .from(COLLECTION_NAME)
        .insert(docData)
        .select()
        .single()
      if (error) throw error

      logger.log('Document created with ID:', data.id)

      return rowToGarage(data)
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
          address: garageData.address || existingGarage.address,
        })
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (garageData.name !== undefined) {
        updateData.name = garageData.name.trim()
      }
      if (garageData.address !== undefined) {
        updateData.address = garageData.address.trim()
      }

      const { error } = await supabase.from(COLLECTION_NAME).update(updateData).eq('id', id)
      if (error) throw error
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

      const { error } = await supabase
        .from(COLLECTION_NAME)
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

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

      const { error } = await supabase
        .from(COLLECTION_NAME)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
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

      const { error } = await supabase.from(COLLECTION_NAME).delete().eq('id', id)
      if (error) throw error
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
    const results = { successful: 0, failed: 0, errors: [] as string[] }
    const pending: Array<{ id: string; updateData: Record<string, any> }> = []

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

          const updateData: any = { updated_at: new Date().toISOString() }

          switch (op.operation) {
            case 'activate':
              updateData.is_active = true
              break
            case 'deactivate':
              updateData.is_active = false
              break
            case 'delete':
              updateData.is_active = false
              break
          }

          pending.push({ id: op.id, updateData })
          results.successful++
        } catch (error) {
          results.failed++
          results.errors.push(`Garage ${op.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      if (results.successful > 0) {
        await Promise.all(
          pending.map(({ id, updateData }) =>
            supabase
              .from(COLLECTION_NAME)
              .update(updateData)
              .eq('id', id)
              .then(({ error }) => {
                if (error) throw error
              })
          )
        )
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
      const { data, error } = await supabase
        .from(COLLECTION_NAME)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('name', name.trim())
        .eq('is_active', true)
      if (error) throw error

      const rows = data ?? []
      if (excludeId) {
        return rows.some((r: any) => r.id !== excludeId)
      }

      return rows.length > 0
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
      let query = supabase.from(COLLECTION_NAME).select('*').limit(1)
      if (organizationId) {
        query = query.eq('organization_id', organizationId)
      }
      const { data, error } = await query
      if (error) throw error
      logger.log('[externalGarageService] testCollectionAccess OK; docs:', (data ?? []).length)
      return true
    } catch (err) {
      logger.error('[externalGarageService] testCollectionAccess FAILED', err)
      throw err
    }
  }
}

// Export singleton instance
export const externalGarageService = new ExternalGarageService()
