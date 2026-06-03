// src/components/features/service-bookings/modal-sections/CustomerSection.tsx
// Customer contact details for a booking. Used by BOTH the legacy modal
// flow and the new workspace form. Name + phone are required (validated
// in validationHelpers); email is optional.
//
// Wired to the shared `customers` collection: typing a name OR phone
// surfaces matching saved customers in a dropdown — picking one fills
// all three fields. The booking save path also auto-upserts the customer
// (handled in ServiceBookingsContext.createBooking) so manual save isn't
// required for the customer to start appearing in autocomplete.
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { User, Phone, Mail, BadgeCheck, Save, Check, AlertCircle } from 'lucide-react'
import type { ServiceBookingFormErrors } from '@/types/serviceBookingTypes'
import type { Customer } from '@/types/customer'
import { useCustomers } from '@/hooks/useCustomers'
import { splitName } from '@/lib/customerService'
import { normalizePhone, isPhoneUsable } from '@/lib/utils/phone'
import { CustomerSearchDropdown } from '../modal-components/CustomerSearchDropdown'
import { useT } from '@/lib/i18n'

export interface CustomerSectionProps {
  customerName: string
  customerPhone: string
  customerEmail: string
  onCustomerChange: (
    field: 'customerName' | 'customerPhone' | 'customerEmail',
    value: string,
  ) => void
  errors: ServiceBookingFormErrors
}

