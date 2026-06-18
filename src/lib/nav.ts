// src/lib/nav.ts
//
// In-app navigation helper for code that runs OUTSIDE React components
// (contexts, hooks, services) and therefore can't call `useRouter()`.
//
// The problem it solves: in the Capacitor (iOS/Android) build a full-page
// navigation — e.g. `window.location.href = '/login'` — is served the root
// index.html by the native WebView (there's no server to resolve clean URLs),
// so it lands on the homepage instead of the target route. Next's client-side
// router does NOT have this problem.
//
// `CapacitorRouterBridge` registers the live router's `push` here on native, so
// `appNavigate()` can route client-side from anywhere. On the web (or before the
// bridge has mounted) it falls back to a normal `window.location` navigation, so
// website behaviour is unchanged.
import { Capacitor } from '@capacitor/core'

let nativePush: ((href: string) => void) | null = null

/** Called by CapacitorRouterBridge to (un)register the client-side router. */
export function registerNativePush(fn: ((href: string) => void) | null) {
  nativePush = fn
}

/**
 * Navigate to an in-app path.
 * - Native + router available → client-side `router.push` (no reload).
 * - Otherwise → normal `window.location` navigation (web, or pre-mount fallback).
 */
export function appNavigate(href: string) {
  if (Capacitor.isNativePlatform() && nativePush) {
    nativePush(href)
    return
  }
  if (typeof window !== 'undefined') {
    window.location.href = href
  }
}
