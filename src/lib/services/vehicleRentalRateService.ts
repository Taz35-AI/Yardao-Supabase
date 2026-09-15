// src/lib/services/vehicleRentalRateService.ts
// Admin-only supplier rental rates (table vehicle_rental_rates, migration 0071).
// RLS hides the table from non-admins entirely, so reads return [] for them —
// callers should gate the UI on profile.role === 'admin' and treat an empty
// result as "nothing to show", never as an error.

import { supabase } from '@/lib/supabaseClient'
import type { RentalRate, RentalRatePeriod } from '@/lib/utils/rentalRate'

export interface VehicleRentalRateRow extends RentalRate {
  vehicleId: string
  updatedAt: string | null
}

function rowToRate(r: Record<string, any>): VehicleRentalRateRow {
  return {
    vehicleId: r.vehicle_id,
    amount: Number(r.amount),
    period: r.period as RentalRatePeriod,
    updatedAt: r.updated_at ?? null,
  }
}

export const vehicleRentalRateService = {
  /** Every rate for the org, keyed by vehicle id. */
  async getRates(organizationId: string): Promise<Map<string, VehicleRentalRateRow>> {
    const { data, error } = await supabase
      .from('vehicle_rental_rates')
      .select('vehicle_id, amount, period, updated_at')
      .eq('organization_id', organizationId)
    if (error) throw error
    return new Map((data ?? []).map((r) => [r.vehicle_id as string, rowToRate(r)]))
  },

  async getRate(organizationId: string, vehicleId: string): Promise<VehicleRentalRateRow | null> {
    const { data, error } = await supabase
      .from('vehicle_rental_rates')
      .select('vehicle_id, amount, period, updated_at')
      .eq('organization_id', organizationId)
      .eq('vehicle_id', vehicleId)
      .maybeSingle()
    if (error) throw error
    return data ? rowToRate(data) : null
  },

  async upsertRate(
    organizationId: string,
    vehicleId: string,
    rate: RentalRate,
    updatedBy?: string | null,
  ): Promise<void> {
    const { error } = await supabase.from('vehicle_rental_rates').upsert(
      {
        vehicle_id: vehicleId,
        organization_id: organizationId,
        amount: rate.amount,
        period: rate.period,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: 'vehicle_id' },
    )
    if (error) throw error
  },

  async deleteRate(organizationId: string, vehicleId: string): Promise<void> {
    const { error } = await supabase
      .from('vehicle_rental_rates')
      .delete()
      .eq('organization_id', organizationId)
      .eq('vehicle_id', vehicleId)
    if (error) throw error
  },
}
