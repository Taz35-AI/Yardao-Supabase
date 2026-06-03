// src/components/features/service-bookings/modal-sections/NotesSection.tsx
'use client'

import React from 'react'
import { MessageSquare } from 'lucide-react'
import { NotesSectionProps } from '@/types/serviceBookingTypes'
import { useT } from '@/lib/i18n'

export function NotesSection({ notes, onNotesChange }: NotesSectionProps) {
  const t = useT()
  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#025940]/10 border border-[#025940]/20">
          <MessageSquare className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
        </span>
        <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
          {t('serviceBookings.notes.label')}
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={t('serviceBookings.notes.placeholder')}
        rows={3}
        className="w-full px-2.5 py-2 text-xs border border-[#c8d5ce] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none shadow-sm placeholder-[#8a9e94]"
      />
    </div>
  )
}