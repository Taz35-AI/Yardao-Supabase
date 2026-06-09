// src/app/dashboard/DashboardContent.tsx
// Main orchestrator - Clean and organized with separated concerns
// All business logic, data management, and modal states are separated into layers
// ENHANCED with vehicle transfer and external garage checkout tracking
// REDESIGNED: Premium light mode UI matching Yardao brand
// 🎤 NEW: Voice Command System for hands-free vehicle updates
// ✨ PHASE 2: Yard layout view added — third toggle button (Map icon) shows the
//             saved branch layout with vehicles overlaid as coloured chips.

'use client'

import React, { useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useBranches } from '@/hooks/useBranches'

import { UserNotesButton } from '@/components/features/dashboard/UserNotesButton'

// Import separated layers
import { useDashboardDataLayer } from './layers/DashboardDataLayer'
import { useDashboardBusinessLogic } from './layers/DashboardBusinessLogic'
import { useDashboardModalController } from './layers/DashboardModalController'

// Component imports - Layout & Structure
import { Navigation } from '@/components/Navigation'
import { ServiceBanner } from '@/components/common/ServiceBanner'
import { ContractSyncNotification } from '@/components/common/notifications/contractSyncNotification'

// Component imports - Dashboard UI
import { DashboardSummaryCards } from '@/components/features/dashboard/DashboardSummaryCards'
import { InlineDashboardFilters } from '@/components/features/dashboard/InlineDashboardFilters'
import { MobileDashboardFilters } from '@/components/features/dashboard/MobileDashboardFilters'
import { DashboardVehicleList } from '@/components/features/dashboard/DashboardVehicleList'
import { DashboardPagination } from '@/components/features/dashboard/DashboardPagination'
import { OutOnHireSection } from '@/components/features/dashboard/OutOnHireSection'
import { DashboardActionsMenu } from '@/components/features/dashboard/DashboardActionsMenu'

// NEW: Transfer and checkout destination components
import { CheckoutDestinationModal } from '@/components/yard/CheckoutDestinationModal'
import { CheckedOutVehiclesSection } from '@/components/features/dashboard/CheckedOutVehiclesSection'
import { IncomingTransfersSection } from '@/components/features/dashboard/IncomingTransfersSection'

// Component imports - Forms & Modals
import { VehicleCheckInForm } from '@/components/yard/VehicleCheckInForm'
import { VehicleEditModal } from '@/components/yard/VehicleEditModal'
import { VehicleDetailModal } from '@/components/common/Modals/VehicleDetailModal'
import { BreakdownModal } from '@/components/common/Modals/BreakdownModal'
import { NotesCleanupModal } from '@/components/features/dashboard/NotesCleanupModal'
import { OnlineMembers } from '@/components/features/dashboard/OnlineMembers'
import { DashboardTour } from '@/components/features/dashboard/DashboardTour'
import { SetOutOnHireModal, QuickCheckInModal } from '@/components/features/dashboard/HireModals'
import { InsuranceWarningPopup } from '@/components/features/dashboard/InsuranceWarningPopup'

// Component imports - Alert/Confirmation Modals
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { AlertModal } from '@/components/common/Modals/AlertModal'
import { GarageCheckoutModal } from '@/components/yard/GarageCheckoutModal'

// 🎤 Voice Command System
import { VoiceCommandButton } from '@/components/voice/VoiceCommandButton'
import { SpeechEnabledGroqAssistant } from '@/components/common/SpeechEnabledGroqAssistant'

// Icons
// ✨ PHASE 2: added `Map` for the layout-view toggle button
// ✨ PHASE 3: added `Columns3` for the pipeline (kanban) view toggle button
import { ChevronDown, Search, X, Filter, LayoutList, LayoutGrid, Map, Columns3 } from 'lucide-react'

// Types
import { CheckedInVehicle } from '@/types'
import { useT } from '@/lib/i18n'

interface DashboardContentProps {
  branchId?: string
}

