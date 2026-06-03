// src/components/features/service-bookings/modal-sections/MechanicSection.tsx
// 👤 Optional mechanic assignment for a service booking. Reads the org's
// mechanics via useMechanics() and renders a native <select> so it works
// identically on desktop and mobile. Empty value = unassigned.
'use client'

import React from 'react'
import { useMechanics } from '@/hooks/useMechanics'
import { useT } from '@/lib/i18n'

interface MechanicSectionProps {
  mechanicId?: string
  mechanicName?: string
  onMechanicChange: (id: string, name: string) => void
}

export function MechanicSection({
  mechanicId,
  mechanicName,
  onMechanicChange,
}: MechanicSectionProps) {
  const t = useT()
  const { mechanics, loading } = useMechanics()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (!id) {
      onMechanicChange('', '')
      return
    }
    const picked = mechanics.find(m => m.uid === id)
    onMechanicChange(id, picked?.displayName || picked?.email || t('serviceBookings.mechanic.unknownName'))
  }

  // If the booking already references a mechanic that is no longer in the
  // active list (e.g. they were deleted/deactivated), preserve their name in
  // the dropdown so the row still reads cleanly.
  const orphanAssignment =
    mechanicId && !mechanics.some(m => m.uid === mechanicId)
      ? { uid: mechanicId, name: mechanicName || t('serviceBookings.mechanic.formerMechanic') }
      : null

  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <img src="/technician.svg" alt="" className="w-7 h-7 object-contain" />
        <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
          {t('serviceBookings.mechanic.label')} <span className="text-[10px] font-normal text-[#8a9e94] normal-case tracking-normal">{t('serviceBookings.mechanic.optional')}</span>
        </label>
      </div>
      <select
        value={mechanicId || ''}
        onChange={handleChange}
        disabled={loading}
        className="w-full px-2.5 py-1.5 text-xs border border-[#c8d5ce] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm disabled:opacity-60 h-8"
      >
        <option value="">{t('serviceBookings.mechanic.unassignedOption')}</option>
        {orphanAssignment && (
          <option value={orphanAssignment.uid}>
            {t('serviceBookings.mechanic.noLongerActive', { name: orphanAssignment.name })}
          </option>
        )}
        {mechanics.map(m => (
          <option key={m.uid} value={m.uid}>
            {m.displayName || m.email}
          </option>
        ))}
      </select>
      {!loading && mechanics.length === 0 && (
        <p className="mt-1 text-[11px] text-[#4a5e54] dark:text-gray-400">
          {t('serviceBookings.mechanic.emptyState')}
        </p>
      )}
    </div>
  )
}
