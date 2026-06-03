// src/components/common/notifications/contractSyncNotification.tsx - FIXED mobile centering
'use client'

import React from 'react'
import { X, CheckCircle, AlertTriangle, XCircle, Database, FileText } from 'lucide-react'
import { useT } from '@/lib/i18n'

// Export the type so it can be used elsewhere
export type SyncNotification = {
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  details?: {
    fleetUpdated: boolean | number
    yardUpdated: number
    syncType: 'contract' | 'insurance' | 'condition' | 'bulk_insurance' | 'add' | 'update' | 'delete' | 'defleet' | 'clear' | 'bulk_import' // ✅ FIXED: Made required and added 'defleet'
    processedVehicles?: string[]
    errors?: string[]
  }
}

// Internal interface uses the exported type
interface ContractSyncNotificationProps {
  notification: SyncNotification
  onClose: () => void
  className?: string
}

export const ContractSyncNotification = React.memo(function ContractSyncNotification({
  notification,
  onClose,
  className = ''
}: ContractSyncNotificationProps) {
  const t = useT()

  // Get notification styling based on type
  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'success':
        return {
          containerClass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
          iconClass: 'text-green-600 dark:text-green-400',
          textClass: 'text-green-800 dark:text-green-200',
          titleClass: 'text-green-900 dark:text-green-100',
          Icon: CheckCircle
        }
      case 'warning':
        return {
          containerClass: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
          iconClass: 'text-yellow-600 dark:text-yellow-400',
          textClass: 'text-yellow-800 dark:text-yellow-200',
          titleClass: 'text-yellow-900 dark:text-yellow-100',
          Icon: AlertTriangle
        }
      case 'error':
        return {
          containerClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
          iconClass: 'text-red-600 dark:text-red-400',
          textClass: 'text-red-800 dark:text-red-200',
          titleClass: 'text-red-900 dark:text-red-100',
          Icon: XCircle
        }
      default:
        return {
          containerClass: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
          iconClass: 'text-blue-600 dark:text-blue-400',
          textClass: 'text-blue-800 dark:text-blue-200',
          titleClass: 'text-blue-900 dark:text-blue-100',
          Icon: CheckCircle
        }
    }
  }

  const style = getNotificationStyle(notification.type)

  return (
    <div className={`
      fixed z-50
      top-4 left-1/2 transform -translate-x-1/2
      w-[calc(100%-2rem)] max-w-md
      sm:left-auto sm:right-4 sm:transform-none sm:w-full
      ${style.containerClass}
      border rounded-lg shadow-lg
      animate-in slide-in-from-top duration-300
      sm:animate-in sm:slide-in-from-right-full sm:duration-300
      ${className}
    `}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <style.Icon className={`w-5 h-5 ${style.iconClass}`} />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-sm ${style.titleClass} mb-1`}>
              {notification.type === 'success' && t('fleet.syncNotif.titleSuccess')}
              {notification.type === 'warning' && t('fleet.syncNotif.titleWarning')}
              {notification.type === 'error' && t('fleet.syncNotif.titleError')}
              {notification.type === 'info' && t('fleet.syncNotif.titleInfo')}
            </div>
            
            <p className={`text-sm ${style.textClass} leading-relaxed break-words`}>
              {notification.message}
            </p>
            
            {/* Success Details */}
            {notification.type === 'success' && notification.details && (
              <div className="mt-3 flex items-center gap-4 text-xs">
                {notification.details.fleetUpdated && (
                  <div className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    <span className={style.textClass}>{t('fleet.syncNotif.fleetUpdated')}</span>
                  </div>
                )}
                {notification.details.yardUpdated > 0 && (
                  <div className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span className={style.textClass}>{t('fleet.syncNotif.yardSynced')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className={`
              flex-shrink-0 p-1 rounded-md transition-colors
              hover:bg-black/5 dark:hover:bg-white/5
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              ${style.textClass}
            `}
            aria-label={t('fleet.syncNotif.closeAriaLabel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Progress bar for auto-close */}
      <div className="h-1 bg-black/10 dark:bg-white/10 rounded-b-lg overflow-hidden">
        <div 
          className={`
            h-full transition-all duration-8000 ease-linear
            ${notification.type === 'success' ? 'bg-green-500' : 
              notification.type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}
          `}
          style={{
            animation: `shrink ${notification.type === 'success' ? '8s' : '6s'} linear forwards`
          }}
        />
      </div>
      
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
})

export default ContractSyncNotification