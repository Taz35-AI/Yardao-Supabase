// src/lib/utils/vehicleColorUtils.ts
// Pure helpers — no React, no Firestore. Maps a vehicle to a chip colour
// for the yard layout view.
//
// PRIMARY:   contract colour (matches the contract pill colour shown in the
//            vehicle list — visually consistent across the app).
// FALLBACK:  vehicle status (used only when the vehicle has no contract).
//
// Centralised so it stays consistent everywhere we render parked vehicle
// indicators.

import { VehicleStatus, CheckedInVehicle } from '@/types'

// ─── Colour palette tied to the four-status system ───────────────────────
// Used as a SECONDARY/fallback when a vehicle has no contract assigned.
export const VEHICLE_STATUS_COLORS: Record<VehicleStatus, {
  background: string
  text: string
  label: string
}> = {
  'Ready':           { background: '#10b981', text: '#ffffff', label: 'Ready' },
  'Pending checks':  { background: '#f59e0b', text: '#1a1f1c', label: 'Pending' },
  'Repairs needed':  { background: '#f97316', text: '#ffffff', label: 'Repairs' },
  'Non-Starter':     { background: '#ef4444', text: '#ffffff', label: 'Non-Starter' },
}

const FALLBACK_COLOR = { background: '#9ca3af', text: '#1a1f1c', label: 'Unknown' }

// ─── Contrast helper ─────────────────────────────────────────────────────
// Decides whether to use white or near-black text on a given hex background
// using a simple luminance formula. Keeps registrations readable on every
// contract colour without us hand-tuning each one.
function pickReadableTextColor(hexBg: string): string {
  // Strip leading '#'
  const h = hexBg.replace('#', '')
  // Support shorthand #abc → #aabbcc
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h
  if (full.length !== 6) return '#ffffff'

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // Perceived luminance (Rec. 709 weighting)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.6 ? '#0d1f18' : '#ffffff'
}

/**
 * Get the chip colours for a vehicle — primarily based on contract colour.
 * Falls back to status colour if no contract is set, and a neutral grey if
 * neither is available.
 */
export function getVehicleChipColor(
  vehicle: Pick<CheckedInVehicle, 'status' | 'contract' | 'contractColor'>,
) {
  // 1. Contract colour takes priority — most visually meaningful for fleet ops
  if (vehicle?.contract && vehicle?.contractColor) {
    const bg = vehicle.contractColor
    return {
      background: bg,
      text: pickReadableTextColor(bg),
      label: vehicle.contract,
    }
  }

  // 2. Fall back to status-based colour for vehicles without a contract
  if (vehicle?.status) {
    return VEHICLE_STATUS_COLORS[vehicle.status] || FALLBACK_COLOR
  }

  // 3. Last resort — neutral grey
  return FALLBACK_COLOR
}

/**
 * Same lookup but accepting a raw status string. Useful for legend rendering.
 * Doesn't know about contracts — caller should use getVehicleChipColor for
 * the real per-vehicle colour.
 */
export function getStatusChipColor(status: string | undefined | null) {
  if (!status) return FALLBACK_COLOR
  return VEHICLE_STATUS_COLORS[status as VehicleStatus] || FALLBACK_COLOR
}