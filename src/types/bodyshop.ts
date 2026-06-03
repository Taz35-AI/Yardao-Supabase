// src/types/bodyshop.ts

export type BodyshopStage = 'queued' | 'prep' | 'paint' | 'finishing'

export interface StageHours {
  queued: number
  prep: number
  paint: number
  finishing: number
}

export interface DamageItem {
  id: string
  description: string   // free text or from dropdown
  estimatedHours?: number  // set by prep technician
}

export interface MaterialLine {
  id: string
  name: string
  quantity: number
  unit: string
  stockPartId?: string  // ✅ NEW: Links to stockParts collection for invoice integration
}

export interface DailyLog {
  id?: string
  date: string
  hours: number
  notes?: string
  materials: MaterialLine[]
  stage: BodyshopStage
  loggedBy: string
  loggedByName: string
  createdAt: string
  updatedAt?: string
}

export interface BodyshopJob {
  id?: string
  vehicleRegistration: string
  vehicleId?: string
  vehicleMake?: string
  vehicleModel?: string
  status: 'open' | 'complete'
  stage: BodyshopStage
  priority: number // Lower = higher priority (1 is top)
  stageHours: StageHours
  totalHours: number
  organizationId: string
  createdBy: string
  createdByName: string
  createdAt: string
  completedAt?: string
  completedBy?: string
  damages?: DamageItem[]
  damagesEstimated?: boolean  // true once prep tech has saved estimates — locks the panel

  // 👤 Mechanic assignment — optional. When set, identifies the mechanic
  // responsible for this job. Both fields written together (or both cleared)
  // by the assignment UI.
  assignedMechanicId?: string | null
  assignedMechanicName?: string | null
}

export const STAGE_CONFIG: Record<BodyshopStage, { label: string; color: string; bgColor: string }> = {
  queued: { label: 'Queued', color: '#6b7280', bgColor: '#f3f4f6' },
  prep: { label: 'Prep', color: '#f59e0b', bgColor: '#fef3c7' },
  paint: { label: 'Paint', color: '#3b82f6', bgColor: '#dbeafe' },
  finishing: { label: 'Finishing', color: '#10b981', bgColor: '#d1fae5' },
}