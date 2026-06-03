// 📁 src/lib/contractUtils.ts - FIXED: Proper handling of empty contracts
import { Contract } from '@/types'
import { logger } from '@/lib/logger'

// Default contract colors matching the UI - EXPANDED to 18 colors (ORIGINAL 9 + 9 NEW DISTINCT)
export const DEFAULT_CONTRACT_COLORS = [
  // ORIGINAL 9 COLORS - PRESERVED
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', text: 'text-white' },
  { name: 'Green', value: '#10b981', bg: 'bg-emerald-500', text: 'text-white' },
  { name: 'Purple', value: '#8b5cf6', bg: 'bg-violet-500', text: 'text-white' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', text: 'text-white' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500', text: 'text-white' },
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500', text: 'text-white' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-500', text: 'text-black' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500', text: 'text-white' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500', text: 'text-white' },
  
  // 9 NEW BOLD DISTINCT COLORS - NO SIMILAR SHADES
  { name: 'Neon Green', value: '#00FF00', bg: 'bg-green-400', text: 'text-black' },
  { name: 'Hot Magenta', value: '#FF00FF', bg: 'bg-fuchsia-600', text: 'text-white' },
  { name: 'Gold', value: '#FFD700', bg: 'bg-yellow-400', text: 'text-black' },
  { name: 'Navy Blue', value: '#000080', bg: 'bg-blue-900', text: 'text-white' },
  { name: 'Crimson', value: '#DC143C', bg: 'bg-red-700', text: 'text-white' },
  { name: 'Lime', value: '#BFFF00', bg: 'bg-lime-400', text: 'text-black' },
  { name: 'Turquoise', value: '#00CED1', bg: 'bg-cyan-400', text: 'text-black' },
  { name: 'Maroon', value: '#800000', bg: 'bg-red-900', text: 'text-white' },
  { name: 'Charcoal', value: '#36454F', bg: 'bg-gray-700', text: 'text-white' }
]

// Contract color lookup cache
let contractColorLookup: Record<string, string> = {}

/**
 * Update the contract color lookup cache
 */
export function updateContractLookup(contracts: Contract[]) {
  contractColorLookup = {}
  contracts.forEach(contract => {
    if (contract.name && contract.color) {
      contractColorLookup[contract.name] = contract.color
    }
  })
  logger.log('📋 Updated contract color lookup:', contractColorLookup)
}

/**
 * Get contract color by name - FIXED: Returns empty string for no contract
 */
export function getContractColor(contractName: string): string {
  // 🔧 FIX: Return empty string for no contract instead of default blue
  if (!contractName || contractName.trim() === '') return ''
  return contractColorLookup[contractName] || DEFAULT_CONTRACT_COLORS[0].value
}

/**
 * Get contract display color (for badges, etc.) - FIXED
 */
export function getContractDisplayColor(contractName: string): {
  backgroundColor: string
  textColor: string
  borderColor: string
} {
  // 🔧 FIX: Handle no contract case properly
  if (!contractName || contractName.trim() === '') {
    return {
      backgroundColor: '#6b7280', // Gray for no contract
      textColor: '#ffffff',
      borderColor: '#6b7280'
    }
  }

  const color = getContractColor(contractName)
  if (!color) {
    return {
      backgroundColor: '#6b7280', // Gray fallback
      textColor: '#ffffff', 
      borderColor: '#6b7280'
    }
  }

  const colorObj = DEFAULT_CONTRACT_COLORS.find(c => c.value === color)
  
  return {
    backgroundColor: color,
    textColor: colorObj?.text === 'text-black' ? '#000000' : '#ffffff',
    borderColor: color
  }
}

/**
 * Generate a contract badge component props - FIXED
 */
export function getContractBadgeProps(contractName: string): {
  style: React.CSSProperties
  className: string
  text: string
} {
  // 🔧 FIX: Proper handling of no contract
  if (!contractName || contractName.trim() === '') {
    return {
      style: { backgroundColor: '#6b7280', color: '#ffffff' },
      className: 'px-2 py-1 rounded-full text-xs font-medium',
      text: 'No Contract'
    }
  }

  const displayColor = getContractDisplayColor(contractName)
  
  return {
    style: { 
      backgroundColor: displayColor.backgroundColor, 
      color: displayColor.textColor,
      border: `1px solid ${displayColor.borderColor}`
    },
    className: 'px-2 py-1 rounded-full text-xs font-medium',
    text: contractName
  }
}

/**
 * Check if a color is light (for determining text color)
 */
export function isLightColor(color: string): boolean {
  // Convert hex to RGB
  const hex = color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  
  return luminance > 0.5
}

/**
 * Get appropriate text color for a background color
 */
export function getTextColorForBackground(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#000000' : '#ffffff'
}

// ──────────────────────────────────────────────────────────────────────────
// SINGLE-SOURCE-OF-TRUTH CONTRACT COLOUR RESOLUTION
//
// The badge colour stored on each vehicle (`contractColor`) is a denormalised
// copy that can drift — empty/stale, or pointing at the wrong same-named
// contract. These helpers resolve the colour from the live contracts list
// instead, so every "Fairview SDH" badge is identical regardless of the
// per-vehicle copy. Preference order: stable contractId → contract name →
// the stored copy as a last resort.
// ──────────────────────────────────────────────────────────────────────────

export interface ContractColorIndex {
  byId: Map<string, { name: string; color: string }> // contractId → { name, colour }
  byName: Map<string, string>                          // name (lower) → colour
}

/**
 * Build fast lookup maps from the org's contracts. Only contracts that
 * actually have a colour are indexed, so a colourless duplicate can never
 * win over a coloured one of the same name.
 */
export function buildContractColorIndex(
  contracts: Array<{ id?: string; name?: string; color?: string | null }>,
): ContractColorIndex {
  const byId = new Map<string, { name: string; color: string }>()
  const byName = new Map<string, string>()
  for (const c of contracts || []) {
    if (!c?.color) continue
    if (c.id) byId.set(c.id, { name: (c.name || '').trim(), color: c.color })
    const key = (c.name || '').trim().toLowerCase()
    if (key && !byName.has(key)) byName.set(key, c.color)
  }
  return { byId, byName }
}

/**
 * Resolve the authoritative badge colour for a vehicle.
 *
 * The badge LABEL is the contract name, so the colour must match the name.
 * `contractId` is used only to disambiguate genuine duplicate names — and only
 * while it still points at a contract with the SAME name. A stale id left
 * behind after the contract was changed (id → old contract, name → new
 * contract) is ignored, so the badge can't keep showing the old colour.
 * Returns '' when nothing resolves (caller renders the neutral/grey fallback).
 */
export function resolveVehicleContractColor(
  vehicle: { contract?: string | null; contractColor?: string | null; contractId?: string | null },
  index: ContractColorIndex,
): string {
  const name = (vehicle.contract || '').trim().toLowerCase()
  if (name) {
    // Exact id match only when the stored id agrees with the displayed name
    // (this is how duplicate same-named contracts get disambiguated).
    if (vehicle.contractId) {
      const c = index.byId.get(vehicle.contractId)
      if (c && c.color && c.name.trim().toLowerCase() === name) return c.color
    }
    const byName = index.byName.get(name)
    if (byName) return byName
  } else if (vehicle.contractId) {
    // No name on the vehicle — fall back to the id link.
    const c = index.byId.get(vehicle.contractId)
    if (c?.color) return c.color
  }
  // Last resort: the denormalised copy stored on the vehicle.
  return vehicle.contractColor || ''
}