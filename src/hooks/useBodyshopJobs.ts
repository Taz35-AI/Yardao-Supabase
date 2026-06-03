// src/hooks/useBodyshopJobs.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  deleteField,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService, vehicleService } from '@/lib/firestore'
import { stockService } from '@/lib/services/stockService'  // ✅ NEW: For bodyshop parts → invoice integration
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { BodyshopJob, DailyLog, MaterialLine, BodyshopStage, StageHours } from '@/types/bodyshop'

const JOBS_COLLECTION = 'bodyshopJobs'
const LOGS_SUBCOLLECTION = 'timeEntries'

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
      const q = query(
        collection(db, JOBS_COLLECTION),
        where('organizationId', '==', organizationId),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setJobs(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          stage: data.stage || 'queued',
          priority: data.priority ?? 999,
          stageHours: data.stageHours || { ...DEFAULT_STAGE_HOURS },
        } as BodyshopJob
      }))
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
      const ref = await addDoc(collection(db, JOBS_COLLECTION), newJob)
      const created = { id: ref.id, ...newJob }
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

      await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
        stage: newStage,
        priority: newPriority,
        updatedAt: new Date().toISOString(),
      })

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
      const batch = writeBatch(db)
      
      jobIds.forEach((jobId, index) => {
        const newPriority = index + 1
        batch.update(doc(db, JOBS_COLLECTION, jobId), { 
          priority: newPriority,
          updatedAt: new Date().toISOString(),
        })
      })

      await batch.commit()

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
      await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
        damages,
        damagesEstimated: true,
        updatedAt: new Date().toISOString(),
      })
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
      const updates = mechanic
        ? { assignedMechanicId: mechanic.id, assignedMechanicName: mechanic.name, updatedAt: new Date().toISOString() }
        : { assignedMechanicId: deleteField(), assignedMechanicName: deleteField(), updatedAt: new Date().toISOString() }
      await updateDoc(doc(db, JOBS_COLLECTION, jobId), updates as any)
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
      const logsQuery = query(collection(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION))
      const logsSnap = await getDocs(logsQuery)
      
      const deletePromises = logsSnap.docs.map(logDoc => 
        deleteDoc(doc(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION, logDoc.id))
      )
      await Promise.all(deletePromises)

      await deleteDoc(doc(db, JOBS_COLLECTION, jobId))

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

    const firestoreUpdates =
      status === 'complete'
        ? { 
            status, 
            completedAt: new Date().toISOString(), 
            completedBy: user.uid 
          }
        : { 
            status, 
            completedAt: deleteField(), 
            completedBy: deleteField() 
          }

    try {
      await updateDoc(doc(db, JOBS_COLLECTION, jobId), firestoreUpdates)

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
      const q = query(
        collection(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION),
        orderBy('date', 'asc')
      )
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        stage: d.data().stage || 'queued',
      } as DailyLog))
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
    const q = query(
      collection(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION),
      where('date', '==', date),
      where('stage', '==', currentStage)
    )
    const snap = await getDocs(q)

    // ─── 2. Determine if this is a NEW log (not an edit of existing) ──────
    const isNewLog = snap.empty

    // ─── 3. Build log data (materials now include stockPartId) ────────────
    const logData: Omit<DailyLog, 'id'> = {
      date,
      hours,
      notes: notes.trim() || '',
      materials,
      stage: currentStage,
      loggedBy: user.uid,
      loggedByName: userDisplayName,
      createdAt: isNewLog ? new Date().toISOString() : snap.docs[0].data().createdAt,
      updatedAt: new Date().toISOString(),
    }

    if (!isNewLog) {
      // Update existing log for this date + stage combo
      await updateDoc(
        doc(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION, snap.docs[0].id),
        logData
      )
    } else {
      // Create new log entry
      await addDoc(
        collection(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION),
        logData
      )
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

    await updateDoc(doc(db, JOBS_COLLECTION, jobId), { 
      totalHours,
      stageHours: newStageHours,
    })

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
      await deleteDoc(doc(db, JOBS_COLLECTION, jobId, LOGS_SUBCOLLECTION, logId))

      // Recalculate stageHours
      const allLogs = await loadLogs(jobId)
      const newStageHours: StageHours = { queued: 0, prep: 0, paint: 0, finishing: 0 }
      let totalHours = 0

      for (const log of allLogs) {
        const logStage = log.stage || 'queued'
        newStageHours[logStage] = (newStageHours[logStage] || 0) + log.hours
        totalHours += log.hours
      }

      await updateDoc(doc(db, JOBS_COLLECTION, jobId), { 
        totalHours,
        stageHours: newStageHours,
      })

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