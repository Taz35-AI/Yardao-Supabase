// src/components/stock/ViewInvoiceModal.tsx
// ✅ FIXED: Replaced broken window.print() with jsPDF download
// PDF generation logic separated into generateInvoicePDF.ts
// No more print CSS hacks - just a clean PDF download

'use client'

import React, { useState, useEffect } from 'react'
import { X, FileDown, Pencil } from 'lucide-react'
import { Invoice } from '@/types/stock'
import { stockService } from '@/lib/services/stockService'
import { settingsService, FromCompanyDetails, ToCompanyDetails } from '@/lib/services/settingsService'
import { userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { generateInvoicePDF } from '@/lib/utils/generateInvoicePDF'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface ViewInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice | null
  onStatusChange: () => void
  /** Optional — when provided, an Edit button opens this invoice in the editor. */
  onEdit?: (invoice: Invoice) => void
}

export function ViewInvoiceModal({ isOpen, onClose, invoice, onStatusChange, onEdit }: ViewInvoiceModalProps) {
  const t = useT()
  const { user } = useAuth()
  
  const [fromCompanyDetails, setFromCompanyDetails] = useState<FromCompanyDetails | null>(null)
  const [toCompanyDetails, setToCompanyDetails] = useState<ToCompanyDetails | null>(null)
  const [loadingCompanies, setLoadingCompanies] = useState(false)
  const [downloading, setDownloading] = useState(false)
  // Local copy of the status so the dropdown reflects the change
  // immediately (the parent only reloads the list, not this prop).
  const [statusValue, setStatusValue] = useState<Invoice['status']>(invoice?.status ?? 'draft')
  useEffect(() => {
    if (invoice) setStatusValue(invoice.status)
  }, [invoice])

  // Load company details when modal opens
  useEffect(() => {
    const loadCompanyDetails = async () => {
      if (!isOpen || !invoice || !user?.uid) return
      
      setLoadingCompanies(true)
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (!profile?.organizationId) return

        const [fromCompanies, toCompanies] = await Promise.all([
          settingsService.getFromCompanies(profile.organizationId),
          settingsService.getToCompanies(profile.organizationId)
        ])

        const fromMatch = fromCompanies.find(c => c.name === invoice.fromCompany)
        const toMatch = toCompanies.find(c => c.name === invoice.toCompany)
        
        setFromCompanyDetails(fromMatch || null)
        setToCompanyDetails(toMatch || null)
      } catch (error) {
        logger.error('Error loading company details:', error)
      } finally {
        setLoadingCompanies(false)
      }
    }

    loadCompanyDetails()
  }, [isOpen, invoice, user])

  if (!isOpen || !invoice) return null

  const handleDownloadPDF = () => {
    setDownloading(true)
    try {
      generateInvoicePDF({
        // Use the live status so the PDF reflects a just-changed status
        // (the parent reloads the list, not this modal's invoice prop).
        invoice: { ...invoice, status: statusValue },
        fromCompanyDetails,
        toCompanyDetails,
      })
      toast.success(t('stock.viewInvoice.pdfDownloaded'))
    } catch (error) {
      logger.error('Error generating PDF:', error)
      toast.error(t('stock.viewInvoice.pdfFail'))
    } finally {
      setDownloading(false)
    }
  }

  const handleStatusChange = async (newStatus: Invoice['status']) => {
    if (!invoice?.id) return

    const prevStatus = statusValue
    setStatusValue(newStatus) // optimistic — keep the dropdown on the chosen value
    try {
      await stockService.updateInvoiceStatus(invoice.id, newStatus)
      toast.success(t('stock.viewInvoice.markedAs', { status: t(newStatus === 'paid' ? 'stock.viewInvoice.statusPaid' : newStatus === 'issued' ? 'stock.viewInvoice.statusIssued' : 'stock.viewInvoice.statusDraft') }))
      onStatusChange()
    } catch (error) {
      logger.error('Error updating status:', error)
      toast.error(t('stock.viewInvoice.updateStatusFail'))
      setStatusValue(prevStatus) // revert on failure
    }
  }

  const getStatusBadgeClasses = (status: Invoice['status']): string => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      case 'issued': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl border border-gray-200 dark:border-gray-700 my-8">
        
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('stock.viewInvoice.invoiceNo', { number: invoice.invoiceNumber })}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Status Dropdown */}
            <select
              value={statusValue}
              onChange={(e) => handleStatusChange(e.target.value as Invoice['status'])}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
            >
              <option value="draft">{t('stock.viewInvoice.statusDraft')}</option>
              <option value="issued">{t('stock.viewInvoice.statusIssued')}</option>
              <option value="paid">{t('stock.viewInvoice.statusPaid')}</option>
            </select>

            {/* Edit Button */}
            {onEdit && (
              <button
                onClick={() => onEdit(invoice)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 border border-[#025940]/40 hover:bg-[#025940]/10 text-[#025940] dark:text-[#72A68E] rounded-lg transition-colors text-sm font-medium"
                title={t('stock.viewInvoice.editInvoice')}
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">{t('stock.viewInvoice.editInvoice')}</span>
              </button>
            )}

            {/* Download PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#025940] hover:bg-[#014730] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              title={t('stock.viewInvoice.downloadPdf')}
            >
              {downloading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{t('stock.viewInvoice.downloadPdf')}</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Invoice Preview Content ── */}
        <div className="p-8 max-h-[70vh] overflow-y-auto">
          
          {/* Invoice Title + Status */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t('stock.viewInvoice.invoiceHeading')}</h1>
              <p className="text-lg text-gray-600 dark:text-gray-400">#{invoice.invoiceNumber}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('stock.viewInvoice.datePrefix')}{new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
              </p>
            </div>
            <div className={`px-4 py-2 rounded-lg font-semibold ${getStatusBadgeClasses(statusValue)}`}>
              {statusValue.charAt(0).toUpperCase() + statusValue.slice(1)}
            </div>
          </div>

          {/* From / To Companies */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* From Company */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{t('stock.viewInvoice.from')}</h3>
              <div className="text-gray-900 dark:text-white">
                <p className="font-bold text-lg mb-1">{invoice.fromCompany}</p>
                {fromCompanyDetails ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{fromCompanyDetails.address}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{fromCompanyDetails.postcode}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      <span className="font-medium">{t('stock.viewInvoice.vat')}</span> {fromCompanyDetails.vatNumber}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{t('stock.viewInvoice.companyReg')}</span> {fromCompanyDetails.companyRegNo}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    {loadingCompanies ? t('stock.viewInvoice.loadingDetails') : t('stock.viewInvoice.noDetails')}
                  </p>
                )}
              </div>
            </div>

            {/* To Company */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{t('stock.viewInvoice.to')}</h3>
              <div className="text-gray-900 dark:text-white">
                <p className="font-bold text-lg mb-1">{invoice.toCompany}</p>
                {toCompanyDetails ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{toCompanyDetails.address}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{toCompanyDetails.postcode}</p>
                    {toCompanyDetails.email && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        <span className="font-medium">{t('stock.viewInvoice.email')}</span> {toCompanyDetails.email}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    {loadingCompanies ? t('stock.viewInvoice.loadingDetails') : t('stock.viewInvoice.noDetails')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Vehicle Info */}
          <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 uppercase mb-1">{t('stock.viewInvoice.vehicle')}</h3>
            <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{invoice.vehicleRegistration}</p>
          </div>

          {/* Parts Table */}
          {invoice.parts.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('stock.viewInvoice.parts')}</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                    <th className="text-left py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colPartName')}</th>
                    <th className="text-left py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colPartNumber')}</th>
                    <th className="text-center py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colQty')}</th>
                    <th className="text-right py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colUnitPrice')}</th>
                    <th className="text-right py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.parts.map((part, index) => (
                    <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-2 text-sm text-gray-900 dark:text-white">{part.partName}</td>
                      <td className="py-2 text-sm text-gray-600 dark:text-gray-400">{part.partNumber}</td>
                      <td className="py-2 text-sm text-gray-900 dark:text-white text-center">{part.quantity}</td>
                      <td className="py-2 text-sm text-gray-900 dark:text-white text-right">£{part.unitPrice.toFixed(2)}</td>
                      <td className="py-2 text-sm font-medium text-gray-900 dark:text-white text-right">£{part.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Labour Table */}
          {invoice.labour.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('stock.viewInvoice.labour')}</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                    <th className="text-left py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colDescription')}</th>
                    <th className="text-center py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colHours')}</th>
                    <th className="text-right py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colRate')}</th>
                    <th className="text-right py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t('stock.viewInvoice.colTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.labour.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-2 text-sm text-gray-900 dark:text-white">{item.description}</td>
                      <td className="py-2 text-sm text-gray-900 dark:text-white text-center">{item.hours}h</td>
                      <td className="py-2 text-sm text-gray-900 dark:text-white text-right">£{item.rate.toFixed(2)}/hr</td>
                      <td className="py-2 text-sm font-medium text-gray-900 dark:text-white text-right">£{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 text-gray-600 dark:text-gray-400">
                <span>{t('stock.viewInvoice.subtotal')}</span>
                <span>£{invoice.subtotal.toFixed(2)}</span>
              </div>
              {invoice.vat !== undefined && invoice.vat > 0 && (
                <div className="flex justify-between py-2 text-gray-600 dark:text-gray-400">
                  <span>{t('stock.viewInvoice.vatPct')}</span>
                  <span>£{invoice.vat.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-3 text-xl font-bold text-[#025940] dark:text-[#72A68E] border-t-2 border-[#025940] dark:border-[#72A68E]">
                <span>{t('stock.viewInvoice.total')}</span>
                <span>£{invoice.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>{t('stock.viewInvoice.createdBy')}</p>
            <p className="mt-2 font-medium">{t('stock.viewInvoice.thankYou')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}