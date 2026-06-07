// src/lib/services/geocodingService.ts
// FREE, keyless geocoding tuned for the UK, called DIRECTLY from the browser.
//
// Both providers are CORS-friendly and need no API key, so there's nothing to
// deploy and nothing to configure:
//   1. UK postcode in the address → postcodes.io (precise, UK-specific).
//   2. Otherwise → Photon (komoot, OSM-based) full-address search.
// Each request is bounded by a timeout so the UI never gets stuck on
// "Retrieving location…". On total failure we throw, and the caller saves the
// branch with the typed address (just without map coordinates).

import { logger } from '@/lib/logger'

export interface GeocodingResult {
  latitude: number
  longitude: number
  formattedAddress: string
  postcode?: string | null
}

// UK postcode: outward code (e.g. SW1A) + inward code (e.g. 1AA), optional space.
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

async function fetchJson(url: string, timeoutMs = 7000): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function viaPostcodesIo(postcode: string): Promise<GeocodingResult | null> {
  const data = await fetchJson(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
  const r = data?.result
  if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null
  return {
    latitude: r.latitude,
    longitude: r.longitude,
    formattedAddress: [r.postcode, r.admin_district, r.region, r.country].filter(Boolean).join(', '),
    postcode: r.postcode,
  }
}

async function viaPhoton(query: string): Promise<GeocodingResult | null> {
  const data = await fetchJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`)
  const f = data?.features?.[0]
  const coords = f?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lon, lat] = coords
  const p = f.properties ?? {}
  const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street
  return {
    latitude: lat,
    longitude: lon,
    formattedAddress: [p.name, street, p.city, p.postcode, p.state, p.country].filter(Boolean).join(', ') || query,
    postcode: p.postcode ?? null,
  }
}

class GeocodingService {
  /** Convert a UK address to GPS coordinates. Display value stays the user's
   *  typed address; only the coordinates (and canonical postcode) come from the
   *  geocoder. Throws if nothing could be resolved. */
  async geocodeAddress(address: string): Promise<GeocodingResult> {
    const input = (address || '').trim()
    if (!input) throw new Error('Address is required')

    try {
      // 1) Postcode path — most reliable for UK branches.
      const m = input.match(UK_POSTCODE)
      if (m) {
        const postcode = `${m[1]} ${m[2]}`.toUpperCase()
        const r = await viaPostcodesIo(postcode)
        if (r) return { ...r, formattedAddress: input }
      }

      // 2) Full-address fallback (bias to the UK).
      const biased = /\b(uk|united kingdom|england|scotland|wales)\b/i.test(input) ? input : `${input}, UK`
      const photon = await viaPhoton(biased)
      if (photon) return { ...photon, formattedAddress: input }

      throw new Error('Location not found for this address')
    } catch (error: any) {
      logger.warn('Geocoding failed:', error?.message)
      throw new Error(error?.message || 'Could not look up this address')
    }
  }
}

export const geocodingService = new GeocodingService()
