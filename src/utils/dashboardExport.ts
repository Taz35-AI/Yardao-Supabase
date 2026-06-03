// src/utils/dashboardExport.ts
// Separated export logic for dashboard vehicles

import * as XLSX from 'xlsx'
import { downloadExcelFile } from './excelDownload'
import type { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'

/**
 * Format date for Excel export
 */
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

/**
 * Format mileage with thousand separators
 */
const formatMileage = (mileage: any): string => {
  if (!mileage) return ''
  const mileageStr = String(mileage)
  return mileageStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Safe string conversion
 */
const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return String(value)
  } catch {
    return ''
  }
}

/**
 * Create Excel workbook from dashboard vehicles
 */
export const createDashboardWorkbook = (vehicles: CheckedInVehicle[]): XLSX.WorkBook => {
  // Prepare data with all columns including insurance
  const exportData = vehicles.map((vehicle, index) => ({
    'No.': index + 1,
    'Registration': safeString(vehicle.registration),
    'Make': safeString(vehicle.make),
    'Model': safeString(vehicle.model),
    'Colour': safeString(vehicle.colour),
    'Size': safeString(vehicle.size),
    'Status': safeString(vehicle.status),
    'Condition': safeString(vehicle.condition),
    'Contract': safeString(vehicle.contract || 'No Contract'),
    'Insurance Status': safeString(vehicle.insuranceStatus || 'Unknown'),
    'Mileage': formatMileage(vehicle.mileage),
    'MOT Expiry': formatDate(vehicle.motExpiry),
    'Tax Expiry': formatDate(vehicle.taxExpiry),
    'Check-in Date': formatDate(vehicle.createdAt),
    'Location': safeString(vehicle.location),
    'Bay': safeString(vehicle.bay),
    'Notes': safeString(vehicle.notes),
    'Comments': safeString(vehicle.comments)
  }))

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData)
  
  // Set column widths
  worksheet['!cols'] = [
    { width: 6 },   // No.
    { width: 15 },  // Registration
    { width: 12 },  // Make
    { width: 15 },  // Model
    { width: 10 },  // Colour
    { width: 12 },  // Size
    { width: 12 },  // Status
    { width: 15 },  // Condition
    { width: 20 },  // Contract
    { width: 15 },  // Insurance Status
    { width: 12 },  // Mileage
    { width: 12 },  // MOT Expiry
    { width: 12 },  // Tax Expiry
    { width: 15 },  // Check-in Date
    { width: 12 },  // Location
    { width: 8 },   // Bay
    { width: 25 },  // Notes
    { width: 25 }   // Comments
  ]

  // Add header styling (if styles are supported)
  try {
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
  } catch (styleError) {
    logger.log('Could not apply header styles:', styleError)
  }

  // Create workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vehicles In Yard')

  // Add summary sheet
  const summaryData = [
    { Metric: 'Total Vehicles', Value: vehicles.length },
    { Metric: '', Value: '' },
    { Metric: 'Ready', Value: vehicles.filter(v => v.status === 'Ready').length },
    { Metric: 'Pending checks', Value: vehicles.filter(v => v.status === 'Pending checks').length },
    { Metric: 'Repairs needed', Value: vehicles.filter(v => v.status === 'Repairs needed').length },
    { Metric: 'Non-Starter', Value: vehicles.filter(v => v.status === 'Non-Starter').length },
    { Metric: '', Value: '' },
    { Metric: 'In Yard', Value: vehicles.filter(v => v.hireStatus === 'In Yard').length },
    { Metric: 'Out on Hire', Value: vehicles.filter(v => v.hireStatus === 'Out on Hire').length },
    { Metric: '', Value: '' },
    { Metric: 'With Contracts', Value: vehicles.filter(v => v.contract && v.contract !== 'No Contract').length },
    { Metric: 'Without Contracts', Value: vehicles.filter(v => !v.contract || v.contract === 'No Contract').length },
    { Metric: '', Value: '' },
    { Metric: 'Insured Vehicles', Value: vehicles.filter(v => v.insuranceStatus === 'Insured').length },
    { Metric: 'Uninsured Vehicles', Value: vehicles.filter(v => v.insuranceStatus === 'Not Insured').length },
    { Metric: 'Unknown Insurance', Value: vehicles.filter(v => !v.insuranceStatus).length },
  ]

  const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData)
  summaryWorksheet['!cols'] = [{ width: 20 }, { width: 15 }]
  
  // Style summary headers
  try {
    if (summaryWorksheet['A1']) {
      summaryWorksheet['A1'].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "059669" } },
        alignment: { horizontal: "center" }
      }
    }
    if (summaryWorksheet['B1']) {
      summaryWorksheet['B1'].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "059669" } },
        alignment: { horizontal: "center" }
      }
    }
  } catch (styleError) {
    logger.log('Could not apply summary styles:', styleError)
  }

  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary')
  
  return workbook
}

/**
 * Export dashboard vehicles to Excel
 * This function creates the workbook and uses the proper download utility
 */
export const exportDashboardVehicles = async (
  vehicles: CheckedInVehicle[],
  filename: string = 'yard-dashboard-vehicles'
): Promise<void> => {
  if (!vehicles.length) {
    throw new Error('No vehicles to export')
  }

  logger.log('📊 Starting dashboard export with', vehicles.length, 'vehicles')

  try {
    // Create workbook
    const workbook = createDashboardWorkbook(vehicles)
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]
    const finalFilename = `${filename}-${timestamp}.xlsx`
    
    // Use the proper download utility that handles Capacitor
    logger.log('🔄 Calling downloadExcelFile utility...')
    await downloadExcelFile(workbook, finalFilename)
    
    logger.log(`✅ Exported ${vehicles.length} vehicles successfully`)
  } catch (error) {
    logger.error('❌ Dashboard export failed:', error)
    throw error
  }
}