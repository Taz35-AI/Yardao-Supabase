// Pure-logic tests for the PCN paste-parser + charge money computation.
// No framework — run with:
//   npx tsx src/lib/services/__tests__/hireCharges.test.ts
// Exits non-zero if anything fails.
import { computeChargeMoney, parsePcnPaste, VAT_RATE } from '@/lib/services/hireChargeParse'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++ }
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}
const approx = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps

// ── computeChargeMoney ───────────────────────────────────────────────────────
ok('VAT rate is 20%', VAT_RATE === 0.2)
{
  // Nominated PCN: no fine recharged, £15 admin → VAT on admin only.
  const m = computeChargeMoney('pcn', 0, 15)
  ok('pcn admin-only VAT', approx(m.vatAmount, 3))
  ok('pcn admin-only total', approx(m.totalAmount, 18))
}
{
  // Paid PCN: £85.09 fine + £25 admin → VAT only on the admin fee.
  const m = computeChargeMoney('pcn', 85.09, 25)
  ok('paid pcn VAT (admin only)', approx(m.vatAmount, 5))
  ok('paid pcn total', approx(m.totalAmount, 115.09))
}
{
  // Damage: whole recharge is VATable.
  const m = computeChargeMoney('damage', 100, 15)
  ok('damage VAT on base+admin', approx(m.vatAmount, 23))
  ok('damage total', approx(m.totalAmount, 138))
}

// ── parsePcnPaste: nominated format ─────────────────────────────────────────
{
  const rows = parsePcnPaste('VK25NZB\tYT74355207\tPARKING SOLUTIONS\nVK25NZB\tYT74357701\tPARKING SOLUTIONS')
  ok('nominated: 2 rows', rows.length === 2)
  ok('nominated: reg', rows[0]?.registration === 'VK25NZB')
  ok('nominated: ref', rows[0]?.reference === 'YT74355207')
  ok('nominated: issuer', rows[0]?.issuer === 'PARKING SOLUTIONS')
  ok('nominated: kind', rows[0]?.kind === 'nominated')
  ok('nominated: no amount', rows[0]?.paidAmount === null)
}

// ── parsePcnPaste: paid format (header skipped, £, dotted date) ─────────────
{
  const rows = parsePcnPaste('REG\tPCN Number\tPCN £\tPAID AMOUNT\tPAID DATE\nVK25NKO\t73563280\t£85.09\t£85.09\t29.06.2026')
  ok('paid: header skipped, 1 row', rows.length === 1)
  ok('paid: reg', rows[0]?.registration === 'VK25NKO')
  ok('paid: numeric ref not eaten as amount', rows[0]?.reference === '73563280')
  ok('paid: pcn amount', rows[0]?.pcnAmount === 85.09)
  ok('paid: paid amount', rows[0]?.paidAmount === 85.09)
  ok('paid: date', rows[0]?.paidDate === '2026-06-29')
  ok('paid: kind', rows[0]?.kind === 'paid')
}

// ── parsePcnPaste: resilience ────────────────────────────────────────────────
{
  // Space-separated single-space line + reg split across tokens + comma format.
  const rows = parsePcnPaste('VK25 NZB YT74355207 TFL\nLL26FBK, ZX99123456, £60.00, 01/07/2026')
  ok('split reg joined', rows[0]?.registration === 'VK25NZB')
  ok('split reg ref', rows[0]?.reference === 'YT74355207')
  ok('comma row reg', rows[1]?.registration === 'LL26FBK')
  ok('comma row amount', rows[1]?.pcnAmount === 60)
  ok('comma row date (slash)', rows[1]?.paidDate === '2026-07-01')
  ok('comma row kind paid', rows[1]?.kind === 'paid')
}
{
  // Garbage / blank lines are skipped, not fatal.
  const rows = parsePcnPaste('\nhello there\nno reg here 123\n')
  ok('garbage skipped', rows.length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
