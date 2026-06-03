// src/components/yard/layout/UnparkedVehiclesBar.tsx
// Horizontal scrollable strip shown above the layout dashboard view.
// Lists every checked-in vehicle that DOES NOT have a parkingSpaceId yet.
// Vehicles are draggable — drop them onto a free space in YardLayoutView
// to park them.
//
// ✨ PHASE 2.5b: This bar now ALSO accepts drops — drop a parked vehicle
//    chip onto the strip and it becomes unparked. Visual highlight pulses
//    when a parked chip is being dragged over it.

'use client'

import React from 'react'
import { CheckedInVehicle } from '@/types'
import { getVehicleChipColor } from '@/lib/utils/vehicleColorUtils'
import { BRAND, BRAND_ALPHA } from '@/constants/brand'
import { Car, AlertTriangle, ArrowDownToLine } from 'lucide-react'

interface UnparkedVehiclesBarProps {
  vehicles: CheckedInVehicle[]
  /** Called when a chip drag starts. Pass through to YardLayoutView so it can show drop zones. */
  onDragStart?: (vehicleId: string) => void
  onDragEnd?: () => void
  /** ✨ Phase 2.5b: a parked vehicle is currently being dragged.
   *  When true the bar should advertise itself as a drop target. */
  isReceivingDrop?: boolean
  /** ✨ Phase 2.5b: called when a parked vehicle chip is dropped onto this bar.
   *  Receiver should call vehicleParkingService.unassignVehicle. */
  onUnparkDrop?: (vehicleId: string) => void
  /** ✨ Phase 2.5b: bind the bar's DOM ref so the parent (YardLayoutView)
   *  can do hit-testing with elementsFromPoint during pointer-event drags. */
  dropZoneRef?: React.RefObject<HTMLDivElement>
}

export function UnparkedVehiclesBar({
  vehicles,
  onDragStart,
  onDragEnd,
  isReceivingDrop = false,
  onUnparkDrop,
  dropZoneRef,
}: UnparkedVehiclesBarProps) {
  // Only vehicles without a parking space
  const unparked = React.useMemo(
    () => vehicles.filter(v => !v.parkingSpaceId)
                  .sort((a, b) => (a.registration || '').localeCompare(b.registration || '')),
    [vehicles],
  )

  // ── HTML5 drop handlers (desktop drag-from-space-via-HTML5) ────────────
  const onDragOver = (e: React.DragEvent) => {
    // Only allow drops that contain our custom MIME (i.e. a vehicle drag)
    if (e.dataTransfer.types.includes('text/yardao-vehicle-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }
  const onDrop = (e: React.DragEvent) => {
    const vid = e.dataTransfer.getData('text/yardao-vehicle-id')
    if (!vid) return
    e.preventDefault()
    onUnparkDrop?.(vid)
  }

  if (unparked.length === 0 && !isReceivingDrop) {
    // Even with no unparked vehicles, we still need the bar mounted so
    // that drag-and-drop hit-testing still works. Render a thin "empty"
    // version that clearly accepts drops.
    return (
      <div
        ref={dropZoneRef}
        data-unpark-zone="1"
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs"
        style={{
          background: BRAND.bg,
          borderColor: BRAND.border,
          color: BRAND.mid,
        }}
      >
        <Car className="w-3.5 h-3.5" style={{ color: BRAND.dark }} />
        <span>All checked-in vehicles are parked. Nice.</span>
        <span className="ml-auto text-[10px]" style={{ color: BRAND.mid, opacity: 0.7 }}>
          Drop a parked vehicle here to unpark it
        </span>
      </div>
    )
  }

  return (
    <div
      ref={dropZoneRef}
      data-unpark-zone="1"
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-md border overflow-hidden transition-all"
      style={{
        background: isReceivingDrop ? BRAND_ALPHA.accentSoft : BRAND.white,
        borderColor: isReceivingDrop ? BRAND.accent : BRAND.border,
        boxShadow: isReceivingDrop ? `inset 0 0 0 2px ${BRAND.accent}` : undefined,
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b"
        style={{ background: isReceivingDrop ? BRAND_ALPHA.accentSoft : BRAND.bg, borderColor: BRAND.border }}
      >
        {isReceivingDrop ? (
          <>
            <ArrowDownToLine className="w-3.5 h-3.5" style={{ color: BRAND.dark }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BRAND.darkest }}>
              Drop here to unpark
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BRAND.darkest }}>
              Unparked vehicles
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: '#fef3c7', color: '#78350f' }}
            >
              {unparked.length}
            </span>
            <span className="text-[10px] ml-auto" style={{ color: BRAND.mid }}>
              Drag onto an empty space to park · drop here to unpark
            </span>
          </>
        )}
      </div>

      {unparked.length > 0 && (
        <div
          className="flex gap-1.5 px-2 py-2 overflow-x-auto"
          style={{ scrollbarWidth: 'thin' }}
        >
          {unparked.map(v => {
            const chip = getVehicleChipColor(v)
            return (
              <div
                key={v.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/yardao-vehicle-id', v.id)
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStart?.(v.id)
                }}
                onDragEnd={() => onDragEnd?.()}
                title={`${v.registration} · ${v.make || ''} ${v.model || ''} · ${chip.label}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md flex-shrink-0 cursor-grab active:cursor-grabbing select-none transition-transform hover:-translate-y-0.5"
                style={{
                  background: chip.background,
                  color: chip.text,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }}
              >
                <span className="font-mono font-bold text-xs">
                  {v.registration || '—'}
                </span>
                <span className="text-[10px] font-semibold opacity-90 hidden sm:inline">
                  {chip.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}