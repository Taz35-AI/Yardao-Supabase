// One-off migration: moves base64 damage-pin photos OUT of the damage_pins
// jsonb columns (vehicles + checked_in_vehicles) and into the `damage-photos`
// Storage bucket, leaving a photoUrl in each pin.
//
// Why: base64 photos inside jsonb bloat every row — every SELECT drags all
// photos over the wire, realtime decodes them on every change, and WAL volume
// explodes. This OOM-crashed the database on 24 Jul 2026.
//
// Prereq: the `damage-photos` bucket must exist (see the bucket SQL in the
// conversation / run it in the Supabase SQL editor first).
//
// Usage (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY = '<service role key>'
//   node scripts/migrate-damage-photos.mjs
//
// Safe to re-run: pins that already have photoUrl (and no photoBase64) are
// skipped; rows without base64 photos are left untouched.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gxiplydgrcjxdfrcrwcg.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var (Project Settings → API → service_role).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const BUCKET = 'damage-photos'
const TABLES = ['vehicles', 'checked_in_vehicles']

// Ensure the bucket exists (service role can create it via the storage API —
// no SQL editor needed). Public bucket: pins reference photos by public URL.
{
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (error && !/already exists/i.test(error.message)) {
    console.error(`Could not create/verify bucket "${BUCKET}": ${error.message}`)
    process.exit(1)
  }
  console.log(error ? `Bucket "${BUCKET}" already exists` : `Bucket "${BUCKET}" created`)
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') }
}

let uploadedCount = 0
let uploadedBytes = 0
let failedCount = 0

async function migratePin(pin, orgId, registration) {
  if (!pin || typeof pin !== 'object' || !pin.photoBase64) return pin
  const decoded = dataUrlToBuffer(pin.photoBase64)
  if (!decoded) {
    console.warn(`  ! pin ${pin.id}: photoBase64 is not a data URL — leaving as-is`)
    return pin
  }
  const ext = decoded.contentType === 'image/png' ? 'png' : 'jpg'
  const path = `${orgId}/${registration || 'unknown'}/${pin.id}_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: true })
  if (error) {
    failedCount++
    console.warn(`  ! pin ${pin.id}: upload failed (${error.message}) — keeping base64`)
    return pin
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  uploadedCount++
  uploadedBytes += decoded.buffer.length
  const { photoBase64, ...rest } = pin
  return { ...rest, photoUrl: data.publicUrl }
}

async function migrateTable(table) {
  console.log(`\n── ${table} ──`)
  // ids only first: rows are huge, so fetch them one at a time afterwards
  const { data: ids, error: idsError } = await supabase
    .from(table)
    .select('id')
    .not('damage_pins', 'is', null)
  if (idsError) throw new Error(`${table}: listing rows failed: ${idsError.message}`)
  console.log(`${ids.length} row(s) with damage pins`)

  let updatedRows = 0
  for (const { id } of ids) {
    const { data: row, error: rowError } = await supabase
      .from(table)
      .select('id, organization_id, registration, damage_pins')
      .eq('id', id)
      .single()
    if (rowError) {
      console.warn(`  ! row ${id}: fetch failed (${rowError.message}) — skipped`)
      continue
    }
    const pins = row.damage_pins
    if (!Array.isArray(pins) || !pins.some(p => p && p.photoBase64)) continue

    const migrated = []
    for (const pin of pins) {
      migrated.push(await migratePin(pin, row.organization_id, row.registration))
    }
    // Only write if at least one pin actually converted
    if (migrated.some((p, i) => p !== pins[i])) {
      const { error: updError } = await supabase
        .from(table)
        .update({ damage_pins: migrated })
        .eq('id', id)
      if (updError) {
        console.warn(`  ! row ${id} (${row.registration}): update failed (${updError.message})`)
      } else {
        updatedRows++
        console.log(`  ✓ ${row.registration}: ${pins.filter(p => p?.photoBase64).length} photo(s) moved`)
      }
    }
  }
  console.log(`${table}: ${updatedRows} row(s) updated`)
}

for (const table of TABLES) {
  await migrateTable(table)
}

console.log(`\nDone. ${uploadedCount} photo(s) uploaded (${(uploadedBytes / 1024 / 1024).toFixed(1)} MB moved out of the DB), ${failedCount} failed.`)
if (failedCount > 0) process.exitCode = 1
