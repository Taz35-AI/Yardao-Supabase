// src/components/fleet/VehicleForm.tsx
// Premium 3-step wizard. ALL fields preserved; all logic still lives in
// useVehicleForm — formData is held in the hook so unmounting inactive
// steps never loses data. No i18n keys removed; new wizard keys added.
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Plus, Car, AlertCircle, AlertTriangle, Check, ArrowLeft, ArrowRight, Shield, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useVehicleForm } from '@/hooks/fleet/useVehicleForm'
import { InsuranceToggle } from '@/components/common/ui/InsuranceToggle'
import { VehicleDiagramSelector } from '@/components/common/DamageMapper/VehicleDiagramSelector'
import { getUniqueSizes } from '@/lib/fleetUtils'
import { computeDefleetDue } from '@/lib/utils/defleetDue'
import { useVehicleSuppliers } from '@/hooks/fleet/useVehicleSuppliers'
import { useT } from '@/lib/i18n'

// Shared field styling — solid, consistent, brand-aligned
const inputCls =
  'w-full px-3.5 py-3 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm transition-colors placeholder-[#c8d5ce]'
const labelCls =
  'block text-xs font-semibold text-[#4a5e54] dark:text-gray-300 mb-1.5'

// ─── SizeInput — type freely or pick from existing fleet sizes ────────────────

