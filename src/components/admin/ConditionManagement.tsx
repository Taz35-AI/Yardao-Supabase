'use client'

import React, { useState } from 'react'
import { useConditionManagement } from '@/hooks/useConditionManagement'
import { Input } from '@/components/ui/Input'
import {
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  Check,
  X,
  AlertTriangle
} from 'lucide-react'
import { ConditionCategory } from '@/lib/conditionService'
import { useT } from '@/lib/i18n'

interface ColorOption {
  value: string
  label: string
  class: string
}

const colorOptions: ColorOption[] = [
  // Greens
  { value: '#065f46', label: 'Dark Green', class: 'bg-emerald-800' },
  { value: '#10b981', label: 'Emerald', class: 'bg-emerald-500' },
  { value: '#22c55e', label: 'Green', class: 'bg-green-500' },
  { value: '#84cc16', label: 'Lime', class: 'bg-lime-500' },
  
  // Yellows/Oranges
  { value: '#fbbf24', label: 'Yellow', class: 'bg-yellow-400' },
  { value: '#f59e0b', label: 'Amber', class: 'bg-amber-500' },
  { value: '#f97316', label: 'Orange', class: 'bg-orange-500' },
  { value: '#ea580c', label: 'Dark Orange', class: 'bg-orange-600' },
  
  // Reds
  { value: '#ef4444', label: 'Red', class: 'bg-red-500' },
  { value: '#dc2626', label: 'Dark Red', class: 'bg-red-600' },
  { value: '#991b1b', label: 'Crimson', class: 'bg-red-800' },
  
  // Blues
  { value: '#3b82f6', label: 'Blue', class: 'bg-blue-500' },
  { value: '#1d4ed8', label: 'Dark Blue', class: 'bg-blue-700' },
  { value: '#0ea5e9', label: 'Sky Blue', class: 'bg-sky-500' },
  { value: '#06b6d4', label: 'Cyan', class: 'bg-cyan-500' },
  
  // Purples
  { value: '#8b5cf6', label: 'Purple', class: 'bg-purple-500' },
  { value: '#7c3aed', label: 'Violet', class: 'bg-violet-600' },
  { value: '#a855f7', label: 'Light Purple', class: 'bg-purple-500' },
  { value: '#ec4899', label: 'Pink', class: 'bg-pink-500' },
  
  // Neutrals
  { value: '#6b7280', label: 'Gray', class: 'bg-gray-500' },
  { value: '#4b5563', label: 'Dark Gray', class: 'bg-gray-600' },
  { value: '#374151', label: 'Charcoal', class: 'bg-gray-700' },
  { value: '#1f2937', label: 'Dark Charcoal', class: 'bg-gray-800' }
]

const severityOptions = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'critical', label: 'Critical' },
  { value: 'non-operational', label: 'Non-Operational' }
]

