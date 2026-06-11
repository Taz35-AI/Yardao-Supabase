// src/components/features/deliveries-defleet/NewEntryForm.tsx
// PREMIUM REDESIGN — all logic, props, handlers 100% preserved. CSS only.
'use client'

import React from 'react'
import { VehicleSearchInput } from './VehicleSearchInput'
import {
  Save, Calendar, Package, RouteOff, Car,
  Clock, Building, FileText, MapPin, MessageSquare,
  Truck, TruckIcon, Check, X, Search, Loader2, AlertCircle,
} from 'lucide-react'
import { DeliveryOperationType } from './DeliveriesDefleetContent'
import { useRegLookup } from '@/hooks/useRegLookup'

// ─── Types (PRESERVED) ───────────────────────────────────────────────────────

interface NewEntryData {
  operationType: DeliveryOperationType
  date: string
  registration: string
  make: string
  model: string
  notes: string
  expectedArrival: string
  supplier: string
  isFleetVehicle: boolean
  defleetReason: string
  defleetDestination: string
}

interface NewEntryFormProps {
  newEntryData: NewEntryData
  vehicles: any[]
  onDataChange: (field: keyof NewEntryData, value: any) => void
  onVehicleSelect: (vehicle: any) => void
  onSubmit: () => void
  onCancel: () => void
}

// ─── Design helpers ───────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#025940] focus:border-[#025940] transition-colors'

const Label = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
    {children}{req && <span className="text-[#b3f243] ml-0.5">*</span>}
  </p>
)

// ─── Component ────────────────────────────────────────────────────────────────

