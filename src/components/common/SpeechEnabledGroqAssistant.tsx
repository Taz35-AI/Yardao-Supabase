// src/components/common/SpeechEnabledGroqAssistant.tsx
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { useGroqAssistant, ConfirmBookingParams } from '@/hooks/useGroqAssistant'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { userProfileService } from '@/lib/firestore'
import { Send, X, Loader2, Sparkles, RotateCcw } from 'lucide-react'

// ── Yardao brand colours ──────────────────────────────────────────────────────
const C = {
  darkGreen:    '#012619',
  midGreen:     '#025940',
  teal:         '#72A68E',
  accent:       '#b3f243',
  accentDim:    'rgba(179,242,67,0.15)',
  border:       'rgba(114,166,142,0.25)',
  borderBright: 'rgba(114,166,142,0.5)',
  textMuted:    'rgba(197,217,208,0.7)',
  textLight:    '#C5D9D0',
  white:        '#ffffff',
}

interface CheckInWidgetProps {
  msgId: string
  prefillReg: string
  fleetVehicles: Array<{ id: string; registration: string; make: string; model: string }>
  checkedInRegs: string[]
  onConfirm: (vehicleId: string, vehicleReg: string, mileage: string, condition: string, status: string) => Promise<void>
  C: any
}

function CheckInWidget({ msgId, prefillReg, fleetVehicles, checkedInRegs, onConfirm, C }: CheckInWidgetProps) {
  const [search, setSearch]       = useState(prefillReg)
  const [mileage, setMileage]     = useState('')
  const [condition, setCondition] = useState('Good')
  const [status, setStatus]       = useState('Pending checks')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)

  const checkedSet = new Set((checkedInRegs || []).map((r: string) => r.toUpperCase().replace(/\s/g, '')))

  const filtered = search.trim().length === 0
    ? fleetVehicles.slice(0, 5)
    : fleetVehicles.filter(v =>
        v.registration.toUpperCase().replace(/\s/g, '').includes(search.toUpperCase().replace(/\s/g, '')) ||
        `${v.make} ${v.model}`.toUpperCase().includes(search.toUpperCase())
      ).slice(0, 5)

  const [selected, setSelected] = useState<{ id: string; registration: string; make: string; model: string } | null>(
    () => {
      if (!prefillReg) return null
      return fleetVehicles.find(v =>
        v.registration.toUpperCase().replace(/\s/g, '') === prefillReg.toUpperCase().replace(/\s/g, '')
      ) || null
    }
  )

  const isAlreadyIn = selected ? checkedSet.has(selected.registration.toUpperCase().replace(/\s/g, '')) : false

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
    background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}`,
    color: C.textLight, outline: 'none', boxSizing: 'border-box',
  }
  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: 'pointer',
  }

  if (done) return null

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Search / reg input */}
      {!selected && (
        <>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type registration or make..."
            style={inputStyle}
            autoFocus
          />
          {/* Suggestions */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(v => {
                const alreadyIn = checkedSet.has(v.registration.toUpperCase().replace(/\s/g, ''))
                return (
                  <button
                    key={v.id}
                    disabled={alreadyIn}
                    onClick={() => { setSelected(v); setSearch(v.registration) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 8, fontSize: 11, textAlign: 'left',
                      background: alreadyIn ? 'rgba(255,255,255,0.03)' : 'rgba(2,89,64,0.2)',
                      border: `1px solid ${C.border}`,
                      color: alreadyIn ? C.textMuted : C.textLight,
                      cursor: alreadyIn ? 'not-allowed' : 'pointer',
                      opacity: alreadyIn ? 0.6 : 1,
                    }}
                  >
                    <span>
                      <strong style={{ color: alreadyIn ? C.textMuted : C.accent }}>{v.registration}</strong>
                      {' — '}{v.make} {v.model}
                    </span>
                    {alreadyIn
                      ? <span style={{ fontSize: 10, color: C.textMuted }}>In yard</span>
                      : <span style={{ fontSize: 10, color: C.accent }}>SELECT →</span>
                    }
                  </button>
                )
              })}
            </div>
          )}
          {search.trim().length > 0 && filtered.length === 0 && (
            <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>No fleet vehicles match "{search}"</p>
          )}
        </>
      )}

      {/* Selected vehicle + details */}
      {selected && (
        <>
          {/* Vehicle badge + clear */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 10px', borderRadius: 8,
            background: 'rgba(179,242,67,0.12)', border: `1px solid ${C.accent}40`,
          }}>
            <div>
              <strong style={{ color: C.accent, fontSize: 13 }}>{selected.registration}</strong>
              <span style={{ color: C.textLight, fontSize: 11, marginLeft: 6 }}>{selected.make} {selected.model}</span>
            </div>
            <button
              onClick={() => { setSelected(null); setSearch('') }}
              style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 14 }}
            >✕</button>
          </div>

          {isAlreadyIn && (
            <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>⚠️ This vehicle is already checked in.</p>
          )}

          {!isAlreadyIn && (
            <>
              {/* Mileage */}
              <input
                type="number"
                value={mileage}
                onChange={e => setMileage(e.target.value)}
                placeholder="Mileage (optional)"
                style={inputStyle}
              />

              {/* Condition */}
              <select value={condition} onChange={e => setCondition(e.target.value)} style={selectStyle}>
                <option>Excellent</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Poor</option>
              </select>

              {/* Status */}
              <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
                <option>Ready</option>
                <option>Pending checks</option>
                <option>Repairs needed</option>
                <option>Non-Starter</option>
              </select>

              {/* Confirm */}
              <button
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true)
                  await onConfirm(selected.id, selected.registration, mileage, condition, status)
                  setDone(true)
                }}
                style={{
                  padding: '9px 14px', borderRadius: 8, width: '100%',
                  background: submitting ? C.border : C.accent,
                  color: C.darkGreen, fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Checking in...' : `📋 Check in ${selected.registration}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

interface ConversationMessage {
  id: string
  type: 'user' | 'assistant'
  message: string
  timestamp: Date
  pendingAction?: any
}

function buildScheduledNotificationAt(date: string, scheduledTime: string | null): string | null {
  if (!scheduledTime) return null
  const [hours, minutes] = scheduledTime.split(':').map(Number)
  const dt = new Date(date + 'T00:00:00')
  dt.setHours(hours, minutes, 0, 0)
  return dt.toISOString()
}

