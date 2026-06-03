// src/components/features/dashboard/InsuranceWarningPopup.tsx
// Shows once per day on app open — lists ALL uninsured vehicles across ALL branches
// ✅ FIXED: Self-fetches org-wide data, no longer limited to current branch
// ✅ NEW: Groups vehicles by branch location
// ✅ NEW: Export to Excel with branch column
// Dismissed state stored in localStorage, resets daily
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { ShieldAlert, X, AlertTriangle, Download, Loader2, MapPin } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { branchService } from '@/lib/services/branchService'
import { supabase } from '@/lib/supabaseClient'
import { isVehicleNotInsured } from '@/lib/insuranceUtils'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface InsuranceWarningPopupProps {
  /** Legacy prop — kept for backwards compat but no longer used for the count */
  vehicles?: any[]
  fleetVehicles?: any[]
  className?: string
}

interface UninsuredVehicle {
  id: string
  registration: string
  make: string
  model: string
  insuranceStatus: string | null
  branchId: string
  branchName: string
}

const DISMISSED_KEY = 'yardao_insurance_warning_dismissed'

function wasDismissedToday(): boolean {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY)
    if (!stored) return false
    const d = new Date(stored)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
  } catch { return false }
}

function dismissForToday(): void {
  try { localStorage.setItem(DISMISSED_KEY, new Date().toISOString()) } catch {}
}

