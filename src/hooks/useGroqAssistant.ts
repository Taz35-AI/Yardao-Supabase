// src/hooks/useGroqAssistant.ts
// The Zao AI assistant hook.
// Responsibility: orchestrate intent → data → action → response.
// All business logic lives in src/lib/zao/* — this file is glue only.
'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { userProfileService } from '@/lib/firestore'

// Sub-modules — each has one job
import {
  detectCheckoutIntent, detectReturnIntent, detectMOTDoneIntent,
  detectBookingIntent,  detectMileageIntent, detectCheckInIntent,
  detectHireOutIntent,  detectHireReturnIntent,
  detectNoteIntent,     detectReadNotesIntent,
} from '@/lib/zao/intentDetectors'
import { parseBookingDate, matchWorkTypes, calculateNewMOTExpiry } from '@/lib/zao/bookingHelpers'
import { fetchFleetData, findVehicles, buildSmartSummary, resolveBranchName } from '@/lib/zao/fleetQueries'
import { parseMessageWithGroq } from '@/lib/groqNoteParser'
import { getApiKey, callGroq, buildSystemPrompt, fetchWeather, type GroqMessage } from '@/lib/zao/groqClient'
import { askZao } from '@/lib/zao/agent'
import { logger } from '@/lib/logger'

// Types
import type { GroqResponse, UseGroqAssistantReturn, ConfirmBookingParams } from '@/types/zao.types'
export type { ConfirmBookingParams, GroqMessage }
export { INTERNAL_WORK_TYPES, TIME_SLOTS } from '@/lib/zao/bookingHelpers'

// serverTimestamp() / new Date() → ISO string for Postgres timestamptz columns.
const nowIso = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────────────────────
// PURE CODE QUERY RESOLVER
// Handles all location / status / count queries without touching Groq.
// Add new patterns here — never in the Groq fallback.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a registration hint from a free-text message.
 * Returns the most reg-like token, or '' if nothing found.
 */
function extractReg(msg: string): string {
  // Try full UK plate first (e.g. AB12CDE, LB22KGU)
  const full = msg.match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/i)
  if (full) return full[1].toUpperCase().replace(/\s/g, '')
  // Fallback: any alphanumeric token 3-8 chars that isn't a common word
  const SKIP = new Set(['THE','FOR','AT','IS','ARE','IN','OUT','ON','WHERE','WHAT','HOW','MANY','WHICH','AND','OR','TO','FROM','BEEN','HAS','ALL','GET','LIST','SHOW','TELL','ME','ITS','THIS','THAT'])
  const tokens = msg.toUpperCase().match(/\b([A-Z0-9]{3,8})\b/g) || []
  return tokens.find(t => !SKIP.has(t) && /[A-Z]/.test(t) && /[0-9]/.test(t)) ||
         tokens.find(t => !SKIP.has(t) && t.length >= 3) || ''
}

/** Format a vehicle's location as a readable string */
function vehicleLocation(v: any): string {
  if (v.transferStatus === 'at_external_garage') return `at **${v.externalGarageName || 'an external garage'}**`
  if (v.transferStatus === 'in_transit')          return `in transit to **${v.targetBranchName || 'another branch'}**`
  if (v.hireStatus === 'Out on Hire')             return `out on hire`
  return `in the yard — status: **${v.status || 'Pending checks'}**`
}

