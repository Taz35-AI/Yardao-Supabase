// src/components/bodyshop/JobDetailPanel.tsx
// 🔧 NEW: DamageEstimatesPanel — shows damage lines added at intake.
//         In 'prep' stage: tech enters estimated hours per damage line.
//         In all other stages: read-only display with estimates shown.

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Plus,
  Clock,
  CheckCircle2,
  RotateCcw,
  Trash2,
  PenLine,
  Package,
  Search,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { isAdminRole } from '@/lib/permissions'
import { useMechanics } from '@/hooks/useMechanics'
import { useT } from '@/lib/i18n'
import type { BodyshopJob, DailyLog, MaterialLine, DamageItem } from '@/types/bodyshop'
import type { StockPart } from '@/types/stock'
import { STAGE_CONFIG } from '@/types/bodyshop'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatHours(h: number) {
  if (!h) return '0h'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// ─── Damage Estimates Panel ───────────────────────────────────────────────────
// Shown above the log timeline whenever a job has damages recorded at intake.
// Only editable when the job is in 'prep' stage — read-only everywhere else.

function DamageEstimatesPanel({
  job,
  onUpdateDamages,
  userRole,
}: {
  job: BodyshopJob
  onUpdateDamages?: (jobId: string, damages: DamageItem[]) => Promise<boolean>
  userRole?: 'admin' | 'member' | 'mechanic' | 'garage_manager'
}) {
  const t = useT()
  const sourceDamages = job.damages || []

  const [localDamages, setLocalDamages] = useState<DamageItem[]>(() =>
    sourceDamages.map(d => ({ ...d }))
  )
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  // adminUnlocked: admin can force-edit even after estimates are locked
  const [adminUnlocked, setAdminUnlocked] = useState(false)

  useEffect(() => {
    setLocalDamages(sourceDamages.map(d => ({ ...d })))
    setIsDirty(false)
    setAdminUnlocked(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.damages, job.damagesEstimated])

  if (sourceDamages.length === 0) return null

  const isPrep = job.stage === 'prep'
  const isLocked = !!job.damagesEstimated && !adminUnlocked
  // Can edit if: in prep stage AND either not yet locked, or admin has unlocked
  const canEdit = isPrep && !!onUpdateDamages && !isLocked
  const totalEstimated = localDamages.reduce((sum, d) => sum + (d.estimatedHours || 0), 0)

  const setHours = (id: string, raw: string) => {
    const num = parseFloat(raw)
    setLocalDamages(prev =>
      prev.map(d => d.id === id ? { ...d, estimatedHours: isNaN(num) ? undefined : num } : d)
    )
    setIsDirty(true)
  }

  const handleSave = async () => {
    if (!onUpdateDamages || !job.id) return
    // Warn if any damage still has no estimate
    const missing = localDamages.filter(d => !d.estimatedHours || d.estimatedHours <= 0)
    if (missing.length > 0) {
      const proceed = window.confirm(
        t(missing.length === 1 ? 'bodyshop.job.confirmMissingOne' : 'bodyshop.job.confirmMissingMany', { count: missing.length })
      )
      if (!proceed) return
    }
    setSaving(true)
    await onUpdateDamages(job.id, localDamages)
    setSaving(false)
    setIsDirty(false)
    setAdminUnlocked(false)
  }

  return (
    <div className="mx-4 mb-4 rounded-xl border border-[#025940]/40 overflow-hidden">
      {/* Header */}
      <div className="bg-[#025940]/30 px-4 py-2.5 flex items-center justify-between border-b border-[#025940]/40">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#b3f243]" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">{t('bodyshop.job.damageList')}</span>
          <span className="text-[10px] font-mono text-[#72A68E]">
            {t(sourceDamages.length === 1 ? 'bodyshop.job.itemCountOne' : 'bodyshop.job.itemCountMany', { count: sourceDamages.length })}
          </span>
          {job.damagesEstimated && (
            <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
              ✓ {t('bodyshop.job.estimated')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalEstimated > 0 && (
            <span className="text-xs font-bold text-[#b3f243]">
              {t('bodyshop.job.estimatedHours', { hours: formatHours(totalEstimated) })}
            </span>
          )}
          {/* Admin unlock button — only shown when locked and user is admin */}
          {isLocked && isPrep && isAdminRole(userRole) && (
            <button
              onClick={() => setAdminUnlocked(true)}
              className="text-[10px] font-bold text-[#72A68E] hover:text-amber-400 transition-colors px-2 py-0.5 rounded border border-[#025940]/60 hover:border-amber-400/40"
            >
              {t('bodyshop.common.edit')}
            </button>
          )}
        </div>
      </div>

      {/* Damage rows */}
      <div className="divide-y divide-[#025940]/20">
        {localDamages.map((d, i) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-5 h-5 rounded-full bg-[#025940]/40 text-[#72A68E] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 text-sm text-white leading-tight">{d.description}</span>

            {canEdit ? (
              // Editable input — only shown in prep and not locked
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={d.estimatedHours ?? ''}
                  onChange={e => setHours(d.id, e.target.value)}
                  placeholder="0"
                  className="w-16 rounded-lg border border-[#025940] bg-[#025940]/30 px-2 py-1.5 text-sm text-center text-white focus:outline-none focus:border-[#72A68E] placeholder:text-[#72A68E]/40"
                />
                <span className="text-xs text-[#72A68E]">h</span>
              </div>
            ) : d.estimatedHours != null && d.estimatedHours > 0 ? (
              // Read-only badge
              <span className="text-xs font-bold text-[#b3f243] bg-[#025940]/40 px-2 py-0.5 rounded-lg flex-shrink-0">
                {formatHours(d.estimatedHours)}
              </span>
            ) : isPrep && isLocked ? (
              <span className="text-[10px] text-[#72A68E]/50 flex-shrink-0">—</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Footer */}
      {canEdit && (
        <div className="px-4 py-3 border-t border-[#025940]/40 bg-[#025940]/10 flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#72A68E]">
            {isDirty ? t('bodyshop.job.unsavedChanges') : adminUnlocked ? <>⚠️ {t('bodyshop.job.adminEditMode')}</> : t('bodyshop.job.enterHoursHint')}
          </span>
          <div className="flex items-center gap-2">
            {adminUnlocked && (
              <button
                onClick={() => { setAdminUnlocked(false); setLocalDamages(sourceDamages.map(d => ({ ...d }))); setIsDirty(false) }}
                className="px-3 py-1.5 text-xs text-[#72A68E] border border-[#025940]/60 rounded-lg hover:border-[#72A68E]/40 transition-colors"
              >
                {t('bodyshop.common.cancel')}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="px-4 py-1.5 bg-[#b3f243] text-[#012619] text-xs font-bold rounded-lg disabled:opacity-40 hover:bg-[#c5f564] active:scale-95 transition-all"
            >
              {saving ? t('bodyshop.common.saving') : t('bodyshop.job.saveEstimates')}
            </button>
          </div>
        </div>
      )}

      {/* Locked message for non-prep stages */}
      {!isPrep && sourceDamages.length > 0 && !job.damagesEstimated && (
        <div className="px-4 py-2 border-t border-[#025940]/40">
          <p className="text-[10px] text-[#72A68E]/60 text-center">
            {t('bodyshop.job.estimatesSetInPrep', { stage: t('bodyshop.stage.prep') })}
          </p>
        </div>
      )}
    </div>
  )
}
// ─── Sub-component: Log card ──────────────────────────────────────────────────

function LogCard({
  log,
  isToday,
  onEdit,
  onDelete,
}: {
  log: DailyLog
  isToday: boolean
  onEdit: (log: DailyLog) => void
  onDelete: (logId: string) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const hasMaterials = log.materials && log.materials.length > 0
  const stageConfig = STAGE_CONFIG[log.stage || 'queued']

  return (
    <div
      className={`rounded-xl border transition-all ${
        isToday
          ? 'border-[#b3f243]/40 bg-[#b3f243]/5'
          : 'border-[#025940]/40 bg-[#025940]/10'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isToday ? 'bg-[#b3f243]' : 'bg-[#72A68E]'
          }`}
        />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isToday ? 'text-[#b3f243]' : 'text-white'}`}>
            {formatDate(log.date)}
            {isToday && (
              <span className="ml-2 text-[10px] font-bold bg-[#b3f243]/20 text-[#b3f243] px-1.5 py-0.5 rounded-full">
                {t('bodyshop.job.today')}
              </span>
            )}
          </p>
          {log.loggedByName && (
            <p className="text-[11px] text-[#72A68E]/70 mt-0.5 flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#025940] border border-[#72A68E]/40 flex-shrink-0" />
              {log.loggedByName}
            </p>
          )}
          {log.notes && (
            <p className="text-xs text-[#72A68E] truncate mt-0.5">{log.notes}</p>
          )}
        </div>

        <span className="flex-shrink-0 text-sm font-bold text-white bg-[#025940] px-2 py-1 rounded-lg">
          {formatHours(log.hours)}
        </span>

        {hasMaterials && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 p-1.5 text-[#72A68E] hover:text-white transition-colors"
          >
            <Package className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => onEdit(log)}
          className="flex-shrink-0 p-1.5 text-[#72A68E] hover:text-[#b3f243] transition-colors"
        >
          <PenLine className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(log.id!)}
          className="flex-shrink-0 p-1.5 text-[#72A68E] hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {hasMaterials && expanded && (
        <div className="border-t border-[#025940]/40 px-3 pb-3 pt-2 space-y-1">
          {log.materials.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-xs text-[#72A68E]">
              <span className="w-1 h-1 rounded-full bg-[#72A68E] flex-shrink-0" />
              <span className="flex-1">{m.name}</span>
              <span className="text-white font-medium">{m.quantity} {m.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-component: Stock Part Search ─────────────────────────────────────────

function StockPartSearch({
  organizationId,
  onSelect,
}: {
  organizationId: string | null
  onSelect: (part: StockPart) => void
}) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<StockPart[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const searchParts = async () => {
      if (!organizationId || search.length < 2) {
        setResults([])
        setShowDropdown(false)
        return
      }
      setLoading(true)
      try {
        const allParts = await stockService.getParts(organizationId)
        const term = search.toLowerCase().trim()
        const matches = allParts
          .filter(p => {
            const name = p.partName?.toLowerCase() || ''
            const number = p.partNumber?.toLowerCase() || ''
            return name.includes(term) || number.includes(term)
          })
          .slice(0, 8)
        setResults(matches)
        setShowDropdown(matches.length > 0)
      } catch (error) {
        console.error('Error searching parts:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }
    const debounce = setTimeout(searchParts, 200)
    return () => clearTimeout(debounce)
  }, [search, organizationId])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (part: StockPart) => {
    onSelect(part)
    setSearch('')
    setResults([])
    setShowDropdown(false)
    inputRef.current?.blur()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
        <input
          ref={inputRef}
          placeholder={t('bodyshop.job.searchStockParts')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
          className="w-full bg-[#025940]/30 border border-[#025940] rounded-xl pl-10 pr-4 py-3 text-base text-white focus:outline-none focus:border-[#72A68E] placeholder:text-[#72A68E]/50"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[#025940] border-t-[#b3f243] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-[#012619] border border-[#025940] rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.map((part) => (
            <button
              key={part.id}
              onClick={() => handleSelect(part)}
              className="w-full px-4 py-3 text-left hover:bg-[#025940]/50 active:bg-[#025940] transition-colors flex items-center gap-3 border-b border-[#025940]/50 last:border-b-0"
            >
              <Package className="w-5 h-5 text-[#72A68E] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{part.partName}</p>
                <p className="text-xs text-[#72A68E]">
                  {part.partNumber} · {part.unit === 'liters' ? `${(part.quantity * 1000).toLocaleString()} ml` : `${part.quantity} pcs`} {t('bodyshop.job.inStock')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#72A68E]" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-component: Material Line Item ────────────────────────────────────────

interface ExtendedMaterial extends MaterialLine {
  stockPartId?: string
  inStock?: number
  stockUnit?: string
  isCustom?: boolean
}

function MaterialLineItem({
  material,
  onUpdate,
  onRemove,
}: {
  material: ExtendedMaterial
  onUpdate: (id: string, field: keyof MaterialLine, value: string | number) => void
  onRemove: (id: string) => void
}) {
  const t = useT()
  return (
    <div className="flex items-center gap-2 p-3 bg-[#025940]/20 rounded-xl">
      {material.isCustom ? (
        <input
          type="text"
          placeholder={t('bodyshop.job.materialNamePlaceholder')}
          value={material.name}
          onChange={e => onUpdate(material.id, 'name', e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-white placeholder:text-[#72A68E]/50 focus:outline-none"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{material.name}</p>
          {material.inStock !== undefined && (
            <p className="text-[10px] text-[#72A68E]">
              {material.inStock.toLocaleString()} {material.unit} {t('bodyshop.job.inStock')}
            </p>
          )}
        </div>
      )}
      <input
        type="number"
        inputMode="decimal"
        min="1"
        step={material.unit === 'ml' ? '50' : '1'}
        value={material.quantity}
        onChange={e => onUpdate(material.id, 'quantity', parseFloat(e.target.value) || 0)}
        className="w-20 bg-[#025940]/30 border border-[#025940] rounded-lg px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-[#72A68E]"
      />
      {material.isCustom ? (
        <input
          type="text"
          placeholder={t('bodyshop.job.unitPlaceholder')}
          value={material.unit}
          onChange={e => onUpdate(material.id, 'unit', e.target.value)}
          className="w-12 bg-transparent text-xs text-[#72A68E] text-center focus:outline-none"
        />
      ) : (
        <span className="text-xs text-[#72A68E] w-8 text-center">{material.unit}</span>
      )}
      <button
        onClick={() => onRemove(material.id)}
        className="p-2 text-[#72A68E] hover:text-red-400 active:text-red-500 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}

// ─── Sub-component: Log form (MOBILE OPTIMIZED) ───────────────────────────────

function LogForm({
  initialDate,
  initialLog,
  organizationId,
  onSave,
  onCancel,
  saving,
}: {
  initialDate: string
  initialLog?: DailyLog | null
  organizationId: string | null
  onSave: (date: string, hours: number, notes: string, materials: MaterialLine[]) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const t = useT()
  const [date, setDate] = useState(initialLog?.date || initialDate)
  const [hours, setHours] = useState(initialLog?.hours?.toString() || '')
  const [notes, setNotes] = useState(initialLog?.notes || '')
  const [materials, setMaterials] = useState<ExtendedMaterial[]>(
    initialLog?.materials?.map(m => ({ ...m, isCustom: false })) || []
  )

  const handleAddFromStock = (part: StockPart) => {
    const existing = materials.find(m => m.stockPartId === part.id)
    if (existing) {
      setMaterials(prev =>
        prev.map(m =>
          m.stockPartId === part.id
            ? { ...m, quantity: m.quantity + (part.unit === 'liters' ? 100 : 1) }
            : m
        )
      )
      return
    }
    const displayUnit = part.unit === 'liters' ? 'ml' : 'pcs'
    const defaultQty = part.unit === 'liters' ? 100 : 1
    const newMat: ExtendedMaterial = {
      id: crypto.randomUUID(),
      name: part.partName,
      quantity: defaultQty,
      unit: displayUnit,
      stockPartId: part.id,
      inStock: part.unit === 'liters' ? part.quantity * 1000 : part.quantity,
      stockUnit: part.unit,
      isCustom: false,
    }
    setMaterials(prev => [...prev, newMat])
  }

  const handleAddCustom = () => {
    const newMat: ExtendedMaterial = {
      id: crypto.randomUUID(),
      name: '',
      quantity: 1,
      unit: 'pcs',
      isCustom: true,
    }
    setMaterials(prev => [...prev, newMat])
  }

  const updateMaterial = (id: string, field: keyof MaterialLine, value: string | number) => {
    setMaterials(prev => prev.map(m => (m.id === id ? { ...m, [field]: value } : m)))
  }

  const removeMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id))
  }

  const handleSave = async () => {
    const h = parseFloat(hours)
    if (!h || h <= 0) return

    // Strip display-only fields but KEEP stockPartId for invoice integration
    const cleanMaterials: MaterialLine[] = materials
      .filter(m => m.name.trim())
      .map(({ id, name, quantity, unit, stockPartId }) => {
        const mat: MaterialLine = { id, name, quantity, unit }
        if (stockPartId) mat.stockPartId = stockPartId
        return mat
      })

    await onSave(date, h, notes, cleanMaterials)
  }

  const hoursNum = parseFloat(hours)
  const isValid = hoursNum > 0 && !isNaN(hoursNum)

  return (
    <div className="rounded-xl border border-[#b3f243]/30 bg-[#012619] p-3 space-y-3">
      <p className="text-base font-bold text-white">
        {initialLog ? t('bodyshop.job.editEntry') : t('bodyshop.job.logHours')}
      </p>

      <div>
        <label className="block text-xs text-[#72A68E] mb-2">{t('bodyshop.job.date')}</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-[#025940]/30 border border-[#025940] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-[#72A68E]"
        />
      </div>

      <div>
        <label className="block text-xs text-[#72A68E] mb-1.5">{t('bodyshop.job.hoursWorked')}</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0.25"
          max="24"
          placeholder={t('bodyshop.job.hoursPlaceholder')}
          value={hours}
          onChange={e => setHours(e.target.value)}
          className="w-full bg-[#025940]/30 border border-[#025940] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-[#72A68E] placeholder:text-[#72A68E]/40"
        />
      </div>

      <div>
        <label className="block text-xs text-[#72A68E] mb-2">{t('bodyshop.job.notesOptional')}</label>
        <textarea
          rows={1}
          placeholder={t('bodyshop.job.notesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full bg-[#025940]/30 border border-[#025940] rounded-xl px-4 py-3 text-base text-white focus:outline-none focus:border-[#72A68E] placeholder:text-[#72A68E]/40 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs text-[#72A68E] mb-2">{t('bodyshop.job.materialsOptional')}</label>
        <StockPartSearch organizationId={organizationId} onSelect={handleAddFromStock} />

        {materials.length > 0 && (
          <div className="mt-3 space-y-2">
            {materials.map(mat => (
              <MaterialLineItem
                key={mat.id}
                material={mat}
                onUpdate={updateMaterial}
                onRemove={removeMaterial}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddCustom}
          className="mt-3 w-full py-3 rounded-xl border border-dashed border-[#025940] text-sm text-[#72A68E] hover:text-white hover:border-[#72A68E] active:bg-[#025940]/20 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('bodyshop.job.addCustomMaterial')}
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="flex-1 py-2.5 rounded-xl bg-[#b3f243] text-[#012619] text-sm font-bold disabled:opacity-40 hover:bg-[#c5f564] active:bg-[#a8e03d] transition-colors"
        >
          {saving ? t('bodyshop.common.saving') : t('bodyshop.common.save')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-[#025940] text-[#72A68E] text-sm hover:text-white hover:border-[#72A68E] transition-colors"
        >
          {t('bodyshop.common.cancel')}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface JobDetailPanelProps {
  job: BodyshopJob
  onClose: () => void
  onStatusChange: (jobId: string, status: 'open' | 'complete') => Promise<void>
  onSaveLog: (
    jobId: string,
    date: string,
    hours: number,
    notes: string,
    materials: MaterialLine[]
  ) => Promise<boolean>
  onDeleteLog: (jobId: string, logId: string) => Promise<boolean>
  loadLogs: (jobId: string) => Promise<DailyLog[]>
  onUpdateDamages?: (jobId: string, damages: DamageItem[]) => Promise<boolean>
  // 👤 Optional — when supplied, shows the mechanic-assignment dropdown
  // and lets users (re)assign the job. Omitted by callers that don't
  // need the feature, keeping the component backward-compatible.
  onAssignMechanic?: (jobId: string, mechanic: { id: string; name: string } | null) => Promise<boolean>
}

export function JobDetailPanel({
  job,
  onClose,
  onStatusChange,
  onSaveLog,
  onDeleteLog,
  loadLogs,
  onUpdateDamages,
  onAssignMechanic,
}: JobDetailPanelProps) {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<DailyLog | null>(null)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'member' | 'mechanic' | 'garage_manager'>('member')

  const today = todayISO()
  const stageConfig = STAGE_CONFIG[job.stage || 'queued']

  useEffect(() => {
    const loadOrg = async () => {
      if (user?.uid) {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) setOrganizationId(profile.organizationId)
        if (profile?.role) setUserRole(profile.role)
      }
    }
    loadOrg()
  }, [user])

  const fetchLogs = useCallback(async () => {
    if (!job.id) return
    setLoadingLogs(true)
    const data = await loadLogs(job.id)
    setLogs(data)
    setLoadingLogs(false)
  }, [job.id, loadLogs])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const todayLog = logs.find(l => l.date === today)

  const handleSave = async (date: string, hours: number, notes: string, materials: MaterialLine[]) => {
    if (!job.id) return
    setSaving(true)
    const ok = await onSaveLog(job.id, date, hours, notes, materials)
    setSaving(false)
    if (ok) {
      setShowForm(false)
      setEditingLog(null)
      await fetchLogs()
    }
  }

  const handleDelete = async (logId: string) => {
    if (!job.id) return
    if (!window.confirm(t('bodyshop.job.confirmRemoveEntry'))) return
    await onDeleteLog(job.id, logId)
    await fetchLogs()
  }

  const handleEdit = (log: DailyLog) => {
    setEditingLog(log)
    setShowForm(true)
  }

  const handleToggleStatus = async () => {
    if (!job.id) return
    setCompleting(true)
    await onStatusChange(job.id, job.status === 'open' ? 'complete' : 'open')
    setCompleting(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[#025940]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xl font-black text-white tracking-wider">
              {job.vehicleRegistration}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: stageConfig.bgColor, color: stageConfig.color }}
            >
              {t(`bodyshop.stage.${job.stage || 'queued'}`)}
            </span>
          </div>
          {(job.vehicleMake || job.vehicleModel) && (
            <p className="text-sm text-[#72A68E]">
              {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-[#72A68E]">
              {t('bodyshop.job.total')} <span className="text-white font-semibold">{formatHours(job.totalHours)}</span>
            </span>
            {job.stageHours && Object.entries(job.stageHours).map(([stage, hrs]) => {
              if (!hrs) return null
              const cfg = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG]
              return (
                <span
                  key={stage}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
                >
                  {t(`bodyshop.stage.${stage}`)}: {formatHours(hrs)}
                </span>
              )
            })}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-[#72A68E] hover:text-white transition-colors -mr-1"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-4">

        {/* 👤 Mechanic assignment — only renders when the parent passed the
            onAssignMechanic handler, so callers that don't need the feature
            see no change in behaviour. */}
        {onAssignMechanic && job.id && (
          <MechanicAssignSection
            jobId={job.id}
            currentId={job.assignedMechanicId}
            currentName={job.assignedMechanicName}
            onAssign={onAssignMechanic}
          />
        )}

        {/* 🔧 Damage estimates panel — shown whenever the job has damages */}
        <DamageEstimatesPanel
          job={job}
          onUpdateDamages={onUpdateDamages}
          userRole={userRole}
        />

        <div className="px-4 space-y-4">
          {/* Queued: no log button, just info */}
          {job.status === 'open' && job.stage === 'queued' && !showForm && (
            <div className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border border-[#025940]/30 bg-[#025940]/10 text-center">
              <Clock className="w-5 h-5 text-[#72A68E]" />
              <p className="text-sm text-[#72A68E]">{t('bodyshop.job.waitingInQueue')}</p>
              <p className="text-xs text-[#72A68E]/50 px-6">
                {t('bodyshop.job.moveToPrepHint', { stage: t('bodyshop.stage.prep') })}
              </p>
            </div>
          )}

          {/* Active stages: log button */}
          {job.status === 'open' && job.stage !== 'queued' && !showForm && (
            <button
              onClick={() => {
                setEditingLog(todayLog || null)
                setShowForm(true)
              }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-[#b3f243]/40 text-[#b3f243] text-base font-semibold hover:bg-[#b3f243]/5 active:bg-[#b3f243]/10 transition-colors"
            >
              <Plus className="w-5 h-5" />
              {todayLog ? t('bodyshop.job.editTodayEntry') : t('bodyshop.job.logTodayHours')}
            </button>
          )}

          {showForm && (
            <LogForm
              initialDate={editingLog?.date || today}
              initialLog={editingLog}
              organizationId={organizationId}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingLog(null) }}
              saving={saving}
            />
          )}

          {loadingLogs ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#025940] border-t-[#b3f243] rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-[#72A68E]/50 text-sm">
              {job.stage === 'queued'
                ? t('bodyshop.job.hoursAfterPrep', { stage: t('bodyshop.stage.prep') })
                : t('bodyshop.job.noEntries')}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#72A68E] font-semibold uppercase tracking-wider px-1">
                {t('bodyshop.job.timeLog')}
              </p>
              {[...logs].reverse().map(log => (
                <LogCard
                  key={log.id}
                  log={log}
                  isToday={log.date === today}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#025940]">
        <button
          onClick={handleToggleStatus}
          disabled={completing}
          className={`w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
            job.status === 'open'
              ? 'bg-[#025940] text-[#72A68E] hover:bg-[#014730] hover:text-white active:bg-[#013520]'
              : 'bg-[#025940]/30 border border-[#025940] text-[#72A68E] hover:text-white'
          }`}
        >
          {job.status === 'open' ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              {completing ? t('bodyshop.job.marking') : t('bodyshop.job.markComplete')}
            </>
          ) : (
            <>
              <RotateCcw className="w-5 h-5" />
              {completing ? t('bodyshop.job.reopening') : t('bodyshop.job.reopenJob')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Mechanic assignment section ────────────────────────────────────────────
// Reads the org's mechanics via useMechanics() and renders a native
// <select>. Calls onAssign with the picked mechanic's {id, name} or null
// to unassign. Preserves a previously-assigned mechanic in the dropdown even
// if they are no longer in the active list (deleted/deactivated).
function MechanicAssignSection({
  jobId,
  currentId,
  currentName,
  onAssign,
}: {
  jobId: string
  currentId?: string | null
  currentName?: string | null
  onAssign: (jobId: string, mechanic: { id: string; name: string } | null) => Promise<boolean>
}) {
  const t = useT()
  const { mechanics, loading } = useMechanics()
  const [saving, setSaving] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSaving(true)
    if (!id) {
      await onAssign(jobId, null)
    } else {
      const picked = mechanics.find(m => m.uid === id)
      await onAssign(jobId, {
        id,
        name: picked?.displayName || picked?.email || "Unknown",
      })
    }
    setSaving(false)
  }

  const orphan =
    currentId && !mechanics.some(m => m.uid === currentId)
      ? { uid: currentId, name: currentName || t('bodyshop.job.formerMechanic') }
      : null

  return (
    <div className="px-4">
      <div className="rounded-xl border border-blue-300/50 bg-blue-500/10 px-4 py-3">
        <p className="text-xs font-bold text-blue-200 mb-2">
          👤 {t('bodyshop.job.assignedMechanic')} <span className="text-[10px] font-normal text-blue-200/70">{t('bodyshop.common.optional')}</span>
        </p>
        <select
          value={currentId || ""}
          onChange={handleChange}
          disabled={loading || saving}
          className="w-full rounded-lg border border-blue-400/40 bg-white/95 px-3 py-2 text-sm text-[#012619] focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
        >
          <option value="">{t('bodyshop.job.unassigned')}</option>
          {orphan && (
            <option value={orphan.uid}>{t('bodyshop.job.noLongerActive', { name: orphan.name })}</option>
          )}
          {mechanics.map(m => (
            <option key={m.uid} value={m.uid}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
        {!loading && mechanics.length === 0 && (
          <p className="mt-2 text-[11px] text-blue-200/80">
            {t('bodyshop.job.noMechanics')}
          </p>
        )}
      </div>
    </div>
  )
}
