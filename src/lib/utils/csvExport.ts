// src/lib/utils/csvExport.ts
// Generic CSV export utilities — used by the Data Management settings tab.
//
// Why this exists: each org-settings collection needs to be exportable to CSV
// so admins can hand data to accountants / insurers without manual scraping.
// One small utility, used by many call sites.

/**
 * Escape a single value for inclusion in a CSV cell.
 *
 * - Coerces null/undefined to empty
 * - Serialises Dates as ISO strings, arrays as `; `-joined values, objects as JSON
 * - Wraps in double quotes if the value contains comma, quote, newline, or carriage return
 * - Doubles internal quotes per RFC 4180
 * - Prefixes a leading `'` to values starting with `=`, `+`, `-`, `@` to prevent CSV injection
 *   when the file is opened in Excel / Google Sheets / LibreOffice
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''

  let str: string
  if (value instanceof Date) {
    str = isNaN(value.getTime()) ? '' : value.toISOString()
  } else if (typeof value === 'object') {
    // Firestore Timestamps have a .toDate() method
    const ts = value as { toDate?: () => Date }
    if (typeof ts.toDate === 'function') {
      str = ts.toDate().toISOString()
    } else if (Array.isArray(value)) {
      str = value.map(v => escapeCell(v).replace(/^"|"$/g, '')).join('; ')
    } else {
      str = JSON.stringify(value)
    }
  } else {
    str = String(value)
  }

  // CSV injection guard
  if (/^[=+\-@]/.test(str)) str = "'" + str

  // Quote if needed
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export interface CsvColumn<T> {
  /** CSV header label */
  header: string
  /** Function that pulls the value for this column from a row */
  value: (row: T) => unknown
}

/**
 * Build a CSV string from an array of rows + a column definition.
 * Output is prefixed with a UTF-8 BOM so Excel opens it correctly.
 */
export function toCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map(c => escapeCell(c.header)).join(',')
  const dataLines = rows.map(row =>
    columns.map(c => escapeCell(c.value(row))).join(',')
  )
  return '﻿' + [headerLine, ...dataLines].join('\r\n')
}

/**
 * Trigger a CSV download in the browser.
 * Filename should NOT include the extension; this function appends `.csv`.
 */
export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Free the object URL after the click is consumed
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Build a sensible filename for an export: `yardao-{slug}-YYYY-MM-DD.csv`
 * Example: `yardao-fleet-2026-05-13`
 */
export function buildExportFilename(slug: string): string {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  return `yardao-${slug}-${date}`
}
