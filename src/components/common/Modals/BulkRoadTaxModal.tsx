// src/components/common/Modals/BulkRoadTaxModal.tsx
'use client'

import React, { useState } from 'react'
import { X, Calendar, Car, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FleetVehicle } from '@/types'
import { useT } from '@/lib/i18n'

interface BulkRoadTaxModalProps {
  isOpen: boolean
  onClose: () => void
  selectedVehicles: FleetVehicle[]
  onConfirm: (taxExpiry: string) => Promise<void>
}

export function BulkRoadTaxModal({
  isOpen,
  onClose,
  selectedVehicles,
  onConfirm
}: BulkRoadTaxModalProps) {
  const t = useT()
  const [taxExpiry, setTaxExpiry] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!taxExpiry) {
      setError(t('fleet.bulkRoadTax.errorNoDate'))
      return
    }

    // Validate date is in the future
    const selectedDate = new Date(taxExpiry)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (selectedDate < today) {
      setError(t('fleet.bulkRoadTax.errorPastDate'))
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onConfirm(taxExpiry)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fleet.bulkRoadTax.errorUpdateFailed'))
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setTaxExpiry('')
      setError(null)
      onClose()
    }
  }

  // Get today's date in YYYY-MM-DD format for min attribute
  const getTodayDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  // Get 2 years from today as a reasonable max date
  const getMaxDate = () => {
    const maxDate = new Date()
    maxDate.setFullYear(maxDate.getFullYear() + 2)
    return maxDate.toISOString().split('T')[0]
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl 
                     transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 
                          px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {t('fleet.bulkRoadTax.title')}
                  </h2>
                  <p className="text-sm text-blue-100 mt-0.5">
                    {t('fleet.bulkRoadTax.headerSubtitle', { count: selectedVehicles.length })}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Selected Vehicles Summary */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 
                            dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Car className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    {t('fleet.bulkRoadTax.selectedVehiclesHeading', { count: selectedVehicles.length })}
                  </h3>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {selectedVehicles.slice(0, 10).map((vehicle, index) => (
                      <div 
                        key={vehicle.id}
                        className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2"
                      >
                        <span className="w-6 text-right text-blue-500 dark:text-blue-500">
                          {index + 1}.
                        </span>
                        <span className="font-medium">{vehicle.registration}</span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {vehicle.make} {vehicle.model}
                        </span>
                        {vehicle.taxExpiry && (
                          <span className="text-blue-500 dark:text-blue-500 text-xs ml-auto">
                            {t('fleet.bulkRoadTax.currentExpiry', { date: new Date(vehicle.taxExpiry).toLocaleDateString('en-GB') })}
                          </span>
                        )}
                      </div>
                    ))}
                    {selectedVehicles.length > 10 && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 italic mt-2">
                        {t('fleet.bulkRoadTax.moreVehicles', { count: selectedVehicles.length - 10 })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Date Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 
                                dark:text-gray-300">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                {t('fleet.bulkRoadTax.dateLabel')}
              </label>
              <Input
                type="date"
                value={taxExpiry}
                onChange={(e) => {
                  setTaxExpiry(e.target.value)
                  setError(null)
                }}
                min={getTodayDate()}
                max={getMaxDate()}
                required
                className="w-full text-base"
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('fleet.bulkRoadTax.dateHint')}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 
                              border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Info Message */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 
                            border border-amber-200 dark:border-amber-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t('fleet.bulkRoadTax.infoMessage', { count: selectedVehicles.length })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                disabled={isSubmitting}
                className="flex-1"
              >
                {t('fleet.bulkRoadTax.cancelBtn')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !taxExpiry}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('fleet.bulkRoadTax.updatingBtn')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {t('fleet.bulkRoadTax.updateBtn', { count: selectedVehicles.length })}
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}