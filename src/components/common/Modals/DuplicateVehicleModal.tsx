// src/components/common/Modals/DuplicateVehicleModal.tsx
'use client'

import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'

interface DuplicateVehicle {
  registration: string
  make?: string
  model?: string
}

interface DuplicateVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  duplicates: DuplicateVehicle[]
  totalCount: number
}

export function DuplicateVehicleModal({
  isOpen,
  onClose,
  onConfirm,
  duplicates,
  totalCount
}: DuplicateVehicleModalProps) {
  const t = useT()
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('fleet.duplicateModal.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            {t('fleet.duplicateModal.foundMessage', { count: totalCount })}
          </p>

          {/* Duplicate List */}
          <div className="max-h-64 overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
            {duplicates.slice(0, 10).map((vehicle, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
              >
                <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {vehicle.registration}
                  </p>
                  {(vehicle.make || vehicle.model) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {vehicle.make} {vehicle.model}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {totalCount > 10 && (
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
                {t('fleet.duplicateModal.andMore', { count: totalCount - 10 })}
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>{t('fleet.duplicateModal.noteLabel')}</strong> {t('fleet.duplicateModal.noteBody')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <Button
            variant="outline"
            onClick={onClose}
            className="min-w-24"
          >
            {t('fleet.duplicateModal.cancelBtn')}
          </Button>
          <Button
            onClick={onConfirm}
            className="min-w-24 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {t('fleet.duplicateModal.proceedBtn')}
          </Button>
        </div>
      </div>
    </div>
  )
}