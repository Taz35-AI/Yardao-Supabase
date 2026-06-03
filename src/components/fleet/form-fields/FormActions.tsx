// src/components/fleet/form-fields/FormActions.tsx
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'

interface FormActionsProps {
  loading: boolean
  hasRegistration: boolean
  duplicateError: boolean
  onCancel?: () => void
}

export function FormActions({ 
  loading, 
  hasRegistration, 
  duplicateError, 
  onCancel 
}: FormActionsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-[#72A68E]">
      <Button
        type="button"
        onClick={onCancel}
        variant="outline"
        className="flex-1 border-[#025940] text-[#025940] hover:bg-[#025940]/10 bg-white"
        disabled={loading}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={loading || !hasRegistration || duplicateError}
        className="flex-1 bg-gradient-to-r from-[#025940] to-[#012619] hover:from-[#012619] hover:to-[#0D0D0D] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        <Plus className="w-4 h-4 mr-2" />
        {loading ? 'Adding...' : duplicateError ? 'Cannot Add - Duplicate Registration' : 'Add Vehicle'}
      </Button>
    </div>
  )
}