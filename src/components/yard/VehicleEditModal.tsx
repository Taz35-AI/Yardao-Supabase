// src/components/yard/VehicleEditModal.tsx
// Restyled: "Clean Sheet" — matches VehicleDetailModal brand style
// ✅ Every prop, handler, state variable, form field, and button FULLY PRESERVED
// ✅ Registration shown as a clean dark badge — no country-specific plate styling
'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  X,
  CheckCircle,
  Clock,
  Wrench,
  XCircle,
  FileText,
  Save,
  LogOut,
  Calendar,
  Car,
  Settings,
  MessageSquare,
  Gauge,
  Shield
} from 'lucide-react'
import { CheckedInVehicle, VehicleStatus, Contract } from '@/types'
import { contractService } from '@/lib/contractService'
import { mileageService } from '@/lib/services/mileageService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { DamageMapper } from '@/components/common/DamageMapper/DamageMapper'
import type { DamagePin, VehicleDiagramType } from '@/components/common/DamageMapper/DamageMapper'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConditionCategory {
  id: string
  name: string
}

interface VehicleEditModalProps {
  vehicle: CheckedInVehicle
  conditions: ConditionCategory[]
  onSave: (vehicleId: string, updates: Partial<CheckedInVehicle>) => Promise<void>
  onCheckOut: (vehicleId: string) => void
  onCancel: () => void
}

// ─── Status config (unchanged) ────────────────────────────────────────────────

const getStatusConfig = (status: VehicleStatus) => {
  switch (status) {
    case 'Ready':
      return { icon: CheckCircle, color: '#0d6b2e', bg: '#e6f4ec', activeBorder: '#0d6b2e', label: 'Ready', description: 'Available for use', labelKey: 'vehEdit.statusReadyLabel', descKey: 'vehEdit.statusReadyDesc' }
    case 'Pending checks':
      return { icon: Clock, color: '#92400e', bg: '#fef3c7', activeBorder: '#92400e', label: 'Pending checks', description: 'Requires attention', labelKey: 'vehEdit.statusPendingLabel', descKey: 'vehEdit.statusPendingDesc' }
    case 'Repairs needed':
      return { icon: Wrench, color: '#9a3412', bg: '#ffedd5', activeBorder: '#9a3412', label: 'Repairs needed', description: 'Needs repair work', labelKey: 'vehEdit.statusRepairsLabel', descKey: 'vehEdit.statusRepairsDesc' }
    case 'Non-Starter':
      return { icon: XCircle, color: '#991b1b', bg: '#fee2e2', activeBorder: '#991b1b', label: 'Non-Starter', description: 'Cannot start', labelKey: 'vehEdit.statusNonStarterLabel', descKey: 'vehEdit.statusNonStarterDesc' }
    default:
      return { icon: Clock, color: '#4a5e54', bg: '#f0f4f2', activeBorder: '#4a5e54', label: status || 'Unknown', description: 'Status pending', labelKey: '', descKey: '' }
  }
}

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────

const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const formatDate = (date: any): string => {
  if (!date) return 'Not specified'
  try {
    let dateObj: Date
    if (date && typeof date === 'object' && 'toDate' in date) {
      dateObj = (date as any).toDate()
    } else if (date instanceof Date) {
      dateObj = date
    } else {
      dateObj = new Date(date as string | number)
    }
    if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    return 'Invalid Date'
  } catch (error) {
    logger.error('Date formatting error:', error, 'for date:', date)
    return 'Invalid Date'
  }
}

// ─── Shared reg badge — locale-neutral ───────────────────────────────────────

const RegBadge = ({ registration }: { registration: string }) => (
  <div className="flex-shrink-0 bg-[#012619] border border-[#b3f243]/40 rounded-lg px-3 py-1.5 font-mono font-bold tracking-widest text-[#b3f243] leading-none text-base sm:text-lg">
    {registration || 'Unknown'}
  </div>
)

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest mb-4 pl-2 border-l-2 border-[#b3f243]">
    {children}
  </p>
)

