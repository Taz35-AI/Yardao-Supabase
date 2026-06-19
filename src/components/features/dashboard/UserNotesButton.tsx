// src/components/features/dashboard/UserNotesButton.tsx
// 📋 Personal Task Manager
// ✅ Spring Burst entrance animation
// ✅ Timed reminders: 60min, 30min, 15min before scheduledTime — snooze each
// ✅ Push notification scheduling via Firestore + Cloud Functions
// Works on mobile + desktop.

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  StickyNote, X, Plus, Trash2, Calendar, ChevronDown, ChevronUp,
  Bell, Check, RotateCcw, Clock, Car, Download, Archive,
  AlertTriangle, AlertCircle, Info, ChevronLeft, ChevronRight, List,
  Sparkles, Timer
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { userProfileService } from '@/lib/firestore'
import { toast } from 'sonner'
import { parseMessageWithGroq, ParsedNote } from '@/lib/groqNoteParser'
import { useT } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority   = 'low' | 'medium' | 'urgent'
type Category   = 'personal' | 'work' | 'vehicle' | 'finance'
type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'
type ViewMode   = 'list' | 'calendar'

interface UserNote {
  id: string
  text: string
  date: string
  scheduledTime: string | null   // HH:mm or null
  createdAt: string
  priority: Priority
  category: Category
  recurrence: Recurrence
  vehicleReg?: string | null
  done: boolean
  archivedAt?: string | null
}

interface FleetVehicle {
  id: string
  registration: string
  make: string
  model: string
  colour?: string
}

interface UserNotesButtonProps {
  className?: string
}

// ─── Timed reminder type ──────────────────────────────────────────────────────
type ReminderInterval = 60 | 30 | 15

interface FiredReminder {
  noteId: string
  interval: ReminderInterval
  date: string
}

interface ActiveReminder {
  note: UserNote
  interval: ReminderInterval
  snoozedUntil: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayString() {
  return new Date().toISOString().split('T')[0]
}

function getGreetingKey() {
  const h = new Date().getHours()
  if (h < 11) return 'greetingMorning'
  if (h < 17) return 'greetingAfternoon'
  return 'greetingEvening'
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function nextRecurringDate(date: string, rec: Recurrence): string | null {
  if (rec === 'daily')   return addDays(date, 1)
  if (rec === 'weekly')  return addDays(date, 7)
  if (rec === 'monthly') {
    const d = new Date(date + 'T00:00:00')
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  }
  return null
}

/** Returns minutes until HH:mm on today's date. Negative = already past. */
function minutesUntil(timeStr: string): number {
  const now = new Date()
  const [h, m] = timeStr.split(':').map(Number)
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0)
  return Math.round((target.getTime() - now.getTime()) / 60000)
}

/**
 * Converts a date string (YYYY-MM-DD) and time string (HH:mm) into an ISO
 * timestamp for Firestore. The Cloud Function queries for notes where
 * scheduledNotificationAt <= now to fire push notifications.
 * Returns null if no scheduledTime is provided.
 */
function buildScheduledNotificationAt(date: string, scheduledTime: string | null): string | null {
  if (!scheduledTime) return null
  const [hours, minutes] = scheduledTime.split(':').map(Number)
  const dt = new Date(date + 'T00:00:00')
  dt.setHours(hours, minutes, 0, 0)
  return dt.toISOString()
}

/** Local storage key for fired reminders */
function firedKey(uid: string) {
  return `yardao_fired_reminders_${uid}_${getTodayString()}`
}

function loadFiredReminders(uid: string): FiredReminder[] {
  try {
    const raw = localStorage.getItem(firedKey(uid))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveFiredReminders(uid: string, fired: FiredReminder[]) {
  try { localStorage.setItem(firedKey(uid), JSON.stringify(fired)) } catch {}
}

function hasFired(fired: FiredReminder[], noteId: string, interval: ReminderInterval) {
  return fired.some(f => f.noteId === noteId && f.interval === interval && f.date === getTodayString())
}

function markFired(uid: string, fired: FiredReminder[], noteId: string, interval: ReminderInterval): FiredReminder[] {
  const updated = [...fired, { noteId, interval, date: getTodayString() }]
  saveFiredReminders(uid, updated)
  return updated
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; border: string; dot: string; pillBg: string; pillText: string; icon: any }> = {
  low:    { label: 'Low',    color: 'text-[#72A68E]', bg: 'bg-[#72A68E]/10', border: 'border-[#72A68E]/30', dot: 'bg-[#72A68E]',  pillBg: 'bg-[#72A68E]',  pillText: 'text-white', icon: Info },
  medium: { label: 'Medium', color: 'text-amber-600', bg: 'bg-amber-50',     border: 'border-amber-200',    dot: 'bg-amber-400',  pillBg: 'bg-amber-400',  pillText: 'text-white', icon: AlertCircle },
  urgent: { label: 'Urgent', color: 'text-red-600',   bg: 'bg-red-50',       border: 'border-red-200',      dot: 'bg-red-500',    pillBg: 'bg-red-500',    pillText: 'text-white', icon: AlertTriangle },
}

const CATEGORY_CONFIG: Record<Category, { label: string; dot: string }> = {
  personal: { label: 'Personal', dot: 'bg-purple-400' },
  work:     { label: 'Work',     dot: 'bg-[#025940]'  },
  vehicle:  { label: 'Vehicle',  dot: 'bg-blue-400'   },
  finance:  { label: 'Finance',  dot: 'bg-amber-400'  },
}

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none',    label: 'No repeat' },
  { value: 'daily',   label: 'Daily'     },
  { value: 'weekly',  label: 'Weekly'    },
  { value: 'monthly', label: 'Monthly'   },
]

// i18n key suffixes (NOT user-facing literals — keys into dashboard.notes.*)
const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  low: 'priorityLow', medium: 'priorityMedium', urgent: 'priorityUrgent',
}
const CATEGORY_LABEL_KEY: Record<Category, string> = {
  personal: 'categoryPersonal', work: 'categoryWork', vehicle: 'categoryVehicle', finance: 'categoryFinance',
}
const RECURRENCE_LABEL_KEY: Record<Recurrence, string> = {
  none: 'recurNone', daily: 'recurDaily', weekly: 'recurWeekly', monthly: 'recurMonthly',
}
const DAY_KEYS   = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun']
const MONTH_KEYS = ['monthJanuary','monthFebruary','monthMarch','monthApril','monthMay','monthJune','monthJuly','monthAugust','monthSeptember','monthOctober','monthNovember','monthDecember']

/** INTERVALS that trigger countdown reminders (minutes before scheduledTime) */
const REMINDER_INTERVALS: ReminderInterval[] = [60, 30, 15]

function exportNotes(notes: UserNote[], t: (key: string, vars?: Record<string, string | number>) => string) {
  const lines = [
    t('dashboard.notes.exportHeader'),
    t('dashboard.notes.exportedAt', { date: new Date().toLocaleString('en-GB') }),
    '═'.repeat(40), '',
    ...notes.map(n => [
      `[${n.priority.toUpperCase()}] ${n.text}`,
      t('dashboard.notes.exportDateLine', {
        date: n.date,
        timePart: n.scheduledTime ? ` @ ${n.scheduledTime}` : '',
        category: t('dashboard.notes.' + CATEGORY_LABEL_KEY[n.category]),
        vehiclePart: n.vehicleReg ? ` | Vehicle: ${n.vehicleReg}` : '',
        repeatPart: n.recurrence !== 'none' ? ` | Repeats: ${n.recurrence}` : '',
      }),
      n.done ? t('dashboard.notes.exportCompleted') : t('dashboard.notes.exportPending'),
      '─'.repeat(40),
    ].join('\n')),
  ].join('\n')
  const blob = new Blob([lines], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `yardao-notes-${getTodayString()}.txt`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function UserNotesButton({ className = '' }: UserNotesButtonProps) {
  const { user } = useAuth()
  const t = useT()

  const panelRef        = useRef<HTMLDivElement>(null)
  const vehicleInputRef = useRef<HTMLInputElement>(null)

  const [isOpen, setIsOpen]                   = useState(false)
  const [notes, setNotes]                     = useState<UserNote[]>([])
  const [loading, setLoading]                 = useState(false)

  // ── Daily greeting popup ─────────────────────────────────────────────────────
  const [showTodayPopup, setShowTodayPopup]   = useState(false)
  const [todayNotes, setTodayNotes]           = useState<UserNote[]>([])
  const [popupAnimKey, setPopupAnimKey]       = useState(0)

  // ── Timed reminders state ────────────────────────────────────────────────────
  const [reminderQueue, setReminderQueue]     = useState<ActiveReminder[]>([])
  const [activeReminder, setActiveReminder]   = useState<ActiveReminder | null>(null)
  const [reminderAnimKey, setReminderAnimKey] = useState(0)
  const firedRef = useRef<FiredReminder[]>([])
  const reminderTickRef = useRef<NodeJS.Timeout | null>(null)

  const [snoozeTimer, setSnoozeTimer]         = useState<NodeJS.Timeout | null>(null)
  const [filterCategory, setFilterCategory]   = useState<Category | 'all'>('all')
  const [showArchive, setShowArchive]         = useState(false)
  const [viewMode, setViewMode]               = useState<ViewMode>('list')
  const [calendarMonth, setCalendarMonth]     = useState(new Date())
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null)

  // ── Manual add form ──────────────────────────────────────────────────────────
  const [newText,          setNewText]          = useState('')
  const [newDate,          setNewDate]          = useState(getTodayString())
  const [newScheduledTime, setNewScheduledTime] = useState('')
  const [newPriority,      setNewPriority]      = useState<Priority>('medium')
  const [newCategory,      setNewCategory]      = useState<Category>('work')
  const [newRecurrence,    setNewRecurrence]    = useState<Recurrence>('none')
  const [newVehicleReg,    setNewVehicleReg]    = useState('')
  const [showAdvanced,     setShowAdvanced]     = useState(false)

  // ── Fleet search ─────────────────────────────────────────────────────────────
  const [fleetVehicles,       setFleetVehicles]       = useState<FleetVehicle[]>([])
  const [vehicleSearchTerm,   setVehicleSearchTerm]   = useState('')
  const [vehicleResults,      setVehicleResults]      = useState<FleetVehicle[]>([])
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false)
  const [orgId, setOrgId]                             = useState<string | null>(null)

  // ── Smart Paste ──────────────────────────────────────────────────────────────
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteText,      setPasteText]      = useState('')
  const [parseLoading,   setParseLoading]   = useState(false)
  const [parseError,     setParseError]     = useState<string | null>(null)
  const [parsedNotes,    setParsedNotes]    = useState<ParsedNote[]>([])

