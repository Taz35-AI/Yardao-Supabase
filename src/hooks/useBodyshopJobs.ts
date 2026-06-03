// src/hooks/useBodyshopJobs.ts — SUPABASE re-implementation.
// Bodyshop kanban hook. Public return shape + every function signature are kept
// identical; only the internals swap Firestore → Supabase.
//
// The `bodyshopJobs` collection → `bodyshop_jobs` table and its `timeEntries`
// sub-collection → `bodyshop_time_entries` (re-parented via job_id, carries its
// own organization_id). Columns are snake_case and mapped via dbMap so the
// BodyshopJob / DailyLog frontend shapes stay byte-for-byte identical. The
// original used a manual getDocs load (no onSnapshot), so loadJobs stays a
// one-shot fetch and the same optimistic local-state updates are preserved.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { toCamel } from '@/lib/dbMap'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService, vehicleService } from '@/lib/firestore'
import { stockService } from '@/lib/services/stockService'  // ✅ For bodyshop parts → invoice integration
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { BodyshopJob, DailyLog, MaterialLine, BodyshopStage, StageHours } from '@/types/bodyshop'

const JOBS_TABLE = 'bodyshop_jobs'
const LOGS_TABLE = 'bodyshop_time_entries'

const DEFAULT_STAGE_HOURS: StageHours = {
  queued: 0,
  prep: 0,
  paint: 0,
  finishing: 0,
}

const STAGE_CONFIG_LABELS: Record<BodyshopStage, string> = {
  queued: 'Queued',
  prep: 'Prep',
  paint: 'Paint',
  finishing: 'Finishing',
}

// Row → BodyshopJob: snake→camel + apply the same defaults the Firestore
// version did (stage/priority/stageHours fallbacks).
function rowToJob(row: any): BodyshopJob {
  const j = toCamel<any>(row)!
  return {
    ...j,
    stage: j.stage || 'queued',
    priority: j.priority ?? 999,
    stageHours: j.stageHours || { ...DEFAULT_STAGE_HOURS },
  } as BodyshopJob
}

// Row → DailyLog: snake→camel + stage fallback (matches Firestore mapping).
function rowToLog(row: any): DailyLog {
  const l = toCamel<any>(row)!
  return {
    ...l,
    stage: l.stage || 'queued',
  } as DailyLog
}

