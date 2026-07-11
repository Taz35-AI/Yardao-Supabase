// src/lib/utils/defleetDue.ts
// Defleet-due status for a fleet vehicle, from its acquisition date + rental
// term: due date = dateAcquired + rentalTermWeeks. Drives the fleet-page flag.

export type DefleetState = 'none' | 'ok' | 'soon' | 'overdue'

/** Minimal vehicle shape needed to compute defleet-due status. */
interface DefleetVehicleLike {
  isDefleeted?: boolean
  dateAcquired?: string | null
  rentalTermWeeks?: number | null
  defleetDueDate?: string | null
}

export interface DefleetAlertItem<V extends DefleetVehicleLike = DefleetVehicleLike> {
  v: V
  dueDate: string
  daysLeft: number
  overdue: boolean
}

/** Vehicles overdue or due for defleet within `windowDays`, soonest-first. */
export function computeDefleetItems<V extends DefleetVehicleLike>(
  vehicles: V[],
  windowDays = 30,
): DefleetAlertItem<V>[] {
  const out: DefleetAlertItem<V>[] = []
  for (const v of vehicles) {
    if (v.isDefleeted) continue
    const due = computeDefleetDue(v.dateAcquired, v.rentalTermWeeks, windowDays, v.defleetDueDate)
    if (!due.dueDate || due.daysLeft == null) continue
    if (due.daysLeft > windowDays) continue
    out.push({ v, dueDate: due.dueDate, daysLeft: due.daysLeft, overdue: due.daysLeft < 0 })
  }
  out.sort((a, b) => a.daysLeft - b.daysLeft)
  return out
}

export interface DefleetDue {
  dueDate: string | null   // YYYY-MM-DD, or null when not enough info
  daysLeft: number | null  // negative = overdue
  state: DefleetState
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * @param soonDays how many days before the due date it starts flagging as "soon"
 * @param explicitDueDate an exact defleet date (YYYY-MM-DD). When provided and
 *   valid it wins over the weeks-based calculation — used when a supplier gives
 *   a fixed defleet date instead of a term.
 */
export function computeDefleetDue(
  dateAcquired?: string | null,
  rentalTermWeeks?: number | null,
  soonDays = 60,
  explicitDueDate?: string | null,
): DefleetDue {
  let due: Date | null = null

  // 1) Explicit date supplied → use it verbatim.
  if (explicitDueDate) {
    const d = new Date(String(explicitDueDate).slice(0, 10) + 'T00:00:00')
    if (!isNaN(d.getTime())) due = d
  }

  // 2) Otherwise derive from acquisition date + rental term (in weeks).
  if (!due) {
    const term = Number(rentalTermWeeks)
    if (!dateAcquired || !term || term <= 0) return { dueDate: null, daysLeft: null, state: 'none' }
    const start = new Date(String(dateAcquired).slice(0, 10) + 'T00:00:00')
    if (isNaN(start.getTime())) return { dueDate: null, daysLeft: null, state: 'none' }
    due = new Date(start)
    due.setDate(due.getDate() + term * 7)   // rental term is in weeks
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysLeft = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  const state: DefleetState = daysLeft < 0 ? 'overdue' : daysLeft <= soonDays ? 'soon' : 'ok'
  return { dueDate: ymd(due), daysLeft, state }
}
