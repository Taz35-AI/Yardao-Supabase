// src/lib/firestore.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: the file name and every EXPORT below are kept identical to
// the original Firestore version so the frontend imports nothing new. Only the
// INTERNALS change — Firestore SDK calls become Supabase queries, with
// snake↔camel mapping (see dbMap) so the returned objects match the TS
// interfaces byte-for-byte. RLS scopes every query to the caller's org.
//
// Actively-consumed exports across the app: vehicleService, userProfileService,
// organizationService, and the Vehicle type. conditionService/contractService/
// yardVehicleService are retained for contract-compat (the app's live versions
// live in @/lib/conditionService and @/lib/contractService).

import { supabase } from './supabaseClient'
import { UserProfile, Organization, VehicleStatus, isUserDeleted, Contract, InsuranceStatus, DefleetReason } from '@/types'
import { toCamel, toCamelList, toSnake } from './dbMap'
import { logger } from '@/lib/logger'

// Vehicle interface — unchanged from the Firestore version.
export interface Vehicle {
  insurancePolicyId: null
  insurancePolicyName: null
  insurancePolicyExpiry: null
  id?: string
  registration: string
  make: string
  model: string
  colour: string
  size: string
  motExpiry: string
  taxExpiry: string
  comments: string
  condition: string
  contract?: string | null
  contractColor?: string | null
  contractId?: string | null
  insuranceStatus?: InsuranceStatus | null
  dateAcquired?: string | null
  createdAt: string
  organizationId: string
  createdBy: string
  currentStatus?: 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted'
  currentLocation?: string
  lastKnownLocation?: string
  updatedAt?: string
  isDefleeted?: boolean
  defleetDate?: string | null
  defleetProcessedDate?: string
  defleetReason?: DefleetReason
  defleetReasonDetails?: string
  defleetedBy?: string
  defleetedByName?: string
}

export interface ConditionCategory {
  id: string
  name: string
  order: number
  organizationId: string
  color: string
  severity: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
}

export interface YardVehicle {
  id?: string
  vehicleId?: string | null
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
  contract?: string | null
  contractColor?: string | null
  contractId?: string | null
  insuranceStatus?: InsuranceStatus | null
  motExpiry?: string
  taxExpiry?: string
}

const VEHICLES = 'vehicles'
const CONDITIONS = 'condition_categories'
const CONTRACTS = 'contracts'
const YARD_VEHICLES = 'yard_vehicles'
const PROFILES = 'profiles'
const ORGANIZATIONS = 'organizations'

// Postgres `date` columns reject empty strings ('' → 22007). The UI sometimes
// sends '' to mean "cleared", so coerce those to null on write.
const DATE_COLUMNS = ['mot_expiry', 'tax_expiry', 'insurance_policy_expiry', 'date_acquired', 'defleet_date']
function nullEmptyDates(row: Record<string, any>): Record<string, any> {
  for (const c of DATE_COLUMNS) {
    if (row[c] === '') row[c] = null
  }
  return row
}

