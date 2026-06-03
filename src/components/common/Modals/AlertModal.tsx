// src/components/common/Modals/AlertModal.tsx
'use client'

import React from 'react'
import { AlertCircle, CheckCircle, X, Info } from 'lucide-react'

interface AlertModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  variant?: 'success' | 'error' | 'info'
  actionText?: string
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  variant = 'info',
  actionText = 'OK'
}: AlertModalProps) {
  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const variantStyles = {
    success: {
      icon: CheckCircle,
      iconColor: 'text-green-400',
      iconBg: 'bg-green-900/30',
      actionBtn: 'bg-green-600 hover:bg-green-700',
      border: 'border-green-800'
    },
    error: {
      icon: AlertCircle,
      iconColor: 'text-red-400',
      iconBg: 'bg-red-900/30',
      actionBtn: 'bg-red-600 hover:bg-red-700',
      border: 'border-red-800'
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-900/30',
      actionBtn: 'bg-blue-600 hover:bg-blue-700',
      border: 'border-blue-800'
    }
  }

  const styles = variantStyles[variant]
  const IconComponent = styles.icon

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-[100] w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className={`bg-gray-900 border ${styles.border} rounded-xl shadow-2xl`}>
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${styles.iconBg} rounded-lg`}>
                <IconComponent className={`w-5 h-5 ${styles.iconColor}`} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-100">
                  {title}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 pb-6">
            <p className="text-gray-300 leading-relaxed">
              {message}
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end p-6 pt-0">
            <button
              onClick={onClose}
              className={`px-6 py-2.5 ${styles.actionBtn} text-white rounded-lg font-medium transition-colors`}
            >
              {actionText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}