// src/components/fleet/form-fields/TechnicalContractFields.tsx
'use client'

import React, { lazy, Suspense } from 'react'
import { Input } from '@/components/ui/Input'
import { Shield, Ruler, FileText, Calendar } from 'lucide-react'
import { Contract } from '@/types'

// Lazy load SmartSizeInput - only loads when needed
const SmartSizeInput = lazy(() => import('./SmartSizeInput').then(mod => ({ default: mod.SmartSizeInput })))

interface TechnicalContractFieldsProps {
  size: string
  contract: string
  contractColor: string
  motExpiry: string
  taxExpiry: string
  condition: string
  conditions: string[]
  contracts: Contract[]
  contractsLoading: boolean
  existingVehicles: any[]
  onFieldChange: (field: string, value: string) => void
  getContractBadgeStyle: (color: string) => { backgroundColor: string; color: string }
}

export function TechnicalContractFields({
  size,
  contract,
  contractColor,
  motExpiry,
  taxExpiry,
  condition,
  conditions,
  contracts,
  contractsLoading,
  existingVehicles,
  onFieldChange,
  getContractBadgeStyle
}: TechnicalContractFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <Shield className="w-5 h-5 text-[#025940]" />
        <h3 className="text-lg font-semibold text-[#012619]">Technical & Contract Details</h3>
      </div>

      {/* Size - Bright with Lazy Loading */}
      <div className="bg-gradient-to-br from-white to-[#72A68E]/10 p-4 rounded-xl border border-[#72A68E] shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Ruler className="w-4 h-4 text-[#025940]" />
          <label className="block text-sm font-semibold text-[#012619]">
            Size
          </label>
        </div>
        <Suspense fallback={
          <Input
            value={size}
            onChange={(e) => onFieldChange('size', e.target.value)}
            placeholder="e.g., Large Van"
            className="bg-white border-[#72A68E] rounded-xl"
          />
        }>
          <SmartSizeInput
            value={size}
            onChange={(value) => onFieldChange('size', value)}
            existingVehicles={existingVehicles}
          />
        </Suspense>
      </div>

      {/* Contract - Bright with slight accent */}
      <div className="bg-gradient-to-br from-[#72A68E]/15 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <FileText className="w-4 h-4 text-[#025940]" />
          <label className="block text-sm font-semibold text-[#012619]">
            Contract
          </label>
        </div>
        
        {contractsLoading ? (
          <div className="flex items-center px-4 py-3 text-sm border border-[#72A68E] rounded-xl bg-white">
            <div className="animate-spin rounded-full h-4 w-4 border-b border-[#025940] mr-2"></div>
            <span className="text-[#025940]">Loading contracts...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={contract}
              onChange={(e) => onFieldChange('contract', e.target.value)}
              className="w-full px-4 py-3 text-sm border border-[#72A68E] rounded-xl bg-white text-[#012619] focus:ring-2 focus:ring-[#025940] focus:border-[#025940] shadow-sm"
            >
              <option value="">No contract selected</option>
              {contracts.map((contractItem) => (
                <option key={contractItem.id} value={contractItem.name}>
                  {contractItem.name}
                  {contractItem.isDefault && ' (Default)'}
                </option>
              ))}
            </select>
            
            {/* Contract Color Preview */}
            {contract && contractColor && (
              <div className="flex items-center gap-3 bg-white/80 rounded-xl p-3">
                <div 
                  className="w-4 h-4 rounded-full border border-[#72A68E]"
                  style={{ backgroundColor: contractColor }}
                />
                <span 
                  className="text-xs font-medium px-2 py-1 rounded-full"
                  style={getContractBadgeStyle(contractColor)}
                >
                  {contract}
                </span>
                <span className="text-xs text-[#025940]">
                  Contract preview
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MOT & Tax Expiry Row - Bright */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MOT Expiry */}
        <div className="bg-gradient-to-br from-[#C5D9D0]/30 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Calendar className="w-4 h-4 text-[#025940]" />
            <label className="block text-sm font-semibold text-[#012619]">
              MOT Expiry
            </label>
          </div>
          <Input
            type="date"
            value={motExpiry}
            onChange={(e) => onFieldChange('motExpiry', e.target.value)}
            className="bg-white text-[#012619] border-[#72A68E] rounded-xl"
          />
        </div>

        {/* Tax Expiry */}
        <div className="bg-gradient-to-br from-[#C5D9D0]/20 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Calendar className="w-4 h-4 text-[#025940]" />
            <label className="block text-sm font-semibold text-[#012619]">
              Tax Expiry
            </label>
          </div>
          <Input
            type="date"
            value={taxExpiry}
            onChange={(e) => onFieldChange('taxExpiry', e.target.value)}
            className="bg-white text-[#012619] border-[#72A68E] rounded-xl"
          />
        </div>
      </div>

      {/* Condition - Bright */}
      <div className="bg-gradient-to-br from-white to-[#C5D9D0]/15 p-4 rounded-xl border border-[#72A68E] shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Shield className="w-4 h-4 text-[#025940]" />
          <label className="block text-sm font-semibold text-[#012619]">
            Condition
          </label>
        </div>
        <select
          value={condition}
          onChange={(e) => onFieldChange('condition', e.target.value)}
          className="w-full px-4 py-3 text-sm border border-[#72A68E] rounded-xl bg-white text-[#012619] focus:ring-2 focus:ring-[#025940] focus:border-[#025940]"
          required
        >
          {conditions.map(conditionItem => (
            <option key={conditionItem} value={conditionItem}>
              {conditionItem}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}