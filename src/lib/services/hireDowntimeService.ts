// src/lib/services/hireDowntimeService.ts
// Off-road downtime per registration, from BOTH:
//   • checked_in_vehicles — external garage check-outs + repairs
//   • service_bookings    — internal/external workshop jobs (any non-finished
//     status: scheduled / checked_in_to_garage / in-progress)
// Returns a stable start date + a human label ("Internal garage" / "External
// garage: <addr>") so the Gantt can show it and the credit scan can price it.
// Pure reads; no import cycle.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

export interface DowntimeInfo {
  since: string // YYYY-MM-DD — when the vehicle went (or is due) off-road
  type: 'internal' | 'external'
  label: string // e.g. "Internal garage" or "External garage: 12 High St"
}

const normReg = (r?: string | null) => (r || '').toUpperCase().replace(/\s+/g, '')
const dayOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : null)

/** Map of normalised registration → its current/earliest off-road window. */
export async function getDowntimeByReg(organizationId: string): Promise<Record<string, DowntimeInfo>> {
  const out: Record<string, DowntimeInfo> = {}
  if (!organizationId) return out
  const consider = (reg: string, info: DowntimeInfo | null) => {
    if (!reg || !info?.since) return
    if (!out[reg] || info.since < out[reg].since) out[reg] = info
  }

  // 1) External garage check-outs from the yard (stable timestamp).
  try {
    const { data } = await supabase
      .from('checked_in_vehicles')
      .select('registration, transfer_status, checked_out_to_garage_at, external_garage_name')
      .eq('organization_id', organizationId)
    for (const c of data ?? []) {
      const off = c.transfer_status === 'at_external_garage' || !!c.checked_out_to_garage_at
      if (!off) continue
      consider(normReg(c.registration), {
        since: dayOnly(c.checked_out_to_garage_at) || '',
        type: 'external',
        label: c.external_garage_name ? `External garage: ${c.external_garage_name}` : 'External garage',
      })
    }
  } catch (err) {
    logger.error('getDowntimeByReg: yard read failed', err)
  }

  // 2) Service bookings (internal or external) — anything not finished.
  try {
    const { data } = await supabase
      .from('service_bookings')
      .select('registration, date, status, checked_in_to_garage_at, is_external_provider, external_provider')
      .eq('organization_id', organizationId)
      .in('status', ['scheduled', 'checked_in_to_garage', 'in-progress'])
    for (const b of data ?? []) {
      const since = dayOnly(b.checked_in_to_garage_at) || dayOnly(b.date)
      if (!since) continue
      const ext = !!b.is_external_provider
      const garage = (b.external_provider && (b.external_provider.garageName || b.external_provider.address)) || ''
      consider(normReg(b.registration), {
        since,
        type: ext ? 'external' : 'internal',
        label: ext ? `External garage: ${garage}`.trim().replace(/:\s*$/, '') : 'Internal garage',
      })
    }
  } catch (err) {
    logger.error('getDowntimeByReg: service bookings read failed', err)
  }

  return out
}

export const hireDowntimeService = { getDowntimeByReg }
