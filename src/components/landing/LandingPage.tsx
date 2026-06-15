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
.device-phone__video.app-screen{position:absolute;inset:0;display:flex;flex-direction:column;background:#eef2f0;color:#012619;border-radius:34px;overflow:hidden;transform:scale(1.015);font-family:inherit;text-align:left}
.app-screen .app-status{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:9px 16px 4px;font-size:9px;font-weight:700}
.app-screen .app-status__r{display:flex;align-items:center;gap:3px}
.app-screen .app-status__r i{width:3px;height:3px;border-radius:50%;background:#012619}
.app-screen .app-status__r b{width:15px;height:7px;border:1px solid #012619;border-radius:2px;margin-left:2px;background:linear-gradient(to right,#012619 0 50%,transparent 50% 100%)}
.app-screen .app-scroll{flex:1;overflow:hidden;padding:0 10px}
.app-screen .app-hero{position:relative;background:radial-gradient(circle at 88% 0%,rgba(179,242,67,.12),transparent 46%),#012619;border-radius:18px;padding:14px 13px;color:#fff;overflow:hidden}
.app-screen .app-hero__title{margin:0 0 4px;font-size:17px;font-weight:800;line-height:1.15;letter-spacing:-.3px}
.app-screen .app-hero__sub{margin:0 0 10px;font-size:9px;line-height:1.35;color:#a9c6b9}
.app-screen .app-hero__search{display:flex;align-items:center;gap:6px;background:#fff;border-radius:11px;padding:9px 11px;font-size:9.5px;color:#8a9e94}
.app-screen .app-hero__search svg{width:13px;height:13px;fill:none;stroke:#72A68E;stroke-width:2;stroke-linecap:round;flex-shrink:0}
.app-screen .app-hero__btns{display:flex;gap:6px;margin-top:10px}
.app-screen .app-hbtn{display:inline-flex;align-items:center;gap:4px;flex:1;justify-content:center;border:1px solid rgba(255,255,255,.22);border-radius:9px;padding:6px 3px;font-size:8px;font-weight:700;color:#eaf3ee;white-space:nowrap}
.app-screen .app-hbtn svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.app-screen .app-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.app-screen .app-scard{background:#fff;border:1px solid #e4eae7;border-radius:14px;padding:10px 11px;box-shadow:0 1px 2px rgba(1,38,25,.04)}
.app-screen .app-scard__h{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:#012619}
.app-screen .app-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.app-screen .app-chev{margin-left:auto;color:#b9c6bf;font-size:13px;line-height:1}
.app-screen .app-scard strong{display:block;margin-top:5px;font-size:24px;font-weight:800;line-height:1;color:#012619}
.app-screen .app-vsec{margin-top:12px}
.app-screen .app-vsec__h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#012619;margin-bottom:7px}
.app-screen .app-vsec__h b{margin-left:auto;font-size:9px;font-weight:700;color:#8a9e94}
.app-screen .app-vlist{display:flex;flex-direction:column;gap:6px}
.app-screen .app-vcard{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #e4eae7;border-left:3px solid #16a34a;border-radius:13px;padding:9px 10px}
.app-screen .app-vplate{flex-shrink:0;background:#fff;border:1.5px solid #cfd9d3;border-radius:5px;padding:4px 6px;font-size:9px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.5px;color:#012619}
.app-screen .app-vcard__b{min-width:0}
.app-screen .app-vcard__b strong{display:block;font-size:11px;font-weight:700;color:#012619}
.app-screen .app-vcard__b span{font-size:9px;color:#8a9e94}
.app-screen .app-vmore{text-align:center;font-size:9.5px;font-weight:700;color:#025940;margin-top:9px}
.app-screen .app-fab{position:absolute;right:14px;bottom:64px;width:40px;height:40px;border-radius:50%;background:#025940;border:2px solid #b3f243;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(1,38,25,.32)}
.app-screen .app-fab svg{width:20px;height:20px;fill:#b3f243;stroke:none}
.app-screen .app-nav{flex-shrink:0;display:grid;grid-template-columns:repeat(5,1fr);align-items:end;gap:2px;padding:7px 4px 9px;background:#fff;border-top:1px solid #e4eae7}
.app-screen .app-nav__i{display:flex;flex-direction:column;align-items:center;gap:3px;color:#9aa8a2;font-size:7.5px;font-weight:700}
.app-screen .app-nav__i svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.app-screen .app-nav__i em{font-style:normal}
.app-screen .app-nav__i.is-on{color:#025940}
.app-screen .app-nav__i--add{color:#025940}
.app-screen .app-nav__add{width:34px;height:34px;border-radius:50%;background:#84cc16;display:flex;align-items:center;justify-content:center;margin-top:-12px;box-shadow:0 6px 14px rgba(132,204,22,.4)}
.app-screen .app-nav__add svg{width:18px;height:18px;stroke:#012619;stroke-width:2.5}
.yard-map{width:100%;background:#0c2c20;border-radius:14px;padding:12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.yard-map .ym-grid{display:grid;grid-template-columns:repeat(9,1fr);gap:3px}
.yard-map .ym-head{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;letter-spacing:.04em;color:#7fd1ab;padding:2px 0 4px}
.yard-map .ym-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:34px;border-radius:6px;font-size:8.5px;font-weight:800;line-height:1.1;letter-spacing:.01em;padding:3px 2px;color:#fff;overflow:hidden}
.yard-map .ym-cell small{display:block;font-size:7px;font-weight:600;opacity:.85;margin-top:1px}
.yard-map .ym--empty{background:rgba(255,255,255,.06);color:#5d7d70;font-weight:600}
.yard-map .ym--orange{background:#f59e0b}
.yard-map .ym--blue{background:#3b82f6}
.yard-map .ym--gold{background:#ca8a04}
.yard-map .ym--yellow{background:#facc15;color:#3a2e05}
.yard-map .ym--grey{background:#94a3b8;color:#1f2937}
.yard-map .ym--red{background:#991b1b}
.yard-map .ym-area{grid-column:7 / 10;grid-row:5 / 7;display:flex;align-items:center;justify-content:center;text-align:center;background:#bef264;color:#28400a;border-radius:8px;font-size:10px;font-weight:800;line-height:1.2;padding:6px}
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
