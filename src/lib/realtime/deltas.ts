// src/lib/realtime/deltas.ts
// Leg 1 fast path: apply a realtime row change DIRECTLY to in-memory state
// instead of re-downloading the whole collection on every postgres_changes
// event. This is the egress fix for the "any change → full refetch by every
// connected client" pattern.
//
// Safety model (why this can't silently corrupt the UI):
//   • Deltas are pure upserts/removes keyed by `id` — applying the same delta
//     twice is a no-op, so a delta racing a full refetch is harmless.
//   • Anything we can't apply with certainty (malformed payload, missing id,
//     mapper threw) returns null from normalizeDelta and the CALLER falls back
//     to the old full refetch. Behaviour degrades to exactly what shipped before.
//   • Leg 2 resync (tab focus / network online / realtime reconnect / 5-min
//     stale check) still does FULL refetches — see src/lib/realtime/resync.ts.
//     Any drift a delta could ever introduce self-heals on the next resync.
//   • DELETE deltas rely on the payload's `old.id`, which is only present
//     because the hot tables are REPLICA IDENTITY FULL (migration 0035).
//   • ⚠️ UPDATE deltas ALSO depend on REPLICA IDENTITY FULL: it's what makes
//     Supabase realtime backfill unchanged TOASTed columns (big jsonb like
//     damage_pins) into `payload.new`. If RIF is ever reverted on these
//     tables, UPDATE deltas would silently wipe those columns in the UI —
//     keep 0035 in place, or remove this fast path with it.
'use client'

export type DeltaEventType = 'INSERT' | 'UPDATE' | 'DELETE'

/** Minimal shape of a Supabase `postgres_changes` payload we depend on.
 *  Kept local (not the supabase-js type) so a library upgrade can't silently
 *  change our narrowing — anything that doesn't match falls back to refetch. */
export interface RealtimeRowPayload {
  eventType: string
  new?: Record<string, any> | null
  old?: Record<string, any> | null
}

/** A row change we know how to apply: the event type, the row's id, and (for
 *  INSERT/UPDATE) the row already mapped into the frontend domain shape. */
export interface NormalizedDelta<T> {
  type: DeltaEventType
  id: string
  /** Mapped domain row — null for DELETE. */
  row: T | null
  /** Raw snake_case record from the payload (new for upserts, old for deletes).
   *  Lets callers test SQL-level predicates (e.g. branch_id) exactly as their
   *  fetch query would. */
  raw: Record<string, any>
}

/**
 * Validate a realtime payload and map it into a NormalizedDelta.
 * Returns null when the payload can't be applied with certainty — the caller
 * MUST treat null as "fall back to a full refetch".
 */
export function normalizeDelta<T>(
  payload: RealtimeRowPayload,
  mapRow: (raw: Record<string, any>) => T,
): NormalizedDelta<T> | null {
  const type = payload?.eventType
  if (type === 'DELETE') {
    const raw = payload.old
    if (!raw || raw.id == null) return null
    return { type, id: String(raw.id), row: null, raw }
  }
  if (type === 'INSERT' || type === 'UPDATE') {
    const raw = payload.new
    if (!raw || raw.id == null) return null
    try {
      return { type, id: String(raw.id), row: mapRow(raw), raw }
    } catch {
      // Mapper threw on an unexpected row shape → don't guess, refetch.
      return null
    }
  }
  return null
}

export interface ApplyDeltaOptions<T> {
  /** Does this (mapped, raw) row belong in the list at all? Mirrors the WHERE
   *  clause of the list's fetch query (e.g. branch filter, not-defleeted).
   *  Rows that stop belonging are REMOVED; rows that don't belong and aren't
   *  present are ignored. Default: everything belongs. */
  belongs?: (row: T, raw: Record<string, any>) => boolean
  /** Sort key for inserting rows not already in the list, preserving the
   *  list's DESCENDING order (e.g. created_at). Default: prepend (correct for
   *  newest-first lists receiving newly created rows). */
  sortKey?: (row: T) => number | string
}

/** Apply one normalized delta to a list. Pure; returns the same reference when
 *  nothing changed (so React state updates can bail out). */
function applyOne<T extends { id?: any }>(
  list: T[],
  delta: NormalizedDelta<T>,
  opts?: ApplyDeltaOptions<T>,
): T[] {
  const idx = list.findIndex(item => item.id != null && String(item.id) === delta.id)

  if (delta.type === 'DELETE') {
    if (idx === -1) return list
    return [...list.slice(0, idx), ...list.slice(idx + 1)]
  }

  const row = delta.row as T
  const belongs = opts?.belongs ? opts.belongs(row, delta.raw) : true

  if (!belongs) {
    // e.g. vehicle moved to another branch, or got defleeted on a non-defleeted
    // list: remove our copy if we have one, otherwise ignore the event entirely.
    if (idx === -1) return list
    return [...list.slice(0, idx), ...list.slice(idx + 1)]
  }

  if (idx !== -1) {
    // Known row → replace wholesale (payload.new is the FULL row).
    const next = list.slice()
    next[idx] = row
    return next
  }

  // New-to-us row → insert preserving descending order.
  if (!opts?.sortKey) return [row, ...list]
  const key = opts.sortKey(row)
  const insertAt = list.findIndex(item => opts.sortKey!(item) <= key)
  if (insertAt === -1) return [...list, row]
  return [...list.slice(0, insertAt), row, ...list.slice(insertAt)]
}

/** Apply a batch of deltas in arrival order. Pure — safe inside a React
 *  functional state update. */
export function applyDeltas<T extends { id?: any }>(
  list: T[],
  deltas: NormalizedDelta<T>[],
  opts?: ApplyDeltaOptions<T>,
): T[] {
  let next = list
  for (const delta of deltas) next = applyOne(next, delta, opts)
  return next
}
