// src/components/common/CapacitorRouterBridge.tsx
//
// Why this exists
// ───────────────
// In the Capacitor (iOS/Android) build the web app is served from the native
// WebView as static files under the `capacitor://localhost` origin — there is no
// server to resolve clean URLs. A *full-page* navigation to a sub-route such as
// `/login` therefore has no exact file to match, and the WebView falls back to
// serving the root `index.html` (the marketing homepage). Net effect inside the
// app: tapping a `<Link>` lands on `/login` but renders the homepage.
//
// Crucially, Next.js's *client-side* router (`router.push`) works perfectly in
// the WebView — it swaps content in place with no document reload, so the file
// server is never consulted. The only problem is that `<Link>` taps fall through
// to a hard browser navigation instead of going through that client router.
//
// The fix
// ───────
// Mount this once at the app root. On native only, it intercepts clicks on
// internal anchors (in the capture phase, before Next's own handler) and routes
// them through `router.push` instead of letting the browser do a full reload.
// Web builds are completely unaffected — the listener never attaches off-native,
// so normal Next.js `<Link>` behaviour (prefetch, scroll restoration, etc.) is
// preserved on the website.
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { registerNativePush, appNavigate } from '@/lib/nav'

export default function CapacitorRouterBridge() {
  const router = useRouter()

  // Expose the client-side router to non-component code (contexts/hooks/services)
  // via appNavigate(), so programmatic navigations (logout, auto-logout, push
  // deep links) also avoid a full WebView reload on native.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    registerNativePush((href) => router.push(href))
    return () => registerNativePush(null)
  }, [router])

  // Also expose appNavigate on window for injected-HTML handlers (e.g. the
  // inactivity-warning modal's inline onclick) that can't import a module.
  // Safe on web — appNavigate falls back to a normal window.location there.
  useEffect(() => {
    ;(window as any).__appNavigate = appNavigate
  }, [])

  useEffect(() => {
    // Native shells only. On the web, leave Next.js navigation 100% untouched.
    if (!Capacitor.isNativePlatform()) return

    const onClick = (e: MouseEvent) => {
      // Respect anything that already handled the click, or modified/aux clicks.
      if (e.defaultPrevented) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return

      // Skip links that intentionally bypass client routing.
      if (anchor.hasAttribute('download')) return
      const target = anchor.getAttribute('target')
      if (target && target !== '_self') return
      if (anchor.getAttribute('rel')?.includes('external')) return
      // Honour an explicit opt-out for the rare link that must hard-navigate.
      if (anchor.hasAttribute('data-native-link')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      // Non-navigational schemes (mailto:, tel:, capacitor-asset, etc.) pass through.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }

      // External origin → let the system handle it (opens in the browser).
      if (url.origin !== window.location.origin) return

      // Pure same-page hash change → let the browser do its native scroll.
      if (url.pathname === window.location.pathname && url.hash && !url.search) return

      // Hand the navigation to Next's working client-side router.
      e.preventDefault()
      e.stopImmediatePropagation()
      router.push(url.pathname + url.search + url.hash)
    }

    // Capture phase so we run before Next.js's own <Link> click handler.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [router])

  return null
}
