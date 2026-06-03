// supabase/functions/geocodeAddress/index.ts
// Address geocoding Edge Function (Deno).
//
// Replaces the original Firebase Google Maps geocoder. Per the migration brief,
// maps/geocoding must be FREE, so this uses OpenStreetMap Nominatim — no API key,
// no secret required. Nominatim asks for a descriptive User-Agent and <=1 req/sec,
// which is fine for the occasional branch-address geocode this app performs.
//
// Contract (matches the client, which calls
//   supabase.functions.invoke('geocodeAddress', { body: { address } })
// and reads data.latitude / data.longitude / data.formattedAddress / data.postcode):
//   request : { address: string }
//   response: { latitude: number, longitude: number, formattedAddress: string, postcode?: string }

import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const { address } = await req.json()

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return json({ error: 'A valid address string is required.' }, 400)
    }

    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=gb&q=${encodeURIComponent(address.trim())}`

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Yardao/1.0 (yard management app)' },
    })

    if (!resp.ok) {
      throw new Error(`Geocoding failed: ${resp.status}`)
    }

    const results = await resp.json()
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('Address not found')
    }

    const r = results[0]

    return json({
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      formattedAddress: r.display_name,
      postcode: r.address?.postcode,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Geocoding failed' }, 400)
  }
})
