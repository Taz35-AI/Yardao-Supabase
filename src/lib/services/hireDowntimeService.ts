// src/lib/services/hireDowntimeService.ts
// Computes a stable "off-road since" date per registration from BOTH:
//   • checked_in_vehicles — external garage check-outs + repairs
//   • service_bookings    — active internal/external workshop jobs
// Used by the credit scan + the Gantt downtime overlay so internal service
// bookings are picked up (not just garage check-outs). Pure reads; no cycle.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const normReg = (r?: string | null) => (r || '').toUpperCase().replace(/\s+/g, '')
const dayOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : null)

/** Map of normalised registration → earliest active downtime start (YYYY-MM-DD). */
export async function getDowntimeStartByReg(organizationId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!organizationId) return out
  const setEarliest = (reg: string, since: string | null) => {
    if (!reg || !since) return
    if (!out[reg] || since < out[reg]) out[reg] = since
  }

  // 1) Yard state: external garage check-outs (stable timestamp).
  try {
    const { data } = await supabase
      .from('checked_in_vehicles')
      .select('registration, transfer_status, checked_out_to_garage_at')
      .eq('organization_id', organizationId)
    for (const c of data ?? []) {
      const off = c.transfer_status === 'at_external_garage' || !!c.checked_out_to_garage_at
      if (off) setEarliest(normReg(c.registration), dayOnly(c.checked_out_to_garage_at))
    }
  } catch (err) {
    logger.error('getDowntimeStartByReg: yard read failed', err)
  }

  // 2) Active service bookings (internal or external). The booking gives a
  //    stable start: the garage check-in time, else the booking date.
  try {
    const { data } = await supabase
      .from('service_bookings')
      .select('registration, date, status, checked_in_to_garage_at')
      .eq('organization_id', organizationId)
      .in('status', ['checked_in_to_garage', 'in-progress'])
    for (const b of data ?? []) {
      setEarliest(normReg(b.registration), dayOnly(b.checked_in_to_garage_at) || dayOnly(b.date))
    }
  } catch (err) {
    logger.error('getDowntimeStartByReg: service bookings read failed', err)
  }

  return out
}

export const hireDowntimeService = { getDowntimeStartByReg }
