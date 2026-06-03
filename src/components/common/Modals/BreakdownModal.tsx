// src/components/common/Modals/BreakdownModal.tsx - Mobile Viewport Optimized
'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { X } from 'lucide-react'
import { useT } from '@/lib/i18n'

// Display-only label map for the Status breakdown. Keyed by the stored
// VehicleStatus value (which stays English and is what onFilter receives);
// only the rendered text is localized. Keys not in this map (sizes,
// condition names, contract names) render their raw data value unchanged.
const STATUS_LABEL_KEY: Record<string, string> = {
  'Ready': 'dashboard.statusLabel.ready',
  'Pending checks': 'dashboard.statusLabel.pending',
  'Pending Checks': 'dashboard.statusLabel.pending',
  'Pending': 'dashboard.statusLabel.pending',
  'Repairs needed': 'dashboard.statusLabel.repairs',
  'Repairs Needed': 'dashboard.statusLabel.repairs',
  'Repairs': 'dashboard.statusLabel.repairs',
  'Non-Starter': 'dashboard.statusLabel.nonStarter',
}

interface BreakdownModalProps {
  title: string
  data: Record<string, number>
  onFilter: (key: string) => void
  onClose: () => void
  activeFilter: string
  statusSizeBreakdown?: Record<string, Record<string, number>>
  onStatusSizeFilter?: (status: string, size: string) => void
}

export const BreakdownModal = React.memo(function BreakdownModal({
  title,
  data,
  onFilter,
  onClose,
  activeFilter,
  statusSizeBreakdown,
  onStatusSizeFilter
}: BreakdownModalProps) {
  const t = useT()
  return (
    <Card className="w-full max-w-[calc(100vw-2rem)] max-w-sm mx-auto max-h-[80vh] flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg truncate pr-2">{title}</CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="flex-shrink-0 h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-2">
          {Object.entries(data).map(([key, count]) => (
            <div key={key}>
              <button
                onClick={() => onFilter(key)}
                className={`w-full flex justify-between items-center p-3 rounded-lg border transition-all ${
                  activeFilter.includes(key.toLowerCase()) 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="font-medium text-gray-900 dark:text-white text-left flex-1 pr-3 truncate">
                  {STATUS_LABEL_KEY[key] ? t(STATUS_LABEL_KEY[key]) : key}
                </span>
                <span className="font-bold text-lg text-gray-700 dark:text-gray-300 flex-shrink-0 min-w-[2rem] text-right">
                  {count}
                </span>
              </button>
              
              {statusSizeBreakdown && statusSizeBreakdown[key] && onStatusSizeFilter && (
                <div className="ml-4 mt-2 space-y-1">
                  {Object.entries(statusSizeBreakdown[key]).map(([size, sizeCount]) => (
                    <button
                      key={`${key}-${size}`}
                      onClick={() => onStatusSizeFilter(key, size)}
                      className="w-full flex justify-between items-center p-2 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                      <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 pr-2 truncate text-left">
                        └ {size}
                      </span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0 min-w-[1.5rem] text-right text-sm">
                        {sizeCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})