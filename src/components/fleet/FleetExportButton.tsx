// src/components/fleet/FleetExportButton.tsx - Enhanced to support custom styling and icons
'use client'

import { Button } from '@/components/ui/Button'
import { Download, FileSpreadsheet } from 'lucide-react'
import { FleetVehicle } from '@/lib/fleetUtils'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'

// Local date formatting function - no imports needed
const formatDateToUK = (date: any): string => {
  if (!date) return ''
  
  let dateObj: Date
  
  // Handle different date formats
  if (date && typeof date === 'object' && 'toDate' in date) {
    // Firestore Timestamp
    dateObj = date.toDate()
  } else if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string' || typeof date === 'number') {
    dateObj = new Date(date)
  } else {
    return ''
  }
  
  if (isNaN(dateObj.getTime())) {
    return ''
  }
  
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = dateObj.getFullYear()
  
  return `${day}/${month}/${year}`
}

interface FleetExportButtonProps {
  vehicles: FleetVehicle[]
  filteredVehicles?: FleetVehicle[]
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive"
  customIcon?: React.ReactNode
  customText?: string
  filename?: string
}

export function FleetExportButton({ 
  vehicles, 
  filteredVehicles, 
  size = "default",
  className = '',
  variant = 'outline',
  customIcon,
  customText,
  filename = 'fleet-inventory'
}: FleetExportButtonProps) {
  
  // Safe string conversion helper
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return ''
      }
    }
    try {
      return String(value)
    } catch {
      return ''
    }
  }

  const handleExport = () => {
    try {
      // Use filtered vehicles if available, otherwise use all vehicles
      const exportVehicles = filteredVehicles && filteredVehicles.length > 0 ? filteredVehicles : vehicles
      
      if (exportVehicles.length === 0) {
        alert('No vehicles to export')
        return
      }

      // Prepare data for export with UK date format
      const exportData = exportVehicles.map((vehicle, index) => ({
        'No.': index + 1,
        'Registration': safeString(vehicle.registration),
        'Make': safeString(vehicle.make),
        'Model': safeString(vehicle.model),
        'Colour': safeString(vehicle.colour),
        'Size': safeString(vehicle.size),
        'Condition': safeString(vehicle.condition),
        'MOT Expiry': formatDateToUK(vehicle.motExpiry),
        'Tax Expiry': formatDateToUK(vehicle.taxExpiry),
        'Comments': safeString(vehicle.comments),
        'Created Date': formatDateToUK(vehicle.createdAt),
        'Created By': safeString(vehicle.createdBy),
        'Organization ID': safeString(vehicle.organizationId)
      }))

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      
      // Set column widths for better readability
      const columnWidths = [
        { width: 6 },   // No.
        { width: 15 },  // Registration
        { width: 12 },  // Make
        { width: 15 },  // Model
        { width: 10 },  // Colour
        { width: 15 },  // Size
        { width: 20 },  // Condition
        { width: 12 },  // MOT Expiry (UK format)
        { width: 12 },  // Tax Expiry (UK format)
        { width: 30 },  // Comments
        { width: 15 },  // Created Date (UK format)
        { width: 15 },  // Created By
        { width: 20 }   // Organization ID
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
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Fleet Inventory')
      
      // Generate filename with UK date format timestamp (DD-MM-YYYY)
      const now = new Date()
      const day = String(now.getDate()).padStart(2, '0')
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const year = now.getFullYear()
      const timestamp = `${day}-${month}-${year}`
      const finalFilename = `${filename}-${timestamp}.xlsx`
      
      // Save file
      XLSX.writeFile(workbook, finalFilename)
      
      // Success feedback
      logger.log(`Exported ${exportVehicles.length} vehicles to ${finalFilename}`)
      
    } catch (error) {
      logger.error('Failed to export fleet to Excel:', error)
      alert('Failed to export fleet data to Excel. Please try again.')
    }
  }

  // Default content
  const defaultIcon = <Download className="w-4 h-4" />
  const defaultText = `Export${filteredVehicles && filteredVehicles.length !== vehicles.length ? ' Filtered' : ''} (${(filteredVehicles || vehicles).length})`

  return (
    <Button
      onClick={handleExport}
      variant={variant}
      size={size}
      className={className}
      title={`Export ${(filteredVehicles || vehicles).length} vehicles to Excel with UK date format (DD/MM/YYYY)`}
    >
      {customIcon || defaultIcon}
      {(customText || defaultText) && (
        <span className="ml-2">
          {customText || defaultText}
        </span>
      )}
    </Button>
  )
}