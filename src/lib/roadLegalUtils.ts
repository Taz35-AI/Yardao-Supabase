// src/lib/roadLegalUtils.ts
// MOT / road-tax gate for checking fleet vehicles out of a branch. Mirrors the
// insurance gate, with two deliberate differences:
//   • only an EXPIRED date blocks — a blank date is allowed (e.g. a new car
//     with no MOT due yet);
//   • it blocks branch transfers / plain checkout, but NOT sending the vehicle
//     to an external garage, so it can still go for its MOT or repair.
// Non-fleet vehicles (visitors / customers, no fleet vehicleId) are never gated.

export type RoadDoc = 'MOT' | 'Tax'

interface DocDates {
  motExpiry?: string | null
  taxExpiry?: string | null
}

interface YardVehicleLike extends DocDates {
  vehicleId?: string | null
  registration?: string | null
}

interface FleetVehicleLike extends DocDates {
  id?: string | null
  registration?: string | null
}

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Expired = a real date strictly before today (valid through its expiry day).
export function isDocExpired(dateStr?: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return day < localToday()
}

const normReg = (r?: string | null) => (r || '').replace(/\s+/g, '').toUpperCase()

// Expired MOT / tax for a yard vehicle. Dates come from the live fleet record
// (matched by fleet id, then registration), falling back to the yard row.
export function getExpiredRoadDocs(
  vehicle: YardVehicleLike | null | undefined,
  fleetVehicles: FleetVehicleLike[] = [],
): RoadDoc[] {
  if (!vehicle?.vehicleId) return []
  const fleet =
    fleetVehicles.find(f => f.id && f.id === vehicle.vehicleId) ||
    fleetVehicles.find(f => normReg(f.registration) && normReg(f.registration) === normReg(vehicle.registration))
  const mot = fleet?.motExpiry || vehicle.motExpiry
  const tax = fleet?.taxExpiry || vehicle.taxExpiry
  const expired: RoadDoc[] = []
  if (isDocExpired(mot)) expired.push('MOT')
  if (isDocExpired(tax)) expired.push('Tax')
  return expired
}
