// src/lib/services/vehicleLookupService.ts
// DVLA vehicle lookup via Firebase Cloud Function — the DVLA API key is server-side only.

import { getFunctions, httpsCallable } from 'firebase/functions'

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

class VehicleLookupService {
  /**
   * Look up a UK vehicle by registration via the DVLA VES API.
   * The DVLA API key never touches the browser — the call is proxied
   * through the `vehicleLookup` Cloud Function.
   */
  async lookup(registration: string): Promise<VehicleLookupResult> {
    if (!registration || registration.trim().length === 0) {
      throw new Error('Registration is required')
    }

    try {
      const functions = getFunctions(undefined, 'europe-west1')
      const callable = httpsCallable<{ registrationNumber: string }, VehicleLookupResult>(
        functions,
        'vehicleLookup'
      )

      const result = await callable({ registrationNumber: registration.trim() })
      return result.data
    } catch (error: any) {
      // Surface the friendly message from the Cloud Function if available.
      const message = error?.message || 'Vehicle lookup failed. Please try again.'
      throw new Error(message)
    }
  }
}

export const vehicleLookupService = new VehicleLookupService()
