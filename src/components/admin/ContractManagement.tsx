// src/components/admin/ContractManagement.tsx - Professional Mobile & Desktop Design
'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { contractService } from '@/lib/contractService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { isAdminRole } from '@/lib/permissions'
import { Contract, UserProfile, VehicleStatus, VEHICLE_STATUSES } from '@/types'
import { settingsService, ContractDefaultStatuses } from '@/lib/services/settingsService'
import { Plus, Edit2, Trash2, FileText, AlertCircle, Check } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'

// Available contract colors - EXPANDED to 18 colors (ORIGINAL 9 + 9 NEW DISTINCT)
const CONTRACT_COLORS = [
  // ORIGINAL 9 COLORS - PRESERVED
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', text: 'text-white' },
  { name: 'Green', value: '#10b981', bg: 'bg-emerald-500', text: 'text-white' },
  { name: 'Purple', value: '#8b5cf6', bg: 'bg-violet-500', text: 'text-white' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', text: 'text-white' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500', text: 'text-white' },
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500', text: 'text-white' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-500', text: 'text-black' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500', text: 'text-white' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500', text: 'text-white' },
  
  // 9 NEW BOLD DISTINCT COLORS - NO SIMILAR SHADES
  { name: 'Neon Green', value: '#00FF00', bg: 'bg-green-400', text: 'text-black' },
  { name: 'Hot Magenta', value: '#FF00FF', bg: 'bg-fuchsia-600', text: 'text-white' },
  { name: 'Gold', value: '#FFD700', bg: 'bg-yellow-400', text: 'text-black' },
  { name: 'Navy Blue', value: '#000080', bg: 'bg-blue-900', text: 'text-white' },
  { name: 'Crimson', value: '#DC143C', bg: 'bg-red-700', text: 'text-white' },
  { name: 'Lime', value: '#BFFF00', bg: 'bg-lime-400', text: 'text-black' },
  { name: 'Turquoise', value: '#00CED1', bg: 'bg-cyan-400', text: 'text-black' },
  { name: 'Maroon', value: '#800000', bg: 'bg-red-900', text: 'text-white' },
  { name: 'Charcoal', value: '#36454F', bg: 'bg-gray-700', text: 'text-white' }
]

