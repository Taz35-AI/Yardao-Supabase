// src/components/features/service-bookings/ServiceCalendar.tsx - Updated with Service Bay Display and Navigation Support + HEATMAP
// ✅ SURGICAL FIX: Added isDashboardExternalGarageCheckout to prevent double check-in
'use client'

import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import DayDetailsModal from './DayDetailsModal' // Changed to default import

// Professional Modal Components
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { AlertModal } from '@/components/common/Modals/AlertModal'
import { logger } from '@/lib/logger'
import { useT, localizeWorkRequired } from '@/lib/i18n'

// shared types
import type { ServiceBooking } from '@/types/serviceBookings'

// NEW: Import heatmap utilities
import { 
  getBookingDensityForDate, 
  getHeatmapStyles,
  getDensityLabel,
  shouldShowHeatmap 
} from '@/utils/serviceBookingUtils'

import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Car,
  Wrench,
  Edit,
  Trash2,
  Plus,
  CheckCircle,
  LogIn, // Icon for Check-in Garage
  Users, // NEW: Added for service bay indicator
  AlertCircle, // ✅ SURGICAL FIX: Added for warning banner
  ExternalLink // ✅ SURGICAL FIX: Added for external garage badge
} from 'lucide-react'


interface ServiceCalendarProps {
  bookings: ServiceBooking[]
  onDateSelect: (date: Date) => void
  onBookingEdit: (booking: ServiceBooking) => void
  onBookingDelete: (bookingId: string) => void
  onMarkCompleted: (booking: ServiceBooking) => void
  onCheckInToGarage: (booking: ServiceBooking) => void
  isTimeSlotAvailable: (date: string, timeSlot: string) => boolean
  getBookingsForDate: (date: string) => ServiceBooking[]
  searchReg?: string
  matchingDates?: string[]
}

// Modal states interface
interface ModalStates {
  showCheckInConfirm: boolean
  showErrorAlert: boolean
  showSuccessAlert: boolean
  errorMessage: string
  successMessage: string
  checkInBooking: ServiceBooking | null
}

// Export ref type for parent component
export interface ServiceCalendarRef {
  navigateToDate: (date: Date) => void
}

