// src/components/features/service-bookings/modal-components/CustomerSearchDropdown.tsx
// Autocomplete dropdown for the customer name field. Searches the org's
// `customers` collection by name OR phone digits (case-insensitive
// substring match) and surfaces the top 5 hits. Picking one fills name +
// phone + email in one go.
//
// Mirrors VehicleSearchDropdown's shape so the hosting form stays simple:
// the parent owns the input and just passes nameQuery + phoneQuery in.
'use client'

import React, { useMemo } from 'react'
import { User, Phone, Mail, BadgeCheck } from 'lucide-react'
import type { Customer } from '@/types/customer'
import { normalizePhone } from '@/lib/utils/phone'
import { useT } from '@/lib/i18n'

export interface CustomerSearchDropdownProps {
  /** Live customer list — passed in from useCustomers. */
  customers: Customer[]
  /** Current text in the customer-name input. */
  nameQuery: string
  /** Current text in the phone input — also matched, so typing a phone
   *  surfaces the existing customer even if the name is blank. */
  phoneQuery: string
  /** Caller controls open/close (typically: open on focus, close on blur
   *  or selection). */
  open: boolean
  /** Selected → parent fills name/phone/email + closes the dropdown. */
  onSelect: (customer: Customer) => void
  /** Max suggestions to show — defaults to 5. */
  limit?: number
}

export function CustomerSearchDropdown({
  customers,
  nameQuery,
  phoneQuery,
  open,
  onSelect,
  limit = 5,
}: CustomerSearchDropdownProps) {
  const t = useT()
  const matches = useMemo(() => {
    const name = nameQuery.trim().toLowerCase()
    const phone = normalizePhone(phoneQuery)
    if (!name && !phone) return []
    return customers
      .filter((c) => {
        const nameHit = name && c.name.toLowerCase().includes(name)
        const phoneHit = phone && c.phoneNormalized.includes(phone)
        return nameHit || phoneHit
      })
      .slice(0, limit)
  }, [customers, nameQuery, phoneQuery, limit])

  if (!open || matches.length === 0) return null

  return (
    <div
      className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-[#72A68E]/50 dark:border-[#72A68E]/40 rounded-xl shadow-xl overflow-hidden"
      // mousedown rather than click so we can fire onSelect before the
      // input's onBlur tears the dropdown down.
    >
      <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
        {t('serviceBookings.customerSearch.resultsHeader', { count: matches.length })}
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {matches.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(c)
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#C5D9D0]/40 dark:hover:bg-[#025940]/20 transition-colors flex items-start gap-2"
            >
              <User className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    {c.name}
                  </span>
                  {c.bookingCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                      <BadgeCheck className="w-2.5 h-2.5" />
                      {c.bookingCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-600 dark:text-gray-400 truncate">
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5" />
                      {c.phone}
                    </span>
                  )}
                  {c.email && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <Mail className="w-2.5 h-2.5" />
                      {c.email}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CustomerSearchDropdown
