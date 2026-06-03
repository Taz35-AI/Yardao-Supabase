// src/components/dialogs/InsuranceConfirmationDialog.tsx
'use client'

import React from 'react'
import { Shield, AlertCircle, X, CheckCircle } from 'lucide-react'

interface InsuranceConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  vehicleCount: number
  action: 'Insured' | 'Not Insured' | string
  loading?: boolean
}

export function InsuranceConfirmationDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  vehicleCount,
  action,
  loading = false
}: InsuranceConfirmationDialogProps) {
  
  if (!isOpen) return null

  // Prevent closing while loading
  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose()
    }
  }

  // Get action color and icon
  const isInsured = action === 'Insured'
  const actionColor = isInsured ? 'emerald' : 'red'
  const ActionIcon = isInsured ? Shield : AlertCircle

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={handleBackdropClick}
      >
        {/* Modal */}
        <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`p-2 ${isInsured ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'} rounded-lg`}>
                  <ActionIcon className={`w-5 h-5 ${isInsured ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Update Insurance Status
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    Confirm bulk status update
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-4 space-y-4">
              {/* Loading State - Show when processing */}
              {loading ? (
                <div className="py-8 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    {/* Large spinner */}
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                    
                    {/* Loading text */}
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        Processing bulk insurance update...
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Updating {vehicleCount} vehicle{vehicleCount !== 1 ? 's' : ''} and syncing to yard records
                      </p>
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                    </div>

                    {/* Status text */}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Please wait while we update all insurance statuses...
                    </p>
                  </div>
                </div>
              ) : (
                /* Confirmation State - Show when not processing */
                <>
                  {/* Summary */}
                  <div className="text-gray-700 dark:text-gray-300">
                    <p className="text-base">
                      You are about to mark{' '}
                      <span className={`font-semibold ${isInsured ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {vehicleCount} {vehicleCount === 1 ? 'vehicle' : 'vehicles'}
                      </span>{' '}
                      as{' '}
                      <span className={`font-semibold ${isInsured ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        "{action}"
                      </span>
                    </p>
                  </div>

                  {/* Details Box */}
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">This action will:</p>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className={`${isInsured ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} mt-0.5`}>•</span>
                        <span>Update the insurance status for all selected vehicles</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={`${isInsured ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} mt-0.5`}>•</span>
                        <span>Sync changes to any checked-in vehicles in the yard</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className={`${isInsured ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} mt-0.5`}>•</span>
                        <span>Update the fleet inventory immediately</span>
                      </li>
                    </ul>
                  </div>

                  {/* Warning */}
                  <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      This action will be logged and cannot be undone. Please ensure you've selected the correct vehicles.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer - Only show buttons when not loading */}
            {!loading && (
              <div className="flex gap-3 p-6 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className={`flex-1 px-4 py-2.5 bg-gradient-to-r ${isInsured ? 'from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700' : 'from-red-600 to-red-600 hover:from-red-700 hover:to-red-700'} text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm Update</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}