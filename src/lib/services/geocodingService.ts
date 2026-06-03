// src/lib/services/geocodingService.ts
// Geocoding via Firebase Cloud Function — API key is server-side only

import { getFunctions, httpsCallable } from 'firebase/functions'
import { logger } from '@/lib/logger'

export interface GeocodingResult {
  latitude: number
  longitude: number
  formattedAddress: string
  postcode?: string | null
}

// Response shape returned by the Cloud Function
interface GeocodingFunctionResponse {
  latitude: number
  longitude: number
  formattedAddress: string
  postcode: string | null
}

class GeocodingService {
  /**
   * Convert address to GPS coordinates via Cloud Function.
   * The Google Maps API key never touches the browser.
   */
  async geocodeAddress(address: string): Promise<GeocodingResult> {
    if (!address || address.trim().length === 0) {
      throw new Error('Address is required')
    }

    try {
      const functions = getFunctions()
      const callable = httpsCallable<{ address: string }, GeocodingFunctionResponse>(
        functions,
        'geocodeAddress'
      )

      const result = await callable({ address: address.trim() })

      return {
        latitude: result.data.latitude,
        longitude: result.data.longitude,
        formattedAddress: result.data.formattedAddress,
        postcode: result.data.postcode ?? undefined,
      }
    } catch (error: any) {
      // Surface the friendly message from the Cloud Function if available
      const message = error?.message || 'Geocoding failed. Please try again.'
      throw new Error(message)
    }
  }
}

export const geocodingService = new GeocodingService()