export function SpeechEnabledGroqAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  const [mounted, setMounted] = useState(false)
  const [confirmedGarageMessageId, setConfirmedGarageMessageId] = useState<string | null>(null)
  const [confirmedNoteMessageId, setConfirmedNoteMessageId] = useState<string | null>(null)
  // Editable note fields keyed by message id → note index
  const [noteEdits, setNoteEdits] = useState<Record<string, any>>({})
  const [customGarageInput, setCustomGarageInput] = useState<Record<string, { name: string; address: string }>>({})
  const [confirmedBookingMessageId, setConfirmedBookingMessageId] = useState<string | null>(null)
  const [awaitingContext, setAwaitingContext] = useState<{
    type: 'booking_date'
    vehicleId: string
    vehicleReg: string
    vehicleMake: string
    vehicleModel: string
    workRequired: string[]
    garages: Array<{ id: string; name: string; address: string }>
  } | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<Record<string, string>>({})
  const [externalCustomTime, setExternalCustomTime] = useState<Record<string, string>>({})
  const [customSlotActive, setCustomSlotActive] = useState<Record<string, boolean>>({})
  const [customSlotTime, setCustomSlotTime] = useState<Record<string, string>>({})
  const [selectedWork, setSelectedWork] = useState<Record<string, string[]>>({})
  const [customWorkText, setCustomWorkText] = useState<Record<string, string>>({})

  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Read current branch from URL — e.g. /dashboard?branch=fairview-barking
  const searchParams = useSearchParams()
  const currentBranchSlug = searchParams.get('branch') || 'main'
  const { user } = useAuth()

  const {
    loading,
    error,
    askQuestion,
    confirmCheckoutToGarage,
    confirmReturnFromGarage,
    confirmServiceBooking,
    confirmCheckIn,
    confirmHireOut,
    confirmHireReturn,
    confirmBranchTransfer,
    clearError,
  } = useGroqAssistant()

  const [isMobile, setIsMobile] = React.useState(false)
  const [bottomOffset, setBottomOffset] = React.useState(24)

  const [anyModalOpen, setAnyModalOpen] = useState(false)

