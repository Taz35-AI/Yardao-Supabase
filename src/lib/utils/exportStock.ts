// src/lib/utils/exportStock.ts
// Export stock to Excel/CSV
// ✅ Exports all stock including zero quantity

import { StockPart } from '@/types/stock'

/**
 * Export stock to CSV format
 */
export function exportStockToCSV(parts: StockPart[]): void {
  // CSV Headers
  const headers = ['Item Name', 'Part Number', 'Make and model', 'Quantity', 'Net price', 'Unit', 'Supplier', 'Comments', 'Restock Target', 'Stock Value']
  
  // CSV Rows
  const rows = parts.map(part => {
    const makeModel = Array.isArray(part.makeModel) 
      ? part.makeModel.join(', ') 
      : part.makeModel || ''
    
    const stockValue = part.quantity * part.netPrice
    
    return [
      escapeCSV(part.partName),
      escapeCSV(part.partNumber),
      escapeCSV(makeModel),
      part.quantity,
      part.netPrice.toFixed(2),
      part.unit,
      escapeCSV(part.supplier || ''),
      escapeCSV(part.comments || ''),
      part.restockTarget,
      stockValue.toFixed(2)
    ].join(',')
  })
  
  // Combine
  const csvContent = [headers.join(','), ...rows].join('\n')
  
  // Download
  downloadFile(csvContent, 'stock_export.csv', 'text/csv')
}

/**
 * Export stock to Excel-compatible CSV (with UTF-8 BOM for special characters)
 */
export function exportStockToExcel(parts: StockPart[]): void {
  // CSV Headers
  const headers = ['Item Name', 'Part Number', 'Make and model', 'Quantity', 'Net price', 'Unit', 'Supplier', 'Comments', 'Restock Target', 'Stock Value']
  
  // CSV Rows
  const rows = parts.map(part => {
    const makeModel = Array.isArray(part.makeModel) 
      ? part.makeModel.join(', ') 
      : part.makeModel || ''
    
    const stockValue = part.quantity * part.netPrice
    
    return [
      escapeCSV(part.partName),
      escapeCSV(part.partNumber),
      escapeCSV(makeModel),
      part.quantity,
      part.netPrice.toFixed(2),
      part.unit,
      escapeCSV(part.supplier || ''),
      escapeCSV(part.comments || ''),
      part.restockTarget,
      stockValue.toFixed(2)
    ].join(',')
  })
  
  // Combine
  const csvContent = [headers.join(','), ...rows].join('\n')
  
  // Add UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF'
  const csvWithBOM = BOM + csvContent
  
  // Download
  downloadFile(csvWithBOM, 'stock_export.csv', 'text/csv;charset=utf-8')
}

/**
 * Escape CSV values (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
  if (!value) return ''
  
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  
  return value
}

/**
 * Download file to user's computer
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}