function SizeInput({ value, onChange, existingSizes }: { value: string; onChange: (v: string) => void; existingSizes: string[] }) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const [filtered, setFiltered] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = value.length > 0
      ? existingSizes.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())
      : existingSizes
    setFiltered(list)
  }, [value, existingSizes])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); setIsOpen(true) }}
        onFocus={() => { if (filtered.length > 0) setIsOpen(true) }}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false) }}
        placeholder={t('fleet.form.sizePlaceholder')}
        required
        className={`${inputCls} pr-8`}
      />
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9e94] hover:text-[#025940]"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && filtered.length > 0 && (
        <div ref={dropdownRef} className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-600 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((size, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(size); setIsOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-[#f0f4f2] dark:hover:bg-gray-700 text-[#012619] dark:text-white text-sm border-b border-[#f0f4f2] dark:border-gray-700 last:border-0"
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface VehicleFormProps {
  onAdd: (vehicle: any) => Promise<void>
  onCancel?: () => void
  conditions: string[]
  existingVehicles?: any[]
  prefillData?: {          // ← pre-fills reg/make/model from a completed delivery
    registration: string
    make: string
    model: string
  }
}

const TOTAL_STEPS = 3

export function VehicleForm({ onAdd, onCancel, conditions, existingVehicles = [], prefillData }: VehicleFormProps) {
  const t = useT()
  // All data logic lives in the hook — unchanged
  const {
    formData,
    loading,
    submitError,
    duplicateError,
    lookupLoading,
    lookupError,
    lookupDone,
    lookupRecall,
    lookupVehicle,
    contracts,
    contractsLoading,
    handleChange,
    handleInsuranceToggle,
    handleSubmit,
    formatDateForDisplay,
    getContractBadgeStyle
  } = useVehicleForm({ conditions, existingVehicles, onAdd, prefillData })

  const vehicleSuppliers = useVehicleSuppliers()

  const [step, setStep] = useState(1)

  const steps = [
    { n: 1, title: t('fleet.form.wizardStep1Title'), desc: t('fleet.form.wizardStep1Desc') },
    { n: 2, title: t('fleet.form.wizardStep2Title'), desc: t('fleet.form.wizardStep2Desc') },
    { n: 3, title: t('fleet.form.wizardStep3Title'), desc: t('fleet.form.wizardStep3Desc') },
  ]

  // Light per-step guidance — the hook still does final validation on submit
  const step1Valid = !!formData.registration && !!formData.make && !!formData.model && !duplicateError
  const step2Valid = !!formData.size && !!formData.condition
  const canContinue = step === 1 ? step1Valid : step === 2 ? step2Valid : true
  const submitDisabled = loading || !formData.registration || duplicateError

  const goNext = () => setStep(s => Math.min(TOTAL_STEPS, s + 1))
  const goBack = () => setStep(s => Math.max(1, s - 1))

  // Never auto-submit. The form only saves when the user deliberately
  // clicks "Add Vehicle" on the last step — this stops Enter, or a
  // mis-tap on the Continue button as it swaps to Add Vehicle, from
  // saving a half-filled vehicle and closing the modal.
  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  const submitNow = (e: React.MouseEvent) => {
    handleSubmit(e as unknown as React.FormEvent)
  }

  const currentStep = steps[step - 1]

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 z-50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col md:flex-row border border-[#e2e8e5] dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Desktop stepper rail ── */}
        <aside className="hidden md:flex md:flex-col w-72 flex-shrink-0 bg-[#012619] text-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 bg-[#b3f243]/10 border border-[#b3f243]/30 rounded-xl p-2">
              <Car className="w-5 h-5 text-[#b3f243]" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">{t('fleet.form.headerTitle')}</p>
              <p className="text-[#72A68E] text-xs mt-0.5">{t('fleet.form.headerSubtitle')}</p>
            </div>
          </div>

          <nav className="mt-8 flex-1" aria-label={t('fleet.form.headerTitle')}>
            {steps.map((s, i) => {
              const isActive = s.n === step
              const isDone = s.n < step
              return (
                <div key={s.n} className="relative">
                  {i < steps.length - 1 && (
                    <span className={`absolute left-[18px] top-9 w-px h-[calc(100%-1rem)] ${isDone ? 'bg-[#b3f243]/60' : 'bg-white/15'}`} />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(s.n)}
                    className="w-full flex items-start gap-3 text-left py-2.5 group"
                  >
                    <span
                      className={`flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors ${
                        isDone
                          ? 'bg-[#b3f243] border-[#b3f243] text-[#012619]'
                          : isActive
                          ? 'bg-[#b3f243]/15 border-[#b3f243] text-[#b3f243]'
                          : 'border-white/25 text-white/40 group-hover:border-white/50'
                      }`}
                    >
                      {isDone ? <Check className="w-4 h-4" /> : s.n}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className={`block text-sm font-semibold ${isActive || isDone ? 'text-white' : 'text-white/45'}`}>
                        {s.title}
                      </span>
                      <span className={`block text-[11px] mt-0.5 ${isActive ? 'text-[#72A68E]' : 'text-white/30'}`}>
                        {s.desc}
                      </span>
                    </span>
                  </button>
                </div>
              )
            })}
          </nav>

          <p className="text-[11px] text-white/40 mt-4">{t('fleet.form.wizardRequiredHint')}</p>
        </aside>

        {/* ── Content column ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Mobile header + progress */}
          <div className="md:hidden flex-shrink-0 bg-[#012619] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0 bg-[#b3f243]/10 border border-[#b3f243]/30 rounded-lg p-1.5">
                  <Car className="w-4 h-4 text-[#b3f243]" />
                </div>
                <p className="text-white font-semibold text-sm truncate">{t('fleet.form.headerTitle')}</p>
              </div>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              {steps.map(s => (
                <span
                  key={s.n}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    s.n < step ? 'bg-[#b3f243]' : s.n === step ? 'bg-[#b3f243]/70' : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
            <p className="text-[#72A68E] text-[11px] mt-2 font-medium">
              {t('fleet.form.wizardStepCounter', { current: step, total: TOTAL_STEPS })} · {currentStep.title}
            </p>
          </div>

          {/* Desktop close button */}
          {onCancel && (
            <div className="hidden md:flex justify-end px-6 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 rounded-lg text-[#8a9e94] hover:text-[#012619] dark:hover:text-white hover:bg-[#f0f4f2] dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Alerts (errors / duplicate warning) */}
          {(submitError || duplicateError) && (
            <div className="flex-shrink-0 px-5 sm:px-7 pt-4">
              {submitError && (
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-800 dark:text-red-200">{submitError}</p>
                    {submitError.includes('already exists') && (
                      <p className="text-[10px] text-red-700 dark:text-red-300 mt-0.5">{t('fleet.form.checkRegTypos')}</p>
                    )}
                  </div>
                </div>
              )}
              {duplicateError && !submitError && (
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-800 dark:text-red-200">
                      {t('fleet.form.duplicateRegError', { registration: formData.registration })}
                    </p>
                    <p className="text-[10px] text-red-700 dark:text-red-300 mt-0.5">{t('fleet.form.uniqueRegHint')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={onFormSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 sm:py-6">

              {/* Step heading */}
              <div className="mb-5">
                <h2 className="text-lg font-bold text-[#012619] dark:text-white">{currentStep.title}</h2>
                <p className="text-xs text-[#8a9e94] mt-0.5">{currentStep.desc}</p>
              </div>

              {/* ── Step 1: Vehicle Identity ── */}
              {step === 1 && (
                <div className="space-y-4 max-w-xl">
                  <div>
                    <label className={`${duplicateError ? 'text-red-500' : ''} block text-xs font-semibold mb-1.5 ${duplicateError ? '' : 'text-[#4a5e54] dark:text-gray-300'}`}>
                      {t('fleet.form.labelRegistration')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={formData.registration}
                        onChange={e => handleChange('registration', e.target.value.toUpperCase())}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (!lookupLoading) lookupVehicle()
                          }
                        }}
                        placeholder={t('fleet.form.regPlaceholder')}
                        required
                        autoFocus
                        className={`flex-1 px-3.5 py-3 text-sm border rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 shadow-sm transition-colors ${
                          duplicateError
                            ? 'border-red-400 focus:ring-red-500/30 focus:border-red-400'
                            : 'border-[#e2e8e5] dark:border-gray-600 focus:ring-[#025940]/30 focus:border-[#025940]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={lookupVehicle}
                        disabled={lookupLoading || !formData.registration.trim()}
                        title={t('fleet.form.lookupTitle')}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#025940] hover:bg-[#012619] text-white font-semibold px-4 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {lookupLoading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Search className="w-4 h-4" />}
                        <span className="hidden sm:inline">{t('fleet.form.lookupButton')}</span>
                      </button>
                    </div>

                    {/* Lookup feedback */}
                    {lookupError && (
                      <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        {lookupError}
                      </p>
                    )}
                    {lookupDone && !lookupError && (
                      <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#025940] dark:text-[#b3f243]">
                        <Check className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        {t('fleet.form.lookupSuccess')}
                      </p>
                    )}
                    {lookupRecall && (
                      <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold text-red-800 dark:text-red-200">{t('fleet.form.lookupRecall')}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('fleet.form.labelMake')}</label>
                      <input
                        value={formData.make}
                        onChange={e => handleChange('make', e.target.value)}
                        placeholder={t('fleet.form.makePlaceholder')}
                        required
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('fleet.form.labelModel')}</label>
                      <input
                        value={formData.model}
                        onChange={e => handleChange('model', e.target.value)}
                        placeholder={t('fleet.form.modelPlaceholder')}
                        required
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>{t('fleet.form.labelColour')}</label>
                    <input
                      value={formData.colour}
                      onChange={e => handleChange('colour', e.target.value)}
                      placeholder={t('fleet.form.colourPlaceholder')}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              {/* ── Step 2: Acquisition & Compliance ── */}
              {step === 2 && (
                <div className="space-y-4 max-w-xl">
                  <div>
                    <label className={labelCls}>{t('fleet.form.labelDateAcquired')}</label>
                    <input
                      type="date"
                      value={formData.dateAcquired}
                      onChange={e => handleChange('dateAcquired', e.target.value)}
                      className={inputCls}
                    />
                    {formData.dateAcquired && (
                      <p className="text-[10px] text-[#72A68E] mt-1">
                        {formatDateForDisplay(formData.dateAcquired)}
                      </p>
                    )}
                  </div>

                  {/* Supplier + rental term → drives the fleet defleet-due flag */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('fleet.form.labelSupplier')}</label>
                      <input
                        list="fleet-vehicle-suppliers"
                        value={formData.supplier}
                        onChange={e => handleChange('supplier', e.target.value)}
                        className={inputCls}
                        placeholder={t('fleet.form.supplierPlaceholder')}
                      />
                      <datalist id="fleet-vehicle-suppliers">
                        {vehicleSuppliers.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>{t('fleet.form.labelRentalTerm')}</label>
                      <input
                        type="number" min="0" step="1"
                        value={formData.rentalTermMonths}
                        onChange={e => handleChange('rentalTermMonths', e.target.value)}
                        className={inputCls}
                        placeholder={t('fleet.form.rentalTermPlaceholder')}
                      />
                    </div>
                  </div>
                  {(() => {
                    const due = computeDefleetDue(formData.dateAcquired, formData.rentalTermMonths ? Number(formData.rentalTermMonths) : null)
                    return due.dueDate ? (
                      <p className="text-[11px] font-medium text-[#025940] dark:text-[#72A68E] -mt-2">
                        {t('fleet.form.defleetDueHint', { date: formatDateForDisplay(due.dueDate) })}
                      </p>
                    ) : null
                  })()}

                  <div>
                    <label className={labelCls}>{t('fleet.form.labelSize')}</label>
                    <SizeInput
                      value={formData.size}
                      onChange={v => handleChange('size', v)}
                      existingSizes={getUniqueSizes(existingVehicles)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('fleet.form.labelMotExpiry')}</label>
                      <input
                        type="date"
                        value={formData.motExpiry}
                        onChange={e => handleChange('motExpiry', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('fleet.form.labelTaxExpiry')}</label>
                      <input
                        type="date"
                        value={formData.taxExpiry}
                        onChange={e => handleChange('taxExpiry', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>{t('fleet.form.labelCondition')}</label>
                    <select
                      value={formData.condition}
                      onChange={e => handleChange('condition', e.target.value)}
                      required
                      className={inputCls}
                    >
                      <option value="">{t('fleet.form.conditionPlaceholderOption')}</option>
                      {conditions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Step 3: Assignment & Notes ── */}
              {step === 3 && (
                <div className="space-y-4 max-w-xl">
                  <div>
                    <label className={labelCls}>{t('fleet.form.labelContractAssignment')}</label>
                    {contractsLoading ? (
                      <div className="flex items-center px-3.5 py-3 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#8a9e94]">
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-[#025940] mr-2" />
                        {t('fleet.form.loadingContracts')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <select
                          value={formData.contract}
                          onChange={e => handleChange('contract', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">{t('fleet.form.noContractOption')}</option>
                          {contracts.map(c => (
                            <option key={c.id} value={c.name}>
                              {c.name}{c.isDefault ? t('fleet.form.contractDefaultSuffix') : ''}
                            </option>
                          ))}
                        </select>

                        {formData.contract && formData.contractColor && (
                          <div className="flex items-center gap-2.5 bg-[#f8faf9] dark:bg-gray-800 rounded-xl px-3 py-2 border border-[#e2e8e5] dark:border-gray-700">
                            <div
                              className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                              style={{ backgroundColor: formData.contractColor }}
                            />
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={getContractBadgeStyle(formData.contractColor)}
                            >
                              {formData.contract}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Shield className="w-3.5 h-3.5 text-[#025940]" />
                      <span className={`${labelCls} mb-0`}>{t('fleet.editModal.insuranceStatusLabel')}</span>
                    </div>
                    <div className="bg-[#f8faf9] dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700 space-y-2">
                      <InsuranceToggle
                        insuranceStatus={formData.insuranceStatus}
                        onToggle={handleInsuranceToggle}
                        disabled={loading}
                        size="md"
                        showLabel={true}
                        vehicleRegistration={formData.registration || undefined}
                      />
                      <p className="text-[10px] text-[#8a9e94] leading-relaxed">
                        {t('fleet.editModal.insuranceHint')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>{t('fleet.form.labelVehicleDiagram')}</label>
                    <div className="bg-[#f8faf9] dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700">
                      <VehicleDiagramSelector
                        value={formData.vehicleDiagramType || ''}
                        onChange={value => handleChange('vehicleDiagramType', value)}
                      />
                      <p className="mt-2 text-[10px] text-[#8a9e94]">
                        {t('fleet.form.diagramHint')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>{t('fleet.form.labelComments')}</label>
                    <textarea
                      value={formData.comments}
                      onChange={e => handleChange('comments', e.target.value)}
                      placeholder={t('fleet.form.commentsPlaceholder')}
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Action bar ── */}
            <div className="flex-shrink-0 bg-[#f8faf9] dark:bg-gray-800/80 border-t border-[#e2e8e5] dark:border-gray-700 px-5 sm:px-7 py-3.5">
              <div className="flex items-center gap-2 sm:gap-3">
                {step > 1 ? (
                  <Button
                    type="button"
                    onClick={goBack}
                    disabled={loading}
                    className="bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 px-4 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t('fleet.form.btnBack')}
                  </Button>
                ) : onCancel ? (
                  <Button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className="bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 px-4 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
                  >
                    {t('fleet.form.btnCancel')}
                  </Button>
                ) : null}

                <span className="hidden sm:block text-[11px] font-medium text-[#8a9e94] ml-1">
                  {t('fleet.form.wizardStepCounter', { current: step, total: TOTAL_STEPS })}
                </span>

                <div className="flex-1" />

                {step < TOTAL_STEPS ? (
                  <Button
                    type="button"
                    onClick={() => { if (canContinue) goNext() }}
                    disabled={!canContinue}
                    className="bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 px-5 text-sm border-0 shadow-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{t('fleet.form.btnNext')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={submitNow}
                    disabled={submitDisabled}
                    className="bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 px-5 text-sm border-0 shadow-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {loading
                        ? t('fleet.form.btnAdding')
                        : duplicateError
                        ? t('fleet.form.btnDuplicateRegistration')
                        : t('fleet.form.btnAddVehicle')}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
