// src/components/fleet/form-fields/VehicleFormAlerts.tsx
'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'

interface VehicleFormAlertsProps {
  submitError: string | null
  duplicateError: boolean
  registration: string
}

export function VehicleFormAlerts({ submitError, duplicateError, registration }: VehicleFormAlertsProps) {
  return (
    <>
      {/* Info Banner */}
      <div className="mb-6 p-3 bg-gradient-to-r from-[#025940] to-[#012619] border border-[#025940] rounded-lg">
        <p className="text-sm text-white text-center">
          Enter vehicle details below. <span className="font-medium text-[#72A68E]">Registration is required</span> - other fields can be updated later.
        </p>
      </div>

      {/* Error Alert */}
      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                {submitError}
              </p>
              {submitError.includes('already exists') && (
                <p className="text-xs text-red-700 mt-1">
                  Please check the registration number for typos.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Error (real-time) */}
      {duplicateError && !submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Registration "{registration}" already exists in the fleet
              </p>
              <p className="text-xs text-red-700 mt-1">
                Each vehicle must have a unique registration number. Please check for typos.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}