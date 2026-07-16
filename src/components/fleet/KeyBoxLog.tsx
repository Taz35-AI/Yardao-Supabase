// src/components/fleet/KeyBoxLog.tsx
// Head-office spare-key box log — premium, mobile-first. Every physical spare
// key lives in a BOX (B1, B2, …) and a numbered SLOT. Search by reg instantly
// answers "which box / slot?", the Coverage tab answers "which vehicles have
// no spare key at all". Live via a supabase realtime subscription; make/model
// are enriched from the live fleet by registration.
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyRound, Search, Plus, X, Loader2, Download, Pencil, Trash2,
  BookOpen, MapPin, CheckCircle2, AlertTriangle, RefreshCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { useFleetData } from '@/hooks/useFleetData'
import { supabase } from '@/lib/supabaseClient'
import { spareKeyService, normKeyReg, keyRegTokens, SlotOccupiedError, type SpareKey } from '@/lib/services/spareKeyService'
import { useT } from '@/lib/i18n'

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm placeholder:text-[#9db0a6] focus:border-[#025940] outline-none transition-colors'

// Natural box ordering: B1, B2 … B10 (not B1, B10, B2).
const boxSort = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

interface EnrichedKey extends SpareKey {
  fleetMake?: string | null
  fleetModel?: string | null
  inFleet: boolean
}

export function KeyBoxLog() {
  const t = useT()
  const { user } = useAuth()
  const fleetData = useFleetData() as any
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [actorName, setActorName] = useState('Unknown')
  const [keys, setKeys] = useState<SpareKey[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'box' | 'queue' | 'missing'>('box')
  const [editKey, setEditKey] = useState<SpareKey | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [prefillReg, setPrefillReg] = useState('')

  // Resolve org + actor once.
  useEffect(() => {
    if (!user?.uid) return
    userProfileService.getProfile(user.uid).then((p) => {
      setOrganizationId(p?.organizationId || null)
      setActorName(p?.displayName || user.email || 'Unknown')
    }).catch(() => {})
  }, [user?.uid, user?.email])

  const load = useCallback(async () => {
    if (!organizationId) return
    const rows = await spareKeyService.getKeys(organizationId)
    setKeys(rows)
    setLoading(false)
  }, [organizationId])

  useEffect(() => { load() }, [load])

  // Live: any change to spare_keys → reload (small table; simplest is safest).
  useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel(`spare_keys:${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spare_keys', filter: `organization_id=eq.${organizationId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [organizationId, load])

  // Live fleet index (active vehicles only) by normalised reg.
  const fleetByReg = useMemo(() => {
    const m = new Map<string, any>()
    for (const v of (fleetData?.vehicles || [])) {
      if (v.isDefleeted) continue
      const reg = normKeyReg(v.registration)
      if (reg) m.set(reg, v)
    }
    return m
  }, [fleetData?.vehicles])

  // Dual-plate aware: "41WP (HK72XXL)" matches the fleet on EITHER token.
  const enriched = useMemo<EnrichedKey[]>(() =>
    keys.map((k) => {
      const fv = keyRegTokens(k.registration).map((t) => fleetByReg.get(t)).find(Boolean)
      return { ...k, fleetMake: fv?.make ?? null, fleetModel: fv?.model ?? null, inFleet: !!fv }
    }), [keys, fleetByReg])

  const keyRegs = useMemo(() => {
    const s = new Set<string>()
    for (const k of keys) for (const t of keyRegTokens(k.registration)) s.add(t)
    return s
  }, [keys])

  // Fleet vehicles WITHOUT a spare key.
  const missing = useMemo(() => {
    const out: any[] = []
    for (const [reg, v] of fleetByReg) {
      if (!keyRegs.has(reg)) out.push(v)
    }
    out.sort((a, b) => (a.registration || '').localeCompare(b.registration || ''))
    return out
  }, [fleetByReg, keyRegs])

  const coveragePct = fleetByReg.size > 0
    ? Math.round(((fleetByReg.size - missing.length) / fleetByReg.size) * 100)
    : 0

  // Search across reg / box / make / model.
  const q = normKeyReg(search)
  const qLower = search.trim().toLowerCase()
  const searchHits = useMemo(() => {
    if (!q) return []
    return enriched.filter((k) =>
      normKeyReg(k.registration).includes(q) ||
      (k.box || '').toUpperCase() === q ||
      `${k.fleetMake || k.make || ''} ${k.fleetModel || k.model || ''}`.toLowerCase().includes(qLower),
    )
  }, [enriched, q, qLower])

  // Queue = keys waiting for a slot (box/slot null). Boxes = the located ones.
  const queued = useMemo(() => enriched.filter((k) => !k.box || k.slot == null), [enriched])
  const located = useMemo(() => enriched.filter((k) => k.box && k.slot != null), [enriched])

  const boxes = useMemo(() => {
    const map = new Map<string, EnrichedKey[]>()
    for (const k of located) {
      const b = k.box as string
      if (!map.has(b)) map.set(b, [])
      map.get(b)!.push(k)
    }
    return Array.from(map.entries()).sort((a, b) => boxSort(a[0], b[0]))
  }, [located])

  const boxNames = useMemo(() => boxes.map(([b]) => b), [boxes])

  const missingFiltered = useMemo(() => {
    if (!q) return missing
    return missing.filter((v) =>
      normKeyReg(v.registration).includes(q) ||
      `${v.make || ''} ${v.model || ''}`.toLowerCase().includes(qLower),
    )
  }, [missing, q, qLower])

  const exportExcel = () => {
    const data = enriched.map((k) => ({
      'Box': k.box || 'QUEUE',
      'Slot': k.slot ?? '',
      'Registration': k.registration,
      'Make': k.fleetMake || k.make || '',
      'Model': k.fleetModel || k.model || '',
      'Type': k.vehicleType || '',
      'Logbook': k.logbook ? 'YES' : '',
      'In fleet': k.inFleet ? 'YES' : 'NO',
      'Notes': k.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 22 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Key box')
    XLSX.writeFile(wb, `key-box-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const openAdd = (reg = '') => { setPrefillReg(reg); setShowAdd(true) }

  // ── Key chip (a slot in a box) ──────────────────────────────────────────────
  const KeyChip = ({ k, big = false }: { k: EnrichedKey; big?: boolean }) => (
    <button
      onClick={() => setEditKey(k)}
      className={`group text-left rounded-xl border bg-white dark:bg-gray-800 hover:shadow-md hover:border-[#72A68E] transition-all ${
        big ? 'p-3.5' : 'p-2.5'
      } ${k.inFleet ? 'border-[#e2e8e5] dark:border-gray-700' : 'border-dashed border-[#c8d5ce] dark:border-gray-600'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono font-extrabold text-[#012619] dark:text-white ${big ? 'text-base' : 'text-[13px]'}`}>
          {k.registration}
        </span>
        {k.box && k.slot != null ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#012619] text-[#b3f243] font-extrabold px-2 py-0.5 text-[11px] tracking-wide">
            {k.box}·{k.slot}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-extrabold px-2 py-0.5 text-[10px] uppercase tracking-wide">
            {t('fleet.keyBox.queueBadge')}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 min-h-[16px]">
        <span className={`text-[11px] truncate ${k.inFleet ? 'text-[#72A68E]' : 'text-[#9db0a6] italic'}`}>
          {(k.fleetMake || k.make) ? `${k.fleetMake || k.make} ${k.fleetModel || k.model || ''}`.trim() : k.inFleet ? '—' : t('fleet.keyBox.notInFleet')}
        </span>
        {k.logbook && (
          <span title={t('fleet.keyBox.logbook')} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">
            <BookOpen className="w-3 h-3" /> V5
          </span>
        )}
      </div>
    </button>
  )

  return (
    <div className="space-y-3">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#012619] via-[#024733] to-[#025940] px-4 py-4 sm:px-6 sm:py-5 shadow-md">
        <div className="pointer-events-none absolute -right-8 -top-10 w-44 h-44 rounded-full bg-[#b3f243]/10 blur-3xl" />
        <div className="pointer-events-none absolute right-4 bottom-0 opacity-[0.07]">
          <KeyRound className="w-28 h-28 text-[#b3f243]" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#b3f243]/15 ring-1 ring-[#b3f243]/30 flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-5 h-5 sm:w-6 sm:h-6 text-[#b3f243]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black text-white leading-tight">{t('fleet.keyBox.title')}</h1>
              <p className="text-[11px] sm:text-xs text-[#a9c6b9]">{t('fleet.keyBox.subtitle')}</p>
            </div>
          </div>

          {/* Search — the "where is it?" moment */}
          <div className="mt-3 flex items-center gap-2 bg-white rounded-2xl px-3.5 py-2.5 sm:py-3 shadow-lg">
            <Search className="w-4 h-4 text-[#74877d] flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('fleet.keyBox.searchPlaceholder')}
              className="flex-1 bg-transparent outline-none text-[#06251a] font-semibold placeholder:text-[#9bafa5] text-sm min-w-0 uppercase"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-[#9bafa5] hover:text-[#06251a] flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-white px-3 py-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#b3f243]" /> {t('fleet.keyBox.statKeys', { count: keys.length })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-white px-3 py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#b3f243]" /> {t('fleet.keyBox.statCoverage', { pct: coveragePct })}
            </span>
            {queued.length > 0 && (
              <button
                onClick={() => setTab('queue')}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#b3f243]/15 text-[#d9f8a1] px-3 py-1.5 hover:bg-[#b3f243]/25 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" /> {t('fleet.keyBox.statQueue', { count: queued.length })}
              </button>
            )}
            <button
              onClick={() => setTab('missing')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
                missing.length > 0 ? 'bg-amber-400/20 text-amber-200 hover:bg-amber-400/30' : 'bg-white/10 text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> {t('fleet.keyBox.statMissing', { count: missing.length })}
            </button>
          </div>
        </div>
      </div>

      {/* ── Search results (front and centre when typing) ─────────────────── */}
      {q && (
        <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-3.5">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#8a9e94] mb-2.5 inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {t('fleet.keyBox.searchResults', { count: searchHits.length })}
          </p>
          {searchHits.length === 0 ? (
            <div>
              <p className="text-sm text-[#4a5e54] dark:text-gray-300">{t('fleet.keyBox.noKeyFound')}</p>
              <button
                onClick={() => openAdd(search.toUpperCase())}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#025940] hover:bg-[#012619] text-white text-xs font-bold px-3.5 py-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t('fleet.keyBox.addThisReg', { reg: search.toUpperCase() })}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {searchHits.map((k) => <KeyChip key={k.id} k={k} big />)}
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar: tabs + actions ───────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-1 shadow-sm">
          {([
            { key: 'box' as const, label: t('fleet.keyBox.tabBox') },
            { key: 'queue' as const, label: t('fleet.keyBox.tabQueue', { count: queued.length }) },
            { key: 'missing' as const, label: t('fleet.keyBox.tabMissing', { count: missing.length }) },
          ]).map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-3 sm:px-3.5 py-2 rounded-lg text-xs sm:text-[13px] font-semibold whitespace-nowrap transition-all ${
                tab === tb.key
                  ? 'bg-gradient-to-br from-[#025940] to-[#012619] text-white shadow-sm'
                  : 'text-[#4a5e54] dark:text-gray-400 hover:bg-[#f0f4f2] dark:hover:bg-gray-700/50'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => load()}
          title={t('fleet.keyBox.refresh')}
          className="p-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940] hover:border-[#72A68E] shadow-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={exportExcel}
          title={t('fleet.keyBox.export')}
          className="p-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] hover:text-[#025940] hover:border-[#72A68E] shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={() => openAdd()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#b3f243] hover:bg-[#9fd93a] text-[#012619] text-sm font-bold px-3.5 py-2.5 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('fleet.keyBox.addKey')}</span>
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-xs text-[#72A68E] inline-flex items-center gap-1.5 py-8"><Loader2 className="w-4 h-4 animate-spin" /> {t('fleet.keyBox.loading')}</p>
      ) : tab === 'box' ? (
        boxes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c8d5ce] dark:border-gray-700 p-8 text-center">
            <KeyRound className="w-8 h-8 text-[#c8d5ce] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#4a5e54] dark:text-gray-300">{t('fleet.keyBox.emptyTitle')}</p>
            <p className="text-xs text-[#8a9e94] mt-1">{t('fleet.keyBox.emptyBody')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {boxes.map(([box, list]) => (
              <div key={box} className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f8faf9] dark:bg-gray-900 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white dark:bg-gray-800 border-b border-[#eef2f0] dark:border-gray-700">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#012619] text-[#b3f243] font-black text-sm">{box}</span>
                  <span className="text-sm font-bold text-[#012619] dark:text-white">{t('fleet.keyBox.boxTitle', { box })}</span>
                  <span className="text-[11px] font-bold text-[#8a9e94]">{t('fleet.keyBox.boxCount', { count: list.length })}</span>
                </div>
                <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {list.map((k) => <KeyChip key={k.id} k={k} />)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'queue' ? (
        // Queue — keys at head office waiting for a box + slot
        queued.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c8d5ce] dark:border-gray-700 p-8 text-center">
            <KeyRound className="w-8 h-8 text-[#c8d5ce] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#4a5e54] dark:text-gray-300">{t('fleet.keyBox.queueEmptyTitle')}</p>
            <p className="text-xs text-[#8a9e94] mt-1">{t('fleet.keyBox.queueEmptyBody')}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2.5 bg-amber-100/60 dark:bg-amber-900/20 border-b border-amber-200/70 dark:border-amber-800/40">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{t('fleet.keyBox.queueTitle', { count: queued.length })}</p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">{t('fleet.keyBox.queueHint')}</p>
            </div>
            <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
              {queued.map((k) => (
                <div key={k.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-white/60 dark:bg-transparent">
                  <span className="font-mono font-bold text-sm text-[#012619] dark:text-white flex-shrink-0">{k.registration}</span>
                  <span className="text-xs text-[#72A68E] flex-1 truncate">
                    {(k.fleetMake || k.make) ? `${k.fleetMake || k.make} ${k.fleetModel || k.model || ''}`.trim() : k.inFleet ? '' : t('fleet.keyBox.notInFleet')}
                  </span>
                  <button
                    onClick={() => setEditKey(k)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-[11px] font-bold px-2.5 py-1.5 transition-colors flex-shrink-0"
                  >
                    <MapPin className="w-3 h-3" /> {t('fleet.keyBox.assign')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        // Missing spare keys
        missingFiltered.length === 0 ? (
          <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-green-50 dark:bg-green-950/20 p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-green-800 dark:text-green-300">{t('fleet.keyBox.missingNone')}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm divide-y divide-[#eef2f0] dark:divide-gray-800">
            {missingFiltered.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="font-mono font-bold text-sm text-[#012619] dark:text-white flex-shrink-0">{v.registration}</span>
                <span className="text-xs text-[#72A68E] flex-1 truncate">{[v.make, v.model].filter(Boolean).join(' ')}</span>
                <button
                  onClick={() => openAdd(v.registration || '')}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-[11px] font-bold px-2.5 py-1.5 transition-colors flex-shrink-0"
                >
                  <Plus className="w-3 h-3" /> {t('fleet.keyBox.addShort')}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {(showAdd || editKey) && organizationId && (
        <KeyFormModal
          organizationId={organizationId}
          actorName={actorName}
          userId={user?.uid || null}
          existing={editKey}
          prefillReg={prefillReg}
          keys={keys}
          boxNames={boxNames}
          fleetByReg={fleetByReg}
          onClose={() => { setShowAdd(false); setEditKey(null) }}
          onSaved={() => { setShowAdd(false); setEditKey(null); load() }}
        />
      )}
    </div>
  )
}

// ── Add / edit modal ──────────────────────────────────────────────────────────

function KeyFormModal({
  organizationId,
  actorName,
  userId,
  existing,
  prefillReg,
  keys,
  boxNames,
  fleetByReg,
  onClose,
  onSaved,
}: {
  organizationId: string
  actorName: string
  userId: string | null
  existing: SpareKey | null
  prefillReg: string
  keys: SpareKey[]
  boxNames: string[]
  fleetByReg: Map<string, any>
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const isEdit = !!existing
  const [registration, setRegistration] = useState(existing?.registration || prefillReg)
  // Queue mode: the key exists but has no slot yet. Editing a queued key starts
  // with the toggle ON — unticking it becomes the "assign to a box" flow.
  const [toQueue, setToQueue] = useState(isEdit ? existing!.box == null || existing!.slot == null : false)
  const [box, setBox] = useState(existing?.box || boxNames[0] || 'B1')
  const [newBox, setNewBox] = useState('')
  const [slot, setSlot] = useState(existing?.slot != null ? String(existing.slot) : '')
  const [logbook, setLogbook] = useState(existing?.logbook || false)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const slotTouched = useRef(isEdit && existing?.slot != null)

  const effectiveBox = (newBox.trim() || box).toUpperCase()

  // First free slot in the chosen box — suggested automatically until the user
  // types a slot themselves.
  const takenSlots = useMemo(() => {
    const s = new Set<number>()
    for (const k of keys) {
      if (k.box && k.slot != null && k.box.toUpperCase() === effectiveBox && k.id !== existing?.id) s.add(k.slot)
    }
    return s
  }, [keys, effectiveBox, existing?.id])

  const firstFree = useMemo(() => {
    let n = 1
    while (takenSlots.has(n)) n++
    return n
  }, [takenSlots])

  useEffect(() => {
    if (!slotTouched.current) setSlot(String(firstFree))
  }, [firstFree])

  const slotNum = parseInt(slot, 10)
  const slotConflict = Number.isFinite(slotNum) && takenSlots.has(slotNum)

  // Dual-plate aware fleet match ("41WP (HK72XXL)" matches on either token).
  const fleetMatch = keyRegTokens(registration).map((t) => fleetByReg.get(t)).find(Boolean)

  const dupKey = useMemo(() => {
    const toks = keyRegTokens(registration)
    if (!toks.length) return null
    return keys.find((k) =>
      k.id !== existing?.id && keyRegTokens(k.registration).some((t) => toks.includes(t)),
    ) || null
  }, [keys, registration, existing?.id])

  // Autocomplete: 3+ typed characters → suggest matching fleet registrations.
  const keyRegSet = useMemo(() => {
    const s = new Set<string>()
    for (const k of keys) {
      if (k.id === existing?.id) continue
      for (const t of keyRegTokens(k.registration)) s.add(t)
    }
    return s
  }, [keys, existing?.id])

  const regSuggestions = useMemo(() => {
    const qn = normKeyReg(registration)
    if (qn.length < 3) return []
    const out: any[] = []
    for (const [reg, v] of fleetByReg) {
      if (reg !== qn && reg.includes(qn)) {
        out.push(v)
        if (out.length >= 8) break
      }
    }
    return out
  }, [registration, fleetByReg])

  const save = async () => {
    if (!normKeyReg(registration)) { toast.error(t('fleet.keyBox.needReg')); return }
    if (!toQueue) {
      if (!effectiveBox) { toast.error(t('fleet.keyBox.needBox')); return }
      if (!Number.isFinite(slotNum) || slotNum <= 0) { toast.error(t('fleet.keyBox.needSlot')); return }
    }
    setSaving(true)
    try {
      const targetBox = toQueue ? null : effectiveBox
      const targetSlot = toQueue ? null : slotNum
      if (isEdit && existing) {
        await spareKeyService.updateKey(existing.id, {
          registration,
          box: targetBox,
          slot: targetSlot,
          make: fleetMatch?.make ?? existing.make ?? null,
          model: fleetMatch?.model ?? existing.model ?? null,
          logbook,
          notes,
          updatedByName: actorName,
        })
      } else {
        await spareKeyService.addKey({
          organizationId,
          registration,
          box: targetBox,
          slot: targetSlot,
          make: fleetMatch?.make ?? null,
          model: fleetMatch?.model ?? null,
          vehicleType: fleetMatch?.size ?? null,
          logbook,
          notes,
          createdBy: userId,
          createdByName: actorName,
        })
      }
      toast.success(toQueue
        ? t('fleet.keyBox.savedQueue', { reg: normKeyReg(registration) })
        : t('fleet.keyBox.saved', { reg: normKeyReg(registration), box: effectiveBox, slot: slotNum }))
      onSaved()
    } catch (err) {
      if (err instanceof SlotOccupiedError) toast.error(t('fleet.keyBox.slotTaken', { box: effectiveBox, slot: slotNum }))
      else toast.error(t('fleet.keyBox.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    if (!window.confirm(t('fleet.keyBox.deleteConfirm', { reg: existing.registration }))) return
    setSaving(true)
    try {
      await spareKeyService.deleteKey(existing.id)
      toast.success(t('fleet.keyBox.deleted', { reg: existing.registration }))
      onSaved()
    } catch {
      toast.error(t('fleet.keyBox.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white inline-flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#b3f243]" />
            {isEdit ? t('fleet.keyBox.editTitle') : t('fleet.keyBox.addTitle')}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('fleet.keyBox.regLabel')}</label>
            <input
              value={registration}
              onChange={(e) => setRegistration(e.target.value.toUpperCase())}
              placeholder="AB12 CDE"
              autoFocus={!isEdit}
              className={`${inputCls} uppercase font-mono font-bold`}
            />
            {regSuggestions.length > 0 && (
              <div className="mt-1 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                {regSuggestions.map((v: any) => {
                  const hasKey = keyRegSet.has(normKeyReg(v.registration))
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setRegistration((v.registration || '').toUpperCase())}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#f0faf4] dark:hover:bg-gray-700/50 border-b border-[#eef2f0] dark:border-gray-700 last:border-0"
                    >
                      <span className="font-mono font-bold text-sm text-[#012619] dark:text-white">{v.registration}</span>
                      <span className="text-[11px] text-[#72A68E] truncate">
                        {[v.make, v.model].filter(Boolean).join(' ')}
                        {hasKey && <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-bold">· {t('fleet.keyBox.suggestHasKey')}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {fleetMatch ? (
              <p className="mt-1 text-[11px] text-[#72A68E] inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {[fleetMatch.make, fleetMatch.model].filter(Boolean).join(' ')} · {t('fleet.keyBox.inFleet')}
              </p>
            ) : normKeyReg(registration) ? (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t('fleet.keyBox.notInFleetHint')}</p>
            ) : null}
            {dupKey && (
              <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {dupKey.box && dupKey.slot != null
                  ? t('fleet.keyBox.dupWarn', { box: dupKey.box, slot: dupKey.slot })
                  : t('fleet.keyBox.dupWarnQueue')}
              </p>
            )}
          </div>

          {/* Queue toggle — key exists, slot comes later */}
          <label className="flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={toQueue} onChange={(e) => setToQueue(e.target.checked)} className="w-4 h-4 accent-[#025940]" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#012619] dark:text-white">{t('fleet.keyBox.queueToggle')}</span>
              <span className="block text-[11px] text-amber-700/80 dark:text-amber-300/70">{t('fleet.keyBox.queueToggleHint')}</span>
            </span>
          </label>

          {!toQueue && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('fleet.keyBox.boxLabel')}</label>
              <select value={newBox ? '__new__' : box} onChange={(e) => {
                if (e.target.value === '__new__') setNewBox('B')
                else { setNewBox(''); setBox(e.target.value) }
              }} className={inputCls}>
                {boxNames.map((b) => <option key={b} value={b}>{b}</option>)}
                {boxNames.length === 0 && <option value="B1">B1</option>}
                <option value="__new__">{t('fleet.keyBox.newBox')}</option>
              </select>
              {newBox !== '' && (
                <input
                  value={newBox}
                  onChange={(e) => setNewBox(e.target.value.toUpperCase())}
                  placeholder="B8"
                  className={`${inputCls} mt-1.5 uppercase`}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('fleet.keyBox.slotLabel')}</label>
              <input
                type="number" min="1" step="1"
                value={slot}
                onChange={(e) => { slotTouched.current = true; setSlot(e.target.value) }}
                className={`${inputCls} ${slotConflict ? 'border-red-400 focus:border-red-500' : ''}`}
              />
              <p className="mt-1 text-[11px] text-[#72A68E]">
                {slotConflict
                  ? <span className="text-red-500 font-semibold">{t('fleet.keyBox.slotTaken', { box: effectiveBox, slot: slotNum })}</span>
                  : t('fleet.keyBox.firstFree', { slot: firstFree })}
              </p>
            </div>
          </div>
          )}

          <label className="flex items-center gap-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800/50 px-3 py-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={logbook} onChange={(e) => setLogbook(e.target.checked)} className="w-4 h-4 accent-[#025940]" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#012619] dark:text-white inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-500" /> {t('fleet.keyBox.logbook')}
              </span>
              <span className="block text-[11px] text-[#72A68E]">{t('fleet.keyBox.logbookHint')}</span>
            </span>
          </label>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('fleet.keyBox.notesLabel')}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>

          <div className="flex gap-2 pt-1">
            {isEdit && (
              <button
                onClick={remove}
                disabled={saving}
                title={t('fleet.keyBox.deleteKey')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-3 py-2.5 text-sm font-semibold hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">
              {t('fleet.keyBox.cancel')}
            </button>
            <button
              onClick={save}
              disabled={saving || (!toQueue && slotConflict)}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              {saving ? t('fleet.keyBox.saving') : t('fleet.keyBox.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
