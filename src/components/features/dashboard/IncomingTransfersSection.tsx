// src/components/features/dashboard/IncomingTransfersSection.tsx
// Display vehicles being transferred TO the current branch from other branches
// FIXED: Added comprehensive logging to debug filtering issues
// ENHANCED: Professional UI - Compact single row per vehicle
// UPDATED: Brand-aligned colours - #b3f243, #012619, #025940, #72A68E, #C5D9D0
// ✅ NEW: Collapsed by default with expand to show 2-3 items + "View All" button that opens side drawer

'use client'

import React, { useMemo, useEffect, useState } from 'react'
import { Check, ArrowDownLeft, Clock, User, MapPin, Truck, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SideDrawer } from '@/components/ui/SideDrawer'
import { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface IncomingTransfersSectionProps {
  vehicles: CheckedInVehicle[]
  currentBranchId: string
  onReceiveVehicle: (vehicleId: string) => Promise<boolean>
  loading?: boolean
  branches?: { slug: string; name: string }[]  // ✅ For branch name lookup
}

export function IncomingTransfersSection({
  vehicles,
  currentBranchId,
  onReceiveVehicle,
  loading = false,
  branches = []
}: IncomingTransfersSectionProps) {

  const t = useT()

  // ✅ NEW: State for collapse/expand and drawer
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [receivingVehicleId, setReceivingVehicleId] = useState<string | null>(null)

  // ✅ Helper to get branch name from branchId
  const getBranchName = (branchId?: string, sourceBranchName?: string | null) => {
    // First try stored sourceBranchName (new transfers)
    if (sourceBranchName) return sourceBranchName
    // Then look up from branches list (old transfers)
    if (branchId) {
      const branch = branches.find(b => b.slug === branchId)
      if (branch) return branch.name
    }
    // Fallback to branchId or Unknown
    return branchId || t('dashboard.incomingTransfers.unknownBranch')
  }
  
  // Filter for incoming transfers to current branch
  const incomingTransfers = useMemo(() => {
    logger.log('🔍 IncomingTransfersSection - Starting filter:', {
      totalVehicles: vehicles.length,
      currentBranchId,
      vehiclesWithTransferStatus: vehicles.filter(v => v.transferStatus).length
    })

    // Log all vehicles with transfer status for debugging
    vehicles.forEach(v => {
      if (v.transferStatus) {
        logger.log('📦 Vehicle with transfer status:', {
          registration: v.registration,
          branchId: v.branchId,
          targetBranchId: v.targetBranchId,
          transferStatus: v.transferStatus,
          isInTransit: v.transferStatus === 'in_transit',
          isTargetingThisBranch: v.targetBranchId === currentBranchId,
          isAtDifferentBranch: v.branchId !== currentBranchId,
          willMatch: v.transferStatus === 'in_transit' && 
                    v.targetBranchId === currentBranchId && 
                    v.branchId !== currentBranchId
        })
      }
    })

    const filtered = vehicles.filter(v => {
      const isInTransit = v.transferStatus === 'in_transit'
      const isTargetingThisBranch = v.targetBranchId === currentBranchId
      const isAtDifferentBranch = v.branchId !== currentBranchId
      
      const match = isInTransit && isTargetingThisBranch && isAtDifferentBranch
      
      if (match) {
        logger.log('✅ Found INCOMING transfer:', {
          registration: v.registration,
          from: v.branchId,
          to: v.targetBranchName,
          initiatedBy: v.transferInitiatedByName
        })
      }
      
      return match
    })

    logger.log('📊 Incoming transfers filter result:', {
      found: filtered.length,
      vehicles: filtered.map(v => v.registration)
    })

    return filtered
  }, [vehicles, currentBranchId])

  // Log when component renders
  useEffect(() => {
    logger.log('🎨 IncomingTransfersSection RENDERED:', {
      incomingCount: incomingTransfers.length,
      willShow: incomingTransfers.length > 0,
      currentBranchId
    })
  }, [incomingTransfers.length, currentBranchId])

  if (incomingTransfers.length === 0) {
    logger.log('❌ IncomingTransfersSection: No incoming transfers, returning null')
    return null
  }

  logger.log('✅ IncomingTransfersSection: RENDERING with', incomingTransfers.length, 'vehicles')

  // ✅ NEW: Handle receive with loading state
  const handleReceive = async (vehicleId: string) => {
    setReceivingVehicleId(vehicleId)
    try {
      await onReceiveVehicle(vehicleId)
    } finally {
      setReceivingVehicleId(null)
    }
  }

  // ✅ NEW: Show only first 2-3 items when expanded (not in drawer)
  const previewItems = incomingTransfers.slice(0, 3)
  const hasMoreItems = incomingTransfers.length > 3

  // ✅ NEW: Render a single vehicle card - reusable for both preview and drawer
  const renderVehicleCard = (vehicle: CheckedInVehicle, showReceiveButton = true) => (
    <div
      key={vehicle.id}
      className="group flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 rounded-lg hover:shadow-md transition-all"
      style={{
        background: 'linear-gradient(to right, rgba(114, 166, 142, 0.15), rgba(197, 217, 208, 0.1))',
        borderLeft: '4px solid #025940',
        borderTop: '1px solid rgba(114, 166, 142, 0.3)',
        borderRight: '1px solid rgba(114, 166, 142, 0.3)',
        borderBottom: '1px solid rgba(114, 166, 142, 0.3)'
      }}
    >
      {/* Registration - UK plate style */}
      <div className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-yellow-300 to-yellow-400 rounded border-2 border-black shadow-sm">
        <span className="text-sm font-black text-black tracking-wide">
          {vehicle.registration}
        </span>
      </div>
      
      {/* Make/Model */}
      <span className="px-2 py-0.5 bg-white dark:bg-gray-800 rounded text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
        {vehicle.make} {vehicle.model}
      </span>
      
      {/* From Branch */}
      <div className="hidden sm:flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
        <MapPin className="w-3.5 h-3.5" style={{ color: '#025940' }} />
        <span className="font-medium">{t('dashboard.incomingTransfers.fromLabel')}</span>
        <span className="text-gray-900 dark:text-white font-semibold">
          {getBranchName(vehicle.branchId, vehicle.sourceBranchName)}
        </span>
      </div>
      
      {/* Sent By */}
      {vehicle.transferInitiatedByName && (
        <div className="hidden md:flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <User className="w-3.5 h-3.5" style={{ color: '#72A68E' }} />
          <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[100px]">
            {vehicle.transferInitiatedByName}
          </span>
        </div>
      )}
      
      {/* Time */}
      {vehicle.transferInitiatedAt && (
        <div className="hidden lg:flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Clock className="w-3.5 h-3.5" style={{ color: '#72A68E' }} />
          <span>
            {new Date(vehicle.transferInitiatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      )}
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Action Button - BRAND COLOURS */}
      {showReceiveButton && (
        <Button
          size="sm"
          onClick={() => handleReceive(vehicle.id)}
          disabled={loading || receivingVehicleId === vehicle.id}
          className="text-white shadow font-semibold px-3 py-1.5 text-xs rounded-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#025940' }}
        >
          <Check className="w-3.5 h-3.5 mr-1" />
          {receivingVehicleId === vehicle.id ? t('dashboard.incomingTransfers.receivingButton') : t('dashboard.incomingTransfers.receiveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <>
      {/* Main Collapsible Section */}
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg mb-6 overflow-hidden"
        style={{ border: '2px solid #72A68E' }}
      >
        {/* Header - Always Visible & Clickable - BRAND COLOURS */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full relative px-4 sm:px-5 py-3 hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #025940 0%, #012619 100%)' }}
        >
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="p-2 backdrop-blur-sm rounded-lg"
                style={{ 
                  backgroundColor: 'rgba(179, 242, 67, 0.2)',
                  border: '1px solid rgba(179, 242, 67, 0.4)'
                }}
              >
                <ArrowDownLeft className="w-5 h-5" style={{ color: '#b3f243' }} />
              </div>
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {t('dashboard.incomingTransfers.title')}
                </h2>
                <p className="text-xs flex items-center gap-1" style={{ color: '#C5D9D0' }}>
                  <Truck className="w-3 h-3" />
                  {t('dashboard.incomingTransfers.vehiclesArriving', { count: incomingTransfers.length })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Count badge */}
              <div 
                className="flex items-center gap-1 px-3 py-1.5 rounded-full"
                style={{ 
                  backgroundColor: 'rgba(179, 242, 67, 0.15)',
                  border: '1px solid rgba(179, 242, 67, 0.3)'
                }}
              >
                <span className="font-bold text-sm" style={{ color: '#b3f243' }}>
                  {incomingTransfers.length}
                </span>
              </div>
              
              {/* Expand/Collapse Icon */}
              {isExpanded ? (
                <ChevronUp className="w-5 h-5" style={{ color: '#b3f243' }} />
              ) : (
                <ChevronDown className="w-5 h-5" style={{ color: '#b3f243' }} />
              )}
            </div>
          </div>
        </button>

        {/* Expandable Content */}
        {isExpanded && (
          <div className="p-3 sm:p-4">
            <div className="space-y-2">
              {/* Show first 2-3 items */}
              {previewItems.map(vehicle => renderVehicleCard(vehicle))}
              
              {/* "View All" button if more items exist */}
              {hasMoreItems && (
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className="w-full p-3 rounded-lg border-2 border-dashed hover:shadow-md transition-all flex items-center justify-center gap-2 group"
                  style={{
                    borderColor: '#72A68E',
                    background: 'linear-gradient(to right, rgba(114, 166, 142, 0.05), rgba(197, 217, 208, 0.05))'
                  }}
                >
                  <ExternalLink className="w-4 h-4 group-hover:scale-110 transition-transform" style={{ color: '#025940' }} />
                  <span className="font-semibold text-sm" style={{ color: '#025940' }}>
                    {t('dashboard.incomingTransfers.viewAll', { count: incomingTransfers.length })}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Side Drawer - Shows ALL transfers */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={t('dashboard.incomingTransfers.drawerTitle', { count: incomingTransfers.length })}
        width="lg"
      >
        <div className="space-y-3">
          {incomingTransfers.map(vehicle => (
            <div key={vehicle.id}>
              {renderVehicleCard(vehicle)}
            </div>
          ))}
        </div>
      </SideDrawer>
    </>
  )
}