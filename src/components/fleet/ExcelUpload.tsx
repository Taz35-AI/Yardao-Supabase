// src/components/fleet/ExcelUpload.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Upload, Download, FileSpreadsheet, AlertCircle, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'

// Local date parsing function - no imports needed
const parseExcelDate = (excelDate: any): string => {
  if (!excelDate) return ''
  
  // Handle Excel serial number
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  
  // Handle string dates - try UK format first (DD/MM/YYYY)
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
    
    // Try other formats
    const date = new Date(excelDate)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  }
  
  // Handle Date object
  if (excelDate instanceof Date) {
    return excelDate.toISOString().split('T')[0]
  }
  
  return ''
}

interface ExcelUploadProps {
  onUpload: (vehicles: any[]) => Promise<void>
  conditions: string[]
}

export function ExcelUpload({ onUpload, conditions }: ExcelUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDetails(false)
      }
    }

    if (showDetails) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDetails])

  const downloadTemplate = () => {
    // ✅ ADDED: Date Acquired as LAST column after Comments
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
        'Date Acquired': '15/01/2024' // ✅ ADDED
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
        'Date Acquired': '10/03/2024' // ✅ ADDED
      }
    ]

    const worksheet = XLSX.utils.json_to_sheet(template)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fleet Template')
    
    // ✅ UPDATED: Set column widths (added Date Acquired)
    worksheet['!cols'] = [
      { width: 15 }, // Registration
      { width: 12 }, // Make
      { width: 15 }, // Model
      { width: 12 }, // Colour
      { width: 15 }, // Size
      { width: 12 }, // MOT Expiry
      { width: 12 }, // Tax Expiry
      { width: 30 }, // Comments
      { width: 15 }  // ✅ ADDED: Date Acquired
    ]

    // Add comment to date columns explaining format
    if (!worksheet['F1']) worksheet['F1'] = { t: 's', v: 'MOT Expiry' }
    if (!worksheet['G1']) worksheet['G1'] = { t: 's', v: 'Tax Expiry' }
    // ✅ ADDED: Comment for Date Acquired
    if (!worksheet['I1']) worksheet['I1'] = { t: 's', v: 'Date Acquired' }
    
    worksheet['F1'].c = [{ t: "Use format: DD/MM/YYYY", a: "Fleet System" }]
    worksheet['G1'].c = [{ t: "Use format: DD/MM/YYYY", a: "Fleet System" }]
    // ✅ ADDED: Comment for Date Acquired
    worksheet['I1'].c = [{ t: "Use format: DD/MM/YYYY", a: "Fleet System" }]

    XLSX.writeFile(workbook, 'fleet-template.xlsx')
    setShowDetails(false)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const data = await file.arrayBuffer()
      
      // Read with dateNF option to handle dates properly
      const workbook = XLSX.read(data, { 
        type: 'array',
        cellDates: true,
        dateNF: 'dd/mm/yyyy'
      })
      
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      
      // Convert to JSON with raw dates
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: 'dd/mm/yyyy'
      })

      if (jsonData.length === 0) {
        throw new Error('Excel file is empty')
      }

      // ✅ UPDATED: Validate and transform data - added dateAcquired parsing
      const vehicles = jsonData.map((row: any, index) => {
        const vehicle = {
          registration: row.Registration || row['Registration'] || '',
          make: row.Make || row['Make'] || '',
          model: row.Model || row['Model'] || '',
          colour: row.Colour || row['Colour'] || '',
          size: row.Size || row['Size'] || '',
          motExpiry: parseExcelDate(row['MOT Expiry'] || row.MOTExpiry || row.motExpiry),
          taxExpiry: parseExcelDate(row['Tax Expiry'] || row.TaxExpiry || row.taxExpiry),
          comments: row.Comments || row['Comments'] || '',
          dateAcquired: parseExcelDate(row['Date Acquired'] || row.DateAcquired || row.dateAcquired) || new Date().toISOString().split('T')[0],
          condition: 'Excellent'
        }

        // Validate required fields
        if (!vehicle.registration) {
          throw new Error(`Row ${index + 2}: Registration is required`)
        }

        return vehicle
      })

      await onUpload(vehicles)
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      setShowDetails(false)
      
    } catch (error) {
      logger.error('Upload error:', error)
      setError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Mobile: Full screen modal
  if (isMobile) {
    return (
      <>
        <Button
          variant="outline"
          onClick={() => setShowDetails(true)}
          className="w-full sm:w-auto"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Excel Import
        </Button>

        {showDetails && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b p-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Excel Import
                </h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Download the template, fill it with your vehicle data, then upload it back.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    • Use DD/MM/YYYY format for dates<br />
                    • Registration is required<br />
                    • All vehicles set to "Excellent" by default
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="excel-upload-mobile"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Excel File'}
                </Button>
                
                {error && (
                  <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="break-words text-left">{error}</span>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowDetails(false)}
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Desktop: Inline version
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={downloadTemplate}
        className="flex items-center text-xs sm:text-sm h-8 sm:h-10 whitespace-nowrap"
      >
        <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
        Template
      </Button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
        id="excel-upload-desktop"
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center text-xs sm:text-sm h-8 sm:h-10 whitespace-nowrap"
      >
        <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
        {uploading ? 'Uploading...' : 'Upload Excel'}
      </Button>
      
      {error && (
        <div className="flex items-start space-x-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-md max-w-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
    </div>
  )
}