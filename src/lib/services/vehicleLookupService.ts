// src/lib/services/vehicleLookupService.ts
// DVLA vehicle lookup via the `vehicleLookup` Edge Function — the DVLA API key is server-side only.

import { supabase } from '@/lib/supabaseClient'
import { FunctionsHttpError } from '@supabase/supabase-js'

export interface VehicleLookupResult {
  registration: string
  make: string
  model: string
  colour: string
  fuelType: string
  taxStatus: string
  taxExpiry: string
  motStatus: string
  motExpiry: string
  yearOfManufacture: number | null
  engineCapacity: number | null
  co2Emissions: number | null
  revenueWeight: number | null
  euroStatus: string
  wheelplan: string
  monthOfFirstRegistration: string
  typeApproval: string
  markedForExport: boolean | null
  mileage: number | null
  mileageUnit: string
  firstUsedDate: string
  hasOutstandingRecall: string
  advisories: Array<{ text: string; type: string; dangerous: boolean }>
}

/**
 * Lookup failure carrying the HTTP status from the Edge Function, so the UI
 * can tell "no DVLA record" (404 — e.g. a brand-new vehicle) apart from a
 * genuine failure.
 */
export class VehicleLookupError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'VehicleLookupError'
    this.status = status
  }
  get notFound(): boolean {
    return this.status === 404
  }
}

class VehicleLookupService {
  /**
   * Look up a UK vehicle by registration via the DVLA VES API.
   * The DVLA API key never touches the browser — the call is proxied
   * through the `vehicleLookup` Edge Function.
   */
  async lookup(registration: string): Promise<VehicleLookupResult> {
    if (!registration || registration.trim().length === 0) {
      throw new VehicleLookupError('Registration is required')
    }

    const { data, error } = await supabase.functions.invoke<VehicleLookupResult>('vehicleLookup', {
      body: { registrationNumber: registration.trim() },
    })

    if (error) {
      // On a non-2xx the client throws away the function's JSON body and says
      // "Edge Function returned a non-2xx status code" — unwrap the real
      // friendly message (e.g. `No DVLA record found for "AB12CDE".`) instead.
      let message = 'Vehicle lookup failed. Please try again.'
      let status: number | null = null
      if (error instanceof FunctionsHttpError) {
        status = error.context?.status ?? null
        try {
          const body = await error.context.json()
          if (body?.error) message = body.error
        } catch {
          // Body wasn't JSON — keep the generic message.
        }
      } else if (error?.message) {
        message = error.message
      }
      throw new VehicleLookupError(message, status)
    }

    return data as VehicleLookupResult
  }
}

export const vehicleLookupService = new VehicleLookupService()
