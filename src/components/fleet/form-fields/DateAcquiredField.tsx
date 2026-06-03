// src/components/fleet/form-fields/DateAcquiredField.tsx
'use client'

import React from 'react'
import { Calendar } from 'lucide-react'

interface DateAcquiredFieldProps {
  dateAcquired: string
  onDateChange: (date: string) => void
  formatDateForDisplay: (isoDate: string) => string
}

export function DateAcquiredField({ 
  dateAcquired, 
  onDateChange, 
  formatDateForDisplay 
}: DateAcquiredFieldProps) {
  return (
    <div className="bg-gradient-to-br from-[#025940]/10 to-[#72A68E]/20 dark:from-[#025940]/25 dark:to-[#025940]/10 p-4 sm:p-5 rounded-xl border-2 border-[#72A68E] dark:border-[#025940] shadow-sm">
      <div className="flex items-center space-x-2 mb-3">
        <Calendar className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
        <label className="block text-sm font-bold text-[#012619] dark:text-[#C5D9D0]">
          Date Acquired
        </label>
      </div>
      <input
        type="date"
        value={dateAcquired}
        onChange={(e) => onDateChange(e.target.value)}
        className="w-full px-4 py-3 text-sm border border-[#72A68E] dark:border-[#025940] rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940] focus:border-[#025940] shadow-sm"
      />
      <p className="mt-2 text-xs text-[#025940] dark:text-[#72A68E]">
        📅 Displayed as: <span className="font-semibold">{formatDateForDisplay(dateAcquired)}</span>
      </p>
    </div>
  )
}