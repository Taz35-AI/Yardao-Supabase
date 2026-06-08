// src/lib/tour/dashboardTour.ts
// Guided onboarding tour for the dashboard, built on driver.js (vanilla JS, no
// React-version constraint - works on React 19). Walks new users through the
// navigation map + the main dashboard actions with a short description each.
//
// Targets are matched by data-tour="..." attributes on nav items / buttons.
// Steps whose target isn't present in the DOM (e.g. hidden on mobile, or a
// feature a member-role user can't see) are skipped automatically, so the tour
// never errors on a missing element.
'use client'

import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

interface StepDef {
  sel: string
  title: string
  description: string
}

const STEP_DEFS: StepDef[] = [
  // ── Navigation map ──────────────────────────────────────────────────────
  { sel: '[data-tour="nav-/dashboard"]', title: 'Yard', description: 'Your live yard overview - every vehicle currently in the yard, grouped by status (Ready, Pending, Repairs, On-hire).' },
  { sel: '[data-tour="nav-/reports"]', title: 'Reports', description: 'Fleet analytics and exportable reports - utilisation, MOT/tax compliance and activity over time.' },
  { sel: '[data-tour="nav-/fleet"]', title: 'Fleet', description: 'Your master vehicle inventory. Add, edit or bulk-import vehicles and keep MOT, tax and insurance up to date.' },
  { sel: '[data-tour="nav-/service-bookings"]', title: 'Service', description: 'Schedule and track services, MOTs and repairs - in-house or sent out to external garages.' },
  { sel: '[data-tour="nav-/customers"]', title: 'Garage Customers', description: 'Records for external garage customers - their contact details, vehicles and job history.' },
  { sel: '[data-tour="nav-/deliveries-defleet"]', title: 'Deliveries & Defleet', description: 'Handle incoming deliveries and defleet vehicles that are leaving your fleet for good.' },
  { sel: '[data-tour="nav-/checkout-history"]', title: 'Checkout', description: 'A full history of every vehicle that has left the yard - with the branch it left from and the date.' },
  { sel: '[data-tour="nav-/branch-overview"]', title: 'Branch Overview', description: 'Compare what is happening across all of your branches at a glance.' },
  { sel: '[data-tour="nav-/stock"]', title: 'Stock & Parts', description: 'Manage your parts inventory, stock levels, orders and create invoices.' },
  { sel: '[data-tour="nav-/bodyshop"]', title: 'Bodyshop', description: 'A kanban board for bodyshop jobs - track each repair through Prep, Paint and Finishing.' },
  { sel: '[data-tour="nav-/profile"]', title: 'Profile', description: 'Your personal account - update your name, password, language and notification preferences.' },
  { sel: '[data-tour="nav-/settings"]', title: 'Settings', description: 'Organisation settings - manage your team and their roles, branches, contracts and vehicle conditions.' },
  // ── Dashboard actions ───────────────────────────────────────────────────
  { sel: '[data-tour="check-in"]', title: 'Check in a vehicle', description: 'The main action - click here to add a vehicle to the yard. Type its registration and the make, model and colour auto-fill from DVLA.' },
  { sel: '[data-tour="search"]', title: 'Search', description: 'Quickly find any vehicle in the yard by registration, make or model.' },
  { sel: '[data-tour="presence"]', title: "Who's online", description: 'See which of your team members are using the app right now, live.' },
  { sel: '[data-tour="actions-menu"]', title: 'More actions', description: 'The three-dot menu holds the extra tools: refresh the yard, clean up old notes, and export the current list to Excel.' },
  { sel: '[data-tour="tour-help"]', title: 'Replay this tour', description: 'You can re-open this tour any time from here. That is the end - enjoy Yardao!' },
]

/**
 * Start the dashboard tour. `onDone` fires when the tour is finished or closed
 * (used to persist that the user has seen it). No-ops if no targets exist yet.
 */
export function startDashboardTour(onDone?: () => void) {
  if (typeof document === 'undefined') return

  // Only include targets that are actually rendered AND visible (so the tour
  // never tries to highlight a display:none element, e.g. on mobile).
  const isVisible = (sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null
    return !!el && el.getClientRects().length > 0
  }

  const steps: DriveStep[] = STEP_DEFS
    .filter((d) => isVisible(d.sel))
    .map((d) => ({
      element: d.sel,
      popover: { title: d.title, description: d.description },
    }))

  if (steps.length === 0) {
    onDone?.()
    return
  }

  const d = driver({
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    allowClose: true,
    smoothScroll: true,
    steps,
    // The desktop sidebar nav is a scrollable container (overflow-y-auto), so
    // lower items like Profile and Settings sit below the fold. driver.js does
    // not reliably scroll a nested container, so we nudge each target into view
    // ourselves before its popover positions. Instant (no smooth) so the
    // highlight box lands on the element's final on-screen position.
    onHighlightStarted: (element?: Element) => {
      try {
        (element as HTMLElement | undefined)?.scrollIntoView({ block: 'center', inline: 'nearest' })
      } catch {
        /* best-effort - never let scrolling break the tour */
      }
    },
    onDestroyed: () => {
      onDone?.()
    },
  })

  d.drive()
}
