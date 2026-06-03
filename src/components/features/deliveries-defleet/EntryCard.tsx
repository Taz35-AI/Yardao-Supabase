// src/components/features/deliveries-defleet/EntryCard.tsx
// DELIVERY complete → prompt to add to Fleet records (opens VehicleForm)
// DEFLEET complete  → prompt to remove from Fleet records (opens DefleetVehicleModal)
// All existing display logic preserved.
'use client'

import React, { useState } from 'react'
import {
  Edit, Trash2, Building, FileText,
  MapPin, MessageSquare, CheckCircle,
  Truck, TruckIcon, Check, ArrowRight, X,
  BookOpen, BookX,
} from 'lucide-react'
import { DeliveryDefleelEntry } from './DeliveriesDefleetContent'
import { VehicleForm } from '@/components/fleet/VehicleForm'
import { DefleetVehicleModal } from '@/components/common/Modals/DefleetVehicleModal'
import { useFleetData } from '@/hooks/useFleetData'
import { DefleetReason } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: DeliveryDefleelEntry
  onEdit: (entryId: string) => void
  onDelete: (entryId: string) => void
  onMarkComplete?: (entryId: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUniqueConditionNames(conditions: any[]): string[] {
  return [...new Set(conditions.map(c => c.name).filter(Boolean))]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EntryCard({ entry, onEdit, onDelete, onMarkComplete }: EntryCardProps) {
  const isDelivery  = entry.operationType === 'delivery'
  const isCompleted = !!entry.isCompleted

  // Fleet data — vehicles for lookup, conditions for VehicleForm,
  // addVehicle for writing new fleet record, deleteVehicle for defleeting
  const { vehicles: fleetVehicles, conditions, addVehicle, deleteVehicle } = useFleetData()

  // ── UI state ─────────────────────────────────────────────────────────────

  // Delivery flow
  const [showAddPrompt, setShowAddPrompt]       = useState(false)
  const [showVehicleForm, setShowVehicleForm]   = useState(false)
  const [addSuccess, setAddSuccess]             = useState(false)

  // Defleet flow
  const [showRemovePrompt, setShowRemovePrompt]     = useState(false)
  const [showDefleetModal, setShowDefleetModal]     = useState(false)
  const [removeSuccess, setRemoveSuccess]           = useState(false)

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleMarkComplete = async () => {
    if (!onMarkComplete) return
    await onMarkComplete(entry.id!)

    if (!isCompleted) {
      if (isDelivery) {
        setShowAddPrompt(true)    // Delivery → offer to add to fleet
      } else {
        setShowRemovePrompt(true) // Defleet  → offer to remove from fleet
      }
    }
  }

  // ── DELIVERY: add vehicle to fleet ───────────────────────────────────────

  const handleVehicleAdded = async (vehicleData: any) => {
    await addVehicle(vehicleData)
    setShowVehicleForm(false)
    setAddSuccess(true)
    setTimeout(() => setAddSuccess(false), 4000)
  }

  // ── DEFLEET: remove vehicle from fleet ───────────────────────────────────

  const handleDefleetConfirm = async (
    reason: DefleetReason,
    details: string,
    defleetDate: string
  ) => {
    // Find the vehicle in fleet records by registration
    const fleetVehicle = fleetVehicles.find(
      v => v.registration?.toUpperCase().replace(/\s+/g, '') ===
           entry.registration?.toUpperCase().replace(/\s+/g, '')
    )

    if (!fleetVehicle?.id) {
      // Vehicle not found in fleet — nothing to defleet, just close
      setShowDefleetModal(false)
      setRemoveSuccess(true)
      setTimeout(() => setRemoveSuccess(false), 4000)
      return
    }

    await deleteVehicle(fleetVehicle.id, fleetVehicle as any, reason, details, defleetDate)
    setShowDefleetModal(false)
    setRemoveSuccess(true)
    setTimeout(() => setRemoveSuccess(false), 4000)
  }

  // Build a minimal FleetVehicle-shaped object for DefleetVehicleModal
  const defleetVehicleShape = {
    id:           fleetVehicles.find(v =>
                    v.registration?.toUpperCase().replace(/\s+/g, '') ===
                    entry.registration?.toUpperCase().replace(/\s+/g, ''))?.id || '',
    registration: entry.registration || '',
    make:         entry.make  || '',
    model:        entry.model || '',
    colour:       '',
    size:         '',
  } as any

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className={`rounded-2xl border overflow-hidden transition-all ${
        isCompleted
          ? 'border-gray-100 dark:border-gray-800 opacity-75'
          : isDelivery
            ? 'border-[#C5D9D0] dark:border-[#025940]/40 bg-white dark:bg-gray-900'
            : 'border-red-100 dark:border-red-900/40 bg-white dark:bg-gray-900'
      }`}>

        {/* ── Header stripe ── */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: isCompleted
              ? 'linear-gradient(135deg, #374151 0%, #4b5563 100%)'
              : isDelivery
                ? 'linear-gradient(135deg, #012619 0%, #025940 100%)'
                : 'linear-gradient(135deg, #1c0505 0%, #7f1d1d 100%)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex-shrink-0 p-1.5 rounded-lg"
              style={{
                background: isCompleted
                  ? 'rgba(255,255,255,0.1)'
                  : isDelivery ? 'rgba(179,242,67,0.15)' : 'rgba(248,113,113,0.15)',
                border: `1px solid ${
                  isCompleted ? 'rgba(255,255,255,0.15)'
                  : isDelivery ? 'rgba(179,242,67,0.3)' : 'rgba(248,113,113,0.3)'
                }`,
              }}
            >
              {isDelivery
                ? <Truck     className="w-3.5 h-3.5" style={{ color: isCompleted ? 'rgba(255,255,255,0.4)' : '#b3f243' }} />
                : <TruckIcon className="w-3.5 h-3.5" style={{ color: isCompleted ? 'rgba(255,255,255,0.4)' : '#f87171' }} />
              }
            </div>

            <div className="min-w-0">
              <p className={`text-base font-black text-white tracking-widest leading-none ${isCompleted ? 'line-through opacity-60' : ''}`}>
                {entry.registration}
              </p>
              <p className={`text-xs mt-0.5 ${isCompleted ? 'text-white/30' : 'text-white/50'}`}>
                {entry.make} {entry.model}
                {entry.isFleetVehicle && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
                    Fleet
                  </span>
                )}
              </p>
            </div>
          </div>

          <span
            className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full"
            style={{
              background: isCompleted ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)',
              color: isCompleted ? '#86efac' : 'rgba(255,255,255,0.5)',
            }}
          >
            {isCompleted ? <><Check className="w-2.5 h-2.5" /> Done</> : 'Pending'}
          </span>
        </div>

        {/* ── Details ── */}
        <div className="px-4 py-3 space-y-2">
          {isDelivery && (
            <>
              {entry.supplier && (
                <div className="flex items-center gap-2 text-xs">
                  <Building className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">Supplier:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.supplier}</span>
                </div>
              )}
              {entry.expectedArrival && (
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">Expected:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.expectedArrival}</span>
                </div>
              )}
            </>
          )}

          {!isDelivery && (
            <>
              {entry.defleetReason && (
                <div className="flex items-center gap-2 text-xs">
                  <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">Reason:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.defleetReason}</span>
                </div>
              )}
              {entry.defleetDestination && (
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">Destination:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.defleetDestination}</span>
                </div>
              )}
            </>
          )}

          {entry.notes && (
            <div className="flex items-start gap-2 text-xs">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="italic text-gray-500 dark:text-gray-400">"{entry.notes}"</span>
            </div>
          )}

          {isCompleted && entry.completedAt && (
            <div className="flex items-center gap-2 text-xs text-[#025940] dark:text-[#72A68E] bg-[#025940]/5 dark:bg-[#025940]/15 px-3 py-2 rounded-xl mt-1">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Completed {new Date(entry.completedAt).toLocaleString('en-GB')}</span>
            </div>
          )}

          {/* Success banners */}
          {addSuccess && (
            <div className="flex items-center gap-2 text-xs font-bold text-[#012619] bg-[#b3f243] px-3 py-2 rounded-xl">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {entry.registration} added to Fleet records!
            </div>
          )}
          {removeSuccess && (
            <div className="flex items-center gap-2 text-xs font-bold text-white bg-red-600 px-3 py-2 rounded-xl">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {entry.registration} removed from Fleet records!
            </div>
          )}
        </div>

        {/* ── DELIVERY prompt: add to fleet ── */}
        {showAddPrompt && (
          <Prompt
            icon={<BookOpen className="w-4 h-4" style={{ color: '#b3f243' }} />}
            iconBg="rgba(179,242,67,0.15)"
            iconBorder="rgba(179,242,67,0.3)"
            gradient="linear-gradient(135deg, #012619 0%, #025940 100%)"
            border="rgba(179,242,67,0.25)"
            title="Add to Fleet Records?"
            body={<><span className="font-bold text-white">{entry.registration}</span>{(entry.make || entry.model) ? ` · ${entry.make} ${entry.model}` : ''} has arrived. Add it to your fleet bible with details pre-filled?</>}
            confirmLabel="Yes, Add to Fleet"
            confirmStyle={{ background: '#b3f243', color: '#012619' }}
            confirmHover="#9fd93a"
            onConfirm={() => { setShowAddPrompt(false); setShowVehicleForm(true) }}
            onDismiss={() => setShowAddPrompt(false)}
          />
        )}

        {/* ── DEFLEET prompt: remove from fleet ── */}
        {showRemovePrompt && (
          <Prompt
            icon={<BookX className="w-4 h-4" style={{ color: '#f87171' }} />}
            iconBg="rgba(248,113,113,0.15)"
            iconBorder="rgba(248,113,113,0.3)"
            gradient="linear-gradient(135deg, #1c0505 0%, #7f1d1d 100%)"
            border="rgba(248,113,113,0.25)"
            title="Remove from Fleet Records?"
            body={<><span className="font-bold text-white">{entry.registration}</span>{(entry.make || entry.model) ? ` · ${entry.make} ${entry.model}` : ''} has been defleeted. Remove it from your fleet records?</>}
            confirmLabel="Yes, Remove from Fleet"
            confirmStyle={{ background: '#dc2626', color: '#ffffff' }}
            confirmHover="#b91c1c"
            onConfirm={() => { setShowRemovePrompt(false); setShowDefleetModal(true) }}
            onDismiss={() => setShowRemovePrompt(false)}
          />
        )}

        {/* ── Action row ── */}
        <div className="px-4 py-3 border-t border-gray-50 dark:border-gray-800 flex items-center gap-2">
          {onMarkComplete && !isCompleted && (
            <button
              onClick={handleMarkComplete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-[#025940]/8 dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] border border-[#025940]/20 dark:border-[#72A68E]/30 hover:bg-[#025940]/15"
            >
              <CheckCircle className="w-3 h-3" /> Complete
            </button>
          )}

          <button
            onClick={() => onEdit(entry.id!)}
            disabled={isCompleted}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Edit className="w-3 h-3" /> Edit
          </button>

          <button
            onClick={() => onDelete(entry.id!)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-500 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>

      </div>

      {/* ── VehicleForm modal (delivery flow) ── */}
      {showVehicleForm && (
        <VehicleForm
          onAdd={handleVehicleAdded}
          onCancel={() => setShowVehicleForm(false)}
          conditions={getUniqueConditionNames(conditions)}
          existingVehicles={fleetVehicles}
          prefillData={{
            registration: entry.registration || '',
            make:         entry.make  || '',
            model:        entry.model || '',
          }}
        />
      )}

      {/* ── DefleetVehicleModal (defleet flow) ── */}
      {showDefleetModal && (
        <DefleetVehicleModal
          isOpen={showDefleetModal}
          onClose={() => setShowDefleetModal(false)}
          onConfirm={handleDefleetConfirm}
          vehicle={defleetVehicleShape}
        />
      )}
    </>
  )
}

// ─── Shared prompt sub-component ──────────────────────────────────────────────

function Prompt({
  icon, iconBg, iconBorder, gradient, border,
  title, body, confirmLabel, confirmStyle, confirmHover,
  onConfirm, onDismiss,
}: {
  icon: React.ReactNode
  iconBg: string
  iconBorder: string
  gradient: string
  border: string
  title: string
  body: React.ReactNode
  confirmLabel: string
  confirmStyle: React.CSSProperties
  confirmHover: string
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="mx-4 mb-3 rounded-2xl overflow-hidden" style={{ background: gradient, border: `1px solid ${border}` }}>
      <div className="px-4 py-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 p-2 rounded-xl mt-0.5" style={{ background: iconBg, border: `1px solid ${iconBorder}` }}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">{title}</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{body}</p>
          </div>
          <button onClick={onDismiss} style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={onDismiss}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            Not now
          </button>
          <button onClick={onConfirm}
            className="flex-[2] py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all"
            style={confirmStyle}
            onMouseEnter={e => (e.currentTarget.style.background = confirmHover)}
            onMouseLeave={e => (e.currentTarget.style.background = confirmStyle.background as string)}
          >
            {title.startsWith('Add') ? <BookOpen className="w-3.5 h-3.5" /> : <BookX className="w-3.5 h-3.5" />}
            {confirmLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}