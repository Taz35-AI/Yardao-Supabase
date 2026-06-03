// src/lib/zao/fleetQueries.ts
// All Firestore READ operations for Zao.
// Fetches data, shapes it, returns it. Zero writes happen here.
// The hook handles all writes — keeping reads and writes clearly separated.

import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Vehicle, CheckedInVehicle } from '@/types'
import type { GarageOption } from '@/types/zao.types'

export interface FleetData {
  fleet: {
    total: number
    vehicles: Vehicle[]
  }
  yard: {
    total: number
    vehicles: CheckedInVehicle[]
    byStatus: Record<string, any[]>
    bySize: Record<string, any[]>
    atExternalGarage: any[]
    inTransit: any[]
    outOnHire: any[]
    uninsured: any[]
  }
  externalGarages: GarageOption[]
  todayBookings: any[]
  allBookings: any[]
}

/**
 * Fetch all fleet data needed for a Zao query in a single Promise.all.
 * Cheap — 4 reads total regardless of query type.
 */
export async function fetchFleetData(organizationId: string): Promise<FleetData> {
  // Use local date — NOT toISOString() which returns UTC and causes off-by-one in BST
  const localDate  = (offsetDays = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const todayStr   = localDate(0)
  const futureStr  = localDate(14)

  const [fleetSnap, yardSnap, garageSnap, bookingsSnap] = await Promise.all([
    getDocs(query(collection(db, 'vehicles'),          where('organizationId', '==', organizationId))),
    getDocs(query(collection(db, 'checkedInVehicles'), where('organizationId', '==', organizationId))),
    getDocs(query(collection(db, 'externalGarages'),   where('organizationId', '==', organizationId), where('isActive', '==', true))),
    // Single-field query only (organizationId) — avoids composite index requirement.
    // Date filtering done in JS below. Fetches ~30 most recent bookings, plenty for context.
    getDocs(query(collection(db, 'serviceBookings'),   where('organizationId', '==', organizationId))),
  ])

  const fleetVehicles   = fleetSnap.docs.map(d   => ({ id: d.id, ...d.data() })) as Vehicle[]
  const yardVehicles    = yardSnap.docs.map(d    => ({ id: d.id, ...d.data() })) as CheckedInVehicle[]
  const externalGarages = garageSnap.docs.map(d  => ({ id: d.id, ...d.data() })) as GarageOption[]
  // Filter to upcoming 14 days in JS — no composite index needed
  const allBookings     = bookingsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((b: any) => b.date >= todayStr && b.date <= futureStr)
  const todayBookings   = allBookings.filter((b: any) => b.date === todayStr)

  const byStatus: Record<string, any[]> = {}
  const bySize:   Record<string, any[]> = {}
  for (const v of yardVehicles) {
    const s  = (v.status as string) || 'Unknown'
    const sz = v.size || 'Unknown'
    byStatus[s]  = [...(byStatus[s]  || []), v]
    bySize[sz]   = [...(bySize[sz]   || []), v]
  }

  return {
    fleet: { total: fleetVehicles.length, vehicles: fleetVehicles },
    yard:  {
      total:            yardVehicles.length,
      vehicles:         yardVehicles,
      byStatus,
      bySize,
      atExternalGarage: yardVehicles.filter((v: any) => v.transferStatus === 'at_external_garage'),
      inTransit:        yardVehicles.filter((v: any) => v.transferStatus === 'in_transit'),
      outOnHire:        yardVehicles.filter((v: any) => v.hireStatus === 'Out on Hire'),
      uninsured:        yardVehicles.filter((v: any) => v.insuranceStatus === 'Not Insured'),
    },
    externalGarages,
    todayBookings,
    allBookings,
  }
}

/**
 * Find vehicles in the yard by partial registration (case-insensitive, ignores spaces).
 */
export function findVehicles(vehicles: CheckedInVehicle[], partial: string): CheckedInVehicle[] {
  const s = partial.toUpperCase().replace(/\s+/g, '')
  return vehicles.filter(v => (v.registration || '').toUpperCase().replace(/\s+/g, '').includes(s))
}

/**
 * Build a minimal data summary to inject into the Groq system prompt.
 * Keeps token count low by only including vehicles relevant to the current query.
 */
export function buildSmartSummary(fleetData: FleetData, userMessage: string): string {
  const { yard } = fleetData
  const regMatch = userMessage.match(/\b([A-Z]{2}\d{2}[A-Z]{3}|[A-Z]{2,3}\d{2,3}[A-Z]{0,3})\b/i)
  const regHint  = regMatch ? regMatch[1].toUpperCase() : ''
  let out = ''

  if (regHint) {
    const matched = yard.vehicles
      .filter((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(regHint.replace(/\s/g, '')))
      .slice(0, 3)
    if (matched.length > 0) {
      const lines = matched.map((v: any) => {
        const loc =
          v.transferStatus === 'at_external_garage' ? 'AT_GARAGE:' + (v.externalGarageName || 'unknown') :
          v.transferStatus === 'in_transit'          ? 'IN_TRANSIT:' + (v.targetBranchName || '?') :
          'in_yard'
        return `${v.registration}|${v.make || ''} ${v.model || ''}|${v.size || ''}|status:${v.status || '?'}|${loc}`
      }).join('\n')
      out += `VEHICLE:\n${lines}\n\n`
    }
  }

  const statusSummary = Object.entries(yard.byStatus)
    .map(([s, vs]: any) => `${s}:${vs.length}`)
    .join(', ')
  out += `YARD_TOTAL:${yard.total}\nSTATUS_BREAKDOWN:${statusSummary}\n`

  if (yard.atExternalGarage.length > 0) {
    const lines = yard.atExternalGarage
      .map((v: any) => `  • ${v.registration} — ${v.make || ''} ${v.model || ''} (${v.size || '?'}) @ ${v.externalGarageName || '?'}`)
      .join('\n')
    out += `\nVEHICLES_AT_EXTERNAL_GARAGES_RIGHT_NOW:\n${lines}\n`
  }

  // Include upcoming bookings (today + 14 days) grouped by date
  // This lets Groq answer: "what's on friday?", "which vehicle today?", "any bookings next week?"
  const bookings = fleetData.allBookings || fleetData.todayBookings || []
  if (bookings.length > 0) {
    // Group by date
    const byDate: Record<string, any[]> = {}
    for (const b of bookings) {
      const d = b.date || 'unknown'
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(b)
    }
    const lines = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bs]) => {
        const dateFmt = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        const bookingLines = (bs as any[]).map((b: any) => {
          const reg      = b.registration || '?'
          const make     = b.make || ''
          const model    = b.model || ''
          const work     = Array.isArray(b.workRequired) ? b.workRequired.join(', ') : (b.workRequired || '?')
          const time     = b.timeSlot || b.externalProvider?.customTime || 'TBC'
          const provider = b.isExternalProvider ? (b.externalProvider?.name || 'External') : 'Internal'
          return `    - ${reg} (${make} ${model}): ${work} @ ${provider} ${time}`
        }).join('\n')
        return `  ${dateFmt}:\n${bookingLines}`
      }).join('\n')
    out += `\nSERVICE_BOOKINGS_UPCOMING:\n${lines}\n`
  }

  return out.trim()
}

/**
 * Look up the real display name of a branch by its slug from Firestore.
 * Used so Zao says "Fairview Barking" not "fairview-barking".
 */
export async function resolveBranchName(organizationId: string, slug: string): Promise<string> {
  try {
    if (slug === 'main' || !slug) {
      const mainSnap = await getDocs(query(
        collection(db, 'branches'),
        where('organizationId', '==', organizationId),
        where('isMain', '==', true),
      ))
      if (!mainSnap.empty) return mainSnap.docs[0].data().name || 'Main Branch'
      return 'Main Branch'
    }

    const snap = await getDocs(query(
      collection(db, 'branches'),
      where('organizationId', '==', organizationId),
      where('slug', '==', slug),
      where('isActive', '==', true),
    ))
    if (!snap.empty) return snap.docs[0].data().name || slug
  } catch { /* non-fatal */ }

  // Fallback: prettify slug ("fairview-barking" → "Fairview Barking")
  return slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}