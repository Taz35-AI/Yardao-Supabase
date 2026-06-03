// src/components/features/deliveries-defleet/DeliveriesDefleetList.tsx
// RESTYLED: Premium UI matching Service Bookings aesthetic
// ALL logic, filtering, sorting, and functionality preserved exactly — CSS/layout only
'use client'

import React, { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import {
  Search,
  Filter,
  Edit,
  Trash2,
  Calendar,
  Clock,
  Truck,
  TruckIcon,
  MapPin,
  Building,
  FileText,
  ChevronDown,
  Package,
  RouteOff,
  Car,
  Settings,
  MessageSquare,
  User,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowUpDown,
} from 'lucide-react'
import { DeliveryDefleelEntry } from './DeliveriesDefleetContent'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveriesDefleetListProps {
  entries: DeliveryDefleelEntry[]
  loading: boolean
  onEditEntry: (entry: DeliveryDefleelEntry) => void
  onDeleteEntry: (entryId: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeliveriesDefleetList({
  entries,
  loading,
  onEditEntry,
  onDeleteEntry,
}: DeliveriesDefleetListProps) {
  // ── Filter / sort state (ALL PRESERVED) ─────────────────────────────────────
  const [searchTerm, setSearchTerm]         = useState('')
  const [operationFilter, setOperationFilter] = useState<string>('all')
  const [sortBy, setSortBy]                 = useState<'date' | 'registration' | 'operationType'>('date')
  const [sortOrder, setSortOrder]           = useState<'asc' | 'desc'>('desc')

  // ── Filtering + sorting logic (PRESERVED exactly) ───────────────────────────
  const filteredAndSortedEntries = useMemo(() => {
    let filtered = entries.filter(entry => {
      const matchesSearch =
        searchTerm === '' ||
        entry.registration.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.defleetReason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.defleetDestination?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesOperation = operationFilter === 'all' || entry.operationType === operationFilter

      return matchesSearch && matchesOperation
    })

    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
        case 'registration':
          comparison = a.registration.localeCompare(b.registration)
          break
        case 'operationType':
          comparison = a.operationType.localeCompare(b.operationType)
          break
        default:
          comparison = 0
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [entries, searchTerm, operationFilter, sortBy, sortOrder])

  // ── Sort handler (PRESERVED) ─────────────────────────────────────────────────
  const handleSort = (field: 'date' | 'registration' | 'operationType') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  // ── Date formatters (PRESERVED) ──────────────────────────────────────────────
  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const formatDateTime = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleDateString('en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  // ── Badge helpers (PRESERVED — only class strings updated) ───────────────────
  const getOperationBadge = (operationType: 'delivery' | 'defleet') => {
    if (operationType === 'delivery') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#025940]/10 text-[#025940] dark:bg-[#025940]/25 dark:text-[#72A68E] border border-[#025940]/20 dark:border-[#025940]/40 uppercase tracking-wide">
          <Package className="w-2.5 h-2.5" />
          Delivery
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-800/50 uppercase tracking-wide">
        <RouteOff className="w-2.5 h-2.5" />
        Defleet
      </span>
    )
  }

  const getCompletionBadge = (entry: DeliveryDefleelEntry) => {
    if (entry.isCompleted) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#b3f243]/20 text-[#012619] dark:bg-[#b3f243]/10 dark:text-[#b3f243] border border-[#b3f243]/30 uppercase tracking-wide">
          <CheckCircle className="w-2.5 h-2.5" />
          Completed
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50 uppercase tracking-wide">
        <Clock className="w-2.5 h-2.5" />
        Pending
      </span>
    )
  }

  // ── Loading state (PRESERVED) ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-[#025940] mr-3" />
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading entries...</span>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ════════════════════════════════════════════════════════════════════════
          FILTERS + SEARCH — clean card matching Service Bookings style
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">

        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filters</span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {filteredAndSortedEntries.length} of {entries.length} entries
          </span>
        </div>

        <div className="p-4 space-y-3">

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by reg, make, model, supplier, notes..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
            />
          </div>

          {/* Operation filter + sort controls — single row */}
          <div className="flex items-center gap-3 flex-wrap">

            {/* Operation type filter pill group */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 gap-0.5">
              {[
                { value: 'all',      label: 'All'      },
                { value: 'delivery', label: 'Deliveries' },
                { value: 'defleet',  label: 'Defleet'  },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOperationFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    operationFilter === opt.value
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sort field select */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'date' | 'registration' | 'operationType')}
                className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] cursor-pointer"
              >
                <option value="date">Sort: Date</option>
                <option value="registration">Sort: Reg</option>
                <option value="operationType">Sort: Type</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>

            {/* Sort direction toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#025940] dark:text-[#72A68E] bg-[#025940]/8 dark:bg-[#025940]/20 hover:bg-[#025940]/15 dark:hover:bg-[#025940]/30 border border-[#025940]/20 dark:border-[#72A68E]/30 rounded-lg transition-colors"
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ENTRIES LIST
      ════════════════════════════════════════════════════════════════════════ */}

      {filteredAndSortedEntries.length === 0 ? (
        /* Empty state */
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No entries found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {searchTerm || operationFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Switch to Calendar view and click a date to add your first entry'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedEntries.map(entry => (
            <div
              key={entry.id}
              className={`bg-white dark:bg-gray-800/50 rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
                entry.isCompleted
                  ? 'border-gray-100 dark:border-gray-700/50 opacity-80'
                  : entry.operationType === 'delivery'
                    ? 'border-[#C5D9D0] dark:border-[#025940]/40'
                    : 'border-red-100 dark:border-red-900/40'
              }`}
            >
              {/* ── Entry header bar ─────────────────────────────────────────── */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${
                entry.isCompleted
                  ? 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-700/50'
                  : entry.operationType === 'delivery'
                    ? 'bg-[#025940]/5 dark:bg-[#025940]/15 border-[#C5D9D0] dark:border-[#025940]/40'
                    : 'bg-red-50/60 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Operation icon */}
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                    entry.isCompleted
                      ? 'bg-gray-200 dark:bg-gray-700'
                      : entry.operationType === 'delivery'
                        ? 'bg-[#025940]/10 dark:bg-[#025940]/25'
                        : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    {entry.operationType === 'delivery'
                      ? <Truck className={`w-3.5 h-3.5 ${entry.isCompleted ? 'text-gray-400' : 'text-[#025940] dark:text-[#72A68E]'}`} />
                      : <TruckIcon className={`w-3.5 h-3.5 ${entry.isCompleted ? 'text-gray-400' : 'text-red-500 dark:text-red-400'}`} />
                    }
                  </div>

                  {/* Reg + vehicle */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-black tracking-wide ${
                        entry.isCompleted
                          ? 'text-gray-400 dark:text-gray-500 line-through'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {entry.registration}
                      </span>
                      {getOperationBadge(entry.operationType)}
                      {getCompletionBadge(entry)}
                      {entry.isFleetVehicle && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#72A68E]/15 text-[#025940] dark:text-[#72A68E] border border-[#72A68E]/25 uppercase tracking-wide">
                          Fleet
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {entry.make} {entry.model}
                    </p>
                  </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                  <Calendar className="w-3 h-3" />
                  <span className="whitespace-nowrap">{formatDate(entry.date)}</span>
                </div>
              </div>

              {/* ── Entry body ───────────────────────────────────────────────── */}
              <div className="px-4 py-3 space-y-3">

                {/* Operation-specific details */}
                {entry.operationType === 'delivery' && (entry.supplier || entry.expectedArrival) && (
                  <div className="flex flex-wrap gap-3">
                    {entry.supplier && (
                      <div className="flex items-center gap-2 text-xs">
                        <Building className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400">Supplier:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.supplier}</span>
                      </div>
                    )}
                    {entry.expectedArrival && (
                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400">Expected:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.expectedArrival}</span>
                      </div>
                    )}
                  </div>
                )}

                {entry.operationType === 'defleet' && (entry.defleetReason || entry.defleetDestination) && (
                  <div className="flex flex-wrap gap-3">
                    {entry.defleetReason && (
                      <div className="flex items-center gap-2 text-xs">
                        <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400">Reason:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.defleetReason}</span>
                      </div>
                    )}
                    {entry.defleetDestination && (
                      <div className="flex items-center gap-2 text-xs">
                        <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400">Destination:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.defleetDestination}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Completion info */}
                {entry.isCompleted && entry.completedAt && (
                  <div className="flex items-center gap-2 text-xs text-[#025940] dark:text-[#72A68E] bg-[#025940]/5 dark:bg-[#025940]/10 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Completed {formatDateTime(entry.completedAt)}</span>
                    {entry.completedBy && <span className="text-gray-400">· {entry.completedBy}</span>}
                  </div>
                )}

                {/* Notes */}
                {entry.notes && (
                  <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 px-3 py-2 rounded-lg">
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                    <span className="italic">{entry.notes}</span>
                  </div>
                )}

                {/* Created by + actions row */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-50 dark:border-gray-700/50">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                    <User className="w-3 h-3" />
                    <span>{entry.createdByName} · {formatDateTime(entry.createdAt)}</span>
                    {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
                      <span className="ml-1 opacity-60">(updated {formatDateTime(entry.updatedAt)})</span>
                    )}
                  </div>

                  {/* Action buttons — clean text-link style */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditEntry(entry)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#025940] dark:text-[#72A68E] hover:bg-[#025940]/8 dark:hover:bg-[#025940]/20 rounded-lg transition-colors"
                    >
                      <Edit className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteEntry(entry.id!)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}