// src/components/stock/BulkUploadModal.tsx
// Bulk upload parts from CSV file
// ✅ Supports multi make/model (comma-separated)

'use client'

import React, { useState, useRef } from 'react'
import { X, Upload, AlertCircle, CheckCircle, FileText, Download } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'


interface BulkUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedRow {
  itemName: string
  partNumber: string
  makeModel: string[]
  quantity: number
  netPrice: number
}

export function BulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const t = useT()
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<ParsedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Check file type
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error(t('stock.bulk.uploadCsv'))
      return
    }

    setFile(selectedFile)
    parseCSV(selectedFile)
  }

  const parseCSV = async (file: File) => {
    setParsing(true)
    setErrors([])
    setPreview([])

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        setErrors([t('stock.bulk.fileEmpty')])
        setParsing(false)
        return
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase())
      
      // Check required columns
      const requiredColumns = ['item name', 'part number', 'make and model', 'quantity', 'net price']
      const missingColumns = requiredColumns.filter(col => !header.includes(col))
      
      if (missingColumns.length > 0) {
        setErrors([t('stock.bulk.missingColumns', { columns: missingColumns.join(', ') })])
        setParsing(false)
        return
      }

      // Get column indices
      const nameIdx = header.indexOf('item name')
      const partNumIdx = header.indexOf('part number')
      const makeModelIdx = header.indexOf('make and model')
      const qtyIdx = header.indexOf('quantity')
      const priceIdx = header.indexOf('net price')

      // Parse data rows
      const parsed: ParsedRow[] = []
      const parseErrors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        // Split by comma, but preserve commas within quotes
        const columns = parseCSVLine(line)
        
        const itemName = columns[nameIdx]?.trim()
        const partNumber = columns[partNumIdx]?.trim()
        const makeModelRaw = columns[makeModelIdx]?.trim()
        const quantityRaw = columns[qtyIdx]?.trim()
        const priceRaw = columns[priceIdx]?.trim()

        // Validate
        if (!itemName || !partNumber || !makeModelRaw) {
          parseErrors.push(t('stock.bulk.rowMissingFields', { row: i + 1 }))
          continue
        }

        const quantity = parseFloat(quantityRaw)
        const netPrice = parseFloat(priceRaw)

        if (isNaN(quantity) || quantity < 0) {
          parseErrors.push(t('stock.bulk.rowInvalidQty', { row: i + 1, value: quantityRaw }))
          continue
        }

        if (isNaN(netPrice) || netPrice < 0) {
          parseErrors.push(t('stock.bulk.rowInvalidPrice', { row: i + 1, value: priceRaw }))
          continue
        }

        // Parse make/model - split by comma
        const makeModel = makeModelRaw
          .split(',')
          .map(m => m.trim())
          .filter(m => m.length > 0)

        if (makeModel.length === 0) {
          parseErrors.push(t('stock.bulk.rowMakeModelRequired', { row: i + 1 }))
          continue
        }

        parsed.push({
          itemName,
          partNumber,
          makeModel,
          quantity,
          netPrice
        })
      }

      setPreview(parsed)
      setErrors(parseErrors)

      if (parsed.length === 0) {
        toast.error(t('stock.bulk.noValidRows'))
      } else {
        toast.success(t('stock.bulk.parsedReady', { count: parsed.length }))
      }
    } catch (error) {
      logger.error('Error parsing CSV:', error)
      setErrors([t('stock.bulk.parseFail')])
    } finally {
      setParsing(false)
    }
  }

  // Parse CSV line handling quoted values with commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current)
    return result
  }

  const handleUpload = async () => {
    if (preview.length === 0) {
      toast.error(t('stock.bulk.noPartsUpload'))
      return
    }

    if (!user?.uid) {
      toast.error(t('stock.bulk.notAuth'))
      return
    }

    setUploading(true)

    try {
      // Get organization and user details
      const profile = await userProfileService.getProfile(user.uid)
      if (!profile?.organizationId) {
        toast.error(t('stock.bulk.orgNotFound'))
        setUploading(false)
        return
      }

      const organizationId = profile.organizationId
      const userName = profile.displayName || 'Unknown'

      let successCount = 0
      let failCount = 0

      // Upload each part
      for (const row of preview) {
        try {
          const partRef = await stockService.addPart({
            partName: row.itemName,
            partNumber: row.partNumber,
            makeModel: row.makeModel,
            quantity: row.quantity,
            netPrice: row.netPrice,
            restockTarget: 10, // Default restock target
            unit: 'pieces', // Default unit
            organizationId,
            createdBy: user.uid
          })

          // Add to order history
          await stockService.addOrderHistory(
            partRef.id!,
            row.itemName,
            row.partNumber,
            undefined,
            row.quantity,
            'pieces',
            row.netPrice,
            user.uid,
            userName,
            organizationId,
            'initial'
          )

          successCount++
        } catch (error) {
          logger.error(`Failed to upload ${row.partNumber}:`, error)
          failCount++
        }
      }

      if (successCount > 0) {
        toast.success(t('stock.bulk.uploadedOk', { count: successCount }))
        onSuccess()
        onClose()
      }

      if (failCount > 0) {
        toast.error(t('stock.bulk.uploadedFail', { count: failCount }))
      }
    } catch (error) {
      logger.error('Error during bulk upload:', error)
      toast.error(t('stock.bulk.uploadFail'))
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = () => {
    const csvContent = `Item Name,Part Number,Make and model,Quantity,Net price
Air Filter,AF-001,"Ford Transit, Peugeot Boxer",5,12.50
Brake Pads Front,BP-001,Vauxhall Vivaro,10,28.99
Engine Oil,EO-001,"Ford Transit, Renault Trafic, Citroen Relay",20,15.00`

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bulk_upload_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    
    toast.success(t('stock.bulk.templateDownloaded'))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#025940] to-[#012619] px-6 py-4 border-b border-[#025940]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t('stock.bulk.title')}</h2>
                <p className="text-sm text-[#C5D9D0]">{t('stock.bulk.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Download Template */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  {t('stock.bulk.csvFormat')}
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  {t('stock.bulk.requiredColumns')} <code className="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded text-xs font-mono">Item Name, Part Number, Make and model, Quantity, Net price</code>
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  {t('stock.bulk.multipleHint')} <code className="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded text-xs font-mono">Ford Transit, Peugeot Boxer</code>
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
                >
                  <Download className="w-4 h-4" />
                  {t('stock.bulk.downloadTemplate')}
                </button>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('stock.bulk.uploadFile')}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 hover:border-[#025940] dark:hover:border-[#72A68E] transition-colors"
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {file ? file.name : t('stock.bulk.clickSelect')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('stock.bulk.csvRequired')}
              </p>
            </button>
          </div>

          {/* Parsing Status */}
          {parsing && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-[#C5D9D0] border-t-[#025940] rounded-full" />
              <p className="ml-3 text-gray-600 dark:text-gray-400">{t('stock.bulk.parsing')}</p>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                    {t('stock.bulk.parsingErrors', { count: errors.length })}
                  </h3>
                  <ul className="space-y-1 text-sm text-red-700 dark:text-red-300 max-h-40 overflow-y-auto">
                    {errors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-100">
                    {t('stock.bulk.readyToUpload', { count: preview.length })}
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {t('stock.bulk.previewFirst')}
                  </p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-green-200 dark:border-green-800">
                      <th className="text-left py-2 px-2 text-green-900 dark:text-green-100 font-semibold">{t('stock.bulk.colItemName')}</th>
                      <th className="text-left py-2 px-2 text-green-900 dark:text-green-100 font-semibold">{t('stock.bulk.colPartNumber')}</th>
                      <th className="text-left py-2 px-2 text-green-900 dark:text-green-100 font-semibold">{t('stock.bulk.colMakeModel')}</th>
                      <th className="text-right py-2 px-2 text-green-900 dark:text-green-100 font-semibold">{t('stock.bulk.colQty')}</th>
                      <th className="text-right py-2 px-2 text-green-900 dark:text-green-100 font-semibold">{t('stock.bulk.colPrice')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="border-b border-green-100 dark:border-green-900">
                        <td className="py-2 px-2 text-green-800 dark:text-green-200">{row.itemName}</td>
                        <td className="py-2 px-2 text-green-800 dark:text-green-200 font-mono text-xs">{row.partNumber}</td>
                        <td className="py-2 px-2 text-green-800 dark:text-green-200 text-xs">{row.makeModel.join(', ')}</td>
                        <td className="py-2 px-2 text-right text-green-800 dark:text-green-200">{row.quantity}</td>
                        <td className="py-2 px-2 text-right text-green-800 dark:text-green-200">£{row.netPrice.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 5 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2 text-center">
                    {t('stock.bulk.andMore', { count: preview.length - 5 })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
              disabled={uploading}
            >
              {t('stock.btn.cancel')}
            </button>
            <button
              onClick={handleUpload}
              disabled={preview.length === 0 || uploading}
              className="px-6 py-2.5 bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-semibold"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#b3f243]/30 border-t-[#b3f243] rounded-full animate-spin" />
                  <span>{t('stock.bulk.uploading')}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{t('stock.bulk.uploadCount', { count: preview.length })}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}