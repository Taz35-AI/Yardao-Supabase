// src/components/features/hire/HireAgreements.tsx
// Hire agreements list. Each card shows the schedule + attached vehicle lines,
// and lets you attach vehicles by 3-digit registration search.
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Car, ChevronDown, Pencil, Trash2, X, Check, CalendarClock, RefreshCw } from 'lucide-react'
import { EmptyState, PrimaryBtn, Pill } from './hireUi'
import { ContractIcon } from './ContractIcon'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { VehicleHireService } from '@/lib/services/vehicleHireService'
import { branchService } from '@/lib/services/branchService'
import { activityLogService } from '@/lib/services/activityLogService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'
import { toCamel } from '@/lib/dbMap'
import { canPerformAction } from '@/lib/insuranceUtils'
import type { CheckedInVehicle } from '@/types'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'
import { NewAgreementModal } from './NewAgreementModal'
import { HireSwapModal } from './HireSwapModal'
import { HireScheduleModal } from './HireScheduleModal'
import { SetOutOnHireModal } from '@/components/features/dashboard/HireModals'
import { euDate, rateLabel } from './hireFormat'

export function HireAgreements() {
  const t = useT()
  const { organizationId, settings, refreshKey, refresh } = useHire()
  const label = settings.agreementLabelSingular
  const [agreements, setAgreements] = useState<HireAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const rows = await hireAgreementService.getAgreements(organizationId)
      if (!cancelled) {
        setAgreements(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, refreshKey])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <PrimaryBtn onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" />
          <span>{t('hire.newAgreement', { label })}</span>
        </PrimaryBtn>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[#72A68E]">…</div>
      ) : agreements.length === 0 ? (
        <EmptyState icon={<ContractIcon className="w-10 h-10" />} title={t('hire.emptyAgreements')} hint={t('hire.emptyAgreementsHint')} />
      ) : (
        <div className="space-y-2">
          {agreements.map((a) => (
            <AgreementCard key={a.id} agreement={a} organizationId={organizationId} onChange={refresh} />
          ))}
        </div>
      )}

      {showNew && (
        <NewAgreementModal
          organizationId={organizationId}
          label={label}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function AgreementCard({
  agreement,
  organizationId,
  onChange,
}: {
  agreement: HireAgreement
  organizationId: string | null
  onChange: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<HireAgreementVehicle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [swapLine, setSwapLine] = useState<HireAgreementVehicle | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showRenew, setShowRenew] = useState(false)
  // Set-on-hire goes through the normal yard "Set out on hire" modal so the
  // insurance gate + yard status flip run exactly as they do in the yard.
  const [hireVehicle, setHireVehicle] = useState<CheckedInVehicle | null>(null)
  const [hireLineId, setHireLineId] = useState<string | null>(null)
  const [hireBusy, setHireBusy] = useState(false)
  // When the vehicle isn't in the yard we auto-check it in to the main branch on
  // confirm (so cancelling leaves no stray row). Holds the fleet row + branch.
  const [pendingCheckIn, setPendingCheckIn] = useState<{ branchId: string; fleet: any } | null>(null)

  const loadLines = async () => {
    if (!organizationId) return
    setLines(await hireAgreementService.getLines(organizationId, agreement.id))
    setLoaded(true)
  }

  useEffect(() => {
    if (open && !loaded) loadLines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const actor = async () => {
    const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
    return { id: user?.uid || null, name: profile?.displayName || user?.email || 'Unknown' }
  }

  // Open the SAME "Set out on hire" modal the yard uses, so the insurance gate +
  // yard status flip run exactly as in the yard. If the vehicle isn't currently
  // in the yard, we auto-check it in to the main branch (on confirm) — saving the
  // manual check-in steps.
  const setOnHire = async (l: HireAgreementVehicle) => {
    if (!organizationId) return
    const norm = (l.registration || '').toUpperCase().replace(/\s+/g, '')
    if (!norm) {
      toast.error(t('hire.actionFail'))
      return
    }
    // HARD BLOCK: can't set a vehicle out before the contract's start date — those
    // days would fall outside the billing schedule. Offer to shift the term to
    // today, otherwise stop (they can make a separate contract).
    const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
    if (agreement.startDate && agreement.startDate > todayYmd) {
      const amend = window.confirm(
        t('hire.setOutBeforeStart', { date: euDate(agreement.startDate) }),
      )
      if (!amend) return
      try {
        await hireAgreementService.updateAgreementDetails({
          organizationId,
          agreementId: agreement.id,
          reference: agreement.reference ?? null,
          startDate: todayYmd,
          durationValue: agreement.durationValue,
          durationUnit: agreement.durationUnit,
          rateType: agreement.rateType,
          rateAmount: agreement.rateAmount,
          chargeDay: agreement.chargeDay ?? null,
        })
        toast.success(t('hire.startAmended', { date: euDate(todayYmd) }))
        onChange()
      } catch {
        toast.error(t('hire.actionFail'))
        return
      }
    }
    try {
      // 1) Already in the yard? Use that row directly.
      const { data } = await supabase
        .from('checked_in_vehicles')
        .select('*')
        .eq('organization_id', organizationId)
      const row = (data ?? []).find(
        (r) => (r.registration || '').toUpperCase().replace(/\s+/g, '') === norm,
      )
      if (row) {
        const vehicle = toCamel<CheckedInVehicle>(row)
        if (!vehicle) {
          toast.error(t('hire.actionFail'))
          return
        }
        if (vehicle.hireStatus === 'Out on Hire') {
          toast.error(t('hire.alreadyOut', { reg: l.registration || '' }))
          return
        }
        setPendingCheckIn(null)
        setHireLineId(l.id)
        setHireVehicle(vehicle)
        return
      }

      // 2) Not in the yard → pull the fleet record so we can auto-check-in.
      let fleet: any = null
      if (l.vehicleId) {
        const { data: fv } = await supabase.from('vehicles').select('*').eq('id', l.vehicleId).maybeSingle()
        fleet = fv
      }
      if (!fleet) {
        const { data: fvs } = await supabase
          .from('vehicles')
          .select('*')
          .eq('organization_id', organizationId)
        fleet = (fvs ?? []).find((v) => (v.registration || '').toUpperCase().replace(/\s+/g, '') === norm) || null
      }
      if (!fleet) {
        toast.error(t('hire.notInYard', { reg: l.registration || '' }))
        return
      }
      // Pre-check insurance before creating anything (no stranded check-in row).
      if (!canPerformAction(fleet.insurance_status)) {
        toast.error(t('hire.insuranceBlockedSetOut', { reg: l.registration || '' }))
        return
      }
      const branches = await branchService.getBranches(organizationId)
      const main = branches.find((b) => b.isMain) || branches[0]
      if (!main) {
        toast.error(t('hire.actionFail'))
        return
      }
      // Synthetic (not-yet-persisted) vehicle for the modal display.
      const synthetic = {
        id: '',
        organizationId,
        registration: fleet.registration,
        make: fleet.make,
        model: fleet.model,
        colour: fleet.colour,
        size: fleet.size,
        condition: fleet.condition,
        status: 'Ready',
        motExpiry: fleet.mot_expiry,
        taxExpiry: fleet.tax_expiry,
        insuranceStatus: fleet.insurance_status ?? null,
        hireStatus: 'In Yard',
      } as unknown as CheckedInVehicle
      setPendingCheckIn({ branchId: main.id, fleet })
      setHireLineId(l.id)
      setHireVehicle(synthetic)
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  // Confirm handler for the reused yard modal: insurance-gate, (auto-check-in if
  // needed), flip the yard row to Out on Hire, then activate + link the line.
  const confirmSetOnHire = async (vehicleId: string, hireNotes?: string) => {
    if (!organizationId || !hireVehicle) return
    if (!canPerformAction(hireVehicle.insuranceStatus)) {
      toast.error(t('hire.insuranceBlockedSetOut', { reg: hireVehicle.registration || '' }))
      throw new Error('INSURANCE_REQUIRED')
    }
    setHireBusy(true)
    try {
      const a = await actor()
      let realVehicleId = vehicleId

      // Auto-check-in to the main branch when the vehicle wasn't in the yard.
      if (pendingCheckIn) {
        const f = pendingCheckIn.fleet
        const nowIso = new Date().toISOString()
        const { data: ins, error: insErr } = await supabase
          .from('checked_in_vehicles')
          .insert({
            vehicle_id: f.id,
            registration: (f.registration || '').toUpperCase(),
            make: f.make || '',
            model: f.model || '',
            colour: f.colour || '',
            size: f.size || '',
            condition: f.condition || '',
            status: 'Ready',
            mileage: '',
            insurance_status: f.insurance_status ?? null,
            insurance_policy_id: f.insurance_policy_id ?? null,
            insurance_policy_name: f.insurance_policy_name ?? null,
            insurance_policy_expiry: f.insurance_policy_expiry ?? null,
            mot_expiry: f.mot_expiry ?? null,
            tax_expiry: f.tax_expiry ?? null,
            contract: f.contract ?? null,
            contract_color: f.contract_color ?? null,
            branch_id: pendingCheckIn.branchId,
            hire_status: 'In Yard',
            user_id: a.id,
            organization_id: organizationId,
            created_at: nowIso,
            updated_at: nowIso,
            check_in_time: nowIso,
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        realVehicleId = ins.id as string
        activityLogService.log({
          organizationId,
          actorId: a.id,
          actorName: a.name,
          actionType: 'checkin',
          registration: hireVehicle.registration ?? null,
          branchId: pendingCheckIn.branchId,
          summary: 'Auto checked-in to main branch for hire',
        })
        toast.success(t('hire.autoCheckedIn', { reg: hireVehicle.registration || '' }))
      }

      await VehicleHireService.setOutOnHire(realVehicleId, a.id || '', a.name, hireNotes)
      if (hireLineId) {
        await hireAgreementService.setLineOnHire({
          organizationId,
          lineId: hireLineId,
          registration: hireVehicle.registration,
          checkedInVehicleId: realVehicleId,
          actorId: a.id,
          actorName: a.name,
        })
      }
      toast.success(t('hire.onHireDone'))
      setHireVehicle(null)
      setHireLineId(null)
      setPendingCheckIn(null)
      loadLines()
      onChange()
    } finally {
      setHireBusy(false)
    }
  }

  const endHire = async (l: HireAgreementVehicle) => {
    if (!organizationId) return
    try {
      const a = await actor()
      const periodStart = (l.actualOutAt ? l.actualOutAt.slice(0, 10) : l.scheduledStart) || agreement.startDate
      await hireAgreementService.endLine({
        organizationId,
        agreementId: agreement.id,
        lineId: l.id,
        vehicleId: l.vehicleId,
        registration: l.registration,
        periodStart,
        rateType: agreement.rateType,
        rateAmount: agreement.rateAmount,
        actorId: a.id,
        actorName: a.name,
      })
      toast.success(t('hire.endHireDone'))
      loadLines()
      onChange()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  // Attach a whole batch of vehicles in one go. Each vehicle gets the FULL
  // contract rate (rates are never split across vehicles).
  const attachBatch = async (vehicles: { id: string; registration: string; make?: string; model?: string }[]) => {
    if (!organizationId || vehicles.length === 0) return
    const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
    const createdByName = profile?.displayName || user?.email || 'Unknown'
    let ok = 0
    const failures: string[] = []
    for (const v of vehicles) {
      try {
        await hireAgreementService.attachVehicle({
          organizationId,
          agreementId: agreement.id,
          vehicleId: v.id,
          registration: v.registration,
          make: v.make,
          model: v.model,
          scheduledStart: agreement.startDate,
          scheduledEnd: agreement.endDate ?? null,
          rateType: agreement.rateType,
          rateAmount: agreement.rateAmount,
          createdBy: user?.uid || null,
          createdByName,
        })
        ok++
      } catch {
        failures.push(v.registration)
      }
    }
    if (ok > 0) toast.success(t('hire.attachedBatch', { count: ok }))
    if (failures.length) toast.error(t('hire.attachedSkipped', { regs: failures.join(', ') }))
    loadLines()
    onChange()
  }

  // Import vehicles that are ALREADY on hire (backdated). Creates active lines
  // from `outDate` and marks the yard rows Out on Hire.
  const importBatch = async (
    vehicles: { id: string; registration: string; make?: string; model?: string }[],
    outDate: string,
  ) => {
    if (!organizationId || vehicles.length === 0) return
    const a = await actor()
    let ok = 0
    const failures: string[] = []
    for (const v of vehicles) {
      try {
        await hireAgreementService.importOnHireVehicle({
          organizationId,
          agreementId: agreement.id,
          vehicleId: v.id,
          registration: v.registration,
          make: v.make,
          model: v.model,
          scheduledStart: agreement.startDate,
          scheduledEnd: agreement.endDate ?? null,
          rateType: agreement.rateType,
          rateAmount: agreement.rateAmount,
          outDate,
          createdBy: a.id,
          createdByName: a.name,
          actorId: a.id,
          actorName: a.name,
        })
        ok++
      } catch {
        failures.push(v.registration)
      }
    }
    if (ok > 0) toast.success(t('hire.importedBatch', { count: ok }))
    if (failures.length) toast.error(t('hire.attachedSkipped', { regs: failures.join(', ') }))
    loadLines()
    onChange()
  }

  const removeLine = async (l: HireAgreementVehicle) => {
    if (!organizationId) return
    if (!window.confirm(t('hire.removeLineConfirm', { reg: l.registration || '' }))) return
    try {
      const a = await actor()
      await hireAgreementService.removeLine(organizationId, l.id, { actorId: a.id, actorName: a.name })
      toast.success(t('hire.removeLineDone', { reg: l.registration || '' }))
      loadLines()
      onChange()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  const deleteAgreement = async () => {
    if (!organizationId) return
    const activeCount = lines.filter((l) => l.status === 'active').length
    const msg = activeCount > 0
      ? t('hire.deleteAgreementActiveConfirm', { count: activeCount })
      : t('hire.deleteAgreementConfirm', { customer: agreement.customerName || '' })
    if (!window.confirm(msg)) return
    try {
      const a = await actor()
      await hireAgreementService.deleteAgreement(organizationId, agreement.id, { actorId: a.id, actorName: a.name })
      toast.success(t('hire.deleteAgreementDone'))
      onChange()
    } catch {
      toast.error(t('hire.actionFail'))
    }
  }

  return (
    <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-full flex items-center gap-2 sm:gap-3 p-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <ContractIcon className="w-10 h-10 flex-shrink-0 drop-shadow-sm" />
          <div className="min-w-0 flex-1">
            <span className="block font-bold text-[#012619] dark:text-white truncate leading-tight">{agreement.customerName || '—'}</span>
            <p className="text-xs text-[#72A68E] mt-0.5 truncate">
              {euDate(agreement.startDate)} → {euDate(agreement.endDate)}{agreement.reference ? ` · ${agreement.reference}` : ''}
            </p>
          </div>
        </button>
        <Pill tone="lime">{rateLabel(agreement.rateType, agreement.rateAmount, t('hire.perWeek'), t('hire.perMonth'))}</Pill>
        <button onClick={() => setShowSchedule(true)} title={t('hire.scheduleShort')} className="p-1.5 rounded-lg text-[#72A68E] hover:text-[#025940] hover:bg-[#f0f4f2] dark:hover:bg-gray-700 transition-colors flex-shrink-0">
          <CalendarClock className="w-4 h-4" />
        </button>
        <button onClick={() => setShowRenew(true)} title={t('hire.renewShort')} className="p-1.5 rounded-lg text-[#72A68E] hover:text-[#025940] hover:bg-[#f0f4f2] dark:hover:bg-gray-700 transition-colors flex-shrink-0">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button onClick={() => setShowEdit(true)} title={t('hire.editAgreementShort')} className="p-1.5 rounded-lg text-[#72A68E] hover:text-[#025940] hover:bg-[#f0f4f2] dark:hover:bg-gray-700 transition-colors flex-shrink-0">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={deleteAgreement} title={t('hire.deleteAgreementShort')} className="p-1.5 rounded-lg text-[#72A68E] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="p-1.5 flex-shrink-0">
          <ChevronDown className={`w-4 h-4 text-[#72A68E] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-[#e2e8e5] dark:border-gray-700 p-3.5 space-y-3">
          <VehicleAttach
            organizationId={organizationId}
            existingRegs={lines.map((l) => (l.registration || '').toUpperCase().replace(/\s+/g, ''))}
            defaultOutDate={agreement.startDate}
            onComplete={(vehicles, opts) => (opts.alreadyOnHire ? importBatch(vehicles, opts.outDate) : attachBatch(vehicles))}
          />
          {lines.length === 0 ? (
            <p className="text-xs text-[#72A68E]">{t('hire.noVehicles')}</p>
          ) : (
            <ul className="space-y-1.5">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm rounded-lg border border-[#e2e8e5] dark:border-gray-700 px-2.5 py-1.5">
                  <span className="font-mono font-bold text-[#012619] dark:text-white flex-shrink-0">{l.registration}</span>
                  <span className="text-xs text-[#72A68E] flex-1">{lineStatusLabel(l.status, t)}</span>
                  {l.status === 'scheduled' && (
                    <button onClick={() => setOnHire(l)} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[#025940] text-white hover:bg-[#012619]">{t('hire.setOnHire')}</button>
                  )}
                  {l.status === 'active' && (
                    <>
                      <button onClick={() => setSwapLine(l)} className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E]">{t('hire.swap')}</button>
                      <button onClick={() => endHire(l)} className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E]">{t('hire.endHire')}</button>
                    </>
                  )}
                  <button onClick={() => removeLine(l)} title={t('hire.removeLine')} className="p-1 rounded-md text-[#72A68E] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {swapLine && (
        <HireSwapModal
          organizationId={organizationId}
          agreement={agreement}
          fromLine={swapLine}
          onClose={() => setSwapLine(null)}
          onDone={() => {
            setSwapLine(null)
            loadLines()
            onChange()
          }}
        />
      )}

      {hireVehicle && (
        <SetOutOnHireModal
          vehicle={hireVehicle}
          isOpen={!!hireVehicle}
          loading={hireBusy}
          onClose={() => {
            if (!hireBusy) {
              setHireVehicle(null)
              setHireLineId(null)
              setPendingCheckIn(null)
            }
          }}
          onConfirm={confirmSetOnHire}
        />
      )}

      {showEdit && (
        <NewAgreementModal
          organizationId={organizationId}
          label={agreement.reference || t('hire.agreement')}
          editing={agreement}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            loadLines()
            onChange()
          }}
        />
      )}

      {showSchedule && (
        <HireScheduleModal
          organizationId={organizationId}
          agreement={agreement}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showRenew && (
        <NewAgreementModal
          organizationId={organizationId}
          label={agreement.reference || t('hire.agreement')}
          renewFrom={agreement}
          onClose={() => setShowRenew(false)}
          onSaved={() => {
            setShowRenew(false)
            onChange()
          }}
        />
      )}
    </div>
  )
}

type VehicleHit = { id: string; registration: string; make?: string; model?: string }

// Batch add: search a reg → click to stage it, search the next, stage it, …
// then "Add N vehicles" attaches the whole list at once.
function VehicleAttach({
  organizationId,
  existingRegs,
  defaultOutDate,
  onComplete,
}: {
  organizationId: string | null
  existingRegs: string[]
  defaultOutDate: string
  onComplete: (vehicles: VehicleHit[], opts: { alreadyOnHire: boolean; outDate: string }) => Promise<void>
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<VehicleHit[]>([])
  const [staged, setStaged] = useState<VehicleHit[]>([])
  const [busy, setBusy] = useState(false)
  const [alreadyOnHire, setAlreadyOnHire] = useState(false)
  const [outDate, setOutDate] = useState(defaultOutDate || '')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const norm = (r?: string) => (r || '').toUpperCase().replace(/\s+/g, '')

  useEffect(() => {
    if (!organizationId) return
    if (debounce.current) clearTimeout(debounce.current)
    const term = norm(q)
    if (term.length < 3) {
      setHits([])
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('vehicles')
          .select('id, registration, make, model')
          .eq('organization_id', organizationId)
        setHits(
          (data ?? [])
            .filter((d) => norm(d.registration).includes(term))
            .slice(0, 6),
        )
      } catch {
        setHits([])
      }
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [q, organizationId])

  const stage = (h: VehicleHit) => {
    const n = norm(h.registration)
    if (existingRegs.includes(n)) {
      toast.error(t('hire.alreadyOnContract', { reg: h.registration }))
      return
    }
    setStaged((prev) => (prev.some((s) => s.id === h.id) ? prev : [...prev, h]))
    setQ('')
    setHits([])
  }

  const unstage = (id: string) => setStaged((prev) => prev.filter((s) => s.id !== id))

  const complete = async () => {
    if (staged.length === 0) return
    if (alreadyOnHire && !outDate) {
      toast.error(t('hire.onHireSinceRequired'))
      return
    }
    setBusy(true)
    try {
      await onComplete(staged, { alreadyOnHire, outDate })
      setStaged([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            placeholder={t('hire.vehicleSearch')}
            className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono"
          />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-[#025940] rounded-lg shadow-lg overflow-hidden">
            {hits.map((h) => {
              const already = existingRegs.includes(norm(h.registration)) || staged.some((s) => s.id === h.id)
              return (
                <button
                  key={h.id}
                  onMouseDown={() => stage(h)}
                  disabled={already}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#025940]/10 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Car className="w-3.5 h-3.5 text-[#72A68E]" />
                  <span className="font-mono font-bold text-sm text-[#012619] dark:text-white">{h.registration}</span>
                  <span className="text-xs text-gray-500 flex-1 truncate">{h.make} {h.model}</span>
                  {already ? <span className="text-[10px] text-[#72A68E]">{t('hire.added')}</span> : <Plus className="w-3.5 h-3.5 text-[#025940]" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {staged.length > 0 && (
        <div className="rounded-lg border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800/50 p-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {staged.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-white dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 text-xs">
                <span className="font-mono font-bold text-[#012619] dark:text-white">{s.registration}</span>
                <button onClick={() => unstage(s.id)} className="p-0.5 rounded text-[#72A68E] hover:text-red-600"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>

          {/* Import existing hires: mark as already on hire, backdated */}
          <div className="rounded-lg border border-[#cdd9d2] dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={alreadyOnHire} onChange={(e) => setAlreadyOnHire(e.target.checked)} className="w-4 h-4 accent-[#025940]" />
              <span className="text-xs font-semibold text-[#012619] dark:text-white">{t('hire.alreadyOnHireToggle')}</span>
            </label>
            {alreadyOnHire && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#72A68E] flex-shrink-0">{t('hire.onHireSince')}</span>
                <input type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} className="px-2 py-1.5 border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-xs" />
              </div>
            )}
            {alreadyOnHire && <p className="text-[10px] text-[#72A68E] leading-snug">{t('hire.alreadyOnHireHint')}</p>}
          </div>

          <button
            onClick={complete}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-[#025940] to-[#012619] shadow-sm hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <Check className="w-4 h-4" /> {alreadyOnHire ? t('hire.importVehiclesBtn', { count: staged.length }) : t('hire.addVehiclesBtn', { count: staged.length })}
          </button>
        </div>
      )}
    </div>
  )
}

function lineStatusLabel(s: string, t: (k: string) => string): string {
  return s === 'active' ? t('hire.lineActive')
    : s === 'returned' ? t('hire.lineReturned')
      : s === 'swapped' ? t('hire.lineSwapped')
        : t('hire.lineScheduled')
}
