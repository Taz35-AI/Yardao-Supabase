// src/components/features/dashboard/DashboardActionsMenu.tsx
// Mobile actions menu for dashboard - properly separated UI from logic

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MoreVertical, RefreshCw, Sparkles, FileSpreadsheet } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface DashboardActionsMenuProps {
  onRefresh: () => void
  onClean: () => void
  onExport: () => void
  isRefreshing: boolean
}

export const DashboardActionsMenu: React.FC<DashboardActionsMenuProps> = ({
  onRefresh,
  onClean,
  onExport,
  isRefreshing
}) => {
  const t = useT()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleAction = (action: () => void) => {
    action()
    setShowMenu(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label={t('dashboard.actionsMenu.triggerAria')}
      >
        <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="py-1">
            {/* Refresh Action */}
            <button
              onClick={() => handleAction(onRefresh)}
              disabled={isRefreshing}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? t('dashboard.actionsMenu.refreshing') : t('dashboard.actionsMenu.refreshData')}
            </button>

            {/* Clean Action */}
            <button
              onClick={() => handleAction(onClean)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {t('dashboard.actionsMenu.cleanNotes')}
            </button>

            {/* Export Action */}
            <button
              onClick={() => handleAction(onExport)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t('dashboard.actionsMenu.exportToExcel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}