// ── vehicleService ───────────────────────────────────────────────────────────
export const vehicleService = {
  async addVehicle(vehicle: Omit<Vehicle, 'id' | 'createdAt'>) {
    const row = nullEmptyDates({
      ...toSnake(vehicle),
      current_status: 'in_fleet',
      date_acquired: vehicle.dateAcquired ?? null,
    })
    const { data, error } = await supabase.from(VEHICLES).insert(row).select().single()
    if (error) throw error
    return toCamel<Vehicle>(data) as Vehicle
  },

  async getVehicles(organizationId: string): Promise<Vehicle[]> {
    const { data, error } = await supabase
      .from(VEHICLES)
      .select('*')
      .eq('organization_id', organizationId)
      .neq('is_defleeted', true)                 // SQL WHERE replaces client-side filter
      .order('created_at', { ascending: false })
    if (error) throw error
    // null-safe currentStatus guard (matches original semantics exactly)
    return toCamelList<Vehicle>(data).filter((v) => v.currentStatus !== 'defleeted')
  },

  async getVehicleById(vehicleId: string): Promise<Vehicle | null> {
    try {
      const { data, error } = await supabase.from(VEHICLES).select('*').eq('id', vehicleId).maybeSingle()
      if (error) throw error
      return toCamel<Vehicle>(data)
    } catch (error) {
      logger.error('Error fetching vehicle by ID:', error)
      return null
    }
  },

  async getVehicleByRegistration(organizationId: string, registration: string): Promise<Vehicle | null> {
    try {
      const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
      const { data, error } = await supabase
        .from(VEHICLES)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return toCamel<Vehicle>(data)
    } catch (error) {
      logger.error('Error fetching vehicle by registration:', error)
      return null
    }
  },

  async searchVehiclesForCheckIn(organizationId: string, searchTerm: string = ''): Promise<Vehicle[]> {
    try {
      const { data, error } = await supabase
        .from(VEHICLES)
        .select('*')
        .eq('organization_id', organizationId)
        .order('registration', { ascending: true })
      if (error) throw error
      let vehicles = toCamelList<Vehicle>(data)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        vehicles = vehicles.filter((vehicle) => {
          const registration = vehicle.registration?.toLowerCase() || ''
          const make = vehicle.make?.toLowerCase() || ''
          const model = vehicle.model?.toLowerCase() || ''
          return (
            registration.includes(term) ||
            make.includes(term) ||
            model.includes(term) ||
            `${make} ${model}`.includes(term)
          )
        })
      }
      return vehicles
    } catch (error) {
      logger.error('Error searching vehicles:', error)
      return []
    }
  },

  async updateVehicle(vehicleId: string, updates: Partial<Omit<Vehicle, 'id' | 'createdAt'>>) {
    const cleaned: any = { ...updates }
    if (cleaned.damagePins) {
      cleaned.damagePins = cleaned.damagePins.map((pin: any) =>
        Object.fromEntries(Object.entries(pin).filter(([, v]) => v !== undefined))
      )
    }
    const { error } = await supabase.from(VEHICLES).update(nullEmptyDates(toSnake(cleaned))).eq('id', vehicleId)
    if (error) throw error
  },

  async updateVehicleStatus(
    vehicleId: string,
    status: 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted',
    location?: string
  ) {
    const updates: Record<string, any> = { current_status: status }
    if (location) {
      updates.current_location = location
      updates.last_known_location = location
    }
    const { error } = await supabase.from(VEHICLES).update(updates).eq('id', vehicleId)
    if (error) throw error
  },

  async deleteVehicle(vehicleId: string) {
    const { error } = await supabase.from(VEHICLES).delete().eq('id', vehicleId)
    if (error) throw error
  },

  async clearAllVehicles(organizationId: string) {
    const { error } = await supabase.from(VEHICLES).delete().eq('organization_id', organizationId)
    if (error) throw error
  },

  async bulkAddVehicles(vehicles: Omit<Vehicle, 'id' | 'createdAt'>[]) {
    const addPromises = vehicles.map((vehicle) => this.addVehicle(vehicle))
    return Promise.all(addPromises)
  },
}

// ── conditionService (order ↔ sort_order) ────────────────────────────────────
const rowToCondition = (row: any): ConditionCategory => {
  const c = toCamel<any>(row)!
  return { ...c, order: c.sortOrder ?? 0 } as ConditionCategory
}
const conditionToRow = (c: Partial<ConditionCategory>) => {
  const { order, ...rest } = c as any
  const row = toSnake(rest)
  if (order !== undefined) row.sort_order = order
  return row
}

export const conditionService = {
  async getConditions(organizationId: string): Promise<ConditionCategory[]> {
    const { data, error } = await supabase
      .from(CONDITIONS)
      .select('*')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data ?? []).map(rowToCondition)
  },

  async addCondition(condition: Omit<ConditionCategory, 'id'>) {
    const { data, error } = await supabase.from(CONDITIONS).insert(conditionToRow(condition)).select().single()
    if (error) throw error
    return rowToCondition(data)
  },

  async updateCondition(conditionId: string, updates: Partial<Omit<ConditionCategory, 'id'>> | string) {
    const updateData = typeof updates === 'string' ? { name: updates } : conditionToRow(updates)
    const { error } = await supabase.from(CONDITIONS).update(updateData).eq('id', conditionId)
    if (error) throw error
  },

  async deleteCondition(conditionId: string) {
    const { error } = await supabase.from(CONDITIONS).delete().eq('id', conditionId)
    if (error) throw error
  },

  async initializeDefaultConditions(organizationId: string): Promise<ConditionCategory[]> {
    const defaults = [
      { name: 'Excellent', order: 0, color: '#16a34a', severity: 'excellent' as const, organizationId },
      { name: 'Good', order: 1, color: '#22c55e', severity: 'good' as const, organizationId },
      { name: 'Fair', order: 2, color: '#eab308', severity: 'fair' as const, organizationId },
      { name: 'Poor', order: 3, color: '#f97316', severity: 'poor' as const, organizationId },
      { name: 'Critical', order: 4, color: '#ef4444', severity: 'critical' as const, organizationId },
    ]
    const { data, error } = await supabase.from(CONDITIONS).insert(defaults.map(conditionToRow)).select()
    if (error) throw error
    return (data ?? []).map(rowToCondition)
  },
}

