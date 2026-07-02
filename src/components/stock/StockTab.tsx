// src/components/stock/StockTab.tsx
// 🔥 PREMIUM REDESIGN: calm, flat, brand-first UI (visual only — zero logic changes)
// ✅ PRESERVED: Every single line of functionality - NOTHING removed
// ✅ NEW: Grouped view to consolidate parts by name
// ✅ STYLE RULES: no gradients/glow/scale effects; white cards + #e2e8e5 hairlines;
//    status = dots + left-edge accents; solid #025940 primary buttons; no blue
// ✅ NEW: Utilities menu (Batch/Export/Upload), cleaner action bar
// ✅ NEW: Delete All Stock functionality
// ✅ UPDATED: Brand colours applied throughout (#012619, #025940, #b3f243, #72A68E, #f6f8f7)

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
  Plus, Minus, AlertTriangle, Package, Search, Trash2, 
  Edit2, History, X, PoundSterling, Boxes, Wrench, 
  ChevronDown, ChevronUp, Layers, Check, ArrowUpDown, Scan,
  Upload, Download, Info, MoreVertical, Eye, EyeOff
} from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { vehicleService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { userProfileService } from '@/lib/firestore'
import { StockPart } from '@/types/stock'
import { Vehicle } from '@/lib/firestore'
import { AddPartModal } from './AddPartModal'
import { RemovePartModal } from './RemovePartModal'
import { QuickAddStockModal } from './QuickAddStockModal'
import { EditPartModal } from './EditPartModal'
import { BarcodeScanner } from './BarcodeScanner'
import { ScanActionModal } from './ScanActionModal'
import { BulkUploadModal } from './BulkUploadModal'
import { exportStockToExcel } from '@/lib/utils/exportStock'
import { toast } from 'sonner'
import Image from 'next/image'
import { getPartThumbnail } from '@/lib/utils/partThumbnails'
import { groupPartsByCategory, type PartGroup } from '@/lib/utils/partGrouping'
import { AdjustStockModal } from './AdjustStockModal'
import { Scale } from 'lucide-react'   // add Scale to the existing lucide import line
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'


type SortKey = 'quantity' | 'name' | 'value'
type SortDir = 'asc' | 'desc'

export function StockTab({ autoOpenAddSignal = 0 }: { autoOpenAddSignal?: number } = {}) {
  const t = useT()
  const { user } = useAuth()
  // Owner / Garage Manager may add / edit prices / adjust / delete stock;
  // regular admins keep operational scan in/out only.
  const { canManageStockPrices } = usePermissions()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('Unknown')
  const [parts, setParts] = useState<StockPart[]>([])
  const [lowStockParts, setLowStockParts] = useState<StockPart[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // UI state
  const [showLowOnly, setShowLowOnly] = useState(false)
  // Hide zero-stock parts from the list by default; toggle to reveal them.
  const [hideOutOfStock, setHideOutOfStock] = useState(true)
  const [showGrouped, setShowGrouped] = useState(true) // ✅ DEFAULT TO GROUPED VIEW
  const [sortBy, setSortBy] = useState<SortKey>('quantity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedPartId, setExpandedPartId] = useState<string | null>(null) // ✅ NEW: For individual part expansion
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  
  // Batch mode state
  const [batchMode, setBatchMode] = useState(false)
  const [batchSelected, setBatchSelected] = useState<Record<string, number>>({})
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false)

  // Open the Add Part modal when the mobile bottom-nav "+" FAB fires
  // (the page bumps a signal so this works even when arriving from another tab).
  useEffect(() => {
    if (autoOpenAddSignal > 0) setShowAddModal(true)
  }, [autoOpenAddSignal])
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false)
  const [selectedPart, setSelectedPart] = useState<StockPart | null>(null)
  const [prefillPartNumber, setPrefillPartNumber] = useState<string>('')
  
  const [showEditPartModal, setShowEditPartModal] = useState(false)
  const [editingPart, setEditingPart] = useState<StockPart | null>(null)

  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustingPart, setAdjustingPart] = useState<StockPart | null>(null)

  // Barcode scanning state
  const [showScanner, setShowScanner] = useState(false)
  const [scanMode, setScanMode] = useState<'in' | 'out'>('in')
  const [showScanAction, setShowScanAction] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [scannedPart, setScannedPart] = useState<StockPart | null>(null)

  // Comment popup state
  const [showCommentPopup, setShowCommentPopup] = useState(false)
  const [commentPopupPart, setCommentPopupPart] = useState<StockPart | null>(null)

  // 🔥 NEW: Utilities menu state
  const [showUtilitiesMenu, setShowUtilitiesMenu] = useState(false)

  // ✅ NEW: Delete all stock state
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  // ─── Data Loading ───
  useEffect(() => {
    const fetchOrganizationId = async () => {
      if (user?.uid) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserName(profile.displayName || 'Unknown')
          } else {
            // No org → stop the "Loading parts…" spinner instead of hanging.
            setLoading(false)
          }
        } catch (error) {
          logger.error('Error fetching organization:', error)
          toast.error(t('stock.tab.loadOrgFail'))
          setLoading(false)
        }
      }
    }
    fetchOrganizationId()
  }, [user])

  useEffect(() => {
    if (organizationId) {
      loadParts()
      loadVehicles()
    }
  }, [organizationId])

  const loadParts = async () => {
    if (!organizationId) return
    
    setLoading(true)
    try {
      const [allParts, lowStock] = await Promise.all([
        stockService.getParts(organizationId),
        stockService.getLowStockParts(organizationId)
      ])
      
      setParts(allParts)
      setLowStockParts(lowStock)
    } catch (error) {
      logger.error('Error loading parts:', error)
      toast.error(t('stock.tab.loadPartsFail'))
    } finally {
      setLoading(false)
    }
  }

  const loadVehicles = async () => {
    if (!organizationId) return
    
    try {
      const allVehicles = await vehicleService.getVehicles(organizationId)
      setVehicles(allVehicles)
    } catch (error) {
      logger.error('Error loading vehicles:', error)
    }
  }

  // ─── Handlers ───
  const handleRemovePart = (part: StockPart) => {
    setSelectedPart(part)
    setShowRemoveModal(true)
  }

  const handleQuickAdd = (part: StockPart) => {
    setSelectedPart(part)
    setShowQuickAddModal(true)
  }

  const handleDeletePart = async (partId: string, partName: string) => {
    if (!canManageStockPrices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    if (!confirm(t('stock.tab.confirmDeletePart', { name: partName }))) {
      return
    }

    try {
      await stockService.deletePart(partId)
      toast.success(t('stock.tab.partDeleted'))
      loadParts()
    } catch (error) {
      logger.error('Error deleting part:', error)
      toast.error(t('stock.tab.deletePartFail'))
    }
  }

  const handleEditPart = (part: StockPart) => {
    if (!canManageStockPrices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    setEditingPart(part)
    setShowEditPartModal(true)
  }

  const handleDeleteOrderHistory = async (partId: string, partName: string) => {
    if (!canManageStockPrices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    if (!organizationId) return
    if (!confirm(t('stock.tab.confirmClearHistory', { name: partName }))) {
      return
    }

    try {
      await stockService.deleteOrderHistory(organizationId, partId)
      toast.success(t('stock.tab.historyDeleted'))
    } catch (error) {
      logger.error('Error deleting order history:', error)
      toast.error(t('stock.tab.clearHistoryFail'))
    }
  }

  // ✅ NEW: Delete All Stock Handler
  const handleDeleteAllStock = async () => {
    if (!canManageStockPrices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    if (!organizationId) return

    setIsDeletingAll(true)
    try {
      const deletedCount = await stockService.deleteAllStock(organizationId)
      toast.success(t('stock.tab.bulkDeleted', { count: deletedCount }))
      setShowDeleteAllModal(false)
      loadParts() // Refresh the list
    } catch (error) {
      logger.error('Error deleting all stock:', error)
      toast.error(t('stock.tab.bulkDeleteFail'))
    } finally {
      setIsDeletingAll(false)
    }
  }

  const handleSort = useCallback((key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
  }, [sortBy])

  const toggleBatchSelect = useCallback((partId: string) => {
    setBatchSelected(prev => {
      const next = { ...prev }
      if (next[partId]) {
        delete next[partId]
      } else {
        next[partId] = 1
      }
      return next
    })
  }, [])

  const handleBatchUse = useCallback(() => {
    const selectedPartIds = Object.keys(batchSelected)
    if (selectedPartIds.length === 0) {
      toast.error(t('stock.tab.selectAtLeastOne'))
      return
    }
    const firstPart = parts.find(p => p.id === selectedPartIds[0])
    if (firstPart) {
      setSelectedPart(firstPart)
      setShowRemoveModal(true)
    }
  }, [batchSelected, parts])

  const exitBatchMode = useCallback(() => {
    setBatchMode(false)
    setBatchSelected({})
  }, [])

  const handleExportStock = () => {
    if (parts.length === 0) {
      toast.error(t('stock.tab.noPartsExport'))
      return
    }

    exportStockToExcel(parts)
    toast.success(t('stock.tab.exported', { count: parts.length }))
    setShowUtilitiesMenu(false)
  }

  // Barcode scanning handlers
  const handleScanIn = () => {
    setScanMode('in')
    setShowScanner(true)
  }

  const handleScanOut = () => {
    setScanMode('out')
    setShowScanner(true)
  }

  const handleBarcodeScanned = (barcode: string) => {
    logger.log('📸 Barcode scanned in StockTab:', barcode)

    const barcodeUpper = barcode.toUpperCase().trim()

    const foundPart = parts.find(p => {
      const partNumberUpper = p.partNumber.toUpperCase().trim()

      // 1. Exact match (fastest, highest priority)
      if (partNumberUpper === barcodeUpper) return true

      // 2. Partial match — handles "5400608561180 - 3PK762SF" when scanning "5400608561180"
      //    The scanned barcode appears somewhere inside the combined partNumber field
      if (partNumberUpper.includes(barcodeUpper)) return true

      // 3. Reverse partial — handles scanning the PART number "3PK762SF" to find the same part
      if (barcodeUpper.includes(partNumberUpper)) return true

      return false
    })

    logger.log('🔍 Part found:', foundPart ? foundPart.partName : 'NOT FOUND')
    
    setScannedBarcode(barcode)
    setScannedPart(foundPart || null)
    setShowScanner(false)
    setShowScanAction(true)
    
    logger.log('✅ State updated - scannedBarcode:', barcode)
  }

  const handleScanAddStock = async (quantity: number) => {
    if (!scannedPart || !user || !organizationId) return

    try {
      await stockService.addOrderHistory(
        scannedPart.id!,
        scannedPart.partName,
        scannedPart.partNumber,
        scannedPart.supplier,
        quantity,
        scannedPart.unit,
        scannedPart.netPrice,
        user.uid,
        userName,
        organizationId,
        'restock'
      )

      await stockService.updatePart(scannedPart.id!, {
        quantity: scannedPart.quantity + quantity
      })

      toast.success(t('stock.tab.addedStock', { qty: quantity, unit: scannedPart.unit, name: scannedPart.partName }))
      loadParts()
    } catch (error) {
      logger.error('Error adding stock:', error)
      toast.error(t('stock.tab.addStockFail'))
      throw error
    }
  }

  const handleScanRemoveStock = async (quantity: number, vehicleId: string, vehicleReg: string) => {
    if (!scannedPart || !user || !organizationId) return

    try {
      await stockService.removePartQuantity(
        scannedPart.id!,
        quantity,
        vehicleId,
        vehicleReg,
        user.uid,
        userName,
        organizationId,
        `Scanned out: ${scannedPart.partNumber}`
      )

      toast.success(t('stock.tab.removedStock', { qty: quantity, unit: scannedPart.unit, name: scannedPart.partName }))
      loadParts()
    } catch (error) {
      logger.error('Error removing stock:', error)
      toast.error(t('stock.tab.removeStockFail'))
      throw error
    }
  }

  const handleCreateNewPartFromScan = () => {
    logger.log('➕ Creating new part from scan')
    logger.log('📋 Current scannedBarcode:', scannedBarcode)
    
    const barcodeToUse = scannedBarcode
    
    if (!barcodeToUse) {
      logger.error('❌ No barcode to use!')
      toast.error(t('stock.tab.noBarcode'))
      return
    }
    
    setShowScanAction(false)
    
    setTimeout(() => {
      logger.log('✅ Setting prefillPartNumber to:', barcodeToUse)
      setPrefillPartNumber(barcodeToUse)
      setShowAddModal(true)
    }, 50)
  }

  // ─── Filtering + Sorting ───
  const filteredParts = parts
    .filter(part => {
      const term = searchTerm.toLowerCase()
      
      const makeModelString = Array.isArray(part.makeModel) 
        ? part.makeModel.join(' ').toLowerCase() 
        : ((part.makeModel as string) || '').toLowerCase()
      
      const keywords = term.split(/\s+/).filter(k => k.length > 0)
      
      const searchableText = [
        part.partName.toLowerCase(),
        part.partNumber.toLowerCase(),
        makeModelString,
        part.supplier || '',
        part.comments || '',
        part.linkedRegistration || '',
      ].join(' ')
      
      const matchesSearch = keywords.length === 0 || keywords.every(keyword => {
        // Short queries (1-2 chars): match part number start only
        if (keyword.length <= 2) {
          return part.partNumber.toLowerCase().startsWith(keyword)
        }
        // Always check linked registration without spaces (handles HK72XOZ vs HK72 XOZ)
        const linkedReg = (part.linkedRegistration || '').toLowerCase().replace(/\s+/g, '')
        const keywordClean = keyword.replace(/\s+/g, '')
        if (linkedReg && linkedReg.includes(keywordClean)) return true
        // Normal queries: search everywhere
        return searchableText.includes(keyword)
      })
      
      const matchesLow = !showLowOnly || part.quantity < part.restockTarget
      // Out-of-stock (qty 0) hidden by default; the toggle reveals them.
      const matchesStock = !hideOutOfStock || part.quantity > 0
      return matchesSearch && matchesLow && matchesStock
    })
    .sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1
      if (sortBy === 'quantity') return (a.quantity - b.quantity) * mult
      if (sortBy === 'value') return ((a.quantity * a.netPrice) - (b.quantity * b.netPrice)) * mult
      if (sortBy === 'name') return a.partName.localeCompare(b.partName) * mult
      return 0
    })

  // ✅ SMART CATEGORY GROUPING - Groups by keywords (Filters, Pads, Discs, etc.)
  const categoryGroups = groupPartsByCategory(filteredParts)

  const totalValue = parts.reduce((sum, part) => sum + (part.quantity * part.netPrice), 0)
  const totalParts = parts.reduce((sum, part) => sum + part.quantity, 0)
  const lowCount = parts.filter(p => p.quantity < p.restockTarget).length
  const outCount = parts.filter(p => p.quantity === 0).length

  // ─── Stock status helpers ───
  const getStockStatus = (part: StockPart) => {
    if (part.quantity === 0) return 'out'
    if (part.quantity < part.restockTarget) return 'low'
    return 'ok'
  }

  const getBorderColor = (status: string) => {
    if (status === 'out') return 'border-l-red-500'
    if (status === 'low') return 'border-l-amber-400'
    return 'border-l-[#72A68E]'
  }

  const getQuantityStyles = (status: string) => {
    if (status === 'out') return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-transparent'
    if (status === 'low') return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-transparent'
    return 'bg-[#f0f7f4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] border-transparent'
  }

  const displayMakeModel = (makeModel: string | string[]) => {
    if (Array.isArray(makeModel)) {
      return makeModel.join(', ')
    }
    return makeModel || ''
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 🔥 ULTRA COMPACT STATS - Horizontal Mini Pills (70% smaller on mobile) */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Total Items */}
        {/* ✅ FIXED: Brand border hover */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E] transition-colors cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[#012619] flex items-center justify-center flex-shrink-0">
            <Layers className="w-3 h-3 sm:w-4 sm:h-4 text-[#b3f243]" />
          </div>
          <div>
            {/* ✅ FIXED: Brand muted text */}
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.tab.statItems')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">{totalParts.toFixed(0)}</p>
          </div>
        </div>

        {/* Stock Value */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E] transition-colors cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[#012619] flex items-center justify-center flex-shrink-0">
            <PoundSterling className="w-3 h-3 sm:w-4 sm:h-4 text-[#b3f243]" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.tab.statValue')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">£{totalValue.toFixed(0)}</p>
          </div>
        </div>

        {/* Low Stock */}
        <button
          onClick={() => setShowLowOnly(!showLowOnly)}
          className={`group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border transition-colors ${
            showLowOnly
              ? 'bg-white dark:bg-gray-800 border-[#025940] dark:border-[#72A68E]'
              : 'bg-white dark:bg-gray-800 border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E]'
          }`}
        >
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.tab.statLow')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">{lowCount}</p>
          </div>
        </button>

        {/* Out of Stock */}
        <button
          onClick={() => setShowLowOnly(!showLowOnly)}
          className={`group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border transition-colors ${
            showLowOnly
              ? 'bg-white dark:bg-gray-800 border-[#025940] dark:border-[#72A68E]'
              : 'bg-white dark:bg-gray-800 border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E]'
          }`}
        >
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.tab.statOut')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">{outCount}</p>
          </div>
        </button>
      </div>

      {/* 🔥 PREMIUM ACTION BAR - Glass Effect with Utilities Menu */}
      {/* ✅ FIXED: Brand background instead of white/70 */}
      <div className="sticky top-0 z-30 bg-[#f6f8f7] dark:bg-gray-900 py-3 -mx-2 px-2 sm:-mx-4 sm:px-4 lg:-mx-8 lg:px-8 border-b border-[#e2e8e5] dark:border-gray-700/60">
        <div className="flex gap-2 items-center flex-nowrap md:flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-0 md:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
            <input
              type="text"
              placeholder={t('stock.tab.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 border border-[#e2e8e5] dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/20 focus:border-[#025940] dark:focus:border-[#72A68E] transition-colors text-sm font-medium placeholder:text-[#72A68E]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#72A68E] hover:text-[#012619] dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* ✅ Group Toggle Button — icon-only on mobile to keep one row */}
          <button
            onClick={() => setShowGrouped(!showGrouped)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors flex-shrink-0 ${
              showGrouped
                ? 'bg-[#025940] dark:bg-[#025940] border-transparent text-white'
                : 'bg-white dark:bg-gray-800 text-[#72A68E] dark:text-gray-400 border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E]'
            }`}
            title={showGrouped ? t('stock.tab.showAll') : t('stock.tab.group')}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showGrouped ? t('stock.tab.showAll') : t('stock.tab.group')}</span>
          </button>

          {/* Out-of-stock visibility toggle — zero-stock parts hidden by default */}
          <button
            onClick={() => setHideOutOfStock(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors flex-shrink-0 ${
              hideOutOfStock
                ? 'bg-white dark:bg-gray-800 text-[#72A68E] dark:text-gray-400 border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E]'
                : 'bg-[#025940] dark:bg-[#025940] border-transparent text-white'
            }`}
            title={hideOutOfStock ? t('stock.tab.showOutOfStock') : t('stock.tab.hideOutOfStock')}
          >
            {hideOutOfStock ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{hideOutOfStock ? t('stock.tab.showOutOfStock') : t('stock.tab.hideOutOfStock')}</span>
          </button>

          {/* Scan Buttons Group */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-1.5 border border-[#e2e8e5] dark:border-gray-700 flex-shrink-0">
            <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
            <button
              onClick={handleScanIn}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2.5 rounded-md sm:rounded-xl text-[10px] sm:text-xs font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors whitespace-nowrap"
            >
              <span className="hidden xs:inline">{t('stock.tab.scanIn')}</span>
              <span className="xs:hidden">{t('stock.tab.in')}</span>
            </button>
            <button
              onClick={handleScanOut}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2.5 rounded-md sm:rounded-xl text-[10px] sm:text-xs font-semibold border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-700 text-[#025940] dark:text-[#72A68E] hover:bg-[#f0f7f4] dark:hover:bg-[#025940]/20 transition-colors whitespace-nowrap"
            >
              <span className="hidden xs:inline">{t('stock.tab.scanOut')}</span>
              <span className="xs:hidden">{t('stock.tab.out')}</span>
            </button>
          </div>

          {/* 🔥 Utilities Menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowUtilitiesMenu(!showUtilitiesMenu)}
              onBlur={() => setTimeout(() => setShowUtilitiesMenu(false), 200)}
              className="flex items-center gap-1.5 p-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#72A68E] dark:text-gray-400 hover:border-[#72A68E] dark:hover:border-[#72A68E] hover:text-[#025940] dark:hover:text-[#72A68E] transition-colors"
              title={t('stock.tab.moreOptions')}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            
            {/* Dropdown Menu */}
            {showUtilitiesMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-[#e2e8e5] dark:border-gray-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <button
                  onClick={() => {
                    setBatchMode(true)
                    setShowUtilitiesMenu(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#012619] dark:text-gray-300 hover:bg-[#f6f8f7] dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Layers className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                  {t('stock.tab.batchMode')}
                </button>
                <button
                  onClick={handleExportStock}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#012619] dark:text-gray-300 hover:bg-[#f6f8f7] dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Download className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                  {t('stock.tab.exportStock')}
                </button>
                <button
                  onClick={() => {
                    setShowBulkUploadModal(true)
                    setShowUtilitiesMenu(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#012619] dark:text-gray-300 hover:bg-[#f6f8f7] dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Upload className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                  {t('stock.tab.bulkUpload')}
                </button>
                
                {/* ✅ DANGER ZONE - Delete All */}
                <div className="border-t border-[#e2e8e5] dark:border-gray-700 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setShowDeleteAllModal(true)
                      setShowUtilitiesMenu(false)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('stock.tab.deleteAllStock')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add Part Button - Hero CTA — owner / Garage Manager only */}
          {canManageStockPrices && (
          <button
            onClick={() => setShowAddModal(true)}
            className="hidden md:flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors whitespace-nowrap flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t('stock.tab.addPart')}</span>
          </button>
          )}
        </div>

        {/* Batch Mode Bar */}
        {batchMode && (
          <div className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#012619] animate-in slide-in-from-top-2 duration-200">
            <span className="text-xs font-semibold text-[#C5D9D0]">
              {t(Object.keys(batchSelected).length === 1 ? 'stock.tab.selectedOne' : 'stock.tab.selectedMany', { count: Object.keys(batchSelected).length })}
            </span>
            <div className="flex-1" />
            <button
              onClick={exitBatchMode}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#C5D9D0] hover:text-white hover:bg-white/10 transition-colors"
            >
              {t('stock.btn.cancel')}
            </button>
            <button
              onClick={handleBatchUse}
              disabled={Object.keys(batchSelected).length === 0}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                Object.keys(batchSelected).length > 0
                  ? 'bg-[#b3f243] text-[#012619] hover:bg-[#c5ff5e]'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {t('stock.tab.useOnVehicle')}
            </button>
          </div>
        )}

        {/* Sort Pills */}
        <div className="flex gap-1.5 mt-2 items-center flex-wrap">
          {/* ✅ FIXED: Brand muted text */}
          <span className="text-[10px] sm:text-xs font-semibold text-[#72A68E] dark:text-gray-400 uppercase tracking-wider">{t('stock.tab.sort')}</span>
          {([
            { key: 'quantity' as SortKey, label: 'Qty' },
            { key: 'name' as SortKey, label: 'Name' },
            { key: 'value' as SortKey, label: 'Value' },
          ]).map(s => (
            <button
              key={s.key}
              onClick={() => handleSort(s.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                sortBy === s.key
                  ? 'border-[#025940] dark:border-[#72A68E] bg-[#025940]/10 dark:bg-[#025940]/30 text-[#012619] dark:text-[#72A68E]'
                  : 'border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#72A68E] dark:text-gray-400 hover:border-[#025940]/30'
              }`}
            >
              {s.key === 'quantity' ? t('stock.tab.sortQty') : s.key === 'name' ? t('stock.tab.sortName') : t('stock.tab.sortValue')}
              {sortBy === s.key && (
                <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
          <span className="text-[11px] text-[#72A68E] dark:text-gray-500 ml-1">
            {t(filteredParts.length === 1 ? 'stock.tab.countOne' : 'stock.tab.countMany', { count: filteredParts.length })}
          </span>
        </div>
      </div>

      {/* 🔥 PREMIUM PARTS LIST */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-[#C5D9D0] border-t-[#025940] rounded-full animate-spin" />
          <p className="mt-4 text-[#72A68E] dark:text-gray-400 text-sm">{t('stock.tab.loadingParts')}</p>
        </div>
      ) : filteredParts.length === 0 ? (
        <div className="py-12 text-center">
          <Package className="w-14 h-14 text-[#72A68E]/40 dark:text-gray-600 mx-auto mb-3" />
          {/* ✅ FIXED: Brand dark text */}
          <p className="text-lg font-bold text-[#012619] dark:text-white">
            {showLowOnly ? t('stock.tab.emptyNoLow') : t('stock.tab.emptyNoParts')}
          </p>
          <p className="text-sm text-[#72A68E] dark:text-gray-400 mt-1">
            {searchTerm
              ? t('stock.tab.emptyTrySearch')
              : showLowOnly
                ? t('stock.tab.emptyAllAbove')
                : t('stock.tab.emptyAddFirst')
            }
          </p>
          {!searchTerm && !showLowOnly && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors"
            >
              <Plus className="w-4 h-4 inline mr-1.5" />
              {t('stock.tab.addYourFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {showGrouped ? (
            // ✅ SMART CATEGORY VIEW - EuroCarParts Style
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {categoryGroups.map((group) => {
                const isExpanded = expandedId === group.category
                const statusColor = group.hasOutOfStock
                  ? 'border-l-red-500'
                  : group.hasLowStock
                    ? 'border-l-amber-400'
                    : 'border-l-[#72A68E]'

                return (
                  <div
                    key={group.category}
                    className={`bg-white dark:bg-gray-800 rounded-2xl border border-[#e2e8e5] dark:border-gray-700 border-l-4 ${statusColor} transition-shadow duration-200 hover:shadow-sm overflow-hidden ${
                      isExpanded ? 'col-span-full' : ''
                    }`}
                  >
                    {/* Category Card Header */}
                    <div 
                      className="relative p-6 cursor-pointer bg-white dark:bg-gray-800"
                      onClick={() => setExpandedId(isExpanded ? null : group.category)}
                    >
                      <div className="relative flex items-center gap-4">
                        {/* Category Icon - Supports both emoji and image */}
                        <div className="w-16 h-16 rounded-2xl bg-[#f0f7f4] dark:bg-[#025940]/20 border border-[#e2e8e5] dark:border-[#025940]/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {group.icon.startsWith('/') || group.icon.startsWith('http') ? (
                            // Image icon with lazy loading
                            <Image
                              src={group.icon}
                              alt={group.label}
                              width={64}
                              height={64}
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to emoji if image fails
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                target.parentElement!.innerHTML = '<span class="text-3xl">📦</span>'
                              }}
                            />
                          ) : (
                            // Emoji icon
                            <span className="text-3xl">{group.icon}</span>
                          )}
                        </div>

                        {/* Category Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-2">
                            {/* ✅ FIXED: Brand dark text for category titles */}
                            <h3 className="text-xl font-semibold text-[#012619] dark:text-white">
                              {group.label}
                            </h3>
                            <span className="px-3 py-1 rounded-full bg-[#f0f7f4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] text-xs font-medium">
                              {t(group.parts.length === 1 ? 'stock.tab.groupCountOne' : 'stock.tab.groupCountMany', { count: group.parts.length })}
                            </span>
                          </div>
                          {/* ✅ FIXED: Brand muted text for sub-info */}
                          <div className="flex items-center gap-4 text-sm text-[#72A68E] dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Package className="w-4 h-4" />
                              <span className="font-bold">{group.totalQuantity.toFixed(0)}</span> {t('stock.tab.groupItems')}
                            </span>
                            <span className="flex items-center gap-1">
                              <PoundSterling className="w-4 h-4" />
                              <span className="font-bold text-[#025940] dark:text-[#72A68E]">£{group.totalValue.toFixed(2)}</span>
                            </span>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {group.hasOutOfStock && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400"></span>
                              {t('stock.tab.badgeOutOfStock')}
                            </span>
                          )}
                          {group.hasLowStock && !group.hasOutOfStock && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400"></span>
                              {t('stock.tab.badgeLowStock')}
                            </span>
                          )}
                          <button
                            className={`p-2 rounded-lg hover:bg-[#f6f8f7] dark:hover:bg-gray-700 transition-all ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          >
                            <ChevronDown className="w-5 h-5 text-[#72A68E]" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Parts Grid */}
                    {isExpanded && (
                      <div className="p-4 bg-[#f6f8f7]/50 dark:bg-gray-900/50 border-t-2 border-[#e2e8e5] dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {group.parts.map((part) => {
                            const status = getStockStatus(part)
                            const stockValue = part.quantity * part.netPrice
                            const thumbnailPath = getPartThumbnail(part.partName)
                            const hasError = imageErrors[part.id!]
                            const isPartExpanded = expandedPartId === part.id

                            return (
                              <div
                                key={part.id}
                                className="bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E] transition-colors overflow-hidden"
                              >
                                {/* Part Card - Clickable */}
                                <div className="p-4">
                                  {/* Part Header with Thumbnail */}
                                  <div 
                                    className="flex items-start gap-3 mb-3 cursor-pointer"
                                    onClick={() => setExpandedPartId(isPartExpanded ? null : part.id!)}
                                  >
                                    {/* Thumbnail */}
                                    {hasError || !thumbnailPath ? (
                                      <div className="w-14 h-14 rounded-lg bg-[#012619]/10 dark:bg-[#012619]/20 border border-[#C5D9D0] dark:border-[#025940]/30 flex items-center justify-center flex-shrink-0">
                                        <Package className="w-6 h-6 text-[#025940] dark:text-[#72A68E]" />
                                      </div>
                                    ) : (
                                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#012619]/10 dark:bg-[#012619]/20 border border-[#C5D9D0] dark:border-[#025940]/30 flex-shrink-0">
                                        <Image
                                          src={thumbnailPath}
                                          alt={part.partName}
                                          width={56}
                                          height={56}
                                          loading="lazy"
                                          className="w-full h-full object-cover"
                                          onError={() => {
                                            setImageErrors(prev => ({ ...prev, [part.id!]: true }))
                                          }}
                                        />
                                      </div>
                                    )}

                                    {/* Part Details */}
                                    <div className="flex-1 min-w-0">
                                      {/* ✅ FIXED: Brand dark text */}
                                      <h4 className="font-bold text-sm text-[#012619] dark:text-white mb-1 line-clamp-2">
                                        {part.partName}
                                      </h4>
                                      <p className="text-xs font-mono text-[#72A68E] mb-1">
                                        {part.partNumber}
                                      </p>
                                      <p className="text-xs text-[#72A68E] dark:text-gray-400 line-clamp-1">
                                        {displayMakeModel(part.makeModel)}
                                      </p>
                                      {part.linkedRegistration && (
                                        <div className="flex items-center gap-1 mt-1">
                                          <span className="bg-[#012619] border border-[#b3f243]/40 rounded px-1.5 py-0.5 font-mono font-bold tracking-widest text-[#b3f243] text-[10px]">
                                            {part.linkedRegistration}
                                          </span>
                                          <span className="text-[10px] text-[#72A68E]">{t('stock.tab.oneOff')}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Info Button & Expand Chevron */}
                                    <div className="flex items-start gap-2 flex-shrink-0">
                                      {part.comments && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setCommentPopupPart(part)
                                            setShowCommentPopup(true)
                                          }}
                                          className="w-6 h-6 rounded-full bg-[#f0f7f4] dark:bg-[#025940]/20 flex items-center justify-center hover:bg-[#e2e8e5] dark:hover:bg-[#025940]/40 transition-colors"
                                        >
                                          <Info className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                                        </button>
                                      )}
                                      <button
                                        className={`p-1 rounded-lg hover:bg-[#f6f8f7] dark:hover:bg-gray-700 transition-all ${
                                          isPartExpanded ? 'rotate-180' : ''
                                        }`}
                                      >
                                        <ChevronDown className="w-4 h-4 text-[#72A68E]" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Stats Grid */}
                                  <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-[#f6f8f7] dark:bg-gray-900/50 rounded-lg">
                                    <div className="text-center">
                                      <p className="text-[9px] font-semibold text-[#72A68E] uppercase">{t('stock.tab.price')}</p>
                                      <p className="text-xs font-bold text-[#012619] dark:text-white">£{part.netPrice.toFixed(2)}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[9px] font-semibold text-[#72A68E] uppercase">{t('stock.tab.value')}</p>
                                      <p className="text-xs font-bold text-[#012619] dark:text-white">£{stockValue.toFixed(2)}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[9px] font-semibold text-[#72A68E] uppercase">{t('stock.tab.stock')}</p>
                                      <div className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${getQuantityStyles(status)}`}>
                                        {part.unit === 'liters' ? `${part.quantity.toFixed(1)}L` : Math.round(part.quantity)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleQuickAdd(part)}
                                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#025940] dark:text-[#72A68E] hover:bg-[#f0f7f4] hover:border-[#72A68E] dark:hover:bg-[#025940]/20 transition-colors text-xs font-semibold"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      {t('stock.btn.add')}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedPart(part)
                                        setShowRemoveModal(true)
                                      }}
                                      disabled={part.quantity === 0}
                                      className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                        part.quantity === 0
                                          ? 'bg-[#f6f8f7] dark:bg-gray-700 text-[#72A68E] dark:text-gray-500 cursor-not-allowed'
                                          : 'bg-[#025940] text-white hover:bg-[#012619]'
                                      }`}
                                    >
                                      <Wrench className="w-3.5 h-3.5" />
                                      {t('stock.btn.use')}
                                    </button>
                                  </div>
                                </div>

                                {/* ✅ EXPANDED PART DETAILS */}
                                {isPartExpanded && (
                                  <div className="border-t-2 border-[#e2e8e5] dark:border-gray-700 p-4 bg-[#f6f8f7]/50 dark:bg-gray-900/50 animate-in slide-in-from-top-1 duration-200">
                                    {/* Detailed Stats Grid */}
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                      <div className="px-2 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                                        <p className="text-[9px] font-semibold text-[#72A68E] uppercase tracking-wider mb-0.5">{t('stock.tab.timesUsed')}</p>
                                        <p className="text-xs font-semibold text-[#012619] dark:text-white">{part.totalUsageCount || 0}</p>
                                      </div>
                                      <div className="px-2 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                                        <p className="text-[9px] font-semibold text-[#72A68E] uppercase tracking-wider mb-0.5">{t('stock.tab.restockAt')}</p>
                                        <p className="text-xs font-semibold text-[#012619] dark:text-white">{part.restockTarget}</p>
                                      </div>
                                      <div className="px-2 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                                        <p className="text-[9px] font-semibold text-[#72A68E] uppercase tracking-wider mb-0.5">{t('stock.tab.lastUsed')}</p>
                                        <p className="text-xs font-semibold text-[#012619] dark:text-white">{part.lastUsedDate || t('stock.tab.never')}</p>
                                      </div>
                                    </div>

                                    {/* Supplier Info */}
                                    {part.supplier && (
                                      <div className="mb-3 p-2 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 rounded-lg">
                                        <p className="text-[9px] font-semibold text-[#72A68E] uppercase tracking-wider mb-0.5">{t('stock.tab.supplier')}</p>
                                        <p className="text-xs font-semibold text-[#012619] dark:text-white">{part.supplier}</p>
                                      </div>
                                    )}

                                    {/* Comments */}
                                    {part.comments && (
                                      <div className="mb-3 p-3 bg-[#f6f8f7] dark:bg-gray-900/40 border border-[#e2e8e5] dark:border-gray-700 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Info className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                                          <p className="text-[9px] font-bold text-[#72A68E] dark:text-gray-400 uppercase tracking-wider">{t('stock.tab.comments')}</p>
                                        </div>
                                        <p className="text-xs text-[#012619] dark:text-white">{part.comments}</p>
                                      </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => { setAdjustingPart(part); setShowAdjustModal(true) }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#025940] dark:text-[#72A68E] hover:bg-[#025940]/10 dark:hover:bg-[#025940]/20 transition-colors"
                                        title={t('stock.tab.adjustStock')}
                                      >
                                        <Scale className="w-4 h-4" />
                                        <span className="hidden sm:inline">{t('stock.tab.adjustStock')}</span>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteOrderHistory(part.id!, part.partName)}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-400 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                      >
                                        <History className="w-3.5 h-3.5" />
                                        {t('stock.tab.clearHistory')}
                                      </button>
                                      <button
                                        onClick={() => handleDeletePart(part.id!, part.partName)}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {t('stock.btn.delete')}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            // ✅ NORMAL VIEW (EXISTING CODE)
            filteredParts.map((part) => {
              const status = getStockStatus(part)
              const isExpanded = expandedId === part.id
              const isSelected = batchMode && batchSelected[part.id!]
              const stockValue = part.quantity * part.netPrice

              return (
                <div
                  key={part.id}
                  className={`
                    group bg-white dark:bg-gray-800 rounded-xl border-l-4 
                    ${getBorderColor(status)}
                    ${isSelected 
                      ? 'border-[#b3f243] dark:border-[#b3f243] ring-2 ring-[#b3f243]/30 bg-[#b3f243]/5 dark:bg-[#b3f243]/5' 
                      : 'border-[#e2e8e5] dark:border-gray-700'
                    }
                    transition-shadow duration-200 hover:shadow-sm relative overflow-hidden
                  `}
                >

                  {/* Main Row */}
                  <div className="relative flex items-center p-3 sm:p-4 gap-3">
                    {/* Batch Checkbox */}
                    {batchMode && (
                      <button
                        onClick={() => toggleBatchSelect(part.id!)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected
                            ? 'border-[#025940] bg-[#025940]'
                            : 'border-[#C5D9D0] dark:border-gray-600 bg-white dark:bg-gray-700'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#b3f243]" />}
                      </button>
                    )}

                    {/* Thumbnail */}
                    {(() => {
                      const thumbnailPath = getPartThumbnail(part.partName)
                      const hasError = imageErrors[part.id!]
                      
                      if (hasError) {
                        return (
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#012619]/10 dark:bg-[#012619]/20 border border-[#C5D9D0] dark:border-[#025940]/30 flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-[#025940] dark:text-[#72A68E]" />
                          </div>
                        )
                      }
                      
                      return (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-[#012619]/10 dark:bg-[#012619]/20 border border-[#C5D9D0] dark:border-[#025940]/30 flex-shrink-0">
                          <Image
                            src={thumbnailPath}
                            alt={part.partName}
                            width={56}
                            height={56}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={() => {
                              setImageErrors(prev => ({ ...prev, [part.id!]: true }))
                            }}
                          />
                        </div>
                      )
                    })()}

                    {/* Part Info */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : part.id!)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* ✅ FIXED: Brand dark text */}
                        <span className="text-sm font-bold text-[#012619] dark:text-white truncate">
                          {part.partName}
                        </span>
                        
                        {part.comments && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setCommentPopupPart(part)
                              setShowCommentPopup(true)
                            }}
                            className="w-5 h-5 rounded-full bg-[#f0f7f4] dark:bg-[#025940]/20 flex items-center justify-center hover:bg-[#e2e8e5] dark:hover:bg-[#025940]/40 transition-colors flex-shrink-0"
                            title={t('stock.tab.viewComments')}
                          >
                            <Info className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                          </button>
                        )}
                        
                        <span className="text-[11px] font-medium text-[#72A68E] dark:text-[#72A68E] font-mono">
                          {part.partNumber}
                        </span>
                      </div>
                      <div className="flex gap-2 mt-0.5 text-[11px] text-[#72A68E] dark:text-gray-400 flex-wrap">
                        <span>{displayMakeModel(part.makeModel)}</span>
                        {part.supplier && (
                          <span className="text-[#72A68E]">• {part.supplier}</span>
                        )}
                        {part.linkedRegistration && (
                          <span className="flex items-center gap-1">
                            <span className="bg-[#012619] border border-[#b3f243]/40 rounded px-1.5 py-0.5 font-mono font-bold tracking-widest text-[#b3f243] text-[10px]">
                              {part.linkedRegistration}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Inline Quantity Controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleQuickAdd(part)}
                        className="w-8 h-8 rounded-lg border border-[#C5D9D0] dark:border-[#025940] bg-[#f0f7f4] dark:bg-[#025940]/20 flex items-center justify-center hover:bg-[#025940] dark:hover:bg-[#025940]/40 hover:text-white transition-all"
                        title={t('stock.tab.addStockTitle')}
                      >
                        <Plus className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
                      </button>

                      <div className={`min-w-[48px] text-center px-2 py-1 rounded-lg font-semibold text-sm font-mono border ${getQuantityStyles(status)}`}>
                        {part.unit === 'liters' ? `${part.quantity.toFixed(1)}L` : Math.round(part.quantity)}
                      </div>
                    </div>

                    {/* Use Button */}
                    {!batchMode && (
                      <button
                        onClick={() => handleRemovePart(part)}
                        disabled={part.quantity === 0}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
                          part.quantity === 0
                            ? 'bg-[#f6f8f7] dark:bg-gray-700 text-[#72A68E] dark:text-gray-500 cursor-not-allowed'
                            : 'bg-[#025940] text-white hover:bg-[#012619]'
                        }`}
                        title={t('stock.tab.useOnVehicleTitle')}
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('stock.btn.use')}</span>
                      </button>
                    )}

                    {/* Expand Chevron */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : part.id!)}
                      className={`p-1 text-[#72A68E] hover:text-[#012619] dark:hover:text-gray-300 transition-transform duration-200 flex-shrink-0 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="relative border-t border-[#e2e8e5] dark:border-gray-700 px-3 sm:px-4 pb-3 sm:pb-4 pt-3 bg-[#f6f8f7]/60 dark:bg-gray-900/20 animate-in slide-in-from-top-1 duration-200">
                      {/* Detail Grid */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-[#72A68E] dark:text-gray-500 uppercase tracking-wider mb-0.5">{t('stock.tab.netPrice')}</p>
                          <p className="text-sm font-semibold text-[#012619] dark:text-white">£{part.netPrice.toFixed(2)}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-[#72A68E] dark:text-gray-500 uppercase tracking-wider mb-0.5">{t('stock.tab.totalValue')}</p>
                          <p className="text-sm font-semibold text-[#012619] dark:text-white">£{stockValue.toFixed(2)}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-[#72A68E] dark:text-gray-500 uppercase tracking-wider mb-0.5">{t('stock.tab.timesUsed')}</p>
                          <p className="text-sm font-semibold text-[#012619] dark:text-white">{part.totalUsageCount || 0}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-[#72A68E] dark:text-gray-500 uppercase tracking-wider mb-0.5">{t('stock.tab.restockAt')}</p>
                          <p className="text-sm font-semibold text-[#012619] dark:text-white">{part.restockTarget}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-[#72A68E] dark:text-gray-500 uppercase tracking-wider mb-0.5">{t('stock.tab.lastUsed')}</p>
                          <p className="text-sm font-semibold text-[#012619] dark:text-white">{part.lastUsedDate || t('stock.tab.never')}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                          <p className="text-[10px] font-semibold text-[#72A68E] dark:text-gray-500 uppercase tracking-wider mb-0.5">{t('stock.tab.supplier')}</p>
                          <p className="text-sm font-semibold text-[#012619] dark:text-white">{part.supplier || '—'}</p>
                        </div>
                      </div>

                      {/* Comments */}
                      {part.comments && (
                        <div className="mb-3 p-3 bg-[#f6f8f7] dark:bg-gray-900/40 border border-[#e2e8e5] dark:border-gray-700 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Info className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                            <p className="text-[10px] font-bold text-[#72A68E] dark:text-gray-400 uppercase tracking-wider">{t('stock.tab.comments')}</p>
                          </div>
                          <p className="text-sm text-[#012619] dark:text-white">{part.comments}</p>
                        </div>
                      )}

                      {/* Action Buttons — owner / Garage Manager only */}
                      {canManageStockPrices && (
                      <div className="flex items-center gap-2 pt-2 border-t border-[#e2e8e5] dark:border-gray-700">
                        <button
                          onClick={() => handleEditPart(part)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#025940] dark:text-[#72A68E] hover:bg-[#f0f7f4] dark:hover:bg-[#025940]/20 transition-colors"
                          title={t('stock.tab.editPart')}
                        >
                          <Edit2 className="w-4 h-4" />
                          <span className="hidden sm:inline">{t('stock.tab.editPart')}</span>
                        </button>
                        <button
                          onClick={() => { setAdjustingPart(part); setShowAdjustModal(true) }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#025940] dark:text-[#72A68E] bg-[#025940]/8 dark:bg-[#025940]/20 border border-[#C5D9D0] dark:border-[#025940]/40 hover:bg-[#025940]/15 transition-colors"
                        >
                          <Scale className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t('stock.btn.adjust')}</span>
                        </button>
                        <button
                          onClick={() => handleDeleteOrderHistory(part.id!, part.partName)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                          title={t('stock.tab.deleteOrderHistory')}
                        >
                          <History className="w-4 h-4" />
                          <span className="hidden sm:inline">{t('stock.tab.clearHistory')}</span>
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() => handleDeletePart(part.id!, part.partName)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title={t('stock.tab.deletePartTitle')}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">{t('stock.btn.delete')}</span>
                        </button>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ─── ALL MODALS PRESERVED ─── */}
      <AddPartModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false)
          setPrefillPartNumber('')
        }}
        onSuccess={loadParts}
        defaultPartNumber={prefillPartNumber}
      />

      <RemovePartModal
        isOpen={showRemoveModal}
        onClose={() => {
          setShowRemoveModal(false)
          setSelectedPart(null)
          if (batchMode) {
            exitBatchMode()
          }
        }}
        onSuccess={loadParts}
        part={selectedPart}
      />

      <QuickAddStockModal
        isOpen={showQuickAddModal}
        onClose={() => {
          setShowQuickAddModal(false)
          setSelectedPart(null)
        }}
        onSuccess={loadParts}
        part={selectedPart}
      />

      <BulkUploadModal
        isOpen={showBulkUploadModal}
        onClose={() => setShowBulkUploadModal(false)}
        onSuccess={loadParts}
      />

      <EditPartModal
        isOpen={showEditPartModal}
        onClose={() => {
          setShowEditPartModal(false)
          setEditingPart(null)
        }}
        onSuccess={loadParts}
        part={editingPart}
      />

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
        mode={scanMode}
      />

      <ScanActionModal
        isOpen={showScanAction}
        onClose={() => {
          setShowScanAction(false)
          setScannedBarcode('')
          setScannedPart(null)
        }}
        scannedBarcode={scannedBarcode}
        part={scannedPart}
        mode={scanMode}
        onAddStock={handleScanAddStock}
        onRemoveStock={handleScanRemoveStock}
        onCreateNewPart={handleCreateNewPartFromScan}
        vehicles={vehicles}
      />

      <AdjustStockModal
        isOpen={showAdjustModal}
        onClose={() => { setShowAdjustModal(false); setAdjustingPart(null) }}
        onSuccess={() => { setShowAdjustModal(false); setAdjustingPart(null); loadParts() }}
        part={adjustingPart}
      />

      {/* Comment Popup Modal */}
      {showCommentPopup && commentPopupPart && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowCommentPopup(false)
            setCommentPopupPart(null)
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-[#e2e8e5] dark:border-gray-700 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 rounded-t-2xl bg-[#012619]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#b3f243] flex items-center justify-center">
                  <Info className="w-5 h-5 text-[#012619]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{t('stock.tab.partComments')}</h3>
                  <p className="text-sm text-[#C5D9D0]">{commentPopupPart.partName}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCommentPopup(false)
                  setCommentPopupPart(null)
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#C5D9D0]" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="bg-[#f6f8f7] dark:bg-gray-900/40 border border-[#e2e8e5] dark:border-gray-700 rounded-xl p-4">
                <p className="text-sm text-[#012619] dark:text-white whitespace-pre-wrap">{commentPopupPart.comments}</p>
              </div>
              
              <div className="mt-4 pt-4 border-t border-[#e2e8e5] dark:border-gray-700">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-[#72A68E] dark:text-gray-400 uppercase tracking-wider mb-1">{t('stock.tab.partNumber')}</p>
                    <p className="font-mono text-[#012619] dark:text-white">{commentPopupPart.partNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#72A68E] dark:text-gray-400 uppercase tracking-wider mb-1">{t('stock.tab.makeModel')}</p>
                    <p className="text-[#012619] dark:text-white">{displayMakeModel(commentPopupPart.makeModel)}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end p-5 border-t border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-900/50">
              <button
                onClick={() => {
                  setShowCommentPopup(false)
                  setCommentPopupPart(null)
                }}
                className="px-6 py-2.5 bg-[#025940] text-white rounded-xl font-semibold text-sm hover:bg-[#012619] transition-colors"
              >
                {t('stock.btn.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ DELETE ALL STOCK CONFIRMATION MODAL */}
      {showDeleteAllModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !isDeletingAll && setShowDeleteAllModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-[#e2e8e5] dark:border-gray-700 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Danger Theme */}
            <div className="flex items-center justify-between p-5 rounded-t-2xl bg-[#012619]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">{t('stock.tab.delAllTitle')}</h3>
                  <p className="text-sm text-red-300 font-medium">{t('stock.tab.delAllUndone')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-[#C5D9D0]" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
                <p className="text-sm text-[#012619] dark:text-white font-semibold mb-2">
                  {t('stock.tab.delAllAbout')}
                </p>
                <ul className="space-y-1 text-sm text-[#012619] dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span><strong>{parts.length}</strong> {t('stock.tab.delAllParts')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span>{t('stock.tab.delAllTotalValue')} <strong>£{totalValue.toFixed(2)}</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span><strong>{totalParts.toFixed(0)}</strong> {t('stock.tab.delAllTotalItems')}</span>
                  </li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>{t('stock.tab.delAllNote')}</strong> {t('stock.tab.delAllNoteBody')}
                  </span>
                </p>
              </div>

              <p className="text-sm text-[#72A68E] dark:text-gray-400 mb-4">
                {t('stock.tab.delAllConfirmText')}
              </p>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 p-5 border-t border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-900/50">
              <button
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 text-[#012619] dark:text-gray-300 rounded-xl font-semibold text-sm border border-[#e2e8e5] dark:border-gray-600 hover:bg-[#f6f8f7] dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                {t('stock.btn.cancel')}
              </button>
              <button
                onClick={handleDeleteAllStock}
                disabled={isDeletingAll}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeletingAll ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {t('stock.tab.deleting')}
                  </span>
                ) : (
                  t('stock.tab.delAllConfirmBtn')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}