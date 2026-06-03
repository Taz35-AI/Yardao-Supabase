// src/types/yardLayout.ts
// Type definitions for the yard layout feature
// One layout document per branch; contains parking spaces and building blocks

import { Timestamp } from 'firebase/firestore'

// ─── Parking Space ──────────────────────────────────────────────────────────
// Each space has a stable `id` (vehicles link to this, never to the label)
// and a coordinate pair (col, row). The label is what users see.
// Hybrid model: if labelIsAuto = true, label updates when the space is moved.
// If labelIsAuto = false, the user has customised it and it stays put.
//
// ✨ MERGED SPACES (Phase 4): a space can optionally span multiple cells
// via `w`/`h`. Used for trailers, transporters, or any oversized vehicle
// that needs more than 1×1 of yard real estate. (col, row) is still the
// TOP-LEFT anchor; footprint extends right by `w` cells and down by `h`.
// A merged space still has ONE id — vehicles park on it exactly the same
// way as any other space, so vehicleParkingService doesn't need to change.

export interface ParkingSpace {
  id: string             // stable unique id, never changes
  col: number            // 1-based column (1 = "A", 26 = "Z", 27 = "AA"...)
  row: number            // 1-based row
  label: string          // display label, e.g. "A1" or "VIP-3"
  labelIsAuto: boolean   // true = label follows coordinate
  // ✨ Phase 4: optional merged-space footprint. Both default to 1 when
  // omitted, so any existing 1×1 space loaded from Firestore still works
  // with no migration needed.
  w?: number             // width in cells (default 1)
  h?: number             // height in cells (default 1)
}

// ─── Building / Feature Block ──────────────────────────────────────────────
// Multi-cell block placed on the grid. Cells underneath cannot have spaces.
// Anchor (col, row) = top-left corner. Block extends right by `w` and down by `h`.

export type BlockShape = 'rect' | 'rounded' | 'capsule'

export interface BuildingBlock {
    id: string
    col: number
    row: number
    w: number
    h: number
    label: string
    shape: BlockShape
    color: string
    /**
     * ✨ Phase 3a: when true, every cell under this building's footprint
     * is also a parking space. The building renders translucent so the
     * spaces inside are visible. Spaces are auto-managed by the editor —
     * created when the building is placed, deleted when removed.
     */
    parkable?: boolean
  }

// ─── Yard Layout document ──────────────────────────────────────────────────
// One document per branch, stored at: yardLayouts/{branchId}
// Spaces are keyed by their CURRENT coordinate (e.g. "A1") for fast lookup.
// When a space moves, its key changes too.

export interface YardLayout {
  branchId: string
  organizationId: string
  spaces: Record<string, ParkingSpace>  // keyed by coord, e.g. "A1": { ... }
  blocks: BuildingBlock[]
  updatedAt?: Timestamp | Date
  updatedBy?: string
  updatedByName?: string
}

// ─── Helper types ──────────────────────────────────────────────────────────

export interface YardLayoutBounds {
  cols: number
  rows: number
}

// Mode for the editor UI
export type YardLayoutMode = 'view' | 'edit'

// What kind of item is currently selected in edit mode
export type SelectedItemKind = 'space' | 'block' | null

// ─── Constants ─────────────────────────────────────────────────────────────

export const YARD_LAYOUT_LIMITS = {
  MAX_SPACES: 500,
  MAX_COLS: 50,           // 50 letter-cols = A..AX (50 columns)
  MAX_ROWS: 50,
  MIN_VISIBLE_COLS: 5,    // grid never smaller than this
  MIN_VISIBLE_ROWS: 5,
  EDIT_MARGIN: 2,         // extra empty rows/cols shown in edit mode
  // ✨ Phase 4: cap a merged space's footprint so a runaway drag can't
  // create a 50×50 monster. 8 cells covers realistic cases (1×8 trailer
  // bay, 2×4 transporter pad) without breaking the UI.
  MAX_MERGED_SPACE_CELLS: 8,
} as const