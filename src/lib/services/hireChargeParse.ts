// src/lib/services/hireChargeParse.ts
// Pure logic for the PCNs & damages ledger: money computation + the
// deterministic PCN paste-parser. No supabase import — unit-testable.

import type { HireChargeType, HirePcnKind } from '@/types/hire'

const round2 = (n: number) => Math.round(n * 100) / 100

export const VAT_RATE = 0.2

/** VAT applies to the ADMIN FEE for PCNs (the fine itself is a disbursement),
 *  and to the whole recharge (cost + admin fee) for damages. */
export function computeChargeMoney(
  chargeType: HireChargeType,
  baseAmount: number,
  adminFee: number,
): { vatAmount: number; totalAmount: number } {
  const base = Number.isFinite(baseAmount) ? baseAmount : 0
  const admin = Number.isFinite(adminFee) ? adminFee : 0
  const vatable = chargeType === 'pcn' ? admin : base + admin
  const vatAmount = round2(vatable * VAT_RATE)
  return { vatAmount, totalAmount: round2(base + admin + vatAmount) }
}

export interface ParsedPcnRow {
  registration: string
  reference: string | null
  issuer: string | null
  pcnAmount: number | null
  paidAmount: number | null
  paidDate: string | null // YYYY-MM-DD
  kind: HirePcnKind
  raw: string
}

export const normChargeReg = (s: string) => s.toUpperCase().replace(/\s+/g, '')
// Current-style UK plate (AB12 CDE). Kept deliberately strict — anything else
// stays editable in the preview table rather than being mis-detected.
const REG_RE = /^[A-Z]{2}\d{2}[A-Z]{3}$/
const DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/
// Money: a £ sign or decimals, OR a short pure number (fines are < £1000; long
// digit runs like 73563280 are PCN references, not amounts).
const MONEY_RE = /^£?\d{1,4}(?:[.,]\d{2})?$/
const HAS_LETTER_RE = /[A-Z]/

function parseMoney(tok: string): number | null {
  const n = parseFloat(tok.replace(/[£,]/g, ''))
  return Number.isFinite(n) ? round2(n) : null
}

function parseDate(tok: string): string | null {
  const m = tok.match(DATE_RE)
  if (!m) return null
  const dd = m[1].padStart(2, '0')
  const mm = m[2].padStart(2, '0')
  let yy = m[3]
  if (yy.length === 2) yy = `20${yy}`
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null
  return `${yy}-${mm}-${dd}`
}

/**
 * Deterministic parser for pasted PCN lists (email tables / Excel rows).
 * Handles both department formats:
 *   nominated: "VK25NZB  YT74355207  PARKING SOLUTIONS"           (no amounts)
 *   paid:      "VK25NKO  73563280  £85.09  £85.09  29.06.2026"
 * Tokens split on tabs/commas/2+ spaces (falling back to single spaces), then
 * classified: registration → date → amount → reference → issuer (leftovers).
 * Rows with no detectable registration are skipped.
 */
export function parsePcnPaste(text: string): ParsedPcnRow[] {
  const rows: ParsedPcnRow[] = []
  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const upper = line.toUpperCase()
    // Header rows ("REG, PCN Number, ...")
    if (upper.includes('REG') && (upper.includes('PCN') || upper.includes('NUMBER'))) continue

    let tokens = line.split(/\t|,|\s{2,}/).map((s) => s.trim()).filter(Boolean)
    if (tokens.length <= 1) tokens = line.split(/\s+/).map((s) => s.trim()).filter(Boolean)

    let registration: string | null = null
    let reference: string | null = null
    const amounts: number[] = []
    let paidDate: string | null = null
    const leftovers: string[] = []

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      const up = normChargeReg(tok)

      // Registration — direct, or joined with the next token ("VK25" + "NZB").
      if (!registration && REG_RE.test(up)) { registration = up; continue }
      if (!registration && i + 1 < tokens.length && REG_RE.test(normChargeReg(tok + tokens[i + 1]))) {
        registration = normChargeReg(tok + tokens[i + 1])
        i++
        continue
      }

      const date = parseDate(tok)
      if (date) { paidDate = date; continue }

      if (MONEY_RE.test(tok)) {
        const n = parseMoney(tok)
        if (n !== null) { amounts.push(n); continue }
      }

      // PCN reference: alphanumeric ≥6 chars — with letters (YT74355207) or a
      // long digit run (73563280).
      if (!reference && /^[A-Z0-9]{6,}$/.test(up) && up !== registration) {
        reference = up
        continue
      }

      leftovers.push(tok)
    }

    if (!registration) continue

    const pcnAmount = amounts.length > 0 ? amounts[0] : null
    const paidAmount = amounts.length > 1 ? amounts[1] : pcnAmount
    rows.push({
      registration,
      reference,
      issuer: leftovers.length ? leftovers.join(' ') : null,
      pcnAmount,
      paidAmount,
      paidDate,
      kind: paidAmount !== null ? 'paid' : 'nominated',
      raw: line,
    })
  }
  return rows
}