function exportToExcel(vehicles: UninsuredVehicle[]) {
  const C = { DARK: '012619', MED: '025940', TEAL: '72A68E', ACCENT: 'B3F243', WHITE: 'FFFFFF', CRIT: 'EF4444', LGREY: 'F8FAFB' }
  const fill  = (hex: string) => ({ patternType: 'solid' as const, fgColor: { rgb: hex } })
  const fnt   = (bold = false, color = '1A2E25', sz = 10) => ({ bold, color: { rgb: color }, sz, name: 'Arial' })
  const bdr   = () => { const s = { style: 'thin' as const, color: { rgb: 'D1E5DC' } }; return { top: s, bottom: s, left: s, right: s } }
  const aln   = (h: 'center' | 'left' | 'right' = 'left') => ({ horizontal: h, vertical: 'center' as const })

  const ws: XLSX.WorkSheet = {}
  ws['A1'] = { v: 'YARDAO — Uninsured Vehicles Report (All Branches)', t: 's', s: { font: fnt(true, C.ACCENT, 14), fill: fill(C.DARK), alignment: aln('center') } }
  ws['A2'] = { v: `Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}  ·  Total uninsured: ${vehicles.length}`, t: 's', s: { font: fnt(false, C.WHITE, 9), fill: fill(C.MED), alignment: aln('center') } }
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ]

  const headers = ['Registration', 'Make', 'Model', 'Branch', 'Status', 'Action Required']
  'ABCDEF'.split('').forEach((col, i) => {
    ws[`${col}3`] = { v: headers[i], t: 's', s: { font: fnt(true, C.WHITE, 10), fill: fill(C.MED), border: bdr(), alignment: aln('center') } }
  })

  vehicles.forEach((v, i) => {
    const r = i + 4
    const bg = i % 2 === 0 ? C.WHITE : C.LGREY
    const defs: [string, XLSX.CellObject][] = [
      [`A${r}`, { v: v.registration ?? '', t: 's', s: { font: fnt(true, C.DARK, 10), fill: fill(bg), border: bdr(), alignment: aln('center') } }],
      [`B${r}`, { v: v.make ?? '',         t: 's', s: { font: fnt(false, '1A2E25', 10), fill: fill(bg), border: bdr(), alignment: aln('left') } }],
      [`C${r}`, { v: v.model ?? '',        t: 's', s: { font: fnt(false, '1A2E25', 10), fill: fill(bg), border: bdr(), alignment: aln('left') } }],
      [`D${r}`, { v: v.branchName,         t: 's', s: { font: fnt(true, C.MED, 10),    fill: fill('E8F5EE'), border: bdr(), alignment: aln('center') } }],
      [`E${r}`, { v: 'Not Insured',        t: 's', s: { font: fnt(true, C.WHITE, 9),   fill: fill(C.CRIT),  border: bdr(), alignment: aln('center') } }],
      [`F${r}`, { v: 'Update insurance before checkout/hire', t: 's', s: { font: fnt(false, '7F1D1D', 10), fill: fill('FFF1F0'), border: bdr(), alignment: aln('left') } }],
    ]
    defs.forEach(([ref, c]) => { ws[ref] = c })
  })

  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 36 }]
  ws['!rows'] = [{ hpt: 30 }, { hpt: 16 }, { hpt: 24 }, ...vehicles.map(() => ({ hpt: 18 }))]
  ws['!ref'] = `A1:F${vehicles.length + 3}`

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Uninsured Vehicles')
  XLSX.writeFile(wb, `yardao-uninsured-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function InsuranceWarningPopup({ vehicles: _legacy, fleetVehicles: _fleet, className = '' }: InsuranceWarningPopupProps) {
  const t = useT()
  const { user } = useAuth()
  const [isDismissed, setIsDismissed]           = useState(true)
  const [isClosing, setIsClosing]               = useState(false)
  const [exporting, setExporting]               = useState(false)
  const [loading, setLoading]                   = useState(true)
  const [uninsuredVehicles, setUninsuredVehicles] = useState<UninsuredVehicle[]>([])

  // ── Fetch ALL uninsured vehicles across ALL branches for this org ──────────
  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return

      // 💸 Already acknowledged today → this popup won't render regardless
      // (see the render guard below). Skip the org-wide read entirely.
      // Without this gate we paid a full all-branches checkedInVehicles
      // scan on EVERY dashboard mount (~20×/day) only to discard it. The
      // first dashboard load of the day still fetches; the rest cost zero.
      if (wasDismissedToday()) {
        setLoading(false)
        return
      }

      try {
        // 1. Get org ID
        const profile = await userProfileService.getProfile(user.uid)
        const orgId = profile?.organizationId
        if (!orgId) return

        // 2. Get all branches so we can label vehicles with branch names
        const branches = await branchService.getBranches(orgId)
        const branchMap: Record<string, string> = { main: t('dashboard.insurance.mainBranch') }
        branches.forEach(b => {
          branchMap[b.slug] = b.name
        })

        // 3. Get ALL checked_in_vehicles for the org (not filtered by branchId)
        const { data: rows, error: vehErr } = await supabase
          .from('checked_in_vehicles')
          .select('id, registration, make, model, insurance_status, branch_id')
          .eq('organization_id', orgId)
        if (vehErr) throw vehErr

        const uninsured: UninsuredVehicle[] = []
        ;(rows ?? []).forEach(d => {
          if (isVehicleNotInsured(d.insurance_status)) {
            const branchId = d.branch_id || 'main'
            uninsured.push({
              id:              d.id,
              registration:    d.registration  || '',
              make:            d.make          || '',
              model:           d.model         || '',
              insuranceStatus: d.insurance_status || null,
              branchId,
              branchName:      branchMap[branchId] || branchId,
            })
          }
        })

        // Sort by branch name, then registration
        uninsured.sort((a, b) =>
          a.branchName.localeCompare(b.branchName) || a.registration.localeCompare(b.registration)
        )

        setUninsuredVehicles(uninsured)

        // Only show if there are uninsured vehicles AND not dismissed today
        if (uninsured.length > 0 && !wasDismissedToday()) {
          setIsDismissed(false)
        }
      } catch (err) {
        logger.error('InsuranceWarningPopup: failed to load vehicles', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.uid])

  // ── Group by branch for display ───────────────────────────────────────────
  const byBranch = useMemo(() => {
    const map: Record<string, { branchName: string; vehicles: UninsuredVehicle[] }> = {}
    uninsuredVehicles.forEach(v => {
      if (!map[v.branchId]) map[v.branchId] = { branchName: v.branchName, vehicles: [] }
      map[v.branchId].vehicles.push(v)
    })
    return Object.values(map).sort((a, b) => a.branchName.localeCompare(b.branchName))
  }, [uninsuredVehicles])

  const handleDismiss = () => {
    setIsClosing(true)
    dismissForToday()
    setTimeout(() => { setIsDismissed(true); setIsClosing(false) }, 300)
  }

  const handleExport = async () => {
    setExporting(true)
    await new Promise(r => setTimeout(r, 50))
    try { exportToExcel(uninsuredVehicles) }
    finally { setExporting(false) }
  }

  // Don't show while loading, if dismissed, or if no uninsured vehicles
  if (loading || isDismissed || uninsuredVehicles.length === 0) return null

  const total = uninsuredVehicles.length

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div className={`fixed z-[9999] inset-0 flex items-center justify-center p-4 transition-all duration-300 ${isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${className}`}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-[#e2e8e5] dark:border-gray-700 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

          {/* ── Header ── */}
          <div className="bg-[#012619] px-5 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">{t('dashboard.insurance.warningTitle')}</h2>
                <p className="text-[11px] text-[#72A68E]">{t('dashboard.insurance.dailyCheck')}</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4 text-[#72A68E]" />
            </button>
          </div>

          {/* ── Warning banner ── */}
          <div className="px-5 py-3.5 border-b border-[#e2e8e5] dark:border-gray-700 bg-red-50 dark:bg-red-900/10 flex-shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800 dark:text-red-300">
                  {t('dashboard.insurance.notInsuredSummary', { count: total, branchCount: byBranch.length })}
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                  {t('dashboard.insurance.cannotCheckout')}
                </p>
              </div>
            </div>
          </div>

          {/* ── Vehicle list — grouped by branch ── */}
          <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
            {byBranch.map(({ branchName, vehicles }) => (
              <div key={branchName}>
                {/* Branch header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#025940]/10 dark:bg-[#025940]/20 border border-[#025940]/20">
                    <MapPin className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                    <span className="text-[11px] font-bold text-[#025940] dark:text-[#72A68E] uppercase tracking-wide">
                      {branchName}
                    </span>
                    <span className="text-[10px] font-bold text-[#72A68E] ml-0.5">
                      ({vehicles.length})
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-[#e2e8e5] dark:bg-gray-700" />
                </div>

                {/* Vehicles in this branch */}
                <div className="space-y-1.5">
                  {vehicles.map(v => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between px-3 py-2 bg-[#f6f8f7] dark:bg-gray-700/30 rounded-lg border border-[#e2e8e5] dark:border-gray-600"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="text-xs font-bold text-[#012619] dark:text-white tracking-wide flex-shrink-0"
                          style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}
                        >
                          {v.registration}
                        </span>
                        <span className="text-xs text-[#4a5e54] dark:text-gray-400 truncate">
                          {v.make} {v.model}
                        </span>
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {t('dashboard.insurance.notInsuredBadge')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="px-5 py-3.5 bg-[#f0f4f2] dark:bg-gray-700/30 border-t border-[#e2e8e5] dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
            <p className="text-[10px] text-[#8a9e94] dark:text-gray-400 flex-shrink-0">
              {t('dashboard.insurance.appearsOncePerDay')}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                title={t('dashboard.insurance.exportTooltip', { count: total })}
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {exporting ? t('dashboard.insurance.exporting') : t('dashboard.insurance.exportExcel')}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-[#012619] hover:bg-[#025940] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                {t('dashboard.insurance.dismiss')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}