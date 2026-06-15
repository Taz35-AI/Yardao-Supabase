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

import { memo, useEffect, useRef } from 'react'
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
/* ── Feature-tour module panels: faithful LIGHT app cards (dummy data) ── */
.lp-frame{display:flex;justify-content:center;width:100%}
.lp-app{width:100%;max-width:392px;background:#f3f6f4;border:1px solid #dfe6e2;border-radius:14px;padding:11px;box-shadow:0 16px 40px rgba(1,20,15,.4);color:#0f1f18;font-size:11px;line-height:1.3;text-align:left}
.lp-app *,.lp-inv *{box-sizing:border-box}
.lp-plate{display:inline-block;background:linear-gradient(180deg,#fff,#f4f4f4 52%,#e3e3e3);border:1px solid #012619;border-radius:4px;padding:2px 7px;font-family:'DM Mono',ui-monospace,monospace;font-size:10.5px;font-weight:800;letter-spacing:.08em;color:#012619;box-shadow:0 1px 1.5px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.9);white-space:nowrap}
.lp-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.lp-htxt{display:flex;flex-direction:column;min-width:0}
.lp-title{font-size:14px;font-weight:850;color:#012619;letter-spacing:-.01em}
.lp-sub{font-size:9.5px;color:#72A68E;font-weight:600}
.lp-views{display:flex;gap:3px;margin-left:auto}
.lp-views i{display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:6px;background:#fff;border:1px solid #e2e8e5;color:#8a9e94}
.lp-views i svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lp-views i.is-on{background:#012619;color:#b3f243;border-color:#012619}
.lp-cta{display:inline-flex;align-items:center;gap:3px;margin-left:auto;background:#b3f243;color:#012619;font-weight:850;font-size:10px;padding:6px 10px;border-radius:8px;white-space:nowrap}
.lp-cta svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.lp-headic{display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:8px;background:#012619;color:#b3f243;flex-shrink:0}
.lp-headic svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lp-srch{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e2e8e5;border-radius:9px;padding:7px 9px;margin-bottom:9px}
.lp-srch svg{width:13px;height:13px;fill:none;stroke:#8a9e94;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.lp-srch span{color:#9aaba2;font-size:10px}
.lp-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:9px}
.lp-m{display:flex;flex-direction:column;gap:3px;background:#fff;border:1px solid #e2e8e5;border-radius:9px;padding:6px 7px;font-size:8.5px;font-weight:800;color:#5b6f66;text-transform:uppercase;letter-spacing:.02em}
.lp-m b{width:7px;height:7px;border-radius:50%}
.lp-m em{font-style:normal;font-size:15px;font-weight:850;color:#012619;text-transform:none}
.lp-vlist,.lp-blist,.lp-clist,.lp-dlist{display:flex;flex-direction:column;gap:6px}
.lp-vrow{position:relative;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #eef2f0;border-radius:10px;padding:7px 9px 7px 12px;overflow:hidden}
.lp-bar,.lp-bbar,.lp-dbar{position:absolute;left:0;top:0;bottom:0;width:3px}
.lp-vrow--ready .lp-bar{background:#16a34a}
.lp-vrow--pending .lp-bar{background:#d97706}
.lp-vrow--repairs .lp-bar{background:#dc2626}
.lp-vmeta{display:flex;flex-direction:column;flex:1;min-width:0}
.lp-vmeta strong{font-size:11px;font-weight:800;color:#012619}
.lp-vmeta span{font-size:9px;color:#8a9e94;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-st{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:850;padding:3px 8px;border-radius:999px;white-space:nowrap}
.lp-st i{width:5px;height:5px;border-radius:50%}
.lp-st--ready{background:#ecfdf3;color:#15803d}.lp-st--ready i{background:#16a34a}
.lp-st--pending{background:#fffbeb;color:#b45309}.lp-st--pending i{background:#d97706}
.lp-st--repairs{background:#fef2f2;color:#b91c1c}.lp-st--repairs i{background:#dc2626}
.lp-tabs{display:inline-flex;gap:3px;background:#eef2f0;border-radius:9px;padding:3px;margin-bottom:9px}
.lp-tabs span{font-size:9.5px;font-weight:800;color:#7c8d85;padding:4px 11px;border-radius:7px}
.lp-tabs span.is-on{background:#fff;color:#025940;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lp-dayline{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:800;color:#374b42;margin-bottom:8px}
.lp-today{background:#b3f243;color:#012619;font-size:8px;font-weight:850;padding:2px 6px;border-radius:6px;letter-spacing:.06em}
.lp-brow,.lp-drow{position:relative;display:flex;gap:8px;background:#fff;border:1px solid #eef2f0;border-radius:10px;padding:7px 9px 7px 12px;overflow:hidden}
.lp-brow--sched .lp-bbar{background:#38bdf8}
.lp-brow--ext .lp-bbar{background:#72A68E}
.lp-brow--prog .lp-bbar{background:#f59e0b}
.lp-brow--done .lp-bbar{background:#34d399}
.lp-time{font-size:12px;font-weight:850;color:#012619;min-width:34px;display:flex;align-items:center}
.lp-bmeta,.lp-dmeta{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.lp-btop{display:flex;align-items:center;justify-content:space-between;gap:6px}
.lp-yplate{display:inline-block;background:#fde047;border:1px solid #eab308;border-radius:4px;padding:1.5px 6px;font-family:'DM Mono',ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:.05em;color:#1f2937;white-space:nowrap}
.lp-bmeta>strong{font-size:11px;font-weight:800;color:#1f2c27}
.lp-bst,.lp-dtype{font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:999px;white-space:nowrap}
.lp-bst--sched{background:#e0f2fe;color:#0369a1}
.lp-bst--ext{background:rgba(114,166,142,.22);color:#025940}
.lp-bst--prog{background:#fef3c7;color:#b45309}
.lp-bst--done{background:#d1fae5;color:#047857}
.lp-btags{display:flex;gap:4px;flex-wrap:wrap}
.lp-tag{font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:6px}
.lp-tag--bay1{background:#e0f2fe;color:#0369a1}
.lp-tag--bay2{background:#fef3c7;color:#b45309}
.lp-tag--garage{background:#eef2f0;color:#025940}
.lp-pills{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
.lp-p{flex:1;display:flex;align-items:center;gap:5px;background:#fff;border:1px solid #e2e8e5;border-radius:9px;padding:5px 6px;min-width:0}
.lp-pi{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;color:#b3f243;font-size:11px;flex-shrink:0}
.lp-pi svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.lp-p>span{display:flex;flex-direction:column;font-size:7.5px;color:#8a9e94;font-weight:800;text-transform:uppercase;letter-spacing:.02em;min-width:0}
.lp-p em{font-style:normal;font-size:13px;font-weight:850;color:#012619;text-transform:none}
.lp-p--amber .lp-pi{background:#fffbeb;color:#d97706}
.lp-p--red .lp-pi{background:#fef2f2;color:#dc2626}
.lp-cats{display:flex;flex-direction:column;gap:6px}
.lp-cat{background:#fff;border:1px solid #e2e8e5;border-left:3px solid #72A68E;border-radius:10px;overflow:hidden}
.lp-cat--out{border-left-color:#ef4444}
.lp-cat--low{border-left-color:#f59e0b}
.lp-cat--ok{border-left-color:#72A68E}
.lp-cathead{display:flex;align-items:center;gap:8px;padding:8px 9px}
.lp-catic{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:#f0f7f4;font-size:15px;flex-shrink:0}
.lp-catmeta{display:flex;flex-direction:column;flex:1;min-width:0}
.lp-catmeta strong{font-size:11.5px;font-weight:800;color:#012619}
.lp-catmeta span{font-size:9px;color:#8a9e94}
.lp-cpill{font-size:8px;font-weight:850;padding:2px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
.lp-cpill--out{background:#fef2f2;color:#b91c1c}
.lp-cpill--low{background:#fffbeb;color:#b45309}
.lp-cpill--ok{background:#ecfdf3;color:#15803d}
.lp-chev{color:#b5c3bc;font-size:10px}
.lp-lines{display:flex;flex-direction:column;border-top:1px solid #eef2f0}
.lp-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;font-size:10px;color:#3a4b44}
.lp-line+.lp-line{border-top:1px solid #f1f5f3}
.lp-q{font-size:9px;font-weight:850;padding:2px 7px;border-radius:6px;font-family:'DM Mono',ui-monospace,monospace}
.lp-q--out{background:#fef2f2;color:#b91c1c}
.lp-q--low{background:#fffbeb;color:#b45309}
.lp-q--ok{background:#f0f7f4;color:#025940}
.lp-inv{width:100%;max-width:360px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 16px 40px rgba(1,20,15,.45);color:#1f2c27;font-size:10px;text-align:left}
.lp-inv__bar{height:5px;background:#025940}
.lp-inv__head{display:flex;align-items:flex-start;justify-content:space-between;padding:11px 13px 8px}
.lp-inv__ttl{display:block;font-size:18px;font-weight:850;color:#025940;letter-spacing:.02em}
.lp-inv__no{display:block;font-size:10px;font-weight:800;color:#1f2c27;margin-top:2px}
.lp-inv__dt{display:block;font-size:9px;color:#8a9e94}
.lp-inv__status{background:#dbeafe;color:#1d4ed8;font-size:8.5px;font-weight:850;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
.lp-inv__parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 13px 9px}
.lp-inv__parties>div{display:flex;flex-direction:column;font-size:9px;color:#42514a;font-weight:600}
.lp-inv__parties b{font-size:7.5px;font-weight:850;letter-spacing:.08em;color:#9aaba2;margin-bottom:2px}
.lp-inv__parties span{font-size:8px;color:#8a9e94;font-weight:500}
.lp-inv__veh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 13px 9px;padding:8px 10px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px}
.lp-inv__veh .l{display:flex;flex-direction:column;gap:3px}
.lp-inv__veh b{font-size:7.5px;font-weight:850;letter-spacing:.08em;color:#3b82f6}
.lp-inv__veh .r{display:flex;flex-direction:column;align-items:flex-end}
.lp-inv__veh .r strong{font-size:10px;font-weight:800;color:#1f2c27}
.lp-inv__veh .r span{font-size:8.5px;color:#8a9e94}
.lp-inv__tbl{width:calc(100% - 26px);margin:0 13px;border-collapse:collapse;font-size:9px}
.lp-inv__tbl th{text-align:left;background:#f5f7fa;color:#7c8d85;font-size:7.5px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;padding:5px 7px}
.lp-inv__tbl th:last-child,.lp-inv__tbl td:last-child{text-align:right}
.lp-inv__tbl th:nth-child(2),.lp-inv__tbl td:nth-child(2){text-align:center;width:34px}
.lp-inv__tbl td{padding:5px 7px;border-bottom:1px solid #f1f5f3;color:#3a4b44}
.lp-inv__tot{display:flex;flex-direction:column;gap:3px;align-items:flex-end;padding:9px 13px 4px}
.lp-inv__tot>div{display:flex;justify-content:space-between;gap:20px;width:154px;font-size:9px;color:#5b6f66}
.lp-inv__tot>div span:last-child{font-weight:700;color:#1f2c27}
.lp-inv__tot .g{border-top:1.5px solid #025940;margin-top:3px;padding-top:5px}
.lp-inv__tot .g span{font-size:13px;font-weight:850;color:#025940}
.lp-inv__foot{text-align:center;font-style:italic;font-size:8.5px;color:#9aaba2;padding:8px;border-top:1px solid #f1f5f3;margin-top:6px}
.lp-crow{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #eef2f0;border-radius:10px;padding:7px 9px}
.lp-cmeta{display:flex;flex-direction:column;flex:1;min-width:0}
.lp-cmeta strong{font-size:11px;font-weight:800;color:#012619}
.lp-cmeta span{font-size:9px;color:#8a9e94}
.lp-cflags{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.lp-badge{font-size:8px;font-weight:850;padding:2px 7px;border-radius:6px;white-space:nowrap}
.lp-badge--exp{background:#dc2626;color:#fff}
.lp-badge--warn{background:#f97316;color:#fff}
.lp-badge--soon{background:#facc15;color:#3a2e05}
.lp-ins{font-size:8px;font-weight:800;padding:2px 7px;border-radius:999px;white-space:nowrap}
.lp-ins--yes{background:#e6f4ec;color:#0d6b2e}
.lp-ins--no{background:#fff0ee;color:#bf1d19}
.lp-week{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:9px}
.lp-week b{font-size:7.5px;font-weight:800;color:#8a9e94;text-align:center;text-transform:uppercase}
.lp-week span{display:flex;align-items:center;justify-content:center;height:24px;border-radius:6px;background:#fff;border:1px solid #eef2f0;font-size:9.5px;font-weight:700;color:#42514a}
.lp-week span.lp-wk--today{background:#012619;color:#fff;border-color:#012619}
.lp-week span.lp-wk--in{box-shadow:inset 0 -3px 0 #025940}
.lp-week span.lp-wk--out{box-shadow:inset 0 -3px 0 #dc2626}
.lp-drow--in .lp-dbar{background:#025940}
.lp-drow--out .lp-dbar{background:#dc2626}
.lp-dmeta>span{font-size:9px;color:#8a9e94}
.lp-dtype--in{background:rgba(2,89,64,.12);color:#025940}
.lp-dtype--out{background:#fef2f2;color:#b91c1c}
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
    // Delegated on `document` and reading the live DOM each call. The landing
    // markup is injected via dangerouslySetInnerHTML; under StrictMode/HMR React
    // can re-create those nodes, so captured node refs go stale and listeners
    // bound to them stop firing. Delegation + fresh queries survive that.
    const tourStepEls = () => qa<HTMLElement>('.tour-step')
    const currentTour = () => {
      const i = tourStepEls().findIndex(s => s.classList.contains('is-active'))
      return i < 0 ? 0 : i
    }
    const setTour = (target: number | string) => {
      const steps = tourStepEls()
      const panels = qa<HTMLElement>('.tour-panel')
      if (!steps.length) return
      const targetIndex =
        typeof target === 'number'
          ? target
          : steps.findIndex(s => s.dataset.tourStep === target)
      const nextIndex = (targetIndex + steps.length) % steps.length
      const stepId = steps[nextIndex].dataset.tourStep
      steps.forEach((s, i) => {
        s.classList.toggle('is-active', i === nextIndex)
        s.setAttribute('aria-hidden', String(i !== nextIndex))
      })
      panels.forEach(p => {
        const isActive = p.dataset.tourPanel === stepId
        p.classList.toggle('is-active', isActive)
        p.setAttribute('aria-hidden', String(!isActive))
      })
      qa<HTMLElement>('.tour-tab').forEach(tab => {
        const isActive = tab.dataset.tourTarget === stepId
        tab.classList.toggle('is-active', isActive)
        tab.setAttribute('aria-selected', String(isActive))
        tab.tabIndex = isActive ? 0 : -1
      })
      const prog = q<HTMLElement>('.tour-progress')
      if (prog) prog.textContent = `${String(nextIndex + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`
    }
    on(document, 'click', ((e: Event) => {
      const t = e.target as HTMLElement
      if (!t?.closest) return
      if (t.closest('.tour-arrow--next')) setTour(currentTour() + 1)
      else if (t.closest('.tour-arrow--prev')) setTour(currentTour() - 1)
      else {
        const tab = t.closest<HTMLElement>('.tour-tab')
        if (tab) setTour(tab.dataset.tourTarget ?? 0)
      }
    }) as EventListener)
    on(document, 'keydown', ((e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target as HTMLElement
      if (!t?.closest?.('.feature-tour')) return
      e.preventDefault()
      setTour(currentTour() + (e.key === 'ArrowRight' ? 1 : -1))
    }) as EventListener)
    let sx = 0, sy = 0
    on(document, 'pointerdown', ((e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.feature-tour__grid')) { sx = e.clientX; sy = e.clientY }
    }) as EventListener)
    on(document, 'pointerup', ((e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.feature-tour__grid')) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return
      setTour(currentTour() + (dx < 0 ? 1 : -1))
    }) as EventListener)
    setTour(0)

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

// memo: the parent (HomePage) re-renders frequently (typing animation, scroll
// state). LandingPage takes no props, so memo keeps its element referentially
// stable — React never reconciles the dangerouslySetInnerHTML subtree, so the
// carousel's runtime class toggles aren't stomped back to the baked default.
export default memo(LandingPage)
