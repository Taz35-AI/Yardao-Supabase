// src/components/features/deliveries-defleet/DeliveriesDefleetModal.tsx
// PREMIUM REDESIGN: Luxury dark-glass aesthetic — all logic, validation, state, handlers 100% preserved
'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/Input'
import {
  X,
  Truck,
  TruckIcon,
  Calendar,
  Car,
  Search,
  ChevronDown,
  Check,
  CheckCircle,
  ArrowRight,
  Sparkles,
  MapPin,
  Clock,
  Building2,
  FileText,
  StickyNote,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { DeliveryDefleelEntry, DeliveryOperationType } from './DeliveriesDefleetContent'
import { logger } from '@/lib/logger'
import { useRegLookup } from '@/hooks/useRegLookup'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleMatch {
  registration: string
  make: string
  model: string
  isFleetVehicle: boolean
}

interface DeliveriesDefleetModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date | null
  vehicles: any[]
  existingEntry?: DeliveryDefleelEntry | null
  onSubmit: (
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ) => Promise<boolean>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFLEET_REASONS = [
  'End of lease',
  'Sale',
  'Scrap',
  'Return to supplier',
  'Transfer to another location',
  'Accident write-off',
  'Other',
]

// ─── Design helpers ───────────────────────────────────────────────────────────

/** Shared input class — consistent look across all fields */
const inputCls = (hasError?: boolean) =>
  [
    'w-full px-4 py-3 text-sm font-medium rounded-xl border',
    'bg-white dark:bg-black/20',
    'text-gray-900 dark:text-white',
    'placeholder-gray-400 dark:placeholder-gray-500',
    'focus:outline-none focus:ring-2 transition-all duration-200',
    hasError
      ? 'border-red-400/70 focus:ring-red-400/30 focus:border-red-400'
      : 'border-gray-200 dark:border-white/10 focus:ring-[#b3f243]/30 focus:border-[#025940] dark:focus:border-[#72A68E]',
  ].join(' ')

/** Section card wrapping a group of fields */
function Section({
  icon: Icon,
  title,
  accent = false,
  children,
}: {
  icon: React.ElementType
  title: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl border overflow-hidden ${
      accent
        ? 'border-[#025940]/25 dark:border-[#72A68E]/15 bg-gradient-to-br from-[#025940]/5 to-[#72A68E]/5 dark:from-[#025940]/12 dark:to-[#012619]/25'
        : 'border-gray-100 dark:border-white/6 bg-white/70 dark:bg-white/2'
    }`}>
      <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${
        accent
          ? 'border-[#025940]/15 dark:border-[#72A68E]/10 bg-[#025940]/6 dark:bg-[#025940]/15'
          : 'border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-black/10'
      }`}>
        <div className={`p-1.5 rounded-lg ${accent ? 'bg-[#025940]/12 dark:bg-[#72A68E]/12' : 'bg-gray-200/60 dark:bg-white/8'}`}>
          <Icon className={`w-3.5 h-3.5 ${accent ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-500 dark:text-gray-400'}`} />
        </div>
        <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${
          accent ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-400 dark:text-gray-500'
        }`}>
          {title}
        </span>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

/** Field label */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-2">
      {children}
      {required && <span className="text-[#b3f243] ml-1">*</span>}
    </label>
  )
}

/** Inline error */
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-400 mt-1.5 font-semibold">{msg}</p>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeliveriesDefleetModal({
  isOpen,
  onClose,
  selectedDate,
  vehicles,
  existingEntry,
  onSubmit,
}: DeliveriesDefleetModalProps) {

  // ── Form state (ALL PRESERVED) ───────────────────────────────────────────────
  const [formData, setFormData] = useState({
    operationType:      'delivery' as DeliveryOperationType,
    date:               '',
    registration:       '',
    make:               '',
    model:              '',
    notes:              '',
    expectedArrival:    '',
    supplier:           '',
    isFleetVehicle:     false,
    defleetReason:      '',
    defleetDestination: '',
  })

  const [vehicleSearchResults, setVehicleSearchResults] = useState<VehicleMatch[]>([])
  const [showVehicleSearch, setShowVehicleSearch]       = useState(false)
  const [errors, setErrors]                             = useState<Record<string, string>>({})
  const [saving, setSaving]                             = useState(false)

  // ── Helpers (PRESERVED) ──────────────────────────────────────────────────────

  const formatDateForInput = (date: Date | string): string => {
    if (typeof date === 'string') return date
    return date.toISOString().split('T')[0]
  }

  // ── Reset form on open (PRESERVED) ───────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      if (existingEntry) {
        setFormData({
          operationType:      existingEntry.operationType,
          date:               existingEntry.date || formatDateForInput(selectedDate || new Date()),
          registration:       existingEntry.registration || '',
          make:               existingEntry.make || '',
          model:              existingEntry.model || '',
          notes:              existingEntry.notes || '',
          expectedArrival:    existingEntry.expectedArrival || '',
          supplier:           existingEntry.supplier || '',
          isFleetVehicle:     existingEntry.isFleetVehicle || false,
          defleetReason:      existingEntry.defleetReason || '',
          defleetDestination: existingEntry.defleetDestination || '',
        })
      } else {
        setFormData({
          operationType:      'delivery',
          date:               selectedDate ? formatDateForInput(selectedDate) : '',
          registration:       '',
          make:               '',
          model:              '',
          notes:              '',
          expectedArrival:    '',
          supplier:           '',
          isFleetVehicle:     false,
          defleetReason:      '',
          defleetDestination: '',
        })
      }
      setErrors({})
      setVehicleSearchResults([])
      setShowVehicleSearch(false)
    }
  }, [isOpen, existingEntry, selectedDate])

  // ── Smart vehicle search for defleet (PRESERVED) ─────────────────────────────

  useEffect(() => {
    if (
      formData.registration &&
      formData.registration.length >= 2 &&
      vehicles &&
      formData.operationType === 'defleet'
    ) {
      const matches = vehicles
        .filter(v => v?.registration?.toLowerCase().includes(formData.registration.toLowerCase()))
        .slice(0, 5)
        .map(v => ({
          registration:   v?.registration || '',
          make:           v?.make || '',
          model:          v?.model || '',
          isFleetVehicle: true,
        }))

      setVehicleSearchResults(matches)
      setShowVehicleSearch(matches.length > 0)

      const exactMatch = vehicles.find(
        v => v?.registration?.toLowerCase() === formData.registration.toLowerCase()
      )
      if (exactMatch) {
        setFormData(prev => ({
          ...prev,
          make:           exactMatch.make || '',
          model:          exactMatch.model || '',
          isFleetVehicle: true,
        }))
        setShowVehicleSearch(false)
      }
    } else {
      setVehicleSearchResults([])
      setShowVehicleSearch(false)
    }
  }, [formData.registration, vehicles, formData.operationType])

  // ── Input handlers (PRESERVED) ───────────────────────────────────────────────

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleVehicleSelect = (vehicle: VehicleMatch) => {
    setFormData(prev => ({
      ...prev,
      registration:   vehicle.registration,
      make:           vehicle.make,
      model:          vehicle.model,
      isFleetVehicle: vehicle.isFleetVehicle,
    }))
    setShowVehicleSearch(false)
  }

  // ── DVLA lookup (deliveries only — defleet auto-fills from the fleet) ────────

  const lookup = useRegLookup()
  const runLookup = async () => {
    const data = await lookup.run(formData.registration)
    if (!data) return
    setFormData(prev => ({
      ...prev,
      make:  data.make  || prev.make,
      model: data.model || prev.model,
    }))
    setErrors(prev => ({ ...prev, make: '', model: '' }))
  }

  // ── Validation (PRESERVED) ───────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.date?.trim())          newErrors.date         = 'Date is required'
    if (!formData.registration?.trim())  newErrors.registration = 'Registration is required'
    if (!formData.make?.trim())          newErrors.make         = 'Make is required'
    if (!formData.model?.trim())         newErrors.model        = 'Model is required'

    if (formData.operationType === 'delivery' && !formData.supplier?.trim())
      newErrors.supplier = 'Supplier is required for deliveries'

    if (formData.operationType === 'defleet') {
      if (!formData.defleetReason)
        newErrors.defleetReason = 'Defleet reason is required'
      if (!formData.defleetDestination?.trim())
        newErrors.defleetDestination = 'Defleet destination is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ── Submit (PRESERVED) ───────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    logger.log('🔄 Form submission started', { formData, selectedDate })

    if (!validateForm()) {
      logger.log('❌ Form validation failed')
      return
    }

    setSaving(true)
    try {
      const entryData = {
        date:               formData.date,
        operationType:      formData.operationType,
        registration:       formData.registration?.trim() || '',
        make:               formData.make?.trim() || '',
        model:              formData.model?.trim() || '',
        notes:              formData.notes?.trim() || '',
        expectedArrival:    formData.expectedArrival?.trim() || '',
        supplier:           formData.supplier?.trim() || '',
        isFleetVehicle:     formData.isFleetVehicle,
        defleetReason:      formData.defleetReason,
        defleetDestination: formData.defleetDestination?.trim() || '',
      }
      logger.log('📤 Submitting entry data:', entryData)
      const success = await onSubmit(entryData)
      logger.log('📨 Submission result:', success)
    } catch (error) {
      logger.error('💥 Error submitting entry:', error)
    } finally {
      setSaving(false)
    }
  }

  // ── Date display helper (PRESERVED) ──────────────────────────────────────────

  const getFormattedDate = () => {
    if (formData.date) {
      return new Date(formData.date + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    }
    return 'No date selected'
  }

  const isDelivery = formData.operationType === 'delivery'

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">

      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0 bg-[#012619]/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* ── Modal shell ── */}
      <div className="relative w-full max-w-xl mx-auto flex flex-col max-h-[95vh] sm:max-h-[90vh] rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(1,38,25,0.5)] border border-white/10 dark:border-[#72A68E]/10">

        {/* ════════════════════════════════════════════
            HEADER — deep forest / deep red gradient
        ════════════════════════════════════════════ */}
        <div className={`flex-shrink-0 relative overflow-hidden ${
          isDelivery
            ? 'bg-gradient-to-br from-[#011f12] via-[#025940] to-[#013d28]'
            : 'bg-gradient-to-br from-[#180606] via-[#6b1414] to-[#3b0808]'
        }`}>

          {/* Glow orb */}
          <div className={`absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-15 pointer-events-none ${
            isDelivery ? 'bg-[#b3f243]' : 'bg-red-300'
          }`} />

          {/* Subtle noise texture for depth */}
          <div
            className="absolute inset-0 opacity-[0.035] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="relative px-6 py-5 sm:px-8 sm:py-7">
            <div className="flex items-start justify-between gap-4">

              {/* Left: icon + title */}
              <div className="flex items-center gap-4 min-w-0">
                <div className={`p-3.5 rounded-2xl border-2 flex-shrink-0 ${
                  isDelivery
                    ? 'bg-[#b3f243]/12 border-[#b3f243]/25'
                    : 'bg-red-300/12 border-red-300/25'
                }`}>
                  {isDelivery
                    ? <Truck className="w-6 h-6 text-[#b3f243]" />
                    : <TruckIcon className="w-6 h-6 text-red-300" />
                  }
                </div>

                <div className="min-w-0">
                  {/* Mode pill */}
                  <span className={`inline-block text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full mb-2 ${
                    isDelivery
                      ? 'bg-[#b3f243]/15 text-[#b3f243]'
                      : 'bg-red-400/15 text-red-300'
                  }`}>
                    {existingEntry ? 'Editing entry' : 'New entry'}
                  </span>

                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                    {isDelivery ? 'Delivery' : 'Defleet'}
                  </h2>

                  <p className="text-sm text-white/45 mt-1.5 font-medium truncate">
                    {getFormattedDate()}
                  </p>
                </div>
              </div>

              {/* Close */}
              <button
                onClick={onClose}
                className="flex-shrink-0 mt-0.5 p-2 rounded-xl bg-white/8 hover:bg-white/16 border border-white/10 hover:border-white/20 text-white/50 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date-changed banner */}
            {selectedDate && formData.date && formData.date !== formatDateForInput(selectedDate) && (
              <div className="mt-5 flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-400/10 border border-amber-400/25 rounded-xl">
                <Calendar className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
                <span className="text-xs font-bold text-amber-300">
                  Date changed: {formatDateForInput(selectedDate)} → {formData.date}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════
            BODY
        ════════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0d1c13] p-4 sm:p-6 space-y-4">

          {/* ── Operation type cards ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Delivery */}
            <button
              type="button"
              onClick={() => handleInputChange('operationType', 'delivery')}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                isDelivery
                  ? 'border-[#025940] bg-gradient-to-br from-[#025940]/10 to-[#72A68E]/8 dark:from-[#025940]/20 dark:to-[#012619]/30 shadow-md shadow-[#025940]/10'
                  : 'border-gray-200 dark:border-white/8 bg-white dark:bg-white/2 hover:border-[#72A68E]/40 hover:bg-[#025940]/3'
              }`}
            >
              {isDelivery && (
                <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#025940] flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <Truck className={`w-5 h-5 mb-2.5 ${isDelivery ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-300 dark:text-gray-600'}`} />
              <p className={`text-sm font-black ${isDelivery ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-400 dark:text-gray-500'}`}>
                Delivery
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Arriving vehicles</p>
            </button>

            {/* Defleet */}
            <button
              type="button"
              onClick={() => handleInputChange('operationType', 'defleet')}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                !isDelivery
                  ? 'border-red-500 bg-gradient-to-br from-red-50 to-rose-50/60 dark:from-red-950/35 dark:to-red-900/15 shadow-md shadow-red-500/10'
                  : 'border-gray-200 dark:border-white/8 bg-white dark:bg-white/2 hover:border-red-300/40 hover:bg-red-50/30 dark:hover:bg-red-950/8'
              }`}
            >
              {!isDelivery && (
                <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <TruckIcon className={`w-5 h-5 mb-2.5 ${!isDelivery ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}`} />
              <p className={`text-sm font-black ${!isDelivery ? 'text-red-700 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                Defleet
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Leaving fleet</p>
            </button>
          </div>

          {/* ── Date ── */}
          <Section icon={Calendar} title="Date" accent>
            <div>
              <FieldLabel required>Scheduled date</FieldLabel>
              <input
                type="date"
                value={formData.date}
                onChange={e => handleInputChange('date', e.target.value)}
                className={inputCls(!!errors.date)}
              />
              <FieldError msg={errors.date} />
            </div>
          </Section>

          {/* ── Vehicle ── */}
          <Section icon={Car} title="Vehicle" accent>
            {/* Registration */}
            <div className="relative">
              <FieldLabel required>Registration</FieldLabel>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={formData.registration}
                    onChange={e => { handleInputChange('registration', e.target.value.toUpperCase()); lookup.reset() }}
                    placeholder="AB12 CDE"
                    className={`${inputCls(!!errors.registration)} font-black text-base tracking-[0.18em] uppercase`}
                  />
                  {formData.operationType === 'defleet' && formData.registration.length >= 2 && (
                    <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  )}
                </div>
                {/* DVLA lookup — only for deliveries (defleet auto-fills from the fleet search) */}
                {formData.operationType === 'delivery' && (
                  <button
                    type="button"
                    onClick={runLookup}
                    disabled={lookup.loading || !formData.registration.trim()}
                    title="Look up vehicle details from DVLA"
                    className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#025940] hover:bg-[#012619] text-white font-semibold px-3.5 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {lookup.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="hidden sm:inline">Look up</span>
                  </button>
                )}
              </div>
              <FieldError msg={errors.registration} />
              {formData.operationType === 'delivery' && lookup.error && (
                <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />{lookup.error}
                </p>
              )}
              {formData.operationType === 'delivery' && lookup.done && !lookup.error && (
                <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#025940] dark:text-[#72A68E]">
                  <Check className="w-3.5 h-3.5 flex-shrink-0 mt-px" />Details found and filled in.
                </p>
              )}

              {/* Vehicle search dropdown */}
              {showVehicleSearch && (
                <div className="absolute z-20 w-full mt-1.5 bg-white dark:bg-[#0d1c13] border border-gray-200 dark:border-[#72A68E]/20 rounded-2xl shadow-2xl shadow-black/25 overflow-hidden">
                  {vehicleSearchResults.map((vehicle, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleVehicleSelect(vehicle)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#025940]/8 dark:hover:bg-[#025940]/18 border-b border-gray-100 dark:border-white/5 last:border-0 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-[#025940]/10 dark:bg-[#025940]/20">
                          <Car className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
                        </div>
                        <div>
                          <span className="block text-sm font-black text-gray-900 dark:text-white tracking-wider">
                            {vehicle.registration}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {vehicle.make} {vehicle.model}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-[#025940] dark:text-[#72A68E] bg-[#025940]/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Fleet
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#025940] dark:group-hover:text-[#72A68E] transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Make + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Make</FieldLabel>
                <input
                  value={formData.make}
                  onChange={e => handleInputChange('make', e.target.value)}
                  placeholder="e.g. Ford"
                  className={inputCls(!!errors.make)}
                />
                <FieldError msg={errors.make} />
              </div>
              <div>
                <FieldLabel required>Model</FieldLabel>
                <input
                  value={formData.model}
                  onChange={e => handleInputChange('model', e.target.value)}
                  placeholder="e.g. Transit"
                  className={inputCls(!!errors.model)}
                />
                <FieldError msg={errors.model} />
              </div>
            </div>

            {/* Auto-fill notice */}
            {formData.isFleetVehicle && !isDelivery && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[#025940]/8 dark:bg-[#025940]/18 border border-[#025940]/18 dark:border-[#72A68E]/15 rounded-xl">
                <Sparkles className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
                <span className="text-xs font-semibold text-[#025940] dark:text-[#72A68E]">
                  Details auto-filled from your fleet inventory
                </span>
              </div>
            )}
          </Section>

          {/* ── Delivery details ── */}
          {isDelivery && (
            <Section icon={Building2} title="Delivery Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Expected Arrival</FieldLabel>
                  <div className="relative">
                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="time"
                      value={formData.expectedArrival}
                      onChange={e => handleInputChange('expectedArrival', e.target.value)}
                      className={`${inputCls()} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel required>Supplier</FieldLabel>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      value={formData.supplier}
                      onChange={e => handleInputChange('supplier', e.target.value)}
                      placeholder="e.g. Ford Dealership"
                      className={`${inputCls(!!errors.supplier)} pl-10`}
                    />
                  </div>
                  <FieldError msg={errors.supplier} />
                </div>
              </div>
            </Section>
          )}

          {/* ── Defleet details ── */}
          {!isDelivery && (
            <Section icon={FileText} title="Defleet Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Reason</FieldLabel>
                  <div className="relative">
                    <select
                      value={formData.defleetReason}
                      onChange={e => handleInputChange('defleetReason', e.target.value)}
                      className={`${inputCls(!!errors.defleetReason)} appearance-none pr-10`}
                    >
                      <option value="">Select reason...</option>
                      {DEFLEET_REASONS.map(reason => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <FieldError msg={errors.defleetReason} />
                </div>
                <div>
                  <FieldLabel required>Destination</FieldLabel>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      value={formData.defleetDestination}
                      onChange={e => handleInputChange('defleetDestination', e.target.value)}
                      placeholder="e.g. Auction, Scrapyard"
                      className={`${inputCls(!!errors.defleetDestination)} pl-10`}
                    />
                  </div>
                  <FieldError msg={errors.defleetDestination} />
                </div>
              </div>
            </Section>
          )}

          {/* ── Notes ── */}
          <Section icon={StickyNote} title="Notes">
            <textarea
              value={formData.notes}
              onChange={e => handleInputChange('notes', e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              className={`${inputCls()} resize-none`}
            />
          </Section>

        </div>

        {/* ════════════════════════════════════════════
            FOOTER
        ════════════════════════════════════════════ */}
        <div className="flex-shrink-0 bg-white dark:bg-[#0a1810] border-t border-gray-100 dark:border-white/6 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex gap-3">

            {/* Cancel */}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 px-5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-800 dark:hover:text-white transition-all disabled:opacity-50"
            >
              Cancel
            </button>

            {/* Submit */}
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={saving}
              className={`flex-[2] py-3 px-6 rounded-xl text-sm font-black flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 ${
                isDelivery
                  ? 'bg-[#b3f243] hover:bg-[#9fd93a] text-[#012619] shadow-lg shadow-[#b3f243]/20'
                  : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-900/30'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
                  <span>{existingEntry ? 'Updating...' : 'Creating...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {existingEntry
                      ? `Update ${isDelivery ? 'Delivery' : 'Defleet'}`
                      : `Create ${isDelivery ? 'Delivery' : 'Defleet'}`
                    }
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-60" />
                </>
              )}
            </button>

          </div>
        </div>

      </div>
    </div>
  )
}