// src/components/features/dashboard/CheckedOutVehiclesSection.tsx
// ─────────────────────────────────────────────────────────────
// Slim pill banner — clicking opens the side drawer directly.
// No more in-page card expansion eating up vertical space.
// All functionality preserved: in-transit + at-garage, cancel/return actions.
// ─────────────────────────────────────────────────────────────
'use client'

import React, { useMemo, useState } from 'react'
import {
  Truck, Wrench, ArrowRight, Building2, Clock, User,
  Package, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SideDrawer } from '@/components/ui/SideDrawer'
import { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface CheckedOutVehiclesSectionProps {
  vehicles: CheckedInVehicle[]
  currentBranchId: string
  onCancelTransfer: (vehicleId: string) => void
  onReturnFromGarage: (vehicleId: string) => void
  loading?: boolean
}

export function CheckedOutVehiclesSection({
  vehicles,
  currentBranchId,
  onCancelTransfer,
  onReturnFromGarage,
  loading = false
}: CheckedOutVehiclesSectionProps) {

  const t = useT()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [actioningVehicleId, setActioningVehicleId] = useState<string | null>(null)

  // ── Filter vehicles ───────────────────────────────────────────────────────

  const { inTransit, atGarage } = useMemo(() => {
    logger.log('🔍 CheckedOutVehiclesSection - Starting filter:', {
      totalVehicles: vehicles.length,
      currentBranchId,
    })

    const inTransit = vehicles.filter(v => {
      const match = v.branchId === currentBranchId && v.transferStatus === 'in_transit'
      if (match) logger.log('✅ Found IN TRANSIT vehicle:', v.registration)
      return match
    })

    const atGarage = vehicles.filter(v => {
      const match = v.branchId === currentBranchId && v.transferStatus === 'at_external_garage'
      if (match) logger.log('✅ Found AT GARAGE vehicle:', v.registration)
      return match
    })

    logger.log('📊 Final Filtered Results:', {
      inTransit: inTransit.length,
      atGarage: atGarage.length,
    })

    return { inTransit, atGarage }
  }, [vehicles, currentBranchId])

  const totalCheckedOut = inTransit.length + atGarage.length

  // ── Nothing to show ───────────────────────────────────────────────────────

  if (totalCheckedOut === 0) {
    logger.log('❌ CheckedOutVehiclesSection: No vehicles, returning null')
    return null
  }

  logger.log('✅ CheckedOutVehiclesSection: RENDERING with', totalCheckedOut, 'vehicles')

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleCancelTransfer = async (vehicleId: string) => {
    setActioningVehicleId(vehicleId)
    try { await onCancelTransfer(vehicleId) }
    finally { setActioningVehicleId(null) }
  }

  const handleReturnFromGarage = async (vehicleId: string) => {
    setActioningVehicleId(vehicleId)
    try { await onReturnFromGarage(vehicleId) }
    finally { setActioningVehicleId(null) }
  }

  // ── Vehicle card (used inside the drawer) ─────────────────────────────────

  const renderVehicleCard = (vehicle: CheckedInVehicle) => {
    const isAtGarage = vehicle.transferStatus === 'at_external_garage'
    const isActioning = actioningVehicleId === vehicle.id

    return (
      <div
        key={vehicle.id}
        className="flex flex-col gap-2 p-3 rounded-xl transition-all"
        style={{
          background: isAtGarage
            ? 'linear-gradient(to right, rgba(197,217,208,0.15), rgba(114,166,142,0.08))'
            : 'linear-gradient(to right, rgba(114,166,142,0.12), rgba(197,217,208,0.08))',
          borderLeft: `3px solid ${isAtGarage ? '#C5D9D0' : '#72A68E'}`,
          border: isAtGarage
            ? '1px solid rgba(197,217,208,0.4)'
            : '1px solid rgba(114,166,142,0.3)',
        }}
      >
        {/* Row 1: reg + destination */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* UK reg plate */}
          <span
            className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-sm tracking-wider"
            style={{
              background: 'linear-gradient(135deg, #f5d020, #f5a623)',
              color: '#1a1a1a',
              border: '1.5px solid rgba(0,0,0,0.15)',
            }}
          >
            {vehicle.registration}
          </span>

          {/* Arrow + destination */}
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
            {isAtGarage ? (
              <>
                <Wrench className="w-3 h-3" style={{ color: '#025940' }} />
                <span>{vehicle.externalGarageName || t('dashboard.checkedOut.unknownGarage')}</span>
              </>
            ) : (
              <>
                <ArrowRight className="w-3 h-3" style={{ color: '#025940' }} />
                <span>{vehicle.targetBranchName || t('dashboard.checkedOut.unknownBranch')}</span>
              </>
            )}
          </div>

          {/* Status pill */}
          <span
            className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: isAtGarage ? 'rgba(1,38,25,0.1)' : 'rgba(2,89,64,0.1)',
              color: isAtGarage ? '#012619' : '#025940',
            }}
          >
            {isAtGarage ? t('dashboard.checkedOut.atGarageHeading') : t('dashboard.checkedOut.inTransitHeading')}
          </span>
        </div>

        {/* Row 2: meta info */}
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" style={{ color: '#72A68E' }} />
            <span>
              {isAtGarage
                ? vehicle.checkedOutToGarageByName
                : vehicle.transferInitiatedByName || t('dashboard.checkedOut.unknownPerson')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" style={{ color: '#72A68E' }} />
            <span>
              {new Date(
                isAtGarage
                  ? vehicle.checkedOutToGarageAt!
                  : vehicle.transferInitiatedAt!
              ).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>

          {/* Action button */}
          <div className="ml-auto">
            {isAtGarage ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReturnFromGarage(vehicle.id)}
                disabled={isActioning}
                className="text-xs py-0.5 px-2 h-6 border-[#72A68E] text-[#025940] hover:bg-[#025940] hover:text-white"
              >
                {isActioning ? '...' : t('dashboard.checkedOut.returnButton')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCancelTransfer(vehicle.id)}
                disabled={isActioning}
                className="text-xs py-0.5 px-2 h-6 border-red-300 text-red-600 hover:bg-red-50"
              >
                {isActioning ? '...' : t('dashboard.checkedOut.cancelButton')}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Drawer content ─────────────────────────────────────────────────────────

  const renderDrawerContent = () => (
    <div className="space-y-4 p-1">
      {inTransit.length > 0 && (
        <div className="space-y-2">
          <div
            className="flex items-center gap-2 pb-1.5"
            style={{ borderBottom: '1px solid #72A68E' }}
          >
            <div className="p-1.5 rounded-md" style={{ backgroundColor: '#025940' }}>
              <Truck className="w-3.5 h-3.5 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('dashboard.checkedOut.inTransitHeading')}</h3>
            <span
              className="ml-auto px-2 py-0.5 text-xs font-bold rounded-full"
              style={{ backgroundColor: 'rgba(2,89,64,0.1)', color: '#025940' }}
            >
              {inTransit.length}
            </span>
          </div>
          <div className="space-y-2">
            {inTransit.map(v => renderVehicleCard(v))}
          </div>
        </div>
      )}

      {atGarage.length > 0 && (
        <div className="space-y-2">
          <div
            className="flex items-center gap-2 pb-1.5"
            style={{ borderBottom: '1px solid #C5D9D0' }}
          >
            <div className="p-1.5 rounded-md" style={{ backgroundColor: '#012619' }}>
              <Wrench className="w-3.5 h-3.5" style={{ color: '#C5D9D0' }} />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('dashboard.checkedOut.atGarageHeading')}</h3>
            <span
              className="ml-auto px-2 py-0.5 text-xs font-bold rounded-full"
              style={{ backgroundColor: 'rgba(1,38,25,0.1)', color: '#012619' }}
            >
              {atGarage.length}
            </span>
          </div>
          <div className="space-y-2">
            {atGarage.map(v => renderVehicleCard(v))}
          </div>
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — slim pill banner only, no in-page expansion
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Slim pill — same height as metric strip pills ─────────────────── */}
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="
          inline-flex items-center gap-1.5 px-3 py-1.5
          rounded-full border border-[#c8d5ce] bg-white
          hover:border-[#025940] hover:bg-[#f5faf7]
          transition-all duration-150 group
          text-xs font-semibold text-[#025940]
          whitespace-nowrap
        "
      >
        {/* Icon with pulse dot */}
        <div className="relative flex-shrink-0">
          <Package className="w-3.5 h-3.5" style={{ color: '#025940' }} />
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: '#b3f243' }}
          />
        </div>

        {/* Label — hidden on very small screens */}
        <span className="hidden sm:inline">{t('dashboard.checkedOut.pillLabel')}</span>

        {/* Total count badge */}
        <span className="min-w-[1.1rem] h-4 flex items-center justify-center rounded-full text-[10px] font-bold bg-[#e8f0eb] text-[#025940] px-1">
          {totalCheckedOut}
        </span>

        {/* Breakdown: transit + garage — desktop only */}
        {inTransit.length > 0 && (
          <span className="hidden md:inline-flex items-center gap-0.5 text-[10px] font-semibold">
            <Truck className="w-2.5 h-2.5" />
            {inTransit.length}
          </span>
        )}
        {atGarage.length > 0 && (
          <span className="hidden md:inline-flex items-center gap-0.5 text-[10px] font-semibold">
            <Wrench className="w-2.5 h-2.5" />
            {atGarage.length}
          </span>
        )}

        <ChevronRight className="w-3 h-3 text-[#8a9e94] group-hover:text-[#025940] group-hover:translate-x-0.5 transition-all" />
      </button>

      {/* ── Side Drawer ──────────────────────────────────────────────────── */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={t('dashboard.checkedOut.drawerTitle', { count: totalCheckedOut })}
        width="lg"
      >
        {renderDrawerContent()}
      </SideDrawer>
    </>
  )
}