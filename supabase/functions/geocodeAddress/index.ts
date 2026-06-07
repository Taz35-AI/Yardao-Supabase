// supabase/functions/geocodeAddress/index.ts
// Address geocoding Edge Function (Deno).
//
// FREE, keyless geocoding tuned for the UK (this app is UK-centric — DVLA/MOT/
// UK plates). Strategy:
//   1. If the address contains a UK postcode, resolve it via postcodes.io —
//      free, no key, no rate limit, very reliable, UK-specific. Ideal for a
//      branch map pin.
//   2. Otherwise (or if that fails) fall back to Photon (komoot) — free, no key,
//      OSM-based full-address search.
// This replaces the public OpenStreetMap Nominatim server, which aggressively
// rate-limits / blocks automated requests (the old "non-2xx" failures).
//
// Contract (unchanged — matches the client geocodingService):
//   request : { address: string }
//   response: { latitude: number, longitude: number, formattedAddress: string, postcode?: string }

import { handlePreflight, json } from '../_shared/cors.ts'

// UK postcode: outward code (e.g. SW1A) + inward code (e.g. 1AA), optional space.
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

interface GeoResult {
  latitude: number
  longitude: number
  formattedAddress: string
  postcode?: string | null
}

// 1) Precise UK postcode lookup via postcodes.io.
async function viaPostcodesIo(postcode: string): Promise<GeoResult | null> {
  try {
    const resp = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
    )
    if (!resp.ok) return null
    const data = await resp.json()
    const r = data?.result
    if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') {
      return null
    }
    return {
      latitude: r.latitude,
      longitude: r.longitude,
      // Caller overrides formattedAddress with the user's typed address.
      formattedAddress: [r.postcode, r.admin_district, r.region, r.country]
        .filter(Boolean)
        .join(', '),
      postcode: r.postcode,
    }
  } catch {
    return null
  }
}

// 2) Full-address fallback via Photon (komoot) — free, keyless, OSM-based.
async function viaPhoton(query: string): Promise<GeoResult | null> {
  try {
    const resp = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`,
      { headers: { 'User-Agent': 'Yardao/1.0 (yard management app)' } },
    )
    if (!resp.ok) return null
    const data = await resp.json()
    const f = data?.features?.[0]
    const coords = f?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    const [lon, lat] = coords
    const p = f.properties ?? {}
    const street =
      p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street
    return {
      latitude: lat,
      longitude: lon,
      formattedAddress:
        [p.name, street, p.city, p.postcode, p.state, p.country]
          .filter(Boolean)
          .join(', ') || query,
      postcode: p.postcode ?? null,
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const { address } = await req.json()
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return json({ error: 'A valid address string is required.' }, 400)
    }
    const input = address.trim()

    // 1) Postcode path — most reliable for UK branches.
    const m = input.match(UK_POSTCODE)
    if (m) {
      const postcode = `${m[1]} ${m[2]}`.toUpperCase()
      const result = await viaPostcodesIo(postcode)
      if (result) {
        // Respect the user's typed address as the display value; use the
        // resolved coordinates + canonical postcode.
        return json({ ...result, formattedAddress: input })
      }
    }

    // 2) Full-address fallback (bias to the UK).
    const biased = /\b(uk|united kingdom|england|scotland|wales)\b/i.test(input)
      ? input
      : `${input}, UK`
    const photon = await viaPhoton(biased)
    if (photon) return json({ ...photon, formattedAddress: input })

    return json({ error: 'Address not found' }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Geocoding failed' }, 400)
  }
})