  // ── Click outside ────────────────────────────────────────────────────────────
  useEffect(() => {
    const isMobile = () => window.innerWidth < 768
    const handleClickOutside = (e: MouseEvent) => {
      if (isMobile()) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // ── Load org + fleet ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    userProfileService.getProfile(user.uid).then(p => { if (p?.organizationId) setOrgId(p.organizationId) })
  }, [user?.uid])

  useEffect(() => {
    if (!orgId) return
    const loadFleet = async () => {
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, registration, make, model, colour')
          .eq('organization_id', orgId)
          .neq('is_defleeted', true)
        if (error) throw error
        setFleetVehicles((data ?? []).map(d => ({ id: d.id, registration: d.registration || '', make: d.make || '', model: d.model || '', colour: d.colour || '' })))
      } catch {
        try {
          const { data, error } = await supabase
            .from('vehicles')
            .select('id, registration, make, model, colour, is_defleeted, current_status')
            .eq('organization_id', orgId)
          if (error) throw error
          setFleetVehicles((data ?? []).filter(d => !d.is_defleeted && d.current_status !== 'defleeted').map(d => ({ id: d.id, registration: d.registration || '', make: d.make || '', model: d.model || '', colour: d.colour || '' })))
        } catch {}
      }
    }
    loadFleet()
  }, [orgId])

  useEffect(() => {
    if (vehicleSearchTerm.length < 2) { setVehicleResults([]); setShowVehicleDropdown(false); return }
    const term = vehicleSearchTerm.toUpperCase()
    const results = fleetVehicles.filter(v => v.registration.toUpperCase().includes(term) || v.make.toUpperCase().includes(term) || v.model.toUpperCase().includes(term)).slice(0, 6)
    setVehicleResults(results)
    setShowVehicleDropdown(results.length > 0)
  }, [vehicleSearchTerm, fleetVehicles])

  // ── Notes write target ─────────────────────────────────────────────────────
  // Supabase has no subcollections; rows in public.user_notes carry user_id +
  // organization_id. This returns the ids needed to scope/insert, or null when
  // we can't yet write (no signed-in user, or org not loaded) — preserving the
  // original `const col = notesCol(); if (!col) return` guard pattern.
  const notesCol = useCallback(() => {
    if (!user?.uid || !orgId) return null
    return { userId: user.uid, orgId }
  }, [user?.uid, orgId])

  // Row (snake_case) → UserNote (camelCase), applying the same field defaults
  // the Firestore loader applied.
  const rowToNote = (row: any): UserNote => ({
    id: row.id,
    text: row.text ?? '',
    date: row.date,
    scheduledTime: row.scheduled_time ?? null,
    priority: (row.priority ?? 'medium') as Priority,
    category: (row.category ?? 'work') as Category,
    recurrence: (row.recurrence ?? 'none') as Recurrence,
    vehicleReg: row.vehicle_reg ?? null,
    done: row.done ?? false,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? '',
  })

  // ── Load notes ────────────────────────────────────────────────────────────────
  const loadNotes = useCallback(async () => {
    if (!user?.uid) return []
    try {
      // RLS scopes to the caller's org; also filter to this user's own notes.
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .eq('user_id', user.uid)
        .order('date', { ascending: true })
      if (error) throw error
      const loaded = (data ?? []).map(rowToNote)
      setNotes(loaded)
      return loaded
    } catch { return [] }
  }, [user?.uid])

  // ══════════════════════════════════════════════════════════════════
  // DAILY GREETING POPUP — spring burst on load
  // ══════════════════════════════════════════════════════════════════
  const POPUP_COOLDOWN_MS = 3 * 60 * 60 * 1000
  const getPopupKey = (uid: string) => `yardao_notes_popup_${uid}_${getTodayString()}`

  const shouldShowPopup = (uid: string): boolean => {
    const raw = localStorage.getItem(getPopupKey(uid))
    if (!raw) return true
    const lastShown = Number(raw)
    if (isNaN(lastShown)) return true
    return (Date.now() - lastShown) >= POPUP_COOLDOWN_MS
  }

