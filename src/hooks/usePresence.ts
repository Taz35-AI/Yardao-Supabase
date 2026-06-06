// src/hooks/usePresence.ts
// Live "who's online" presence for an organization, built on Supabase Realtime
// Presence. Presence is ephemeral (no DB writes, no storage) and rides the
// Realtime socket the app already uses — so it adds no per-row reads and only a
// trivial trickle of realtime messages.
//
// Each connected client tracks { userId, name, initials, role }. We dedupe by
// userId so multiple tabs/devices for the same person show as one avatar.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'

export interface PresentMember {
  userId: string
  name: string
  initials: string
  role?: string
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Returns the list of org members currently connected (deduped by user).
 * No-ops (empty list) until both an org id and a signed-in user are available.
 */
export function usePresence(organizationId: string | null | undefined): PresentMember[] {
  const { user, profile } = useAuth()
  const [members, setMembers] = useState<PresentMember[]>([])

  useEffect(() => {
    if (!organizationId || !user?.uid) {
      setMembers([])
      return
    }

    const name =
      (profile?.displayName as string | undefined) ||
      user.displayName ||
      user.email ||
      'User'
    const self: PresentMember = {
      userId: user.uid,
      name,
      initials: initialsOf(name),
      role: (profile?.role as string | undefined),
    }

    const channel = supabase.channel(`presence:org:${organizationId}`, {
      config: { presence: { key: user.uid } },
    })

    const sync = () => {
      const state = channel.presenceState<PresentMember>()
      const byId = new Map<string, PresentMember>()
      for (const entries of Object.values(state)) {
        for (const m of entries as unknown as PresentMember[]) {
          if (m?.userId) byId.set(m.userId, m)
        }
      }
      // Sort: yourself first, then alphabetical — stable avatar order.
      const list = [...byId.values()].sort((a, b) => {
        if (a.userId === user.uid) return -1
        if (b.userId === user.uid) return 1
        return a.name.localeCompare(b.name)
      })
      setMembers(list)
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(self)
        }
      })

    return () => {
      // untrack + close the channel on unmount / org change / logout
      supabase.removeChannel(channel)
    }
  }, [organizationId, user?.uid, user?.displayName, user?.email, profile?.displayName, profile?.role])

  return members
}
