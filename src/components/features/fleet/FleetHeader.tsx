// src/components/features/fleet/FleetHeader.tsx - PERFECT SYMMETRY across all devices
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { BulkInsuranceButton } from '@/components/fleet/BulkInsuranceButton'
import { downloadExcelFile, shareExcelFile } from '@/utils/excelDownload'
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  MoreVertical,
  Trash2,
  Loader2,
  Share2
} from 'lucide-react'
import { FleetVehicle } from '@/types'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// Loading Overlay Component
const LoadingOverlay = ({ isOpen, message }: { isOpen: boolean; message: string }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 m-4 max-w-sm w-full">
        <div className="flex flex-col items-center">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute top-0 left-0 w-full h-full">
              <div className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-600"></div>
            </div>
            <div className="absolute top-0 left-0 w-full h-full animate-spin">
              <div className="w-16 h-16 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-500"></div>
            </div>
          </div>
          
          <p className="text-gray-700 dark:text-gray-200 text-center font-medium">
            {message}
          </p>
          
          <div className="flex space-x-1 mt-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

const cleanString = (value: any): string => {
  if (!value) return ''
  return String(value).trim().replace(/\s+/g, ' ').replace(/[\t\n\r]/g, ' ').replace(/[""'']/g, '')
}

const parseExcelDate = (excelDate: any): string => {
  if (!excelDate) return ''
  
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  
  if (typeof excelDate === 'string') {
    const ukDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    const match = excelDate.match(ukDateRegex)
    
    if (match) {
      const [_, day, month, year] = match
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    }
    
    const date = new Date(excelDate)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  }
  
  if (excelDate instanceof Date) {
    return excelDate.toISOString().split('T')[0]
  }
  
  return ''
}

interface FleetHeaderProps {
  vehicles?: FleetVehicle[]
  filteredVehicles?: FleetVehicle[]
  conditions?: any[]
  onBulkUpload?: (vehicles: any[]) => Promise<void>
  onBulkInsurance?: (insuranceStatus: any, vehicleIds?: string[]) => Promise<void>
  vehicleCount?: number
  clearingAll?: boolean
  bulkInsuranceLoading?: boolean
  onClearAll?: () => Promise<void>
  onAddVehicle?: () => void
  showSyncBanner?: boolean
}

export function FleetHeader({ 
  vehicles = [], 
  filteredVehicles, 
  conditions = [], 
  onBulkUpload,
  onBulkInsurance,
  vehicleCount = 0,
  clearingAll = false,
  bulkInsuranceLoading = false,
  onClearAll,
  onAddVehicle,
  showSyncBanner = true
}: FleetHeaderProps) {
  const t = useT()
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState(t('fleet.header.preparingDownload'))
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false)
      }
    }

    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showActionsMenu])

  const createFleetWorkbook = async (vehiclesToExport: FleetVehicle[]) => {
    const CHUNK_SIZE = 1000
    const allExportData: any[] = []

    for (let i = 0; i < vehiclesToExport.length; i += CHUNK_SIZE) {
      const chunk = vehiclesToExport.slice(i, Math.min(i + CHUNK_SIZE, vehiclesToExport.length))
      const progress = Math.round((i / vehiclesToExport.length) * 100)
      setDownloadMessage(t('fleet.header.processingVehicles', { progress }))

      const chunkData = chunk.map((vehicle, index) => ({
        'No.': i + index + 1,
        'Registration': vehicle.registration || '',
        'Make': vehicle.make || '',
        'Model': vehicle.model || '',
        'Colour': vehicle.colour || '',
        'Size': vehicle.size || '',
        'Condition': vehicle.condition || '',
        'Contract': vehicle.contract || 'No Contract',
        'Insurance Status': vehicle.insuranceStatus || 'Unknown',
        'MOT Expiry': vehicle.motExpiry ? new Date(vehicle.motExpiry).toLocaleDateString('en-GB') : '',
        'Tax Expiry': vehicle.taxExpiry ? new Date(vehicle.taxExpiry).toLocaleDateString('en-GB') : '',
        'Comments': vehicle.comments || '',
        'Date Acquired': vehicle.dateAcquired ? new Date(vehicle.dateAcquired).toLocaleDateString('en-GB') : '',
        'Created Date': vehicle.createdAt ? new Date(vehicle.createdAt).toLocaleDateString('en-GB') : ''
      }))

      allExportData.push(...chunkData)
    }

    setDownloadMessage(t('fleet.header.creatingExcelFile'))

    const worksheet = XLSX.utils.json_to_sheet(allExportData)
    const workbook = XLSX.utils.book_new()
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fleet Vehicles')
    
    worksheet['!cols'] = [
      { width: 6 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 12 },
      { width: 15 }, { width: 15 }, { width: 18 }, { width: 15 }, { width: 12 },
      { width: 12 }, { width: 25 }, { width: 15 }, { width: 15 }
    ]

    if (worksheet['!ref']) {
      const headerRange = XLSX.utils.decode_range(worksheet['!ref'])
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2563EB" } },
            alignment: { horizontal: "center" }
          }
        }
      }
    }

    return workbook
  }

  const downloadFleetExcel = async () => {
    const vehiclesToExport = filteredVehicles || vehicles
    
    if (!vehiclesToExport.length) {
      alert(t('fleet.header.noVehiclesToExport'))
      return
    }

    setIsDownloading(true)
    setDownloadMessage(t('fleet.header.preparingFleetData'))

    try {
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const workbook = await createFleetWorkbook(vehiclesToExport)
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `fleet-vehicles-${timestamp}.xlsx`
      
      setDownloadMessage(t('fleet.header.savingFile'))

      await downloadExcelFile(workbook, filename)
      setShowActionsMenu(false)
      
      logger.log(`✅ Exported ${vehiclesToExport.length} vehicles successfully`)
      
    } catch (error) {
      logger.error('Export failed:', error)
      alert(t('fleet.header.exportFailed'))
    } finally {
      setIsDownloading(false)
    }
  }

  const shareFleetExcel = async () => {
    const vehiclesToExport = filteredVehicles || vehicles
    
    if (!vehiclesToExport.length) {
      alert(t('fleet.header.noVehiclesToShare'))
      return
    }

    setIsSharing(true)
    setDownloadMessage(t('fleet.header.preparingFleetDataForSharing'))

    try {
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const workbook = await createFleetWorkbook(vehiclesToExport)
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `fleet-vehicles-${timestamp}.xlsx`
      
      setDownloadMessage(t('fleet.header.openingShareDialog'))
      
      await shareExcelFile(workbook, filename)
      setShowActionsMenu(false)
      
      logger.log(`✅ Shared ${vehiclesToExport.length} vehicles successfully`)
      
    } catch (error) {
      logger.error('Share failed:', error)
      alert(t('fleet.header.shareFailed'))
    } finally {
      setIsSharing(false)
    }
  }

  const downloadTemplate = async () => {
    setIsDownloading(true)
    setDownloadMessage(t('fleet.header.creatingTemplate'))

    try {
      await new Promise(resolve => setTimeout(resolve, 100))

      const template = [
        {
          'Registration': 'RS67MAW',
          'Make': 'Ford',
          'Model': 'Transit',
          'Colour': 'White',
          'Size': 'L2H1',
          'MOT Expiry': '22/12/2030',
          'Tax Expiry': '03/12/2025',
          'Comments': 'Example vehicle 1',
          'Date Acquired': '15/01/2024'
        },
        {
          'Registration': 'NY86ZMR',
          'Make': 'Ford',
          'Model': 'Fiesta',
          'Colour': 'Bronze',
          'Size': 'Car',
          'MOT Expiry': '19/09/2023',
          'Tax Expiry': '22/01/2020',
          'Comments': 'Example vehicle 2',
          'Date Acquired': '10/03/2024'
        }
      ]

      const worksheet = XLSX.utils.json_to_sheet(template)
      const workbook = XLSX.utils.book_new()
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Fleet Template')
      
      worksheet['!cols'] = [
        { width: 15 }, { width: 12 }, { width: 15 }, { width: 12 },
        { width: 15 }, { width: 12 }, { width: 12 }, { width: 30 }, { width: 15 }
      ]

      setDownloadMessage(t('fleet.header.savingTemplate'))
      await downloadExcelFile(workbook, 'fleet-template.xlsx')
      setShowActionsMenu(false)
      
    } catch (error) {
      logger.error('Template download failed:', error)
      alert(t('fleet.header.templateDownloadFailed'))
    } finally {
      setIsDownloading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onBulkUpload) return

    setUploading(true)

    try {
      const buffer = await file.arrayBuffer()
      
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        sheetRows: 0,
        raw: false,
        cellDates: true
      })
      
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        defval: '',
        raw: false,
        dateNF: 'dd/mm/yyyy'
      })

      logger.log(`📊 Read ${jsonData.length} rows from Excel file`)

      const processedVehicles = jsonData.map((row: any) => {
        const registration = cleanString(row['Registration'] || row['Reg'] || row['reg'])
        const make = cleanString(row['Make'] || row['make'])
        const model = cleanString(row['Model'] || row['model'])
        const colour = cleanString(row['Colour'] || row['Color'] || row['colour'] || row['color'])
        const size = cleanString(row['Size'] || row['size'] || row['Type'] || row['type'])
        const comments = cleanString(row['Comments'] || row['comments'] || row['Notes'] || row['notes'])
        const condition = 'Excellent'
        const contract = cleanString(row['Contract'] || row['contract'])
        
        const insuranceStatus = cleanString(
          row['Insurance Status'] || row['Insurance'] || row['insurance'] || 
          row['insuranceStatus'] || row['Insured'] || row['insured'] ||
          row['Insurance State'] || row['Status']
        )

        let processedInsuranceStatus = null
        if (insuranceStatus) {
          const normalized = insuranceStatus.toLowerCase().trim()
          
          if (normalized === 'insured' || normalized === 'yes' || normalized === 'covered' ||
              normalized === 'active' || (normalized.includes('insured') && 
              !normalized.includes('not') && !normalized.includes('un'))) {
            processedInsuranceStatus = 'Insured'
          } else if (normalized === 'not insured' || normalized === 'uninsured' || 
                     normalized === 'no' || normalized === 'uncovered' ||
                     normalized === 'inactive' || normalized.includes('uninsured') ||
                     normalized.includes('not insured')) {
            processedInsuranceStatus = 'Not Insured'
          }
        }

        const motExpiry = parseExcelDate(row['MOT Expiry'] || row['MOT'] || row['mot'])
        const taxExpiry = parseExcelDate(row['Tax Expiry'] || row['Tax'] || row['tax'])
        const dateAcquired = parseExcelDate(row['Date Acquired'] || row['DateAcquired'] || row['dateAcquired'])

        if (!registration) {
          return null
        }

        return {
          registration: registration.toUpperCase(),
          make,
          model,
          colour,
          size,
          motExpiry: motExpiry || null,
          taxExpiry: taxExpiry || null,
          comments: comments || null,
          condition: condition,
          contract: contract || null,
          insuranceStatus: processedInsuranceStatus,
          dateAcquired: dateAcquired || null
        }
      }).filter(Boolean)

      if (processedVehicles.length === 0) {
        throw new Error(t('fleet.header.noValidVehiclesInFile'))
      }

      logger.log(`✅ Processed ${processedVehicles.length} vehicles from upload`)

      await onBulkUpload(processedVehicles)
      setShowActionsMenu(false)

    } catch (error) {
      logger.error('File upload error:', error)
      alert(error instanceof Error ? error.message : t('fleet.header.uploadFailed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      <LoadingOverlay isOpen={isDownloading || isSharing} message={downloadMessage} />
      
      {/* PERFECT BUTTON ROW - Symmetrical on all devices */}
      <div className="flex items-center justify-end gap-2">
        {/* Add Vehicle Button */}
        {onAddVehicle && (
          <button
            onClick={onAddVehicle}
            className="
              h-9 px-3 rounded-md
              font-semibold text-white text-sm
              shadow-sm hover:shadow-md 
              transition-all duration-200 hover:scale-105 active:scale-95
              whitespace-nowrap
            "
            style={{
              backgroundColor: '#72A68E',
              borderColor: '#025940'
            }}
            aria-label={t('fleet.header.addVehicleAria')}
          >
            {t('fleet.header.addVehicle')}
          </button>
        )}

        {/* Bulk Insurance Button */}
        {onBulkInsurance && vehicleCount > 0 && (
          <BulkInsuranceButton
            vehicles={vehicles}
            filteredVehicles={filteredVehicles}
            onBulkInsurance={onBulkInsurance}
            loading={bulkInsuranceLoading}
          />
        )}

        {/* Actions Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <Button
            onClick={() => setShowActionsMenu(!showActionsMenu)}
            variant="outline"
            size="sm"
            className="h-9 px-3 text-sm border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 whitespace-nowrap"
            disabled={isDownloading || uploading || isSharing}
          >
            {isDownloading || uploading || isSharing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MoreVertical className="w-4 h-4" />
            )}
          </Button>

          {showActionsMenu && (
            <div className="absolute top-full right-0 mt-2 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50">
              {/* Export Section */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={downloadFleetExcel}
                  disabled={!vehicles.length || isDownloading || isSharing}
                  className="w-full flex items-center px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {t('fleet.header.download', { count: (filteredVehicles || vehicles).length })}
                </button>
                
                <button
                  onClick={shareFleetExcel}
                  disabled={!vehicles.length || isDownloading || isSharing}
                  className="w-full flex items-center px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSharing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4 mr-2" />
                  )}
                  {t('fleet.header.share', { count: (filteredVehicles || vehicles).length })}
                </button>
              </div>

              {/* Upload Section */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || isDownloading || isSharing}
                  className="w-full flex items-center px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploading ? t('fleet.header.uploading') : t('fleet.header.uploadExcel')}
                </button>

                <button
                  onClick={downloadTemplate}
                  disabled={isDownloading || isSharing}
                  className="w-full flex items-center px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                  )}
                  {t('fleet.header.downloadTemplate')}
                </button>
              </div>

              {/* Danger Section */}
              {onClearAll && vehicleCount > 0 && (
                <div className="p-2">
                  <button
                    onClick={() => {
                      setShowActionsMenu(false)
                      onClearAll()
                    }}
                    disabled={clearingAll || isDownloading || isSharing}
                    className="w-full flex items-center px-3 py-2.5 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {clearingAll ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    {clearingAll ? t('fleet.header.clearing') : t('fleet.header.clearAllVehicles')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />
    </>
  )
}