// src/components/features/deliveries-defleet/DeliveriesDefleetContent.tsx
// RESTYLED: Premium UI matching Service Bookings page aesthetic
// ALL logic, handlers, state, and functionality preserved exactly — CSS/layout only
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFleetData } from '@/hooks/useFleetData'
import { DeliveriesDefleetCalendar } from './DeliveriesDefleetCalendar'
import { DeliveriesDefleetModal } from './DeliveriesDefleetModal'
import { DeliveriesDefleetList } from './DeliveriesDefleetList'
import { DayDetailsModal } from './DayDetailsModal'
import { useDeliveriesDefleet } from '@/contexts/DeliveriesDefleetContext'
import { DeliveryDefleetExportButton } from '@/components/common/Buttons/DeliveryDefleetExportButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Calendar,
  List,
  RefreshCw,
  Truck,
  TruckIcon,
  FileSpreadsheet,
  Filter,
  Car,
  Search,
  X,
  ChevronRight,
} from 'lucide-react'
import { logger } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryOperationType = 'delivery' | 'defleet'

export interface DeliveryDefleelEntry {
  id?: string
  date: string
  operationType: DeliveryOperationType
  registration: string
  make: string
  model: string
  notes?: string
  organizationId: string
  createdBy: string
  createdByName: string
  createdAt: Date | string
  updatedAt?: Date | string
  // Completion status
  isCompleted?: boolean
  completedAt?: string
  completedBy?: string
  // Delivery specific
  expectedArrival?: string
  supplier?: string
  // Defleet specific
  isFleetVehicle?: boolean
  defleetReason?: string
  defleetDestination?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeliveriesDefleetContent() {
  const { user } = useAuth()
  const { vehicles, loading: fleetLoading } = useFleetData()
  const {
    entries,
    loading: entriesLoading,
    error,
    createEntry,
    updateEntry,
    deleteEntry,
    refreshEntries,
  } = useDeliveriesDefleet()

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]     = useState<Date | null>(null)
  const [showModal, setShowModal]           = useState(false)
  const [showDayDetails, setShowDayDetails] = useState(false)
  const [editingEntry, setEditingEntry]     = useState<DeliveryDefleelEntry | null>(null)
  const [viewMode, setViewMode]             = useState<'calendar' | 'list'>('calendar')
  const [searchReg, setSearchReg]           = useState('')
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  const calendarRef = useRef<{ navigateToDate: (date: Date) => void } | null>(null)

  // Export options state
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [exportSettings, setExportSettings] = useState({
    includeCompleted: true,
    includeIncomplete: true,
  })

  // ── Debug logging (PRESERVED) ───────────────────────────────────────────────
  logger.log('🏢 DeliveriesDefleetContent state:', {
    user: user ? { uid: user.uid, email: user.email } : null,
    entries,
    entriesCount: entries?.length,
    entriesLoading,
    fleetLoading,
    error,
    vehicles: vehicles?.length,
  })

