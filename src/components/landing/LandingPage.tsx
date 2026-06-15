// src/components/landing/LandingPage.tsx
// Marketing landing — the exact static design from public/test, ported into the
// app. The markup is generated into landingMarkup.ts (run _gen-landing.mjs); the
// stylesheet (/test/styles.css) and assets (/test/assets/*) are served in place.
//
// Hard-won lessons from the first attempt are baked in:
//  • Reveal/opacity: sections are opacity:0 until `.is-visible`; the original
//    IntersectionObserver is unreliable in this injected/StrictMode context, so
//    we force every section visible on mount (no more blank sections).
//  • Hero background needs `.is-loaded` on <html>; added on mount.
//  • The fixed header lives INSIDE .hero — later sections would paint over it and
//    eat the Sign in / Start free clicks. We lift the hero's stacking context.
//  • Her .site-shell uses overflow:hidden and the app pins html/body to one
//    viewport, which traps scrolling — we free html/body while mounted.
//  • CTAs are real <a href="/login|/register"> in the markup, so navigation never
//    depends on JS wiring.
'use client'

import { useEffect, useRef } from 'react'
import { LANDING_HTML } from './landingMarkup'

const REVEAL_SELECTOR =
  '.problem-intro, .how-works, .support-section, .yardao-marquee, .mobile-preview, .product-overview, .feature-tour, .social-proof, .final-cta'

