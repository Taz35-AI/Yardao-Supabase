import { useState } from 'react'
import { Search, Calendar, TrendingUp, Clock, User, FileText, PoundSterling, Shield, Wrench, TrendingDown } from 'lucide-react'
import { vehicleService } from '@/lib/firestore'
import { HireHistoryService } from '@/lib/services/hireHistoryService'
import { HireHistoryQueryResult } from '@/types/hireHistory'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface VehicleHireLookupProps {
  organizationId: string
}

export default function VehicleHireLookup({ organizationId }: VehicleHireLookupProps) {
  const t = useT()
  const [registration, setRegistration] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<'custom' | 'sinceAcquired'>('custom')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HireHistoryQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vehicleDateAcquired, setVehicleDateAcquired] = useState<string | null>(null)
  
  // Cost inputs for profitability calculation
  const [dailyHireRate, setDailyHireRate] = useState<string>('')
  const [dailyInsuranceCost, setDailyInsuranceCost] = useState<string>('')
  const [yearlyServiceCost, setYearlyServiceCost] = useState<string>('')

  const handleSearch = async () => {
    if (!registration.trim()) {
      setError(t('dashboard.hireLookup.errEnterReg'))
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setVehicleDateAcquired(null)

    try {
      // First, fetch the vehicle to get dateAcquired if using "Since Date Acquired"
      let periodSelection
      
      if (selectedPeriod === 'sinceAcquired') {
        // Fetch vehicle from fleet to get dateAcquired
        const vehicleData = await vehicleService.getVehicleByRegistration(
          organizationId,
          registration.toUpperCase()
        )

        if (!vehicleData) {
          throw new Error(t('dashboard.hireLookup.errNotFound', { reg: registration }))
        }

        const dateAcquired = vehicleData.dateAcquired

        if (!dateAcquired) {
          throw new Error(t('dashboard.hireLookup.errNoDateAcquired', { reg: registration }))
        }
        
        setVehicleDateAcquired(dateAcquired)
        
        // Create period from dateAcquired to today
        periodSelection = HireHistoryService.createCustomPeriod(
          new Date(dateAcquired),
          new Date()
        )
      } else {
        // Custom period
        if (!customStartDate || !customEndDate) {
          throw new Error(t('dashboard.hireLookup.errSelectDates'))
        }
        periodSelection = HireHistoryService.createCustomPeriod(
          new Date(customStartDate),
          new Date(customEndDate)
        )
      }

      const queryResult = await HireHistoryService.getVehicleHireHistory(
        registration,
        organizationId,
        periodSelection
      )

      setResult(queryResult)
    } catch (err) {
      logger.error('Error fetching hire history:', err)
      setError(err instanceof Error ? err.message : t('dashboard.hireLookup.errFailedFetch'))
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: Date | string | null | undefined | any): string => {
    if (!date) return t('dashboard.hireLookup.datePresent')

    try {
      let dateObj: Date
      // Supabase returns ISO strings; hireHistoryService revives them into Dates.
      // Fall back to Date coercion for anything else (e.g. legacy Timestamp-like).
      if (typeof date === 'string') {
        dateObj = new Date(date)
      } else if (date instanceof Date) {
        dateObj = date
      } else if (date && typeof date.toDate === 'function') {
        dateObj = date.toDate()
      } else {
        dateObj = new Date(date)
      }
      
      return dateObj.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      })
    } catch (error) {
      logger.error('Error formatting date:', error)
      return t('dashboard.hireLookup.dateInvalid')
    }
  }

  // Calculate total revenue
  const calculateRevenue = (): number => {
    if (!result || !dailyHireRate) return 0
    const rate = parseFloat(dailyHireRate)
    if (isNaN(rate) || rate <= 0) return 0
    return result.totalDaysOnHire * rate
  }

  // Calculate total insurance cost - FOR ENTIRE PERIOD (not just hired days)
  const calculateInsuranceCost = (): number => {
    if (!result || !dailyInsuranceCost) return 0
    const cost = parseFloat(dailyInsuranceCost)
    if (isNaN(cost) || cost < 0) return 0
    
    // Calculate total days in search period
    const periodDays = Math.ceil((result.periodEnd.getTime() - result.periodStart.getTime()) / (1000 * 60 * 60 * 24))
    
    // Insurance is paid EVERY DAY regardless of hire status
    return periodDays * cost
  }

  // Calculate prorated service cost for the period
  const calculateServiceCost = (): number => {
    if (!result || !yearlyServiceCost) return 0
    const yearlyCost = parseFloat(yearlyServiceCost)
    if (isNaN(yearlyCost) || yearlyCost < 0) return 0
    
    // Calculate days in search period
    const periodDays = Math.ceil((result.periodEnd.getTime() - result.periodStart.getTime()) / (1000 * 60 * 60 * 24))
    // Prorate service cost based on period
    return (yearlyCost / 365) * periodDays
  }

  // Calculate net profit
  const calculateNetProfit = (): number => {
    const revenue = calculateRevenue()
    const insurance = calculateInsuranceCost()
    const service = calculateServiceCost()
    return revenue - insurance - service
  }

  // Calculate per hire values
  const calculateHireRevenue = (durationInDays: number | undefined): number => {
    if (!durationInDays || !dailyHireRate) return 0
    const rate = parseFloat(dailyHireRate)
    if (isNaN(rate) || rate <= 0) return 0
    return durationInDays * rate
  }

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const totalRevenue = calculateRevenue()
  const totalInsurance = calculateInsuranceCost()
  const totalService = calculateServiceCost()
  const netProfit = calculateNetProfit()
  const hasFinancials = dailyHireRate && parseFloat(dailyHireRate) > 0
  
  // Helper: Calculate period days
  const periodDays = result ? Math.ceil((result.periodEnd.getTime() - result.periodStart.getTime()) / (1000 * 60 * 60 * 24)) : 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-6 py-4 border-b border-[#b3f243]/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#b3f243]/20 rounded-lg border border-[#b3f243]/30">
            <Search className="w-5 h-5 text-[#b3f243]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{t('dashboard.hireLookup.title')}</h2>
            <p className="text-sm text-gray-300">{t('dashboard.hireLookup.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Search Form */}
      <div className="p-6 space-y-4">
        {/* Registration Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('dashboard.hireLookup.vehicleReg')}
          </label>
          <input
            type="text"
            value={registration}
            onChange={(e) => setRegistration(e.target.value.toUpperCase())}
            placeholder={t('dashboard.hireLookup.regPlaceholder')}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                     focus:border-[#b3f243] focus:ring-2 focus:ring-[#b3f243]/20 
                     transition-all outline-none font-medium"
          />
        </div>

        {/* Time Period Selection - ONLY Custom & Since Acquired */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('dashboard.hireLookup.selectTimePeriod')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedPeriod('custom')}
              className={`px-6 py-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2
                ${selectedPeriod === 'custom'
                  ? 'bg-[#b3f243] text-[#012619] shadow-lg border-2 border-[#025940]'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600'
                }`}
            >
              <Calendar className="w-5 h-5" />
              {t('dashboard.hireLookup.customDates')}
            </button>
            
            <button
              onClick={() => setSelectedPeriod('sinceAcquired')}
              className={`px-6 py-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2
                ${selectedPeriod === 'sinceAcquired'
                  ? 'bg-[#b3f243] text-[#012619] shadow-lg border-2 border-[#025940]'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-600'
                }`}
            >
              <TrendingUp className="w-5 h-5" />
              {t('dashboard.hireLookup.sinceDateAcquired')}
            </button>
          </div>
        </div>

        {/* Custom Date Range */}
        {selectedPeriod === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:bg-gray-700/30 rounded-lg border-2 border-blue-300 dark:border-gray-600">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {t('dashboard.hireLookup.startDate')}
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:border-[#b3f243] focus:ring-2 focus:ring-[#b3f243]/20 
                         transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {t('dashboard.hireLookup.endDate')}
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:border-[#b3f243] focus:ring-2 focus:ring-[#b3f243]/20 
                         transition-all outline-none"
              />
            </div>
          </div>
        )}

        {/* Since Date Acquired Info */}
        {selectedPeriod === 'sinceAcquired' && (
          <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:bg-purple-900/20 rounded-lg border-2 border-purple-300 dark:border-purple-700">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-purple-900 dark:text-purple-300 mb-1">
                  {t('dashboard.hireLookup.sinceDateAcquired')}
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-400">
                  {t('dashboard.hireLookup.sinceAcquiredBody', { strongStart: '', strongEnd: '' })}
                </p>
                {vehicleDateAcquired && (
                  <div className="mt-2 p-2 bg-white dark:bg-purple-950/30 rounded border border-purple-300 dark:border-purple-600">
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      {t('dashboard.hireLookup.acquiredOn', { strongStart: '', strongEnd: '', date: formatDate(vehicleDateAcquired) })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PROFITABILITY CALCULATOR SECTION */}
        <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 
                      rounded-xl border-2 border-emerald-300 dark:border-emerald-700 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {t('dashboard.hireLookup.calcTitle')}
            </h3>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            {t('dashboard.hireLookup.calcIntro', { br: ' ', spanStart: '', spanEnd: '' })}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Daily Hire Rate */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <PoundSterling className="w-3 h-3 text-green-600 dark:text-green-400" />
                {t('dashboard.hireLookup.dailyHireRate')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold">
                  £
                </span>
                <input
                  type="number"
                  value={dailyHireRate}
                  onChange={(e) => setDailyHireRate(e.target.value)}
                  placeholder="45.00"
                  step="0.01"
                  min="0"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border-2 border-green-300 dark:border-green-600 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:border-green-500 focus:ring-2 focus:ring-green-500/20 
                           transition-all outline-none font-medium"
                />
              </div>
            </div>

            {/* Daily Insurance Cost */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <Shield className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                {t('dashboard.hireLookup.dailyInsuranceCost')}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{t('dashboard.hireLookup.paidEveryDay')}</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold">
                  £
                </span>
                <input
                  type="number"
                  value={dailyInsuranceCost}
                  onChange={(e) => setDailyInsuranceCost(e.target.value)}
                  placeholder="12.00"
                  step="0.01"
                  min="0"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-600 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 
                           transition-all outline-none font-medium"
                />
              </div>
            </div>

            {/* Yearly Service Cost */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                <Wrench className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                {t('dashboard.hireLookup.yearlyServiceCost')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold">
                  £
                </span>
                <input
                  type="number"
                  value={yearlyServiceCost}
                  onChange={(e) => setYearlyServiceCost(e.target.value)}
                  placeholder="500.00"
                  step="0.01"
                  min="0"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border-2 border-orange-300 dark:border-orange-600 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 
                           transition-all outline-none font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={loading || !registration.trim()}
          className="w-full px-6 py-4 bg-gradient-to-r from-[#025940] to-[#012619] 
                   hover:from-[#012619] hover:to-[#025940] text-white font-bold rounded-lg 
                   shadow-lg hover:shadow-xl transition-all disabled:opacity-50 
                   disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t('dashboard.hireLookup.searching')}
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              {t('dashboard.hireLookup.searchHireHistory')}
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Results - UNCHANGED (keeping all the lovely profitability calculations!) */}
      {result && (
        <div className="border-t-2 border-gray-200 dark:border-gray-700">
          {/* Summary Card */}
          <div className="bg-gradient-to-br from-[#b3f243]/10 to-[#72A68E]/10 dark:from-[#012619] dark:to-[#025940] p-6 border-b-2 border-gray-200 dark:border-gray-700">
            {/* Period Calculation Badge */}
            {hasFinancials && (
              <div className="mb-4 p-3 bg-purple-100 dark:bg-purple-900/40 border-2 border-purple-400 dark:border-purple-600 rounded-lg">
                <p className="text-sm font-bold text-purple-800 dark:text-purple-200 text-center">
                  {t('dashboard.hireLookup.profitabilityBadge', { start: formatDate(result.periodStart), end: formatDate(result.periodEnd) })}
                </p>
              </div>
            )}
            
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {result.registration}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {t('dashboard.hireLookup.searchPeriod', { start: formatDate(result.periodStart), end: formatDate(result.periodEnd) })}
                </p>
              </div>
              <div className="text-right px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-[#b3f243] shadow-lg">
                <div className="flex items-center gap-2 text-[#025940] dark:text-[#b3f243]">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-2xl font-bold">{result.utilizationRate}%</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{t('dashboard.hireLookup.utilization')}</p>
              </div>
            </div>
            
            {/* Basic Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-[#72A68E]/30">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">{t('dashboard.hireLookup.totalDaysOnHire')}</p>
                <p className="text-3xl font-bold text-[#025940] dark:text-[#b3f243]">
                  {result.totalDaysOnHire}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-[#72A68E]/30">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">{t('dashboard.hireLookup.numberOfHires')}</p>
                <p className="text-3xl font-bold text-[#025940] dark:text-[#b3f243]">
                  {result.numberOfHires}
                </p>
              </div>
            </div>

            {/* Financial Summary - ALL THE LOVELY CALCULATIONS PRESERVED! */}
            {hasFinancials && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    {t('dashboard.hireLookup.financialSummary')}
                  </h4>
                  <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                    {t('dashboard.hireLookup.daysHiredInPeriod', { count: result.totalDaysOnHire })}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Revenue */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 
                                rounded-lg p-3 border-2 border-green-400 dark:border-green-600">
                    <p className="text-xs text-green-700 dark:text-green-400 mb-1 font-medium flex items-center gap-1">
                      <PoundSterling className="w-3 h-3" />
                      {t('dashboard.hireLookup.totalRevenuePeriod')}
                    </p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      {formatCurrency(totalRevenue)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                      {t('dashboard.hireLookup.daysTimesRate', { count: result.totalDaysOnHire, rate: formatCurrency(parseFloat(dailyHireRate)) })}
                    </p>
                  </div>
                  {/* Insurance */}
                  {dailyInsuranceCost && parseFloat(dailyInsuranceCost) > 0 && (
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 
                                  rounded-lg p-3 border-2 border-blue-400 dark:border-blue-600">
                      <p className="text-xs text-blue-700 dark:text-blue-400 mb-1 font-medium flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        {t('dashboard.hireLookup.insuranceAllDays')}
                      </p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                        -{formatCurrency(totalInsurance)}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                        {t('dashboard.hireLookup.periodDaysTimesCost', { count: periodDays, cost: formatCurrency(parseFloat(dailyInsuranceCost)) })}
                      </p>
                    </div>
                  )}
                  {/* Service */}
                  {yearlyServiceCost && parseFloat(yearlyServiceCost) > 0 && (
                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 
                                  rounded-lg p-3 border-2 border-orange-400 dark:border-orange-600">
                      <p className="text-xs text-orange-700 dark:text-orange-400 mb-1 font-medium flex items-center gap-1">
                        <Wrench className="w-3 h-3" />
                        {t('dashboard.hireLookup.serviceCostProrated')}
                      </p>
                      <p className="text-xl font-bold text-orange-700 dark:text-orange-400">
                        -{formatCurrency(totalService)}
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">
                        {t('dashboard.hireLookup.basedOnYearly', { cost: formatCurrency(parseFloat(yearlyServiceCost)) })}
                      </p>
                    </div>
                  )}
                  {/* Net Profit */}
                  <div className={`bg-gradient-to-br rounded-lg p-3 border-2 shadow-lg
                    ${netProfit >= 0 
                      ? 'from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 border-purple-500 dark:border-purple-600' 
                      : 'from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 border-red-500 dark:border-red-600'
                    }`}>
                    <p className={`text-xs mb-1 font-bold flex items-center gap-1
                      ${netProfit >= 0 ? 'text-purple-700 dark:text-purple-400' : 'text-red-700 dark:text-red-400'}`}>
                      {netProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {t('dashboard.hireLookup.netProfitPeriodTotal')}
                    </p>
                    <p className={`text-xl font-bold
                      ${netProfit >= 0 ? 'text-[#025940] dark:text-[#72A68E]' : 'text-red-700 dark:text-red-400'}`}>
                      {formatCurrency(netProfit)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: netProfit >= 0 ? '#025940' : '#dc2626' }}>
                      {t('dashboard.hireLookup.forDayPeriodHired', { periodDays: periodDays, hiredDays: result.totalDaysOnHire })}
                    </p>
                  </div>
                </div>
                
                {/* Calculation Explanation */}
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('dashboard.hireLookup.howCalculated')}</p>
                  <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    <p>{t('dashboard.hireLookup.calcRevenue', { strongStart: '', strongEnd: '', count: result.totalDaysOnHire, rate: formatCurrency(parseFloat(dailyHireRate)), total: formatCurrency(totalRevenue) })}</p>
                    {dailyInsuranceCost && parseFloat(dailyInsuranceCost) > 0 && (
                      <p>{t('dashboard.hireLookup.calcInsurance', { strongStart: '', strongEnd: '', count: periodDays, cost: formatCurrency(parseFloat(dailyInsuranceCost)), total: formatCurrency(totalInsurance) })}</p>
                    )}
                    {yearlyServiceCost && parseFloat(yearlyServiceCost) > 0 && (
                      <p>{t('dashboard.hireLookup.calcService', { strongStart: '', strongEnd: '', cost: formatCurrency(parseFloat(yearlyServiceCost)), count: periodDays, total: formatCurrency(totalService) })}</p>
                    )}
                    <p className="font-bold pt-1 border-t border-gray-300 dark:border-gray-600">{t('dashboard.hireLookup.calcNetProfit', { strongStart: '', strongEnd: '', total: formatCurrency(netProfit), periodDays: periodDays })}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hire Records - PRESERVED EXACTLY */}
          <div className="p-6">
            {result.hireRecords.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t('dashboard.hireLookup.hireHistoryBreakdown')}
                </h4>
                {result.hireRecords.map((record, index) => {
                  const hireRevenue = calculateHireRevenue(record.durationInDays)
                  
                  return (
                    <div
                      key={record.id || index}
                      className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 
                               hover:border-[#72A68E] hover:shadow-lg transition-all bg-gray-50 dark:bg-gray-700/30"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#b3f243]/20 rounded-lg">
                            <Clock className="w-4 h-4 text-[#025940] dark:text-[#b3f243]" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">
                              {formatDate(record.hireStartDate)} → {formatDate(record.hireEndDate)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                              {record.durationInDays ? t('dashboard.hireLookup.daysCount', { count: record.durationInDays }) : t('dashboard.hireLookup.currentlyOnHire')}
                            </p>
                            {/* Revenue for this hire only */}
                            {hasFinancials && hireRevenue > 0 && (
                              <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.hireLookup.revenueForThisHire')}</p>
                                <span className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <PoundSterling className="w-3 h-3" />
                                  {formatCurrency(hireRevenue)}
                                </span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {t('dashboard.hireLookup.daysTimesRateParen', { count: record.durationInDays ?? 0, rate: formatCurrency(parseFloat(dailyHireRate)) })}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        {!record.hireEndDate && (
                          <span className="px-3 py-1 bg-[#b3f243] text-[#012619]
                                         text-xs font-bold rounded-full shadow-lg">
                            {t('dashboard.hireLookup.activeBadge')}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 pl-11">
                        <div className="flex items-center gap-1.5">
                          <User className="w-4 h-4" />
                          <span className="font-medium">{t('dashboard.hireLookup.hiredByName', { name: record.hiredByName })}</span>
                        </div>
                        {record.returnedByName && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-4 h-4" />
                            <span className="font-medium">{t('dashboard.hireLookup.returnedByName', { name: record.returnedByName })}</span>
                          </div>
                        )}
                      </div>
                      {record.hireNotes && (
                        <p className="text-sm italic text-gray-600 dark:text-gray-400 mt-2 pl-11">
                          "{record.hireNotes}"
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">
                  {t('dashboard.hireLookup.noHistoryFound')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}