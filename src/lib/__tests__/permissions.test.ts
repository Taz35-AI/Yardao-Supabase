// src/lib/__tests__/permissions.test.ts
// Unit tests for the access-control helpers (Admin & Garage Manager model).
// Run: npx tsx src/lib/__tests__/permissions.test.ts
import {
  isOwner, isGarageManager, isManager, isAdminLevel, isAdminRole,
  canEditInvoices, canCreateInvoices, canManageBookings, canManageStockPrices, canGrantManager,
  type PermCtx,
} from '../permissions'

let passed = 0
let failed = 0
function ok(name: string, cond: boolean) {
  if (cond) { passed++ } else { failed++; console.log('  ✗ FAIL:', name) }
}

const OWNER = 'owner-uid'

const owner: PermCtx = { uid: OWNER, role: 'admin', orgCreatedBy: OWNER }        // creator, stored as admin
const manager: PermCtx = { uid: 'gm-uid', role: 'garage_manager', orgCreatedBy: OWNER }
const admin: PermCtx = { uid: 'a-uid', role: 'admin', orgCreatedBy: OWNER }        // plain admin
const member: PermCtx = { uid: 'm-uid', role: 'member', orgCreatedBy: OWNER }
const mechanic: PermCtx = { uid: 'me-uid', role: 'mechanic', orgCreatedBy: OWNER }
const nobody: PermCtx = { uid: null, role: null, orgCreatedBy: OWNER }
const loadingOwner: PermCtx = { uid: OWNER, role: 'admin', orgCreatedBy: null }    // org not yet loaded

// Owner detection — the creator is owner even though their role is 'admin'.
ok('owner is owner', isOwner(owner))
ok('plain admin is NOT owner', !isOwner(admin))
ok('manager is not owner', !isOwner(manager))
ok('null uid not owner', !isOwner(nobody))
ok('owner unknown while org loading', !isOwner(loadingOwner))

// Garage manager
ok('gm detected', isGarageManager(manager))
ok('admin not gm', !isGarageManager(admin))

// isManager = write authority = owner OR garage_manager
ok('owner is manager', isManager(owner))
ok('gm is manager', isManager(manager))
ok('plain admin is NOT manager', !isManager(admin))
ok('member not manager', !isManager(member))
ok('mechanic not manager', !isManager(mechanic))

// isAdminLevel (operational gates admins always had)
ok('admin is admin-level', isAdminLevel(admin))
ok('gm is admin-level', isAdminLevel(manager))
ok('owner is admin-level', isAdminLevel(owner))
ok('member not admin-level', !isAdminLevel(member))

// Capabilities collapse to isManager — the whole point of the feature.
for (const [label, ctx, expect] of [
  ['owner', owner, true], ['manager', manager, true],
  ['admin', admin, false], ['member', member, false], ['mechanic', mechanic, false],
] as [string, PermCtx, boolean][]) {
  ok(`${label} canEditInvoices=${expect}`, canEditInvoices(ctx) === expect)
  ok(`${label} canCreateInvoices=${expect}`, canCreateInvoices(ctx) === expect)
  ok(`${label} canManageBookings=${expect}`, canManageBookings(ctx) === expect)
  ok(`${label} canManageStockPrices=${expect}`, canManageStockPrices(ctx) === expect)
  ok(`${label} canGrantManager=${expect}`, canGrantManager(ctx) === expect)
}

// isAdminRole = visibility/access (a Garage Manager SEES everything an admin does).
ok('PROMOTION: garage_manager is admin-level for visibility', isAdminRole('garage_manager'))
ok('admin is admin-level for visibility', isAdminRole('admin'))
ok('member not admin-level for visibility', !isAdminRole('member'))
ok('mechanic not admin-level for visibility', !isAdminRole('mechanic'))
ok('null not admin-level', !isAdminRole(null))

// A plain admin must NOT be able to edit invoices or manage bookings/stock.
ok('SECURITY: admin cannot edit invoices', canEditInvoices(admin) === false)
ok('SECURITY: admin cannot manage bookings', canManageBookings(admin) === false)
ok('SECURITY: admin cannot manage stock', canManageStockPrices(admin) === false)
ok('SECURITY: admin cannot grant manager', canGrantManager(admin) === false)
// While the org is still loading, an owner is treated as non-manager (safe default).
ok('SAFE: loading owner not yet manager', isManager(loadingOwner) === false)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