const ZAO_COMMANDS = [
  {
    command: 'Book HN74 for tyres on Friday',
    status: 'Booking confirmed',
    metricTitle: 'HN74ABC',
    metricValue: 'Booked',
    metricMeta: 'Friday 10:00',
    confirm: "Booked. HN74ABC - Tyres x4 at Joe's Garage, Friday 10:00. Dashboard updated.",
  },
  {
    command: 'Show vehicles waiting for MOT this week',
    status: 'MOT list ready',
    metricTitle: 'MOT due',
    metricValue: '3',
    metricMeta: 'This week',
    confirm: 'Found 3 MOTs due this week. Priority vehicles highlighted on the dashboard.',
  },
  {
    command: "Move BX24 from Joe's to bodyshop",
    status: 'Vehicle moved',
    metricTitle: 'BX24',
    metricValue: 'Bodyshop',
    metricMeta: 'Status updated',
    confirm: "Moved BX24 from Joe's Garage to bodyshop. Stock location is now up to date.",
  },
]

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const docEl = document.documentElement
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const cleanups: Array<() => void> = []
    const timers: number[] = []
    const on = (
      el: EventTarget,
      type: string,
      handler: EventListenerOrEventListenerObject,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, handler, opts)
      cleanups.push(() => el.removeEventListener(type, handler, opts))
    }
    const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)
    const qa = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel))

    // ── 1. Her stylesheet (served in place at /test/styles.css) ──────────────
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/test/styles.css'
    root.style.visibility = 'hidden'
    const reveal = () => { root.style.visibility = '' }
    const revealFallback = window.setTimeout(reveal, 500)
    link.addEventListener('load', reveal)
    document.head.appendChild(link)
    cleanups.push(() => {
      window.clearTimeout(revealFallback)
      link.removeEventListener('load', reveal)
      link.remove()
      // Leave is-loaded on <html>: once styles.css is removed there's nothing it
      // can affect, and not touching it avoids any add/remove churn.
      docEl.classList.remove('is-scrolled')
    })

    // ── 2. Free html/body to scroll the document while this page is mounted ──
    const overrides = document.createElement('style')
    overrides.textContent =
      'html{height:auto!important;min-height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:auto!important}' +
      'body{height:auto!important;min-height:100dvh!important;overflow:visible!important;overscroll-behavior:auto!important}' +
      // Stacking fix: the fixed .nav is nested in .hero; lift the hero's context
      // so the nav (Sign in / Start free) always sits above later sections.
      '.site-shell .hero{z-index:100!important}.site-shell .nav{z-index:1000!important}' +
      // Perf: kill the continuous animations in the marquee + phone-mockup
      // sections (the moving bar + floating/parallax) — they repaint on every
      // scroll frame and made scrolling stutter. The video keeps playing (it's
      // not a CSS animation).
      '.yardao-marquee,.yardao-marquee *,.mobile-preview,.mobile-preview *{animation:none!important}'
    document.head.appendChild(overrides)
    cleanups.push(() => overrides.remove())

    // ── App-mock styles: the code-built mobile Yard dashboard that replaced the
    // phone .mp4. Scoped to .app-screen; uses the app's palette. ──────────────
    const appMock = document.createElement('style')
    appMock.textContent = `
.device-phone__video.app-screen{position:absolute;inset:0;display:flex;flex-direction:column;background:#eef3f1;color:#012619;border-radius:34px;overflow:hidden;transform:scale(1.015);font-family:inherit;text-align:left}
.app-screen .app-status{display:flex;justify-content:space-between;align-items:center;padding:9px 16px 2px;font-size:9px;font-weight:700}
.app-screen .app-status__r{display:flex;align-items:center;gap:3px}
.app-screen .app-status__r i{width:3px;height:3px;border-radius:50%;background:#012619}
.app-screen .app-status__r b{width:15px;height:7px;border:1px solid #012619;border-radius:2px;margin-left:2px}
.app-screen .app-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 10px 0;padding:9px 12px;background:#012619;border-radius:16px}
.app-screen .app-top__brand{display:flex;align-items:center;gap:6px;color:#fff;font-weight:800;font-size:13px}
.app-screen .app-top__dot{width:14px;height:14px;border-radius:5px;background:#b3f243}
.app-screen .app-top__search{font-size:9px;color:#9fc3b4;background:rgba(255,255,255,.08);border-radius:8px;padding:5px 8px;white-space:nowrap}
.app-screen .app-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:10px}
.app-screen .app-stat{background:#fff;border:1px solid #e2e8e5;border-radius:12px;padding:7px 4px;text-align:center}
.app-screen .app-stat strong{display:block;font-size:16px;font-weight:800;line-height:1.1}
.app-screen .app-stat span{font-size:8px;color:#72A68E;text-transform:uppercase;letter-spacing:.3px;font-weight:700}
.app-screen .app-stat--ok strong{color:#047857}
.app-screen .app-stat--warn strong{color:#b45309}
.app-screen .app-list{flex:1;display:flex;flex-direction:column;gap:6px;padding:0 10px 6px;overflow:hidden}
.app-screen .app-row{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8e5;border-left:3px solid #72A68E;border-radius:12px;padding:7px 9px}
.app-screen .app-row--ready{border-left-color:#16a34a}
.app-screen .app-row--garage{border-left-color:#7c3aed}
.app-screen .app-row--mot{border-left-color:#d97706}
.app-screen .app-row--prog{border-left-color:#2563eb}
.app-screen .app-plate{flex-shrink:0;background:#f6d33a;color:#0a0a0a;font-weight:800;font-size:9px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.5px;padding:4px 5px;border-radius:4px}
.app-screen .app-row__v{flex:1;min-width:0;line-height:1.18}
.app-screen .app-row__v strong{display:block;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app-screen .app-row__v span{font-size:9px;color:#72A68E}
.app-screen .app-tag{flex-shrink:0;font-size:8px;font-weight:800;padding:3px 7px;border-radius:999px;white-space:nowrap}
.app-screen .app-tag--ready{background:#dcfce7;color:#047857}
.app-screen .app-tag--garage{background:#ede9fe;color:#7c3aed}
.app-screen .app-tag--mot{background:#fef3c7;color:#b45309}
.app-screen .app-tag--prog{background:#dbeafe;color:#2563eb}
.app-screen .app-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:8px 6px;background:#fff;border-top:1px solid #e2e8e5}
.app-screen .app-nav__i{display:flex;flex-direction:column;align-items:center;gap:3px;color:#9aa8a2;font-size:8px;font-weight:700}
.app-screen .app-nav__i svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.app-screen .app-nav__i.is-on{color:#025940}
`
    document.head.appendChild(appMock)
    cleanups.push(() => appMock.remove())

    // ── 3. is-loaded (reveals the WHOLE hero) + scrolled header state ────────
    // Synchronous on <html> (which is never replaced) — a rAF here was getting
    // cancelled in the React lifecycle, leaving the hero stuck at opacity:0.
    docEl.classList.add('is-loaded')
    const syncHeader = () => docEl.classList.toggle('is-scrolled', window.scrollY > 16)
    syncHeader()
    on(window, 'scroll', syncHeader as EventListener, { passive: true })

    // ── 4. Reveal: force every section visible now (kills the opacity bug) ───
    qa<HTMLElement>(REVEAL_SELECTOR).forEach(el => el.classList.add('is-visible'))

    // ── 5. Zao command cycling + typing ─────────────────────────────────────
    const commandButtons = qa<HTMLButtonElement>('.zao-command')
    const typedCommand = q<HTMLElement>('.typed-command')
    const statusLabel = q<HTMLElement>('.zao-status')
    const metricCards = qa<HTMLElement>('.zao-metric')
    const confirmMessage = q<HTMLElement>('.zao-confirm')
    let typeTimer = 0
    const setActiveCommand = (index: number, shouldType = true) => {
      const item = ZAO_COMMANDS[index % ZAO_COMMANDS.length]
      commandButtons.forEach((btn, i) => btn.classList.toggle('is-active', i === index))
      if (statusLabel) statusLabel.textContent = item.status
      if (confirmMessage) {
        confirmMessage.innerHTML = `<span class="confirm-dot" aria-hidden="true"></span>${item.confirm}`
      }
      const card = metricCards[0]
      if (card) {
        card.classList.remove('is-updating')
        void card.offsetHeight
        card.classList.add('is-updating')
        card.innerHTML = `<span>${item.metricTitle}</span><strong>${item.metricValue}</strong><small>${item.metricMeta}</small>`
      }
      if (!typedCommand) return
      window.clearInterval(typeTimer)
      if (!shouldType || prefersReducedMotion) {
        typedCommand.textContent = item.command
        return
      }
      typedCommand.textContent = ''
      let ci = 0
      typeTimer = window.setInterval(() => {
        typedCommand.textContent += item.command.charAt(ci)
        ci += 1
        if (ci >= item.command.length) window.clearInterval(typeTimer)
      }, 28)
      timers.push(typeTimer)
    }
    commandButtons.forEach((btn, i) => on(btn, 'click', () => setActiveCommand(i)))
    if (commandButtons.length) {
      let active = 0
      const cycle = window.setInterval(() => {
        active = (active + 1) % commandButtons.length
        setActiveCommand(active)
      }, prefersReducedMotion ? 9000 : 5600)
      timers.push(cycle)
    }

    // ── 6. Feature tour carousel ────────────────────────────────────────────
    const tourCarousel = q<HTMLElement>('.feature-tour')
    const tourGrid = q<HTMLElement>('.feature-tour__grid')
    const tourSteps = qa<HTMLElement>('.tour-step')
    const tourPanels = qa<HTMLElement>('.tour-panel')
    const tourTabs = qa<HTMLElement>('.tour-tab')
    const tourPrev = q<HTMLElement>('.tour-arrow--prev')
    const tourNext = q<HTMLElement>('.tour-arrow--next')
    const tourProgress = q<HTMLElement>('.tour-progress')
    let activeTour = 0
    const setTour = (target: number | string) => {
      if (!tourSteps.length) return
      const targetIndex =
        typeof target === 'number'
          ? target
          : tourSteps.findIndex(s => s.dataset.tourStep === target)
      const nextIndex = (targetIndex + tourSteps.length) % tourSteps.length
      const stepId = tourSteps[nextIndex].dataset.tourStep
      activeTour = nextIndex
      tourSteps.forEach((s, i) => {
        s.classList.toggle('is-active', i === nextIndex)
        s.setAttribute('aria-hidden', String(i !== nextIndex))
      })
      tourPanels.forEach(p => {
        const isActive = p.dataset.tourPanel === stepId
        p.classList.toggle('is-active', isActive)
        p.setAttribute('aria-hidden', String(!isActive))
      })
      tourTabs.forEach((tab, i) => {
        const isActive = tab.dataset.tourTarget === stepId
        tab.classList.toggle('is-active', isActive)
        tab.setAttribute('aria-selected', String(isActive))
        tab.tabIndex = isActive ? 0 : -1
        if (isActive && i === nextIndex) {
          tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' })
        }
      })
      if (tourProgress) {
        tourProgress.textContent = `${String(nextIndex + 1).padStart(2, '0')} / ${String(tourSteps.length).padStart(2, '0')}`
      }
    }
    const stepTour = (dir: number) => setTour(activeTour + dir)
    tourTabs.forEach(tab => on(tab, 'click', () => setTour(tab.dataset.tourTarget ?? 0)))
    if (tourPrev) on(tourPrev, 'click', () => stepTour(-1))
    if (tourNext) on(tourNext, 'click', () => stepTour(1))
    if (tourCarousel) {
      on(tourCarousel, 'keydown', ((e: KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        stepTour(e.key === 'ArrowRight' ? 1 : -1)
      }) as EventListener)
    }
    if (tourGrid) {
      let sx = 0, sy = 0
      on(tourGrid, 'pointerdown', ((e: PointerEvent) => { sx = e.clientX; sy = e.clientY }) as EventListener)
      on(tourGrid, 'pointerup', ((e: PointerEvent) => {
        const dx = e.clientX - sx, dy = e.clientY - sy
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return
        stepTour(dx < 0 ? 1 : -1)
      }) as EventListener)
    }
    if (tourSteps.length && tourPanels.length) setTour(0)

    // ── 7. Reviews carousel ─────────────────────────────────────────────────
    const reviewCarousel = q<HTMLElement>('.review-carousel')
    const reviewCards = qa<HTMLElement>('.review-card')
    const reviewPrev = q<HTMLElement>('.review-arrow--prev')
    const reviewNext = q<HTMLElement>('.review-arrow--next')
    let activeReview = 0
    let reviewTimer = 0
    const visibleReviews = () => (window.matchMedia('(max-width: 920px)').matches ? 1 : 3)
    const maxReview = () => Math.max(0, reviewCards.length - visibleReviews())
    const setReview = (index: number) => {
      if (!reviewCarousel || !reviewCards.length) return
      activeReview = Math.max(0, Math.min(index, maxReview()))
      reviewCarousel.style.setProperty('--review-index', String(activeReview))
    }
    const stepReview = (dir: number) => {
      const max = maxReview()
      const next = activeReview + dir
      setReview(next > max ? 0 : next < 0 ? max : next)
    }
    const restartReview = () => {
      window.clearInterval(reviewTimer)
      if (!reviewCarousel || prefersReducedMotion) return
      reviewTimer = window.setInterval(() => stepReview(1), 5200)
      timers.push(reviewTimer)
    }
    if (reviewCarousel && reviewCards.length) {
      setReview(0)
      restartReview()
      if (reviewPrev) on(reviewPrev, 'click', () => { stepReview(-1); restartReview() })
      if (reviewNext) on(reviewNext, 'click', () => { stepReview(1); restartReview() })
      on(window, 'resize', (() => setReview(activeReview)) as EventListener)
    }

    // ── 8. Parallax (hero collage, mobile stage, primary CTA glow) ──────────
    const primaryCta = q<HTMLElement>('.cta--primary')
    if (primaryCta) {
      on(primaryCta, 'pointermove', ((e: PointerEvent) => {
        const r = primaryCta.getBoundingClientRect()
        primaryCta.style.setProperty('--pointer-x', `${e.clientX - r.left}px`)
        primaryCta.style.setProperty('--pointer-y', `${e.clientY - r.top}px`)
      }) as EventListener)
    }
    const heroMedia = q<HTMLElement>('.hero__media')
    if (heroMedia) {
      on(heroMedia, 'pointermove', ((e: PointerEvent) => {
        const r = heroMedia.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width - 0.5
        const y = (e.clientY - r.top) / r.height - 0.5
        heroMedia.style.setProperty('--parallax-x', `${x * 12}px`)
        heroMedia.style.setProperty('--parallax-y', `${y * 10}px`)
        heroMedia.style.setProperty('--tilt-x', `${y * -3}deg`)
        heroMedia.style.setProperty('--tilt-y', `${x * 3}deg`)
      }) as EventListener)
      on(heroMedia, 'pointerleave', (() => {
        heroMedia.style.setProperty('--parallax-x', '0px')
        heroMedia.style.setProperty('--parallax-y', '0px')
        heroMedia.style.setProperty('--tilt-x', '0deg')
        heroMedia.style.setProperty('--tilt-y', '0deg')
      }) as EventListener)
    }
    // Mobile-preview parallax intentionally removed for scroll performance
    // (no animations in the phone-mockup section, per request).

    return () => {
      timers.forEach(t => window.clearInterval(t))
      window.clearInterval(typeTimer)
      cleanups.forEach(fn => fn())
    }
  }, [])

  return <div ref={rootRef} dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
}

export default LandingPage
