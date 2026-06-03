// src/components/stock/QuickAddStockModal.tsx
// Quick add stock modal - appears when clicking + button

'use client'

import React, { useState, useEffect } from 'react'
import { X, Plus, TrendingUp } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { toast } from 'sonner'
import { StockPart } from '@/types/stock'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface QuickAddStockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  part: StockPart | null
}

export function QuickAddStockModal({ isOpen, onClose, onSuccess, part }: QuickAddStockModalProps) {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('Unknown')
  const [loading, setLoading] = useState(false)
  const [quantity, setQuantity] = useState(1)

  // Fetch organizationId and user profile
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid && isOpen) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserDisplayName(profile.displayName || 'Unknown')
          }
        } catch (error) {
          logger.error('Error fetching user data:', error)
        }
      }
    }
    fetchUserData()
  }, [user, isOpen])

  // Reset quantity when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuantity(1)
    }
  }, [isOpen, part])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!part || !user || !organizationId) return

    if (quantity <= 0) {
      toast.error(t('stock.quickAdd.qtyGtZero'))
      return
    }

    setLoading(true)
    try {
      const newQuantity = part.quantity + quantity
      
      // Update stock quantity
      await stockService.updatePart(part.id!, {
        quantity: newQuantity,
        updatedAt: new Date().toISOString()
      })

      // Save to order history
      await stockService.addOrderHistory(
        part.id!,
        part.partName,
        part.partNumber,
        part.supplier,
        quantity,
        part.unit,
        part.netPrice,
        user.uid,
        userDisplayName,
        organizationId,
        'restock'
      )

      toast.success(t('stock.quickAdd.added', { qty: quantity, unit: part.unit }))
      onSuccess()
      onClose()
      setQuantity(1)
    } catch (error) {
      logger.error('Error adding stock:', error)
      toast.error(t('stock.quickAdd.addFail'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !part) return null

  const newTotal = part.quantity + quantity

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="relative bg-gradient-to-br from-white via-blue-50/30 to-white dark:from-gray-800 dark:via-blue-900/10 dark:to-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-blue-200/50 dark:border-blue-500/30 overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-green-500/5 animate-pulse" />
        
        {/* Content */}
        <div className="relative">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-blue-200/30 dark:border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-green-500/10">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('stock.quickAdd.title')}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{part.partName} - {part.partNumber}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Current Stock Display */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">{t('stock.quickAdd.currentStock')}</p>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {part.quantity} {part.unit}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            {/* Add Quantity Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('stock.quickAdd.addQuantity')}
              </label>
              <input
                type="number"
                min={part.unit === 'liters' ? '0.1' : '1'}
                step={part.unit === 'liters' ? '0.1' : '1'}
                value={quantity}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0
                  if (part.unit === 'pieces') {
                    setQuantity(Math.round(value))
                  } else {
                    setQuantity(value)
                  }
                }}
                className="w-full px-4 py-3 text-lg font-semibold border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all"
                placeholder={t('stock.quickAdd.addQtyPlaceholder')}
                required
                autoFocus
              />
            </div>

            {/* New Total Preview */}
            <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/20 border-2 border-green-300 dark:border-green-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 dark:text-green-300 font-medium">{t('stock.quickAdd.newTotal')}</p>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                    {part.unit === 'pieces' ? Math.round(newTotal) : newTotal.toFixed(1)} {part.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-green-600 dark:text-green-400">{t('stock.quickAdd.adding')}</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">
                    +{quantity} {part.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors font-medium"
                disabled={loading}
              >
                {t('stock.btn.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 shadow-lg shadow-green-500/30 font-semibold"
              >
                {loading ? t('stock.quickAdd.addingBtn') : t('stock.quickAdd.addStock')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}