export function CustomerSection({
  customerName,
  customerPhone,
  customerEmail,
  onCustomerChange,
  errors,
}: CustomerSectionProps) {
  const t = useT()
  // Single source of customers — same listener used by /customers admin.
  const { customers, createCustomer, error: customerHookError } = useCustomers()
  const [openDropdownFor, setOpenDropdownFor] = useState<'name' | 'phone' | null>(null)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // The booking only carries a single combined `customerName`. We split it
  // into first/surname inputs locally and recompose on every keystroke,
  // so the booking + grid + search stay unchanged while the customer
  // record still gets structured names (split in customerService).
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Re-sync local first/last whenever the combined name changes from the
  // OUTSIDE (form reset → '', or an autocomplete pick). Our own edits set
  // customerName === current combined, so this no-ops for those.
  useEffect(() => {
    const combined = `${firstName} ${lastName}`.trim()
    if (customerName !== combined) {
      const s = splitName(customerName)
      setFirstName(s.firstName)
      setLastName(s.lastName)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName])

  const pushName = (fn: string, ln: string) => {
    setFirstName(fn)
    setLastName(ln)
    onCustomerChange('customerName', `${fn} ${ln}`.trim())
  }

  // Detect whether the current name+phone exactly match an existing
  // customer record so we can surface a "✓ Saved customer" badge — this
  // tells the user "we already know this person, the info will be reused".
  const matchedExisting = useMemo<Customer | null>(() => {
    const phoneKey = normalizePhone(customerPhone)
    if (!phoneKey) return null
    return customers.find((c) => c.phoneNormalized === phoneKey) ?? null
  }, [customers, customerPhone])

  // Pick a suggestion → fill all fields and close the dropdown. Prefer the
  // record's structured first/last; fall back to splitting its name.
  const handleSelect = (c: Customer) => {
    const fn = c.firstName ?? splitName(c.name).firstName
    const ln = c.lastName ?? splitName(c.name).lastName
    pushName(fn, ln)
    onCustomerChange('customerPhone', c.phone)
    onCustomerChange('customerEmail', c.email || '')
    setOpenDropdownFor(null)
  }

  // Explicit "Save customer now" — for when the user wants to capture the
  // customer without (or before) creating a booking. The auto-upsert on
  // booking save still runs separately; calling this just makes the
  // customer record exist immediately.
  const canSaveNow =
    !matchedExisting &&
    !!customerName.trim() &&
    isPhoneUsable(customerPhone)

  const handleSaveNow = async () => {
    if (!canSaveNow) return
    setSavingCustomer(true)
    const id = await createCustomer({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: customerPhone.trim(),
      email: customerEmail.trim() || undefined,
    })
    setSavingCustomer(false)
    if (id) {
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    }
  }

  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#72A68E]/15 border border-[#72A68E]/40">
            <User className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
            {t('serviceBookings.customer.title')}
          </label>
        </div>
        {matchedExisting && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full"
            title={t('serviceBookings.customer.existingBadgeTitle', { count: matchedExisting.bookingCount })}
          >
            <BadgeCheck className="w-3 h-3" />
            {t('serviceBookings.customer.savedBadge')}
          </span>
        )}
      </div>

      {/* First name (with autocomplete) + Surname */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="relative">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('serviceBookings.customer.firstNameLabel')} <span className="text-gray-400 font-normal">{t('serviceBookings.customer.optional')}</span>
          </label>
          <Input
            value={firstName}
            onChange={(e) => pushName(e.target.value, lastName)}
            onFocus={() => setOpenDropdownFor('name')}
            onBlur={() => {
              // Delay so onMouseDown in the dropdown can fire first.
              setTimeout(() => setOpenDropdownFor((cur) => (cur === 'name' ? null : cur)), 150)
            }}
            placeholder={t('serviceBookings.customer.firstNamePlaceholder')}
            autoComplete="off"
            className={`bg-white dark:bg-gray-800 border-[#72A68E]/50 dark:border-[#72A68E]/40 rounded-xl ${
              errors.customerName ? 'border-red-500' : ''
            }`}
          />
          <CustomerSearchDropdown
            customers={customers}
            nameQuery={customerName}
            phoneQuery=""
            open={openDropdownFor === 'name'}
            onSelect={handleSelect}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('serviceBookings.customer.surnameLabel')} <span className="text-gray-400 font-normal">{t('serviceBookings.customer.optional')}</span>
          </label>
          <Input
            value={lastName}
            onChange={(e) => pushName(firstName, e.target.value)}
            placeholder={t('serviceBookings.customer.surnamePlaceholder')}
            autoComplete="off"
            className="bg-white dark:bg-gray-800 border-[#72A68E]/50 dark:border-[#72A68E]/40 rounded-xl"
          />
        </div>
        {errors.customerName && (
          <p className="text-red-500 text-xs mt-1 sm:col-span-2">{errors.customerName}</p>
        )}
      </div>

      {/* Phone + Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            <Phone className="w-3 h-3" />
            {t('serviceBookings.customer.phoneLabel')} <span className="text-gray-400 font-normal">{t('serviceBookings.customer.optional')}</span>
          </label>
          <Input
            type="tel"
            value={customerPhone}
            onChange={(e) => onCustomerChange('customerPhone', e.target.value)}
            onFocus={() => setOpenDropdownFor('phone')}
            onBlur={() => {
              setTimeout(() => setOpenDropdownFor((cur) => (cur === 'phone' ? null : cur)), 150)
            }}
            placeholder={t('serviceBookings.customer.phonePlaceholder')}
            autoComplete="off"
            inputMode="tel"
            className={`bg-white dark:bg-gray-800 border-[#72A68E]/50 dark:border-[#72A68E]/40 rounded-xl ${
              errors.customerPhone ? 'border-red-500' : ''
            }`}
          />
          <CustomerSearchDropdown
            customers={customers}
            nameQuery=""
            phoneQuery={customerPhone}
            open={openDropdownFor === 'phone'}
            onSelect={handleSelect}
          />
          {errors.customerPhone && (
            <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            <Mail className="w-3 h-3" />
            {t('serviceBookings.customer.emailLabel')} <span className="text-gray-400 font-normal">{t('serviceBookings.customer.optional')}</span>
          </label>
          <Input
            type="email"
            value={customerEmail}
            onChange={(e) => onCustomerChange('customerEmail', e.target.value)}
            placeholder={t('serviceBookings.customer.emailPlaceholder')}
            autoComplete="email"
            inputMode="email"
            className={`bg-white dark:bg-gray-800 border-[#72A68E]/50 dark:border-[#72A68E]/40 rounded-xl ${
              errors.customerEmail ? 'border-red-500' : ''
            }`}
          />
          {errors.customerEmail && (
            <p className="text-red-500 text-xs mt-1">{errors.customerEmail}</p>
          )}
        </div>
      </div>

      {/* Footer: explicit save action + hint about auto-save. The button is
          a "save now" shortcut — the customer is ALSO upserted automatically
          when the booking itself is saved (see ServiceBookingsContext.
          createBooking), so this is purely for users who want to capture
          the customer before/without finishing the booking. */}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 italic flex-1 min-w-[180px]">
          {matchedExisting
            ? t('serviceBookings.customer.updatesRecordHint', { name: matchedExisting.name })
            : canSaveNow
              ? t('serviceBookings.customer.autoSaveHint')
              : t('serviceBookings.customer.fillToSaveHint')}
        </p>
        {!matchedExisting && (
          <button
            type="button"
            onClick={handleSaveNow}
            disabled={!canSaveNow || savingCustomer}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
              savedFlash
                ? 'bg-emerald-500 text-white'
                : canSaveNow && !savingCustomer
                  ? 'bg-[#025940] hover:bg-[#012619] text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
            title={t('serviceBookings.customer.saveButtonTitle')}
          >
            {savingCustomer ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('serviceBookings.customer.saving')}
              </>
            ) : savedFlash ? (
              <>
                <Check className="w-3 h-3" />
                {t('serviceBookings.customer.savedExclaim')}
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                {t('serviceBookings.customer.saveButton')}
              </>
            )}
          </button>
        )}
      </div>

      {/* If the explicit-save attempt failed (rules, network, etc.) surface
          the real reason here — the booking-save auto-upsert won't show
          this because it's fire-and-forget. */}
      {customerHookError && !savingCustomer && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded px-2 py-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{customerHookError}</span>
        </div>
      )}
    </div>
  )
}

export default CustomerSection