  const markPopupShown = (uid: string) => {
    localStorage.setItem(getPopupKey(uid), Date.now().toString())
  }

  useEffect(() => {
    if (!user?.uid) return
    if (!shouldShowPopup(user.uid)) return
    const check = async () => {
      const loaded = await loadNotes()
      const todayItems = loaded.filter(n => n.date === getTodayString() && !n.done && n.priority !== 'low')
      if (todayItems.length > 0) {
        setTodayNotes(todayItems)
        setTimeout(() => {
          setPopupAnimKey(k => k + 1)
          setShowTodayPopup(true)
          markPopupShown(user.uid)
        }, 1500)
      } else {
        markPopupShown(user.uid)
      }
    }
    check()
  }, [user?.uid, loadNotes])

  // ══════════════════════════════════════════════════════════════════
  // TIMED REMINDERS ENGINE
  // ══════════════════════════════════════════════════════════════════
  const checkTimedReminders = useCallback((currentNotes: UserNote[]) => {
    if (!user?.uid) return
    const today = getTodayString()
    const fired = firedRef.current

    const toFire: ActiveReminder[] = []

    currentNotes.forEach(note => {
      if (note.done) return
      if (note.date !== today) return
      if (!note.scheduledTime) return

      REMINDER_INTERVALS.forEach(interval => {
        if (hasFired(fired, note.id, interval)) return

        const mins = minutesUntil(note.scheduledTime!)
        if (mins <= interval && mins >= interval - 2) {
          firedRef.current = markFired(user.uid, firedRef.current, note.id, interval)
          toFire.push({ note, interval, snoozedUntil: null })
        }
      })
    })

    if (toFire.length > 0) {
      setReminderQueue(prev => [...prev, ...toFire])
    }
  }, [user?.uid])

  // Dequeue: show next reminder when current is dismissed
  useEffect(() => {
    if (activeReminder === null && reminderQueue.length > 0) {
      const next = reminderQueue[0]
      setReminderQueue(prev => prev.slice(1))
      setActiveReminder(next)
      setReminderAnimKey(k => k + 1)
    }
  }, [activeReminder, reminderQueue])

  // Ticker: check every 30s
  useEffect(() => {
    if (!user?.uid) return
    firedRef.current = loadFiredReminders(user.uid)

    const tick = () => {
      setNotes(current => {
        checkTimedReminders(current)
        return current
      })
    }

    reminderTickRef.current = setInterval(tick, 30_000)
    return () => { if (reminderTickRef.current) clearInterval(reminderTickRef.current) }
  }, [user?.uid, checkTimedReminders])

  // Dismiss active reminder
  const dismissActiveReminder = useCallback(() => {
    setActiveReminder(null)
  }, [])

  // Snooze active reminder — re-queues it after snoozeMinutes
  const snoozeActiveReminder = useCallback((snoozeMinutes: 5 | 10 | 20) => {
    if (!activeReminder) return
    toast.success(t('dashboard.notes.snoozedMin', { count: snoozeMinutes }))
    const snoozed = { ...activeReminder, snoozedUntil: Date.now() + snoozeMinutes * 60_000 }
    setActiveReminder(null)
    setTimeout(() => {
      setReminderQueue(prev => [...prev, snoozed])
    }, snoozeMinutes * 60_000)
  }, [activeReminder])

  // ── Daily snooze (greeting popup) ────────────────────────────────────────────
  const handleSnooze = () => {
    setShowTodayPopup(false)
    toast.success(t('dashboard.notes.snoozed2h'))
    if (user?.uid) {
      const twoHoursAgo = Date.now() - (1 * 60 * 60 * 1000)
      localStorage.setItem(getPopupKey(user.uid), twoHoursAgo.toString())
    }
    const snoozeTimeout = setTimeout(() => {
      setPopupAnimKey(k => k + 1)
      setShowTodayPopup(true)
    }, 2 * 60 * 60 * 1000)
    setSnoozeTimer(snoozeTimeout)
  }

  useEffect(() => { if (isOpen) loadNotes() }, [isOpen, loadNotes])
  useEffect(() => () => { if (snoozeTimer) clearTimeout(snoozeTimer) }, [snoozeTimer])

