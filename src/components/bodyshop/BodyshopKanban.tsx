// src/components/bodyshop/BodyshopKanban.tsx
'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Clock, Trash2, GripVertical, Car, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import type { BodyshopJob, BodyshopStage } from '@/types/bodyshop'
import { STAGE_CONFIG } from '@/types/bodyshop'
import { useT } from '@/lib/i18n'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(h: number) {
  if (!h) return '0h'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

const STAGES: BodyshopStage[] = ['queued', 'prep', 'paint', 'finishing']

// ─── Mobile: Job Card with Stage Selector ─────────────────────────────────────

function MobileJobCard({
  job,
  onClick,
  onDelete,
  onStageChange,
}: {
  job: BodyshopJob
  onClick: () => void
  onDelete: () => void
  onStageChange: (jobId: string, stage: BodyshopStage) => void
}) {
  const t = useT()
  const [showStageMenu, setShowStageMenu] = useState(false)
  const stageConfig = STAGE_CONFIG[job.stage]

  const handleStageSelect = (stage: BodyshopStage) => {
    if (stage !== job.stage) {
      const fromIdx = STAGES.indexOf(job.stage)
      const toIdx = STAGES.indexOf(stage)
      const isMovingForward = toIdx > fromIdx
      const isFromQueued = job.stage === 'queued'
      const currentStageHours = job.stageHours?.[job.stage] || 0

      if (isMovingForward && !isFromQueued && currentStageHours === 0) {
        toast.error(t('bodyshop.kanban.logHoursWarn'))
        setShowStageMenu(false)
        return
      }

      onStageChange(job.id!, stage)
    }
    setShowStageMenu(false)
  }

  return (
    <div className="bg-white rounded-xl border border-[#025940]/20 shadow-sm overflow-hidden">
      <div className="flex items-stretch">
        {/* Priority number for queued */}
        {job.stage === 'queued' && (
          <div className="w-8 bg-[#f0f4f2] flex items-center justify-center border-r border-[#025940]/10">
            <span className="text-xs font-bold text-[#025940]">{job.priority || '—'}</span>
          </div>
        )}

        {/* Main content - tap to open detail */}
        <button
          onClick={onClick}
          className="flex-1 p-3 text-left active:bg-[#f0f4f2] transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#012619] tracking-wider">
                {job.vehicleRegistration}
              </p>
              {(job.vehicleMake || job.vehicleModel) && (
                <p className="text-xs text-[#72A68E] truncate">
                  {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
                </p>
              )}
              {/* 👤 Mechanic badge — read-only display; the JobDetailPanel
                  is where the actual assignment happens. */}
              {job.assignedMechanicName && (
                <p className="text-[10px] font-semibold text-blue-700 mt-0.5 truncate">
                  👤 {job.assignedMechanicName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 bg-[#012619] rounded-lg px-2 py-1">
              <Clock className="w-3 h-3 text-[#72A68E]" />
              <span className="text-xs font-bold text-white">
                {formatHours(job.totalHours)}
              </span>
            </div>
          </div>
        </button>

        {/* Stage selector dropdown */}
        <div className="relative border-l border-[#025940]/10">
          <button
            onClick={() => setShowStageMenu(!showStageMenu)}
            className="h-full px-3 flex items-center gap-1 active:bg-[#f0f4f2] transition-colors"
            style={{ backgroundColor: stageConfig.bgColor }}
          >
            <span 
              className="text-xs font-bold"
              style={{ color: stageConfig.color }}
            >
              {t(`bodyshop.stage.${job.stage}`)}
            </span>
            <ChevronDown 
              className="w-3 h-3" 
              style={{ color: stageConfig.color }}
            />
          </button>

          {/* Dropdown menu */}
          {showStageMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowStageMenu(false)} 
              />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#025940]/20 rounded-xl shadow-lg overflow-hidden min-w-[120px]">
                {STAGES.map(stage => {
                  const cfg = STAGE_CONFIG[stage]
                  const isActive = stage === job.stage
                  return (
                    <button
                      key={stage}
                      onClick={() => handleStageSelect(stage)}
                      className={`w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors ${
                        isActive 
                          ? 'bg-[#025940]/10' 
                          : 'hover:bg-[#f0f4f2] active:bg-[#e0e8e4]'
                      }`}
                    >
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: cfg.color }}
                      />
                      <span 
                        className={`text-sm font-semibold ${isActive ? 'text-[#012619]' : 'text-[#72A68E]'}`}
                      >
                        {t(`bodyshop.stage.${stage}`)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="px-3 flex items-center justify-center text-[#72A68E] hover:text-red-500 active:text-red-600 active:bg-red-50 transition-colors border-l border-[#025940]/10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Mobile: List View with Stage Filter ──────────────────────────────────────

function MobileKanban({
  jobs,
  onMoveToStage,
  onJobClick,
  onJobDelete,
}: {
  jobs: BodyshopJob[]
  onMoveToStage: (jobId: string, stage: BodyshopStage) => void
  onJobClick: (job: BodyshopJob) => void
  onJobDelete: (job: BodyshopJob) => void
}) {
  const t = useT()
  const [activeStage, setActiveStage] = useState<BodyshopStage | 'all'>('all')

  // Filter and sort jobs
  const filteredJobs = jobs
    .filter(j => j.status === 'open')
    .filter(j => activeStage === 'all' || j.stage === activeStage)
    .sort((a, b) => {
      // Sort queued by priority, others by createdAt
      if (a.stage === 'queued' && b.stage === 'queued') {
        return (a.priority || 999) - (b.priority || 999)
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  // Count per stage
  const counts = STAGES.reduce((acc, stage) => {
    acc[stage] = jobs.filter(j => j.stage === stage && j.status === 'open').length
    return acc
  }, {} as Record<BodyshopStage, number>)

  const totalOpen = jobs.filter(j => j.status === 'open').length

  return (
    <div className="space-y-3">
      {/* Stage filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setActiveStage('all')}
          className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeStage === 'all'
              ? 'bg-[#012619] text-white'
              : 'bg-[#f0f4f2] text-[#72A68E] active:bg-[#e0e8e4]'
          }`}
        >
          {t('bodyshop.kanban.allCount', { count: totalOpen })}
        </button>
        {STAGES.map(stage => {
          const cfg = STAGE_CONFIG[stage]
          const count = counts[stage]
          const isActive = activeStage === stage
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(stage)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'text-white'
                  : 'text-[#72A68E] active:opacity-80'
              }`}
              style={{
                backgroundColor: isActive ? cfg.color : cfg.bgColor,
                color: isActive ? 'white' : cfg.color,
              }}
            >
              {t(`bodyshop.stage.${stage}`)}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-white/20' : 'bg-white'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Job list */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-8 text-[#72A68E] text-sm">
          {t('bodyshop.kanban.noJobsStage')}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredJobs.map(job => (
            <MobileJobCard
              key={job.id}
              job={job}
              onClick={() => onJobClick(job)}
              onDelete={() => onJobDelete(job)}
              onStageChange={onMoveToStage}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Desktop: Sortable Job Card ───────────────────────────────────────────────

function SortableJobCard({
  job,
  onClick,
  onDelete,
  showPriority,
  priorityIndex,
}: {
  job: BodyshopJob
  onClick: () => void
  onDelete: () => void
  showPriority?: boolean
  priorityIndex?: number
}) {
  const t = useT()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: job.id!,
    data: { job, type: 'job' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const stageHours = job.stageHours?.[job.stage] || 0

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-[#025940]/20 rounded-xl border-2 border-dashed border-[#025940]/40 h-[72px]"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl border border-[#025940]/20 shadow-sm hover:shadow-md transition-all group"
    >
      <div className="flex items-stretch">
        {/* Priority + Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center gap-1 w-12 bg-[#f0f4f2] rounded-l-xl cursor-grab active:cursor-grabbing"
        >
          {showPriority && priorityIndex !== undefined && (
            <span className="text-xs font-bold text-[#025940] w-4 text-center">
              {priorityIndex + 1}
            </span>
          )}
          <GripVertical className="w-4 h-4 text-[#72A68E]" />
        </div>

        {/* Card content */}
<button
  onClick={onClick}
  className="flex-1 min-w-0 p-3 text-left"
>

          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#012619] tracking-wider">
                {job.vehicleRegistration}
              </p>
              {(job.vehicleMake || job.vehicleModel) && (
                <p className="text-xs text-[#72A68E] truncate">
                  {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 bg-[#012619] rounded-lg px-2 py-1">
              <Clock className="w-3 h-3 text-[#72A68E]" />
              <span className="text-xs font-bold text-white">
                {formatHours(job.totalHours)}
              </span>
            </div>
          </div>

          {stageHours > 0 && (
            <p className="text-[10px] text-[#72A68E] mt-1">
              {t('bodyshop.kanban.inThisStage', { duration: formatHours(stageHours) })}
            </p>
          )}

          {/* 👤 Assigned mechanic — read-only badge. Quick-assign happens in
              the JobDetailPanel; the kanban card just surfaces who's on it. */}
          {job.assignedMechanicName && (
            <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 mt-1 truncate">
              👤 {job.assignedMechanicName}
            </p>
          )}
        </button>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex items-center justify-center w-10 text-[#72A68E] hover:text-red-500 hover:bg-red-50 rounded-r-xl transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Desktop: Drag Overlay Card ───────────────────────────────────────────────

function DragOverlayCard({ job }: { job: BodyshopJob }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#025940] shadow-2xl p-3 w-64 rotate-2">
      <div className="flex items-center gap-2">
        <Car className="w-4 h-4 text-[#025940]" />
        <p className="text-sm font-black text-[#012619] tracking-wider">
          {job.vehicleRegistration}
        </p>
      </div>
      {(job.vehicleMake || job.vehicleModel) && (
        <p className="text-xs text-[#72A68E] mt-1">
          {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
        </p>
      )}
    </div>
  )
}

// ─── Desktop: Droppable Column ────────────────────────────────────────────────

function Column({
  stage,
  jobs,
  onJobClick,
  onJobDelete,
}: {
  stage: BodyshopStage
  jobs: BodyshopJob[]
  onJobClick: (job: BodyshopJob) => void
  onJobDelete: (job: BodyshopJob) => void
}) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: { type: 'column', stage },
  })

  const config = STAGE_CONFIG[stage]
  const isQueued = stage === 'queued'

  const sortedJobs = isQueued 
    ? [...jobs].sort((a, b) => (a.priority || 999) - (b.priority || 999))
    : jobs

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[280px] max-w-[320px] flex flex-col rounded-2xl transition-colors ${
        isOver ? 'bg-[#025940]/10 ring-2 ring-[#025940]/30' : 'bg-[#f8faf9]'
      }`}
    >
      {/* Column header */}
      <div className="p-3 border-b border-[#025940]/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: config.color }}
            />
            <h3 className="text-sm font-bold text-[#012619]">{t(`bodyshop.stage.${stage}`)}</h3>
          </div>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: config.bgColor, color: config.color }}
          >
            {jobs.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        {sortedJobs.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-[#72A68E] border-2 border-dashed border-[#025940]/20 rounded-xl">
            {t('bodyshop.kanban.dropHere')}
          </div>
        ) : (
          <SortableContext
            items={sortedJobs.map(j => j.id!)}
            strategy={verticalListSortingStrategy}
          >
            {sortedJobs.map((job, index) => (
              <SortableJobCard
                key={job.id}
                job={job}
                onClick={() => onJobClick(job)}
                onDelete={() => onJobDelete(job)}
                showPriority={isQueued}
                priorityIndex={index}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  )
}

// ─── Desktop: Full Kanban Board ───────────────────────────────────────────────

function DesktopKanban({
  jobs,
  onMoveToStage,
  onReorderQueue,
  onJobClick,
  onJobDelete,
}: {
  jobs: BodyshopJob[]
  onMoveToStage: (jobId: string, stage: BodyshopStage) => void
  onReorderQueue: (jobIds: string[]) => void
  onJobClick: (job: BodyshopJob) => void
  onJobDelete: (job: BodyshopJob) => void
}) {
  const t = useT()
  const [activeJob, setActiveJob] = useState<BodyshopJob | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const jobsByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = jobs.filter(j => j.stage === stage && j.status === 'open')
    return acc
  }, {} as Record<BodyshopStage, BodyshopJob[]>)

  const queuedJobs = [...jobsByStage.queued].sort((a, b) => (a.priority || 999) - (b.priority || 999))

  const handleDragStart = (event: DragStartEvent) => {
    const job = event.active.data.current?.job as BodyshopJob
    setActiveJob(job)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveJob(null)

    if (!over) return

    const activeJob = active.data.current?.job as BodyshopJob
    const overId = over.id as string

    // Resolve the target stage:
    // - If dropped on a column (empty area / header), overId is the stage name
    // - If dropped on a job card, overId is that job's ID — use its stage
    let newStage: BodyshopStage | null = null
    if (STAGES.includes(overId as BodyshopStage)) {
      newStage = overId as BodyshopStage
    } else {
      const overJob = jobs.find(j => j.id === overId)
      if (overJob) newStage = overJob.stage
    }

    if (!newStage) return

    // Moving to a different stage
    if (activeJob.stage !== newStage) {
      // Allow moving FROM queued to any stage (queued can't log hours)
      // Allow moving BACKWARDS freely
      // Block moving FORWARD if current stage has 0 hours logged
      const fromIdx = STAGES.indexOf(activeJob.stage)
      const toIdx = STAGES.indexOf(newStage)
      const isMovingForward = toIdx > fromIdx
      const isFromQueued = activeJob.stage === 'queued'
      const currentStageHours = activeJob.stageHours?.[activeJob.stage] || 0

      if (isMovingForward && !isFromQueued && currentStageHours === 0) {
        toast.error(t('bodyshop.kanban.logHoursWarn'))
        return
      }

      onMoveToStage(activeJob.id!, newStage)
      return
    }

    // Reordering within queued (same stage, both queued)
    if (activeJob.stage === 'queued' && newStage === 'queued') {
      const oldIndex = queuedJobs.findIndex(j => j.id === activeJob.id)
      const newIndex = queuedJobs.findIndex(j => j.id === overId)

      if (oldIndex !== newIndex && newIndex !== -1) {
        const newOrder = arrayMove(queuedJobs, oldIndex, newIndex)
        onReorderQueue(newOrder.map(j => j.id!))
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map(stage => (
          <Column
            key={stage}
            stage={stage}
            jobs={jobsByStage[stage]}
            onJobClick={onJobClick}
            onJobDelete={onJobDelete}
          />
        ))}
      </div>

      <DragOverlay>
        {activeJob ? <DragOverlayCard job={activeJob} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Main Export: Responsive Kanban ───────────────────────────────────────────

interface BodyshopKanbanProps {
  jobs: BodyshopJob[]
  onMoveToStage: (jobId: string, stage: BodyshopStage) => void
  onReorderQueue: (jobIds: string[]) => void
  onJobClick: (job: BodyshopJob) => void
  onJobDelete: (job: BodyshopJob) => void
}

export function BodyshopKanban({
  jobs,
  onMoveToStage,
  onReorderQueue,
  onJobClick,
  onJobDelete,
}: BodyshopKanbanProps) {
  return (
    <>
      {/* Mobile: List view with stage selector */}
      <div className="lg:hidden">
        <MobileKanban
          jobs={jobs}
          onMoveToStage={onMoveToStage}
          onJobClick={onJobClick}
          onJobDelete={onJobDelete}
        />
      </div>

      {/* Desktop: Drag-and-drop columns */}
      <div className="hidden lg:block">
        <DesktopKanban
          jobs={jobs}
          onMoveToStage={onMoveToStage}
          onReorderQueue={onReorderQueue}
          onJobClick={onJobClick}
          onJobDelete={onJobDelete}
        />
      </div>
    </>
  )
}