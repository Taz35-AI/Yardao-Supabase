// src/lib/utils/defleetDue.ts
// Defleet-due status for a fleet vehicle, from its acquisition date + rental
// term: due date = dateAcquired + rentalTermMonths. Drives the fleet-page flag.

export type DefleetState = 'none' | 'ok' | 'soon' | 'overdue'

export interface DefleetDue {
  dueDate: string | null   // YYYY-MM-DD, or null when not enough info
  daysLeft: number | null  // negative = overdue
  state: DefleetState
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * @param soonDays how many days before the due date it starts flagging as "soon"
 */
export function computeDefleetDue(
  dateAcquired?: string | null,
  rentalTermMonths?: number | null,
  soonDays = 60,
): DefleetDue {
  const term = Number(rentalTermMonths)
  if (!dateAcquired || !term || term <= 0) return { dueDate: null, daysLeft: null, state: 'none' }
  const start = new Date(String(dateAcquired).slice(0, 10) + 'T00:00:00')
  if (isNaN(start.getTime())) return { dueDate: null, daysLeft: null, state: 'none' }

  const due = new Date(start)
  due.setMonth(due.getMonth() + term)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  const state: DefleetState = daysLeft < 0 ? 'overdue' : daysLeft <= soonDays ? 'soon' : 'ok'
  return { dueDate: ymd(due), daysLeft, state }
}
