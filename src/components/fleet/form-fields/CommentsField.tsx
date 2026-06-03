// src/components/fleet/form-fields/CommentsField.tsx
'use client'

import React from 'react'
import { MessageSquare } from 'lucide-react'

interface CommentsFieldProps {
  comments: string
  onCommentsChange: (comments: string) => void
}

export function CommentsField({ comments, onCommentsChange }: CommentsFieldProps) {
  return (
    <div className="bg-gradient-to-br from-[#C5D9D0]/25 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
      <div className="flex items-center space-x-2 mb-3">
        <MessageSquare className="w-4 h-4 text-[#025940]" />
        <label className="block text-sm font-semibold text-[#012619]">
          Additional Comments
        </label>
      </div>
      <textarea
        value={comments}
        onChange={(e) => onCommentsChange(e.target.value)}
        placeholder="Add any additional notes or comments about this vehicle..."
        rows={4}
        className="w-full px-4 py-3 text-sm border border-[#72A68E] rounded-xl bg-white text-[#012619] placeholder-gray-400 focus:ring-2 focus:ring-[#025940] focus:border-[#025940] resize-none"
      />
    </div>
  )
}