// src/components/common/Tables/FleetTableHeader.tsx
// UPDATED: Fleet table header with Comments and Date Acquired columns hidden on desktop
'use client'

import { Button } from '@/components/ui/Button'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { SortConfig } from '@/lib/fleetUtils'
import { useT } from '@/lib/i18n'

interface FleetTableHeaderProps {
  sortConfig: SortConfig
  onSort: (key: string) => void
  showCheckbox?: boolean
  isAllSelected?: boolean
  onToggleSelectAll?: () => void
  hasVehicles?: boolean
}

export function FleetTableHeader({ 
  sortConfig, 
  onSort,
  showCheckbox = false,
  isAllSelected = false,
  onToggleSelectAll,
  hasVehicles = true
}: FleetTableHeaderProps) {
  const t = useT()
  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-4 h-4" />
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-4 h-4" /> 
      : <ArrowDown className="w-4 h-4" />
  }

  const SortButton = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(field)}
      className="h-auto p-1 font-medium text-left justify-start text-white hover:bg-white/20 whitespace-nowrap"
    >
      {children}
      {getSortIcon(field)}
    </Button>
  )

  return (
    <thead className="bg-[#025940] border-b-2 border-[#025940]">
      <tr>
        {/* Checkbox Column Header */}
        {showCheckbox && onToggleSelectAll && (
          <th className="hidden md:table-cell px-4 py-3 text-center" style={{ width: '50px' }}>
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={onToggleSelectAll}
                disabled={!hasVehicles}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 
                         text-blue-600 focus:ring-2 focus:ring-blue-500 
                         cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasVehicles ? (isAllSelected ? t('fleet.table.deselectAllTitle') : t('fleet.table.selectAllTitle')) : t('fleet.table.noVehiclesToSelectTitle')}
              />
            </div>
          </th>
        )}

        {/* Better aligned columns with proper widths */}
        <th className="px-4 py-3 text-left" style={{ width: '130px' }}>
          <SortButton field="registration">{t('fleet.table.colRegistration')}</SortButton>
        </th>
        <th className="px-4 py-3 text-left" style={{ width: '110px' }}>
          <SortButton field="make">{t('fleet.table.colMake')}</SortButton>
        </th>
        <th className="px-4 py-3 text-left" style={{ width: '130px' }}>
          <SortButton field="model">{t('fleet.table.colModel')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '100px' }}>
          <SortButton field="colour">{t('fleet.table.colColour')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '90px' }}>
          <SortButton field="size">{t('fleet.table.colSize')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '140px' }}>
          <SortButton field="contract">{t('fleet.table.colContract')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '140px' }}>
          <SortButton field="insuranceStatus">{t('fleet.table.colInsurance')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '110px' }}>
          <SortButton field="motExpiry">{t('fleet.table.colMot')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '110px' }}>
          <SortButton field="taxExpiry">{t('fleet.table.colTax')}</SortButton>
        </th>
        <th className="hidden md:table-cell px-4 py-3 text-left" style={{ width: '120px' }}>
          <SortButton field="condition">{t('fleet.table.colCondition')}</SortButton>
        </th>
        {/* Comments and Date Acquired columns are REMOVED - they appear on hover only */}
      </tr>
    </thead>
  )
}