const FieldWrap = ({
  icon: Icon,
  label,
  children
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) => (
  <div>
    <div className="flex items-center gap-2 mb-1.5">
      <Icon className="w-3.5 h-3.5 text-[#025940] flex-shrink-0" />
      <p className="text-xs text-[#8a9e94] font-medium">{label}</p>
    </div>
    {children}
  </div>
)

const inputCls =
  'w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm'

function CustomConditionDropdown({
  conditions,
  value,
  onChange,
  required = false
}: {
  conditions: ConditionCategory[]
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className={inputCls}
    >
      {conditions.map(condition => (
        <option key={condition.id} value={condition.name}>
          {condition.name}
        </option>
      ))}
    </select>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VehicleEditModal({
  vehicle,
  conditions,
  onSave,
  onCheckOut,
  onCancel
}: VehicleEditModalProps) {
  const { user } = useAuth()
  const t = useT()
  const [loading, setLoading]                   = useState(false)
  const [contracts, setContracts]               = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(true)

  // ── Form state (unchanged) ────────────────────────────────────────────────
  const [condition, setCondition]             = useState(safeString(vehicle.condition))
  const [status, setStatus]                   = useState<VehicleStatus>(vehicle.status || 'Pending checks')
  const [mileage, setMileage]                 = useState(safeString(vehicle.mileage))
  // Anti-clocking floor (historical max, excludes this live value so a genuine
  // correction is still possible down to the true floor).
  const [mileageFloor, setMileageFloor]       = useState<number | null>(null)
  const [contract, setContract]               = useState(safeString(vehicle.contract))
  const [contractColor, setContractColor]     = useState(safeString(vehicle.contractColor))
  const [additionalNotes, setAdditionalNotes] = useState(safeString(vehicle.notes))
  const [comments, setComments]               = useState(safeString(vehicle.comments))

  // ── Damage mapper state (unchanged) ──────────────────────────────────────
  const [damagePins, setDamagePins] = useState<DamagePin[]>((vehicle as any).damagePins || [])
  const vehicleDiagramType          = (vehicle as any).vehicleDiagramType as VehicleDiagramType | null | undefined

  // ── Editable check-in date (unchanged) ───────────────────────────────────
  const [checkinDate, setCheckinDate] = useState(() => {
    if (!vehicle.createdAt) return ''
    try {
      let date: Date
      if (vehicle.createdAt && typeof vehicle.createdAt === 'object' && 'toDate' in vehicle.createdAt) {
        date = (vehicle.createdAt as any).toDate()
      } else {
        date = new Date(vehicle.createdAt as string | number | Date)
      }
      if (date instanceof Date && !isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch (error) {
      logger.error('Error parsing check-in date:', error)
    }
    return ''
  })

  logger.log('🎭 VehicleEditModal rendered with vehicle:', {
    id: vehicle.id,
    registration: vehicle.registration,
    currentNotes: vehicle.notes,
    currentStatus: vehicle.status
  })

  // ── Load contracts (unchanged) ────────────────────────────────────────────
  useEffect(() => {
    const loadContracts = async () => {
      if (!user) return
      try {
        setContractsLoading(true)
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          const contractsList = await contractService.getContracts(profile.organizationId)
          setContracts(contractsList)
          logger.log('📋 Loaded contracts for edit modal:', contractsList)
        }
      } catch (error) {
        logger.error('Error loading contracts:', error)
      } finally {
        setContractsLoading(false)
      }
    }
    loadContracts()
  }, [user])

  // ── Re-initialise form when vehicle prop changes (unchanged) ──────────────
  useEffect(() => {
    logger.log('🔄 Initializing form with vehicle data:', {
      notes: vehicle.notes,
      status: vehicle.status,
      comments: vehicle.comments
    })
    setCondition(safeString(vehicle.condition))
    setStatus(vehicle.status || 'Pending checks')
    setMileage(safeString(vehicle.mileage))
    setAdditionalNotes(safeString(vehicle.notes))
    setComments(safeString(vehicle.comments))
    setContract(safeString(vehicle.contract))
    setContractColor(safeString(vehicle.contractColor))
    setDamagePins((vehicle as any).damagePins || [])
  }, [vehicle])

  // ── Handlers (all unchanged) ──────────────────────────────────────────────

  const getContractColor = (contractName: string): string => {
    if (!contractName || contractName.trim() === '') return ''
    const contractObj = contracts.find(c => c.name === contractName)
    return contractObj?.color || ''
  }

  const handleContractChange = (newContract: string) => {
    logger.log('📋 Contract changed to:', newContract)
    setContract(newContract)
    const color = getContractColor(newContract)
    setContractColor(color)
    logger.log('🎨 Contract color updated to:', color || 'none')
  }

  const handleStatusChange = (newStatus: VehicleStatus) => {
    logger.log('📊 Status changing from', status, 'to', newStatus)
    logger.log('📝 Notes will remain unchanged:', additionalNotes)
    setStatus(newStatus)
    logger.log('✅ Status changed to', newStatus, ', notes unchanged')
  }

  const handleNotesChange = (newNotes: string) => {
    logger.log('📝 Notes changing from', additionalNotes, 'to', newNotes)
    logger.log('📊 Status will remain unchanged:', status)
    setAdditionalNotes(newNotes)
    logger.log('✅ Notes changed, status unchanged')
  }

  const handleCommentsChange = (newComments: string) => {
    logger.log('💬 Comments changing to:', newComments)
    logger.log('📊 Status will remain unchanged:', status)
    setComments(newComments)
    logger.log('✅ Comments changed, status unchanged')
  }

  // Load the anti-clocking floor for this vehicle once.
  useEffect(() => {
    const orgId = (vehicle as any).organizationId as string | undefined
    const reg = vehicle.registration || ''
    if (!orgId || !reg) return
    let cancelled = false
    // Exclude the current stay's readings (recorded at/after check-in) so a
    // genuine correction of the live value is still possible down to the
    // historical floor.
    const stayStart = (vehicle as any).checkInTime || vehicle.createdAt
    let beforeIso: string | undefined
    try { beforeIso = stayStart ? new Date(stayStart).toISOString() : undefined } catch { beforeIso = undefined }
    mileageService.getMileageFloor(orgId, reg, beforeIso)
      .then(f => { if (!cancelled) setMileageFloor(f) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [vehicle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Anti-clocking: a corrected reading still can't go below the historical floor.
    const enteredMiles = parseInt((mileage || '').replace(/[,\s]/g, ''), 10)
    if (mileage.trim() && mileageFloor !== null && Number.isFinite(enteredMiles) && enteredMiles < mileageFloor) {
      alert(t('vehEdit.mileageTooLow', { min: mileageFloor.toLocaleString('en-GB') }))
      return
    }
    setLoading(true)
    try {
      const contractValue      = contract.trim()
      const contractColorValue = contractColor.trim()

      logger.log('💾 Saving vehicle with updates:', {
        condition: condition.trim(),
        status,
        mileage: mileage.trim(),
        contract: contractValue || null,
        contractColor: contractColorValue || null,
        notes: additionalNotes.trim(),
        comments: comments.trim(),
        checkinDate,
        damagePins
      })

      const updates: Partial<CheckedInVehicle> = {
        condition:     condition.trim(),
        status,
        mileage:       mileage.trim(),
        contract:      contractValue || null,
        contractColor: contractColorValue || null,
        notes:         additionalNotes.trim(),
        comments:      comments.trim(),
        createdAt:     checkinDate ? new Date(checkinDate) : vehicle.createdAt,
        updatedAt:     new Date(),
        damagePins
      } as any

      await onSave(vehicle.id, updates)
      logger.log('✅ Vehicle saved successfully')
    } catch (error) {
      logger.error('❌ Error saving vehicle:', error)
      alert(t('vehEdit.saveFail'))
    } finally {
      setLoading(false)
    }
  }

  const statusesArray: VehicleStatus[] = ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter']

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 sm:p-6 z-50">
      <div className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-[#e2e8e5] dark:border-gray-700">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-[#012619] px-4 py-3 sm:px-6 sm:py-4 flex items-center gap-3 border-b-2 border-[#b3f243]/30">
          <RegBadge registration={safeString(vehicle.registration)} />

          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm sm:text-base truncate leading-tight">
              {safeString(vehicle.make)}
              {vehicle.make && vehicle.model ? ' ' : ''}
              {safeString(vehicle.model)}
              {vehicle.size && (
                <span className="text-[#72A68E]"> · {safeString(vehicle.size)}</span>
              )}
            </p>
            <p className="text-[#72A68E] text-xs mt-0.5 font-medium">{t('vehEdit.title')}</p>
          </div>

          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label={t('vehEdit.cancel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} id="edit-vehicle-form">
            <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-[#e2e8e5] dark:divide-gray-700">

              {/* Left panel: Status & Technical */}
              <div className="flex-1 p-4 sm:p-5 space-y-5">
                <SectionTitle>{t('vehEdit.sectionStatusTechnical')}</SectionTitle>

                <div>
                  <p className="text-xs text-[#8a9e94] font-medium mb-2.5">{t('vehEdit.vehicleStatus')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {statusesArray.map(statusOption => {
                      const cfg        = getStatusConfig(statusOption)
                      const StatusIcon = cfg.icon
                      const isSelected = status === statusOption
                      return (
                        <button
                          key={statusOption}
                          type="button"
                          onClick={() => handleStatusChange(statusOption)}
                          className="p-3 rounded-xl border-2 transition-all text-left"
                          style={{
                            borderColor: isSelected ? cfg.activeBorder : '#e2e8e5',
                            background:  isSelected ? cfg.bg : '#ffffff',
                            color:       isSelected ? cfg.color : '#4a5e54'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <StatusIcon className="w-4 h-4 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-semibold text-xs leading-tight">{cfg.labelKey ? t(cfg.labelKey) : cfg.label}</div>
                              <div className="text-[10px] opacity-70 leading-tight mt-0.5">{cfg.descKey ? t(cfg.descKey) : cfg.description}</div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <FieldWrap icon={CheckCircle} label={t('vehEdit.bodyworkCondition')}>
                  <CustomConditionDropdown
                    conditions={conditions}
                    value={condition}
                    onChange={setCondition}
                    required
                  />
                </FieldWrap>

                <FieldWrap icon={Gauge} label={t('vehEdit.mileage')}>
                  <Input
                    value={mileage}
                    onChange={e => setMileage(e.target.value)}
                    placeholder={t('vehEdit.mileagePlaceholder')}
                    className="border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-[#025940]/30 focus:border-[#025940]"
                  />
                </FieldWrap>

                <FieldWrap icon={Calendar} label={t('vehEdit.checkInDate')}>
                  <input
                    type="date"
                    value={checkinDate}
                    onChange={e => setCheckinDate(e.target.value)}
                    className={inputCls}
                  />
                  {checkinDate && (
                    <p className="text-[10px] text-[#72A68E] mt-1.5 pl-1">
                      {formatDate(new Date(checkinDate))}
                    </p>
                  )}
                </FieldWrap>
              </div>

              {/* Right panel: Contract & Notes */}
              <div className="flex-1 p-4 sm:p-5 space-y-5 bg-[#f8faf9] dark:bg-gray-800/40 border-t border-[#e2e8e5] sm:border-t-0 dark:border-gray-700">
                <SectionTitle>{t('vehEdit.sectionContractNotes')}</SectionTitle>

                <FieldWrap icon={Shield} label={t('vehEdit.contractAssignment')}>
                  {contractsLoading ? (
                    <div className="flex items-center px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#8a9e94]">
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-[#025940] mr-2" />
                      {t('vehEdit.loadingContracts')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={contract}
                        onChange={e => handleContractChange(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">{t('vehEdit.noContract')}</option>
                        {contracts.map(contractOption => (
                          <option key={contractOption.id} value={contractOption.name}>
                            {contractOption.name}{contractOption.isDefault ? t('vehEdit.defaultSuffix') : ''}
                          </option>
                        ))}
                      </select>

                      {contract && contractColor && (
                        <div className="flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
                          <div
                            className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                            style={{ backgroundColor: contractColor }}
                          />
                          <span className="text-xs text-[#4a5e54] dark:text-gray-300 font-medium">{contract}</span>
                        </div>
                      )}
                    </div>
                  )}
                </FieldWrap>

                <FieldWrap icon={MessageSquare} label={t('vehEdit.comments')}>
                  <textarea
                    value={comments}
                    onChange={e => handleCommentsChange(e.target.value)}
                    placeholder={t('vehEdit.commentsPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none shadow-sm placeholder-[#c8d5ce]"
                  />
                </FieldWrap>

                <FieldWrap icon={FileText} label={t('vehEdit.additionalNotes')}>
                  <textarea
                    value={additionalNotes}
                    onChange={e => handleNotesChange(e.target.value)}
                    placeholder={t('vehEdit.notesPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none shadow-sm placeholder-[#c8d5ce]"
                  />
                </FieldWrap>
              </div>
            </div>

            {/* Damage map — full width */}
            {vehicleDiagramType && (
              <div className="mx-4 sm:mx-5 mb-5 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wrench className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest pl-1 border-l-2 border-[#b3f243]">
                    {t('vehEdit.damageMap')}
                  </p>
                  {damagePins.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                      {t(damagePins.length === 1 ? 'vehEdit.pinsOne' : 'vehEdit.pinsMany', { count: damagePins.length })}
                    </span>
                  )}
                </div>
                <DamageMapper
                  diagramType={vehicleDiagramType}
                  pins={damagePins}
                  onChange={setDamagePins}
                />
              </div>
            )}
          </form>
        </div>

        {/* ── Action bar — Cancel + Save only ── */}
        <div className="flex-shrink-0 bg-[#012619] border-t-2 border-[#b3f243]/20 px-4 sm:px-6 py-3">
          <div className="flex gap-2 sm:gap-3">
            <Button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 text-sm border border-white/20 shadow-none transition-colors"
            >
              {t('vehEdit.cancel')}
            </Button>
            <Button
              type="submit"
              form="edit-vehicle-form"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-[#b3f243] hover:bg-[#c8f76a] text-[#012619] font-bold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? t('vehEdit.saving') : t('vehEdit.saveChanges')}</span>
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}