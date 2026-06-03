// src/components/common/NotificationBell.tsx
// 🔔 REBUILT: Clean, modern notification bell matching Yardao brand
// ✅ Same useNotifications hook interface — drop-in replacement
// ✅ Same props: inSidebar for sidebar vs top-nav positioning
// ✅ Cleaner UI, no debug clutter, app-like feel

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bell,
  Calendar,
  AlertTriangle,
  Clock,
  Car,
  ExternalLink,
  X,
  CheckCheck,
  Trash2,
  Truck,
  TrendingDown,
  StickyNote,
} from 'lucide-react'
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications'

interface NotificationBellProps {
  inSidebar?: boolean
}

export function NotificationBell({ inSidebar = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    notifications,
    counts,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    isNotificationRead,
    currentTime,
    todayString,
  } = useNotifications()

  // ── Dismiss animation state ─────────────────────────────────────────────────
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const unreadCount = counts.unread
  const hasUrgent = notifications.some(n => !isNotificationRead(n.id) && n.priority === 'high')

  const formatDate = useCallback(
    (dateStr: string) => {
      if (dateStr === todayString) return 'Today'
      const tomorrow = new Date(currentTime)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
      if (dateStr === tomorrowStr) return 'Tomorrow'
      const d = new Date(dateStr + 'T00:00:00')
      return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
    },
    [currentTime, todayString],
  )

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'service_today':
        return <Calendar className="w-3.5 h-3.5" />
      case 'mot_expired':
        return <AlertTriangle className="w-3.5 h-3.5" />
      case 'mot_due_soon':
        return <Clock className="w-3.5 h-3.5" />
      case 'delivery_today':
        return <Truck className="w-3.5 h-3.5" />
      case 'defleet_today':
        return <TrendingDown className="w-3.5 h-3.5" />
      case 'note_today':
        return <StickyNote className="w-3.5 h-3.5" />
      default:
        return <Bell className="w-3.5 h-3.5" />
    }
  }

  const priorityStyles: Record<string, { dot: string; icon: string; bar: string }> = {
    high: {
      dot: 'bg-red-500',
      icon: 'text-red-600 dark:text-red-400',
      bar: 'bg-red-500',
    },
    medium: {
      dot: 'bg-amber-500',
      icon: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500',
    },
    low: {
      dot: 'bg-[#025940]',
      icon: 'text-[#025940] dark:text-[#72A68E]',
      bar: 'bg-[#025940]',
    },
  }

  // ── Animated dismiss ────────────────────────────────────────────────────────
  const handleDismiss = useCallback(
    (id: string) => {
      setDismissing(prev => new Set([...prev, id]))
      setTimeout(() => {
        clearNotification(id)
        setDismissing(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 250)
    },
    [clearNotification],
  )

  const handleClearAll = useCallback(() => {
    const ids = notifications.map(n => n.id)
    setDismissing(new Set(ids))
    setTimeout(() => {
      clearAllNotifications()
      setDismissing(new Set())
    }, 250)
  }, [notifications, clearAllNotifications])

  // ── Swipe to dismiss (mobile) ───────────────────────────────────────────────
  const swipeRef = useRef<{ x: number; y: number; id: string } | null>(null)

  const onTouchStart = (e: React.TouchEvent, id: string) => {
    const t = e.targetTouches[0]
    swipeRef.current = { x: t.clientX, y: t.clientY, id }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!swipeRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - swipeRef.current.x
    const dy = Math.abs(t.clientY - swipeRef.current.y)
    if (dx > 80 && dy < 40) handleDismiss(swipeRef.current.id)
    swipeRef.current = null
  }

  // ── Dropdown positioning ────────────────────────────────────────────────────
  const dropdownPosition = useCallback((): React.CSSProperties => {
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768

    if (mobile) {
      return {
        position: 'fixed',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100vw - 2rem)',
        maxWidth: '22rem',
        maxHeight: 'calc(100vh - 10rem)',
      }
    }

    if (inSidebar) {
      return {
        position: 'fixed',
        bottom: 80,
        left: 20,
        width: '22rem',
        maxHeight: 'calc(100vh - 160px)',
      }
    }

    return {
      position: 'absolute',
      top: 'calc(100% + 0.5rem)',
      right: 0,
      minWidth: '22rem',
      maxWidth: '26rem',
      maxHeight: 'calc(100vh - 8rem)',
    }
  }, [inSidebar])

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Bell button ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="relative p-2 rounded-lg transition-colors hover:bg-[#025940]/10 dark:hover:bg-white/10"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5 text-[#4a5e54] dark:text-gray-300" />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white leading-none px-1 ${
              hasUrgent ? 'bg-red-500' : 'bg-[#025940]'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown ─────────────────────────────────────────────────────────── */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="z-50 bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-2xl overflow-hidden flex flex-col"
            style={dropdownPosition()}
          >
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                <span className="text-sm font-semibold text-[#012619] dark:text-white">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-[#025940] text-white rounded-full px-1.5 py-0.5 leading-none">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="p-1.5 rounded-md text-[#4a5e54] hover:bg-[#025940]/10 dark:text-gray-400 dark:hover:bg-white/10 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="p-1.5 rounded-md text-[#4a5e54] hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    title="Clear all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-md text-[#4a5e54] hover:bg-[#025940]/10 dark:text-gray-400 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── Quick stats ──────────────────────────────────────────────── */}
            {notifications.length > 0 && (counts.high > 0 || counts.servicesToday > 0 || counts.deliveriesToday > 0 || counts.defleetsToday > 0 || counts.notesToday > 0) && (
              <div className="flex gap-1.5 px-4 py-2 border-b border-[#e2e8e5] dark:border-gray-700 flex-wrap">
                {counts.servicesToday > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#025940]/10 text-[#025940] dark:bg-[#72A68E]/20 dark:text-[#72A68E] rounded-full px-2 py-0.5">
                    <Calendar className="w-2.5 h-2.5" />
                    {counts.servicesToday} service{counts.servicesToday !== 1 ? 's' : ''}
                  </span>
                )}
                {counts.deliveriesToday > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-full px-2 py-0.5">
                    <Truck className="w-2.5 h-2.5" />
                    {counts.deliveriesToday} deliver{counts.deliveriesToday !== 1 ? 'ies' : 'y'}
                  </span>
                )}
                {counts.defleetsToday > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 rounded-full px-2 py-0.5">
                    <TrendingDown className="w-2.5 h-2.5" />
                    {counts.defleetsToday} defleet{counts.defleetsToday !== 1 ? 's' : ''}
                  </span>
                )}
                {counts.notesToday > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 rounded-full px-2 py-0.5">
                    <StickyNote className="w-2.5 h-2.5" />
                    {counts.notesToday} note{counts.notesToday !== 1 ? 's' : ''}
                  </span>
                )}
                {counts.high > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {counts.high} urgent
                  </span>
                )}
              </div>
            )}

            {/* ── Notification list ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#025940]/10 dark:bg-[#72A68E]/10 flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-6 h-6 text-[#72A68E]" />
                  </div>
                  <p className="text-sm font-medium text-[#012619] dark:text-white">All clear</p>
                  <p className="text-xs text-[#8a9e94] dark:text-gray-500 mt-1">
                    No service bookings or MOT alerts right now.
                  </p>
                </div>
              ) : (
                <div>
                  {notifications.map(notification => {
                    const isRead = isNotificationRead(notification.id)
                    const isDismissing = dismissing.has(notification.id)
                    const ps = priorityStyles[notification.priority] || priorityStyles.low

                    return (
                      <div
                        key={notification.id}
                        className={`
                          relative group transition-all duration-250 ease-out
                          ${isDismissing ? 'opacity-0 translate-x-full max-h-0 py-0' : 'opacity-100 translate-x-0 max-h-40'}
                          ${!isRead ? 'bg-[#025940]/[0.03] dark:bg-[#72A68E]/[0.05]' : ''}
                          hover:bg-[#f6f8f7] dark:hover:bg-gray-700/40
                          border-b border-[#e2e8e5]/60 dark:border-gray-700/40 last:border-b-0
                        `}
                        onClick={() => markAsRead(notification.id)}
                        onTouchStart={e => onTouchStart(e, notification.id)}
                        onTouchEnd={onTouchEnd}
                      >
                        {/* Priority bar */}
                        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${ps.bar} rounded-r-full`} />

                        <div className="pl-4 pr-3 py-2.5 flex items-start gap-2.5">
                          {/* Icon */}
                          <div className={`flex-shrink-0 mt-0.5 ${ps.icon}`}>
                            {getIcon(notification.type)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4
                                className={`text-[13px] font-medium leading-snug ${
                                  isRead
                                    ? 'text-[#8a9e94] dark:text-gray-500'
                                    : 'text-[#012619] dark:text-white'
                                }`}
                              >
                                {notification.title}
                                {!isRead && (
                                  <span className="inline-block w-1.5 h-1.5 bg-[#025940] dark:bg-[#72A68E] rounded-full ml-1.5 align-middle" />
                                )}
                              </h4>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[10px] text-[#8a9e94] dark:text-gray-500 whitespace-nowrap">
                                  {formatDate(notification.date)}
                                </span>
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleDismiss(notification.id)
                                  }}
                                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-[#8a9e94] hover:text-red-500 dark:hover:text-red-400"
                                  title="Dismiss"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <p
                              className={`text-xs leading-relaxed mt-0.5 ${
                                isRead
                                  ? 'text-[#8a9e94]/80 dark:text-gray-600'
                                  : 'text-[#4a5e54] dark:text-gray-400'
                              }`}
                            >
                              {notification.message}
                            </p>

                            {/* Service extra info */}
                            {notification.type === 'service_today' && notification.data?.isExternalProvider && (
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400">
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">
                                  {notification.data.externalProvider?.garageName}
                                </span>
                              </div>
                            )}
                            {notification.type === 'service_today' && (notification as any).timeSlot && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-[#025940] dark:text-[#72A68E]">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span>{(notification as any).timeSlot}</span>
                              </div>
                            )}

                            {/* MOT extra info */}
                            {(notification.type === 'mot_expired' || notification.type === 'mot_due_soon') && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-[#8a9e94] dark:text-gray-500">
                                <Car className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">
                                  {notification.data?.make} {notification.data?.model}
                                </span>
                              </div>
                            )}

                            {/* Delivery extra info */}
                            {notification.type === 'delivery_today' && notification.data?.supplier && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                                <Truck className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{notification.data.supplier}</span>
                              </div>
                            )}

                            {/* Defleet extra info */}
                            {notification.type === 'defleet_today' && notification.data?.defleetDestination && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400">
                                <TrendingDown className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{notification.data.defleetDestination}</span>
                              </div>
                            )}

                            {/* Note extra info */}
                            {notification.type === 'note_today' && (notification as any).timeSlot && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span>{(notification as any).timeSlot}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Mobile swipe hint — only first unread */}
                        {!isRead && notification.id === notifications.find(n => !isNotificationRead(n.id))?.id && (
                          <div className="md:hidden absolute bottom-1 right-2 text-[9px] text-[#8a9e94]/50 italic select-none pointer-events-none">
                            swipe →
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default NotificationBell