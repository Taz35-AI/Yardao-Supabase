// src/components/yard/layout/YardLayoutModal.tsx
// Full-screen modal wrapper around the YardLayoutEditor.
// Used from BranchManagement settings page so admins can edit a branch's
// yard layout without navigating away.

'use client'

import React from 'react'
import { YardLayoutEditor } from './YardLayoutEditor'

interface YardLayoutModalProps {
  branchId: string
  branchName?: string
  open: boolean
  onClose: () => void
}

export function YardLayoutModal({
  branchId,
  branchName,
  open,
  onClose,
}: YardLayoutModalProps) {
  // Lock body scroll while the modal is open — without this the page
  // scrolls behind the modal on long pages.
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Yard layout editor"
    >
      <YardLayoutEditor
        branchId={branchId}
        branchName={branchName}
        onClose={onClose}
      />
    </div>
  )
}