export function ConditionManagement() {
  const t = useT()
  const sevLabel = (v: string) =>
    t(
      'settings.severity.' +
        (({
          excellent: 'excellent',
          good: 'good',
          fair: 'fair',
          poor: 'poor',
          critical: 'critical',
          'non-operational': 'nonOperational',
        } as any)[v] || 'good'),
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
  const {
    conditions,
    loading, 
    error, 
    addCondition, 
    updateCondition, 
    deleteCondition,
    reorderConditions 
  } = useConditionManagement()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    color: string
    severity: ConditionCategory['severity']
  }>({ name: '', color: '', severity: 'good' })

  const [newCondition, setNewCondition] = useState({
    name: '',
    color: '#6b7280',
    severity: 'good' as ConditionCategory['severity']
  })

  const [draggedItem, setDraggedItem] = useState<ConditionCategory | null>(null)

  const handleEdit = (condition: ConditionCategory) => {
    setEditingId(condition.id)
    setEditForm({
      name: condition.name,
      color: condition.color,
      severity: condition.severity
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return

    try {
      await updateCondition(editingId, editForm)
      setEditingId(null)
      setEditForm({ name: '', color: '', severity: 'good' })
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.condition.updateFail'))
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({ name: '', color: '', severity: 'good' })
  }

  const handleAddCondition = async () => {
    if (!newCondition.name.trim()) return

    try {
      await addCondition(newCondition.name, newCondition.color, newCondition.severity)
      setNewCondition({ name: '', color: '#6b7280', severity: 'good' })
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.condition.addFail'))
    }
  }

  const handleDelete = async (conditionId: string) => {
    if (!confirm(t('settings.condition.confirmDelete'))) {
      return
    }

    try {
      await deleteCondition(conditionId)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.condition.deleteFail'))
    }
  }

  const handleDragStart = (e: React.DragEvent, condition: ConditionCategory) => {
    setDraggedItem(condition)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, targetCondition: ConditionCategory) => {
    e.preventDefault()
    
    if (!draggedItem || draggedItem.id === targetCondition.id) {
      setDraggedItem(null)
      return
    }

    const newConditions = [...conditions]
    const draggedIndex = newConditions.findIndex(c => c.id === draggedItem.id)
    const targetIndex = newConditions.findIndex(c => c.id === targetCondition.id)

    // Remove dragged item and insert at target position
    newConditions.splice(draggedIndex, 1)
    newConditions.splice(targetIndex, 0, draggedItem)

    try {
      await reorderConditions(newConditions)
      setDraggedItem(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.condition.reorderFail'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl px-4 sm:px-6 py-6">
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-red-700 dark:text-red-300 leading-relaxed">{error}</p>
        </div>
      </div>
    )
  }

  // ─── shared classes (same fonts/inputs across all org settings tabs) ───────
  const inputCls = 'w-full h-9 px-3 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]'
  const labelCls = 'block text-[11px] uppercase tracking-widest font-semibold text-[#8a9e94] mb-1.5'

  const ColourStrip = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {colorOptions.map((color) => {
        const selected = value === color.value
        return (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            title={colLabel(color.label)}
            className={`relative w-5 h-5 rounded-md transition-all ${
              selected
                ? 'ring-2 ring-offset-1 ring-[#025940] dark:ring-offset-gray-900'
                : 'hover:scale-110'
            }`}
            style={{ backgroundColor: color.value }}
          >
            {selected && <Check className="w-3 h-3 mx-auto text-white drop-shadow" strokeWidth={3.5} />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">
      {/* Section heading */}
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
          {t('settings.condition.heading')}
        </h3>
        <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
          {t(conditions.length === 1 ? 'settings.condition.subtitleOne' : 'settings.condition.subtitleMany', { count: conditions.length })}
        </p>
      </div>

      {/* Add new condition — inline toolbar */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <Input
            placeholder={t('settings.condition.namePlaceholder')}
            value={newCondition.name}
            onChange={(e) => setNewCondition(prev => ({ ...prev, name: e.target.value }))}
            onKeyPress={(e) => { if (e.key === 'Enter') handleAddCondition() }}
            className="h-9 text-sm flex-1 border-[#e2e8e5]"
          />
          <select
            value={newCondition.severity}
            onChange={(e) => setNewCondition(prev => ({
              ...prev,
              severity: e.target.value as ConditionCategory['severity'],
            }))}
            className="h-9 px-3 pr-8 text-sm rounded-lg border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 text-[#012619] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] sm:w-44 cursor-pointer"
          >
            {severityOptions.map((option) => (
              <option key={option.value} value={option.value}>{sevLabel(option.value)}</option>
            ))}
          </select>
          <button
            onClick={handleAddCondition}
            disabled={!newCondition.name.trim()}
            className="h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            {t('settings.common.add')}
          </button>
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-[#e2e8e5] dark:border-gray-700">
          <span className="text-[11px] uppercase tracking-widest text-[#8a9e94] font-semibold mr-1">{t('settings.condition.colour')}</span>
          <ColourStrip
            value={newCondition.color}
            onChange={(v) => setNewCondition(prev => ({ ...prev, color: v }))}
          />
        </div>
      </div>

      {/* Conditions list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {conditions.length === 0 ? (
          <div className="text-center py-12 px-6">
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.condition.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.condition.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {conditions.map((condition) => (
              <li
                key={condition.id}
                draggable
                onDragStart={(e) => handleDragStart(e, condition)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, condition)}
                className={`group ${draggedItem?.id === condition.id ? 'opacity-50' : ''}`}
              >
                {editingId === condition.id ? (
                  /* Inline edit */
                  <div className="p-3 sm:p-4 bg-[#f5f9f7] dark:bg-gray-800/40 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        onKeyPress={(e) => { if (e.key === 'Enter') handleSaveEdit() }}
                        className="h-9 text-sm flex-1 border-[#e2e8e5]"
                        autoFocus
                      />
                      <select
                        value={editForm.severity}
                        onChange={(e) => setEditForm(prev => ({
                          ...prev,
                          severity: e.target.value as ConditionCategory['severity'],
                        }))}
                        className="h-9 px-3 pr-8 text-sm rounded-lg border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 text-[#012619] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] sm:w-44 cursor-pointer"
                      >
                        {severityOptions.map((option) => (
                          <option key={option.value} value={option.value}>{sevLabel(option.value)}</option>
                        ))}
                      </select>
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
                          className="h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          {t('settings.common.cancel')}
                        </button>
                      </div>
                    </div>
                    <ColourStrip
                      value={editForm.color}
                      onChange={(v) => setEditForm(prev => ({ ...prev, color: v }))}
                    />
                  </div>
                ) : (
                  /* View mode — dense row */
                  <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors cursor-move">
                    <GripVertical className="w-3.5 h-3.5 text-[#c8d5ce] flex-shrink-0" />
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: condition.color }}
                    />
                    <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate flex-1 min-w-0">
                      {condition.name}
                    </span>

                    <span className="text-[11px] text-[#8a9e94] capitalize hidden sm:inline">
                      {sevLabel(condition.severity)}
                    </span>
                    <span className="text-[11px] text-[#c8d5ce] font-mono hidden sm:inline">
                      #{condition.order}
                    </span>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {condition.isEditable ? (
                        <>
                          <button
                            onClick={() => handleEdit(condition)}
                            aria-label={t('settings.condition.editCondition')}
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-[#025940] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(condition.id)}
                            aria-label={t('settings.condition.deleteCondition')}
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#C5D9D0]/40 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]">
                          {t('settings.condition.locked')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}