// src/components/common/Buttons/DeliveryDefleetExportButton.tsx - Excel Export for Deliveries & Defleet
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { DeliveryDefleelEntry } from '@/components/features/deliveries-defleet/DeliveriesDefleetContent'
import { logger } from '@/lib/logger'

interface DeliveryDefleetExportButtonProps {
  entries: DeliveryDefleelEntry[]
  filename?: string
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  includeCompleted?: boolean
  includeIncomplete?: boolean
}

export const DeliveryDefleetExportButton = React.memo(function DeliveryDefleetExportButton({
  entries,
  filename = 'deliveries-defleet',
  className = '',
  variant = 'outline',
  size = 'md',
  disabled = false,
  includeCompleted = true,
  includeIncomplete = true
}: DeliveryDefleetExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try {
      return String(value)
    } catch {
      return ''
    }
  }

  const formatDate = (date: any): string => {
    if (!date) return ''
    try {
      let dateObj: Date
      if (typeof date === 'object' && date !== null && typeof date.toDate === 'function') {
        dateObj = date.toDate()
      } else {
        dateObj = new Date(date)
      }
      
      if (isNaN(dateObj.getTime())) return ''
      
      return dateObj.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    } catch {
      return ''
    }
  }

  const formatDateTime = (dateTime: any): string => {
    if (!dateTime) return ''
    try {
      let dateObj: Date
      if (typeof dateTime === 'object' && dateTime !== null && typeof dateTime.toDate === 'function') {
        dateObj = dateTime.toDate()
      } else {
        dateObj = new Date(dateTime)
      }
      
      if (isNaN(dateObj.getTime())) return ''
      
      return dateObj.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return ''
    }
  }

  const getStatusText = (entry: DeliveryDefleelEntry): string => {
    if (entry.isCompleted) return 'Completed'
    return 'Pending'
  }

  const getOperationTypeText = (operationType: string): string => {
    return operationType === 'delivery' ? 'Delivery' : 'Defleet'
  }

  const exportToExcel = async () => {
    // Filter entries based on completion status
    let filteredEntries = entries
    
    if (!includeCompleted && !includeIncomplete) {
      alert('Please select at least one status to export')
      return
    }
    
    if (!includeCompleted) {
      filteredEntries = entries.filter(entry => !entry.isCompleted)
    } else if (!includeIncomplete) {
      filteredEntries = entries.filter(entry => entry.isCompleted)
    }

    if (!filteredEntries.length) {
      alert('No entries to export with the selected criteria')
      return
    }

    setIsExporting(true)
    
    try {
      // Prepare data for Excel export
      const exportData = filteredEntries.map((entry, index) => ({
        'No.': index + 1,
        'Date': formatDate(entry.date),
        'Operation Type': getOperationTypeText(entry.operationType),
        'Status': getStatusText(entry),
        'Registration': safeString(entry.registration),
        'Make': safeString(entry.make),
        'Model': safeString(entry.model),
        'Vehicle Details': `${safeString(entry.make)} ${safeString(entry.model)}`.trim(),
        
        // Delivery specific fields
        'Expected Arrival': entry.operationType === 'delivery' ? safeString(entry.expectedArrival) : '',
        'Supplier': entry.operationType === 'delivery' ? safeString(entry.supplier) : '',
        
        // Defleet specific fields
        'Fleet Vehicle': entry.operationType === 'defleet' ? (entry.isFleetVehicle ? 'Yes' : 'No') : '',
        'Defleet Reason': entry.operationType === 'defleet' ? safeString(entry.defleetReason) : '',
        'Defleet Destination': entry.operationType === 'defleet' ? safeString(entry.defleetDestination) : '',
        
        // Common fields
        'Notes': safeString(entry.notes),
        'Created Date': formatDateTime(entry.createdAt),
        'Created By': safeString(entry.createdByName),
        
        // Completion details
        'Completed Date': entry.isCompleted ? formatDateTime(entry.completedAt) : '',
        'Completed By': entry.isCompleted ? safeString(entry.completedBy) : '',
        
        // System fields
        'Organization ID': safeString(entry.organizationId),
        'Entry ID': safeString(entry.id)
      }))

      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new()

      // Main data sheet
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      
      // Set column widths for better readability
      const columnWidths = [
        { width: 6 },   // No.
        { width: 12 },  // Date
        { width: 12 },  // Operation Type
        { width: 12 },  // Status
        { width: 15 },  // Registration
        { width: 12 },  // Make
        { width: 15 },  // Model
        { width: 20 },  // Vehicle Details
        { width: 15 },  // Expected Arrival
        { width: 20 },  // Supplier
        { width: 12 },  // Fleet Vehicle
        { width: 20 },  // Defleet Reason
        { width: 20 },  // Defleet Destination
        { width: 30 },  // Notes
        { width: 18 },  // Created Date
        { width: 15 },  // Created By
        { width: 18 },  // Completed Date
        { width: 15 },  // Completed By
        { width: 20 },  // Organization ID
        { width: 15 }   // Entry ID
      ]
      
      worksheet['!cols'] = columnWidths

      // Add header styling
      const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!worksheet[cellAddress]) continue
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "2563EB" } },
          alignment: { horizontal: "center" }
        }
      }
      
      // Add main data sheet
      XLSX.utils.book_append_sheet(workbook, worksheet, 'All Entries')

      // Create separate sheets for deliveries and defleets
      const deliveries = filteredEntries.filter(entry => entry.operationType === 'delivery')
      const defleets = filteredEntries.filter(entry => entry.operationType === 'defleet')

      // Deliveries sheet
      if (deliveries.length > 0) {
        const deliveryData = deliveries.map((entry, index) => ({
          'No.': index + 1,
          'Date': formatDate(entry.date),
          'Status': getStatusText(entry),
          'Registration': safeString(entry.registration),
          'Make': safeString(entry.make),
          'Model': safeString(entry.model),
          'Expected Arrival': safeString(entry.expectedArrival),
          'Supplier': safeString(entry.supplier),
          'Notes': safeString(entry.notes),
          'Created Date': formatDateTime(entry.createdAt),
          'Created By': safeString(entry.createdByName),
          'Completed Date': entry.isCompleted ? formatDateTime(entry.completedAt) : '',
          'Completed By': entry.isCompleted ? safeString(entry.completedBy) : ''
        }))

        const deliverySheet = XLSX.utils.json_to_sheet(deliveryData)
        deliverySheet['!cols'] = [
          { width: 6 }, { width: 12 }, { width: 12 }, { width: 15 }, 
          { width: 12 }, { width: 15 }, { width: 15 }, { width: 20 }, 
          { width: 30 }, { width: 18 }, { width: 15 }, { width: 18 }, { width: 15 }
        ]
        
        // Header styling for delivery sheet
        const deliveryHeaderRange = XLSX.utils.decode_range(deliverySheet['!ref'] || 'A1')
        for (let col = deliveryHeaderRange.s.c; col <= deliveryHeaderRange.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
          if (!deliverySheet[cellAddress]) continue
          deliverySheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "16A34A" } },
            alignment: { horizontal: "center" }
          }
        }
        
        XLSX.utils.book_append_sheet(workbook, deliverySheet, `Deliveries (${deliveries.length})`)
      }

      // Defleets sheet
      if (defleets.length > 0) {
        const defleetData = defleets.map((entry, index) => ({
          'No.': index + 1,
          'Date': formatDate(entry.date),
          'Status': getStatusText(entry),
          'Registration': safeString(entry.registration),
          'Make': safeString(entry.make),
          'Model': safeString(entry.model),
          'Fleet Vehicle': entry.isFleetVehicle ? 'Yes' : 'No',
          'Defleet Reason': safeString(entry.defleetReason),
          'Defleet Destination': safeString(entry.defleetDestination),
          'Notes': safeString(entry.notes),
          'Created Date': formatDateTime(entry.createdAt),
          'Created By': safeString(entry.createdByName),
          'Completed Date': entry.isCompleted ? formatDateTime(entry.completedAt) : '',
          'Completed By': entry.isCompleted ? safeString(entry.completedBy) : ''
        }))

        const defleetSheet = XLSX.utils.json_to_sheet(defleetData)
        defleetSheet['!cols'] = [
          { width: 6 }, { width: 12 }, { width: 12 }, { width: 15 }, 
          { width: 12 }, { width: 15 }, { width: 12 }, { width: 20 }, 
          { width: 20 }, { width: 30 }, { width: 18 }, { width: 15 }, 
          { width: 18 }, { width: 15 }
        ]
        
        // Header styling for defleet sheet
        const defleetHeaderRange = XLSX.utils.decode_range(defleetSheet['!ref'] || 'A1')
        for (let col = defleetHeaderRange.s.c; col <= defleetHeaderRange.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
          if (!defleetSheet[cellAddress]) continue
          defleetSheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "DC2626" } },
            alignment: { horizontal: "center" }
          }
        }
        
        XLSX.utils.book_append_sheet(workbook, defleetSheet, `Defleets (${defleets.length})`)
      }

      // Summary sheet
      const summaryData = [
        { 'Metric': 'Total Entries', 'Count': filteredEntries.length },
        { 'Metric': 'Total Deliveries', 'Count': deliveries.length },
        { 'Metric': 'Total Defleets', 'Count': defleets.length },
        { 'Metric': 'Completed Entries', 'Count': filteredEntries.filter(e => e.isCompleted).length },
        { 'Metric': 'Pending Entries', 'Count': filteredEntries.filter(e => !e.isCompleted).length },
        { 'Metric': 'Export Date', 'Count': new Date().toLocaleDateString('en-GB') },
        { 'Metric': 'Export Time', 'Count': new Date().toLocaleTimeString('en-GB') }
      ]

      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      summarySheet['!cols'] = [{ width: 20 }, { width: 15 }]
      
      // Summary header styling
      const summaryHeaderRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1')
      for (let col = summaryHeaderRange.s.c; col <= summaryHeaderRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!summarySheet[cellAddress]) continue
        summarySheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "7C3AED" } },
          alignment: { horizontal: "center" }
        }
      }
      
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
      
      // Generate filename with timestamp and status filter info
      const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
      let statusSuffix = ''
      if (!includeCompleted) statusSuffix = '-pending-only'
      else if (!includeIncomplete) statusSuffix = '-completed-only'
      
      const finalFilename = `${filename}${statusSuffix}-${timestamp}.xlsx`
      
      // Save file
      XLSX.writeFile(workbook, finalFilename)
      
      // Success feedback
      logger.log(`Exported ${filteredEntries.length} entries to ${finalFilename}`)
      
    } catch (error) {
      logger.error('Failed to export deliveries & defleet to Excel:', error)
      alert('Failed to export data to Excel. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const getButtonSize = () => {
    switch (size) {
      case 'sm': return 'h-8 px-3 text-xs'
      case 'lg': return 'h-12 px-6 text-base'
      default: return 'h-10 px-4 text-sm'
    }
  }

  const getFilteredCount = () => {
    let count = entries.length
    if (!includeCompleted && !includeIncomplete) return 0
    if (!includeCompleted) count = entries.filter(entry => !entry.isCompleted).length
    else if (!includeIncomplete) count = entries.filter(entry => entry.isCompleted).length
    return count
  }

  const filteredCount = getFilteredCount()

  return (
    <Button
      variant={variant}
      onClick={exportToExcel}
      disabled={disabled || isExporting || filteredCount === 0}
      className={`
        ${getButtonSize()}
        ${className}
        border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300
        dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        flex items-center space-x-2
        min-w-fit
      `}
      title={filteredCount === 0 ? 'No entries to export' : `Export ${filteredCount} entries to Excel`}
    >
      {isExporting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="hidden sm:inline">Exporting...</span>
          <span className="sm:hidden">...</span>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Export to Excel</span>
          <span className="sm:hidden">Export</span>
          {filteredCount > 0 && (
            <span className="hidden md:inline bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded-full text-xs font-medium">
              {filteredCount}
            </span>
          )}
        </>
      )}
    </Button>
  )
})