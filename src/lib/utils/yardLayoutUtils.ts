// src/lib/utils/yardLayoutUtils.ts
// Pure helper functions for the yard layout — no React, no Firestore.
// Handles coordinate maths, label generation, and grid bounds calculation.

import {
  YardLayout,
  YardLayoutBounds,
  ParkingSpace,
  BuildingBlock,
  YARD_LAYOUT_LIMITS,
} from '@/types/yardLayout'

// ─── Column letters (Excel-style: A..Z, AA..AZ, BA..BZ...) ──────────────
const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Convert 1-based column number to Excel-style letter.
 *   1 → "A", 26 → "Z", 27 → "AA", 28 → "AB", 52 → "AZ", 53 → "BA"
 */
export function colLetter(col: number): string {
  if (col < 1) return ''
  let n = col
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = COL_LETTERS[r] + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Build a coordinate key from col + row.
 *   (1, 1) → "A1"   (27, 5) → "AA5"
 */
export function coordKey(col: number, row: number): string {
  return `${colLetter(col)}${row}`
}

/**
 * Lookup a space at a specific coordinate. Returns null if empty.
 *
 * ✨ Phase 4 (merged spaces): a cell can belong to a merged space whose
 * anchor lives elsewhere. We first do the O(1) exact-key lookup (covers
 * every 1×1 space), then fall through to scan only the merged spaces
 * (those with w>1 or h>1) and check if (col,row) lies inside their
 * footprint. Yards typically have very few merged spaces so the scan
 * is cheap.
 */
export function getSpaceAt(
  layout: Pick<YardLayout, 'spaces'>,
  col: number,
  row: number,
): ParkingSpace | null {
  // Fast path — exact coord match. Catches all 1×1 spaces, and the
  // anchor cell of any merged space.
  const direct = layout.spaces[coordKey(col, row)]
  if (direct) return direct

  // Slow path — only consider merged spaces (anything bigger than 1×1).
  for (const key of Object.keys(layout.spaces)) {
    const sp = layout.spaces[key]
    const w = sp.w ?? 1
    const h = sp.h ?? 1
    if (w === 1 && h === 1) continue
    if (
      col >= sp.col &&
      col < sp.col + w &&
      row >= sp.row &&
      row < sp.row + h
    ) {
      return sp
    }
  }
  return null
}

/**
 * Check if a cell is covered by any building block.
 */
export function isCellCoveredByBlock(
  blocks: BuildingBlock[],
  col: number,
  row: number,
): boolean {
  return blocks.some(
    (b) =>
      col >= b.col &&
      col < b.col + b.w &&
      row >= b.row &&
      row < b.row + b.h,
  )
}

/**
 * Calculate the visible grid bounds.
 * Auto-grows to fit all content + a margin in edit mode.
 *
 * ✨ Phase 4: merged spaces extend past their anchor cell, so we use
 * `col + (w-1)` and `row + (h-1)` as the right/bottom edge. With w/h
 * absent (legacy 1×1) this naturally falls back to (col, row).
 */
export function calculateBounds(
  spaces: Record<string, ParkingSpace>,
  blocks: BuildingBlock[],
  isEditMode: boolean,
): YardLayoutBounds {
  const spaceList = Object.values(spaces)
  const hasContent = spaceList.length > 0 || blocks.length > 0

  if (!hasContent) {
    return {
      cols: YARD_LAYOUT_LIMITS.MIN_VISIBLE_COLS,
      rows: YARD_LAYOUT_LIMITS.MIN_VISIBLE_ROWS,
    }
  }

  let maxCol = 0
  let maxRow = 0

  spaceList.forEach((s) => {
    // ✨ Phase 4: include the merged-space footprint in the bounds calc
    const w = s.w ?? 1
    const h = s.h ?? 1
    const right = s.col + w - 1
    const bottom = s.row + h - 1
    if (right > maxCol) maxCol = right
    if (bottom > maxRow) maxRow = bottom
  })
  blocks.forEach((b) => {
    if (b.col + b.w - 1 > maxCol) maxCol = b.col + b.w - 1
    if (b.row + b.h - 1 > maxRow) maxRow = b.row + b.h - 1
  })

  const margin = isEditMode ? YARD_LAYOUT_LIMITS.EDIT_MARGIN : 0

  return {
    cols: Math.min(
      YARD_LAYOUT_LIMITS.MAX_COLS,
      Math.max(YARD_LAYOUT_LIMITS.MIN_VISIBLE_COLS, maxCol + margin),
    ),
    rows: Math.min(
      YARD_LAYOUT_LIMITS.MAX_ROWS,
      Math.max(YARD_LAYOUT_LIMITS.MIN_VISIBLE_ROWS, maxRow + margin),
    ),
  }
}

/**
 * Generate a stable unique id for a new space or block.
 */
export function newId(prefix: 'sp' | 'b'): string {
  // Combination of timestamp + random ensures collision-free even
  // if the user creates many in a single tick.
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${t}_${r}`
}

/**
 * Find a parking space anywhere in the layout by its stable id.
 * Returns the coordinate key it currently lives at, plus the space itself.
 */
export function findSpaceById(
  spaces: Record<string, ParkingSpace>,
  spaceId: string,
): { coord: string; space: ParkingSpace } | null {
  for (const coord of Object.keys(spaces)) {
    if (spaces[coord].id === spaceId) {
      return { coord, space: spaces[coord] }
    }
  }
  return null
}

/**
 * Find a building block by id.
 */
export function findBlockById(
  blocks: BuildingBlock[],
  blockId: string,
): BuildingBlock | null {
  return blocks.find((b) => b.id === blockId) || null
}

/**
 * Count how many parking spaces are in the layout.
 */
export function countSpaces(spaces: Record<string, ParkingSpace>): number {
  return Object.keys(spaces).length
}

/**
 * Check if a building block would fit inside the grid limits.
 */
export function blockFitsInGrid(block: BuildingBlock): boolean {
  return (
    block.col >= 1 &&
    block.row >= 1 &&
    block.col + block.w - 1 <= YARD_LAYOUT_LIMITS.MAX_COLS &&
    block.row + block.h - 1 <= YARD_LAYOUT_LIMITS.MAX_ROWS
  )
}

/**
 * Move a space to a new coordinate. Handles the auto-label rename when
 * labelIsAuto = true. Returns a NEW spaces object (immutable update).
 *
 * Will refuse the move if:
 *   - The target cell already has a space
 *   - The target cell is under a building block
 *
 * ✨ Phase 4: when the moved space is merged (w>1 or h>1), the entire
 * footprint at the new anchor position is checked — every cell must be
 * free of other spaces and not under a building, and the footprint must
 * stay within the grid limits. Auto-labels also use the merged form
 * (e.g. "A1–A3") instead of just the anchor coord.
 */
export function moveSpace(
  spaces: Record<string, ParkingSpace>,
  blocks: BuildingBlock[],
  spaceId: string,
  newCol: number,
  newRow: number,
): { success: boolean; spaces: Record<string, ParkingSpace>; reason?: string } {
  const found = findSpaceById(spaces, spaceId)
  if (!found) {
    return { success: false, spaces, reason: 'Space not found' }
  }

  const newKey = coordKey(newCol, newRow)
  if (found.coord === newKey) {
    return { success: true, spaces } // no-op
  }

  // ✨ Phase 4: pull the moved space's footprint (defaults to 1×1)
  const w = found.space.w ?? 1
  const h = found.space.h ?? 1

  // Footprint must stay inside the grid
  if (
    newCol < 1 ||
    newRow < 1 ||
    newCol + w - 1 > YARD_LAYOUT_LIMITS.MAX_COLS ||
    newRow + h - 1 > YARD_LAYOUT_LIMITS.MAX_ROWS
  ) {
    return { success: false, spaces, reason: 'Target footprint goes off the grid' }
  }

  // Every cell under the new footprint must be free of other spaces
  // and not covered by a building. We allow overlap with the moving
  // space's own current footprint (so a 1-cell shuffle of a merged
  // space doesn't reject itself).
  for (let dc = 0; dc < w; dc++) {
    for (let dr = 0; dr < h; dr++) {
      const c = newCol + dc
      const r = newRow + dr
      if (isCellCoveredByBlock(blocks, c, r)) {
        return { success: false, spaces, reason: 'Target cell is under a building' }
      }
      const occupant = getSpaceAt({ spaces }, c, r)
      if (occupant && occupant.id !== spaceId) {
        return { success: false, spaces, reason: 'Target cell already has a space' }
      }
    }
  }

  const next = { ...spaces }
  delete next[found.coord]

  const updatedSpace: ParkingSpace = {
    ...found.space,
    col: newCol,
    row: newRow,
    // Auto-label updates to follow coord; custom label stays put.
    // ✨ Phase 4: use the merged label format when w*h > 1 so the
    // label reflects the full footprint, e.g. "A1–A3" not just "A1".
    label: found.space.labelIsAuto
      ? mergedSpaceLabel(newCol, newRow, w, h)
      : found.space.label,
  }
  next[newKey] = updatedSpace

  return { success: true, spaces: next }
}

// ─── ✨ Phase 4: Merged-space helpers ──────────────────────────────────────

/**
 * Get the footprint of a parking space, with safe defaults so legacy
 * 1×1 spaces (no w/h fields) just behave normally.
 */
export function getSpaceFootprint(space: ParkingSpace): { w: number; h: number } {
  return { w: space.w ?? 1, h: space.h ?? 1 }
}

/**
 * Is this space "merged" — i.e. covers more than one cell?
 */
export function isMergedSpace(space: ParkingSpace): boolean {
  const w = space.w ?? 1
  const h = space.h ?? 1
  return w > 1 || h > 1
}

/**
 * Auto-label format for a merged space.
 *   1×1 at (1,1)   → "A1"
 *   3×1 at (1,1)   → "A1–C1"   (horizontal)
 *   1×3 at (1,1)   → "A1–A3"   (vertical)
 *   2×2 at (1,1)   → "A1–B2"   (block)
 *
 * Uses an en-dash (–) rather than a hyphen so it visually reads as a range.
 */
export function mergedSpaceLabel(col: number, row: number, w: number, h: number): string {
  const tl = coordKey(col, row)
  if (w <= 1 && h <= 1) return tl
  const br = coordKey(col + w - 1, row + h - 1)
  return `${tl}–${br}`
}

/**
 * Validate whether a merged space of (w × h) cells anchored at (col, row)
 * can be created. Used by the editor's drag-select flow before committing.
 *
 * Refuses the merge if:
 *   - Footprint is < 1 cell or > MAX_MERGED_SPACE_CELLS
 *   - Anchor or any footprint cell falls outside the grid limits
 *   - Any footprint cell is covered by a building block
 *   - Any footprint cell already has a space (1×1 or merged)
 */
export function canCreateMergedSpace(
  spaces: Record<string, ParkingSpace>,
  blocks: BuildingBlock[],
  col: number,
  row: number,
  w: number,
  h: number,
): { ok: boolean; reason?: string } {
  const cells = w * h
  if (cells < 1 || w < 1 || h < 1) {
    return { ok: false, reason: 'Footprint must be at least 1 cell' }
  }
  if (cells > YARD_LAYOUT_LIMITS.MAX_MERGED_SPACE_CELLS) {
    return {
      ok: false,
      reason: `Merged spaces can be at most ${YARD_LAYOUT_LIMITS.MAX_MERGED_SPACE_CELLS} cells`,
    }
  }
  if (col < 1 || row < 1) {
    return { ok: false, reason: 'Anchor is off the grid' }
  }
  if (
    col + w - 1 > YARD_LAYOUT_LIMITS.MAX_COLS ||
    row + h - 1 > YARD_LAYOUT_LIMITS.MAX_ROWS
  ) {
    return { ok: false, reason: 'Footprint goes off the grid' }
  }
  for (let dc = 0; dc < w; dc++) {
    for (let dr = 0; dr < h; dr++) {
      const c = col + dc
      const r = row + dr
      if (isCellCoveredByBlock(blocks, c, r)) {
        return { ok: false, reason: 'Footprint overlaps a building' }
      }
      if (getSpaceAt({ spaces }, c, r)) {
        return { ok: false, reason: 'Footprint overlaps an existing space' }
      }
    }
  }
  return { ok: true }
}