export function useBodyshopJobs() {
  const t = useT()
  const { user } = useAuth()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState('Unknown')
  const [userRole, setUserRole] = useState<'admin' | 'member'>('member')

  const [jobs, setJobs] = useState<BodyshopJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)

  // ── Bootstrap user/org ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    userProfileService.getProfile(user.uid).then(profile => {
      if (profile?.organizationId) {
        setOrganizationId(profile.organizationId)
        setUserDisplayName(profile.displayName || 'Unknown')
        setUserRole(profile.role === 'admin' ? 'admin' : 'member')
      }
    })
  }, [user])

  // ── Load all jobs ───────────────────────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    if (!organizationId) return
    setLoadingJobs(true)
    try {
      const { data, error } = await supabase
        .from(JOBS_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setJobs((data ?? []).map(rowToJob))
    } catch (err) {
      logger.error('useBodyshopJobs: loadJobs failed', err)
      toast.error(t('bodyshop.toast.loadFail'))
    } finally {
      setLoadingJobs(false)
    }
  }, [organizationId])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  // ── Create a new job ────────────────────────────────────────────────────────
  // 👤 Optional `assignedMechanic` parameter records which mechanic is
  // responsible for the new job. Backward compatible: existing call sites
  // (without the param) keep working — the field is simply omitted.
  const createJob = async (
    registration: string,
    make?: string,
    model?: string,
    vehicleId?: string,
    damages?: import('@/types/bodyshop').DamageItem[],
    assignedMechanic?: { id: string; name: string } | null,
  ): Promise<BodyshopJob | null> => {
    if (!organizationId || !user) return null

    const reg = registration.toUpperCase().trim()

    const existing = jobs.find(
      j => j.vehicleRegistration === reg && j.status === 'open'
    )
    if (existing) {
      toast.error(t('bodyshop.toast.jobExists', { reg }))
      return null
    }

    let finalVehicleId = vehicleId
    let finalMake = make
    let finalModel = model

    if (!finalMake && !finalModel) {
      try {
        const v = await vehicleService.getVehicleByRegistration(organizationId, reg)
        if (v) {
          finalVehicleId = v.id
          finalMake = v.make
          finalModel = v.model
        }
      } catch {
        // non-fatal
      }
    }

    // Calculate next priority (add to end of queue)
    const queuedJobs = jobs.filter(j => j.stage === 'queued' && j.status === 'open')
    const maxPriority = queuedJobs.reduce((max, j) => Math.max(max, j.priority || 0), 0)
    const nextPriority = maxPriority + 1

    const newJob: Omit<BodyshopJob, 'id'> = {
      vehicleRegistration: reg,
      ...(finalVehicleId && { vehicleId: finalVehicleId }),
      ...(finalMake && { vehicleMake: finalMake }),
      ...(finalModel && { vehicleModel: finalModel }),
      status: 'open',
      stage: 'queued',
      priority: nextPriority,
      stageHours: { ...DEFAULT_STAGE_HOURS },
      totalHours: 0,
      organizationId,
      createdBy: user.uid,
      createdByName: userDisplayName,
      createdAt: new Date().toISOString(),
      ...(damages && damages.length > 0 && { damages }),
      ...(assignedMechanic && assignedMechanic.id && {
        assignedMechanicId: assignedMechanic.id,
        assignedMechanicName: assignedMechanic.name,
      }),
    }

    try {
      const { data, error } = await supabase
        .from(JOBS_TABLE)
        .insert({
          organization_id: organizationId,
          vehicle_registration: reg,
          ...(finalVehicleId && { vehicle_id: finalVehicleId }),
          ...(finalMake && { vehicle_make: finalMake }),
          ...(finalModel && { vehicle_model: finalModel }),
          status: 'open',
          stage: 'queued',
          priority: nextPriority,
          stage_hours: { ...DEFAULT_STAGE_HOURS },
          total_hours: 0,
          created_by: user.uid,
          created_by_name: userDisplayName,
          created_at: newJob.createdAt,
          ...(damages && damages.length > 0 && { damages }),
          ...(assignedMechanic && assignedMechanic.id && {
            assigned_mechanic_id: assignedMechanic.id,
            assigned_mechanic_name: assignedMechanic.name,
          }),
        })
        .select('id')
        .single()
      if (error) throw error
      const created = { id: data.id as string, ...newJob }
      setJobs(prev => [created, ...prev])
      toast.success(t('bodyshop.toast.jobOpened', { reg }))
      return created
    } catch (err) {
      logger.error('useBodyshopJobs: createJob failed', err)
      toast.error(t('bodyshop.toast.createFail'))
      return null
    }
  }

  // ── Move job to a different stage ───────────────────────────────────────────
  const moveToStage = async (jobId: string, newStage: BodyshopStage) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job || job.stage === newStage) return

    try {
      // If moving back to queued, assign lowest priority (end of queue)
      let newPriority = job.priority
      if (newStage === 'queued') {
        const queuedJobs = jobs.filter(j => j.stage === 'queued' && j.status === 'open' && j.id !== jobId)
        const maxPriority = queuedJobs.reduce((max, j) => Math.max(max, j.priority || 0), 0)
        newPriority = maxPriority + 1
      }

      const { error } = await supabase
        .from(JOBS_TABLE)
        .update({
          stage: newStage,
          priority: newPriority,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
      if (error) throw error

      setJobs(prev =>
        prev.map(j => (j.id === jobId ? { ...j, stage: newStage, priority: newPriority } : j))
      )

      toast.success(t('bodyshop.toast.moved', { reg: job.vehicleRegistration, stage: t(`bodyshop.stage.${newStage}`) }))
    } catch (err) {
      logger.error('useBodyshopJobs: moveToStage failed', err)
      toast.error(t('bodyshop.toast.moveFail'))
    }
  }

  // ── Reorder jobs in queued column ───────────────────────────────────────────
  const reorderQueue = async (jobIds: string[]) => {
    try {
      // Firestore used a writeBatch; Supabase has no client-side batch, so the
      // per-job priority updates are issued in parallel (same observable result —
      // all rows updated, throws if any fails).
      const now = new Date().toISOString()
      const results = await Promise.all(
        jobIds.map((jobId, index) =>
          supabase
            .from(JOBS_TABLE)
            .update({ priority: index + 1, updated_at: now })
            .eq('id', jobId)
        )
      )
      const firstError = results.find(r => r.error)?.error
      if (firstError) throw firstError

      // Update local state
      setJobs(prev => {
        const updated = [...prev]
        jobIds.forEach((jobId, index) => {
          const jobIndex = updated.findIndex(j => j.id === jobId)
          if (jobIndex !== -1) {
            updated[jobIndex] = { ...updated[jobIndex], priority: index + 1 }
          }
        })
        return updated
      })
    } catch (err) {
      logger.error('useBodyshopJobs: reorderQueue failed', err)
      toast.error(t('bodyshop.toast.reorderFail'))
    }
  }


// ── Save damage hour estimates (prep technician) ────────────────────────────
  // Writes estimated hours per damage line back onto the job doc.
  // Also stamps damagesEstimated: true to lock the panel from casual edits.
  const updateJobDamages = async (jobId: string, damages: import('@/types/bodyshop').DamageItem[]): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from(JOBS_TABLE)
        .update({
          damages,
          damages_estimated: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
      if (error) throw error
      setJobs(prev => prev.map(j =>
        j.id === jobId ? { ...j, damages, damagesEstimated: true } : j
      ))
      toast.success(t('bodyshop.toast.estimatesSaved'))
      return true
    } catch (err) {
      logger.error('useBodyshopJobs: updateJobDamages failed', err)
      toast.error(t('bodyshop.toast.estimatesFail'))
      return false
    }
  }

  // ── Assign / unassign a mechanic ────────────────────────────────────────────
  // Used by the inline quick-assign on bodyshop cards. Pass null to clear.
  const assignJobMechanic = async (
    jobId: string,
    mechanic: { id: string; name: string } | null,
  ): Promise<boolean> => {
    try {
      // deleteField() → set the columns to null to clear the assignment.
      const updates = mechanic
        ? { assigned_mechanic_id: mechanic.id, assigned_mechanic_name: mechanic.name, updated_at: new Date().toISOString() }
        : { assigned_mechanic_id: null, assigned_mechanic_name: null, updated_at: new Date().toISOString() }
      const { error } = await supabase
        .from(JOBS_TABLE)
        .update(updates)
        .eq('id', jobId)
      if (error) throw error
      setJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                assignedMechanicId: mechanic?.id ?? undefined,
                assignedMechanicName: mechanic?.name ?? undefined,
              }
            : j,
        ),
      )
      return true
    } catch (err) {
      logger.error('useBodyshopJobs: assignJobMechanic failed', err)
      toast.error(t('bodyshop.toast.assignFail'))
      return false
    }
  }

  // ── Delete a job ────────────────────────────────────────────────────────────
  const deleteJob = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return

    try {
      // The job's time entries are removed via the bodyshop_time_entries
      // job_id ON DELETE CASCADE, but the original explicitly cleared them
      // first; delete them up-front to preserve the same behaviour/ordering.
      const { error: logsError } = await supabase
        .from(LOGS_TABLE)
        .delete()
        .eq('job_id', jobId)
      if (logsError) throw logsError

      const { error } = await supabase
        .from(JOBS_TABLE)
        .delete()
        .eq('id', jobId)
      if (error) throw error

      setJobs(prev => prev.filter(j => j.id !== jobId))
      toast.success(t('bodyshop.toast.deleted', { reg: job.vehicleRegistration }))
    } catch (err) {
      logger.error('useBodyshopJobs: deleteJob failed', err)
      toast.error(t('bodyshop.toast.deleteFail'))
    }
  }

  // ── Mark job complete / reopen ──────────────────────────────────────────────
  const setJobStatus = async (jobId: string, status: 'open' | 'complete') => {
    if (!user) return

    // deleteField() → null when reopening, so the completion attribution clears.
    const supabaseUpdates =
      status === 'complete'
        ? {
            status,
            completed_at: new Date().toISOString(),
            completed_by: user.uid,
          }
        : {
            status,
            completed_at: null,
            completed_by: null,
          }

    try {
      const { error } = await supabase
        .from(JOBS_TABLE)
        .update(supabaseUpdates)
        .eq('id', jobId)
      if (error) throw error

      setJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                status,
                ...(status === 'complete'
                  ? { completedAt: new Date().toISOString(), completedBy: user.uid }
                  : { completedAt: undefined, completedBy: undefined }),
              }
            : j
        )
      )

      toast.success(t(status === 'complete' ? 'bodyshop.toast.markedComplete' : 'bodyshop.toast.reopened'))
    } catch (err) {
      logger.error('useBodyshopJobs: setJobStatus failed', err)
      toast.error(t('bodyshop.toast.statusFail'))
    }
  }

  // ── Load logs for a job ─────────────────────────────────────────────────────
  const loadLogs = async (jobId: string): Promise<DailyLog[]> => {
    try {
      const { data, error } = await supabase
        .from(LOGS_TABLE)
        .select('*')
        .eq('job_id', jobId)
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []).map(rowToLog)
    } catch (err) {
      logger.error('useBodyshopJobs: loadLogs failed', err)
      toast.error(t('bodyshop.toast.entriesLoadFail'))
      return []
    }
  }

  // ── Save log (FIXED: Multiple entries per day, per stage) ─────────────────────
  // ✅ ENHANCED: Now also writes partUsage records for stock materials
  //    so bodyshop parts appear on invoices alongside mechanical parts
