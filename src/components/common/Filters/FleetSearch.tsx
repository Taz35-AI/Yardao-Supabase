// src/components/common/Filters/FleetSearch.tsx - Fleet Search Component

'use client'

import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Search, X } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface FleetSearchProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  onClearSearch: () => void
}

export function FleetSearch({ searchTerm, onSearchChange, onClearSearch }: FleetSearchProps) {
  const t = useT()
  return (
    <div className="relative mb-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder={t('fleet.search.placeholder')}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <Button
            onClick={onClearSearch}
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}