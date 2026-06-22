// src/components/features/service-bookings/booking-workspace/BookingFormPanel.tsx
// Left column of the booking workspace. Composes the existing modal-section
// components inline (no modal chrome) and adds a "Check availability"
// summary card driven by the live form state + the same conflict logic
// that handleCreateBooking uses.
//
// All save logic is delegated to the parent: this component does NOT call
// Firestore directly. It just collects form data and calls onSubmit().
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle, X, Search,
} from 'lucide-react'
import { Vehicle } from '@/lib/firestore'
import { ServiceBooking } from '@/types/serviceBookings'
import { Button } from '@/components/ui/Button'
import { useT, localizePartsStatus } from '@/lib/i18n'

// Existing form-state hook + validation (reused from the modal)
import { useServiceBookingForm } from '@/hooks/features/useServiceBookingForm'
import { useSlotOccupancy } from '@/hooks/features/useSlotOccupancy'
import { useExternalGarages } from '@/hooks/useExternalGarages'
import {
  validateServiceBookingForm,
  hasValidationErrors,
  prepareWorkRequiredData,
  safeStringTrim,
} from '@/utils/serviceBookings/validationHelpers'
import { formatDate, parseDateFromInput } from '@/utils/serviceBookings/dateHelpers'
import { getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'
import { bayLabel } from '@/utils/serviceBookings/bayLabels'
import { formatDuration } from '@/lib/utils/duration'
import { PARTS_STATUS_ORDER, PARTS_STATUS_META } from '@/lib/utils/partsStatus'

// Existing section components — dropped in unchanged
import { DateSection } from '../modal-sections/DateSection'
import { ProviderSection } from '../modal-sections/ProviderSection'
import { ExternalProviderSection } from '../modal-sections/ExternalProviderSection'
import { VehicleSection } from '../modal-sections/VehicleSection'
import { WorkRequiredSection } from '../modal-sections/WorkRequiredSection'
import { NotesSection } from '../modal-sections/NotesSection'
import { MechanicSection } from '../modal-sections/MechanicSection'
import { CustomerSection } from '../modal-sections/CustomerSection'

// DurationSection removed — duration is now derived from drag-selecting
// cells on the workshop grid (single click = 30m, drag across N cells =
// N×30m).

import type { VehicleMatch } from '@/types/serviceBookingTypes'
import type { FormSelection } from './WorkshopScheduleGrid'

export interface BookingFormPanelProps {
  /** All bookings in the org (used for slot occupancy). */
  bookings: ServiceBooking[]
  /** Fleet vehicle list for the registration autocomplete. */
  vehicles: Vehicle[]
  /** Branch bay cap so the form can't oversell. */
  bayCount: number
  /** Optional custom bay names (display only). Index 0 = bay 1. */
  bayNames?: string[]
  /** Pre-selected date (e.g. the day the user was viewing when they hit "+"). */
  initialDate: Date
  /** When set, the form is in EDIT mode: every field is prefilled from the
   *  booking EXCEPT the slot (timeSlot + slotCount + bay are reset so the
   *  user re-picks them on the grid). Save calls onUpdate instead of
   *  onSubmit. When null/undefined, the form is in CREATE mode. */
  editingBooking?: ServiceBooking | null
  /** Optional: a bay/slot cell click in the grid pushes selection in here. */
  pendingCell?: { bay: number; timeSlot: string; slotCount: number } | null
  /** Live "what is the form planning to save right now?" — reported up to
   *  the workspace so the centre grid can draw highlights / conflicts. */
  onSelectionChange?: (selection: FormSelection) => void
  /** Live date change reported up so the grid stays in sync. */
  onDateChange?: (date: Date) => void
  /** Create save → parent runs the same conflict pipeline as the modal. */
  onSubmit: (
    booking: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >,
  ) => Promise<boolean>
  /** Edit save — wired to ServiceBookingsContent.handleUpdateBooking when
   *  editingBooking is set. Required if editingBooking is supplied. */
  onUpdate?: (
    booking: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >,
  ) => Promise<boolean>
  onCancel: () => void
}

export function BookingFormPanel({
  bookings,
  vehicles,
  bayCount,
  bayNames,
  initialDate,
  editingBooking,
  pendingCell,
  onSelectionChange,
  onDateChange,
  onSubmit,
  onUpdate,
  onCancel,
}: BookingFormPanelProps) {
  const t = useT()
  const { activeGarages: externalGarages, loading: externalGaragesLoading } = useExternalGarages()
  const isEditMode = !!editingBooking

  const {
    formData,
    errors,
    localSelectedDate,
    setErrors,
    setFormData,
    setLocalSelectedDate,
    handleInputChange,
    handleExternalProviderChange,
    handleProviderTypeChange,
    handleWorkTypeToggle,
  } = useServiceBookingForm(editingBooking ?? null, true)

  const { slotOccupancy } = useSlotOccupancy(
    localSelectedDate,
    bookings,
    null,
    formData.isExternalProvider,
    bayCount,
  )

  const [saving, setSaving] = useState(false)
  // Bay picked locally — the form data shape doesn't include serviceBay
  // (the modal lets the parent's conflict logic assign it). For the
  // workspace experience we let the user pick the bay up front so the grid
  // highlight makes sense; the parent still validates on save.
  const [serviceBay, setServiceBay] = useState<number>(1)

  // Initialise date from prop on mount
  useEffect(() => {
    setLocalSelectedDate(new Date(initialDate))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Edit-mode entry: useServiceBookingForm has already prefilled every
  // field from existingBooking — INCLUDING the (normalised) slot. We keep
  // it prefilled so a work-only edit (e.g. adding "ply lining") saves
  // without forcing a slot re-pick and without the booking flagging a
  // false "slot occupied" against itself. The user can still reschedule
  // by clicking/dragging a new slot on the grid, or dragging the block.
  useEffect(() => {
    if (!editingBooking) return
    if (editingBooking.serviceBay) setServiceBay(editingBooking.serviceBay)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingBooking?.id])

  // Pull cell clicks from the grid into the form
  useEffect(() => {
    if (!pendingCell) return
    setServiceBay(pendingCell.bay)
    handleInputChange('timeSlot', pendingCell.timeSlot)
    setFormData((prev) => ({ ...prev, slotCount: pendingCell.slotCount }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCell?.bay, pendingCell?.timeSlot, pendingCell?.slotCount])

  // Push live selection up so the grid can highlight / flag conflicts
  useEffect(() => {
    onSelectionChange?.({
      serviceBay: formData.isExternalProvider ? null : serviceBay,
      timeSlot: formData.isExternalProvider ? null : formData.timeSlot || null,
      slotCount: formData.slotCount ?? 1,
      isExternalProvider: !!formData.isExternalProvider,
    })
  }, [
    serviceBay,
    formData.timeSlot,
    formData.slotCount,
    formData.isExternalProvider,
    onSelectionChange,
  ])

  // Push date changes up
  useEffect(() => {
    if (localSelectedDate) onDateChange?.(localSelectedDate)
  }, [localSelectedDate, onDateChange])

  // ── Availability checklist ──────────────────────────────────────────────
  // Mirrors handleCreateBooking's conflict logic, but is presentational only.
  // Saving still goes through the parent so the existing bay-conflict modal
  // and "all bays full" guard run unchanged.
  const availability = useMemo(() => {
    if (formData.isExternalProvider) {
      return {
        bayOk: true,
        techOk: true,
        slotOk: true,
        message: t('serviceBookings.form.externalProviderSkip'),
      }
    }
    if (!localSelectedDate || !formData.timeSlot) {
      return {
        bayOk: false,
        techOk: !!formData.assignedMechanicId || true, // tech is optional
        slotOk: false,
        message: t('serviceBookings.form.pickDateSlotHint'),
      }
    }
    const occ = slotOccupancy.get(formData.timeSlot)
    const slotIsFull = !!occ?.isFull
    const bayInUse = !!occ?.baysInUse?.includes(serviceBay)
    return {
      bayOk: !bayInUse,
      techOk: true,
      slotOk: !slotIsFull,
      message: slotIsFull
        ? t('serviceBookings.form.allBaysTaken', { count: bayCount })
        : bayInUse
          ? t('serviceBookings.form.bayBooked', { count: serviceBay })
          : t('serviceBookings.form.slotClear'),
    }
  }, [
    formData.isExternalProvider,
    formData.timeSlot,
    formData.assignedMechanicId,
    localSelectedDate,
    slotOccupancy,
    serviceBay,
    bayCount,
  ])

  // Vehicle search dropdown wiring
  const handleVehicleSelect = (v: VehicleMatch) => {
    handleInputChange('registration', v.registration)
    handleInputChange('make', v.make)
    handleInputChange('model', v.model)
    handleInputChange('isCustomVehicle', !v.isFleetVehicle)
  }

  const handleExternalGarageSelect = (garageName: string) => {
    const g = externalGarages.find((x) => x.name === garageName)
    if (g) {
      handleExternalProviderChange('garageName', g.name)
      handleExternalProviderChange('address', g.address)
    } else {
      handleExternalProviderChange('garageName', '')
      handleExternalProviderChange('address', '')
    }
  }

  const handleDateChange = (dateString: string) => {
    if (!dateString) return
    const next = parseDateFromInput(dateString)
    setLocalSelectedDate(next)
    if (!formData.isExternalProvider) handleInputChange('timeSlot', '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationErrors = validateServiceBookingForm(formData, localSelectedDate)
    if (hasValidationErrors(validationErrors) || !localSelectedDate) {
      setErrors(validationErrors)
      return
    }
    setSaving(true)
    try {
      const finalWorkRequired = prepareWorkRequiredData(
        formData.workRequired,
        formData.customWork,
      )
      // 👥 All three customer fields are optional — only include in the
      // payload when actually entered, so old bookings don't accumulate
      // empty strings and the auto-upsert in ServiceBookingsContext can
      // skip cleanly.
      const customerNameTrimmed = safeStringTrim(formData.customerName)
      const customerPhoneTrimmed = safeStringTrim(formData.customerPhone)
      const customerEmailTrimmed = safeStringTrim(formData.customerEmail)
      const bookingData = {
        date: formatDate(localSelectedDate),
        timeSlot: formData.isExternalProvider ? 'EXTERNAL' : formData.timeSlot,
        registration: safeStringTrim(formData.registration).toUpperCase(),
        make: safeStringTrim(formData.make),
        model: safeStringTrim(formData.model),
        workRequired: finalWorkRequired,
        isCustomVehicle: formData.isCustomVehicle,
        notes: safeStringTrim(formData.notes),
        status: 'scheduled' as const,
        isExternalProvider: formData.isExternalProvider,
        assignedMechanicId: formData.assignedMechanicId || null,
        assignedMechanicName: formData.assignedMechanicName || null,
        slotCount: typeof formData.slotCount === 'number' && formData.slotCount >= 1
          ? formData.slotCount
          : 1,
        // The user picked a bay — pass it as a hint to the parent. The parent
        // still runs the bay-conflict check; this just becomes the preferred
        // bay when free.
        serviceBay: formData.isExternalProvider ? undefined : serviceBay,
        // 👥 Customer details — all optional, all conditionally included.
        ...(customerNameTrimmed && { customerName: customerNameTrimmed }),
        ...(customerPhoneTrimmed && { customerPhone: customerPhoneTrimmed }),
        ...(customerEmailTrimmed && { customerEmail: customerEmailTrimmed }),
        // 🧩 Parts state — only written when set (None = omit, so old
        // bookings / in-stock jobs don't carry an empty value).
        ...(formData.partsStatus && { partsStatus: formData.partsStatus }),
        ...(formData.isExternalProvider && {
          externalProvider: {
            garageName: safeStringTrim(formData.externalProvider.garageName),
            address: safeStringTrim(formData.externalProvider.address),
            customTime: safeStringTrim(formData.customTime),
          },
        }),
      } as Omit<
        ServiceBooking,
        'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
      >
      const handler = isEditMode && onUpdate ? onUpdate : onSubmit
      const ok = await handler(bookingData)
      if (ok && !isEditMode) {
        // CREATE mode — reset to a clean form for another booking. Edit
        // mode closes the workspace via the parent (see onUpdate handler
        // in ServiceBookingsContent), so no reset is needed here.
        setFormData({
          registration: '',
          make: '',
          model: '',
          timeSlot: '',
          customTime: '',
          workRequired: [],
          customWork: '',
          notes: '',
          isCustomVehicle: false,
          isExternalProvider: false,
          externalProvider: { garageName: '', address: '' },
          assignedMechanicId: '',
          assignedMechanicName: '',
          slotCount: 1,
          customerName: '',
          customerPhone: '',
          customerEmail: '',
          partsStatus: '',
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <img src="/calendar.svg" alt="" className="w-10 h-10 object-contain" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            {isEditMode ? t('serviceBookings.form.headerEdit') : t('serviceBookings.form.headerNew')}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('serviceBookings.form.closeWorkspace')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <DateSection
          selectedDate={localSelectedDate}
          onDateChange={handleDateChange}
          error={errors.date}
          allowPastDates={!!editingBooking}
        />

        <CustomerSection
          customerName={formData.customerName}
          customerPhone={formData.customerPhone}
          customerEmail={formData.customerEmail}
          onCustomerChange={(field, value) => handleInputChange(field, value)}
          errors={errors}
        />

        <VehicleSection
          formData={formData}
          vehicles={vehicles}
          onInputChange={handleInputChange}
          onVehicleSelect={handleVehicleSelect}
          errors={errors}
        />

        <WorkRequiredSection
          workRequired={formData.workRequired}
          customWork={formData.customWork}
          onWorkTypeToggle={handleWorkTypeToggle}
          onCustomWorkChange={(v) => handleInputChange('customWork', v)}
          errors={errors}
        />

        {/* 🧩 Parts state — replaces the free-text "need to order parts"
            note. Optional (defaults to None). Once set it shows as a chip
            on the workshop grid and can be advanced there with one tap. */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/10 p-4 rounded-xl border border-amber-200 dark:border-amber-700">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            <img src="/parts.svg" alt="" className="w-8 h-8 object-contain" />
            {t('serviceBookings.form.partsLabel')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleInputChange('partsStatus', '')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                !formData.partsStatus
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-gray-400'
              }`}
            >
              {t('serviceBookings.form.partsNone')}
            </button>
            {PARTS_STATUS_ORDER.map((s) => {
              const meta = PARTS_STATUS_META[s]
              const isActive = formData.partsStatus === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleInputChange('partsStatus', s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                    isActive
                      ? meta.active
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-gray-400'
                  }`}
                >
                  {localizePartsStatus(t, s)}
                </button>
              )
            })}
          </div>
        </div>

        <ProviderSection
          isExternalProvider={formData.isExternalProvider}
          onProviderTypeChange={handleProviderTypeChange}
        />

        {formData.isExternalProvider ? (
          <ExternalProviderSection
            formData={formData}
            onGarageSelect={handleExternalGarageSelect}
            onProviderChange={handleExternalProviderChange}
            errors={errors}
            externalGaragesLoading={externalGaragesLoading}
            externalGarages={externalGarages}
          />
        ) : (
          <>
            {/* Bay picker — workspace-only field. Lets the user pre-pick the
                bay so the grid highlight is meaningful. Parent still
                validates on save. */}
            <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide mb-2">
                {t('serviceBookings.form.requiredBay')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: bayCount }, (_, i) => i + 1).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setServiceBay(b)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                      serviceBay === b
                        ? 'bg-[#025940] text-white border-[#025940]'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-[#72A68E]'
                    }`}
                  >
                    {bayLabel(bayNames, b, t('serviceBookings.form.bayButton', { count: b }))}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration display — read-only summary of the slot range
                picked from the workshop grid. Shows nothing until the
                user makes a selection. */}
            <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
              {formData.timeSlot ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-[#012619] dark:text-gray-200">
                    <span className="font-bold text-[#025940] dark:text-[#72A68E]">{t('serviceBookings.form.selectedSlot')}</span>{' '}
                    {formData.timeSlot.split('-')[0]} –{' '}
                    {getBookingEndTime(formData.timeSlot, formData.slotCount ?? 1)}{' '}
                    <span className="text-[#8a9e94]">
                      · {formatDuration((formData.slotCount ?? 1) * 30)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleInputChange('timeSlot', '')
                      setFormData((prev) => ({ ...prev, slotCount: 1 }))
                    }}
                    className="text-[11px] font-medium text-[#8a9e94] hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded"
                  >
                    {t('serviceBookings.form.clear')}
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-[#8a9e94] italic">
                  {t('serviceBookings.form.pickSlotHint')}
                </div>
              )}
              {errors.timeSlot && (
                <p className="text-red-500 text-xs mt-1">{errors.timeSlot}</p>
              )}
            </div>
          </>
        )}

        <MechanicSection
          mechanicId={formData.assignedMechanicId}
          mechanicName={formData.assignedMechanicName}
          onMechanicChange={(id, name) => {
            handleInputChange('assignedMechanicId', id)
            handleInputChange('assignedMechanicName', name)
          }}
        />

        <NotesSection
          notes={formData.notes}
          onNotesChange={(v) => handleInputChange('notes', v)}
        />

        {/* Availability check card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
              {t('serviceBookings.form.availabilityCheck')}
            </span>
          </div>
          <ul className="space-y-1.5">
            <AvailabilityRow ok={availability.bayOk} label={t('serviceBookings.form.bayAvailable')} />
            <AvailabilityRow ok={availability.slotOk} label={t('serviceBookings.form.timeSlotAvailable')} />
            <AvailabilityRow ok={availability.techOk} label={t('serviceBookings.form.technicianAvailable')} />
          </ul>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            {availability.message}
          </p>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-100 dark:border-gray-700 p-3 flex items-center gap-2">
        <Button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold py-2 rounded-lg transition-colors"
        >
          {t('serviceBookings.form.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={saving}
          className="flex-1 bg-[#025940] hover:bg-[#025940]/90 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t('serviceBookings.form.saving')}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              {isEditMode ? t('serviceBookings.form.saveChanges') : t('serviceBookings.form.createBooking')}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function AvailabilityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${
          ok ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      >
        {ok ? '✓' : '×'}
      </span>
      <span className={`${ok ? 'text-gray-700 dark:text-gray-200' : 'text-red-700 dark:text-red-300'}`}>
        {label}
      </span>
    </li>
  )
}

export default BookingFormPanel
