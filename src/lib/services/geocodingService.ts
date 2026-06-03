// src/lib/services/geocodingService.ts
// Geocoding via Firebase Cloud Function — API key is server-side only

import { supabase } from '@/lib/supabaseClient'
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
      // TODO(phase5): 'geocodeAddress' Edge Function (free geocoder) not deployed yet.
      const { data, error } = await supabase.functions.invoke<GeocodingFunctionResponse>('geocodeAddress', {
        body: { address: address.trim() },
      })
      if (error) throw error
      return {
        latitude: data!.latitude,
        longitude: data!.longitude,
        formattedAddress: data!.formattedAddress,
        postcode: data!.postcode ?? undefined,
      }
    } catch (error: any) {
      // Surface the friendly message from the Cloud Function if available
      const message = error?.message || 'Geocoding failed. Please try again.'
      throw new Error(message)
    }
  }
}

export const geocodingService = new GeocodingService()