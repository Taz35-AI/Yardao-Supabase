// src/components/features/dashboard/OnlineMembers.tsx
// Desktop-only "who's online" avatar strip for the dashboard header.
// Renders tiny initials avatars for org members currently connected (live via
// Supabase Realtime Presence). Hidden below the `lg` breakpoint — never shown
// on mobile — via `hidden lg:flex`, so it costs nothing on small screens.
'use client'

import { usePresence } from '@/hooks/usePresence'

// Stable per-user colour from a small on-brand palette (hash the user id).
const PALETTE = ['#025940', '#0e7c5a', '#2f855a', '#3f7f6b', '#1f6f54', '#4a7c59', '#5a8f6e']
function colorFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const MAX_SHOWN = 5

export function OnlineMembers({ organizationId }: { organizationId?: string | null }) {
  const members = usePresence(organizationId)
  if (!members.length) return null

  const shown = members.slice(0, MAX_SHOWN)
  const extra = members.length - shown.length

  return (
    <div
      className="hidden lg:flex items-center mr-1"
      title={`Online now: ${members.map((m) => m.name).join(', ')}`}
      aria-label={`${members.length} member${members.length === 1 ? '' : 's'} online`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] mr-2 flex-shrink-0" aria-hidden />
      <div className="flex items-center -space-x-2">
        {shown.map((m) => (
          <div
            key={m.userId}
            title={m.role ? `${m.name} · ${m.role}` : m.name}
            className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-gray-900 flex items-center justify-center text-[11px] font-bold text-white shadow-sm select-none"
            style={{ background: colorFor(m.userId) }}
          >
            {m.initials}
          </div>
        ))}
        {extra > 0 && (
          <div
            className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-gray-900 flex items-center justify-center text-[11px] font-bold text-[#4a5e54] dark:text-gray-200 bg-[#e2e8e5] dark:bg-gray-700 shadow-sm select-none"
            title={members.slice(MAX_SHOWN).map((m) => m.name).join(', ')}
          >
            +{extra}
          </div>
        )}
      </div>
    </div>
  )
}
