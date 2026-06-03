// src/lib/dbMap.ts
// snake_case (Postgres) ↔ camelCase (frontend TS) mapping.
//
// The Supabase migration uses idiomatic snake_case columns; the frontend
// interfaces (Vehicle, UserProfile, …) are camelCase and must stay identical.
// These helpers translate ONLY top-level keys — jsonb column values (damagePins,
// lastEditLog, externalProvider, makeModel, work_required, parts/labour, audit
// logs) are stored verbatim and pass through untouched, so their internal
// camelCase shape is preserved as-is.

const toSnakeKey = (k: string) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const toCamelKey = (k: string) =>
  k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** Row from Supabase → frontend object (snake → camel, top-level keys only). */
export function toCamel<T = any>(row: Record<string, any> | null): T | null {
  if (row == null) return null
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row)) out[toCamelKey(k)] = v
  return out as T
}

export function toCamelList<T = any>(rows: Record<string, any>[] | null): T[] {
  return (rows ?? []).map((r) => toCamel<T>(r) as T)
}

/** Frontend object → row for Supabase (camel → snake, top-level keys only).
 *  `undefined` values are dropped so they don't overwrite columns on update. */
export function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    out[toSnakeKey(k)] = v
  }
  return out
}
