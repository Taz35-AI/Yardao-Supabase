// src/components/bodyshop/StaffActivityModal.tsx
// Staff activity breakdown for the last 10 days.
// Grouped by DAY (newest first), then by USER within each day.
// UI: Wide modal, dark brand header, white/light body for easy reading.

'use client'

import { useState, useEffect } from 'react'
import { X, Users, Clock, Loader2, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  date: string
  hours: number
  registration: string
  notes?: string
  loggedBy: string
  loggedByName: string
}

interface UserDaySummary {
  userId: string
  name: string
  totalHours: number
  vehicles: { registration: string; hours: number; notes?: string }[]
}

interface DaySummary {
  date: string          // "YYYY-MM-DD"
  displayDate: string   // "Sat 05 Apr 2026"
  totalHours: number
  users: UserDaySummary[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(h: number) {
  if (!h) return '0h'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function formatDisplayDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  if (iso === today) return 'Today'
  if (iso === yesterday) return 'Yesterday'

  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Solid avatar colours that read well on a white background
const AVATAR_COLOURS = [
  { bg: '#012619', text: '#b3f243' },
  { bg: '#025940', text: '#ffffff' },
  { bg: '#72A68E', text: '#012619' },
  { bg: '#b3f243', text: '#012619' },
]

// Build a stable colour index per userId across all days
function buildUserColourMap(days: DaySummary[]): Map<string, number> {
  const map = new Map<string, number>()
  let idx = 0
  for (const day of days) {
    for (const user of day.users) {
      if (!map.has(user.userId)) {
        map.set(user.userId, idx % AVATAR_COLOURS.length)
        idx++
      }
    }
  }
  return map
}

// ─── Day card ─────────────────────────────────────────────────────────────────

function DayCard({
  day,
  colourMap,
  defaultOpen,
}: {
  day: DaySummary
  colourMap: Map<string, number>
  defaultOpen: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-[#e2e8e5] overflow-hidden shadow-sm">

      {/* ── Day header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-[#f6f8f7] hover:bg-[#edf2ef] transition-colors text-left"
      >
        {/* Calendar icon */}
        <div className="w-8 h-8 rounded-lg bg-[#012619] flex items-center justify-center flex-shrink-0">
          <Calendar className="w-4 h-4 text-[#b3f243]" />
        </div>

        {/* Date + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#012619]">{day.displayDate === 'Today' ? t('bodyshop.staff.todayLabel') : day.displayDate === 'Yesterday' ? t('bodyshop.staff.yesterday') : day.displayDate}</p>
          <p className="text-[11px] text-[#72A68E] mt-0.5">
            {t(day.users.length === 1 ? 'bodyshop.staff.memberCountOne' : 'bodyshop.staff.memberCountMany', { count: day.users.length })}
          </p>
        </div>

        {/* Total hours — lime pill, brand accent */}
        <span className="flex-shrink-0 text-xs font-bold text-[#012619] bg-[#b3f243] px-2.5 py-1 rounded-lg">
          {formatHours(day.totalHours)}
        </span>

        <span className="flex-shrink-0 text-[#72A68E] ml-1">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* ── User rows ── */}
      {open && (
        <div className="divide-y divide-[#f0f4f2]">
          {day.users.map(user => {
            const colour = AVATAR_COLOURS[colourMap.get(user.userId) ?? 0]
            return (
              <div key={user.userId} className="px-5 py-4 bg-white">

                {/* User name row */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                    style={{ backgroundColor: colour.bg, color: colour.text }}
                  >
                    {getInitials(user.name)}
                  </div>
                  <span className="text-sm font-bold text-[#012619] flex-1">{user.name}</span>
                  <span className="text-xs font-bold text-[#025940] bg-[#025940]/10 px-2.5 py-1 rounded-lg border border-[#025940]/20">
                    {formatHours(user.totalHours)}
                  </span>
                </div>

                {/* Vehicle rows */}
                <div className="space-y-2 pl-11">
                  {user.vehicles.map((v, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {/* Reg badge — dark, mono */}
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-md bg-[#012619] text-white tracking-widest flex-shrink-0 font-mono">
                        {v.registration}
                      </span>

                      {/* Hours */}
                      <span className="text-xs font-semibold text-[#025940] flex-shrink-0">
                        {formatHours(v.hours)}
                      </span>

                      {/* Notes — muted, truncated */}
                      {v.notes && (
                        <span className="text-xs text-[#72A68E] truncate">{v.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface StaffActivityModalProps {
  organizationId: string
  onClose: () => void
}

export function StaffActivityModal({ organizationId, onClose }: StaffActivityModalProps) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<DaySummary[]>([])
  const [colourMap, setColourMap] = useState<Map<string, number>>(new Map())

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)

        // 1. Get all jobs for this org
        const jobsSnap = await getDocs(
          query(
            collection(db, 'bodyshopJobs'),
            where('organizationId', '==', organizationId)
          )
        )

        // 2. Cutoff = 10 days ago
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 10)
        const cutoffISO = cutoff.toISOString().split('T')[0]

        // 3. Fetch timeEntries for every job in parallel
        const perJobEntries = await Promise.all(
          jobsSnap.docs.map(async jobDoc => {
            const job = jobDoc.data()
            const snap = await getDocs(
              query(
                collection(db, 'bodyshopJobs', jobDoc.id, 'timeEntries'),
                where('date', '>=', cutoffISO),
                orderBy('date', 'asc')
              )
            )
            return snap.docs.map(d => {
              const e = d.data()
              return {
                date: e.date as string,
                hours: (e.hours as number) || 0,
                registration: (job.vehicleRegistration as string) || '—',
                notes: (e.notes as string) || '',
                loggedBy: (e.loggedBy as string) || 'unknown',
                loggedByName: (e.loggedByName as string) || 'Unknown',
              } satisfies LogEntry
            })
          })
        )

        // 4. Flatten
        const allEntries = perJobEntries.flat()

        // 5. Group by date → user → vehicles
        const byDate = new Map<string, Map<string, UserDaySummary>>()

        for (const entry of allEntries) {
          if (!byDate.has(entry.date)) byDate.set(entry.date, new Map())
          const byUser = byDate.get(entry.date)!

          if (!byUser.has(entry.loggedBy)) {
            byUser.set(entry.loggedBy, {
              userId: entry.loggedBy,
              name: entry.loggedByName,
              totalHours: 0,
              vehicles: [],
            })
          }
          const userSummary = byUser.get(entry.loggedBy)!
          userSummary.totalHours += entry.hours
          userSummary.vehicles.push({
            registration: entry.registration,
            hours: entry.hours,
            notes: entry.notes,
          })
        }

        // 6. Sort newest day first; within each day sort users by hours desc
        const daySummaries: DaySummary[] = Array.from(byDate.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([date, userMap]) => {
            const users = Array.from(userMap.values()).sort(
              (a, b) => b.totalHours - a.totalHours
            )
            return {
              date,
              displayDate: formatDisplayDate(date),
              totalHours: users.reduce((sum, u) => sum + u.totalHours, 0),
              users,
            }
          })

        setDays(daySummaries)
        setColourMap(buildUserColourMap(daySummaries))
      } catch (err) {
        logger.error('StaffActivityModal: load failed', err)
      } finally {
        setLoading(false)
      }
    }

    if (organizationId) load()
  }, [organizationId])

  const grandTotal = days.reduce((sum, d) => sum + d.totalHours, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — wide, white body */}
      // REPLACE WITH:
<div className="relative w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Dark brand header ── */}
        <div className="flex items-center gap-3 px-6 py-4 bg-[#012619] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#025940] flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-[#b3f243]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white">{t('bodyshop.staff.title')}</h2>
            <p className="text-xs text-[#72A68E]">{t('bodyshop.staff.subtitle')}</p>
          </div>

          {/* Grand total pill */}
          {!loading && grandTotal > 0 && (
            <div className="flex items-center gap-2 bg-[#025940]/60 px-3 py-1.5 rounded-lg flex-shrink-0">
              <Clock className="w-3.5 h-3.5 text-[#72A68E]" />
              <span className="text-sm font-bold text-[#b3f243]">{formatHours(grandTotal)}</span>
              <span className="text-[11px] text-[#72A68E]">{t('bodyshop.staff.total')}</span>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-[#72A68E] hover:text-white transition-colors ml-2 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable light body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#f6f8f7]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-[#025940] animate-spin" />
              <p className="text-sm text-[#72A68E]">{t('bodyshop.staff.loading')}</p>
            </div>
          ) : days.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Clock className="w-9 h-9 text-[#72A68E]/40" />
              <p className="text-sm text-[#72A68E]">{t('bodyshop.staff.empty')}</p>
            </div>
          ) : (
            days.map((day, i) => (
              <DayCard
                key={day.date}
                day={day}
                colourMap={colourMap}
                defaultOpen={i === 0}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}