// Use forwardRef to expose navigation methods
export const ServiceCalendar = forwardRef<ServiceCalendarRef, ServiceCalendarProps>(({
  bookings,
  onDateSelect,
  onBookingEdit,
  onBookingDelete,
  onMarkCompleted,
  onCheckInToGarage,
  isTimeSlotAvailable,
  getBookingsForDate,
  searchReg = '',
  matchingDates = []
}, ref) => {
  const t = useT()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDayModal, setShowDayModal] = useState(false)

  // Professional Modal States
  const [modalStates, setModalStates] = useState<ModalStates>({
    showCheckInConfirm: false,
    showErrorAlert: false,
    showSuccessAlert: false,
    errorMessage: '',
    successMessage: '',
    checkInBooking: null
  })

  // Expose navigation method to parent component
  useImperativeHandle(ref, () => ({
    navigateToDate: (date: Date) => {
      // Navigate to the month containing the date
      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1))
      // Select the date
      setSelectedDate(date)
      // Scroll to view if needed (browser will handle this automatically)
      setTimeout(() => {
        const selectedElement = document.querySelector('[data-selected="true"]')
        if (selectedElement) {
          selectedElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }))

  // Professional modal helper functions
  const showError = (message: string) => {
    setModalStates(prev => ({
      ...prev,
      errorMessage: message,
      showErrorAlert: true
    }))
  }

  const showSuccess = (message: string) => {
    setModalStates(prev => ({
      ...prev,
      successMessage: message,
      showSuccessAlert: true
    }))
  }

  const closeError = () => {
    setModalStates(prev => ({
      ...prev,
      showErrorAlert: false,
      errorMessage: ''
    }))
  }

  const closeSuccess = () => {
    setModalStates(prev => ({
      ...prev,
      showSuccessAlert: false,
      successMessage: ''
    }))
  }

  // ✅ SURGICAL FIX: Helper to detect Dashboard external garage checkouts
  // This prevents showing "Check-in Garage" for vehicles already at external garage
  const isDashboardExternalGarageCheckout = (booking: ServiceBooking): boolean => {
    return Boolean(
      booking.isExternalProvider && 
      booking.originalBranchId && 
      booking.status === 'scheduled'
    )
  }

  // Define month and day names at the top
  const monthNames = [
    t('serviceBookings.month.january'), t('serviceBookings.month.february'), t('serviceBookings.month.march'),
    t('serviceBookings.month.april'), t('serviceBookings.month.may'), t('serviceBookings.month.june'),
    t('serviceBookings.month.july'), t('serviceBookings.month.august'), t('serviceBookings.month.september'),
    t('serviceBookings.month.october'), t('serviceBookings.month.november'), t('serviceBookings.month.december')
  ]

  // Professional day names with sophisticated gradients - GREEN PALETTE
  const dayNames = [
    { short: t('serviceBookings.day.sunShort'), full: t('serviceBookings.day.sunFull'), color: 'bg-gradient-to-br from-[#C5D9D0] to-[#C5D9D0]/70 text-[#012619] dark:from-[#012619]/60 dark:to-[#012619]/40 dark:text-[#C5D9D0] border border-[#72A68E]/60 dark:border-[#025940]/40 shadow-sm backdrop-blur-sm' },
    { short: t('serviceBookings.day.monShort'), full: t('serviceBookings.day.monFull'), color: 'bg-gradient-to-br from-[#72A68E]/90 to-[#72A68E]/60 text-[#012619] dark:from-[#025940]/40 dark:to-[#025940]/20 dark:text-[#C5D9D0] border border-[#025940]/60 dark:border-[#72A68E]/40 shadow-sm backdrop-blur-sm' },
    { short: t('serviceBookings.day.tueShort'), full: t('serviceBookings.day.tueFull'), color: 'bg-gradient-to-br from-[#72A68E] to-[#72A68E]/70 text-white dark:from-[#025940]/40 dark:to-[#025940]/20 dark:text-[#72A68E] border border-[#025940]/60 dark:border-[#72A68E]/40 shadow-sm backdrop-blur-sm' },
    { short: t('serviceBookings.day.wedShort'), full: t('serviceBookings.day.wedFull'), color: 'bg-gradient-to-br from-[#025940] to-[#025940]/80 text-white dark:from-[#025940]/40 dark:to-[#025940]/20 dark:text-[#72A68E] border border-[#012619]/60 dark:border-[#025940]/40 shadow-sm backdrop-blur-sm' },
    { short: t('serviceBookings.day.thuShort'), full: t('serviceBookings.day.thuFull'), color: 'bg-gradient-to-br from-[#025940]/90 to-[#025940]/70 text-white dark:from-[#012619]/40 dark:to-[#012619]/20 dark:text-[#72A68E] border border-[#012619]/60 dark:border-[#025940]/40 shadow-sm backdrop-blur-sm' },
    { short: t('serviceBookings.day.friShort'), full: t('serviceBookings.day.friFull'), color: 'bg-gradient-to-br from-[#012619] to-[#012619]/80 text-white dark:from-[#025940]/40 dark:to-[#025940]/20 dark:text-[#C5D9D0] border border-[#012619]/60 dark:border-[#025940]/40 shadow-sm backdrop-blur-sm' },
    { short: t('serviceBookings.day.satShort'), full: t('serviceBookings.day.satFull'), color: 'bg-gradient-to-br from-[#72A68E]/80 to-[#72A68E]/60 text-[#012619] dark:from-[#025940]/40 dark:to-[#025940]/20 dark:text-[#C5D9D0] border border-[#025940]/60 dark:border-[#72A68E]/40 shadow-sm backdrop-blur-sm' }
  ]

  // Calendar navigation
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }

  // Generate calendar days - CURRENT MONTH ONLY for mobile
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    // Create dates in local timezone to avoid any UTC conversion issues
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // For mobile: Show current month days only
    // For desktop: Show full 6-week calendar with adjacent months
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
    
    if (isMobile) {
      // MOBILE: Show only current month days
      const days = []
      for (let day = 1; day <= lastDay.getDate(); day++) {
        days.push(new Date(year, month, day))
      }
      return days
    } else {
      // DESKTOP: Show full 6-week calendar
      const startDate = new Date(year, month, 1 - firstDay.getDay())
      const days = []
      
      // Generate 42 days (6 weeks) using local date arithmetic
      for (let i = 0; i < 42; i++) {
        const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i)
        days.push(day)
      }
      return days
    }
  }, [currentDate])

  // Format date for comparison
  const formatDateString = (date: Date): string => {
    // Use local date components to avoid timezone issues
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Check if date is today
  const isToday = (date: Date): boolean => {
    const today = new Date()
    return formatDateString(date) === formatDateString(today)
  }

  // Check if date is in current month
  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentDate.getMonth()
  }

  // Check if date is selected
  const isSelected = (date: Date): boolean => {
    return selectedDate ? formatDateString(date) === formatDateString(selectedDate) : false
  }

  // Get bookings count for a date
  const getBookingsCount = (date: Date): number => {
    const dateStr = formatDateString(date)
    return getBookingsForDate(dateStr).length
  }

  // Handle date click - different behavior for mobile vs desktop
  const handleDateClick = (date: Date) => {
    logger.log('Date clicked:', date.toDateString(), 'Formatted:', formatDateString(date))
    const isMobile = window.innerWidth < 1024 // lg breakpoint
    setSelectedDate(date)
    
    if (isMobile) {
      // On mobile, show modal with day details
      setShowDayModal(true)
    }
  }

  // Handle add booking
  const handleAddBooking = (date: Date) => {
    logger.log('Add booking for date:', date.toDateString(), 'Formatted:', formatDateString(date))
    onDateSelect(date)
  }

  // Professional check-in to garage handler
  const handleCheckInToGarage = (booking: ServiceBooking) => {
    setModalStates(prev => ({
      ...prev,
      checkInBooking: booking,
      showCheckInConfirm: true
    }))
  }

  const handleCheckInConfirm = async () => {
    const booking = modalStates.checkInBooking
    if (!booking) return

    try {
      await onCheckInToGarage(booking)
      setModalStates(prev => ({
        ...prev,
        showCheckInConfirm: false,
        checkInBooking: null
      }))
      showSuccess(t('serviceBookings.checkin.successMessage', {
        registration: booking.registration,
        garageName: booking.externalProvider?.garageName || t('serviceBookings.checkin.fallbackExternalGarage')
      }))
    } catch (error) {
      logger.error('Error checking in to garage:', error)
      showError(t('serviceBookings.checkin.errorMessage'))
    }
  }

  // Format time to consistent HH:MM format with leading zeros
  const formatTime = (timeString: string): string => {
    if (!timeString) return t('serviceBookings.calendar.timeFallback')
    
    // Handle internal time slots (e.g., "08:30-10:00")
    if (timeString.includes('-')) {
      return timeString.split('-')[0]
    }
    
    // Handle external custom times (e.g., "930", "9:30", "1430")
    const cleanTime = timeString.replace(/[^\d:]/g, '') // Remove non-digits and non-colons
    
    // If it already has a colon, ensure it's properly formatted with leading zeros
    if (cleanTime.includes(':')) {
      const [hours, minutes] = cleanTime.split(':')
      const formattedHours = hours.padStart(2, '0')
      const formattedMinutes = minutes.padStart(2, '0')
      return `${formattedHours}:${formattedMinutes}`
    }
    
    // Convert formats like "930" or "1430" to "09:30" or "14:30"
    if (cleanTime.length === 3) {
      // Format: "930" -> "09:30"
      const hours = cleanTime[0].padStart(2, '0')
      const minutes = cleanTime.slice(1)
      return `${hours}:${minutes}`
    } else if (cleanTime.length === 4) {
      // Format: "1430" -> "14:30"
      const hours = cleanTime.slice(0, 2)
      const minutes = cleanTime.slice(2)
      return `${hours}:${minutes}`
    } else if (cleanTime.length === 1 || cleanTime.length === 2) {
      // Format: "9" -> "09:00" or "14" -> "14:00"
      const hours = cleanTime.padStart(2, '0')
      return `${hours}:00`
    }
    
    // Fallback to original if we can't parse it
    return timeString
  }

  // Get status color - ENHANCED with gradients and new status - GREEN PALETTE
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-gradient-to-r from-[#72A68E] to-[#72A68E]/80 text-white border-[#025940] dark:from-[#025940]/30 dark:to-[#025940]/20 dark:text-[#72A68E] dark:border-[#72A68E]'
      case 'checked_in_to_garage':
        return 'bg-gradient-to-r from-orange-100 to-orange-50 text-orange-800 border-orange-200 dark:from-orange-900/30 dark:to-orange-800/20 dark:text-orange-300 dark:border-orange-600'
      case 'in-progress':
        return 'bg-gradient-to-r from-amber-100 to-amber-50 text-amber-800 border-amber-200 dark:from-amber-900/30 dark:to-amber-800/20 dark:text-amber-300 dark:border-amber-600'
      case 'cancelled':
        return 'bg-gradient-to-r from-red-100 to-red-50 text-red-800 border-red-200 dark:from-red-900/30 dark:to-red-800/20 dark:text-red-300 dark:border-red-600'
      case 'scheduled':
      default:
        return 'bg-gradient-to-r from-[#C5D9D0] to-[#C5D9D0]/80 text-[#012619] border-[#72A68E] dark:from-[#025940]/30 dark:to-[#025940]/20 dark:text-[#C5D9D0] dark:border-[#025940]'
    }
  }

  // Get status label - function for better display
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'completed':
        return t('serviceBookings.status.completed')
      case 'checked_in_to_garage':
        return t('serviceBookings.status.atGarage')
      case 'in-progress':
        return t('serviceBookings.status.inProgress')
      case 'cancelled':
        return t('serviceBookings.status.cancelled')
      case 'scheduled':
      default:
        return t('serviceBookings.status.scheduled')
    }
  }

  // NEW: Get bay color based on bay number
  const getBayColor = (bayNumber: number): string => {
    if (bayNumber === 1) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    } else if (bayNumber === 2) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
    } else if (bayNumber === 3) {
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
    } else {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    }
  }

  // NEW: Check if multiple bookings share the same time slot for a given date
  const hasMultipleBaysInTimeSlot = (date: string, timeSlot: string): boolean => {
    const slotBookings = bookings.filter(b => 
      b.date === date && 
      b.timeSlot === timeSlot && 
      !b.isExternalProvider && 
      b.status !== 'cancelled'
    )
    return slotBookings.length > 1
  }

  // Get grid layout classes based on mobile/desktop - FIXED MOBILE
  const getGridClasses = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
    
    if (isMobile) {
      // Mobile: Dynamic grid based on month layout
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const startDay = firstDay.getDay() // 0 = Sunday, 1 = Monday, etc.
      
      return {
        container: "grid gap-1",
        header: "grid grid-cols-7 gap-1 mb-2",
        days: `grid grid-cols-7 gap-1`,
        // Add empty cells for proper alignment
        emptyStart: startDay
      }
    } else {
      // Desktop: Standard 6-week calendar
      return {
        container: "grid gap-2",
        header: "grid grid-cols-7 gap-2 mb-3", 
        days: "grid grid-cols-7 gap-2",
        emptyStart: 0
      }
    }
  }

  // Truncate registration text - less aggressive for wider cells
  const truncateText = (text: string, maxLength: number = 12): string => {
    if (!text) return ''
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
  }

  // UPDATED: Create booking display text with bay info
  const getBookingDisplayText = (booking: ServiceBooking, isMobile: boolean = false): string => {
    const time = booking.isExternalProvider ? 
      formatTime(booking.externalProvider?.customTime || '') : 
      formatTime(booking.timeSlot)
    
    const registration = truncateText(booking.registration, isMobile ? 7 : 10) // Adjusted for bracket notation
    // NEW: Add bay number with bracket notation [B1], [B2], etc.
    let bayText = ''
    if (booking.serviceBay && booking.serviceBay > 1) {
      bayText = ` [B${booking.serviceBay}]`
    } else if (booking.serviceBay && hasMultipleBaysInTimeSlot(booking.date, booking.timeSlot)) {
      // Show [B1] if there are multiple bookings in the same slot
      bayText = ' [B1]'
    }
    return `${time} ${registration}${bayText}`
  }

  const gridClasses = getGridClasses()

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="shadow-xl border-0 bg-gradient-to-br from-white via-[#C5D9D0]/10 to-[#72A68E]/10 dark:from-[#0D0D0D] dark:via-[#0D0D0D]/80 dark:to-[#012619]/50 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#012619] via-[#025940] to-[#025940] text-white pb-4 lg:pb-6 px-3 lg:px-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 lg:space-x-3 min-w-0 flex-1">
                  <div className="p-2 lg:p-3 bg-white/10 backdrop-blur-sm rounded-lg lg:rounded-xl border border-white/20 flex-shrink-0">
                    <Calendar className="w-4 h-4 lg:w-6 lg:h-6" />
                  </div>
                  <CardTitle className="text-lg lg:text-2xl font-bold bg-gradient-to-r from-white to-[#C5D9D0] bg-clip-text text-transparent truncate">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToPreviousMonth}
                    className="text-white hover:bg-white/10 border border-white/20 backdrop-blur-sm h-8 w-8 lg:h-9 lg:w-9 p-0"
                  >
                    <ChevronLeft className="w-3 h-3 lg:w-4 lg:h-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToToday}
                    className="text-white hover:bg-white/10 border border-white/20 backdrop-blur-sm px-2 lg:px-4 text-xs lg:text-sm"
                  >
                    {t('serviceBookings.calendar.todayButton')}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={goToNextMonth}
                    className="text-white hover:bg-white/10 border border-white/20 backdrop-blur-sm h-8 w-8 lg:h-9 lg:w-9 p-0"
                  >
                    <ChevronRight className="w-3 h-3 lg:w-4 lg:h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 p-3 lg:p-6">
              <div className={gridClasses.container}>
                {/* FORCE EXACT WIDTH MATCHING - NUCLEAR OPTION */}
                <div className={`${gridClasses.header} [&>*]:box-border`}>
                  {dayNames.map((day, index) => (
                    <div 
                      key={day.short} 
                      className={`
                        text-center rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105
                        py-3 lg:py-4 box-border w-full
                        ${day.color}
                      `}
                      title={day.full}
                    >
                      <div className="hidden sm:block">{day.short}</div>
                      <div className="sm:hidden text-xs">{day.short.charAt(0)}</div>
                    </div>
                  ))}
                </div>

                {/* FORCE EXACT WIDTH MATCHING - NUCLEAR OPTION */}
                <div className={`${gridClasses.days} [&>*]:box-border`}>
                  {/* Add empty cells for mobile month alignment */}
                  {Array.from({ length: gridClasses.emptyStart }, (_, i) => (
                    <div key={`empty-${i}`} className="h-14 lg:aspect-square lg:min-h-[140px] lg:max-h-[180px] box-border w-full"></div>
                  ))}
                  
                  {calendarDays.map((date, index) => {
                    const dayBookings = getBookingsForDate(formatDateString(date))
                    const bookingsCount = dayBookings.length
                    const isCurrentMonthDate = isCurrentMonth(date)
                    const isTodayDate = isToday(date)
                    const isSelectedDate = isSelected(date)
                    const dateString = formatDateString(date)
                    const hasMatchingReg = searchReg && matchingDates.includes(dateString)

                    // NEW: Calculate heatmap density and get styles
                    const density = getBookingDensityForDate(bookings, dateString)
                    const heatmapStyles = getHeatmapStyles(density)
                    const showHeatmapIndicator = shouldShowHeatmap(bookings, dateString)
                    const densityLabel = getDensityLabel(density)

                    return (
                      <div
                        key={index}
                        data-selected={isSelectedDate}
                        className={`
                          group relative rounded-xl border-2 transition-all duration-300 cursor-pointer transform hover:scale-105
                          h-14 lg:aspect-square lg:min-h-[140px] lg:max-h-[180px] lg:flex lg:flex-col
                          box-border w-full shadow-sm hover:shadow-lg
                          ${!isCurrentMonthDate 
                            ? 'text-gray-300 dark:text-gray-600 bg-gray-50/50 dark:bg-gray-800/30 border-gray-200/50 dark:border-gray-700/50' 
                            : showHeatmapIndicator 
                              ? heatmapStyles  // NEW: Apply heatmap styles if bookings exist
                              : 'bg-white dark:bg-[#0D0D0D] border-[#C5D9D0] dark:border-[#025940] hover:bg-gradient-to-br hover:from-[#C5D9D0]/20 hover:to-[#72A68E]/20 dark:hover:from-[#025940]/20 dark:hover:to-[#012619]/20'
                          }
                          ${isTodayDate 
                            ? 'bg-gradient-to-br from-[#72A68E]/30 via-[#72A68E]/20 to-white dark:from-[#025940]/50 dark:via-[#025940]/40 dark:to-[#012619]/30 border-[#025940] dark:border-[#72A68E] shadow-lg ring-2 ring-[#72A68E]/50 dark:ring-[#025940]/50 ring-offset-1' 
                            : ''
                          }
                          ${isSelectedDate 
                            ? 'ring-2 ring-offset-2 ring-[#025940] dark:ring-[#72A68E] shadow-lg' 
                            : ''
                          }
                          ${hasMatchingReg && isCurrentMonthDate 
                            ? 'ring-2 ring-offset-1 ring-orange-400 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/20 border-orange-300 dark:border-orange-600' 
                            : ''
                          }
                        `}
                        onClick={() => handleDateClick(date)}
                        title={showHeatmapIndicator ? t('serviceBookings.calendar.densityTooltip', { densityLabel, count: bookingsCount }) : undefined}
                      >
                        {/* MOBILE: Show only center count - COMPACT - NO PADDING */}
                        <div className="lg:hidden flex items-center justify-center h-full">
                          <div className="flex flex-col items-center">
                            <span className={`text-sm font-bold ${isTodayDate ? 'text-[#025940] dark:text-[#72A68E] bg-white/80 dark:bg-black/30 px-1 rounded' : ''}`}>
                              {date.getDate()}
                              {isTodayDate && (
                                <span className="text-[8px] block -mt-0.5">{t('serviceBookings.calendar.todayBadgeMobile')}</span>
                              )}
                            </span>
                            {/* Mobile: Show count and bay info if multiple services */}
                            {bookingsCount > 0 && (
                              <div className="flex flex-col items-center">
                                <div className="bg-gradient-to-r from-[#025940] to-[#012619] text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-sm">
                                  {bookingsCount}
                                </div>
                                {/* Show bay indicator if multiple bookings in same slot */}
                                {dayBookings.some(b => b.serviceBay && b.serviceBay > 1) && (
                                  <div className="text-[8px] text-[#025940] dark:text-[#72A68E] font-bold mt-0.5">
                                    [B1-B{Math.max(...dayBookings.map(b => b.serviceBay || 1))}]
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* DESKTOP: Show top-right badge + booking details - FIXED OVERSPILL */}
                        <div className="hidden lg:flex lg:flex-col h-full p-2">
                          {/* Date and count header */}
                          <div className="flex items-center justify-between mb-2 flex-shrink-0">
                            <span className={`text-lg font-bold ${isTodayDate ? 'text-[#025940] dark:text-[#72A68E] bg-white/90 dark:bg-black/40 px-1.5 py-0.5 rounded-md shadow-sm' : ''}`}>
                              {date.getDate()}
                              {isTodayDate && (
                                <span className="text-[9px] block -mt-1 text-[#72A68E] dark:text-[#C5D9D0]">{t('serviceBookings.calendar.todayBadgeDesktop')}</span>
                              )}
                            </span>
                            {bookingsCount > 0 && (
                              <Badge className="bg-gradient-to-r from-[#025940] to-[#012619] text-white border-0 shadow-md font-bold">
                                {bookingsCount}
                              </Badge>
                            )}
                          </div>

                          {/* Booking details container - FIXED OVERFLOW */}
                          <div className="flex-1 overflow-hidden min-h-0">
                            <div className="space-y-1.5 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                              {dayBookings.slice(0, 6).map((booking, idx) => {
                                const isMatchingReg = searchReg && booking.registration && 
                                  booking.registration.toLowerCase().includes(searchReg.toLowerCase())
                                
                                const displayText = getBookingDisplayText(booking, false) // Desktop = false
                                const fullTooltip = `${booking.isExternalProvider ? 
                                  (booking.externalProvider?.customTime || 'External') : 
                                  booking.timeSlot} - ${booking.registration}${booking.make && booking.model ? ` (${booking.make} ${booking.model})` : ''}${booking.serviceBay ? ` [B${booking.serviceBay}]` : ''}`
                                
                                return (
                                  <div
                                    key={idx}
                                    className={`
                                      text-xs px-2 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer
                                      hover:shadow-md hover:scale-105 transform backdrop-blur-sm
                                      ${getStatusColor(booking.status)}
                                      ${isMatchingReg ? 'ring-2 ring-orange-400 shadow-md transform scale-105' : ''}
                                      overflow-hidden
                                    `}
                                    title={fullTooltip}
                                  >
                                    <div className="truncate font-semibold leading-tight">
                                      {displayText}
                                    </div>
                                  </div>
                                )
                              })}
                              
                              {/* Show "+X more" if there are more than 6 bookings */}
                              {dayBookings.length > 6 && (
                                <div className="text-xs text-[#72A68E] dark:text-[#C5D9D0] text-center py-1 bg-gradient-to-r from-[#C5D9D0] to-[#C5D9D0]/50 dark:from-[#025940] dark:to-[#025940]/50 rounded-lg border border-[#72A68E] dark:border-[#025940]">
                                  {t('serviceBookings.calendar.moreBookings', { count: dayBookings.length - 6 })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Add button - positioned at bottom */}
                          {isCurrentMonthDate && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="absolute bottom-2 right-2 w-7 h-7 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-gradient-to-r from-[#025940] to-[#012619] hover:from-[#012619] hover:to-[#025940] text-white shadow-lg hover:shadow-xl transform hover:scale-110 border-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAddBooking(date)
                              }}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Day Details Panel (Desktop Only) - UPDATED WITH BAY DISPLAY */}
        <div className="space-y-6 hidden lg:block">
          {selectedDate && (
            <Card className="shadow-xl border-0 bg-gradient-to-br from-white to-[#C5D9D0]/20 dark:from-[#0D0D0D] dark:to-[#012619]/50 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-[#012619] via-[#025940] to-[#025940] text-white pb-4">
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-white">
                    {selectedDate.toLocaleDateString('en-GB', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                {/* Add Booking Button */}
                <Button
                  onClick={() => handleAddBooking(selectedDate)}
                  className="w-full flex items-center gap-2 bg-gradient-to-r from-[#012619] via-[#025940] to-[#025940] hover:from-[#025940] hover:via-[#025940] hover:to-[#012619] text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                >
                  <Plus className="w-4 h-4" />
                  {t('serviceBookings.calendar.addBooking')}
                </Button>

                {/* Bookings for Selected Date - UPDATED WITH BAY INFO */}
                <div className="space-y-3">
                  {getBookingsForDate(formatDateString(selectedDate)).length === 0 ? (
                    <div className="text-center py-8">
                      <div className="p-4 bg-[#C5D9D0]/30 dark:bg-[#025940]/20 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <Calendar className="w-8 h-8 text-[#72A68E] dark:text-[#C5D9D0]" />
                      </div>
                      <p className="text-sm text-[#72A68E] dark:text-[#C5D9D0]">
                        {t('serviceBookings.calendar.noBookingsForDay')}
                      </p>
                    </div>
                  ) : (
                    getBookingsForDate(formatDateString(selectedDate)).map((booking, idx) => {
                      // ✅ SURGICAL FIX: Check if this is a dashboard external garage checkout
                      const isExternalCheckout = isDashboardExternalGarageCheckout(booking)
                      
                      return (
                        <div
                          key={idx}
                          className="border-2 border-[#C5D9D0] dark:border-[#025940] rounded-xl p-4 space-y-3 bg-gradient-to-r from-white to-[#C5D9D0]/10 dark:from-[#0D0D0D] dark:to-[#012619]/20 hover:shadow-lg transition-all duration-200 hover:border-[#72A68E] dark:hover:border-[#72A68E]"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-[#72A68E]" />
                              <span className="font-medium text-sm">
                                {booking.isExternalProvider && booking.externalProvider?.customTime
                                  ? booking.externalProvider.customTime
                                  : booking.timeSlot
                                }
                                {/* NEW: Show bay inline if only one booking in slot but not bay 1 */}
                                {!booking.isExternalProvider && booking.serviceBay && 
                                 !hasMultipleBaysInTimeSlot(booking.date, booking.timeSlot) && 
                                 booking.serviceBay > 1 && (
                                  <span className="ml-2 text-[#72A68E]">{t('serviceBookings.calendar.bayInline', { count: booking.serviceBay })}</span>
                                )}
                              </span>
                              {/* ✅ SURGICAL FIX: Enhanced status badge for external checkouts */}
                              <Badge className={`${getStatusColor(booking.status)} font-semibold ${isExternalCheckout ? 'flex items-center gap-1' : ''}`}>
                                {isExternalCheckout && <ExternalLink className="w-3 h-3" />}
                                {isExternalCheckout ? t('serviceBookings.calendar.atExternalGarage') : getStatusLabel(booking.status)}
                              </Badge>
                              {booking.isExternalProvider && !isExternalCheckout && (
                                <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-900/20">
                                  {t('serviceBookings.calendar.extBadge')}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-[#72A68E]" />
                            <span className="font-semibold text-sm">{booking.registration}</span>
                            {booking.make && booking.model && (
                              <span className="text-xs text-[#72A68E] dark:text-[#C5D9D0]">
                                {booking.make} {booking.model}
                              </span>
                            )}
                            {/* NEW: Service Bay Badge */}
                            {!booking.isExternalProvider && booking.serviceBay && hasMultipleBaysInTimeSlot(booking.date, booking.timeSlot) && (
                              <Badge className={`${getBayColor(booking.serviceBay)} text-xs font-semibold flex items-center gap-1`}>
                                <Users className="w-3 h-3" />
                                {t('serviceBookings.calendar.bayBadge', { count: booking.serviceBay })}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-[#72A68E]" />
                            <span className="text-xs">
                              {localizeWorkRequired(t, booking.workRequired, t('serviceBookings.workFallback.generalService'), ', ')}
                            </span>
                          </div>

                          {booking.isExternalProvider && booking.externalProvider && (
                            <div className="flex items-center gap-2 pt-2 border-t border-purple-100 dark:border-purple-800">
                              <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-200 dark:border-purple-700 w-full">
                                <strong>{t('serviceBookings.calendar.externalProviderLabel')}</strong> {booking.externalProvider.garageName}
                                {booking.externalProvider.address && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    📍 {booking.externalProvider.address}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Check-in to Garage Info */}
                          {booking.status === 'checked_in_to_garage' && booking.checkedInToGarageAt && (
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-700">
                              <div className="text-xs text-orange-800 dark:text-orange-200">
                                <strong>{t('serviceBookings.calendar.checkedIntoGarage')}</strong> {booking.checkedInToGarageAt.toLocaleDateString('en-GB')} at {booking.checkedInToGarageAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                {booking.checkedInToGarageByName && (
                                  <div className="mt-1">{t('serviceBookings.calendar.checkedInByMobile', { name: booking.checkedInToGarageByName })}</div>
                                )}
                                {/* NEW: Show bay info in check-in status */}
                                {booking.serviceBay && booking.serviceBay > 1 && (
                                  <div className="mt-1">{t('serviceBookings.calendar.serviceBayLine', { count: booking.serviceBay })}</div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ✅ SURGICAL FIX: Warning banner for external garage checkouts */}
                          {isExternalCheckout && (
                            <div className="bg-[#025940]/10 dark:bg-[#025940]/20 p-3 rounded-lg border border-[#025940]/30 dark:border-[#025940]/50">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-[#025940] dark:text-[#C5D9D0]">
                                  <p className="font-semibold mb-1">{t('serviceBookings.calendar.managedFromDashboardTitle')}</p>
                                  <p>{t('serviceBookings.calendar.managedFromDashboardBody')}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            {/* ✅ SURGICAL FIX: Hide Check-in Garage button for Dashboard external garage checkouts */}
                            {booking.status === 'scheduled' && 
                             booking.isExternalProvider && 
                             !isExternalCheckout && ( // ← THIS IS THE FIX
                              <Button
                                size="sm"
                                onClick={() => handleCheckInToGarage(booking)}
                                className="flex items-center gap-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300"
                              >
                                <LogIn className="w-3 h-3" />
                                {t('serviceBookings.action.checkInGarage')}
                              </Button>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onBookingEdit(booking)}
                              className="flex items-center gap-1 hover:bg-[#C5D9D0]/30 hover:border-[#72A68E] dark:hover:bg-[#025940]/20"
                            >
                              <Edit className="w-3 h-3" />
                              {t('serviceBookings.action.edit')}
                            </Button>
                            
                            {/* ✅ SURGICAL FIX: Hide Complete button for Dashboard external garage checkouts */}
                            {(booking.status === 'scheduled' || booking.status === 'checked_in_to_garage' || booking.status === 'in-progress') && 
                             !isExternalCheckout && ( // ← THIS IS THE FIX
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onMarkCompleted(booking)}
                                className="flex items-center gap-1 text-[#025940] hover:text-[#012619] hover:bg-[#72A68E]/20 hover:border-[#025940] dark:hover:bg-[#025940]/20"
                              >
                                <CheckCircle className="w-3 h-3" />
                                {t('serviceBookings.action.complete')}
                              </Button>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => booking.id && onBookingDelete(booking.id)}
                              className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-900/20"
                              disabled={!booking.id}
                            >
                              <Trash2 className="w-3 h-3" />
                              {t('serviceBookings.action.delete')}
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Mobile Day Details Modal - Already updated with bay display */}
      {showDayModal && selectedDate && (
        <DayDetailsModal
          isOpen={showDayModal}
          onClose={() => setShowDayModal(false)}
          selectedDate={selectedDate}
          bookings={getBookingsForDate(formatDateString(selectedDate))}
          onBookingEdit={onBookingEdit}
          onBookingDelete={onBookingDelete}
          onMarkCompleted={onMarkCompleted}
          onCheckInToGarage={handleCheckInToGarage}
          onAddBooking={handleAddBooking}
        />
      )}

      {/* Professional Modal Dialogs */}
      <ConfirmationModal
        isOpen={modalStates.showCheckInConfirm}
        onClose={() => setModalStates(prev => ({ ...prev, showCheckInConfirm: false, checkInBooking: null }))}
        onConfirm={handleCheckInConfirm}
        title={t('serviceBookings.checkin.confirmTitle')}
        message={modalStates.checkInBooking ?
          t('serviceBookings.checkin.confirmMessage', {
            registration: modalStates.checkInBooking.registration,
            garageName: modalStates.checkInBooking.externalProvider?.garageName || t('serviceBookings.checkin.fallbackExternalGarage')
          }) :
          t('serviceBookings.checkin.confirmFallback')
        }
        confirmText={t('serviceBookings.checkin.confirmText')}
        cancelText={t('serviceBookings.common.cancel')}
        variant="warning"
      />

      <AlertModal
        isOpen={modalStates.showErrorAlert}
        onClose={closeError}
        title={t('serviceBookings.common.errorTitle')}
        message={modalStates.errorMessage}
        variant="error"
        actionText={t('serviceBookings.common.ok')}
      />

      <AlertModal
        isOpen={modalStates.showSuccessAlert}
        onClose={closeSuccess}
        title={t('serviceBookings.common.successTitle')}
        message={modalStates.successMessage}
        variant="success"
        actionText={t('serviceBookings.common.ok')}
      />
    </>
  )
})

// Add display name for debugging
ServiceCalendar.displayName = 'ServiceCalendar'

// Default export
export default ServiceCalendar