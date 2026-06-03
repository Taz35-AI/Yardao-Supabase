// src/components/common/Modals/FleetAlerts.tsx - Fleet Alerts Component

'use client'

import { AlertCircle, CheckCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'

interface FleetAlertsProps {
  error: string | null
  success: string | null
  onClearError: () => void
  onClearSuccess: () => void
}

export function FleetAlerts({ error, success, onClearError, onClearSuccess }: FleetAlertsProps) {
  const t = useT()
  if (!error && !success) return null

  return (
    <div className="mb-4 space-y-3">
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start justify-between">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                {t('fleet.alerts.errorHeading')}
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          </div>
          <Button
            onClick={onClearError}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-800/50"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start justify-between">
          <div className="flex items-start">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                {t('fleet.alerts.successHeading')}
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                {success}
              </p>
            </div>
          </div>
          <Button
            onClick={onClearSuccess}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-800/50"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}