export const ContractManagement = React.memo(function ContractManagement() {
  const t = useT()
  const vsLabel = (s: string) =>
    t(
      'settings.vehicleStatus.' +
        (({
          Ready: 'ready',
          'Pending checks': 'pendingChecks',
          'Repairs needed': 'repairsNeeded',
          'Non-Starter': 'nonStarter',
        } as any)[s] || 'ready'),
    )
  const colLabel = (l: string) =>
    t(
      'settings.colour.' +
        (({
          Blue: 'blue',
          Green: 'green',
          Purple: 'purple',
          Pink: 'pink',
          Orange: 'orange',
          Red: 'red',
          Yellow: 'yellow',
          Indigo: 'indigo',
          Teal: 'teal',
          'Neon Green': 'neonGreen',
          'Hot Magenta': 'hotMagenta',
          Gold: 'gold',
          'Navy Blue': 'navyBlue',
          Crimson: 'crimson',
          Lime: 'lime',
          Turquoise: 'turquoise',
          Maroon: 'maroon',
          Charcoal: 'charcoal',
        } as any)[l] || ''),
    )
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [newContract, setNewContract] = useState({ 
    name: '', 
    color: CONTRACT_COLORS[0].value 
  })
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [contractDefaults, setContractDefaults] = useState<ContractDefaultStatuses>({})
  const [savingDefaultFor, setSavingDefaultFor] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Contract | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load user profile, contracts and per-contract default statuses
  useEffect(() => {
    const loadData = async () => {
      if (!user) return

      try {
        setLoading(true)

        // Load user profile
        const profile = await userProfileService.getProfile(user.uid)
        setUserProfile(profile)

        if (profile?.organizationId) {
          const [contractsList, defaults] = await Promise.all([
            contractService.getContracts(profile.organizationId),
            settingsService.getContractDefaultStatuses(profile.organizationId),
          ])
          setContracts(contractsList)
          setContractDefaults(defaults)
        }
      } catch (error) {
        logger.error('Error loading contracts:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user])

  const handleDefaultStatusChange = async (contractId: string, status: VehicleStatus | '') => {
    if (!userProfile?.organizationId) return

    const next: ContractDefaultStatuses = { ...contractDefaults }
    if (status === '') {
      delete next[contractId]
    } else {
      next[contractId] = status
    }

    setContractDefaults(next)
    setSavingDefaultFor(contractId)
    try {
      await settingsService.saveContractDefaultStatuses(userProfile.organizationId, next)
    } catch (error) {
      logger.error('Error saving contract default status:', error)
      alert(t('settings.contract.saveDefaultFail'))
      setContractDefaults(contractDefaults)
    } finally {
      setSavingDefaultFor(null)
    }
  }

  const handleAddContract = async () => {
    if (!newContract.name.trim() || !userProfile?.organizationId || !user) return

    try {
      const contract = await contractService.addContract({
        name: newContract.name.trim(),
        color: newContract.color,
        organizationId: userProfile.organizationId,
        isDefault: false,
        createdBy: user.uid
      })

      setContracts(prev => [...prev, contract])
      setNewContract({ name: '', color: CONTRACT_COLORS[0].value })
    } catch (error) {
      logger.error('Error adding contract:', error)
      alert(t('settings.contract.addFail'))
    }
  }

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract)
    setEditName(contract.name)
    setEditColor(contract.color || CONTRACT_COLORS[0].value)
  }

  const handleSaveEdit = async () => {
    if (!editingContract || !editName.trim()) return

    try {
      await contractService.updateContract(editingContract.id, {
        name: editName.trim(),
        color: editColor
      })

      setContracts(prev => 
        prev.map(contract => 
          contract.id === editingContract.id 
            ? { ...contract, name: editName.trim(), color: editColor }
            : contract
        )
      )
      
      setEditingContract(null)
      setEditName('')
      setEditColor('')
    } catch (error) {
      logger.error('Error updating contract:', error)
      alert(t('settings.contract.updateFail'))
    }
  }

  const handleDeleteContract = (contract: Contract) => {
    if (contract.isDefault) {
      alert(t('settings.contract.cannotDeleteDefault'))
      return
    }
    // Open the styled confirmation modal (no native window.confirm).
    setPendingDelete(contract)
  }

  const confirmDeleteContract = async () => {
    const contract = pendingDelete
    if (!contract) return

    setDeleting(true)
    try {
      await contractService.deleteContract(contract.id)
      setContracts(prev => prev.filter(c => c.id !== contract.id))

      if (contractDefaults[contract.id] && userProfile?.organizationId) {
        const next = { ...contractDefaults }
        delete next[contract.id]
        setContractDefaults(next)
        try {
          await settingsService.saveContractDefaultStatuses(userProfile.organizationId, next)
        } catch (e) {
          logger.error('Error clearing default status for deleted contract:', e)
        }
      }
      setPendingDelete(null)
    } catch (error) {
      logger.error('Error deleting contract:', error)
      alert(t('settings.contract.deleteFail'))
    } finally {
      setDeleting(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingContract(null)
    setEditName('')
    setEditColor('')
  }

  const getContractColorStyle = (color?: string) => {
    if (!color) return { backgroundColor: CONTRACT_COLORS[0].value }
    return { backgroundColor: color }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  if (!isAdminRole(userProfile?.role)) {
    return (
      <div className="max-w-4xl px-4 sm:px-6 py-6">
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">{t('settings.common.accessRestricted')}</p>
            <p className="text-[12.5px] text-amber-700 dark:text-amber-400 mt-0.5">{t('settings.contract.accessBody')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">
      {/* Section heading */}
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
            {t('settings.contract.heading')}
          </h3>
          <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
            {t(contracts.length === 1 ? 'settings.contract.subtitleOne' : 'settings.contract.subtitleMany', { count: contracts.length })}
          </p>
        </div>
      </div>

      {/* Add new contract — inline toolbar */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <Input
            placeholder={t('settings.contract.namePlaceholder')}
            value={newContract.name}
            onChange={(e) => setNewContract({ ...newContract, name: e.target.value })}
            onKeyPress={(e) => { if (e.key === 'Enter') handleAddContract() }}
            className="h-9 text-sm flex-1 border-[#e2e8e5]"
          />
          <Button
            onClick={handleAddContract}
            disabled={!newContract.name.trim()}
            className="h-9 px-4 text-[13px] font-medium bg-[#025940] hover:bg-[#012619] text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
            {t('settings.common.add')}
          </Button>
        </div>

        {/* Inline colour strip */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#e2e8e5] dark:border-gray-700">
          <span className="text-[11px] uppercase tracking-widest text-[#8a9e94] font-semibold mr-1">{t('settings.contract.colour')}</span>
          <div className="flex flex-wrap gap-1.5">
            {CONTRACT_COLORS.map((color) => {
              const selected = newContract.color === color.value
              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setNewContract({ ...newContract, color: color.value })}
                  title={colLabel(color.name)}
                  className={`relative w-5 h-5 rounded-md transition-all ${
                    selected
                      ? 'ring-2 ring-offset-1 ring-[#025940] dark:ring-offset-gray-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color.value }}
                >
                  {selected && <Check className={`w-3 h-3 mx-auto ${color.text}`} strokeWidth={3.5} />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Contracts list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {contracts.length === 0 ? (
          <div className="text-center py-12 px-6">
            <FileText className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.contract.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.contract.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {contracts.map((contract) => (
              <li key={contract.id} className="group">
                {editingContract?.id === contract.id ? (
                  /* Inline edit mode */
                  <div className="p-3 sm:p-4 bg-[#f5f9f7] dark:bg-gray-800/40 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyPress={(e) => { if (e.key === 'Enter') handleSaveEdit() }}
                        className="h-9 text-sm flex-1 border-[#e2e8e5]"
                        autoFocus
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleSaveEdit}
                          className="h-9 px-3 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] text-white inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Check className="w-4 h-4" strokeWidth={2.5} />
                          {t('settings.common.save')}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors"
                        >
                          {t('settings.common.cancel')}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-0.5">
                      {CONTRACT_COLORS.map((color) => {
                        const selected = editColor === color.value
                        return (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => setEditColor(color.value)}
                            title={colLabel(color.name)}
                            className={`relative w-5 h-5 rounded-md transition-all ${
                              selected
                                ? 'ring-2 ring-offset-1 ring-[#025940] dark:ring-offset-gray-900'
                                : 'hover:scale-110'
                            }`}
                            style={{ backgroundColor: color.value }}
                          >
                            {selected && <Check className={`w-3 h-3 mx-auto ${color.text}`} strokeWidth={3.5} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  /* View mode — single dense row */
                  <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                      style={getContractColorStyle(contract.color)}
                    />

                    <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate flex-1 min-w-0">
                      {contract.name}
                    </span>

                    {contract.isDefault && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#C5D9D0]/40 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]">
                        {t('settings.contract.defaultBadge')}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="hidden sm:inline text-[11px] text-[#8a9e94]">{t('settings.contract.checkInAs')}</span>
                      <select
                        value={contractDefaults[contract.id] ?? ''}
                        onChange={(e) =>
                          handleDefaultStatusChange(contract.id, e.target.value as VehicleStatus | '')
                        }
                        disabled={savingDefaultFor === contract.id}
                        className="h-7 pl-2 pr-6 rounded-md border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-800 text-[12px] font-medium text-[#012619] dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] cursor-pointer"
                      >
                        <option value="">{t('settings.vehicleStatus.pendingChecks')}</option>
                        {VEHICLE_STATUSES.map((s) => (
                          <option key={s} value={s}>{vsLabel(s)}</option>
                        ))}
                      </select>
                      {savingDefaultFor === contract.id && (
                        <span className="text-[10px] text-[#8a9e94] w-10">{t('settings.contract.savingInline')}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleEditContract(contract)}
                        aria-label={t('settings.contract.editContract')}
                        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-[#025940] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!contract.isDefault && (
                        <button
                          onClick={() => handleDeleteContract(contract)}
                          aria-label={t('settings.contract.deleteContract')}
                          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={!!pendingDelete}
        onClose={() => { if (!deleting) setPendingDelete(null) }}
        onConfirm={confirmDeleteContract}
        title={t('settings.contract.deleteContract')}
        message={pendingDelete ? t('settings.contract.confirmDelete', { name: pendingDelete.name }) : ''}
        confirmText={t('settings.contract.deleteContract')}
        variant="danger"
        loading={deleting}
      />
    </div>
  )
})