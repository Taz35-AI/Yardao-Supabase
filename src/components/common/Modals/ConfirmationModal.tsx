// src/components/common/Modals/ConfirmationModal.tsx
'use client'

import React from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger' | 'warning'
  loading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false
}: ConfirmationModalProps) {
  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose()
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  const variantStyles = {
    default: {
      icon: 'text-blue-400',
      iconBg: 'bg-blue-900/30',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700',
      border: 'border-blue-800'
    },
    danger: {
      icon: 'text-red-400',
      iconBg: 'bg-red-900/30',
      confirmBtn: 'bg-red-600 hover:bg-red-700',
      border: 'border-red-800'
    },
    warning: {
      icon: 'text-amber-400',
      iconBg: 'bg-amber-900/30',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700',
      border: 'border-amber-800'
    }
  }

  const styles = variantStyles[variant]

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-[10000] w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className={`bg-gray-900 border ${styles.border} rounded-xl shadow-2xl`}>
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${styles.iconBg} rounded-lg`}>
                <AlertTriangle className={`w-5 h-5 ${styles.icon}`} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-100">
                  {title}
                </h2>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={loading}
              className="text-gray-400 hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="flex gap-3 p-6 pt-0">
            <button
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2.5 ${styles.confirmBtn} disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}