  // Reset search index when search term changes (PRESERVED)
  useEffect(() => {
    setCurrentSearchIndex(0)
  }, [searchReg])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Timezone-safe date formatting (PRESERVED)
  const formatDateForFirestore = (date: Date): string => {
    const year  = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day   = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // ── Event handlers (ALL PRESERVED) ──────────────────────────────────────────

  const handleDateSelect = (date: Date) => {
    logger.log('📅 Date selected:', date)
    setSelectedDate(date)
    setEditingEntry(null)
    setShowModal(false)
    setShowDayDetails(true)
  }

  const handleCreateEntry = async (
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ) => {
    logger.log('🔄 handleCreateEntry called with:', entryData)
    if (!user) { logger.log('❌ No user found'); return false }

    const success = await createEntry(entryData)
    logger.log('📨 createEntry result:', success)

    if (success) {
      setShowModal(false)
      setShowDayDetails(false)
      setSelectedDate(null)
    }
    return success
  }

  const handleEditEntry = (entry: DeliveryDefleelEntry) => {
    logger.log('✏️ Edit entry:', entry)
    setEditingEntry(entry)
    setSelectedDate(new Date(entry.date))
    setShowDayDetails(false)
    setShowModal(true)
  }

  const handleUpdateEntry = async (
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ) => {
    if (!editingEntry) { logger.log('❌ No editing entry found in handleUpdateEntry'); return false }

    logger.log('🔄 handleUpdateEntry called with entryData:', entryData)
    logger.log('📝 Editing entry ID:', editingEntry.id)

    try {
      const success = await updateEntry(editingEntry.id!, entryData)
      logger.log('📨 updateEntry result:', success)

      if (success) {
        logger.log('✅ Entry updated successfully')
        setShowModal(false)
        setShowDayDetails(false)
        setEditingEntry(null)
        setSelectedDate(null)
      } else {
        logger.log('❌ Entry update failed')
      }
      return success
    } catch (error) {
      logger.error('💥 Error in handleUpdateEntry:', error)
      return false
    }
  }

  const handleUpdateEntryFromDayDetails = async (
    entryId: string,
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ) => {
    logger.log('🔄 handleUpdateEntryFromDayDetails called')
    logger.log('📝 Entry ID:', entryId)
    logger.log('📤 Entry data:', entryData)

    try {
      const success = await updateEntry(entryId, entryData)
      logger.log('📨 updateEntry result:', success)
      return success
    } catch (error) {
      logger.error('💥 Error in handleUpdateEntryFromDayDetails:', error)
      return false
    }
  }

  const handleDeleteEntry = async (entryId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this entry?')
    if (confirmed) {
      await deleteEntry(entryId)
    }
  }

  const handleMarkComplete = async (entryId: string) => {
    try {
      const entry = entries.find(e => e.id === entryId)
      if (!entry || !user) return false

      const updatedEntryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'> = {
        date: entry.date,
        operationType: entry.operationType,
        registration: entry.registration,
        make: entry.make,
        model: entry.model,
        notes: entry.notes || '',
        expectedArrival: entry.expectedArrival || '',
        supplier: entry.supplier || '',
        isFleetVehicle: entry.isFleetVehicle || false,
        defleetReason: entry.defleetReason || '',
        defleetDestination: entry.defleetDestination || '',
        isCompleted: !entry.isCompleted,
        completedAt: !entry.isCompleted ? new Date().toISOString() : '',
        completedBy: !entry.isCompleted ? user.email || '' : '',
      }

      const success = await updateEntry(entryId, updatedEntryData)
      logger.log('📨 Mark complete result:', success)
      return success
    } catch (error) {
      logger.error('💥 Error in handleMarkComplete:', error)
      return false
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setShowDayDetails(false)
    setEditingEntry(null)
    setSelectedDate(null)
  }

  // Get entries for selected date (PRESERVED)
  const getEntriesForDate = (date: Date | null) => {
    if (!date) return []
    const dateString = formatDateForFirestore(date)
    logger.log('🔍 Getting entries for date:', {
      originalDate: date,
      formattedDate: dateString,
      entriesFound: entries.filter(entry => entry.date === dateString).length,
    })
    return entries.filter(entry => entry.date === dateString)
  }

  // Search functions (PRESERVED)
  const getMatchingEntries = (reg: string): DeliveryDefleelEntry[] => {
    if (!reg || reg.length === 0) return []
    return entries.filter(e =>
      e.registration &&
      e.registration.toLowerCase().includes(reg.toLowerCase())
    )
  }

  const getMatchingDates = (reg: string): string[] => {
    const matchingEntries = getMatchingEntries(reg)
    return [...new Set(matchingEntries.map(e => e.date))]
  }

  const handleNavigateToSearchResult = () => {
    const matchingDates = getMatchingDates(searchReg)
    if (matchingDates.length === 0) return

    const nextIndex = (currentSearchIndex + 1) % matchingDates.length
    setCurrentSearchIndex(nextIndex)

    const targetDate = new Date(matchingDates[nextIndex])
    if (calendarRef.current && calendarRef.current.navigateToDate) {
      calendarRef.current.navigateToDate(targetDate)
    }
  }

  const getEntriesForDateString = (date: string): DeliveryDefleelEntry[] =>
    entries.filter(e => e.date === date)

  // ── Derived stats ────────────────────────────────────────────────────────────
  const todayStr         = formatDateForFirestore(new Date())
  const deliveryCount    = entries.filter(e => e.operationType === 'delivery').length
  const defleetCount     = entries.filter(e => e.operationType === 'defleet').length
  const todayCount       = entries.filter(e => e.date === todayStr).length
  const totalCount       = entries.length
  const matchingDates    = getMatchingDates(searchReg)
  const matchingEntries  = getMatchingEntries(searchReg)

  const loading = fleetLoading || entriesLoading

  logger.log('🎨 About to render with loading:', loading)

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 px-2 sm:px-4 lg:px-6 py-4">

      {/* ════════════════════════════════════════════════════════════════════════
          TOP BAR — Title + Search + Controls (mirrors Service Bookings layout)
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">

        {/* Left: Title */}
        <div className="flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
            Deliveries & Defleet
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Track vehicle deliveries and defleet operations
          </p>
        </div>

        {/* Centre: Registration search */}
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchReg}
              onChange={e => setSearchReg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNavigateToSearchResult()}
              placeholder="Search reg..."
              className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940]"
            />
            {searchReg && (
              <button
                onClick={() => setSearchReg('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search result badge — click to navigate */}
          {searchReg && matchingDates.length > 0 && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 text-[#025940] border-[#72A68E] cursor-pointer hover:bg-[#C5D9D0]/40 transition-colors text-xs whitespace-nowrap"
              onClick={handleNavigateToSearchResult}
              title={matchingDates.length > 1 ? 'Click to navigate through matching dates' : 'Click to go to this date'}
            >
              <Calendar className="w-3 h-3" />
              <span>{matchingEntries.length} match{matchingEntries.length !== 1 ? 'es' : ''}</span>
              {matchingDates.length > 1 && (
                <>
                  <span className="opacity-60">·</span>
                  <span>{matchingDates.length} days</span>
                  <ChevronRight className="w-3 h-3" />
                </>
              )}
            </Badge>
          )}
        </div>

        {/* Right: View toggle + Refresh + Export + Add */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Calendar / List toggle pill — matches Service Bookings style */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {([
              { key: 'calendar' as const, icon: Calendar, label: 'Calendar' },
              { key: 'list'     as const, icon: List,     label: 'List'     },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === key
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={refreshEntries}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export with options dropdown */}
          <div className="relative">
            <div className="flex items-center gap-1">
              <DeliveryDefleetExportButton
                entries={entries}
                filename="deliveries-defleet"
                includeCompleted={exportSettings.includeCompleted}
                includeIncomplete={exportSettings.includeIncomplete}
                size="sm"
              />
              <button
                onClick={() => setShowExportOptions(!showExportOptions)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Export options"
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Export options dropdown */}
            {showExportOptions && (
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3 min-w-[180px]">
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                  Export Options
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSettings.includeCompleted}
                      onChange={e => setExportSettings(prev => ({ ...prev, includeCompleted: e.target.checked }))}
                      className="rounded border-gray-300 accent-[#025940]"
                    />
                    <span className="text-gray-700 dark:text-gray-300">Include Completed</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSettings.includeIncomplete}
                      onChange={e => setExportSettings(prev => ({ ...prev, includeIncomplete: e.target.checked }))}
                      className="rounded border-gray-300 accent-[#025940]"
                    />
                    <span className="text-gray-700 dark:text-gray-300">Include Pending</span>
                  </label>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => setShowExportOptions(false)}
                    className="w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-1 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>


        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          STAT CARDS — 4 cards matching Service Bookings aesthetic
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'DELIVERIES',
            value: deliveryCount,
            bg:    'bg-[#025940]/8 dark:bg-[#025940]/20',
            color: 'text-[#025940] dark:text-[#72A68E]',
            icon:  Truck,
            border: 'border-[#025940]/20 dark:border-[#025940]/40',
          },
          {
            label: 'DEFLEET',
            value: defleetCount,
            bg:    'bg-red-50 dark:bg-red-900/20',
            color: 'text-red-700 dark:text-red-300',
            icon:  TruckIcon,
            border: 'border-red-200 dark:border-red-800/40',
          },
          {
            label: 'TODAY',
            value: todayCount,
            bg:    'bg-[#b3f243]/20 dark:bg-[#b3f243]/10',
            color: 'text-[#012619] dark:text-[#b3f243]',
            icon:  Calendar,
            border: 'border-[#b3f243]/30 dark:border-[#b3f243]/20',
          },
          {
            label: 'TOTAL',
            value: totalCount,
            bg:    'bg-[#72A68E]/15 dark:bg-[#72A68E]/10',
            color: 'text-[#025940] dark:text-[#72A68E]',
            icon:  Car,
            border: 'border-[#72A68E]/25 dark:border-[#72A68E]/20',
          },
        ].map(({ label, value, bg, color, icon: Icon, border }) => (
          <div
            key={label}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl ${bg} border ${border}`}
          >
            <div className={`p-2 rounded-lg bg-white/60 dark:bg-black/20 flex-shrink-0`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div>
              <div className={`text-xl font-bold ${color} leading-none`}>{value}</div>
              <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-0.5">
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ERROR STATE (PRESERVED)
      ════════════════════════════════════════════════════════════════════════ */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-4 text-center">
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MAIN CONTENT — Calendar or List (ALL LOGIC PRESERVED)
      ════════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'calendar' ? (
        <DeliveriesDefleetCalendar
          ref={calendarRef}
          entries={entries}
          loading={loading}
          onDateSelect={handleDateSelect}
          onEditEntry={handleEditEntry}
          onDeleteEntry={async (entryId: string) => {
            const success = await deleteEntry(entryId)
            return success
          }}
          onMarkComplete={handleMarkComplete}
          searchReg={searchReg}
          matchingDates={matchingDates}
          getEntriesForDate={getEntriesForDateString}
        />
      ) : (
        <DeliveriesDefleetList
          entries={entries}
          loading={loading}
          onEditEntry={handleEditEntry}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODALS (ALL PRESERVED — only one shown at a time)
      ════════════════════════════════════════════════════════════════════════ */}

      {/* Day Details Modal — viewing/editing multiple entries on a date */}
      {showDayDetails && (
        <DayDetailsModal
          isOpen={showDayDetails}
          onClose={handleCloseModal}
          selectedDate={selectedDate}
          entries={getEntriesForDate(selectedDate)}
          vehicles={vehicles}
          onUpdateEntry={handleUpdateEntryFromDayDetails}
          onDeleteEntry={async (entryId: string) => {
            const success = await deleteEntry(entryId)
            return success
          }}
          onCreateEntry={handleCreateEntry}
          onMarkComplete={handleMarkComplete}
        />
      )}

      {/* Single Entry Modal — editing individual entries from list view */}
      {showModal && (
        <DeliveriesDefleetModal
          isOpen={showModal}
          onClose={handleCloseModal}
          selectedDate={selectedDate}
          vehicles={vehicles}
          existingEntry={editingEntry}
          onSubmit={editingEntry ? handleUpdateEntry : handleCreateEntry}
        />
      )}
    </div>
  )
}

export default DeliveriesDefleetContent