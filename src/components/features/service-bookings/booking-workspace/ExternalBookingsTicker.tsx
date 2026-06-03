// src/components/features/service-bookings/booking-workspace/ExternalBookingsTicker.tsx
// NASDAQ-style horizontal scrolling ticker for external-garage bookings
// scheduled on the currently selected day. Sits above the workshop bay
// grid so external jobs (which have no bay column) stay visible.
'use client'

import React, { useMemo } from 'react'
import type { ServiceBooking } from '@/types/serviceBookings'
import { getDateInputValue } from '@/utils/serviceBookings/dateHelpers'
import { useT } from '@/lib/i18n'

interface ExternalBookingsTickerProps {
  bookings: ServiceBooking[]
  selectedDate: Date
  onBookingClick?: (booking: ServiceBooking) => void
}

export function ExternalBookingsTicker({
  bookings,
  selectedDate,
  onBookingClick,
}: ExternalBookingsTickerProps) {
  const t = useT()
  const dateStr = getDateInputValue(selectedDate)

  const externalToday = useMemo(() => {
    // Only show bookings still awaiting drop-off. Once status flips to
    // `checked_in_to_garage` (vehicle physically at external garage),
    // `completed`, or `cancelled`, the chip disappears from the ticker.
    return bookings
      .filter(
        (b) =>
          b.isExternalProvider === true &&
          b.date === dateStr &&
          b.status === 'scheduled',
      )
      .sort((a, b) =>
        (a.externalProvider?.customTime ?? '').localeCompare(
          b.externalProvider?.customTime ?? '',
        ),
      )
  }, [bookings, dateStr])

  if (externalToday.length === 0) return null

  // Doubled list = seamless loop with translateX(-50%).
  const looped = [...externalToday, ...externalToday]

  return (
    <div className="border-b border-[#025940]/30 bg-gradient-to-r from-[#012619] via-[#025940] to-[#012619] overflow-hidden">
      <div className="flex items-center">
        <div className="flex-shrink-0 px-3 py-1.5 text-[10px] font-black tracking-[0.15em] text-[#b3f243] uppercase border-r border-[#b3f243]/30 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#b3f243] animate-pulse" />
          {t('serviceBookings.externalTicker.label', {
            count: externalToday.length,
          })}
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="ticker-track inline-flex items-center gap-3 py-1.5 px-3 whitespace-nowrap">
            {looped.map((b, i) => (
              <button
                key={`${b.id}-${i}`}
                type="button"
                onClick={() => onBookingClick?.(b)}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 active:bg-white/25 text-white text-xs transition-colors flex-shrink-0"
                title={`${b.registration} · ${b.externalProvider?.garageName ?? ''}`}
              >
                <span className="font-mono font-black text-[#b3f243] tracking-wider">
                  {b.registration}
                </span>
                <span className="text-white/40">·</span>
                <span className="font-semibold text-white/95 max-w-[180px] truncate">
                  {b.externalProvider?.garageName ?? '—'}
                </span>
                {b.externalProvider?.customTime ? (
                  <>
                    <span className="text-white/40">·</span>
                    <span className="text-white/80 tabular-nums">
                      {b.externalProvider.customTime}
                    </span>
                  </>
                ) : null}
                {b.workRequired ? (
                  <>
                    <span className="text-white/40">·</span>
                    <span className="text-white/70 italic max-w-[220px] truncate">
                      {b.workRequired}
                    </span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