// ── contractService ──────────────────────────────────────────────────────────
export const contractService = {
  async getContracts(organizationId: string): Promise<Contract[]> {
    const { data, error } = await supabase
      .from(CONTRACTS)
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })
    if (error) throw error
    return toCamelList<Contract>(data)
  },

  async addContract(contract: Omit<Contract, 'id'>) {
    const { data, error } = await supabase.from(CONTRACTS).insert(toSnake(contract)).select().single()
    if (error) throw error
    return toCamel<Contract>(data) as Contract
  },

  async updateContract(contractId: string, updates: Partial<Omit<Contract, 'id'>>) {
    const { error } = await supabase.from(CONTRACTS).update(toSnake(updates)).eq('id', contractId)
    if (error) throw error
  },

  async deleteContract(contractId: string) {
    const { error } = await supabase.from(CONTRACTS).delete().eq('id', contractId)
    if (error) throw error
  },
}

// ── yardVehicleService ───────────────────────────────────────────────────────
export const yardVehicleService = {
  async addYardVehicle(vehicle: Omit<YardVehicle, 'id' | 'createdAt'>) {
    if (vehicle.vehicleId) {
      try {
        await vehicleService.updateVehicleStatus(vehicle.vehicleId, 'checked_in', vehicle.organizationId)
      } catch (error) {
        logger.error('Failed to update fleet vehicle status:', error)
      }
    }
    const { data, error } = await supabase.from(YARD_VEHICLES).insert(toSnake(vehicle)).select().single()
    if (error) throw error
    return toCamel<YardVehicle>(data) as YardVehicle
  },

  async getYardVehicles(organizationId: string): Promise<YardVehicle[]> {
    const { data, error } = await supabase
      .from(YARD_VEHICLES)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return toCamelList<YardVehicle>(data)
  },

  async updateYardVehicle(vehicleId: string, updates: Partial<YardVehicle>) {
    const { error } = await supabase.from(YARD_VEHICLES).update(toSnake(updates)).eq('id', vehicleId)
    if (error) throw error
  },

  async deleteYardVehicle(vehicleId: string) {
    const { data } = await supabase.from(YARD_VEHICLES).select('vehicle_id').eq('id', vehicleId).maybeSingle()
    if (data?.vehicle_id) {
      try {
        await vehicleService.updateVehicleStatus(data.vehicle_id, 'in_fleet')
      } catch (error) {
        logger.error('Failed to update fleet vehicle status on checkout:', error)
      }
    }
    const { error } = await supabase.from(YARD_VEHICLES).delete().eq('id', vehicleId)
    if (error) throw error
  },

  async clearAllYardVehicles(organizationId: string) {
    const { error } = await supabase.from(YARD_VEHICLES).delete().eq('organization_id', organizationId)
    if (error) throw error
  },
}

// ── userProfileService ───────────────────────────────────────────────────────
// profiles.id IS the auth user uuid; UserProfile exposes both `id` and `uid`.
const rowToProfile = (row: any): UserProfile | null => {
  if (!row) return null
  const p = toCamel<any>(row)!
  return {
    ...p,
    uid: p.id,
    isActive: p.isActive !== undefined && p.isActive !== null ? p.isActive : true,
    isDeleted: p.isDeleted !== undefined && p.isDeleted !== null ? p.isDeleted : false,
  } as UserProfile
}