export default function DashboardContent({ branchId = 'main' }: DashboardContentProps) {
  // Core hooks
  const { user } = useAuth()
  const t = useT()
  const dashboardContainerRef = useRef<HTMLDivElement>(null)
  // ✨ PHASE 2: viewMode includes 'layout' (yard map view)
  // ✨ PHASE 3: viewMode adds 'pipeline' (kanban) — used as the fallback default.
  // The actual initial view is taken from the user's saved preference once the
  // profile loads (see effect below). We track whether we've already applied
  // that preference so manual flips later in the session aren't overwritten.
  const [viewMode, setViewMode] = React.useState<'table' | 'cards' | 'layout' | 'pipeline'>('pipeline')
  const hasAppliedDefaultView = React.useRef(false)
  const [yardTab, setYardTab] = React.useState<'in_yard' | 'on_hire'>('in_yard')
  // Desktop gate (JS, not a Tailwind class) for the floating check-in FAB used
  // by the desktop tabbed pipeline view. Mobile keeps its bottom-nav check-in.
  const [isDesktop, setIsDesktop] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Branches hook for transfer operations
  const { branches } = useBranches()

  // Initialize separated layers
  const modalController = useDashboardModalController()

  const dataLayer = useDashboardDataLayer({
    userId: user?.uid,
    branchId
  })

  const businessLogic = useDashboardBusinessLogic({
    yardData: dataLayer.yardData,
    dashboardLogic: dataLayer.dashboardLogic,
    userProfile: dataLayer.userProfile,
    checkedInVehicles: dataLayer.checkedInVehicles,
    enhancedFilteredVehicles: dataLayer.enhancedFilteredVehicles,
    forceDataRefresh: dataLayer.forceDataRefresh,
    showError: modalController.showError,
    showSuccess: modalController.showSuccess,
    modalController: modalController,
    branchId: branchId
  })

  React.useEffect(() => {
    const handler = () => modalController.showCheckInForm()
    window.addEventListener('yardao:open-checkin', handler)
    return () => window.removeEventListener('yardao:open-checkin', handler)
  }, [modalController])

  // ✨ PHASE 3: Apply the user's saved default view once the profile is loaded.
  // Runs at most once per mount so manual view changes later in the session
  // aren't clobbered by re-renders.
  React.useEffect(() => {
    if (hasAppliedDefaultView.current) return
    const preferred = dataLayer.userProfile?.defaultView as
      | 'table' | 'cards' | 'layout' | 'pipeline' | undefined
    if (preferred && preferred !== viewMode) {
      setViewMode(preferred)
    }
    if (dataLayer.userProfile) {
      // Mark as applied even when there's no preference saved, so we stop
      // re-evaluating after the first successful profile load.
      hasAppliedDefaultView.current = true
    }
  }, [dataLayer.userProfile, viewMode])

  // =====================================================
  // ORCHESTRATION HANDLERS (ALL PRESERVED)
  // =====================================================

  const handleCleanNotesClick = useCallback(() => {
    modalController.handleCleanButtonClick(dataLayer.userProfile)
  }, [modalController, dataLayer.userProfile])

  const handleVehicleCheckout = useCallback(async (vehicleId: string) => {
    const vehicle = await businessLogic.handleVehicleCheckout(vehicleId)
  }, [businessLogic])

  const handleCheckoutConfirm = useCallback(async () => {
    const vehicle = modalController.modalStates.checkoutVehicle
    if (!vehicle) return
    const success = await businessLogic.handleCheckoutConfirm(vehicle)
    if (success) {
      modalController.closeCheckoutModal()
    }
  }, [modalController.modalStates.checkoutVehicle, businessLogic, modalController])

  const handleBulkCheckout = useCallback(async (vehicleIds: string[]) => {
    const validIds = await businessLogic.handleBulkCheckout(vehicleIds)
    if (validIds) {
      modalController.showBulkCheckoutModal(validIds)
    }
  }, [businessLogic, modalController])

  const handleBulkCheckoutConfirm = useCallback(async () => {
    const vehicleIds = modalController.modalStates.bulkCheckoutVehicles
    if (!vehicleIds.length) return
    const success = await businessLogic.handleBulkCheckoutConfirm(vehicleIds)
    if (success) {
      modalController.closeBulkCheckoutModal()
    }
  }, [modalController.modalStates.bulkCheckoutVehicles, businessLogic, modalController])

  const handleSetOutOnHire = useCallback((vehicle: any) => {
    modalController.handleSetOutOnHire(vehicle, dataLayer.dashboardLogic)
  }, [modalController, dataLayer.dashboardLogic])

  const handleQuickCheckIn = useCallback((vehicle: any) => {
    modalController.handleQuickCheckIn(vehicle, dataLayer.dashboardLogic)
  }, [modalController, dataLayer.dashboardLogic])

  const handleSetOutOnHireConfirm = useCallback(async (vehicleId: string, hireNotes?: string) => {
    await modalController.wrapSetOutOnHireConfirm(
      businessLogic.handleSetOutOnHireConfirm,
      vehicleId,
      hireNotes
    )
  }, [modalController, businessLogic])

  const handleQuickCheckInConfirm = useCallback(async (vehicleId: string, returnNotes?: string) => {
    await modalController.wrapQuickCheckInConfirm(
      businessLogic.handleQuickCheckInConfirm,
      vehicleId,
      returnNotes
    )
  }, [modalController, businessLogic])

  const handleCheckInVehicle = useCallback(async (formData: any) => {
    await modalController.wrapCheckInConfirm(
      businessLogic.handleCheckIn,
      formData
    )
  }, [modalController, businessLogic])

  // =====================================================
  // DETAIL MODAL ACTION HANDLERS (ALL PRESERVED)
  // =====================================================

  const handleDetailModalEdit = useCallback(() => {
    businessLogic.handleDetailModalEdit()
  }, [businessLogic])

  const handleDetailModalCheckout = useCallback(async () => {
    const vehicle = await businessLogic.handleDetailModalCheckout()
  }, [businessLogic])

  const handleDetailModalSetOutOnHire = useCallback(() => {
    if (dataLayer.dashboardLogic.selectedVehicle) {
      handleSetOutOnHire(dataLayer.dashboardLogic.selectedVehicle)
    }
  }, [dataLayer.dashboardLogic.selectedVehicle, handleSetOutOnHire])

  const handleDetailModalQuickCheckIn = useCallback(() => {
    if (dataLayer.dashboardLogic.selectedVehicle) {
      handleQuickCheckIn(dataLayer.dashboardLogic.selectedVehicle)
    }
  }, [dataLayer.dashboardLogic.selectedVehicle, handleQuickCheckIn])

  // =====================================================
  // LOADING STATE
  // =====================================================

  if (dataLayer.isLoading) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[#edf1ee] dark:bg-gray-900">
        <Navigation />
        <div className="flex items-center justify-center min-h-[50vh] pt-0">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#025940] mx-auto mb-4"></div>
            <p className="text-[#4a5e54] dark:text-gray-400 font-medium">{t('dashboard.loading.yard')}</p>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================
  // MAIN RENDER
  // =====================================================

  // Cross-tab search visibility: when a search is active, highlight the
  // *other* tab if the match lives there. Stops users having to flip tabs
  // manually to check whether a reg is out on hire.
  const isSearching = !!dataLayer.dashboardLogic.filters.search?.trim()
  const inYardMatchCount = dataLayer.pagination.totalItems
  const onHireMatchCount = dataLayer.filteredVehiclesOutOnHire.length
  const onHireHasOtherTabMatch =
    isSearching && yardTab !== 'on_hire' && onHireMatchCount > 0
  const inYardHasOtherTabMatch =
    isSearching && yardTab !== 'in_yard' && inYardMatchCount > 0

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#edf1ee] dark:bg-gray-900 pt-0">
      <Navigation />

      {/* System Notifications — sync runs silently now (it's reliable + live),
          so the "synced to N yard record" success/info confirmations are
          suppressed; only genuine problems (warning/error) still surface. */}
      {dataLayer.yardData?.syncNotification &&
        (dataLayer.yardData.syncNotification.type === 'error' || dataLayer.yardData.syncNotification.type === 'warning') && (
        <ContractSyncNotification
          notification={dataLayer.yardData.syncNotification}
          onClose={dataLayer.yardData.clearSyncNotification}
        />
      )}

      {/* Error Display */}
      {dataLayer.yardData?.error && (
        <div className="px-3 sm:px-4 lg:px-8">
          <div className="mt-3">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium">{dataLayer.yardData.error}</span>
                {dataLayer.yardData.clearError && (
                  <button
                    onClick={dataLayer.yardData.clearError}
                    className="ml-4 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          STICKY TOP BAR — Search + Actions
      ═══════════════════════════════════════════════════ */}
      <div className="sticky top-0 md:top-0 z-30 bg-[#edf1ee]/85 dark:bg-gray-900/85 backdrop-blur-xl border-b border-[#e2e8e5] dark:border-gray-700/50">
        <div className={`w-full max-w-[100vw] px-3 sm:px-4 lg:px-8 ${viewMode === 'pipeline' ? 'py-1.5' : 'py-3'}`}>
          <div className="flex items-center justify-between gap-3">

            {/* Left: Branch name as the page title — desktop only */}
            <div className="hidden sm:block flex-shrink-0">
              {dataLayer.currentBranch && (
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#012619] dark:text-white tracking-tight leading-none">
                  {dataLayer.currentBranch.name}
                </h1>
              )}
            </div>

            {/* Center: Search bar.
                Hidden on the desktop search-first dashboard (it has its own
                smart search), so we don't show two search bars. A flex-1 spacer
                keeps the topbar layout balanced. */}
            {(viewMode === 'pipeline') ? (
              <div className="flex-1" />
            ) : (
            <div className="flex-1 relative" data-tour="search">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#8a9e94] w-4 h-4" />
              <input
                type="text"
                value={dataLayer.dashboardLogic.filters.search}
                onChange={(e) => dataLayer.dashboardLogic.handleFilterChange('search', e.target.value)}
                placeholder={t('dashboard.topbar.searchPlaceholder')}
                className="w-full pl-9 pr-8 py-2 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[#0f1f18] dark:text-white placeholder-[#8a9e94] focus:ring-2 focus:ring-[#025940]/20 focus:border-[#025940] shadow-sm transition-all font-medium"
              />
              {dataLayer.dashboardLogic.filters.search && (
                <button
                  onClick={() => dataLayer.dashboardLogic.handleFilterChange('search', '')}
                  className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-[#8a9e94] hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            )}

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">

              {/* Live presence — who's online now (desktop only) */}
              <OnlineMembers organizationId={dataLayer.userProfile?.organizationId} />

              {/* Guided tour — "?" help button + auto-start for new users (desktop) */}
              <DashboardTour ready={!dataLayer.isLoading} />

              {/* Desktop actions — Refresh / Clean / Export to Excel now live
                  inside the three-dot menu to keep the toolbar uncluttered. */}
              <div data-tour="actions-menu" className="hidden md:flex items-center">
                <DashboardActionsMenu
                  onRefresh={dataLayer.forceDataRefresh}
                  onClean={handleCleanNotesClick}
                  onExport={businessLogic.handleExport}
                  isRefreshing={dataLayer.isRefreshing}
                />
              </div>

              {/* Mobile: view toggle + three-dots menu */}
              <div className="md:hidden flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-lg p-0.5 border border-[#e2e8e4] dark:border-gray-600 shadow-sm">
                  {/* ✨ PHASE 3: Pipeline (kanban) view button — default */}
                  <button
                    onClick={() => setViewMode('pipeline')}
                    className={`p-1.5 rounded-md transition-all duration-150 ${
                      viewMode === 'pipeline'
                        ? 'bg-[#012619] text-white shadow-sm'
                        : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                    }`}
                    aria-label={t('dashboard.viewToggle.pipelineAria')}
                  >
                    <Columns3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-md transition-all duration-150 ${
                      viewMode === 'table'
                        ? 'bg-[#012619] text-white shadow-sm'
                        : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                    }`}
                    aria-label={t('dashboard.viewToggle.tableAria')}
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`p-1.5 rounded-md transition-all duration-150 ${
                      viewMode === 'cards'
                        ? 'bg-[#012619] text-white shadow-sm'
                        : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                    }`}
                    aria-label={t('dashboard.viewToggle.cardAria')}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  {/* ✨ PHASE 2: Layout (yard map) view button */}
                  <button
                    onClick={() => setViewMode('layout')}
                    className={`p-1.5 rounded-md transition-all duration-150 ${
                      viewMode === 'layout'
                        ? 'bg-[#012619] text-white shadow-sm'
                        : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                    }`}
                    aria-label={t('dashboard.viewToggle.layoutAria')}
                  >
                    <Map className="w-4 h-4" />
                  </button>
                </div>

                <DashboardActionsMenu
                  onRefresh={dataLayer.forceDataRefresh}
                  onClean={handleCleanNotesClick}
                  onExport={businessLogic.handleExport}
                  isRefreshing={dataLayer.isRefreshing}
                />
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════ */}
      <div
        ref={dashboardContainerRef}
        className={`w-full max-w-[100vw] overflow-x-hidden px-3 sm:px-4 lg:px-8 pb-1 ${
          viewMode === 'pipeline' ? 'pt-2' : 'pt-4'
        }`}
      >
        {/* Service Banner — tighter spacing in pipeline view */}
        <div className={viewMode === 'pipeline' ? 'mb-1.5' : 'mb-3'}>
          <ServiceBanner />
        </div>

        {/* ═══════════════════════════════════════════
            METRIC STRIP — always visible, full width
        ═══════════════════════════════════════════ */}
        <div className={viewMode === 'pipeline' ? 'mb-2' : 'mb-4'}>
          <DashboardSummaryCards
            analytics={dataLayer.analytics}
            onlyTotal={viewMode === 'pipeline'}
            filteredVehicles={dataLayer.enhancedFilteredVehicles}
            currentFilters={dataLayer.dashboardLogic.filters}
            hasActiveFilters={!!dataLayer.dashboardLogic.activeFilter}
            statusSizeBreakdown={dataLayer.dashboardLogic.statusSizeBreakdown}
            onSizeCardClick={dataLayer.dashboardLogic.handleSizeCardClick}
            onStatusCardClick={() => {
              // On the search-first pipeline dashboard the old status-breakdown
              // modal isn't wired to anything useful, so clicking the Total pill
              // appeared to do nothing. Instead, drop into the full yard list
              // (Total = all vehicles) — the same table the other filters use.
              if (viewMode === 'pipeline') { dataLayer.dashboardLogic.clearAllFilters(); setViewMode('table') }
              else { dataLayer.dashboardLogic.handleStatusCardClick() }
            }}
            onStatusSizeFilter={dataLayer.dashboardLogic.handleStatusSizeFilter}
            onClearFilters={dataLayer.dashboardLogic.clearAllFilters}
            className="w-full"
            onCheckIn={modalController.showCheckInForm}
            onMobileFiltersOpen={modalController.toggleFilters}
            mobileFiltersBadge={
              [
                dataLayer.dashboardLogic.filters.condition,
                dataLayer.dashboardLogic.filters.contract,
                dataLayer.dashboardLogic.filters.excludeKeywords,
                dataLayer.dashboardLogic.filters.dateFrom,
                dataLayer.dashboardLogic.filters.dateTo,
                dataLayer.dashboardLogic.filters.motExpiring,
              ].filter(Boolean).length
            }
            checkedOutSlot={
              <CheckedOutVehiclesSection
                vehicles={dataLayer.checkedInVehicles as any}
                currentBranchId={branchId}
                onCancelTransfer={businessLogic.handleCancelTransfer}
                onReturnFromGarage={businessLogic.handleReturnFromGarage}
                loading={businessLogic.transferLoading}
              />
            }
            yardTabSlot={
              // ✨ PHASE 3: Pipeline view contains both In Yard and On Hire as
              // columns, so the mobile pill toggle is redundant — hide it.
              viewMode === 'pipeline' ? null :
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setYardTab('in_yard')}
                  title={inYardHasOtherTabMatch ? t('dashboard.search.otherTabMatchInYard', { count: inYardMatchCount }) : undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-150 ${
                    yardTab === 'in_yard'
                      ? 'bg-[#012619] border-[#012619] text-white'
                      : 'bg-white border-[#c8d5ce] text-[#025940] hover:border-[#025940] hover:bg-[#f0f7f0]'
                  } ${inYardHasOtherTabMatch ? 'ring-2 ring-amber-400 ring-offset-1 animate-pulse' : ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                  {t('dashboard.yardTab.inYard')}
                  <span className={`min-w-[1.1rem] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    inYardHasOtherTabMatch ? 'bg-amber-400 text-[#012619]' : 'bg-white/20'
                  }`}>
                    {inYardMatchCount}
                  </span>
                </button>
                <button
                  onClick={() => setYardTab('on_hire')}
                  title={onHireHasOtherTabMatch ? t('dashboard.search.otherTabMatchOnHire', { count: onHireMatchCount }) : undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-150 ${
                    yardTab === 'on_hire'
                      ? 'bg-[#012619] border-[#012619] text-white'
                      : 'bg-white border-[#c8d5ce] text-[#012619] hover:border-[#012619] hover:bg-[#f0f7f0]'
                  } ${onHireHasOtherTabMatch ? 'ring-2 ring-amber-400 ring-offset-1 animate-pulse' : ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#025940] flex-shrink-0" />
                  {t('dashboard.yardTab.onHire')}
                  <span className={`min-w-[1.1rem] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    onHireHasOtherTabMatch ? 'bg-amber-400 text-[#012619]' : 'bg-white/20'
                  }`}>
                    {onHireMatchCount}
                  </span>
                </button>
              </div>
            }
          />
        </div>

        {/* ═══════════════════════════════════════════
            FILTER BAR (desktop)
        ═══════════════════════════════════════════ */}
        <div className={`flex items-center gap-2 ${viewMode === 'pipeline' ? 'mb-1.5' : 'mb-3'}`}>
          <button
            onClick={modalController.toggleFilters}
            className={`${viewMode === 'pipeline' ? 'hidden' : 'hidden lg:inline-flex'} items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-sm transition-all ${
              modalController.uiModalStates.isFiltersExpanded
                ? 'bg-[#012619] border-[#012619] text-white shadow-md'
                : 'bg-white dark:bg-gray-800 border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#c8d5ce]'
            }`}
          >
            <Filter className="w-3 h-3" />
            {t('dashboard.filters.toggle')}
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${
                modalController.uiModalStates.isFiltersExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div className="flex-1" />

          {/* Desktop: Sync indicator + view toggle — hidden in pipeline (the
              tabbed view's tab row carries the view switcher + Filters). */}
          <div className={`${viewMode === 'pipeline' ? 'hidden' : 'hidden lg:flex'} items-center gap-2`}>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#ecfdf5] dark:bg-green-900/10 rounded-lg border border-[#a7f3d0]/50 dark:border-green-800/20">
              <div className="w-1.5 h-1.5 bg-[#059669] rounded-full animate-pulse"></div>
              <span className="text-[10px] font-semibold text-[#059669] dark:text-green-300">{t('dashboard.status.syncActive')}</span>
            </div>

            <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-lg p-0.5 border border-[#e2e8e5] dark:border-gray-600 shadow-sm">
              {/* ✨ PHASE 3: Pipeline (kanban) view button — default */}
              <button
                onClick={() => setViewMode('pipeline')}
                className={`p-1.5 rounded-md transition-all duration-150 ${
                  viewMode === 'pipeline'
                    ? 'bg-[#012619] text-white shadow-sm'
                    : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                }`}
                aria-label="Pipeline view"
                title={t('dashboard.viewToggle.pipelineTitle')}
              >
                <Columns3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-all duration-150 ${
                  viewMode === 'table'
                    ? 'bg-[#012619] text-white shadow-sm'
                    : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                }`}
                aria-label="Table view"
                title={t('dashboard.viewToggle.tableTitle')}
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-md transition-all duration-150 ${
                  viewMode === 'cards'
                    ? 'bg-[#012619] text-white shadow-sm'
                    : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                }`}
                aria-label="Card view"
                title={t('dashboard.viewToggle.cardsTitle')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              {/* ✨ PHASE 2: Layout (yard map) view button */}
              <button
                onClick={() => setViewMode('layout')}
                className={`p-1.5 rounded-md transition-all duration-150 ${
                  viewMode === 'layout'
                    ? 'bg-[#012619] text-white shadow-sm'
                    : 'text-[#8a9e94] hover:text-[#4a5e54] dark:hover:text-white'
                }`}
                aria-label="Layout view"
                title={t('dashboard.viewToggle.layoutTitle')}
              >
                <Map className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            COLLAPSIBLE FILTERS — desktop only
        ═══════════════════════════════════════════ */}
        <div className={`hidden lg:block transition-all duration-300 ease-in-out overflow-hidden ${
          modalController.uiModalStates.isFiltersExpanded ? 'max-h-[500px] opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'
        }`}>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm p-4">
            <InlineDashboardFilters
              vehicles={dataLayer.vehiclesInYard}
              filters={dataLayer.dashboardLogic.filters}
              onFilterChange={dataLayer.dashboardLogic.handleFilterChange}
              onClearFilters={dataLayer.dashboardLogic.clearAllFilters}
              compact={true}
            />
          </div>
        </div>

        {/* Mobile filter bottom-sheet */}
        <div className="lg:hidden">
          <MobileDashboardFilters
            vehicles={dataLayer.vehiclesInYard}
            filters={dataLayer.dashboardLogic.filters}
            onFilterChange={dataLayer.dashboardLogic.handleFilterChange}
            onClearFilters={dataLayer.dashboardLogic.clearAllFilters}
            isOpen={modalController.uiModalStates.isFiltersExpanded}
            onClose={modalController.toggleFilters}
          />
        </div>

        {/* Incoming Transfers Section */}
        <IncomingTransfersSection
          vehicles={dataLayer.incomingVehicles as any}
          currentBranchId={branchId}
          onReceiveVehicle={businessLogic.handleReceiveVehicle}
          loading={businessLogic.transferLoading || dataLayer.incomingTransfersLoading}
          branches={branches}
        />

        {/* ═══════════════════════════════════════════
            YARD TAB TOGGLE + VEHICLE TABLE
        ═══════════════════════════════════════════ */}
        <div className="w-full">

          {/* Tab Toggle — desktop only; mobile version lives in yardTabSlot above.
              Hidden in pipeline view because both tabs are shown as columns. */}
          <div className={`${viewMode === 'pipeline' ? 'hidden' : 'hidden sm:flex'} items-center gap-1 mb-4 bg-[#f0f4f2] dark:bg-gray-800 rounded-xl p-1 w-fit`}>
            <button
              onClick={() => setYardTab('in_yard')}
              title={inYardHasOtherTabMatch ? t('dashboard.search.otherTabMatchInYard', { count: inYardMatchCount }) : undefined}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                yardTab === 'in_yard'
                  ? 'bg-white dark:bg-gray-700 text-[#012619] dark:text-white shadow-sm'
                  : 'text-[#8a9e94] dark:text-gray-400 hover:text-[#025940] dark:hover:text-gray-200'
              } ${inYardHasOtherTabMatch ? 'ring-2 ring-amber-400 animate-pulse' : ''}`}
            >
              <span className="w-2 h-2 rounded-full bg-[#b3f243]" />
              {t('dashboard.yardTab.inYard')}
              <span className={`ml-1 text-xs font-bold ${
                inYardHasOtherTabMatch
                  ? 'px-1.5 py-0.5 rounded-full bg-amber-400 text-[#012619] opacity-100'
                  : 'opacity-70'
              }`}>
                {inYardMatchCount}
              </span>
            </button>
            <button
              onClick={() => setYardTab('on_hire')}
              title={onHireHasOtherTabMatch ? t('dashboard.search.otherTabMatchOnHire', { count: onHireMatchCount }) : undefined}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                yardTab === 'on_hire'
                  ? 'bg-white dark:bg-gray-700 text-[#012619] dark:text-white shadow-sm'
                  : 'text-[#8a9e94] dark:text-gray-400 hover:text-[#025940] dark:hover:text-gray-200'
              } ${onHireHasOtherTabMatch ? 'ring-2 ring-amber-400 animate-pulse' : ''}`}
            >
              <span className="w-2 h-2 rounded-full bg-[#025940]" />
              {t('dashboard.yardTab.onHire')}
              <span className={`ml-1 text-xs font-bold ${
                onHireHasOtherTabMatch
                  ? 'px-1.5 py-0.5 rounded-full bg-amber-400 text-[#012619] opacity-100'
                  : 'opacity-70'
              }`}>
                {onHireMatchCount}
              </span>
            </button>
          </div>

          {/* ✨ PHASE 3: Pipeline view shows In Yard AND On Hire columns together,
              so it bypasses the in_yard / on_hire tab gate. Pagination + the
              paginated mobile count are also hidden because the pipeline shows
              the entire filtered set. */}
          {(viewMode === 'pipeline' || yardTab === 'in_yard') ? (
            <>
              {/* Mobile vehicle count — paginated views only */}
              {viewMode !== 'pipeline' && (
                <div className="lg:hidden mb-2 text-center">
                  <span className="text-xs text-[#8a9e94] dark:text-gray-400 font-medium">
                    {dataLayer.pagination.totalItems > 0
                      ? t('dashboard.count.showingRangeMobile', { start: dataLayer.pagination.startIndex + 1, end: Math.min(dataLayer.pagination.endIndex, dataLayer.pagination.totalItems), total: dataLayer.pagination.totalItems })
                      : t('dashboard.count.noVehiclesInYard')
                    }
                  </span>
                </div>
              )}

              <DashboardVehicleList
                vehicles={dataLayer.enhancedVehicles}
                filteredVehicles={dataLayer.pagination.currentPageData}
                filters={dataLayer.dashboardLogic.filters}
                sortConfig={dataLayer.dashboardLogic.sortConfig}
                activeFilter={dataLayer.dashboardLogic.activeFilter}
                serviceBookings={dataLayer.serviceBookings as any}
                onFilterChange={dataLayer.dashboardLogic.handleFilterChange}
                onClearFilters={dataLayer.dashboardLogic.clearAllFilters}
                onSort={dataLayer.dashboardLogic.handleSort}
                onViewVehicle={dataLayer.dashboardLogic.handleViewVehicle}
                onCancelTransfer={businessLogic.handleCancelTransfer}
                onBulkCheckout={handleBulkCheckout}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                branchId={branchId}                                                       /* ✨ PHASE 2 */
                /* ✨ PHASE 2 FIX: pass FULL unpaginated yard so layout view sees everything */
                allVehiclesForLayout={dataLayer.enhancedVehicles}
                /* ✨ PHASE 3: pass FULL filtered (unpaginated) list so Pipeline view respects
                   filters, summary-card clicks, and search exactly like the other views. */
                allFilteredVehicles={dataLayer.enhancedFilteredVehicles}
                /* ✨ PHASE 3: out-on-hire list for the 5th pipeline column. */
                outOnHireVehicles={dataLayer.filteredVehiclesOutOnHire}
                /* Desktop tabbed view hosts the view-switcher + Filters on its tab row. */
                onToggleFilters={modalController.toggleFilters}
                filtersOpen={modalController.uiModalStates.isFiltersExpanded}
                /* Quick actions for the desktop search-first dashboard. */
                onCheckIn={modalController.showCheckInForm}
                onExport={businessLogic.handleExport}
                className="w-full"
              />

              {viewMode !== 'pipeline' && (
                <DashboardPagination
                  currentPage={dataLayer.pagination.currentPage}
                  totalPages={dataLayer.pagination.totalPages}
                  totalItems={dataLayer.pagination.totalItems}
                  itemsPerPage={dataLayer.pagination.itemsPerPage}
                  itemsPerPageOptions={dataLayer.pagination.itemsPerPageOptions}
                  startIndex={dataLayer.pagination.startIndex}
                  endIndex={dataLayer.pagination.endIndex}
                  hasNextPage={dataLayer.pagination.hasNextPage}
                  hasPreviousPage={dataLayer.pagination.hasPreviousPage}
                  onPageChange={dataLayer.pagination.goToPage}
                  onNextPage={dataLayer.pagination.goToNextPage}
                  onPreviousPage={dataLayer.pagination.goToPreviousPage}
                  onItemsPerPageChange={dataLayer.pagination.setItemsPerPage}
                />
              )}
            </>
          ) : (
            <OutOnHireSection
              vehicles={dataLayer.filteredVehiclesOutOnHire}
              searchTerm={dataLayer.dashboardLogic.filters.search}
              totalUnfilteredCount={dataLayer.vehiclesOutOnHire.length}
              onQuickCheckIn={handleQuickCheckIn}
              onViewDetails={dataLayer.dashboardLogic.handleViewVehicle}
              className="w-full"
            />
          )}
        </div>

      </div>{/* ── end MAIN CONTENT ── */}

      {/* ═══════════════════════════════════════════════════
          FLOATING BUTTONS
      ═══════════════════════════════════════════════════ */}

      {/* 🎤 Voice Command Button — stacked above the check-in on the right so the
          left side is free for Zao. Hidden when the check-in form is open. */}
      {!modalController.uiModalStates.showCheckInForm && (
        <VoiceCommandButton
          checkedInVehicles={dataLayer.checkedInVehicles as CheckedInVehicle[]}
          userDisplayName={dataLayer.userProfile?.displayName || 'User'}
          floatingClassName="hidden md:fixed md:block bottom-24 right-6"
        />
      )}

      {/* 🤖 AI Fleet Assistant (bottom-LEFT on desktop, bottom-right on mobile) */}
      <SpeechEnabledGroqAssistant />

      {/* 🚗 Check-in floating button — DESKTOP pipeline only, bottom-RIGHT (mirrors
          Zao). Portaled to <body> with inline styles so it anchors to the viewport
          regardless of transformed ancestors / Tailwind class generation. Mobile
          keeps its existing in-strip / bottom-nav check-in. */}
      {isDesktop && viewMode === 'pipeline' && !modalController.uiModalStates.showCheckInForm && createPortal(
        <button
          onClick={modalController.showCheckInForm}
          data-tour="check-in"
          aria-label={t('dashboard.summary.checkInVehicleAria')}
          title={t('dashboard.summary.checkInVehicleAria')}
          className="rounded-full shadow-lg hover:shadow-xl transition-all duration-150 hover:scale-105 active:scale-95"
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9990,
            width: '64px', height: '64px', padding: 0,
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <img src="/Check In Button/check-in-button.png" alt={t('dashboard.summary.checkInImgAlt')} style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
        </button>,
        document.body
      )}

      {/* ===================================================== */}
      {/* MODALS SECTION - ALL PRESERVED EXACTLY                */}
      {/* ===================================================== */}

      <CheckoutDestinationModal
        isOpen={modalController.modalStates.showCheckoutDestinationModal}
        onClose={modalController.closeCheckoutDestinationModal}
        onConfirm={(destination) => {
          const vehicle = modalController.modalStates.checkoutDestinationVehicle
          if (vehicle) {
            businessLogic.handleCheckoutWithDestination(vehicle.id, destination)
          }
        }}
        vehicleRegistration={modalController.modalStates.checkoutDestinationVehicle?.registration || ''}
        currentBranchId={branchId}
        availableBranches={branches}
        loading={businessLogic.transferLoading}
        allowRemove={!modalController.modalStates.checkoutDestinationVehicle?.vehicleId}
      />

      <GarageCheckoutModal
        isOpen={modalController.modalStates.showGarageCheckoutModal}
        onClose={modalController.closeGarageCheckoutModal}
        onConfirm={(garageId, garageName, notes, customAddress) => {
          const vehicle = modalController.modalStates.garageCheckoutVehicle
          if (vehicle) {
            businessLogic.handleGarageCheckout(garageId, garageName, notes, customAddress)
          }
        }}
        vehicleRegistration={modalController.modalStates.garageCheckoutVehicle?.registration || ''}
        loading={businessLogic.transferLoading}
      />

      <ConfirmationModal
        isOpen={modalController.modalStates.showCleanupConfirm}
        onClose={modalController.closeCleanupConfirm}
        onConfirm={modalController.handleCleanupConfirm}
        title={t('dashboard.modals.cleanupTitle')}
        message={t('dashboard.modals.cleanupMessage')}
        confirmText={t('dashboard.modals.cleanupConfirm')}
        cancelText={t('dashboard.modals.cancel')}
        variant="warning"
      />

      <ConfirmationModal
        isOpen={modalController.modalStates.showCheckoutConfirm}
        onClose={modalController.closeCheckoutModal}
        onConfirm={handleCheckoutConfirm}
        title={t('dashboard.modals.checkoutTitle')}
        message={t('dashboard.modals.checkoutMessage', { registration: modalController.modalStates.checkoutVehicle?.registration ?? '' })}
        confirmText={t('dashboard.modals.checkoutConfirm')}
        cancelText={t('dashboard.modals.cancel')}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={modalController.modalStates.showBulkCheckoutConfirm}
        onClose={modalController.closeBulkCheckoutModal}
        onConfirm={handleBulkCheckoutConfirm}
        title={t('dashboard.modals.bulkCheckoutTitle')}
        message={t('dashboard.modals.bulkCheckoutMessage', { count: modalController.modalStates.bulkCheckoutVehicles.length })}
        confirmText={t('dashboard.modals.bulkCheckoutConfirm')}
        cancelText={t('dashboard.modals.cancel')}
        variant="danger"
      />

      <AlertModal
        isOpen={modalController.modalStates.showErrorAlert}
        onClose={modalController.closeError}
        title={t('dashboard.modals.errorTitle')}
        message={modalController.modalStates.errorMessage}
        variant="error"
        actionText={t('dashboard.modals.ok')}
      />

      <AlertModal
        isOpen={modalController.modalStates.showSuccessAlert}
        onClose={modalController.closeSuccess}
        title={t('dashboard.modals.successTitle')}
        message={modalController.modalStates.successMessage}
        variant="success"
        actionText={t('dashboard.modals.ok')}
      />

      {dataLayer.dashboardLogic.showSizeModal && (
        <div className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <BreakdownModal
            title={t('dashboard.breakdownModal.size')}
            data={dataLayer.contextualBreakdowns.sizeBreakdown}
            onFilter={(size) => {
              dataLayer.dashboardLogic.handleSizeFilter(size)
              dataLayer.dashboardLogic.setShowSizeModal(false)
            }}
            onClose={() => dataLayer.dashboardLogic.setShowSizeModal(false)}
            activeFilter={dataLayer.dashboardLogic.activeFilter}
          />
        </div>
      )}

      {dataLayer.dashboardLogic.showConditionModal && (
        <div className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <BreakdownModal
            title={t('dashboard.breakdownModal.condition')}
            data={dataLayer.contextualBreakdowns.conditionBreakdown}
            onFilter={(condition) => {
              dataLayer.dashboardLogic.handleConditionFilter(condition)
              dataLayer.dashboardLogic.setShowConditionModal(false)
            }}
            onClose={() => dataLayer.dashboardLogic.setShowConditionModal(false)}
            activeFilter={dataLayer.dashboardLogic.activeFilter}
          />
        </div>
      )}

      {dataLayer.dashboardLogic.showStatusModal && (
        <div className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <BreakdownModal
            title={t('dashboard.breakdownModal.status')}
            data={dataLayer.contextualBreakdowns.statusBreakdown}
            onFilter={(status) => {
              dataLayer.dashboardLogic.handleStatusFilter(status)
              dataLayer.dashboardLogic.setShowStatusModal(false)
            }}
            onClose={() => dataLayer.dashboardLogic.setShowStatusModal(false)}
            activeFilter={dataLayer.dashboardLogic.activeFilter}
            statusSizeBreakdown={dataLayer.dashboardLogic.statusSizeBreakdown}
            onStatusSizeFilter={(status, size) => {
              dataLayer.dashboardLogic.handleStatusSizeFilter(status, size)
              dataLayer.dashboardLogic.setShowStatusModal(false)
            }}
          />
        </div>
      )}

      {dataLayer.dashboardLogic.showContractModal && (
        <div className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <BreakdownModal
            title={t('dashboard.breakdownModal.contract')}
            data={dataLayer.contextualBreakdowns.contractBreakdown}
            onFilter={(contract) => {
              dataLayer.dashboardLogic.handleContractFilter(contract)
              dataLayer.dashboardLogic.setShowContractModal(false)
            }}
            onClose={() => dataLayer.dashboardLogic.setShowContractModal(false)}
            activeFilter={dataLayer.dashboardLogic.activeFilter}
          />
        </div>
      )}

      {modalController.uiModalStates.showCheckInForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <VehicleCheckInForm
            vehicles={dataLayer.fleetVehicles as any}
            conditions={dataLayer.conditions.map(c => ({ id: c.id, name: c.name }))}
            checkedInVehicles={dataLayer.checkedInVehicles}
            onCheckIn={handleCheckInVehicle}
            onCancel={modalController.closeCheckInForm}
            onReturnFromHire={(vehicle) => {
              // Close the check-in picker and hand the user straight to the
              // existing Quick Check-In (return-from-hire) flow.
              modalController.closeCheckInForm()
              handleQuickCheckIn(vehicle)
            }}
            onCancelTransfer={(vehicle) => {
              // Vehicle is physically here but stuck "in transit" (the other
              // branch never received it). Close the picker and surface the
              // existing cancel-transfer confirmation; confirming clears the
              // transfer so it becomes a normal in-yard vehicle again.
              modalController.closeCheckInForm()
              businessLogic.handleCancelTransfer(vehicle.id)
            }}
            onReturnFromGarage={(vehicle) => {
              // Vehicle is checked out to an external garage. Close the picker
              // and run the existing return-from-garage flow (same handler the
              // Checked Out drawer uses).
              modalController.closeCheckInForm()
              businessLogic.handleReturnFromGarage(vehicle.id)
            }}
          />
        </div>
      )}

      {dataLayer.dashboardLogic.showEditModal && dataLayer.dashboardLogic.selectedVehicle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-60">
          <VehicleEditModal
            vehicle={dataLayer.dashboardLogic.selectedVehicle}
            conditions={dataLayer.conditions.map(c => ({ id: c.id, name: c.name }))}
            onSave={businessLogic.handleVehicleUpdate}
            onCancel={() => {
              dataLayer.dashboardLogic.setShowEditModal(false)
              dataLayer.dashboardLogic.setSelectedVehicle(null)
            }}
            onCheckOut={handleVehicleCheckout}
          />
        </div>
      )}

      {dataLayer.dashboardLogic.showDetailModal && dataLayer.dashboardLogic.selectedVehicle && (
        <VehicleDetailModal
          key={`detail-modal-${dataLayer.dashboardLogic.selectedVehicle.id}`}
          vehicle={dataLayer.dashboardLogic.selectedVehicle}
          onClose={dataLayer.dashboardLogic.handleCloseDetailModal}
          onEdit={handleDetailModalEdit}
          onCheckout={handleDetailModalCheckout}
          onSetOutOnHire={handleDetailModalSetOutOnHire}
          onQuickCheckIn={handleDetailModalQuickCheckIn}
          onUpdateVehicle={businessLogic.handleVehicleUpdate}
          fleetVehicles={dataLayer.fleetVehicles}
        />
      )}

      {modalController.hireModalStates.showSetOutOnHireModal && modalController.hireModalStates.selectedVehicleForHire && (
        <SetOutOnHireModal
          vehicle={modalController.hireModalStates.selectedVehicleForHire}
          isOpen={modalController.hireModalStates.showSetOutOnHireModal}
          onClose={modalController.closeSetOutOnHireModal}
          onConfirm={handleSetOutOnHireConfirm}
          loading={modalController.hireModalStates.hireActionLoading}
        />
      )}

      {modalController.hireModalStates.showQuickCheckInModal && modalController.hireModalStates.selectedVehicleForHire && (
        <QuickCheckInModal
          vehicle={modalController.hireModalStates.selectedVehicleForHire}
          isOpen={modalController.hireModalStates.showQuickCheckInModal}
          onClose={modalController.closeQuickCheckInModal}
          onConfirm={handleQuickCheckInConfirm}
          loading={modalController.hireModalStates.hireActionLoading}
        />
      )}

      {modalController.uiModalStates.showNotesCleanupModal && dataLayer.userProfile?.organizationId && (
        <NotesCleanupModal
          isOpen={modalController.uiModalStates.showNotesCleanupModal}
          onClose={modalController.closeNotesCleanupModal}
          organizationId={dataLayer.userProfile.organizationId}
          onSuccess={businessLogic.handleNotesCleanupSuccess}
        />
      )}

      <ConfirmationModal
        isOpen={modalController.modalStates.showReturnFromGarageConfirm}
        onClose={modalController.closeReturnFromGarageConfirm}
        onConfirm={() => {
          const vehicleId = modalController.modalStates.returnFromGarageVehicleId
          if (vehicleId) {
            businessLogic.executeReturnFromGarage(vehicleId)
          }
        }}
        title={t('dashboard.modals.returnFromGarageTitle')}
        message={t('dashboard.modals.returnFromGarageMessage')}
        confirmText={t('dashboard.modals.returnFromGarageConfirm')}
        cancelText={t('dashboard.modals.cancel')}
        variant="default"
      />

      <ConfirmationModal
        isOpen={modalController.modalStates.showCancelTransferConfirm}
        onClose={modalController.closeCancelTransferConfirm}
        onConfirm={() => {
          const vehicleId = modalController.modalStates.cancelTransferVehicleId
          if (vehicleId) {
            businessLogic.executeCancelTransfer(vehicleId)
          }
        }}
        title={t('dashboard.modals.cancelTransferTitle')}
        message={t('dashboard.modals.cancelTransferMessage')}
        confirmText={t('dashboard.modals.cancelTransferConfirm')}
        cancelText={t('dashboard.modals.cancelTransferCancel')}
        variant="default"
      />

    </div>
  )
}