useEffect(() => {
  const observer = new MutationObserver(() => {
    setAnyModalOpen(document.body.style.overflow === 'hidden')
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'] })
  return () => observer.disconnect()
}, [])

  // ── Responsive / layout effects ───────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const updateOffset = () => {
      // Banner is now top-positioned — no bottom collision to worry about
      const mobileNavHeight = window.innerWidth < 640 ? 72 : 0
      setBottomOffset(mobileNavHeight + 24)
    }

    updateOffset()
    const observer = new MutationObserver(updateOffset)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', updateOffset)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateOffset)
    }
  }, [])

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation])
  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 100) }, [isOpen])

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // ── Checkout: user picks a garage from the list ───────────────────────────
  const handleGarageSelect = useCallback(async (
    messageId: string,
    vehicleId: string,
    garageId: string,
    garageName: string,
    vehicleReg: string,
  ) => {
    setConfirmedGarageMessageId(messageId)
    setConversation(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      message: `Send to ${garageName}`,
      timestamp: new Date(),
    }])
    try {
      const result = await confirmCheckoutToGarage(vehicleId, garageId, garageName)
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: result.answer,
        timestamp: new Date(),
      }])
    } catch {
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: `Sorry, something went wrong checking out to ${garageName}. Try again!`,
        timestamp: new Date(),
      }])
    }
  }, [confirmCheckoutToGarage])

  // ── Return: single vehicle confirm ────────────────────────────────────────
  const handleReturnConfirm = useCallback(async (
    messageId: string,
    vehicleId: string,
    vehicleReg: string,
    garageName: string,
  ) => {
    setConfirmedGarageMessageId(messageId)
    setConversation(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      message: `Return ${vehicleReg} from ${garageName}`,
      timestamp: new Date(),
    }])
    try {
      const result = await confirmReturnFromGarage(vehicleId, vehicleReg, garageName)
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: result.answer,
        timestamp: new Date(),
      }])
    } catch {
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: `Sorry, couldn't process the return for ${vehicleReg}. Try again!`,
        timestamp: new Date(),
      }])
    }
  }, [confirmReturnFromGarage])

  // ── Booking: internal vs external provider selection ─────────────────────
  const handleProviderSelect = useCallback(async (
    msgId: string,
    isExternal: boolean,
    pa: any,
  ) => {
    setConfirmedBookingMessageId(msgId)

    if (!isExternal) {
      setConversation(prev => [...prev, {
        id: Date.now().toString(),
        type: 'user',
        message: 'Internal garage',
        timestamp: new Date(),
      }])
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: pa.workRequired?.length > 0
          ? `Perfect! Just to confirm — booking **${pa.vehicleReg}** for **${pa.workRequired.join(', ')}** at the internal garage. Anything else to add, or shall I confirm?`
          : `Great, internal garage it is! What work needs doing on **${pa.vehicleReg}**? Tap below or type anything custom:`,
        timestamp: new Date(),
        pendingAction: {
          type: 'booking_work_selection',
          vehicleId:   pa.vehicleId,
          vehicleReg:  pa.vehicleReg,
          vehicleMake: pa.vehicleMake,
          vehicleModel: pa.vehicleModel,
          date: pa.date,
          isExternal: false,
          suggestedWork: pa.workRequired || [],
        },
      }])
    } else {
      setConversation(prev => [...prev, {
        id: Date.now().toString(),
        type: 'user',
        message: 'External garage',
        timestamp: new Date(),
      }])
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: pa.garages?.length > 0
          ? `Which external garage? Pick one below, or type a new one:`
          : `No external garages saved yet. Type the garage name and address below to add one:`,
        timestamp: new Date(),
        pendingAction: {
          type: 'booking_external_garage_selection',
          vehicleId:    pa.vehicleId,
          vehicleReg:   pa.vehicleReg,
          vehicleMake:  pa.vehicleMake,
          vehicleModel: pa.vehicleModel,
          date:         pa.date,
          workRequired: pa.workRequired || [],
          garages:      pa.garages,
        },
      }])
    }
  }, [])

  // ── Booking: work type chip toggle ────────────────────────────────────────
  const handleWorkToggle = useCallback((msgId: string, workType: string) => {
    setSelectedWork(prev => {
      const current = prev[msgId] || []
      return {
        ...prev,
        [msgId]: current.includes(workType)
          ? current.filter(w => w !== workType)
          : [...current, workType],
      }
    })
  }, [])

  // ── Booking: confirm work + time and fire booking ─────────────────────────
  const handleBookingConfirm = useCallback(async (msgId: string, pa: any) => {
    const work   = selectedWork[msgId] || pa.suggestedWork || []
    const custom = customWorkText[msgId] || ''
    const finalWork = custom.trim() ? [...work, custom.trim()] : work

    if (finalWork.length === 0) {
      setConversation(prev => [...prev, {
        id: Date.now().toString(),
        type: 'assistant',
        message: `Please select at least one job or type a custom one!`,
        timestamp: new Date(),
      }])
      return
    }

    setConfirmedBookingMessageId(msgId)
    setConversation(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      message: finalWork.join(', '),
      timestamp: new Date(),
    }])

    const isCustomSlot = customSlotActive[msgId]
    const slot = isCustomSlot
      ? (customSlotTime[msgId] || '')
      : (selectedTimeSlot[msgId] || '08:30-10:00')
    const extTime = externalCustomTime[msgId] || ''

    const result = await confirmServiceBooking({
      vehicleId:         pa.vehicleId,
      vehicleReg:        pa.vehicleReg,
      vehicleMake:       pa.vehicleMake,
      vehicleModel:      pa.vehicleModel,
      date:              pa.date,
      workRequired:      finalWork,
      isExternal:        pa.isExternal,
      garageId:          pa.garageId,
      garageName:        pa.garageName,
      garageAddress:     pa.garageAddress,
      timeSlot:          pa.isExternal ? '' : slot,
      externalCustomTime: pa.isExternal ? extTime : undefined,
    })

    setConversation(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      message: result.answer,
      timestamp: new Date(),
    }])
  }, [selectedWork, customWorkText, selectedTimeSlot, externalCustomTime, customSlotActive, customSlotTime, confirmServiceBooking])

  // ── Booking: external garage selected from list or custom ─────────────────
  const handleExternalGarageSelect = useCallback(async (
    msgId: string,
    pa: any,
    garageId: string,
    garageName: string,
    garageAddress: string,
  ) => {
    setConfirmedBookingMessageId(msgId)
    setConversation(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      message: garageName,
      timestamp: new Date(),
    }])

    if (pa.workRequired?.length > 0) {
      const result = await confirmServiceBooking({
        vehicleId:    pa.vehicleId,
        vehicleReg:   pa.vehicleReg,
        vehicleMake:  pa.vehicleMake,
        vehicleModel: pa.vehicleModel,
        date:         pa.date,
        workRequired: pa.workRequired,
        isExternal:   true,
        garageId,
        garageName,
        garageAddress,
      })
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: result.answer,
        timestamp: new Date(),
      }])
    } else {
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: `Got it — **${garageName}**! What work needs doing? Tap or type:`,
        timestamp: new Date(),
        pendingAction: {
          type: 'booking_work_selection',
          vehicleId:    pa.vehicleId,
          vehicleReg:   pa.vehicleReg,
          vehicleMake:  pa.vehicleMake,
          vehicleModel: pa.vehicleModel,
          date:         pa.date,
          isExternal:   true,
          garageId,
          garageName,
          garageAddress,
          suggestedWork: [],
        },
      }])
    }
  }, [confirmServiceBooking])

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN SUBMIT
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e?: React.FormEvent, prefill?: string) => {
    e?.preventDefault()
    const text = (prefill || inputValue).trim()
    if (!text || loading) return
    setInputValue('')

    setConversation(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      message: text,
      timestamp: new Date(),
    }])

    // ── Handle awaited booking date follow-up ────────────────────────────
    if (awaitingContext?.type === 'booking_date') {
      const ctx = awaitingContext
      setAwaitingContext(null)

      const parseDate = (msg: string): string | null => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (/\btoday\b/i.test(msg)) return today.toISOString().split('T')[0]
        if (/\btomorrow\b/i.test(msg)) {
          const d = new Date(today)
          d.setDate(d.getDate() + 1)
          return d.toISOString().split('T')[0]
        }
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        const dayMatch = msg.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
        if (dayMatch) {
          const target = days.indexOf(dayMatch[1].toLowerCase())
          const d = new Date(today)
          let diff = target - d.getDay()
          if (diff <= 0 || /\bnext\b/i.test(msg)) diff += 7
          d.setDate(d.getDate() + diff)
          return d.toISOString().split('T')[0]
        }
        const inDays = msg.match(/(\d+)\s*days?/i)
        if (inDays) {
          const d = new Date(today)
          d.setDate(d.getDate() + parseInt(inDays[1]))
          return d.toISOString().split('T')[0]
        }
        return null
      }

      const bookingDate = parseDate(text)
      if (!bookingDate) {
        setAwaitingContext(ctx)
        setConversation(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          message: `I didn't catch that date — try "tomorrow", "next Thursday", or "Monday"?`,
          timestamp: new Date(),
        }])
        return
      }

      const dateFormatted = new Date(bookingDate + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
      const workPreview = ctx.workRequired.length > 0
        ? ` for **${ctx.workRequired.join(', ')}**`
        : ''

      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: `**${ctx.vehicleReg}** on **${dateFormatted}**${workPreview}. Internal or external garage?`,
        timestamp: new Date(),
        pendingAction: {
          type:         'booking_provider_selection',
          vehicleId:    ctx.vehicleId,
          vehicleReg:   ctx.vehicleReg,
          vehicleMake:  ctx.vehicleMake,
          vehicleModel: ctx.vehicleModel,
          date:         bookingDate,
          workRequired: ctx.workRequired,
          garages:      ctx.garages,
        },
      }])
      return
    }

    // ── Normal query ─────────────────────────────────────────────────────
    try {
      // Build Groq-format history from conversation state so Zao remembers what it said
      // Snapshot conversation BEFORE appending the new user message (already done above)
      const groqHistory = conversation
        .filter(m => m.type === 'user' || m.type === 'assistant')
        .map(m => ({
          role: m.type as 'user' | 'assistant',
          content: m.message,
        }))

      const result = await askQuestion(text, currentBranchSlug, groqHistory)
      const raw = result.answer
      const answerText = typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object'
          ? JSON.stringify(raw, null, 2)
          : 'No response received.'

      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: answerText,
        timestamp: new Date(),
        pendingAction: result.pendingAction,
      }])

      if (result.pendingAction?.type === 'booking_date_needed') {
        const pa = result.pendingAction
        setAwaitingContext({
          type:         'booking_date',
          vehicleId:    pa.vehicleId,
          vehicleReg:   pa.vehicleReg,
          vehicleMake:  pa.vehicleMake,
          vehicleModel: pa.vehicleModel,
          workRequired: pa.workRequired,
          garages:      pa.garages || [],
        })
      } else {
        setAwaitingContext(null)
      }
    } catch {
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: 'Something went wrong. Please try again.',
        timestamp: new Date(),
      }])
    }
  }, [inputValue, loading, askQuestion, awaitingContext])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const INTERNAL_WORK_TYPES = ['Service', 'Tyres', 'Driveshafts', 'MOT', 'Repairs', 'Break Pads', 'Maintenance']
  const SLOTS = ['08:30-10:00','10:00-11:30','11:30-13:00','13:00-14:30','14:30-16:00','16:00-17:30','17:30-19:00','19:00-20:30']

  /** Render message text — converts **bold** markdown to accent-coloured spans */
  const renderMessageText = (message: string) => {
    return message.split('\n').map((line, i) => {
      const headingMatch = line.match(/^\*\*(.+?)\*\*$/)
      if (headingMatch) {
        return (
          <div key={i} style={{
            fontWeight: 700, fontSize: 11,
            marginTop: i > 0 ? 10 : 0, marginBottom: 2,
            color: C.accent, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {headingMatch[1]}
          </div>
        )
      }
      const parts = line.split(/(\*\*[^*]+\*\*)/)
      return (
        <div key={i} style={{ lineHeight: 1.6 }}>
          {parts.map((part, j) => {
            const bold = part.match(/^\*\*(.+?)\*\*$/)
            if (bold) return <strong key={j} style={{ color: C.accent, fontWeight: 700 }}>{bold[1]}</strong>
            return part || '\u00A0'
          })}
        </div>
      )
    })
  }

  /** Render a single message bubble with all interactive pending-action widgets */
  const renderMessage = (msg: ConversationMessage) => {
    const isUser    = msg.type === 'user'
    const pa        = msg.pendingAction
    const isActedOn = confirmedGarageMessageId === msg.id || confirmedBookingMessageId === msg.id || confirmedNoteMessageId === msg.id

    return (
      <div key={msg.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
        <div style={{
          maxWidth: '90%',
          padding: '10px 13px',
          borderRadius: isUser ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
          background: isUser
            ? `linear-gradient(135deg, ${C.midGreen}, #013d2a)`
            : 'rgba(2,89,64,0.3)',
          border: `1px solid ${isUser ? C.borderBright : C.border}`,
          color: C.white,
          fontSize: 13,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>

          {renderMessageText(msg.message)}

          {/* ── CHECKOUT: garage picker ── */}
          {pa?.type === 'checkout_garage_selection' && !isActedOn && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pa.garages.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => handleGarageSelect(msg.id, pa.vehicleId, g.id, g.name, pa.vehicleReg)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(179,242,67,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = C.accentDim)}
                  style={{
                    background: C.accentDim, border: `1px solid ${C.accent}`,
                    borderRadius: 8, padding: '7px 12px',
                    color: C.accent, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  🏭 {g.name}
                  {g.address
                    ? <span style={{ display: 'block', fontSize: 10, color: C.textMuted, fontWeight: 400 }}>{g.address}</span>
                    : null}
                </button>
              ))}
            </div>
          )}

          {/* ── RETURN: single vehicle confirm button ── */}
          {pa?.type === 'return_garage_selection' && pa.vehicleId && !isActedOn && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => handleReturnConfirm(msg.id, pa.vehicleId, pa.vehicleReg, pa.garageName)}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: C.accent, color: C.darkGreen,
                  fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  width: '100%',
                }}
              >
                ✅ Yes, return {pa.vehicleReg} from {pa.garageName}
              </button>
            </div>
          )}

          {/* ── RETURN: multi-vehicle picker ── */}
          {pa?.type === 'return_garage_selection' && !pa.vehicleId && pa.vehicles && !isActedOn && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {pa.vehicles.map((v: any) => (
                <button
                  key={v.id}
                  onClick={() => handleReturnConfirm(msg.id, v.id, v.reg, v.garageName)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(179,242,67,0.25)')}
                  onMouseLeave={e => (e.currentTarget.style.background = C.accentDim)}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: C.accentDim, color: C.accent,
                    fontSize: 12, fontWeight: 600,
                    border: `1px solid ${C.border}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  🏠 {v.reg} — {v.make} {v.model}
                  <span style={{ color: C.textMuted }}> @ {v.garageName}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── CHECK-IN WIDGET ── */}
          {pa?.type === 'checkin_widget' && !isActedOn && (
            <CheckInWidget
              msgId={msg.id}
              prefillReg={pa.prefillReg}
              fleetVehicles={pa.fleetVehicles}
              checkedInRegs={pa.checkedInRegs}
              onConfirm={async (vehicleId, vehicleReg, mileage, condition, status) => {
                setConfirmedGarageMessageId(msg.id)
                const res = await confirmCheckIn(vehicleId, vehicleReg, mileage, condition, status, currentBranchSlug)
                setConversation(prev => [...prev, {
                  id: Date.now().toString(), type: 'assistant',
                  message: res.answer, timestamp: new Date(),
                }])
              }}
              C={C}
            />
          )}

          {/* ── CHECK-IN CONFIRM (legacy — keep for back-compat) ── */}
          {pa?.type === 'checkin_confirm' && !isActedOn && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={async () => {
                  setConfirmedGarageMessageId(msg.id)
                  const res = await confirmCheckIn(pa.vehicleId, pa.vehicleReg)
                  setConversation(prev => [...prev, {
                    id: Date.now().toString(), type: 'assistant',
                    message: res.answer, timestamp: new Date(),
                  }])
                }}
                style={{
                  padding: '8px 14px', borderRadius: 8, width: '100%',
                  background: C.accent, color: C.darkGreen,
                  fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                }}
              >
                📋 Check in {pa.vehicleReg}
              </button>
            </div>
          )}

          {/* ── BRANCH TRANSFER CONFIRM ── */}
          {pa?.type === 'branch_transfer_confirm' && !isActedOn && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>
                📍 From: <strong style={{ color: C.textLight }}>{pa.fromBranchName}</strong>
                {' → '}
                <strong style={{ color: C.accent }}>{pa.toBranchName}</strong>
              </div>
              <button
                onClick={async () => {
                  setConfirmedGarageMessageId(msg.id)
                  const res = await confirmBranchTransfer(pa.vehicleId, pa.vehicleReg, pa.toBranchId, pa.toBranchName)
                  setConversation(prev => [...prev, {
                    id: Date.now().toString(), type: 'assistant',
                    message: res.answer, timestamp: new Date(),
                  }])
                }}
                style={{
                  padding: '8px 14px', borderRadius: 8, width: '100%',
                  background: C.accent, color: C.darkGreen,
                  fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                }}
              >
                🔀 Transfer {pa.vehicleReg} to {pa.toBranchName}
              </button>
            </div>
          )}

          {/* ── BOOKING: internal vs external ── */}
          {pa?.type === 'booking_provider_selection' && !isActedOn && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleProviderSelect(msg.id, false, pa)}
                style={{
                  flex: 1, minWidth: 120,
                  background: C.accentDim, border: `1px solid ${C.accent}`,
                  borderRadius: 8, padding: '8px 12px',
                  color: C.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                🏠 Internal Garage
              </button>
              <button
                onClick={() => handleProviderSelect(msg.id, true, pa)}
                style={{
                  flex: 1, minWidth: 120,
                  background: 'rgba(114,166,142,0.15)', border: `1px solid ${C.teal}`,
                  borderRadius: 8, padding: '8px 12px',
                  color: C.teal, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                🏭 External Garage
              </button>
            </div>
          )}

          {/* ── BOOKING: work selection + time slot ── */}
          {pa?.type === 'booking_work_selection' && !isActedOn && (() => {
            const sel         = selectedWork[msg.id] || pa.suggestedWork || []
            const cust        = customWorkText[msg.id] || ''
            const slot        = selectedTimeSlot[msg.id] || ''
            const extTime     = externalCustomTime[msg.id] || ''
            const isCustomSlot = customSlotActive[msg.id] || false
            const customTime  = customSlotTime[msg.id] || ''

            const hasWork = sel.length > 0 || cust.trim()
            const hasSlot = pa.isExternal
              ? extTime.trim()
              : isCustomSlot ? customTime.trim() : slot
            const canConfirm = hasWork && hasSlot

            return (
              <div style={{ marginTop: 10 }}>
                {/* Work chips */}
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>SELECT WORK:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {INTERNAL_WORK_TYPES.map(w => (
                    <button
                      key={w}
                      onClick={() => handleWorkToggle(msg.id, w)}
                      style={{
                        padding: '4px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: sel.includes(w) ? C.accent : 'rgba(255,255,255,0.07)',
                        color: sel.includes(w) ? C.darkGreen : C.textLight,
                        border: `1px solid ${sel.includes(w) ? C.accent : C.border}`,
                      }}
                    >
                      {w}
                    </button>
                  ))}
                </div>

                {/* Custom work text */}
                <input
                  type="text"
                  placeholder="Custom work (Cambelt, Gearbox...)"
                  value={cust}
                  onChange={e => setCustomWorkText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                  style={{
                    width: '100%', background: 'rgba(1,38,25,0.6)',
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: '6px 10px', color: C.white, fontSize: 11,
                    outline: 'none', marginBottom: 8, boxSizing: 'border-box',
                  }}
                />

                {/* Time selection */}
                {!pa.isExternal ? (
                  <>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>SELECT TIME SLOT:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {SLOTS.map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            setSelectedTimeSlot(prev => ({ ...prev, [msg.id]: s }))
                            setCustomSlotActive(prev => ({ ...prev, [msg.id]: false }))
                          }}
                          style={{
                            padding: '4px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                            background: !isCustomSlot && slot === s ? C.accent : 'rgba(255,255,255,0.07)',
                            color: !isCustomSlot && slot === s ? C.darkGreen : C.textLight,
                            border: `1px solid ${!isCustomSlot && slot === s ? C.accent : C.border}`,
                          }}
                        >
                          {s}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setCustomSlotActive(prev => ({ ...prev, [msg.id]: true }))
                          setSelectedTimeSlot(prev => ({ ...prev, [msg.id]: '' }))
                        }}
                        style={{
                          padding: '4px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                          background: isCustomSlot ? C.accent : 'rgba(255,255,255,0.07)',
                          color: isCustomSlot ? C.darkGreen : C.textMuted,
                          border: `1px dashed ${isCustomSlot ? C.accent : C.border}`,
                        }}
                      >
                        ✏️ Custom
                      </button>
                    </div>

                    {isCustomSlot && (
                      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="time"
                          value={customTime}
                          onChange={e => setCustomSlotTime(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          autoFocus
                          style={{
                            flex: 1, background: 'rgba(1,38,25,0.6)',
                            border: `1px solid ${C.teal}`, borderRadius: 8,
                            padding: '6px 10px', color: C.white, fontSize: 12, outline: 'none',
                          }}
                        />
                        {customTime && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: C.accent,
                            background: 'rgba(179,242,67,0.1)',
                            padding: '4px 8px', borderRadius: 6,
                            border: `1px solid ${C.accentDim}`, flexShrink: 0,
                          }}>
                            {customTime}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>DROP-OFF / COLLECTION TIME:</div>
                    <input
                      type="text"
                      placeholder="e.g. 09:00, 8:30am, drop off morning..."
                      value={extTime}
                      onChange={e => setExternalCustomTime(prev => ({ ...prev, [msg.id]: e.target.value }))}
                      style={{
                        width: '100%', background: 'rgba(1,38,25,0.6)',
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: '6px 10px', color: C.white, fontSize: 11,
                        outline: 'none', marginBottom: 8, boxSizing: 'border-box',
                      }}
                    />
                  </>
                )}

                <button
                  onClick={() => handleBookingConfirm(msg.id, pa)}
                  disabled={!canConfirm}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 8,
                    fontSize: 12, fontWeight: 700,
                    cursor: canConfirm ? 'pointer' : 'default',
                    background: canConfirm ? C.accent : 'rgba(179,242,67,0.2)',
                    color: C.darkGreen, border: 'none',
                  }}
                >
                  ✅ Confirm Booking
                </button>
              </div>
            )
          })()}

          {/* ── BOOKING: external garage selection ── */}
          {pa?.type === 'booking_external_garage_selection' && !isActedOn && (() => {
            const cgInput = customGarageInput[msg.id] || { name: '', address: '' }
            return (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pa.garages.map((g: any) => (
                  <button
                    key={g.id}
                    onClick={() => handleExternalGarageSelect(msg.id, pa, g.id, g.name, g.address || '')}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(179,242,67,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = C.accentDim)}
                    style={{
                      background: C.accentDim, border: `1px solid ${C.accent}`,
                      borderRadius: 8, padding: '7px 12px',
                      color: C.accent, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    🏭 {g.name}
                    {g.address
                      ? <span style={{ display: 'block', fontSize: 10, color: C.textMuted, fontWeight: 400 }}>{g.address}</span>
                      : null}
                  </button>
                ))}

                <div style={{ marginTop: 4, fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Or add a new garage:</div>
                <input
                  type="text"
                  placeholder="Garage name"
                  value={cgInput.name}
                  onChange={e => setCustomGarageInput(prev => ({ ...prev, [msg.id]: { ...cgInput, name: e.target.value } }))}
                  style={{
                    background: 'rgba(1,38,25,0.6)', border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '6px 10px',
                    color: C.white, fontSize: 11, outline: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Address (optional)"
                  value={cgInput.address}
                  onChange={e => setCustomGarageInput(prev => ({ ...prev, [msg.id]: { ...cgInput, address: e.target.value } }))}
                  style={{
                    background: 'rgba(1,38,25,0.6)', border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '6px 10px',
                    color: C.white, fontSize: 11, outline: 'none',
                  }}
                />
                {cgInput.name.trim() && (
                  <button
                    onClick={() => handleExternalGarageSelect(msg.id, pa, 'custom', cgInput.name.trim(), cgInput.address.trim())}
                    style={{
                      padding: '7px', borderRadius: 8,
                      background: C.accent, color: C.darkGreen,
                      fontSize: 12, fontWeight: 700,
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    ✅ Use {cgInput.name}
                  </button>
                )}
              </div>
            )
          })()}

          {/* ── Reg needed — inline registration input ──────────────────── */}
          {pa?.type === 'reg_needed' && !isActedOn && (() => {
            const regKey = `reg_input_${msg.id}`
            const currentVal = (noteEdits[regKey] as any)?.reg || ''
            return (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>{pa.prompt}</div>
                <input
                  type="text"
                  placeholder="e.g. AB12 CDE"
                  value={currentVal}
                  onChange={e => setNoteEdits(prev => ({ ...prev, [regKey]: { reg: e.target.value.toUpperCase() } }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && currentVal.trim()) {
                      setConfirmedNoteMessageId(msg.id)
                      // Build a natural message from the intent + reg and submit it
                      const reg = currentVal.trim()
                      const phrase =
                        pa.intent === 'checkout'  ? `${reg} out to garage` :
                        pa.intent === 'return'    ? `${reg} returned` :
                        pa.intent === 'hire_out'  ? `${reg} out on hire` :
                        pa.intent === 'mot_done'  ? `${reg} mot done today` : reg
                      handleSubmit(undefined, phrase)
                    }
                  }}
                  autoFocus
                  style={{
                    width: '100%', background: 'rgba(1,38,25,0.8)',
                    border: `1px solid ${C.accent}`, borderRadius: 8,
                    padding: '8px 12px', color: C.white,
                    fontSize: 14, fontFamily: 'monospace', fontWeight: 700,
                    outline: 'none', textTransform: 'uppercase', letterSpacing: '0.1em',
                    boxSizing: 'border-box' as const,
                  }}
                />
                <button
                  disabled={!currentVal.trim()}
                  onClick={() => {
                    if (!currentVal.trim()) return
                    setConfirmedNoteMessageId(msg.id)
                    const reg = currentVal.trim()
                    const phrase =
                      pa.intent === 'checkout'  ? `${reg} out to garage` :
                      pa.intent === 'return'    ? `${reg} returned` :
                      pa.intent === 'hire_out'  ? `${reg} out on hire` :
                      pa.intent === 'mot_done'  ? `${reg} mot done today` : reg
                    handleSubmit(undefined, phrase)
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: C.accent, color: C.darkGreen,
                    fontWeight: 700, fontSize: 12, border: 'none',
                    cursor: currentVal.trim() ? 'pointer' : 'not-allowed',
                    opacity: currentVal.trim() ? 1 : 0.4,
                  }}
                >
                  Continue →
                </button>
              </div>
            )
          })()}

          {/* ── Note confirm card — full featured (identical to Smart Paste modal) ── */}
          {pa?.type === 'note_confirm' && !isActedOn && (() => {
            // Initialise edits from parsedNotes on first render
            if (!noteEdits[msg.id]) {
              // Defer state update to avoid render-during-render
              setTimeout(() => setNoteEdits(prev => ({ ...prev, [msg.id]: pa.parsedNotes.map((n: any) => ({ ...n })) })), 0)
            }
            const edits: any[] = noteEdits[msg.id] || pa.parsedNotes
            const setEdits = (updated: any[]) => setNoteEdits(prev => ({ ...prev, [msg.id]: updated }))
            const updateField = (i: number, field: string, val: any) => {
              setEdits(edits.map((n: any, idx: number) => idx === i ? { ...n, [field]: val } : n))
            }
            const removeNote = (i: number) => setEdits(edits.filter((_: any, idx: number) => idx !== i))

            const inputStyle: React.CSSProperties = {
              width: '100%', background: 'rgba(1,38,25,0.8)',
              border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '5px 8px', color: C.white,
              fontSize: 11, outline: 'none', boxSizing: 'border-box',
            }
            const labelStyle: React.CSSProperties = {
              fontSize: 10, color: C.textMuted, marginBottom: 2, display: 'block',
            }

            const priorityColor: Record<string, string> = { urgent: '#ef4444', medium: '#f59e0b', low: '#72A68E' }

            return (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Contact details card — from URL scraping */}
                {pa.contactDetails && (
                  <div style={{
                    background: 'rgba(179,242,67,0.08)', border: `1px solid ${C.accent}`,
                    borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                    <div style={{ fontSize: 10, color: C.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      🔗 Contact Details Found
                    </div>
                    <div style={{ fontSize: 11, color: C.white, fontWeight: 600 }}>{pa.contactDetails.company}</div>
                    {pa.contactDetails.phones.map((p: string, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: C.textLight }}>📞 {p}</div>
                    ))}
                    {pa.contactDetails.emails.map((e: string, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: C.textLight }}>✉️ {e}</div>
                    ))}
                  </div>
                )}

                {/* One editable card per parsed note */}
                {edits.map((n: any, i: number) => (
                  <div key={i} style={{
                    background: 'rgba(1,38,25,0.7)',
                    border: `1px solid ${priorityColor[n.priority] || C.border}`,
                    borderRadius: 10, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Header row — note count + delete button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {edits.length > 1 ? `Note ${i + 1} of ${edits.length}` : 'Note'}
                      </span>
                      {edits.length > 1 && (
                        <button
                          onClick={() => removeNote(i)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                          title="Remove this note"
                        >×</button>
                      )}
                    </div>

                    {/* Summary textarea */}
                    <div>
                      <span style={labelStyle}>📝 Task</span>
                      <textarea
                        value={n.summary}
                        onChange={e => updateField(i, 'summary', e.target.value)}
                        rows={2}
                        style={{ ...inputStyle, resize: 'none', lineHeight: 1.4 }}
                      />
                    </div>

                    {/* Date + Time */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <span style={labelStyle}>📅 Date</span>
                        <input type="date" value={n.date} onChange={e => updateField(i, 'date', e.target.value)} style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={labelStyle}>⏰ Time</span>
                        <input type="time" value={n.scheduledTime || ''} onChange={e => updateField(i, 'scheduledTime', e.target.value || null)} style={inputStyle} />
                      </div>
                    </div>

                    {/* Priority + Category */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <span style={labelStyle}>🚦 Priority</span>
                        <select value={n.priority} onChange={e => updateField(i, 'priority', e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="urgent">🔴 Urgent</option>
                          <option value="medium">🟡 Medium</option>
                          <option value="low">🟢 Low</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={labelStyle}>📂 Category</span>
                        <select value={n.category} onChange={e => updateField(i, 'category', e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="work">💼 Work</option>
                          <option value="vehicle">🚗 Vehicle</option>
                          <option value="finance">💰 Finance</option>
                          <option value="personal">👤 Personal</option>
                        </select>
                      </div>
                    </div>

                    {/* Recurrence + Reg */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <span style={labelStyle}>🔁 Repeat</span>
                        <select value={n.recurrence || 'none'} onChange={e => updateField(i, 'recurrence', e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="none">No repeat</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={labelStyle}>🚘 Reg</span>
                        <input
                          type="text" placeholder="e.g. AB12CDE"
                          value={n.vehicleReg || ''}
                          onChange={e => updateField(i, 'vehicleReg', e.target.value.toUpperCase() || null)}
                          style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Action buttons — Re-type | Save */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => {
                      // Reset the card — user will type a new message to re-parse
                      setConfirmedNoteMessageId(msg.id)
                      setConversation(prev => [...prev, {
                        id: (Date.now() + 1).toString(), type: 'assistant',
                        message: `No problem — just type the note again with more detail and I'll re-parse it.`,
                        timestamp: new Date(),
                      }])
                    }}
                    style={{
                      flex: 1, padding: '9px 10px', borderRadius: 8,
                      background: 'transparent', border: `1px solid ${C.border}`,
                      color: C.textMuted, fontWeight: 600, fontSize: 11, cursor: 'pointer',
                    }}
                  >← Re-type</button>

                  <button
                    onClick={async () => {
                      if (edits.length === 0) return
                      setConfirmedNoteMessageId(msg.id)
                      try {
                        const uid = user?.uid
                        if (!uid) { alert('Not logged in'); return }
                        // Supabase has no subcollections — user_notes rows carry
                        // user_id + organization_id. RLS scopes to the caller's org,
                        // so we resolve the org id from the profile before inserting.
                        const profile = await userProfileService.getProfile(uid)
                        const organizationId = profile?.organizationId || uid
                        const { error } = await supabase.from('user_notes').insert(
                          edits.map((n: any) => ({
                            user_id:                   uid,
                            organization_id:           organizationId,
                            text:                      n.summary,
                            date:                      n.date,
                            scheduled_time:            n.scheduledTime || null,
                            priority:                  n.priority,
                            category:                  n.category,
                            vehicle_reg:               n.vehicleReg || null,
                            recurrence:                n.recurrence || 'none',
                            done:                      false,
                            created_at:                new Date().toISOString(),
                            scheduled_notification_at: buildScheduledNotificationAt(n.date, n.scheduledTime || null),
                            notification_sent:         false,
                          }))
                        )
                        if (error) throw error
                        setConversation(prev => [...prev, {
                          id: (Date.now() + 1).toString(), type: 'assistant',
                          message: edits.length === 1
                            ? `✅ Note saved! You'll get a reminder as usual.`
                            : `✅ ${edits.length} notes saved!`,
                          timestamp: new Date(),
                        }])
                      } catch (err: any) {
                        setConversation(prev => [...prev, {
                          id: (Date.now() + 1).toString(), type: 'assistant',
                          message: `Couldn't save — ${err.message || 'try again'}`,
                          timestamp: new Date(),
                        }])
                      }
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    style={{
                      flex: 2, padding: '9px 14px', borderRadius: 8,
                      background: C.accent, color: C.darkGreen,
                      fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer',
                    }}
                  >
                    💾 Save {edits.length > 1 ? `${edits.length} Notes` : 'Note'}
                  </button>
                </div>

              </div>
            )
          })()}

          {/* Timestamp */}
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 5, textAlign: 'right' }}>
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PORTAL RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (!mounted) return null

  return createPortal(
    <>
      {/* ── TRIGGER BUTTON ─────────────────────────────────────────────────── */}
      {!isOpen && !anyModalOpen && (
        <button
          onClick={() => {
            if ((window as any).__zaoLongPressed) {
              (window as any).__zaoLongPressed = false
              return
            }
            setIsOpen(true)
          }}
          onTouchStart={() => {
            (window as any).__zaoLongPress = setTimeout(() => {
              (window as any).__zaoLongPressed = true
              window.dispatchEvent(new CustomEvent('yardao:toggle-voice'))
            }, 600)
          }}
          onTouchEnd={() => {
            clearTimeout((window as any).__zaoLongPress)
            if ((window as any).__zaoLongPressed) {
              (window as any).__zaoLongPressed = false
              return
            }
          }}
          onTouchMove={() => {
            clearTimeout((window as any).__zaoLongPress)
          }}
          title="Fleet AI Assistant — long press for voice"
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          style={{
            position: 'fixed',
            bottom: isMobile ? `${bottomOffset + 12}px` : `${bottomOffset + 16}px`,
            // Desktop: bottom-left (just right of the nav). Mobile: bottom-right (unchanged).
            right: isMobile ? '24px' : 'auto',
            left: isMobile ? 'auto' : '280px',
            width: '64px', height: '64px',
            borderRadius: '50%',
            background: '#012619', border: '2px solid #b3f243',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: 0,
            filter: 'drop-shadow(0 4px 16px rgba(1,38,25,0.6))',
            transition: 'transform 0.2s, bottom 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <Sparkles style={{ width: 30, height: 30, color: '#fdaf0d' }} />
        </button>
      )}

      {/* ── CHAT PANEL ─────────────────────────────────────────────────────── */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? `${bottomOffset + 80}px` : `${bottomOffset + 84}px`,
          // Desktop: anchor the panel bottom-left; mobile: bottom (unchanged).
          right: isMobile ? '12px' : 'auto',
          left: isMobile ? '12px' : '280px',
          top: 'auto',
          width: isMobile ? 'auto' : '380px',
          maxHeight: isMobile ? 'calc(100dvh - 160px)' : '540px',
          borderRadius: 18,
          background: `linear-gradient(160deg, #013d2a 0%, ${C.darkGreen} 100%)`,
          border: `1px solid ${C.borderBright}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', zIndex: 99998,
        }}>

          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(2,89,64,0.4)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: C.accentDim, border: `1px solid ${C.accent}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles style={{ width: 15, height: 15, color: C.accent }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.white }}>Zao</div>
                <div style={{ fontSize: 10, color: C.accent }}>
                  {loading ? 'Thinking...' : '● Online'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                title="Clear conversation"
                onClick={() => {
                  setConversation([])
                  setNoteEdits({})
                  setConfirmedGarageMessageId(null)
                  setConfirmedNoteMessageId(null)
                  setConfirmedBookingMessageId(null)
                  setAwaitingContext(null)
                  setInputValue('')
                  clearError()
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
                  width: 30, height: 30, cursor: 'pointer', color: C.textLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <RotateCcw style={{ width: 13, height: 13 }} />
              </button>
              <button
                onClick={() => { setIsOpen(false); clearError() }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
                  width: 30, height: 30, cursor: 'pointer', color: C.textLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <X style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px 12px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {conversation.length === 0 && (
              <div style={{
                textAlign: 'center', color: C.textMuted, fontSize: 12,
                marginTop: 40, lineHeight: 1.8,
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
                <div style={{ color: C.textLight, fontWeight: 600, marginBottom: 6 }}>Zao — Fleet Intelligence</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
                  Your AI assistant for yard operations.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left', width: '100%' }}>
                  {/* Interactive chips — tap to start the flow, Zao will ask for the reg */}
                  {([
                    ['🚗', 'Check out a vehicle to external garage', true],
                    ['🔄', 'Return a vehicle from external garage', true],
                    ['🔑', 'Set a vehicle out on hire', true],
                    ['✅', 'Mark MOT as done', true],
                  ] as [string, string, boolean][]).map(([icon, text], i) => (
                    <div key={i}
                      onClick={() => handleSubmit(undefined, text)}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.accent; (e.currentTarget as HTMLDivElement).style.background = 'rgba(179,242,67,0.08)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; (e.currentTarget as HTMLDivElement).style.background = 'rgba(2,89,64,0.15)' }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(2,89,64,0.15)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '7px 10px',
                        fontSize: 11, color: C.textLight, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        <span>{text}</span>
                      </div>
                      <span style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>TAP →</span>
                    </div>
                  ))}

                  {/* Divider */}
                  <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0', opacity: 0.5 }} />

                  {/* Example showcase chips — display only */}
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    You can also ...
                  </div>
                  {([
                    ['🎤', 'Long-press my icon for voice commands'],
                    ['🏭', 'What vehicles are at external garages?'],
                    ['🌤️', "What's the weather in London?"],
                    ['📋', 'Remind me to call insurance tomorrow at 10am'],
                    ['📅', 'Any bookings for next Friday?'],
                  ] as [string, string][]).map(([icon, text], i) => (
                    
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'transparent', border: `1px dashed ${C.border}`,
                      borderRadius: 8, padding: '6px 10px',
                      fontSize: 11, color: C.textMuted,
                    }}>
                      <span style={{ fontSize: 13 }}>{icon}</span>
                      <span style={{ fontStyle: 'italic' }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {conversation.map(msg => renderMessage(msg))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
                <div style={{
                  background: 'rgba(2,89,64,0.3)', border: `1px solid ${C.border}`,
                  borderRadius: '14px 14px 14px 3px', padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: C.textLight, fontSize: 13,
                }}>
                  <Loader2 style={{ width: 13, height: 13, color: C.accent, animation: 'spin 1s linear infinite' }} />
                  Thinking...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error bar */}
          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.15)', borderTop: '1px solid rgba(220,38,38,0.3)',
              padding: '7px 14px', fontSize: 11, color: '#fca5a5', flexShrink: 0,
            }}>
              {error}
            </div>
          )}

          {/* Input bar */}
          <div style={{
            padding: '11px 14px', borderTop: `1px solid ${C.border}`,
            background: C.midGreen, flexShrink: 0,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="Ask me anything..." data-zao-input="true"
              disabled={loading}
              style={{
                flex: 1, background: 'rgba(1,38,25,0.6)',
                border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '8px 12px', color: C.white, fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !inputValue.trim()}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: inputValue.trim() ? C.accent : 'rgba(179,242,67,0.2)',
                border: 'none',
                cursor: inputValue.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              {loading
                ? <Loader2 style={{ width: 15, height: 15, color: C.darkGreen, animation: 'spin 1s linear infinite' }} />
                : <Send style={{ width: 15, height: 15, color: C.darkGreen }} />
              }
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}