export const userProfileService = {
  async createProfile(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>) {
    const { uid, ...rest } = profile as any
    const row: Record<string, any> = { ...toSnake(rest), id: uid }
    if (row.is_active === undefined) row.is_active = true
    if (row.is_deleted === undefined) row.is_deleted = false
    const { data, error } = await supabase.from(PROFILES).upsert(row).select().single()
    if (error) throw error
    return rowToProfile(data) as UserProfile
  },

  async getProfile(uid: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from(PROFILES).select('*').eq('id', uid).maybeSingle()
    if (error) throw error
    return rowToProfile(data)
  },

  async updateProfile(uid: string, updates: Partial<Omit<UserProfile, 'id' | 'uid' | 'createdAt'>>) {
    const { error } = await supabase.from(PROFILES).update(toSnake(updates)).eq('id', uid)
    if (error) throw error
  },

  async updateLastLogin(uid: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(PROFILES)
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', uid)
      if (error) throw error
    } catch (error) {
      logger.error('Error updating last login:', error)
    }
  },

  async getUsersByOrganization(organizationId: string): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from(PROFILES)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToProfile) as UserProfile[]
  },

  async getActiveUsersByOrganization(organizationId: string): Promise<UserProfile[]> {
    const allUsers = await this.getUsersByOrganization(organizationId)
    return allUsers.filter((user) => !isUserDeleted(user))
  },

  async softDeleteUser(uid: string, deletedBy: string): Promise<void> {
    await this.updateProfile(uid, {
      isActive: false,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy,
    })
  },

  async restoreUser(uid: string): Promise<void> {
    await this.updateProfile(uid, {
      isActive: true,
      isDeleted: false,
      deletedAt: undefined,
      deletedBy: undefined,
    })
  },

  async toggleUserStatus(uid: string): Promise<boolean> {
    const profile = await this.getProfile(uid)
    if (!profile) throw new Error('User profile not found')
    const newStatus = !profile.isActive
    await this.updateProfile(uid, { isActive: newStatus })
    return newStatus
  },

  async isUserActiveAndExists(uid: string): Promise<boolean> {
    const profile = await this.getProfile(uid)
    if (!profile) return false
    return !isUserDeleted(profile) && profile.isActive !== false
  },

  async getUserCountByOrganization(organizationId: string): Promise<number> {
    const users = await this.getActiveUsersByOrganization(organizationId)
    return users.length
  },

  async searchUsers(organizationId: string, searchTerm: string): Promise<UserProfile[]> {
    const allUsers = await this.getActiveUsersByOrganization(organizationId)
    if (!searchTerm.trim()) return allUsers
    const term = searchTerm.toLowerCase().trim()
    return allUsers.filter(
      (user) => user.displayName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
    )
  },

  async getRecentlyCreatedUsers(organizationId: string, days: number = 7): Promise<UserProfile[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const allUsers = await this.getActiveUsersByOrganization(organizationId)
    return allUsers
      .filter((user) => new Date(user.createdAt) >= cutoffDate)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  async updateUserPassword(_user: any, newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  async updateUserDisplayName(user: any, displayName: string) {
    const { error } = await supabase.auth.updateUser({ data: { displayName } })
    if (error) throw error
    const uid = user?.id ?? user?.uid
    if (uid) await supabase.from(PROFILES).update({ display_name: displayName }).eq('id', uid)
  },
}

// ── organizationService ──────────────────────────────────────────────────────
// createOrganization delegates to a SECURITY DEFINER RPC (migration 0003): it
// creates the org, joins the caller as admin, and seeds default conditions
// atomically — necessary because a just-signed-up user has no org_id JWT claim
// yet, so a direct client INSERT would be blocked by RLS.
export const organizationService = {
  async createOrganization(
    organization: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>
  ): Promise<Organization> {
    logger.log('🏢 Creating organization:', organization.name)
    const { data: orgId, error } = await supabase.rpc('create_organization', {
      p_name: organization.name,
      p_description: organization.description ?? null,
    })
    if (error) {
      logger.error('❌ Failed to create organization:', error)
      throw new Error('Failed to create organization')
    }
    // Re-issue the JWT so it carries the new org_id claim (set by the hook from
    // the now-updated profile); without this, the RLS-scoped read below is empty.
    await supabase.auth.refreshSession()
    const created = await this.getOrganization(orgId as string)
    if (!created) throw new Error('Failed to create organization')
    return created
  },

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const { data, error } = await supabase.from(ORGANIZATIONS).select('*').eq('id', organizationId).maybeSingle()
    if (error) throw error
    return toCamel<Organization>(data)
  },

  async getOrganizationByName(name: string): Promise<Organization | null> {
    const { data, error } = await supabase.from(ORGANIZATIONS).select('*').eq('name', name).limit(1).maybeSingle()
    if (error) throw error
    return toCamel<Organization>(data)
  },

  async updateOrganization(organizationId: string, updates: Partial<Omit<Organization, 'id' | 'createdAt'>>) {
    const { error } = await supabase.from(ORGANIZATIONS).update(toSnake(updates)).eq('id', organizationId)
    if (error) throw error
  },

  async incrementMemberCount(organizationId: string) {
    const org = await this.getOrganization(organizationId)
    if (org) await this.updateOrganization(organizationId, { memberCount: (org.memberCount || 0) + 1 })
  },

  async decrementMemberCount(organizationId: string) {
    const org = await this.getOrganization(organizationId)
    if (org && org.memberCount && org.memberCount > 0) {
      await this.updateOrganization(organizationId, { memberCount: org.memberCount - 1 })
    }
  },
}

// ✅ Re-export settingsService (ported to Supabase in Phase 4)
export { settingsService } from '@/lib/services/settingsService'