export function NewEntryForm({
  newEntryData,
  vehicles,
  onDataChange,
  onVehicleSelect,
  onSubmit,
  onCancel,
}: NewEntryFormProps) {
  const isDelivery = newEntryData.operationType === 'delivery'

  // DVLA lookup — delivery entries are new vehicles, so make/model can be
  // pulled from the registration (same shared hook as the fleet edit modal).
  const lookup = useRegLookup()
  const runLookup = async () => {
    const data = await lookup.run(newEntryData.registration)
    if (!data) return
    if (data.make) onDataChange('make', data.make)
    if (data.model) onDataChange('model', data.model)
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-lg mb-4">

      {/* ── Form header ── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: isDelivery
            ? 'linear-gradient(135deg, #012619 0%, #025940 100%)'
            : 'linear-gradient(135deg, #1c0505 0%, #7f1d1d 100%)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="p-1.5 rounded-lg"
            style={{
              background: isDelivery ? 'rgba(179,242,67,0.15)' : 'rgba(248,113,113,0.15)',
              border: `1px solid ${isDelivery ? 'rgba(179,242,67,0.3)' : 'rgba(248,113,113,0.3)'}`,
            }}
          >
            {isDelivery
              ? <Truck className="w-3.5 h-3.5" style={{ color: '#b3f243' }} />
              : <TruckIcon className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
            }
          </div>
          <span className="text-sm font-black text-white">New Entry</span>
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{
              background: isDelivery ? 'rgba(179,242,67,0.15)' : 'rgba(248,113,113,0.15)',
              color: isDelivery ? '#b3f243' : '#fca5a5',
            }}
          >
            {isDelivery ? 'Delivery' : 'Defleet'}
          </span>
        </div>

        {/* Cancel X */}
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Form body — white bg, divided sections ── */}
      <div className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">

        {/* Operation type toggle */}
        <div className="px-4 py-3">
          <Label>Type</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onDataChange('operationType', 'delivery')}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-left transition-all ${
                isDelivery
                  ? 'border-[#025940] bg-[#025940]/5 dark:bg-[#025940]/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              {isDelivery && (
                <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-[#025940] flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </span>
              )}
              <Package className={`w-4 h-4 flex-shrink-0 ${isDelivery ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-300 dark:text-gray-600'}`} />
              <span className={`text-xs font-black ${isDelivery ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-400'}`}>
                Delivery
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDataChange('operationType', 'defleet')}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-left transition-all ${
                !isDelivery
                  ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              {!isDelivery && (
                <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </span>
              )}
              <RouteOff className={`w-4 h-4 flex-shrink-0 ${!isDelivery ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}`} />
              <span className={`text-xs font-black ${!isDelivery ? 'text-red-700 dark:text-red-400' : 'text-gray-400'}`}>
                Defleet
              </span>
            </button>
          </div>
        </div>

        {/* Date */}
        <div className="px-4 py-3">
          <Label req>Date</Label>
          <input
            type="date"
            value={newEntryData.date}
            onChange={e => onDataChange('date', e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Registration */}
        <div className="px-4 py-3">
          <Label req>Registration</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <VehicleSearchInput
                value={newEntryData.registration}
                onChange={value => { onDataChange('registration', value); lookup.reset() }}
                onVehicleSelect={onVehicleSelect}
                vehicles={vehicles}
                operationType={newEntryData.operationType}
                placeholder={isDelivery ? 'New vehicle reg…' : 'Search fleet…'}
              />
            </div>
            {/* DVLA lookup — only for deliveries (defleet auto-fills from the fleet search) */}
            {isDelivery && (
              <button
                type="button"
                onClick={runLookup}
                disabled={lookup.loading || !newEntryData.registration.trim()}
                title="Look up vehicle details from DVLA"
                className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#025940] hover:bg-[#012619] text-white font-semibold px-3.5 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lookup.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="hidden sm:inline">Look up</span>
              </button>
            )}
          </div>
          {isDelivery && lookup.error && lookup.notFound && (
            <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
              No DVLA record yet — brand-new vehicles take a while to appear. Enter make and model manually.
            </p>
          )}
          {isDelivery && lookup.error && !lookup.notFound && (
            <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-red-600 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />{lookup.error}
            </p>
          )}
          {isDelivery && lookup.done && !lookup.error && (
            <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#025940] dark:text-[#72A68E]">
              <Check className="w-3.5 h-3.5 flex-shrink-0 mt-px" />Details found and filled in.
            </p>
          )}
        </div>

        {/* Make + Model */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Make</Label>
              <input
                value={newEntryData.make}
                onChange={e => onDataChange('make', e.target.value)}
                placeholder="e.g. Ford"
                className={inputCls}
              />
            </div>
            <div>
              <Label>Model</Label>
              <input
                value={newEntryData.model}
                onChange={e => onDataChange('model', e.target.value)}
                placeholder="e.g. Transit"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Delivery fields */}
        {isDelivery && (
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Arrival Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="time"
                    value={newEntryData.expectedArrival}
                    onChange={e => onDataChange('expectedArrival', e.target.value)}
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
              <div>
                <Label>Supplier</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    value={newEntryData.supplier}
                    onChange={e => onDataChange('supplier', e.target.value)}
                    placeholder="Supplier…"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Defleet fields */}
        {!isDelivery && (
          <div className="px-4 py-3 space-y-3">
            {/* Fleet vehicle checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newEntryData.isFleetVehicle}
                onChange={e => onDataChange('isFleetVehicle', e.target.checked)}
                disabled={vehicles?.some(v => v.registration === newEntryData.registration)}
                className="rounded border-gray-300 accent-[#025940]"
              />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                Fleet Vehicle
                {vehicles?.some(v => v.registration === newEntryData.registration) && (
                  <span className="ml-2 text-[#025940] dark:text-[#72A68E] font-bold">(Auto-detected)</span>
                )}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Reason</Label>
                <select
                  value={newEntryData.defleetReason}
                  onChange={e => onDataChange('defleetReason', e.target.value)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">Select…</option>
                  <option value="end-of-lease">End of Lease</option>
                  <option value="sale">Sale</option>
                  <option value="accident">Accident / Write-off</option>
                  <option value="maintenance">Maintenance Issues</option>
                  <option value="upgrade">Fleet Upgrade</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label>Destination</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    value={newEntryData.defleetDestination}
                    onChange={e => onDataChange('defleetDestination', e.target.value)}
                    placeholder="Auction…"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="px-4 py-3">
          <Label>Notes</Label>
          <textarea
            value={newEntryData.notes}
            onChange={e => onDataChange('notes', e.target.value)}
            placeholder="Additional notes…"
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-white transition-all"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onSubmit}
          className="flex-[2] py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-lg transition-all"
          style={{
            background: isDelivery ? '#b3f243' : '#dc2626',
            color: isDelivery ? '#012619' : '#ffffff',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDelivery ? '#9fd93a' : '#b91c1c')}
          onMouseLeave={e => (e.currentTarget.style.background = isDelivery ? '#b3f243' : '#dc2626')}
        >
          <Save className="w-4 h-4" />
          <span>Create {isDelivery ? 'Delivery' : 'Defleet'}</span>
        </button>
      </div>

    </div>
  )
}