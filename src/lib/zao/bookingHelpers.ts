// src/lib/zao/bookingHelpers.ts
// Pure helper functions for service booking parsing and MOT expiry calculation.
// No Firestore, no Groq, no React. Independently testable.

export const INTERNAL_WORK_TYPES = ['Service', 'Tyres', 'Driveshafts', 'MOT', 'Repairs', 'Break Pads', 'Maintenance']

export const TIME_SLOTS = [
  { id: '08:30-10:00', label: '08:30 - 10:00' },
  { id: '10:00-11:30', label: '10:00 - 11:30' },
  { id: '11:30-13:00', label: '11:30 - 13:00' },
  { id: '13:00-14:30', label: '13:00 - 14:30' },
  { id: '14:30-16:00', label: '14:30 - 16:00' },
  { id: '16:00-17:30', label: '16:00 - 17:30' },
  { id: '17:30-19:00', label: '17:30 - 19:00' },
  { id: '19:00-20:30', label: '19:00 - 20:30' },
]

/**
 * Parse a natural language date string into ISO format (YYYY-MM-DD).
 * Returns null if no date is found.
 */
// Use local date string to avoid UTC off-by-one in BST
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseBookingDate(msg: string): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (/\btoday\b/i.test(msg)) return toLocalDateStr(today)

  if (/\btomorrow\b/i.test(msg)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return toLocalDateStr(d)
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayMatch = msg.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
  if (dayMatch) {
    const targetDay = days.indexOf(dayMatch[1].toLowerCase())
    const d = new Date(today)
    let diff = targetDay - d.getDay()
    if (diff <= 0 || /\bnext\b/i.test(msg)) diff += 7
    d.setDate(d.getDate() + diff)
    return toLocalDateStr(d)
  }

  const inDaysMatch = msg.match(/(\d+)\s*days?\s*(?:time|from now)?/i)
  if (inDaysMatch) {
    const d = new Date(today)
    d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10))
    return toLocalDateStr(d)
  }

  return null
}

const WORK_SYNONYMS: Record<string, string> = {
  'tyre': 'Tyres', 'tire': 'Tyres', 'tyres': 'Tyres', 'tires': 'Tyres',
  'service': 'Service', 'oil change': 'Service', 'oil': 'Service',
  'mot': 'MOT', 'm.o.t': 'MOT',
  'repair': 'Repairs', 'repairs': 'Repairs', 'fix': 'Repairs',
  'brake': 'Break Pads', 'brakes': 'Break Pads', 'brake pad': 'Break Pads',
  'brake pads': 'Break Pads', 'break pad': 'Break Pads',
  'driveshaft': 'Driveshafts', 'driveshafts': 'Driveshafts', 'drive shaft': 'Driveshafts',
  'maintenance': 'Maintenance', 'check': 'Maintenance',
}

/**
 * Match work type keywords from a message against known work types.
 */
export function matchWorkTypes(msg: string): { matched: string[]; unmatched: string } {
  const matched: string[] = []
  const stripped = msg.toLowerCase()
    .replace(/\b(book|schedule|internal|external|garage|vehicle|for|the|a|an|and|or|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|week|service booking)\b/g, ' ')
    .replace(/\b[a-z]{2}\d{2}[a-z]{3}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  for (const [keyword, workType] of Object.entries(WORK_SYNONYMS)) {
    if (stripped.includes(keyword) && !matched.includes(workType)) {
      matched.push(workType)
    }
  }

  let remaining = stripped
  for (const keyword of Object.keys(WORK_SYNONYMS)) remaining = remaining.replace(keyword, '')
  const unmatched = remaining.replace(/\s+/g, ' ').trim()

  return { matched, unmatched }
}

/**
 * Calculate new MOT expiry date.
 *
 * KEY RULE: evaluate days-until-expiry AS OF the day MOT was done (motDate).
 * ≤28 days away on that date → roll existing expiry +1 year (renewing at the wire)
 * >28 days away              → motDate + 1 year (fresh MOT, starts fresh)
 */
export function calculateNewMOTExpiry(motDate: Date, currentExpiry: string | undefined): string {
  if (currentExpiry) {
    const expiry = new Date(currentExpiry)
    expiry.setHours(0, 0, 0, 0)
    const clean = new Date(motDate)
    clean.setHours(0, 0, 0, 0)
    const daysUntil = Math.round((expiry.getTime() - clean.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntil <= 28) {
      const newExpiry = new Date(expiry)
      newExpiry.setFullYear(newExpiry.getFullYear() + 1)
      return newExpiry.toISOString().split('T')[0]
    }
  }

  const newExpiry = new Date(motDate)
  newExpiry.setFullYear(newExpiry.getFullYear() + 1)
  return newExpiry.toISOString().split('T')[0]
}