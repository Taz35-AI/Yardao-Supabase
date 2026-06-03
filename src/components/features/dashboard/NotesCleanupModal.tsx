// src/components/features/dashboard/NotesCleanupModal.tsx - Custom Palette
'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { useNotesCleanup } from '@/hooks/features/useNotesCleanup'
import { NotesCleanupOperation } from '@/services/notesCleanupService'
import { useT } from '@/lib/i18n'
import { 
  X, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Eye,
  Play,
  RotateCcw,
  Sparkles // Using Sparkles icon to represent cleaning/cleanup
} from 'lucide-react'

interface NotesCleanupModalProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  onSuccess: () => void
}

export const NotesCleanupModal: React.FC<NotesCleanupModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  onSuccess
}) => {
  const t = useT()
  const [targetText, setTargetText] = useState('')
  const [mode, setMode] = useState<NotesCleanupOperation['mode']>('contains')
  const [action, setAction] = useState<NotesCleanupOperation['action']>('remove_word')
  const [selectedFields, setSelectedFields] = useState<('notes' | 'comments')[]>(['notes'])
  const [step, setStep] = useState<'configure' | 'preview' | 'results'>('configure')

  const {
    isOperationRunning,
    previewResults,
    isPreviewLoading,
    lastOperationResult,
    previewCleanup,
    executeCleanup,
    clearPreview,
    clearLastResult
  } = useNotesCleanup(organizationId)

  const handleFieldToggle = (field: 'notes' | 'comments') => {
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    )
  }

  const handlePreview = async () => {
    if (!targetText.trim() || selectedFields.length === 0) {
      alert(t('dashboard.notesCleanup.alertSelectField'))
      return
    }

    try {
      const operation: NotesCleanupOperation = {
        targetText: targetText.trim(),
        mode,
        fields: selectedFields,
        action
      }
      
      await previewCleanup(operation)
      setStep('preview')
    } catch (error) {
      const errorMsg = t('dashboard.notesCleanup.previewFailed', {
        error: error instanceof Error ? error.message : t('dashboard.notesCleanup.unknownError'),
      })
      alert(errorMsg)
    }
  }

  const handleExecute = async () => {
    if (!targetText.trim() || selectedFields.length === 0) {
      return
    }

    const confirmMessage = t('dashboard.notesCleanup.confirmExecute', {
      actionText:
        action === 'clear_field'
          ? t('dashboard.notesCleanup.actionClearFields')
          : t('dashboard.notesCleanup.actionRemoveText'),
      count: previewResults.length,
    })
    
    const confirmed = window.confirm(confirmMessage)

    if (!confirmed) return

    try {
      const operation: NotesCleanupOperation = {
        targetText: targetText.trim(),
        mode,
        fields: selectedFields,
        action
      }
      
      await executeCleanup(operation)
      setStep('results')
      onSuccess() // Refresh the dashboard data
    } catch (error) {
      const errorMsg = t('dashboard.notesCleanup.operationFailed', {
        error: error instanceof Error ? error.message : t('dashboard.notesCleanup.unknownError'),
      })
      alert(errorMsg)
    }
  }

  const handleReset = () => {
    setTargetText('')
    setMode('contains')
    setAction('remove_word')
    setSelectedFields(['notes'])
    setStep('configure')
    clearPreview()
    clearLastResult()
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div 
        className="bg-white dark:bg-[#0D0D0D] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#025940] dark:bg-[#012619] text-white p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
              <h2 className="text-lg sm:text-xl font-bold">{t('dashboard.notesCleanup.title')}</h2>
            </div>
            <Button
              onClick={handleClose}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 p-1 sm:p-2"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>
          
          {/* Step Indicator */}
          <div className="flex items-center justify-center space-x-2 sm:space-x-4 mt-4">
            <div className={`flex items-center space-x-1 sm:space-x-2 ${step === 'configure' ? 'text-white' : 'text-white/60'}`}>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'configure' ? 'bg-white text-[#025940]' : 'bg-white/20'}`}>
                1
              </div>
              <span className="text-xs sm:text-sm font-medium">{t('dashboard.notesCleanup.stepConfigure')}</span>
            </div>
            <div className="w-4 sm:w-8 h-px bg-white/30"></div>
            <div className={`flex items-center space-x-1 sm:space-x-2 ${step === 'preview' ? 'text-white' : 'text-white/60'}`}>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'preview' ? 'bg-white text-[#025940]' : 'bg-white/20'}`}>
                2
              </div>
              <span className="text-xs sm:text-sm font-medium">{t('dashboard.notesCleanup.stepPreview')}</span>
            </div>
            <div className="w-4 sm:w-8 h-px bg-white/30"></div>
            <div className={`flex items-center space-x-1 sm:space-x-2 ${step === 'results' ? 'text-white' : 'text-white/60'}`}>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'results' ? 'bg-white text-[#025940]' : 'bg-white/20'}`}>
                3
              </div>
              <span className="text-xs sm:text-sm font-medium">{t('dashboard.notesCleanup.stepResults')}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto">
          {step === 'configure' && (
            <div className="space-y-6">
              {/* Warning */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                      {t('dashboard.notesCleanup.warningTitle')}
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      {t('dashboard.notesCleanup.warningBody')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Search Configuration */}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="font-semibold mb-4 flex items-center space-x-2 text-[#025940] dark:text-[#72A68E]">
                    <Search className="w-5 h-5" />
                    <span>{t('dashboard.notesCleanup.searchConfig')}</span>
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Target Text */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[#025940] dark:text-[#72A68E]">
                        {t('dashboard.notesCleanup.textToFind')}
                      </label>
                      <input
                        type="text"
                        value={targetText}
                        onChange={(e) => setTargetText(e.target.value)}
                        placeholder={t('dashboard.notesCleanup.textPlaceholder')}
                        className="w-full px-4 py-3 border border-[#72A68E] dark:border-[#025940] rounded-xl bg-white dark:bg-[#0D0D0D] text-[#025940] dark:text-[#C5D9D0] focus:ring-2 focus:ring-[#025940] focus:border-[#025940]"
                      />
                    </div>

                    {/* Search Mode */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[#025940] dark:text-[#72A68E]">
                        {t('dashboard.notesCleanup.searchMode')}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { value: 'word', label: t('dashboard.notesCleanup.modeWordLabel'), desc: t('dashboard.notesCleanup.modeWordDesc') },
                          { value: 'phrase', label: t('dashboard.notesCleanup.modePhraseLabel'), desc: t('dashboard.notesCleanup.modePhraseDesc') },
                          { value: 'contains', label: t('dashboard.notesCleanup.modeContainsLabel'), desc: t('dashboard.notesCleanup.modeContainsDesc') }
                        ].map((option) => (
                          <label key={option.value} className="cursor-pointer">
                            <input
                              type="radio"
                              value={option.value}
                              checked={mode === option.value}
                              onChange={(e) => setMode(e.target.value as any)}
                              className="sr-only"
                            />
                            <div className={`p-3 rounded-xl border-2 transition-all text-center ${
                              mode === option.value
                                ? 'border-[#025940] bg-[#C5D9D0]/30 dark:bg-[#025940]/20'
                                : 'border-[#72A68E] dark:border-[#025940] hover:border-[#025940]'
                            }`}>
                              <div className="font-medium text-sm text-[#025940] dark:text-[#72A68E]">{option.label}</div>
                              <div className="text-xs text-[#72A68E] dark:text-[#C5D9D0] mt-1">{option.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Action Type */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[#025940] dark:text-[#72A68E]">
                        {t('dashboard.notesCleanup.actionType')}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { value: 'remove_word', label: t('dashboard.notesCleanup.removeWordLabel'), desc: t('dashboard.notesCleanup.removeWordDesc') },
                          { value: 'clear_field', label: t('dashboard.notesCleanup.clearFieldLabel'), desc: t('dashboard.notesCleanup.clearFieldDesc') }
                        ].map((option) => (
                          <label key={option.value} className="cursor-pointer">
                            <input
                              type="radio"
                              value={option.value}
                              checked={action === option.value}
                              onChange={(e) => setAction(e.target.value as any)}
                              className="sr-only"
                            />
                            <div className={`p-3 rounded-xl border-2 transition-all text-center ${
                              action === option.value
                                ? 'border-[#025940] bg-[#C5D9D0]/30 dark:bg-[#025940]/20'
                                : 'border-[#72A68E] dark:border-[#025940] hover:border-[#025940]'
                            }`}>
                              <div className="font-medium text-sm text-[#025940] dark:text-[#72A68E]">{option.label}</div>
                              <div className="text-xs text-[#72A68E] dark:text-[#C5D9D0] mt-1">{option.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Target Fields */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-[#025940] dark:text-[#72A68E]">
                        {t('dashboard.notesCleanup.targetFields')}
                      </label>
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                        {[
                          { value: 'notes', label: t('dashboard.notesCleanup.fieldNotes') },
                          { value: 'comments', label: t('dashboard.notesCleanup.fieldComments') }
                        ].map((field) => (
                          <label key={field.value} className="flex items-center justify-center space-x-2 cursor-pointer p-3 border-2 rounded-xl transition-all hover:border-[#025940] border-[#72A68E] dark:border-[#025940]">
                            <input
                              type="checkbox"
                              checked={selectedFields.includes(field.value as any)}
                              onChange={() => handleFieldToggle(field.value as any)}
                              className="rounded border-[#72A68E] text-[#025940] focus:ring-[#025940]"
                            />
                            <span className="text-sm font-medium text-[#025940] dark:text-[#72A68E]">{field.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#025940] dark:text-[#72A68E]">{t('dashboard.notesCleanup.previewChanges')}</h3>
                <Button
                  onClick={() => setStep('configure')}
                  variant="outline"
                  size="sm"
                  className="border-[#72A68E] dark:border-[#025940] text-[#025940] dark:text-[#72A68E]"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {t('dashboard.notesCleanup.backToConfigure')}
                </Button>
              </div>

              {previewResults.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-[#72A68E] mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-[#025940] dark:text-[#72A68E]">{t('dashboard.notesCleanup.noChangesTitle')}</h3>
                  <p className="text-[#72A68E] dark:text-[#C5D9D0]">
                    {t('dashboard.notesCleanup.noChangesBody')}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="bg-[#C5D9D0]/30 dark:bg-[#025940]/20 border border-[#72A68E] dark:border-[#025940] rounded-xl p-4 mb-4">
                    <p className="font-medium text-[#025940] dark:text-[#72A68E]">
                      {t('dashboard.notesCleanup.willBeModified', { count: previewResults.length })}
                    </p>
                    <p className="text-sm text-[#72A68E] dark:text-[#C5D9D0] mt-1">
                      {t('dashboard.notesCleanup.actionSummary', {
                        actionText:
                          action === 'clear_field'
                            ? t('dashboard.notesCleanup.actionClearField')
                            : t('dashboard.notesCleanup.actionRemoveMatching'),
                        fields: selectedFields.join(' and '),
                      })}
                    </p>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {previewResults.map((vehicle) => (
                      <Card key={vehicle.id} className="border-[#72A68E] dark:border-[#025940]">
                        <CardContent className="p-4">
                          <div className="font-medium text-sm mb-2 text-[#025940] dark:text-[#72A68E]">{vehicle.registration}</div>
                          <div className="space-y-2">
                            {Object.entries(vehicle.changes).map(([field, change]: [string, any]) => (
                              <div key={field} className="text-xs">
                                <div className="font-medium text-[#72A68E] dark:text-[#C5D9D0] mb-1">
                                  {field.charAt(0).toUpperCase() + field.slice(1)}:
                                </div>
                                <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded text-red-800 dark:text-red-200 line-through">
                                  {change.from || t('dashboard.notesCleanup.emptyValue')}
                                </div>
                                <div className="bg-[#72A68E]/20 dark:bg-[#72A68E]/10 p-2 rounded text-[#025940] dark:text-[#72A68E] mt-1">
                                  {change.to || t('dashboard.notesCleanup.emptyValue')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'results' && lastOperationResult && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-[#72A68E] mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2 text-[#025940] dark:text-[#72A68E]">{t('dashboard.notesCleanup.operationCompleted')}</h3>
              </div>

              <Card className="border-[#72A68E] dark:border-[#025940]">
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[#025940] dark:text-[#72A68E]">{lastOperationResult.totalVehicles}</div>
                      <div className="text-sm text-[#72A68E] dark:text-[#C5D9D0]">{t('dashboard.notesCleanup.totalVehicles')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[#025940] dark:text-[#72A68E]">{lastOperationResult.modifiedVehicles}</div>
                      <div className="text-sm text-[#72A68E] dark:text-[#C5D9D0]">{t('dashboard.notesCleanup.modified')}</div>
                    </div>
                  </div>

                  {lastOperationResult.errors.length > 0 && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                      <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">{t('dashboard.notesCleanup.errors')}</h4>
                      <div className="text-sm text-red-600 dark:text-red-300 space-y-1">
                        {lastOperationResult.errors.map((error, index) => (
                          <div key={index}>• {error}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#C5D9D0]/20 dark:bg-[#012619] px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between gap-3">
          <Button
            onClick={handleClose}
            variant="outline"
            disabled={isOperationRunning || isPreviewLoading}
            className="w-full sm:w-auto border-[#72A68E] dark:border-[#025940] text-[#025940] dark:text-[#72A68E]"
          >
            {t('dashboard.common.close')}
          </Button>

          <div className="flex flex-col sm:flex-row gap-3">
            {step === 'configure' && (
              <Button
                onClick={handlePreview}
                disabled={!targetText.trim() || selectedFields.length === 0 || isPreviewLoading}
                className="bg-[#025940] hover:bg-[#72A68E] dark:bg-[#012619] dark:hover:bg-[#025940] w-full sm:w-auto"
              >
                {isPreviewLoading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    {t('dashboard.notesCleanup.loading')}
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    {t('dashboard.notesCleanup.previewChangesBtn')}
                  </>
                )}
              </Button>
            )}

            {step === 'preview' && previewResults.length > 0 && (
              <Button
                onClick={handleExecute}
                disabled={isOperationRunning}
                className="bg-[#025940] hover:bg-[#72A68E] dark:bg-[#012619] dark:hover:bg-[#025940] w-full sm:w-auto"
              >
                {isOperationRunning ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    {t('dashboard.notesCleanup.processing')}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    {t('dashboard.notesCleanup.executeChanges')}
                  </>
                )}
              </Button>
            )}

            {step === 'results' && (
              <Button
                onClick={handleReset}
                className="bg-[#72A68E] hover:bg-[#025940] dark:bg-[#025940] dark:hover:bg-[#72A68E] w-full sm:w-auto"
              >
                {t('dashboard.notesCleanup.startNewOperation')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}