  // ── Manual add ────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newText.trim() || !newDate) return
    const col = notesCol(); if (!col) return
    setLoading(true)
    try {
      const { error } = await supabase.from('user_notes').insert({
        user_id: col.userId,
        organization_id: col.orgId,
        text: newText.trim(),
        date: newDate,
        scheduled_time: newScheduledTime || null,
        priority: newPriority,
        category: newCategory,
        recurrence: newRecurrence,
        vehicle_reg: newVehicleReg.trim().toUpperCase() || null,
        done: false,
        created_at: new Date().toISOString(),
        scheduled_notification_at: buildScheduledNotificationAt(newDate, newScheduledTime || null),
        notification_sent: false,
      })
      if (error) throw error
      setNewText(''); setNewDate(getTodayString()); setNewScheduledTime(''); setNewPriority('medium'); setNewCategory('work'); setNewRecurrence('none'); setNewVehicleReg(''); setVehicleSearchTerm(''); setShowAdvanced(false)
      await loadNotes(); window.dispatchEvent(new Event('yardao:notes-changed')); toast.success(t('dashboard.notes.noteSaved'))
    } catch { toast.error(t('dashboard.notes.failedSaveNote')) }
    finally  { setLoading(false) }
  }

  // ── Smart Paste ───────────────────────────────────────────────────────────────
  const closePasteModal = () => {
    setShowPasteModal(false); setPasteText(''); setParsedNotes([]); setParseError(null)
  }

  const handleSmartParse = async () => {
    if (!pasteText.trim()) return
    setParseLoading(true); setParseError(null); setParsedNotes([])
    try {
      const results = await parseMessageWithGroq(pasteText)
      setParsedNotes(results)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('dashboard.notes.failedParseMessage'))
    } finally { setParseLoading(false) }
  }

  const handleApplyParsed = async () => {
    if (!parsedNotes.length) return
    const col = notesCol(); if (!col) return
    setLoading(true)
    try {
      const { error } = await supabase.from('user_notes').insert(
        parsedNotes.map(note => ({
          user_id: col.userId,
          organization_id: col.orgId,
          text: note.summary,
          date: note.date,
          scheduled_time: note.scheduledTime || null,
          priority: note.priority,
          category: note.category,
          vehicle_reg: note.vehicleReg || null,
          recurrence: 'none',
          done: false,
          created_at: new Date().toISOString(),
          scheduled_notification_at: buildScheduledNotificationAt(note.date, note.scheduledTime || null),
          notification_sent: false,
        }))
      )
      if (error) throw error
      await loadNotes(); window.dispatchEvent(new Event('yardao:notes-changed'))
      toast.success(parsedNotes.length > 1 ? t('dashboard.notes.notesSavedPlural', { count: parsedNotes.length }) : t('dashboard.notes.noteSavedCheck'))
    } catch { toast.error(t('dashboard.notes.failedSaveNotes')) }
    finally { setLoading(false) }
    closePasteModal()
  }

  const updateParsedNote = (index: number, field: string, value: string) => {
    setParsedNotes(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n))
  }

  const removeParsedNote = (index: number) => {
    setParsedNotes(prev => prev.filter((_, i) => i !== index))
  }

  // ── Toggle done / delete ──────────────────────────────────────────────────────
  const handleToggleDone = async (note: UserNote) => {
    if (!user?.uid) return
    const nowDone = !note.done
    try {
      const { error: updateError } = await supabase
        .from('user_notes')
        .update({ done: nowDone, archived_at: nowDone ? new Date().toISOString() : null })
        .eq('id', note.id)
        .eq('user_id', user.uid)
      if (updateError) throw updateError
      if (nowDone && note.recurrence !== 'none') {
        const next = nextRecurringDate(note.date, note.recurrence)
        if (next) { const col = notesCol(); if (col) { const { error: insertError } = await supabase.from('user_notes').insert({ user_id: col.userId, organization_id: col.orgId, text: note.text, date: next, scheduled_time: note.scheduledTime || null, priority: note.priority, category: note.category, recurrence: note.recurrence, vehicle_reg: note.vehicleReg || null, done: false, created_at: new Date().toISOString(), scheduled_notification_at: buildScheduledNotificationAt(next, note.scheduledTime), notification_sent: false }); if (insertError) throw insertError; toast.success(t('dashboard.notes.doneNextReminder', { date: next })) } }
      } else { toast.success(nowDone ? t('dashboard.notes.markedAsDone') : t('dashboard.notes.reopened')) }
      await loadNotes(); window.dispatchEvent(new Event('yardao:notes-changed'))
    } catch { toast.error(t('dashboard.notes.failedUpdateNote')) }
  }

  const handleDelete = async (noteId: string) => {
    if (!user?.uid) return
    try { const { error } = await supabase.from('user_notes').delete().eq('id', noteId).eq('user_id', user.uid); if (error) throw error; setNotes(prev => prev.filter(n => n.id !== noteId)); window.dispatchEvent(new Event('yardao:notes-changed')); toast.success(t('dashboard.notes.noteDeleted')) }
    catch { toast.error(t('dashboard.notes.failedDeleteNote')) }
  }

  // ── Derived ────────────────────────────────────────────────────────────────────
  const today       = getTodayString()
  const activeNotes = notes.filter(n => !n.done)
  const doneNotes   = notes.filter(n => n.done)
  const pOrder: Record<Priority, number> = { urgent: 0, medium: 1, low: 2 }

  const upcomingNotes = activeNotes
    .filter(n => n.date >= today)
    .filter(n => filterCategory === 'all' || n.category === filterCategory)
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : pOrder[a.priority] - pOrder[b.priority])

  const pastNotes = activeNotes
    .filter(n => n.date < today)
    .filter(n => filterCategory === 'all' || n.category === filterCategory)

  const urgentCount = activeNotes.filter(n => n.priority === 'urgent' && n.date <= today).length

  const formatDate = (dateStr: string) => {
    const diff = Math.round((new Date(dateStr + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    if (diff === 0) return t('dashboard.notes.dateToday'); if (diff === 1) return t('dashboard.notes.dateTomorrow'); if (diff === -1) return t('dashboard.notes.dateYesterday')
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // ── Calendar ──────────────────────────────────────────────────────────────────
  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth()
    const first = new Date(year, month, 1), last = new Date(year, month + 1, 0)
    const startDow = (first.getDay() + 6) % 7
    const days: (string | null)[] = []
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= last.getDate(); d++) days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    return days
  }

  const notesByDate = notes.reduce((acc, n) => { if (!acc[n.date]) acc[n.date] = []; acc[n.date].push(n); return acc }, {} as Record<string, UserNote[]>)
  const calDays = getCalendarDays()
  const calendarSelectedNotes = selectedCalDate ? notes.filter(n => n.date === selectedCalDate) : []

  // ══════════════════════════════════════════════════════════════════
  // SPRING BURST ANIMATION CSS
  // ══════════════════════════════════════════════════════════════════
  const springBurstStyle = `
    @keyframes springBurst {
      0%   { opacity:0; transform: scale(0) rotate(-8deg); transform-origin: top right; }
      55%  { opacity:1; transform: scale(1.07) rotate(1.5deg); }
      75%  { transform: scale(0.97) rotate(-0.5deg); }
      100% { opacity:1; transform: scale(1) rotate(0deg); }
    }
    @keyframes borderFlash {
      0%   { box-shadow: 0 0 0 0 rgba(179,242,67,.7); }
      50%  { box-shadow: 0 0 0 10px rgba(179,242,67,0); }
      100% { box-shadow: none; }
    }
    @keyframes rowSlideIn {
      from { opacity:0; transform: translateX(14px); }
      to   { opacity:1; transform: translateX(0); }
    }
    .spring-burst {
      animation: springBurst 0.5s cubic-bezier(.34,1.7,.64,1) forwards;
    }
    .border-flash {
      animation: borderFlash 1s 0.5s ease-out forwards;
    }
    .row-slide-in {
      opacity: 0;
      animation: rowSlideIn 0.3s ease-out forwards;
    }
  `

  // ── Shared panel content ───────────────────────────────────────────────────────
  const PanelContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-[#b3f243]" />
          <span className="text-white font-semibold text-sm">{t('dashboard.notes.headerTitle')}</span>
          {urgentCount > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">{t('dashboard.notes.urgentCount', { count: urgentCount })}</span>}
          {urgentCount === 0 && upcomingNotes.length > 0 && <span className="bg-[#b3f243] text-[#012619] text-xs font-bold px-1.5 py-0.5 rounded-full">{upcomingNotes.length}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white/15 rounded-lg p-0.5 border border-white/20">
            <button onClick={() => setViewMode('list')} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'list' ? 'bg-white text-[#012619]' : 'text-white/70 hover:text-white'}`}>
              <List className="w-3 h-3" /><span>{t('dashboard.notes.viewList')}</span>
            </button>
            <button onClick={() => setViewMode('calendar')} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'calendar' ? 'bg-white text-[#012619]' : 'text-white/70 hover:text-white'}`}>
              <Calendar className="w-3 h-3" /><span>{t('dashboard.notes.viewCal')}</span>
            </button>
          </div>
          <button onClick={() => exportNotes(notes, t)} title={t('dashboard.notes.exportTooltip')} className="text-[#C5D9D0] hover:text-white transition-colors">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="text-[#C5D9D0] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Add form */}
      <div className="p-3 border-b border-gray-100 dark:border-[#025940]/50 bg-[#f8faf9] dark:bg-[#012619]/50 flex-shrink-0">

        {/* Smart Paste button */}
        <button
          onClick={() => { setShowPasteModal(true); setParsedNotes([]); setParseError(null) }}
          className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-[#72A68E]/40 dark:border-[#025940] text-[11px] font-semibold text-[#025940] dark:text-[#72A68E] hover:border-[#025940] hover:bg-[#025940]/5 dark:hover:bg-[#025940]/20 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#b3f243]" />
          {t('dashboard.notes.smartPasteCta')}
        </button>

        <textarea
          value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAdd() }}
          placeholder={t('dashboard.notes.addReminderPlaceholder')} rows={2}
          className="w-full text-sm px-3 py-2 rounded-xl border border-[#72A68E]/30 dark:border-[#025940] bg-white dark:bg-[#025940]/20 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940] resize-none"
        />
        <div className="flex gap-2 mt-2">
          <div className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-xl border border-[#72A68E]/30 dark:border-[#025940] bg-white dark:bg-[#025940]/20">
            <Calendar className="w-3 h-3 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="flex-1 text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none" />
          </div>
          {/* Time picker */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-[#72A68E]/30 dark:border-[#025940] bg-white dark:bg-[#025940]/20">
            <Clock className="w-3 h-3 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
            <input
              type="time"
              value={newScheduledTime}
              onChange={e => setNewScheduledTime(e.target.value)}
              className="text-xs bg-transparent text-gray-900 dark:text-white focus:outline-none w-20"
              title={t('dashboard.notes.timeTooltip')}
            />
          </div>
          <div className="flex gap-1">
            {(['low', 'medium', 'urgent'] as Priority[]).map(p => {
              const cfg = PRIORITY_CONFIG[p]; const Icon = cfg.icon
              const pLabel = t('dashboard.notes.' + PRIORITY_LABEL_KEY[p])
              return (
                <button key={p} onClick={() => setNewPriority(p)} title={pLabel}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border-2 ${
                    newPriority === p
                      ? `${cfg.pillBg} ${cfg.pillText} border-transparent`
                      : 'border-gray-200 dark:border-[#025940] text-gray-400 bg-white dark:bg-transparent hover:border-gray-300'
                  }`}>
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{pLabel}</span>
                </button>
              )
            })}
          </div>
        </div>

        <button onClick={() => setShowAdvanced(p => !p)} className="flex items-center gap-1 mt-2 text-[10px] text-[#72A68E] hover:text-[#025940] transition-colors">
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showAdvanced ? t('dashboard.notes.lessOptions') : t('dashboard.notes.moreOptions')}
        </button>

        {showAdvanced && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(CATEGORY_CONFIG) as Category[]).map(cat => (
                <button key={cat} onClick={() => setNewCategory(cat)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${newCategory === cat ? 'border-[#025940] bg-[#025940]/10 text-[#025940] dark:text-[#72A68E]' : 'border-gray-200 dark:border-[#025940]/50 text-gray-400 hover:border-gray-300'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_CONFIG[cat].dot}`} />{t('dashboard.notes.' + CATEGORY_LABEL_KEY[cat])}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {RECURRENCE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setNewRecurrence(opt.value)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${newRecurrence === opt.value ? 'border-[#025940] bg-[#025940]/10 text-[#025940] dark:text-[#72A68E]' : 'border-gray-200 dark:border-[#025940]/50 text-gray-400 hover:border-gray-300'}`}>
                  {opt.value !== 'none' && <RotateCcw className="w-2.5 h-2.5" />}{t('dashboard.notes.' + RECURRENCE_LABEL_KEY[opt.value])}
                </button>
              ))}
            </div>
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#72A68E]/30 dark:border-[#025940] bg-white dark:bg-[#025940]/20">
                <Car className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
                <input ref={vehicleInputRef} type="text" value={vehicleSearchTerm || newVehicleReg}
                  onChange={e => { const val = e.target.value.toUpperCase(); setVehicleSearchTerm(val); setNewVehicleReg(val) }}
                  onFocus={() => vehicleSearchTerm.length >= 2 && setShowVehicleDropdown(true)}
                  onBlur={() => setTimeout(() => setShowVehicleDropdown(false), 150)}
                  placeholder={t('dashboard.notes.regSearchPlaceholder')} maxLength={8}
                  className="flex-1 text-xs bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none font-mono uppercase" />
                {newVehicleReg && <button onClick={() => { setNewVehicleReg(''); setVehicleSearchTerm('') }} className="text-gray-300 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>}
              </div>
              {showVehicleDropdown && vehicleResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#012619] border border-[#72A68E]/30 dark:border-[#025940] rounded-xl shadow-xl z-50 overflow-hidden">
                  {vehicleResults.map(v => (
                    <button key={v.id} onMouseDown={e => { e.preventDefault(); setNewVehicleReg(v.registration); setVehicleSearchTerm(v.registration); setShowVehicleDropdown(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/30 transition-colors text-left">
                      <div className="w-6 h-6 rounded-lg bg-[#025940]/10 dark:bg-[#025940]/30 flex items-center justify-center flex-shrink-0">
                        <Car className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-900 dark:text-white font-mono">{v.registration}</div>
                        <div className="text-[10px] text-gray-400 dark:text-[#72A68E] truncate">{v.make} {v.model}{v.colour ? ` · ${v.colour}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={handleAdd} disabled={loading || !newText.trim()}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-[#025940] hover:bg-[#012619] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all">
          <Plus className="w-3.5 h-3.5" /> {t('dashboard.notes.addNote')}
        </button>
      </div>

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#025940]/50">
            <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#025940]/30 text-gray-500 dark:text-[#72A68E] transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-bold text-gray-800 dark:text-white">{t('dashboard.notes.' + MONTH_KEYS[calendarMonth.getMonth()])} {calendarMonth.getFullYear()}</span>
            <button onClick={() => setCalendarMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#025940]/30 text-gray-500 dark:text-[#72A68E] transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 px-3 pt-2">
            {DAY_KEYS.map(dk => <div key={dk} className="text-center text-[10px] font-bold text-gray-400 dark:text-[#72A68E]/60 pb-1">{t('dashboard.notes.' + dk)}</div>)}
          </div>
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
            {calDays.map((dateStr, i) => {
              if (!dateStr) return <div key={`e-${i}`} />
              const dayNotes = notesByDate[dateStr] || []
              const isToday = dateStr === today, isSelected = dateStr === selectedCalDate
              const hasUrgent = dayNotes.some(n => n.priority === 'urgent' && !n.done)
              const hasMedium = dayNotes.some(n => n.priority === 'medium' && !n.done)
              const hasLow    = dayNotes.some(n => n.priority === 'low' && !n.done)
              const hasDone   = dayNotes.some(n => n.done)
              return (
                <button key={dateStr} onClick={() => setSelectedCalDate(isSelected ? null : dateStr)}
                  className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all text-center ${isSelected ? 'bg-[#025940] text-white shadow-md' : isToday ? 'bg-[#b3f243]/20 text-[#025940] dark:text-[#b3f243] font-bold border border-[#b3f243]/50' : 'hover:bg-gray-50 dark:hover:bg-[#025940]/20 text-gray-700 dark:text-[#C5D9D0]'}`}>
                  <span className="text-xs font-semibold leading-none">{parseInt(dateStr.split('-')[2])}</span>
                  {dayNotes.length > 0 && (
                    <div className="flex gap-0.5 mt-1 justify-center">
                      {hasUrgent && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-red-500'}`} />}
                      {hasMedium && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-amber-400'}`} />}
                      {hasLow    && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/50' : 'bg-[#72A68E]'}`} />}
                      {hasDone && !hasUrgent && !hasMedium && !hasLow && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/40' : 'bg-gray-300'}`} />}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          {selectedCalDate && (
            <div className="border-t border-gray-100 dark:border-[#025940]/50">
              <div className="px-4 py-2 bg-[#f8faf9] dark:bg-[#025940]/10">
                <p className="text-xs font-bold text-[#025940] dark:text-[#72A68E]">{formatDate(selectedCalDate)} <span className="ml-2 text-gray-400 font-normal">{t('dashboard.notes.notesCountSuffix', { count: calendarSelectedNotes.length })}</span></p>
              </div>
              {calendarSelectedNotes.length === 0
                ? <div className="px-4 py-4 text-center text-xs text-gray-400">{t('dashboard.notes.noNotesForDay')}</div>
                : calendarSelectedNotes.map(note => <NoteRow key={note.id} note={note} label="" today={today} onDelete={handleDelete} onToggleDone={handleToggleDone} hideDate />)
              }
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 dark:border-[#025940]/30 bg-[#f8faf9] dark:bg-[#012619]/30">
            <span className="text-[10px] text-gray-400 font-medium">{t('dashboard.notes.legend')}</span>
            <span className="flex items-center gap-1 text-[10px] text-red-500"><span className="w-2 h-2 rounded-full bg-red-500" />{t('dashboard.notes.legendUrgent')}</span>
            <span className="flex items-center gap-1 text-[10px] text-amber-500"><span className="w-2 h-2 rounded-full bg-amber-400" />{t('dashboard.notes.legendMedium')}</span>
            <span className="flex items-center gap-1 text-[10px] text-[#72A68E]"><span className="w-2 h-2 rounded-full bg-[#72A68E]" />{t('dashboard.notes.legendLow')}</span>
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex gap-1 px-3 py-2 border-b border-gray-100 dark:border-[#025940]/50 flex-shrink-0 overflow-x-auto">
            <button onClick={() => setFilterCategory('all')} className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${filterCategory === 'all' ? 'bg-[#025940] text-white' : 'text-gray-400 hover:text-gray-600'}`}>{t('dashboard.notes.filterAll')}</button>
            {(Object.keys(CATEGORY_CONFIG) as Category[]).map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${filterCategory === cat ? 'bg-[#025940] text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_CONFIG[cat].dot}`} />{t('dashboard.notes.' + CATEGORY_LABEL_KEY[cat])}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth">
            {upcomingNotes.length === 0 && pastNotes.length === 0 && doneNotes.length === 0
              ? <div className="py-10 text-center text-gray-400 text-sm"><StickyNote className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>{t('dashboard.notes.noNotesYet')}</p></div>
              : <div className="pb-4">
                  {upcomingNotes.map(note => <NoteRow key={note.id} note={note} label={formatDate(note.date)} today={today} onDelete={handleDelete} onToggleDone={handleToggleDone} />)}
                  {pastNotes.length > 0 && <PastSection notes={pastNotes} formatDate={formatDate} today={today} onDelete={handleDelete} onToggleDone={handleToggleDone} />}
                  {doneNotes.length > 0 && (
                    <div>
                      <button onClick={() => setShowArchive(p => !p)} className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-gray-400 dark:text-[#72A68E]/60 hover:bg-gray-50 dark:hover:bg-[#025940]/10 transition-colors border-t border-gray-100 dark:border-[#025940]/30">
                        <span className="flex items-center gap-1"><Archive className="w-3 h-3" />{t('dashboard.notes.completedCount', { count: doneNotes.length })}</span>
                        {showArchive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {showArchive && doneNotes.map(note => <NoteRow key={note.id} note={note} label={formatDate(note.date)} today={today} onDelete={handleDelete} onToggleDone={handleToggleDone} dimmed />)}
                    </div>
                  )}
                </div>
            }
          </div>
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{springBurstStyle}</style>

      {/* ══════════ SMART PASTE MODAL ══════════ */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg bg-white dark:bg-[#012619] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#72A68E]/30 dark:border-[#025940] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#b3f243]" />
                <span className="text-white font-bold text-sm">{t('dashboard.notes.smartNoteFromMessage')}</span>
                {parsedNotes.length > 1 && <span className="bg-[#b3f243] text-[#012619] text-[10px] font-bold px-2 py-0.5 rounded-full">{t('dashboard.notes.notesBadgePlural', { count: parsedNotes.length })}</span>}
              </div>
              <button onClick={closePasteModal} className="text-white/60 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {parsedNotes.length === 0 && (
                <>
                  <p className="text-[11px] text-gray-500 dark:text-[#72A68E]">
                    {t('dashboard.notes.pasteIntro')}
                  </p>
                  <textarea
                    value={pasteText} onChange={e => { setPasteText(e.target.value); setParseError(null) }}
                    placeholder={t('dashboard.notes.pastePlaceholder')}
                    rows={6} autoFocus
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-[#72A68E]/30 dark:border-[#025940] bg-white dark:bg-[#025940]/20 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940] resize-none"
                  />
                </>
              )}

              {parseError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400">{parseError}</p>
                </div>
              )}

              {parsedNotes.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#025940]" />
                    <span className="text-[11px] font-bold text-[#025940] dark:text-[#72A68E] uppercase tracking-wide">
                      {parsedNotes.length === 1 ? t('dashboard.notes.aiSummaryConfirm') : t('dashboard.notes.notesFoundEdit', { count: parsedNotes.length })}
                    </span>
                  </div>

                  {parsedNotes.map((note, i) => (
                    <div key={i} className="rounded-xl border-2 border-[#025940]/30 dark:border-[#025940] bg-[#f8faf9] dark:bg-[#025940]/10 p-3 space-y-2">
                      {parsedNotes.length > 1 && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[#025940] dark:text-[#72A68E] uppercase tracking-wide">{t('dashboard.notes.noteIndex', { index: i + 1 })}</span>
                          <button onClick={() => removeParsedNote(i)} className="text-red-400 hover:text-red-600 transition-colors p-0.5 rounded"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      )}
                      <textarea
                        value={note.summary} onChange={e => updateParsedNote(i, 'summary', e.target.value)}
                        rows={2}
                        className="w-full text-sm px-2.5 py-2 rounded-lg border border-[#72A68E]/40 dark:border-[#025940] bg-white dark:bg-[#025940]/20 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940] resize-none font-medium"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5 block">{t('dashboard.notes.fieldDate')}</label>
                          <input type="date" value={note.date} onChange={e => updateParsedNote(i, 'date', e.target.value)}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-[#72A68E]/40 dark:border-[#025940] bg-white dark:bg-[#025940]/20 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#025940]" />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5 block flex items-center gap-1">
                            <Timer className="w-2.5 h-2.5 inline" /> {t('dashboard.notes.fieldTime')}
                          </label>
                          <input type="time" value={note.scheduledTime || ''} onChange={e => updateParsedNote(i, 'scheduledTime', e.target.value || null as any)}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-[#72A68E]/40 dark:border-[#025940] bg-white dark:bg-[#025940]/20 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#025940]" />
                          {note.scheduledTime && (
                            <p className="text-[9px] text-[#025940] dark:text-[#72A68E] mt-0.5">{t('dashboard.notes.alertsAt')}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5 block">{t('dashboard.notes.fieldReg')}</label>
                          <input type="text" value={note.vehicleReg || ''} onChange={e => updateParsedNote(i, 'vehicleReg', e.target.value.toUpperCase())}
                            placeholder={t('dashboard.notes.regNonePlaceholder')}
                            className="w-full text-xs px-2 py-1.5 rounded-lg border border-[#72A68E]/40 dark:border-[#025940] bg-white dark:bg-[#025940]/20 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#025940] font-mono uppercase" />
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {(['low', 'medium', 'urgent'] as const).map(p => (
                          <button key={p} onClick={() => updateParsedNote(i, 'priority', p)}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              note.priority === p
                                ? p === 'urgent' ? 'bg-red-500 border-red-500 text-white' : p === 'medium' ? 'bg-amber-400 border-amber-400 text-white' : 'bg-[#72A68E] border-[#72A68E] text-white'
                                : 'border-gray-200 dark:border-[#025940]/50 text-gray-400'
                            }`}>
                            {t('dashboard.notes.' + PRIORITY_LABEL_KEY[p])}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-gray-100 dark:border-[#025940]/30 flex-shrink-0">
              {parsedNotes.length === 0 ? (
                <>
                  <button onClick={closePasteModal} className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-[#025940] text-sm text-gray-500 dark:text-[#72A68E] hover:bg-gray-50 dark:hover:bg-[#025940]/20 transition-all">{t('dashboard.common.cancel')}</button>
                  <button onClick={handleSmartParse} disabled={!pasteText.trim() || parseLoading}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#025940] to-[#012619] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                    {parseLoading ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('dashboard.notes.parsing')}</> : <><Sparkles className="w-3.5 h-3.5 text-[#b3f243]" />{t('dashboard.notes.parseWithAi')}</>}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setParsedNotes([])} className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-[#025940] text-sm text-gray-500 dark:text-[#72A68E] hover:bg-gray-50 dark:hover:bg-[#025940]/20 transition-all">{t('dashboard.notes.rePaste')}</button>
                  <button onClick={handleApplyParsed} disabled={loading || parsedNotes.length === 0}
                    className="flex-1 py-2 rounded-xl bg-[#b3f243] text-[#012619] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#9de030] disabled:opacity-50 transition-all">
                    {loading ? <><div className="w-3.5 h-3.5 border-2 border-[#012619]/30 border-t-[#012619] rounded-full animate-spin" />{t('dashboard.notes.saving')}</> : <><Check className="w-3.5 h-3.5" />{parsedNotes.length > 1 ? t('dashboard.notes.saveNotesPlural', { count: parsedNotes.length }) : `${t('dashboard.notes.saveBtnPrefix')} ${t('dashboard.notes.saveNoteSingular')}`}</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ DAILY GREETING POPUP — SPRING BURST ══════════ */}
      <div
        key={popupAnimKey}
        className={`fixed top-16 right-4 z-[9999] w-96 max-w-[calc(100vw-2rem)] ${
          showTodayPopup && todayNotes.length > 0
            ? 'spring-burst border-flash pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{ transformOrigin: 'top right' }}
      >
        <div className="bg-white dark:bg-[#012619] rounded-2xl shadow-2xl border border-[#72A68E]/30 dark:border-[#025940] overflow-hidden">
          <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#b3f243]" />
              <div>
                <p className="text-white font-bold text-sm leading-none">{t('dashboard.notes.' + getGreetingKey())} 👋</p>
                <p className="text-[#72A68E] text-[10px] mt-0.5">{t('dashboard.notes.remindersForToday', { count: todayNotes.length })}</p>
              </div>
            </div>
            <button onClick={() => setShowTodayPopup(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 py-2 space-y-1.5 max-h-56 overflow-y-auto">
            {todayNotes.slice(0, 4).map((note, idx) => {
              const P = PRIORITY_CONFIG[note.priority]; const PIcon = P.icon
              return (
                <div key={note.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${P.bg} ${P.border} row-slide-in`}
                     style={{ animationDelay: `${0.35 + idx * 0.08}s` }}>
                  <PIcon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${P.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-white leading-snug">{note.text}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${P.pillBg} ${P.pillText}`}>
                        <PIcon className="w-2 h-2" />{t('dashboard.notes.' + PRIORITY_LABEL_KEY[note.priority])}
                      </span>
                      {note.scheduledTime && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#025940] dark:text-[#b3f243]">
                          <Clock className="w-2.5 h-2.5" />{note.scheduledTime}
                        </span>
                      )}
                      {note.vehicleReg && <span className="text-[9px] text-blue-500 font-mono font-bold">{note.vehicleReg}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
            {todayNotes.length > 4 && <p className="text-center text-[10px] text-gray-400 dark:text-[#72A68E] py-1">{t('dashboard.notes.moreOpenNotes', { count: todayNotes.length - 4 })}</p>}
          </div>

          <div className="flex gap-2 px-3 pb-3 pt-1">
            <button onClick={handleSnooze} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-[#72A68E]/40 text-[#025940] dark:text-[#72A68E] text-xs font-semibold hover:bg-[#72A68E]/10 transition-all">
              <Clock className="w-3 h-3" /> {t('dashboard.notes.snooze2h')}
            </button>
            <button onClick={() => setShowTodayPopup(false)} className="flex-1 py-1.5 rounded-xl bg-[#b3f243] text-[#012619] text-xs font-bold hover:bg-[#9de030] transition-all">
              {t('dashboard.notes.gotIt')}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ TIMED REMINDER POPUP ══════════ */}
      {activeReminder && (
        <div
          key={reminderAnimKey}
          className="fixed top-16 right-4 z-[9998] w-96 max-w-[calc(100vw-2rem)] spring-burst border-flash"
          style={{ transformOrigin: 'top right' }}
        >
          <div className="bg-white dark:bg-[#012619] rounded-2xl shadow-2xl overflow-hidden border-2 border-amber-400 dark:border-amber-500">
            {/* Header */}
            <div className={`px-4 py-3 flex items-center justify-between ${
              activeReminder.interval === 15
                ? 'bg-gradient-to-r from-red-600 to-red-500'
                : activeReminder.interval === 30
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-[#012619] to-[#025940]'
            }`}>
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-white" />
                <div>
                  <p className="text-white font-bold text-sm leading-none">
                    {activeReminder.interval === 15 ? t('dashboard.notes.reminder15') : activeReminder.interval === 30 ? t('dashboard.notes.reminder30') : t('dashboard.notes.reminder60')} {t('dashboard.notes.awaySuffix')}
                  </p>
                  <p className="text-white/70 text-[10px] mt-0.5">{t('dashboard.notes.scheduledAt', { time: activeReminder.note.scheduledTime ?? '' })}</p>
                </div>
              </div>
              <button onClick={dismissActiveReminder} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Note content */}
            <div className="px-4 py-3">
              {(() => {
                const P = PRIORITY_CONFIG[activeReminder.note.priority]
                const PIcon = P.icon
                return (
                  <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${P.bg} ${P.border}`}>
                    <PIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${P.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white leading-snug">{activeReminder.note.text}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${P.pillBg} ${P.pillText}`}>
                          <PIcon className="w-2 h-2" />{t('dashboard.notes.' + PRIORITY_LABEL_KEY[activeReminder.note.priority])}
                        </span>
                        {activeReminder.note.vehicleReg && (
                          <span className="text-[9px] text-blue-500 font-mono font-bold">{activeReminder.note.vehicleReg}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Snooze options */}
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{t('dashboard.notes.snoozeFor')}</p>
              <div className="flex gap-2">
                <button onClick={() => snoozeActiveReminder(5)}  className="flex-1 py-1.5 rounded-xl border border-[#72A68E]/40 text-[#025940] dark:text-[#72A68E] text-xs font-semibold hover:bg-[#72A68E]/10 transition-all">{t('dashboard.notes.snooze5min')}</button>
                <button onClick={() => snoozeActiveReminder(10)} className="flex-1 py-1.5 rounded-xl border border-[#72A68E]/40 text-[#025940] dark:text-[#72A68E] text-xs font-semibold hover:bg-[#72A68E]/10 transition-all">{t('dashboard.notes.snooze10min')}</button>
                <button onClick={() => snoozeActiveReminder(20)} className="flex-1 py-1.5 rounded-xl border border-[#72A68E]/40 text-[#025940] dark:text-[#72A68E] text-xs font-semibold hover:bg-[#72A68E]/10 transition-all">{t('dashboard.notes.snooze20min')}</button>
              </div>
              <button onClick={dismissActiveReminder} className="w-full py-1.5 rounded-xl bg-[#b3f243] text-[#012619] text-xs font-bold hover:bg-[#9de030] transition-all">
                {t('dashboard.notes.gotItReady')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MOBILE ══════════ */}
      <div className="md:hidden">
        <button onClick={() => setIsOpen(p => !p)}
          className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs transition-all ${isOpen ? 'bg-[#012619] text-[#b3f243] border-2 border-[#b3f243]' : 'bg-gradient-to-br from-[#025940] to-[#012619] text-[#b3f243] border border-[#72A68E]/40'} shadow-sm`}>
          <StickyNote className="w-4 h-4" />
          {urgentCount > 0 && !isOpen && <span className="bg-red-500 text-white text-[9px] font-bold px-1 rounded-full animate-pulse">{urgentCount}</span>}
          {urgentCount === 0 && upcomingNotes.length > 0 && !isOpen && <span className="bg-[#b3f243] text-[#012619] text-[9px] font-bold px-1 rounded-full">{upcomingNotes.length}</span>}
        </button>

        {isOpen && (
          <div className="fixed inset-0 z-[200] flex flex-col justify-end p-3">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onPointerDown={() => setIsOpen(false)} />
            <div className="relative w-full max-w-md mx-auto bg-white dark:bg-[#012619] rounded-2xl shadow-2xl border border-[#72A68E]/30 dark:border-[#025940] flex flex-col max-h-[85vh]" onPointerDown={e => e.stopPropagation()}>
              <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-300 dark:bg-[#025940] rounded-full" />
              </div>
              {PanelContent}
            </div>
          </div>
        )}
      </div>

      {/* ══════════ DESKTOP ══════════ */}
      <div className="hidden md:block relative z-[200]" ref={panelRef}>
        <button onClick={() => setIsOpen(p => !p)}
          className={`relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 ${isOpen ? 'bg-[#012619] border-2 border-[#b3f243]' : 'bg-gradient-to-br from-[#025940] to-[#012619] border-2 border-[#72A68E]/40'}`}
          title={t('dashboard.notes.myNotesTooltip')}>
          <StickyNote className="w-5 h-5 text-[#b3f243]" />
          {urgentCount > 0 && !isOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">{urgentCount}</span>}
          {urgentCount === 0 && upcomingNotes.length > 0 && !isOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#b3f243] text-[#012619] text-[10px] font-bold rounded-full flex items-center justify-center">{upcomingNotes.length > 9 ? '9+' : upcomingNotes.length}</span>}
        </button>

        {isOpen && (
          // Use position:fixed (not absolute) so the panel escapes any
          // ancestor `overflow:hidden` — the pipeline lane card now hugs
          // its content and clips this popover when it was absolute.
          <div className="fixed top-20 right-4 z-[9999] w-[620px] max-w-[calc(100vw-2rem)] bg-white dark:bg-[#012619] rounded-2xl shadow-2xl border border-[#72A68E]/30 dark:border-[#025940] flex flex-col max-h-[85vh] overflow-hidden">
            {PanelContent}
          </div>
        )}
      </div>
    </>
  )
}

// ─── NoteRow ──────────────────────────────────────────────────────────────────

function NoteRow({ note, label, today, onDelete, onToggleDone, dimmed = false, hideDate = false }: {
  note: UserNote; label: string; today: string
  onDelete: (id: string) => void; onToggleDone: (note: UserNote) => void
  dimmed?: boolean; hideDate?: boolean
}) {
  const t = useT()
  const P = PRIORITY_CONFIG[note.priority]; const PIcon = P.icon
  const isToday = note.date === today
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 border-b border-gray-50 dark:border-[#025940]/30 group hover:bg-gray-50 dark:hover:bg-[#025940]/10 transition-colors ${isToday && !note.done ? 'bg-[#b3f243]/5' : ''} ${dimmed ? 'opacity-50' : ''}`}>
      {/* Done toggle — small visual swatch wrapped in a padded button so
          the touch target is finger-friendly (~36px) on mobile. */}
      <button
        type="button"
        onClick={() => onToggleDone(note)}
        aria-label={note.done ? t('dashboard.notes.markUndoneAria') : t('dashboard.notes.markDoneAria')}
        className="flex-shrink-0 -m-2 p-2 rounded-lg hover:bg-[#025940]/8 dark:hover:bg-[#72A68E]/10 active:bg-[#025940]/15 transition-colors"
      >
        <span
          className={`block w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
            note.done
              ? 'bg-[#025940] border-[#025940]'
              : 'border-gray-300 dark:border-[#72A68E]/40 group-hover:border-[#025940]'
          }`}
        >
          {note.done && <Check className="w-2.5 h-2.5 text-white" />}
        </span>
      </button>
      <div className="flex-1 min-w-0">
        {!hideDate && (
          <div className="mb-0.5 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-semibold ${isToday && !note.done ? 'text-[#025940] dark:text-[#b3f243]' : 'text-gray-400 dark:text-[#72A68E]/60'}`}>{label}</span>
              {note.scheduledTime && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#025940] dark:text-[#b3f243]">
                  <Clock className="w-2.5 h-2.5" />{note.scheduledTime}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${P.pillBg} ${P.pillText}`}>
                <PIcon className="w-2.5 h-2.5" />{t('dashboard.notes.' + PRIORITY_LABEL_KEY[note.priority])}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CATEGORY_CONFIG[note.category].dot}`} title={t('dashboard.notes.' + CATEGORY_LABEL_KEY[note.category])} />
            </div>
          </div>
        )}
        <p className={`text-xs text-gray-800 dark:text-[#C5D9D0] leading-relaxed break-words ${note.done ? 'line-through text-gray-400 dark:text-gray-600' : ''}`}>{note.text}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {note.vehicleReg && <span className="flex items-center gap-0.5 text-[9px] text-blue-500 font-mono font-bold"><Car className="w-2.5 h-2.5" />{note.vehicleReg}</span>}
          {note.recurrence !== 'none' && <span className="flex items-center gap-0.5 text-[9px] text-[#72A68E]"><RotateCcw className="w-2.5 h-2.5" />{t('dashboard.notes.' + RECURRENCE_LABEL_KEY[note.recurrence])}</span>}
        </div>
      </div>
      {/* Delete — always visible on touch devices (was opacity-0 + hover-
          only, so on mobile the button never appeared). Larger touch
          target (~36px) for finger taps. */}
      <button
        type="button"
        onClick={() => onDelete(note.id)}
        aria-label={t('dashboard.notes.deleteNoteAria')}
        className="flex-shrink-0 -m-2 p-2 rounded-lg text-red-400 md:opacity-60 md:group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/40 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Past section ─────────────────────────────────────────────────────────────

function PastSection({ notes, formatDate, today, onDelete, onToggleDone }: {
  notes: UserNote[]; formatDate: (d: string) => string; today: string
  onDelete: (id: string) => void; onToggleDone: (note: UserNote) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <button onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-gray-400 dark:text-[#72A68E]/60 hover:bg-gray-50 dark:hover:bg-[#025940]/10 transition-colors border-t border-gray-100 dark:border-[#025940]/30">
        <span>{t('dashboard.notes.overduePast', { count: notes.length })}</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && notes.map(note => <NoteRow key={note.id} note={note} label={formatDate(note.date)} today={today} onDelete={onDelete} onToggleDone={onToggleDone} />)}
    </div>
  )
}