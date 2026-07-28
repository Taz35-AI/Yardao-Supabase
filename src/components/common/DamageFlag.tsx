// src/components/common/DamageFlag.tsx
// At-a-glance "this vehicle needs attention" markers, used on the pipeline
// cards and both yard-layout tile shapes. One rule set + one badge row so the
// meaning stays identical everywhere — change it here and every view follows.
//
// Three independent signals, each with its own icon, shown side by side:
//   • repairs-needed.svg  — status is Repairs needed (or Non-Starter)
//   • damage-icon.svg     — more than one damage pin recorded
//   • poor-critical.svg   — condition is Poor or Critical
// A vehicle that trips two rules shows two icons.

'use client'

export interface VehicleFlagSource {
  status?: string | null
  condition?: string | null
  damagePins?: unknown[] | null
}

export interface VehicleFlag {
  kind: 'repairs' | 'damage' | 'condition'
  src: string
  label: string
}

/** Conditions that count as "in a bad way" (severity poor/critical). */
const BAD_CONDITIONS = new Set([
  'poor',
  'critical',
  // legacy names that map onto Critical (see conditionUtils.getConditionDisplayName)
  'major bodywork needed',
  'needs repair',
  'non-starter',
])

/** Any recorded damage pin flags the vehicle. */
const MIN_PINS = 1

/**
 * Which flags this vehicle earns, in display order. Returning the list (rather
 * than a bare boolean) lets callers render the icons and build the tooltip from
 * the same source of truth.
 */
export function getVehicleFlags(vehicle: VehicleFlagSource | null | undefined): VehicleFlag[] {
  if (!vehicle) return []
  const flags: VehicleFlag[] = []

  const status = (vehicle.status || '').trim().toLowerCase()
  if (status === 'repairs needed' || status === 'non-starter') {
    flags.push({
      kind: 'repairs',
      src: '/repairs-needed.svg',
      label: status === 'non-starter' ? 'Non-starter' : 'Repairs needed',
    })
  }

  const pins = Array.isArray(vehicle.damagePins) ? vehicle.damagePins.length : 0
  if (pins >= MIN_PINS) {
    flags.push({ kind: 'damage', src: '/damage-icon.svg', label: `${pins} damage pin${pins === 1 ? '' : 's'}` })
  }

  const condition = (vehicle.condition || '').trim().toLowerCase()
  if (BAD_CONDITIONS.has(condition)) {
    flags.push({ kind: 'condition', src: '/poor-critical.svg', label: `${vehicle.condition} condition` })
  }

  return flags
}

export function isVehicleFlagged(vehicle: VehicleFlagSource | null | undefined): boolean {
  return getVehicleFlags(vehicle).length > 0
}

/**
 * The floating marker row. The caller positions it (every host has its own
 * corner); this owns the badges themselves.
 *
 * Each icon sits on a white disc: yard tiles are coloured by status (green,
 * amber, orange, red), and the raw glyphs — yellow, lime, black line art —
 * would each disappear against at least one of those. The disc gives every
 * icon the same contrast on every background.
 */
export function VehicleFlags({
  vehicle,
  size = 14,
  gap = 2,
  className = '',
  style,
}: {
  vehicle: VehicleFlagSource | null | undefined
  size?: number
  gap?: number
  className?: string
  style?: React.CSSProperties
}) {
  const flags = getVehicleFlags(vehicle)
  if (flags.length === 0) return null

  return (
    <span
      className={`pointer-events-none select-none ${className}`}
      title={`Needs attention — ${flags.map(f => f.label).join(' · ')}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}
    >
      {flags.map(flag => (
        <span
          key={flag.kind}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(0,0,0,0.25)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={flag.src}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72), display: 'block' }}
          />
        </span>
      ))}
    </span>
  )
}