/** Attempt to resolve a query using only fleetData. Returns null if it can't handle it. */
function resolveQueryLocally(msg: string, fleetData: any): string | null {
  const m = msg.toLowerCase().trim()
  const yard      = fleetData.yard
  const allV      = yard.vehicles   as any[]
  const atGarage  = yard.atExternalGarage as any[]
  const inTransit = yard.inTransit  as any[]
  const onHire    = yard.outOnHire  as any[]
  const byStatus  = yard.byStatus   as Record<string, any[]>

  // ── WHERE IS [REG] ──────────────────────────────────────────────────────────
  // Catches: "where is AB12", "where's LB22KGU", "AB12 where is it", "location of AB12",
  //          "AB12 - where is it?", "find AB12", "which branch is AB12 at"
  const isWhereQuery =
    /where\s*(is|are|'?s|was|has)\b/i.test(msg) ||
    /\b(location|find|locate|which branch)\b/i.test(msg) ||
    /\bwhere\b.*\bit\b/i.test(msg) ||
    (/\b(is it|it is)\b/i.test(msg) && extractReg(msg) !== '')

  if (isWhereQuery) {
    const reg = extractReg(msg)
    if (!reg) return null // can't identify a vehicle, let Groq try

    const matches = findVehicles(allV, reg)
    if (matches.length === 0) return `Can't find **${reg}** in the system — double-check the reg.`
    if (matches.length > 1) {
      const list = matches.map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''} (${vehicleLocation(v)})`).join('\n')
      return `Found ${matches.length} vehicles matching **${reg}**:\n\n${list}`
    }
    const v = matches[0] as any
    const name = [v.make, v.model].filter(Boolean).join(' ')
    return `**${v.registration}**${name ? ` (${name})` : ''} is ${vehicleLocation(v)}.`
  }

  // ── WHAT'S THE STATUS OF [REG] ──────────────────────────────────────────────
  // Catches: "what's the status of AB12", "AB12 status", "status on LB22",
  //          "what status is AB12", "AB12 what's its status"
  const isStatusQuery =
    /\bstatus\b/i.test(msg) && extractReg(msg) !== ''

  if (isStatusQuery) {
    const reg = extractReg(msg)
    const matches = findVehicles(allV, reg)
    if (matches.length === 0) return `Can't find **${reg}** in the yard.`
    const v = matches[0] as any
    const name = [v.make, v.model].filter(Boolean).join(' ')
    const insLabel = v.insuranceStatus ? ` | Insurance: **${v.insuranceStatus}**` : ''
    const motLabel = v.motExpiry ? ` | MOT: **${new Date(v.motExpiry).toLocaleDateString('en-GB')}**` : ''
    return `**${v.registration}**${name ? ` (${name})` : ''}\nStatus: **${v.status || 'Pending checks'}** | Location: ${vehicleLocation(v)}${insLabel}${motLabel}`
  }

  // ── VEHICLES AT A SPECIFIC EXTERNAL GARAGE ──────────────────────────────────
  // Catches: "what's at ALK", "vehicles at Advance Vauxhall", "which regs at ALK garage",
  //          "show me what's at Joe's Tyres", "ALK - what's there", "what vehicles are at alk"
  const isGarageNameQuery =
    /what('?s| is) at\b/i.test(msg) ||
    /\b(vehicles? at|regs? at|what.?s at|whats at)\b/i.test(msg) ||
    (atGarage.length > 0 && atGarage.some((v: any) =>
      m.includes((v.externalGarageName || '').toLowerCase().split(' ')[0])
    )) ||
    (
      /\b(at|in|with)\s+[A-Z]/i.test(msg) &&
      /\b(garage|bodyshop|body shop|tyres?|workshop|motors?|vauxhall|nissan|ford|bmw|audi|mercedes)\b/i.test(msg)
    )

  if (isGarageNameQuery && atGarage.length > 0) {
    // Try to extract garage name keywords from message
    const stopWords = new Set(['what','is','are','at','in','the','vehicles','which','regs','show','me','there','thats'])
    const keywords = m.replace(/[^a-z0-9 ]/g,'').split(' ').filter(w => w.length > 2 && !stopWords.has(w))
    const matched = atGarage.filter((v: any) =>
      keywords.some(k => (v.externalGarageName || '').toLowerCase().includes(k))
    )
    const list = (matched.length > 0 ? matched : atGarage) as any[]
    if (list.length === 0) return `Nothing at that garage right now.`
    const grouped: Record<string, any[]> = {}
    for (const v of list) { const gn = v.externalGarageName || 'Unknown'; if (!grouped[gn]) grouped[gn] = []; grouped[gn].push(v) }
    const sections = Object.entries(grouped).map(([gn, vs]) =>
      `**${gn}** (${vs.length})\n${vs.map((v: any) => `  • ${v.registration}${v.make ? ` — ${v.make} ${v.model || ''}` : ''}`).join('\n')}`
    ).join('\n\n')
    return `Here's what's at external garages:\n\n${sections}`
  }

  // ── HOW MANY / LIST BY STATUS ───────────────────────────────────────────────
  // Catches: "how many vehicles ready", "list ready vehicles", "show me repairs needed",
  //          "how many are pending checks", "vehicles that need repairs", "non starters"
  const statusMap: Record<string, string> = {
    ready: 'Ready',
    'pending checks': 'Pending checks', pending: 'Pending checks',
    'repairs needed': 'Repairs needed', repairs: 'Repairs needed', repair: 'Repairs needed',
    damaged: 'Repairs needed', 'needs repair': 'Repairs needed',
    'non-starter': 'Non-Starter', 'non starter': 'Non-Starter', nonstarter: 'Non-Starter',
    wontstart: 'Non-Starter', 'wont start': 'Non-Starter', dead: 'Non-Starter',
  }

  for (const [keyword, canonical] of Object.entries(statusMap)) {
    if (m.includes(keyword)) {
      const group = byStatus[canonical] || []
      const isCount = /how many|count|number of/i.test(msg)
      if (isCount) return `**${group.length}** vehicle${group.length !== 1 ? 's' : ''} with status **${canonical}**.`
      if (group.length === 0) return `No vehicles with status **${canonical}** right now.`
      const list = group.map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`).join('\n')
      return `**${canonical}** (${group.length}):\n\n${list}`
    }
  }

  // ── YARD COUNT / SUMMARY ────────────────────────────────────────────────────
  // Catches: "how many vehicles in the yard", "total vehicles", "yard count",
  //          "how many do we have checked in", "whats in the yard"
  const isYardCount =
    /how many\b.*\b(vehicle|van|car|checked in|in the yard|in yard)\b/i.test(msg) ||
    /\b(total|yard count|how many do we|whats in the yard|what.s in the yard|vehicles in the yard)\b/i.test(msg)

  if (isYardCount) {
    const statusLines = Object.entries(byStatus)
      .filter(([, vs]) => vs.length > 0)
      .map(([s, vs]) => `  • ${s}: **${vs.length}**`)
      .join('\n')
    return `**${allV.length} vehicles** in the yard right now.\n\n${statusLines}${atGarage.length > 0 ? `\n\n+ **${atGarage.length}** at external garages` : ''}${onHire.length > 0 ? `\n+ **${onHire.length}** out on hire` : ''}`
  }

  // ── LIST VEHICLES AT EXTERNAL GARAGES ───────────────────────────────────────
  // Catches: "list vehicles at external", "what's checked out", "vehicles at garages",
  //          "who's at external garages", "show external vehicles", "checked out vehicles"
  const isExternalList =
    /\b(external|checked out|at garage|at garages|outside|sent out)\b/i.test(msg) &&
    /\b(list|show|which|what|vehicles?|regs?|who|how many)\b/i.test(msg)

  if (isExternalList) {
    if (atGarage.length === 0) return `Nothing checked out — all vehicles are in the yard! 🏠`
    const grouped: Record<string, any[]> = {}
    for (const v of atGarage) { const gn = v.externalGarageName || 'Unknown'; if (!grouped[gn]) grouped[gn] = []; grouped[gn].push(v) }
    const sections = Object.entries(grouped).map(([gn, vs]) =>
      `**${gn}**\n${vs.map((v: any) => `  • ${v.registration}${v.make ? ` — ${v.make} ${v.model || ''}` : ''}`).join('\n')}`
    ).join('\n\n')
    return `**${atGarage.length} vehicle${atGarage.length !== 1 ? 's' : ''}** at external garages:\n\n${sections}`
  }

  // ── LIST VEHICLES OUT ON HIRE ────────────────────────────────────────────────
  // Catches: "vehicles on hire", "what's out on hire", "hire list", "who's hired out"
  const isHireList =
    /\b(hire|hired|on hire|out on hire|hire list)\b/i.test(msg) &&
    /\b(list|show|which|what|vehicles?|regs?|who|how many)\b/i.test(msg)

  if (isHireList) {
    if (onHire.length === 0) return `No vehicles out on hire right now.`
    const list = onHire.map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`).join('\n')
    return `**${onHire.length} vehicle${onHire.length !== 1 ? 's' : ''}** out on hire:\n\n${list}`
  }

  // ── IN TRANSIT LIST ─────────────────────────────────────────────────────────
  // Catches: "in transit", "which vehicles are being transferred", "branch transfers"
  const isTransitList =
    /\b(in transit|transit|being transferred|transfer(ring)?|between branches)\b/i.test(msg)

  if (isTransitList) {
    if (inTransit.length === 0) return `No vehicles in transit right now.`
    const list = inTransit.map((v: any) => `• **${v.registration}** → **${v.targetBranchName || 'unknown branch'}**`).join('\n')
    return `**${inTransit.length} vehicle${inTransit.length !== 1 ? 's' : ''}** in transit:\n\n${list}`
  }

  // ── UNINSURED LIST ──────────────────────────────────────────────────────────
  // Catches: "uninsured vehicles", "which vehicles have no insurance", "not insured list"
  const isUninsuredList =
    /\b(uninsured|no insurance|not insured|insurance missing)\b/i.test(msg)

  if (isUninsuredList) {
    const uninsured = yard.uninsured as any[]
    if (uninsured.length === 0) return `All vehicles have insurance recorded. ✅`
    const list = uninsured.map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`).join('\n')
    return `**${uninsured.length} vehicle${uninsured.length !== 1 ? 's' : ''}** with no insurance recorded:\n\n${list}`
  }

  // ── TODAY'S BOOKINGS ────────────────────────────────────────────────────────
  // Catches: "bookings today", "what's booked in today", "today's services"
  const isTodayBookings =
    /\b(today.?s booking|booked today|services? today|bookings? today|today.?s service|what.?s (booked|coming) in today)\b/i.test(msg)

  if (isTodayBookings) {
    const tb = fleetData.todayBookings as any[]
    if (tb.length === 0) return `Nothing booked in today.`
    const list = tb.map((b: any) => {
      const time = b.timeSlot || b.externalProvider?.customTime || ''
      const work = Array.isArray(b.workRequired) ? b.workRequired.join(', ') : b.workRequired || 'Service'
      const garage = b.isExternalProvider ? ` @ ${b.externalProvider?.garageName || 'External'}` : ''
      return `• **${b.registration}** — ${work}${time ? ` (${time})` : ''}${garage}`
    }).join('\n')
    return `**${tb.length} booking${tb.length !== 1 ? 's' : ''}** today:\n\n${list}`
  }

  // ── VEHICLES WITH DAMAGE / DAMAGE NOTES ─────────────────────────────────────
  // Catches: "which vehicles have damage", "damaged vehicles", "damage notes"
  const isDamageList =
    /\b(damage|damaged|damage notes|🔴)\b/i.test(msg) &&
    /\b(list|show|which|what|vehicles?|who|how many)\b/i.test(msg)

  if (isDamageList) {
    const damaged = allV.filter((v: any) => (v.comments || '').includes('🔴 DAMAGE:'))
    if (damaged.length === 0) return `No vehicles with damage notes in the yard.`
    const list = damaged.map((v: any) => {
      const note = (v.comments || '').split('\n').find((l: string) => l.includes('🔴 DAMAGE:')) || ''
      return `• **${v.registration}** — ${note.replace('🔴 DAMAGE:', '').trim()}`
    }).join('\n')
    return `**${damaged.length} vehicle${damaged.length !== 1 ? 's' : ''}** with damage notes:\n\n${list}`
  }

  // ── BOOKINGS ON A DATE ────────────────────────────────────────────────────
  // Catches: "any bookings next friday", "bookings for thursday", "what's booked in next week",
  //          "any jobs in tomorrow", "upcoming bookings friday 13th", "bookings friday"
  const isBookingQuery =
    /\b(any bookings?|bookings? for|bookings? (on|next|this|today|tomorrow)|what.?s (booked|on|coming in)|any jobs? in|scheduled (for|next|this)|upcoming bookings?|bookings? (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(msg)

  if (isBookingQuery) {
    const allBookings = (fleetData.allBookings as any[]).filter((b: any) => b.status !== 'completed' && b.status !== 'cancelled')
    if (allBookings.length === 0) return `Nothing scheduled in the next 14 days.`

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const todayStr = fmt(now)

    let fromDate = todayStr, toDate = todayStr, label = 'today'

    if (/tomorrow/i.test(msg)) {
      const d = new Date(now); d.setDate(d.getDate() + 1)
      fromDate = toDate = fmt(d); label = 'tomorrow'
    } else if (/next week/i.test(msg)) {
      const s = new Date(now); s.setDate(s.getDate() + 7)
      const e = new Date(now); e.setDate(e.getDate() + 14)
      fromDate = fmt(s); toDate = fmt(e); label = 'next week'
    } else if (/this week/i.test(msg)) {
      const e = new Date(now); e.setDate(e.getDate() + 7)
      toDate = fmt(e); label = 'this week'
    } else {
      // Named day detection — "next friday", "friday", "friday 13th"
      const days: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      }
      const dayMatch = m.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
      if (dayMatch) {
        const target = days[dayMatch[1]]
        const d = new Date(now)
        let diff = target - d.getDay()
        if (diff <= 0) diff += 7
        d.setDate(d.getDate() + diff)
        fromDate = toDate = fmt(d)
        label = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1)
      } else {
        // No specific date — show all upcoming 14 days
        const e = new Date(now); e.setDate(e.getDate() + 14)
        fromDate = todayStr; toDate = fmt(e); label = 'the next 14 days'
      }
    }

    const filtered = allBookings.filter((b: any) => b.date >= fromDate && b.date <= toDate)
    if (filtered.length === 0) return `No bookings scheduled for ${label}.`

    const list = filtered.map((b: any) => {
      const work    = Array.isArray(b.workRequired) ? b.workRequired.join(', ') : b.workRequired || 'Service'
      const time    = b.timeSlot || b.externalProvider?.customTime || ''
      const garage  = b.isExternalProvider ? ` @ ${b.externalProvider?.garageName || 'External'}` : ''
      const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      return `• **${b.registration}** — ${work}${time ? ` (${time})` : ''}${garage} | ${dateStr}`
    }).join('\n')

    return `**${filtered.length} booking${filtered.length !== 1 ? 's' : ''}** for ${label}:\n\n${list}`
  }

  // Nothing matched — return null to let Groq handle it
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useGroqAssistant(): UseGroqAssistantReturn {
  const { user } = useAuth()
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [lastQuery,    setLastQuery]    = useState('')
  const [lastResponse, setLastResponse] = useState<GroqResponse | null>(null)

  // Shortcuts — avoids repeating setLastResponse + return on every branch
  function ok(answer: string, actionTaken = 'none'): GroqResponse {
    const r: GroqResponse = { success: true, answer, actionTaken }
    setLastResponse(r)
    return r
  }
  function fail(answer: string): GroqResponse {
    const r: GroqResponse = { success: false, answer, actionTaken: 'none' }
    setLastResponse(r)
    return r
  }
  function pending(answer: string, pendingAction: any): GroqResponse {
    const r: GroqResponse = { success: true, answer, actionTaken: 'none', pendingAction }
    setLastResponse(r)
    return r
  }

  const makeAudit = (action: string, displayName: string) => ({
    action, by: user!.uid, byDisplayName: displayName, timestamp: new Date(),
  })

  // ── confirmCheckoutToGarage ───────────────────────────────────────────────
  const confirmCheckoutToGarage = useCallback(async (
    vehicleId: string, garageId: string, garageName: string,
  ): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const { displayName } = await getProfile(user)
      const { error } = await supabase
        .from('checked_in_vehicles')
        .update({
          transfer_status: 'at_external_garage', external_garage_id: garageId,
          external_garage_name: garageName, checked_out_to_garage_at: nowIso(),
          checked_out_to_garage_by: user.uid, checked_out_to_garage_by_name: displayName,
          updated_at: nowIso(),
          last_edit_log: makeAudit(`Checked out to ${garageName} via Zao`, displayName),
        })
        .eq('id', vehicleId)
      if (error) throw error
      dispatch('zao:vehicle-updated', { vehicleId })
      return ok(`✅ Done! The vehicle has been checked out to **${garageName}**.`, 'checkout_to_garage')
    } catch (err: any) {
      return fail(`Sorry, I couldn't complete the checkout — ${err.message}`)
    } finally { setLoading(false) }
  }, [user])

  // ── confirmReturnFromGarage ───────────────────────────────────────────────
  const confirmReturnFromGarage = useCallback(async (
    vehicleId: string, vehicleReg: string, garageName: string,
  ): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const { displayName } = await getProfile(user)
      const { error } = await supabase
        .from('checked_in_vehicles')
        .update({
          transfer_status: null, external_garage_id: null, external_garage_name: null,
          checked_out_to_garage_at: null, checked_out_to_garage_by: null, checked_out_to_garage_by_name: null,
          updated_at: nowIso(),
          last_edit_log: makeAudit(`Returned from ${garageName} via Zao`, displayName),
        })
        .eq('id', vehicleId)
      if (error) throw error
      dispatch('zao:vehicle-updated', { vehicleId })
      return ok(`✅ **${vehicleReg}** is back in the yard! Cleared from **${garageName}**. 🏠`, 'return_from_garage')
    } catch (err: any) {
      return fail(`Couldn't process the return — ${err.message}`)
    } finally { setLoading(false) }
  }, [user])

  // ── confirmServiceBooking ─────────────────────────────────────────────────
  const confirmServiceBooking = useCallback(async (params: ConfirmBookingParams): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const { organizationId, displayName } = await getProfile(user)
      const garageName = params.customGarageName  || params.garageName  || 'External Garage'
      const garageAddr = params.customGarageAddress || params.garageAddress || ''
      const timeSlot   = params.isExternal ? '' : (params.timeSlot || '')
      const workList   = params.workRequired.length > 0 ? params.workRequired.join(', ') : 'General service'
      const dateFmt    = new Date(params.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

      // service_bookings columns are snake_case; work_required / external_provider
      // are jsonb (pass through verbatim). created_at defaults to now() server-side.
      // (Firestore stored a vehicleId on the booking too, but service_bookings has
      // no such column — vehicles are resolved by registration, so it's dropped.)
      const bookingData: any = {
        organization_id: organizationId, registration: params.vehicleReg,
        make: params.vehicleMake, model: params.vehicleModel, date: params.date,
        work_required: params.workRequired, status: 'scheduled',
        created_by: user.uid, created_by_name: displayName,
        notes: '', is_external_provider: params.isExternal,
      }
      if (!params.isExternal) bookingData.time_slot = timeSlot
      else bookingData.external_provider = { name: garageName, address: garageAddr, customTime: params.externalCustomTime || '' }

      const { error } = await supabase.from('service_bookings').insert(bookingData)
      if (error) throw error
      return ok(
        `✅ **Booking confirmed!**\n\n**${params.vehicleReg}** (${params.vehicleMake} ${params.vehicleModel})\n📅 ${dateFmt}\n🔧 ${workList}\n📍 ${params.isExternal ? garageName : 'Internal garage'}${!params.isExternal ? `\n⏰ ${timeSlot}` : ''}\n\nYou'll see it in the Service Bookings page. 🎉`,
        'service_booking_created'
      )
    } catch (err: any) {
      return fail(`Oops, couldn't create the booking — ${err.message}`)
    } finally { setLoading(false) }
  }, [user])

  // ── confirmCheckIn ────────────────────────────────────────────────────────
  const confirmCheckIn = useCallback(async (vehicleId: string, vehicleReg: string): Promise<GroqResponse> => {
    dispatch('zao:open-checkin', { vehicleId, vehicleReg })
    return ok(`Opening the check-in form for **${vehicleReg}** — fill in the details and hit confirm. 📋`, 'checkin_redirect')
  }, [])

  // ── confirmHireOut ────────────────────────────────────────────────────────
  const confirmHireOut = useCallback(async (vehicleId: string, vehicleReg: string): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const { organizationId, displayName } = await getProfile(user)
      const vehicleData = await fetchVehicleDoc(vehicleId, organizationId)
      if (!vehicleData) throw new Error('Vehicle not found')

      const startIso = nowIso()
      const { data: hireRow, error: hireErr } = await supabase
        .from('hire_history')
        .insert({
          vehicle_id: vehicleId, registration: vehicleData.registration, make: vehicleData.make || '',
          model: vehicleData.model || '', hire_start_date: startIso, hire_end_date: null,
          hired_by: user.uid, hired_by_name: displayName, hire_notes: '',
          organization_id: vehicleData.organizationId, branch_id: vehicleData.branchId || 'main',
          created_at: startIso,
        })
        .select('id')
        .single()
      if (hireErr) throw hireErr

      const { error: updErr } = await supabase
        .from('checked_in_vehicles')
        .update({
          hire_status: 'Out on Hire', original_status: vehicleData.status,
          hired_at: startIso, hired_by: user.uid, hired_by_name: displayName,
          hire_notes: '', current_hire_history_id: hireRow.id,
          updated_at: startIso,
          last_edit_log: makeAudit(`Set out on hire via Zao`, displayName),
        })
        .eq('id', vehicleId)
      if (updErr) throw updErr
      dispatch('zao:vehicle-updated', { vehicleId })
      return ok(`✅ **${vehicleReg}** is now out on hire. 🚗`, 'hire_out')
    } catch (err: any) {
      return fail(`Couldn't set hire status — ${err.message}`)
    } finally { setLoading(false) }
  }, [user])

  // ── confirmHireReturn ─────────────────────────────────────────────────────
  const confirmHireReturn = useCallback(async (vehicleId: string, vehicleReg: string): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const { organizationId, displayName } = await getProfile(user)
      const vehicleData = await fetchVehicleDoc(vehicleId, organizationId)
      if (!vehicleData) throw new Error('Vehicle not found')

      const returnIso = nowIso()
      if (vehicleData.currentHireHistoryId) {
        try {
          const { error } = await supabase
            .from('hire_history')
            .update({
              hire_end_date: returnIso, returned_by: user.uid,
              returned_by_name: displayName, updated_at: returnIso,
            })
            .eq('id', vehicleData.currentHireHistoryId)
          if (error) throw error
        } catch { /* non-fatal */ }
      }
      const { error: updErr } = await supabase
        .from('checked_in_vehicles')
        .update({
          hire_status: 'In Yard', status: vehicleData.originalStatus || vehicleData.status,
          original_status: null, hired_at: null, hired_by: null, hired_by_name: null,
          hire_notes: null, current_hire_history_id: null,
          // Reset the yard clock so "Days in Yard" restarts from the return.
          created_at: returnIso, check_in_time: returnIso,
          updated_at: returnIso,
          last_edit_log: makeAudit(`Returned from hire via Zao`, displayName),
        })
        .eq('id', vehicleId)
      if (updErr) throw updErr
      dispatch('zao:vehicle-updated', { vehicleId })
      return ok(`✅ **${vehicleReg}** is back in the yard! Hire period closed. Days counter reset. 🏠`, 'hire_return')
    } catch (err: any) {
      return fail(`Couldn't process the hire return — ${err.message}`)
    } finally { setLoading(false) }
  }, [user])

  // ── confirmBranchTransfer ─────────────────────────────────────────────────
  const confirmBranchTransfer = useCallback(async (
    vehicleId: string, vehicleReg: string, toBranchId: string, toBranchName: string,
  ): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const { displayName } = await getProfile(user)
      const { error } = await supabase
        .from('checked_in_vehicles')
        .update({
          transfer_status: 'in_transit', target_branch_id: toBranchId, target_branch_name: toBranchName,
          transfer_initiated_at: nowIso(), transfer_initiated_by: user.uid,
          transfer_initiated_by_name: displayName, updated_at: nowIso(),
          last_edit_log: makeAudit(`Transfer to ${toBranchName} initiated via Zao`, displayName),
        })
        .eq('id', vehicleId)
      if (error) throw error
      dispatch('zao:vehicle-updated', { vehicleId })
      return ok(`✅ Transfer initiated! **${vehicleReg}** is now in transit to **${toBranchName}**.`, 'branch_transfer')
    } catch (err: any) {
      return fail(`Couldn't initiate the transfer — ${err.message}`)
    } finally { setLoading(false) }
  }, [user])

  // ── askQuestion ───────────────────────────────────────────────────────────
  const askQuestion = useCallback(async (userMessage: string, branchSlug?: string, history: GroqMessage[] = []): Promise<GroqResponse> => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    setError(null)
    setLastQuery(userMessage)

    try {
      const { organizationId, displayName, userProfile } = await getProfile(user)
      const apiKey   = await getApiKey()
      const msgLower = userMessage.toLowerCase()

      // ── 1. WEATHER ──────────────────────────────────────────────────────────
      if (/weather|forecast|rain|temperature|temp|sunny|cloudy|wind|snow|cold|warm|hot/i.test(userMessage)) {
        const loc = userMessage.match(/(?:in|for|at)\s+([A-Za-z\s]+?)(?:\?|$|today|tomorrow|this week)/i)?.[1]?.trim() || 'London'
        return ok(await fetchWeather(loc), 'query')
      }

      // ── 1b. READ NOTES (no fleet data needed) ────────────────────────────────
      if (detectReadNotesIntent(userMessage)) {
        const todayLocal = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
        const localDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        try {
          // user_notes rows carry user_id + organization_id (no subcollection).
          // RLS scopes to the org; also filter to this user's own notes.
          const { data: notesRows, error: notesErr } = await supabase
            .from('user_notes')
            .select('*')
            .eq('user_id', user.uid)
          if (notesErr) throw notesErr
          const allNotes = toCamelList<any>(notesRows).filter((n: any) => !n.done) as any[]
          let fromDate = todayLocal, toDate = todayLocal, label = 'today'
          if (/tomorrow/.test(msgLower)) {
            const d = new Date(); d.setDate(d.getDate() + 1); fromDate = toDate = localDateStr(d); label = 'tomorrow'
          } else if (/next week/.test(msgLower)) {
            const s = new Date(); s.setDate(s.getDate() + 7); const e = new Date(); e.setDate(e.getDate() + 14)
            fromDate = localDateStr(s); toDate = localDateStr(e); label = 'next week'
          } else if (/this week|next 7/.test(msgLower)) {
            const d = new Date(); d.setDate(d.getDate() + 7); toDate = localDateStr(d); label = 'this week'
          } else if (!/today/.test(msgLower)) {
            const d = new Date(); d.setDate(d.getDate() + 30); toDate = localDateStr(d); label = 'upcoming'
          }
          const filtered = allNotes.filter((n: any) => n.date >= fromDate && n.date <= toDate)
            .sort((a: any, b: any) => a.date > b.date ? 1 : a.date < b.date ? -1 : 0)
          if (filtered.length === 0) return ok(`No notes for ${label}. 👍`)
          const pe: Record<string, string> = { urgent: '🔴', medium: '🟡', low: '🟢' }
          const lines = filtered.map((n: any) => {
            const time = n.scheduledTime ? ` @ ${n.scheduledTime}` : ''
            const reg  = n.vehicleReg ? ` [${n.vehicleReg}]` : ''
            return `${pe[n.priority] || '🟡'} ${n.text}${reg}${time}`
          }).join('\n')
          return ok(`**Notes for ${label}** (${filtered.length}):\n\n${lines}`, 'query')
        } catch { return ok("Couldn't load your notes right now — try again in a sec.") }
      }

      // ── 1c. CREATE NOTE (no fleet data needed) ─────────────────────────────────
      if (detectNoteIntent(userMessage)) {
        try {
          const parsed = await parseMessageWithGroq(userMessage)
          if (!parsed || parsed.length === 0) {
            return ok("I couldn't parse that into a note — try being more specific, e.g. 'remind me to call Dave tomorrow at 10am'.")
          }
          const parsedNotes = parsed.map((n: any) => ({
            summary: n.summary, date: n.date, scheduledTime: n.scheduledTime || null,
            priority: n.priority || 'medium', category: n.category || 'work',
            vehicleReg: n.vehicleReg || null, recurrence: 'none' as const,
            contactDetails: n.contactDetails || null,
          }))
          const contactDetails = parsed.find((n: any) => n.contactDetails)?.contactDetails || null
          const preview = parsedNotes.length === 1
            ? `Got it — here's what I'll save. Edit anything below then hit Save.`
            : `Parsed **${parsedNotes.length} notes** — edit if needed then save all.`
          return pending(preview, { type: 'note_confirm', parsedNotes, contactDetails })
        } catch (err: any) {
          return ok(`Couldn't parse that note — ${err.message || 'try rephrasing it.'}`)
        }
      }

      // ── 1d. DATA QUESTION → SQL-native agent ─────────────────────────────────
      // A clear data question goes straight to the tool-calling agent, BEFORE the
      // action detectors below — which otherwise misfire on questions (e.g.
      // "which one is in pending?" was being parsed as a check-in). Action
      // commands and anything ambiguous fall through unchanged. On any error the
      // agent silently falls through to the existing flow.
      const qTrim = userMessage.trim()
      const isQuestion =
        /\?\s*$/.test(qTrim) ||
        /^(what|which|how|how many|where|who|whose|why|when|is there|are there|do we|does|did|have we|got any|any\b|list\b|show\b|tell me|give me)/i.test(qTrim)
      const looksLikeAction =
        /\b(check\s*in|check\s*out|checkout|book|schedule|set\s+.*hire|hire\s+out|put\s+.*hire|return|mark|defleet|remove|send\s+.*to|move\s+.*to)\b/i.test(qTrim)
      if (isQuestion && !looksLikeAction) {
        try {
          const answer = await askZao(userMessage, history)
          if (answer) return ok(answer, 'query')
        } catch (err) {
          logger.error('Zao agent (early route) failed; falling through', err)
        }
      }

      // Fetch fleet data once — shared by all branches below
      const fleetData = await fetchFleetData(organizationId)

      // ── 2. SERVICE BOOKING ──────────────────────────────────────────────────
      if (detectBookingIntent(userMessage)) {
        const stripped = userMessage
          .replace(/\b(book|schedule|booking|appointment|service booking|for|the|a|an|and|or|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|week|internal|external|garage)\b/gi, ' ')
          .replace(/\s+/g, ' ').trim()
        const regHint = stripped.match(/\b([A-Z0-9]{3,8})\b/i)?.[1]?.toUpperCase() || ''

        let targetVehicle: any = null
        if (regHint) {
          const { data: fleetRows, error: fleetErr } = await supabase
            .from('vehicles')
            .select('*')
            .eq('organization_id', organizationId)
          if (fleetErr) throw fleetErr
          targetVehicle =
            toCamelList<any>(fleetRows).find((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(regHint)) ||
            (fleetData.yard.vehicles as any[]).find((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(regHint))
        }

        if (!targetVehicle) return ok(
          regHint
            ? `I couldn't find a vehicle matching "${regHint}". Can you double-check the registration?`
            : `Which vehicle would you like to book? Please include the registration (e.g. "Book LB22KGU next Thursday for service").`
        )

        const { matched: workMatched } = matchWorkTypes(userMessage)
        const bookingDate = parseBookingDate(userMessage)
        const garages     = fleetData.externalGarages.map((g: any) => ({ id: g.id, name: g.name, address: g.address || '' }))

        if (!bookingDate) return pending(
          `Got it — **${targetVehicle.registration}** (${targetVehicle.make || ''} ${targetVehicle.model || ''}). What date would you like to book it in?`,
          { type: 'booking_date_needed', vehicleId: targetVehicle.id, vehicleReg: targetVehicle.registration, vehicleMake: targetVehicle.make || '', vehicleModel: targetVehicle.model || '', workRequired: workMatched, garages }
        )

        const dateFmt    = new Date(bookingDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        const workPreview = workMatched.length > 0 ? ` for **${workMatched.join(', ')}**` : ''
        return pending(
          `Great! Booking **${targetVehicle.registration}** (${targetVehicle.make || ''} ${targetVehicle.model || ''}) on **${dateFmt}**${workPreview}.\n\nShould this be at your **internal garage** or an **external garage**?`,
          { type: 'booking_provider_selection', vehicleId: targetVehicle.id, vehicleReg: targetVehicle.registration, vehicleMake: targetVehicle.make || '', vehicleModel: targetVehicle.model || '', date: bookingDate, workRequired: workMatched, garages }
        )
      }

      // ── 3. MOT DONE ─────────────────────────────────────────────────────────
      const { isMOTDone, regHint: motReg, daysAgo } = detectMOTDoneIntent(userMessage)
      if (isMOTDone && !motReg) {
        return pending("Which vehicle had its MOT done?", { type: 'reg_needed', intent: 'mot_done', prompt: 'Enter the registration, then tell me when — e.g. "AB12 done today" or "AB12 done yesterday"' })
      }
      if (isMOTDone && motReg) {
        const { data: motFleetRows, error: motFleetErr } = await supabase
          .from('vehicles')
          .select('*')
          .eq('organization_id', organizationId)
        if (motFleetErr) throw motFleetErr
        const fleetAll  = toCamelList<any>(motFleetRows) as any[]
        const fleetMatch = fleetAll.find((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(motReg))
        const yardMatch  = (fleetData.yard.vehicles as any[]).find((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(motReg))
        const target     = fleetMatch || yardMatch
        if (!target) return ok(`Hmm, I couldn't find a vehicle matching "${motReg}". Double-check the registration!`)

        const motDate  = new Date(); motDate.setHours(0, 0, 0, 0); motDate.setDate(motDate.getDate() - daysAgo)
        const newExpiry = calculateNewMOTExpiry(motDate, target.motExpiry)
        const auditNote = `MOT updated via Zao — done ${daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`}, new expiry: ${newExpiry}`

        if (fleetMatch) {
          const { error } = await supabase
            .from('vehicles')
            .update({ mot_expiry: newExpiry, updated_at: nowIso(), last_edit_log: makeAudit(auditNote, displayName) })
            .eq('id', fleetMatch.id)
          if (error) throw error
        }
        if (yardMatch) {
          const { error } = await supabase
            .from('checked_in_vehicles')
            .update({ mot_expiry: newExpiry, updated_at: nowIso(), last_edit_log: makeAudit(auditNote, displayName) })
            .eq('id', yardMatch.id)
          if (error) throw error
        }

        const whenText = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`
        return ok(`✅ MOT updated for **${target.registration}**!\n\nMOT done: ${motDate.toLocaleDateString('en-GB')} (${whenText})\nPrevious expiry: ${target.motExpiry ? new Date(target.motExpiry).toLocaleDateString('en-GB') : 'not set'}\n**New expiry: ${new Date(newExpiry).toLocaleDateString('en-GB')}**`, 'mot_update')
      }

      // ── 4. CHECKOUT TO EXTERNAL GARAGE ──────────────────────────────────────
      const { isCheckout, regHint: checkoutReg, garageHint } = detectCheckoutIntent(userMessage)
      if (isCheckout && !checkoutReg) {
        return pending("Which vehicle are you checking out?", { type: 'reg_needed', intent: 'checkout', prompt: 'Enter the reg and garage — e.g. "AB12 out to ALK Garage"' })
      }
      if (isCheckout && checkoutReg) {
        const matches = findVehicles(fleetData.yard.vehicles, checkoutReg)
        if (matches.length === 0) return ok(`Hmm, I couldn't find "${checkoutReg}" in the yard right now.`)

        const vehicle = matches[0]
        const garages = fleetData.externalGarages
        if (garages.length === 0) return ok(`I found **${vehicle.registration}** but there are no external garages set up yet. Add them under Settings → External Garages.`)

        const matchedGarage = garages.find((g: any) => {
          const gn = g.name.toLowerCase()
          if (garageHint && gn.includes(garageHint)) return true
          return msgLower.replace(/[^a-z0-9 ]/g, '').split(' ').filter((w: string) => w.length > 2).some((w: string) => gn.includes(w))
        })

        if (matchedGarage) {
          const { error } = await supabase
            .from('checked_in_vehicles')
            .update({
              transfer_status: 'at_external_garage', external_garage_id: matchedGarage.id,
              external_garage_name: matchedGarage.name, checked_out_to_garage_at: nowIso(),
              checked_out_to_garage_by: user.uid, checked_out_to_garage_by_name: displayName,
              updated_at: nowIso(),
              last_edit_log: makeAudit(`Checked out to ${matchedGarage.name} via Zao`, displayName),
            })
            .eq('id', vehicle.id)
          if (error) throw error
          dispatch('zao:vehicle-updated', { vehicleId: vehicle.id })
          return ok(`✅ **${vehicle.registration}** checked out to **${matchedGarage.name}**.`, 'checkout_to_garage')
        }

        return pending(
          `I found **${vehicle.registration}** (${vehicle.make || ''} ${vehicle.model || ''}). Which garage?`,
          { type: 'checkout_garage_selection', vehicleId: vehicle.id, vehicleReg: vehicle.registration, vehicleMake: vehicle.make || '', vehicleModel: vehicle.model || '', garages: garages.map((g: any) => ({ id: g.id, name: g.name, address: g.address || '' })) }
        )
      }

      // ── 5. RETURN FROM EXTERNAL GARAGE ──────────────────────────────────────
      const { isReturn, regHint: returnReg } = detectReturnIntent(userMessage)
      if (isReturn) {
        const atGarage = fleetData.yard.atExternalGarage as any[]
        if (atGarage.length === 0) return ok(`No vehicles currently at an external garage — everything's in the yard! 🏠`, 'query')

        const matchedV = returnReg ? atGarage.find((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(returnReg.toUpperCase())) : null
        if (matchedV) {
          const { error } = await supabase
            .from('checked_in_vehicles')
            .update({
              transfer_status: null, external_garage_id: null, external_garage_name: null,
              checked_out_to_garage_at: null, checked_out_to_garage_by: null, checked_out_to_garage_by_name: null,
              updated_at: nowIso(),
              last_edit_log: makeAudit(`Returned from ${matchedV.externalGarageName || 'garage'} via Zao`, displayName),
            })
            .eq('id', matchedV.id)
          if (error) throw error
          dispatch('zao:vehicle-updated', { vehicleId: matchedV.id })
          return ok(`✅ **${matchedV.registration}** is back! Cleared from **${matchedV.externalGarageName || 'garage'}**. 🏠`, 'return_from_garage')
        }

        if (atGarage.length === 1) return pending(
          `Did you mean **${atGarage[0].registration}** returning from **${atGarage[0].externalGarageName || 'garage'}**?`,
          { type: 'return_garage_selection', vehicleId: atGarage[0].id, vehicleReg: atGarage[0].registration, vehicleMake: atGarage[0].make || '', vehicleModel: atGarage[0].model || '', garageName: atGarage[0].externalGarageName || 'garage' }
        )

        return pending(
          `Which vehicle is returning?\n\n${atGarage.map((v: any) => `• **${v.registration}** @ ${v.externalGarageName || '?'}`).join('\n')}\n\nJust say the reg or tap one below:`,
          { type: 'return_garage_selection', vehicleId: '', vehicleReg: '', vehicleMake: '', vehicleModel: '', garageName: '', vehicles: atGarage.map((v: any) => ({ id: v.id, reg: v.registration, make: v.make || '', model: v.model || '', garageName: v.externalGarageName || 'Unknown' })) }
        )
      }

      // ── 6. GARAGE QUERY ─────────────────────────────────────────────────────
      if (/garage|bodyshop|body shop|external|checked out|which vehicles|vehicles at/.test(msgLower)) {
        const garageVehicles = fleetData.yard.atExternalGarage as any[]
        if (garageVehicles.length === 0) return ok(`No vehicles at any external garage — everything's in the yard! 🏠`, 'query')

        const stopWords = new Set(['which', 'are', 'the', 'vehicles', 'checked', 'out', 'at', 'in', 'to', 'is', 'a', 'an', 'and', 'or', 'for', 'how', 'many'])
        const keywords  = msgLower.replace(/[^a-z0-9 ]/g, '').split(' ').filter((w: string) => w.length > 1 && !stopWords.has(w))
        let filtered    = garageVehicles
        if (keywords.length > 0) {
          const byG = garageVehicles.filter((v: any) => keywords.some((k: string) => (v.externalGarageName || '').toLowerCase().includes(k)))
          if (byG.length > 0) filtered = byG
        }

        const grouped: Record<string, any[]> = {}
        for (const v of filtered) { const gn = v.externalGarageName || 'Unknown Garage'; if (!grouped[gn]) grouped[gn] = []; grouped[gn].push(v) }
        const sections = Object.entries(grouped).map(([gn, vs]) =>
          `**${gn}**\n${(vs as any[]).map((v: any) => `  • ${v.registration} — ${v.make || ''} ${v.model || ''} (${v.size || '?'})`).join('\n')}`
        ).join('\n\n')
        return ok(`There ${filtered.length === 1 ? 'is' : 'are'} **${filtered.length} vehicle${filtered.length === 1 ? '' : 's'}** at external garages:\n\n${sections}`, 'query')
      }

      // ── 6b. MILEAGE UPDATE ──────────────────────────────────────────────────
      const { isMileage, regHint: mileageReg, mileage } = detectMileageIntent(userMessage)
      if (isMileage && mileageReg && mileage) {
        const matches = findVehicles(fleetData.yard.vehicles, mileageReg)
        if (matches.length === 0) return ok(`I couldn't find "${mileageReg}" in the yard.`)

        const vehicle = matches[0]
        const { error } = await supabase
          .from('checked_in_vehicles')
          .update({
            mileage, updated_at: nowIso(),
            last_edit_log: makeAudit(`Mileage updated to ${mileage} via Zao`, displayName),
          })
          .eq('id', vehicle.id)
        if (error) throw error
        dispatch('zao:vehicle-updated', { vehicleId: vehicle.id })
        return ok(`✅ Mileage updated! **${vehicle.registration}** is now on **${parseInt(mileage, 10).toLocaleString('en-GB')} miles**.`, 'mileage_update')
      }

      // ── 6c. CHECK IN ────────────────────────────────────────────────────────
      const { isCheckIn, regHint: checkInReg } = detectCheckInIntent(userMessage)
      if (isCheckIn) {
        const fleetVehicles = fleetData.fleet.vehicles as any[]
 
        // Helper: vehicles not already checked in at this branch
        const checkedInRegs = new Set(
          (fleetData.yard.vehicles as any[]).map((v: any) =>
            (v.registration || '').toUpperCase().replace(/\s/g, '')
          )
        )
        const availableFleet = fleetVehicles.filter((v: any) =>
          !checkedInRegs.has((v.registration || '').toUpperCase().replace(/\s/g, ''))
        )
 
        // ── No reg given → show 5 most recently added fleet vehicles ──────────
        if (!checkInReg) {
          if (availableFleet.length === 0) {
            return ok(`All fleet vehicles are already checked in! Nothing left to bring in.`)
          }
          // Sort by dateAcquired or createdAt descending, take 5
          const recent = [...availableFleet]
            .sort((a: any, b: any) => {
              const dateA = new Date(a.dateAcquired || a.createdAt || 0).getTime()
              const dateB = new Date(b.dateAcquired || b.createdAt || 0).getTime()
              return dateB - dateA
            })
            .slice(0, 5)
 
          const list = recent
            .map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`)
            .join('\n')
 
          return ok(
            `Which vehicle are you checking in? Here are the 5 most recently added:\n\n${list}\n\nJust say or type the registration and I'll find it.`
          )
        }
 
        // ── Reg given — check if already in yard ─────────────────────────────
        const alreadyIn = findVehicles(fleetData.yard.vehicles, checkInReg)
        if (alreadyIn.length > 0) {
          const v             = alreadyIn[0] as any
          const vehicleBranch = v.branchName || v.sourceBranchName || v.branchId || 'Main Branch'
          const mySlug        = branchSlug || 'main'
          const myBranchName  = await resolveBranchName(organizationId, mySlug)
 
          const location =
            v.transferStatus === 'at_external_garage' ? `at **${v.externalGarageName || 'external garage'}**` :
            v.transferStatus === 'in_transit'          ? `in transit to **${v.targetBranchName || 'another branch'}**` :
            v.hireStatus === 'Out on Hire'             ? `out on hire` :
            `at **${vehicleBranch}**`
 
          const isDifferentBranch = v.branchId && v.branchId !== mySlug &&
            v.transferStatus !== 'at_external_garage' &&
            v.transferStatus !== 'in_transit' &&
            v.hireStatus !== 'Out on Hire'
 
          if (isDifferentBranch) return pending(
            `**${v.registration}** (${v.make || ''} ${v.model || ''}) is already checked in ${location}, status: **${v.status || 'Pending checks'}**.\n\nWould you like to transfer it to **${myBranchName}**?`,
            { type: 'branch_transfer_confirm', vehicleId: v.id, vehicleReg: v.registration, vehicleMake: v.make || '', vehicleModel: v.model || '', fromBranchId: v.branchId, fromBranchName: vehicleBranch, toBranchId: mySlug, toBranchName: myBranchName }
          )
 
          return ok(`**${v.registration}** is already checked in — currently ${location}, status: **${v.status || 'Pending checks'}**. Did you mean something else?`)
        }
 
        // ── Exact match in fleet ──────────────────────────────────────────────
        const cleanHint = checkInReg.toUpperCase().replace(/\s/g, '')
        const exactMatch = fleetVehicles.find((v: any) =>
          (v.registration || '').toUpperCase().replace(/\s/g, '') === cleanHint
        )
        if (exactMatch) {
          return pending(
            `Found **${exactMatch.registration}** (${exactMatch.make || ''} ${exactMatch.model || ''}) in the fleet. Confirm check-in?`,
            { type: 'checkin_confirm', vehicleId: exactMatch.id, vehicleReg: exactMatch.registration, vehicleMake: exactMatch.make || '', vehicleModel: exactMatch.model || '' }
          )
        }
 
        // ── Partial / fuzzy match — show up to 5 candidates ──────────────────
        const partialMatches = fleetVehicles.filter((v: any) =>
          (v.registration || '').toUpperCase().replace(/\s/g, '').includes(cleanHint)
        )
        if (partialMatches.length === 1) {
          // Only one partial match — just confirm it
          const m = partialMatches[0]
          return pending(
            `Did you mean **${m.registration}** (${m.make || ''} ${m.model || ''})? Confirm check-in?`,
            { type: 'checkin_confirm', vehicleId: m.id, vehicleReg: m.registration, vehicleMake: m.make || '', vehicleModel: m.model || '' }
          )
        }
        if (partialMatches.length > 1) {
          const list = partialMatches.slice(0, 5)
            .map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`)
            .join('\n')
          return ok(
            `I found ${partialMatches.length} vehicles matching **${checkInReg}**:\n\n${list}\n\nGive me the full registration and I'll confirm it.`
          )
        }
 
        // ── Also try make/model search as a fallback ──────────────────────────
        const makeModelMatches = fleetVehicles.filter((v: any) => {
          const combined = `${v.make || ''} ${v.model || ''}`.toUpperCase()
          return combined.includes(cleanHint)
        })
        if (makeModelMatches.length > 0 && makeModelMatches.length <= 5) {
          const list = makeModelMatches
            .map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`)
            .join('\n')
          return ok(
            `Couldn't find a reg matching **${checkInReg}**, but found these vehicles:\n\n${list}\n\nSay the full registration to check one in.`
          )
        }
 
        // ── Nothing found at all ──────────────────────────────────────────────
        if (availableFleet.length > 0) {
          const recent = [...availableFleet]
            .sort((a: any, b: any) => {
              const dateA = new Date(a.dateAcquired || a.createdAt || 0).getTime()
              const dateB = new Date(b.dateAcquired || b.createdAt || 0).getTime()
              return dateB - dateA
            })
            .slice(0, 5)
          const list = recent
            .map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`)
            .join('\n')
          return ok(
            `Couldn't find **${checkInReg}** in your fleet. Here are 5 vehicles available to check in:\n\n${list}\n\nSay or type the full registration to check one in.`
          )
        }
 
        return ok(`Couldn't find **${checkInReg}** in your fleet inventory. You may need to add it to the fleet first.`)
      }

      // ── 6d. HIRE OUT ────────────────────────────────────────────────────────
      const { isHireOut, regHint: hireOutReg } = detectHireOutIntent(userMessage)
      if (isHireOut && !hireOutReg) {
        return pending("Which vehicle is going out on hire?", { type: 'reg_needed', intent: 'hire_out', prompt: 'Enter the registration — e.g. "AB12 out on hire"' })
      }
      if (isHireOut && hireOutReg) {
        const matches = findVehicles(fleetData.yard.vehicles, hireOutReg)
        if (matches.length === 0) return ok(`I couldn't find **${hireOutReg}** in the yard.`)

        const vehicle = matches[0] as any
        if (vehicle.hireStatus === 'Out on Hire')      return ok(`**${vehicle.registration}** is already out on hire!`)
        if (vehicle.insuranceStatus === 'Not Insured') return ok(`⚠️ Can't put **${vehicle.registration}** out on hire — it's marked as **Not Insured**. Sort the insurance first!`)

        return pending(
          `Confirm putting **${vehicle.registration}** (${vehicle.make || ''} ${vehicle.model || ''}) out on hire?`,
          { type: 'hire_confirm', vehicleId: vehicle.id, vehicleReg: vehicle.registration, vehicleMake: vehicle.make || '', vehicleModel: vehicle.model || '' }
        )
      }

      // ── 6e. HIRE RETURN ─────────────────────────────────────────────────────
      const { isHireReturn, regHint: hireReturnReg } = detectHireReturnIntent(userMessage)
      if (isHireReturn) {
        const hiredOut = fleetData.yard.outOnHire as any[]
        if (hiredOut.length === 0) return ok(`No vehicles are out on hire right now — nothing to return!`, 'query')

        const matchedHire = hireReturnReg
          ? hiredOut.find((v: any) => (v.registration || '').toUpperCase().replace(/\s/g, '').includes(hireReturnReg.toUpperCase()))
          : null

        if (matchedHire) return pending(
          `Confirm returning **${matchedHire.registration}** (${matchedHire.make || ''} ${matchedHire.model || ''}) from hire?`,
          { type: 'hire_return_confirm', vehicleId: matchedHire.id, vehicleReg: matchedHire.registration, vehicleMake: matchedHire.make || '', vehicleModel: matchedHire.model || '' }
        )

        if (hiredOut.length === 1) return pending(
          `Did you mean **${hiredOut[0].registration}** returning from hire?`,
          { type: 'hire_return_confirm', vehicleId: hiredOut[0].id, vehicleReg: hiredOut[0].registration, vehicleMake: hiredOut[0].make || '', vehicleModel: hiredOut[0].model || '' }
        )

        return ok(`Which vehicle is coming back from hire?\n\n${hiredOut.map((v: any) => `• **${v.registration}** — ${v.make || ''} ${v.model || ''}`).join('\n')}\n\nSay the reg and I'll confirm it.`)
      }

      // ── 7. AGENT (questions + simple actions) ───────────────────────────────
      // Anything not caught by the specific multi-step commands above (booking,
      // checkout, check-in, hire, MOT-done) goes to the SQL-native agent FIRST.
      // It has read tools AND simple write tools (set status, add comment), and
      // resolves "it"/"that one" from the conversation — so "move it to ready"
      // works. Falls through to the local resolver / classifier only on error.
      try {
        const agentAnswer = await askZao(userMessage, history)
        if (agentAnswer) return ok(agentAnswer, 'query')
      } catch (err) {
        logger.error('Zao agent (fallback) failed; using local resolver', err)
      }

      // ── 7b. PURE CODE QUERY RESOLVER (last-ditch fallback) ──────────────────
      const localAnswer = resolveQueryLocally(userMessage, fleetData)
      if (localAnswer !== null) return ok(localAnswer, 'query')

      // ── 8. GROQ FALLBACK (comments, status updates, unknown intent) ──────────
      const smartSummary = buildSmartSummary(fleetData, userMessage)
      const systemPrompt = buildSystemPrompt(fleetData, smartSummary)
      const raw = await callGroq(systemPrompt, userMessage, apiKey, history)

      let intent: any
      try { intent = JSON.parse(raw.replace(/```json|```/g, '').trim()) }
      catch { return ok(raw || "Sorry, I didn't quite catch that — could you rephrase it?", 'query') }

      if (intent.intent === 'query') {
        // SQL-native answer: hand the question to the tool-calling agent, which
        // queries the database directly (org-scoped via RLS) instead of answering
        // from a prompt summary. Falls back to the classifier's answer on error.
        try {
          const answer = await askZao(userMessage, history)
          if (answer) return ok(answer, 'query')
        } catch (err) {
          logger.error('Zao agent failed; falling back to summary answer', err)
        }
        return ok(intent.answer && intent.answer !== 'null' ? intent.answer : "I couldn't find that — try being more specific!", 'query')
      }

      if (!intent.regPartial) return ok(`I couldn't identify a vehicle from that — include the registration or a partial plate.`)

      const matches = findVehicles(fleetData.yard.vehicles, intent.regPartial)
      if (matches.length === 0) return ok(`I couldn't find "${intent.regPartial}" in the yard.`)
      if (matches.length > 1)  return ok(`Found ${matches.length} vehicles matching "${intent.regPartial}" — can you be more specific?\n\n${matches.map(v => `• ${v.registration} — ${v.make || ''} ${v.model || ''}`).join('\n')}`)

      const vehicle = matches[0]

      if (intent.intent === 'status_update' && intent.newStatus) {
        const { error } = await supabase
          .from('checked_in_vehicles')
          .update({
            status: intent.newStatus, updated_at: nowIso(),
            last_edit_log: makeAudit(`Status → "${intent.newStatus}" via Zao`, displayName),
          })
          .eq('id', vehicle.id)
        if (error) throw error
        dispatch('zao:vehicle-updated', { vehicleId: vehicle.id })
        return ok(`✅ **${vehicle.registration}** is now **"${intent.newStatus}"**.`, 'status_update')
      }

      if (intent.intent === 'comment_update' && intent.comment) {
        const ts       = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
        const existing = (vehicle.comments || '').trim()
        const { error } = await supabase
          .from('checked_in_vehicles')
          .update({
            comments: existing ? `${existing}\n[${ts}] ${intent.comment}` : `[${ts}] ${intent.comment}`,
            updated_at: nowIso(),
            last_edit_log: makeAudit(`Comment added via Zao: "${intent.comment}"`, displayName),
          })
          .eq('id', vehicle.id)
        if (error) throw error
        return ok(`✅ Comment saved on **${vehicle.registration}**:\n\n"${intent.comment}"`, 'comment_update')
      }

      return ok(intent.answer || 'Done!')

    } catch (err: any) {
      const msg = err.message || 'Something went wrong'
      setError(msg)
      const r: GroqResponse = { success: false, answer: `Oops — ${msg}`, error: msg, actionTaken: 'none' }
      setLastResponse(r)
      return r
    } finally {
      setLoading(false)
    }
  }, [user])

  return {
    loading, error, lastQuery, lastResponse,
    askQuestion, confirmCheckoutToGarage, confirmReturnFromGarage,
    confirmServiceBooking, confirmCheckIn, confirmHireOut,
    confirmHireReturn, confirmBranchTransfer,
    clearError:   () => setError(null),
    clearHistory: () => { setLastQuery(''); setLastResponse(null) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE MODULE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve user profile and common derived values in one call. */
async function getProfile(user: any) {
  const userProfile    = await userProfileService.getProfile(user.uid)
  const organizationId = userProfile?.organizationId || user.uid
  const displayName    = userProfile?.displayName || 'AI Assistant'
  return { userProfile, organizationId, displayName }
}

/** Fetch a single checked_in_vehicles row by its ID (mapped to camelCase). */
async function fetchVehicleDoc(vehicleId: string, organizationId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('checked_in_vehicles')
    .select('*')
    .eq('id', vehicleId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  return data ? toCamel<any>(data) : null
}

/** Thin wrapper around CustomEvent dispatch to keep call sites clean. */
function dispatch(event: string, detail: object) {
  window.dispatchEvent(new CustomEvent(event, { detail }))
}