const saveLog = async (
  jobId: string,
  date: string,
  hours: number,
  notes: string,
  materials: MaterialLine[]
): Promise<boolean> => {
  if (!user || !organizationId) return false

  const job = jobs.find(j => j.id === jobId)
  if (!job) return false

  const currentStage = job.stage

  try {
    // ─── 1. Check if a log for this date AND this stage already exists ────
    const { data: existingRows, error: existingError } = await supabase
      .from(LOGS_TABLE)
      .select('*')
      .eq('job_id', jobId)
      .eq('date', date)
      .eq('stage', currentStage)
    if (existingError) throw existingError

    // ─── 2. Determine if this is a NEW log (not an edit of existing) ──────
    const isNewLog = !existingRows || existingRows.length === 0

    // ─── 3. Build log data (materials now include stockPartId) ────────────
    const logData: Omit<DailyLog, 'id'> = {
      date,
      hours,
      notes: notes.trim() || '',
      materials,
      stage: currentStage,
      loggedBy: user.uid,
      loggedByName: userDisplayName,
      createdAt: isNewLog ? new Date().toISOString() : (existingRows![0].created_at as string),
      updatedAt: new Date().toISOString(),
    }

    if (!isNewLog) {
      // Update existing log for this date + stage combo
      const { error } = await supabase
        .from(LOGS_TABLE)
        .update({
          date: logData.date,
          hours: logData.hours,
          notes: logData.notes,
          materials: logData.materials,
          stage: logData.stage,
          logged_by: logData.loggedBy,
          logged_by_name: logData.loggedByName,
          updated_at: logData.updatedAt,
        })
        .eq('id', existingRows![0].id)
      if (error) throw error
    } else {
      // Create new log entry
      const { error } = await supabase
        .from(LOGS_TABLE)
        .insert({
          organization_id: organizationId,
          job_id: jobId,
          date: logData.date,
          hours: logData.hours,
          notes: logData.notes,
          materials: logData.materials,
          stage: logData.stage,
          logged_by: logData.loggedBy,
          logged_by_name: logData.loggedByName,
          created_at: logData.createdAt,
          updated_at: logData.updatedAt,
        })
      if (error) throw error
    }

    // ─── 4. ✅ NEW: Write partUsage records for stock materials ───────────
    //    Only for NEW logs (not edits) to prevent double-deducting stock.
    //    Uses the same batchUseParts that mechanical stock-take uses,
    //    so invoicing picks up bodyshop parts automatically.
    if (isNewLog) {
      const stockMaterials = materials.filter(m => m.stockPartId)

      if (stockMaterials.length > 0 && job.vehicleId) {
        try {
          // Convert display units back to stock units:
          // - UI shows ml → stock stores liters (divide by 1000)
          // - UI shows pcs → stock stores pieces (no conversion)
          const batchItems = stockMaterials.map(m => ({
            partId: m.stockPartId!,
            quantity: m.unit === 'ml' ? m.quantity / 1000 : m.quantity,
          }))

          await stockService.batchUseParts(
            batchItems,
            job.vehicleId,
            job.vehicleRegistration,
            user.uid,
            userDisplayName,
            organizationId,
            `Bodyshop ${STAGE_CONFIG_LABELS[currentStage]}: ${notes.trim() || 'Materials used'}`
          )

          logger.log('✅ Bodyshop stock usage recorded for invoicing:', {
            jobId,
            vehicleReg: job.vehicleRegistration,
            partsCount: batchItems.length,
          })
        } catch (stockErr) {
          // Log but don't fail the whole save — the hours/log are still valid
          logger.error('⚠️ Bodyshop stock deduction failed (log still saved):', stockErr)
          toast.error(t('bodyshop.toast.stockDeductFail'))
        }
      } else if (stockMaterials.length > 0 && !job.vehicleId) {
        // Job has no vehicleId — can't write usage records without it
        logger.warn('⚠️ Bodyshop job has no vehicleId — stock materials saved on log but not deducted from stock. Assign a fleet vehicle to enable invoice integration.')
        toast.error(t('bodyshop.toast.noLinkedVehicle'))
      }
    }

    // ─── 5. Recalculate stageHours by summing ALL logs ────────────────────
    const allLogs = await loadLogs(jobId)
    const newStageHours: StageHours = { queued: 0, prep: 0, paint: 0, finishing: 0 }
    let totalHours = 0

    for (const log of allLogs) {
      const logStage = log.stage || 'queued'
      newStageHours[logStage] = (newStageHours[logStage] || 0) + log.hours
      totalHours += log.hours
    }

    const { error: jobUpdateError } = await supabase
      .from(JOBS_TABLE)
      .update({
        total_hours: totalHours,
        stage_hours: newStageHours,
      })
      .eq('id', jobId)
    if (jobUpdateError) throw jobUpdateError

    setJobs(prev =>
      prev.map(j => (j.id === jobId ? { ...j, totalHours, stageHours: newStageHours } : j))
    )

    toast.success(t('bodyshop.toast.hoursLogged'))
    return true
  } catch (err) {
    logger.error('useBodyshopJobs: saveLog failed', err)
    toast.error(t('bodyshop.toast.logFail'))
    return false
  }
}

  // ── Delete a log ────────────────────────────────────────────────────────────
  const deleteLog = async (jobId: string, logId: string): Promise<boolean> => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return false

    try {
      const { error } = await supabase
        .from(LOGS_TABLE)
        .delete()
        .eq('id', logId)
      if (error) throw error

      // Recalculate stageHours
      const allLogs = await loadLogs(jobId)
      const newStageHours: StageHours = { queued: 0, prep: 0, paint: 0, finishing: 0 }
      let totalHours = 0

      for (const log of allLogs) {
        const logStage = log.stage || 'queued'
        newStageHours[logStage] = (newStageHours[logStage] || 0) + log.hours
        totalHours += log.hours
      }

      const { error: jobUpdateError } = await supabase
        .from(JOBS_TABLE)
        .update({
          total_hours: totalHours,
          stage_hours: newStageHours,
        })
        .eq('id', jobId)
      if (jobUpdateError) throw jobUpdateError

      setJobs(prev =>
        prev.map(j => (j.id === jobId ? { ...j, totalHours, stageHours: newStageHours } : j))
      )

      toast.success(t('bodyshop.toast.entryRemoved'))
      return true
    } catch (err) {
      logger.error('useBodyshopJobs: deleteLog failed', err)
      toast.error(t('bodyshop.toast.entryRemoveFail'))
      return false
    }
  }

  return {
    jobs,
    loadingJobs,
    organizationId,
    userDisplayName,
    userRole,
    loadJobs,
    createJob,
    moveToStage,
    reorderQueue,
    deleteJob,
    setJobStatus,
    loadLogs,
    saveLog,
    deleteLog,
    updateJobDamages,
    assignJobMechanic,
  }
}
