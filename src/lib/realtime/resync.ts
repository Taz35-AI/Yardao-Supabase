// src/lib/realtime/resync.ts
// Leg 2 of robust realtime sync: re-sync from the source of truth whenever the
// live stream may have missed something.
//
// Realtime is a fast path, not a source of truth — websocket events are dropped
// whenever a tab is backgrounded, a phone sleeps, a laptop suspends, or a mobile
// network blips. The only bulletproof defence is to RE-READ the truth when we
// come back: on tab focus / visibility regain, on network coming back online,
// and on the realtime channel re-subscribing (reconnect). These helpers wire
// those triggers onto a hook's existing (debounced) refetch.
'use client'

/**
 * Refetch when the tab regains focus/visibility or the network comes back —
 * catching anything the live subscription missed while we weren't listening.
 * Internally throttled so the focus + visibility + online events that often
 * fire together collapse into a single refetch. Returns an unsubscribe fn.
 */
export function wireResyncTriggers(refetch: () => void, minIntervalMs = 1000): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  let last = 0
  const fire = () => {
    const now = Date.now()
    if (now - last < minIntervalMs) return
    last = now
    refetch()
  }

  const onVisible = () => { if (!document.hidden) fire() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', fire)
  window.addEventListener('online', fire)

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', fire)
    window.removeEventListener('online', fire)
  }
}

/**
 * Build a Supabase channel `.subscribe(status => …)` handler that refetches on
 * RE-connect — i.e. on every successful (re)subscribe AFTER the first. The first
 * 'SUBSCRIBED' is skipped because the hook already does an initial fetch; later
 * ones mean the socket dropped and recovered, so we re-sync.
 *
 * Usage:  channel.subscribe(onReconnectRefetch(scheduleRefresh))
 */
export function onReconnectRefetch(refetch: () => void): (status: string) => void {
  let firstSubscribed = true
  return (status: string) => {
    if (status !== 'SUBSCRIBED') return
    if (firstSubscribed) { firstSubscribed = false; return }
    refetch()
  }
}
