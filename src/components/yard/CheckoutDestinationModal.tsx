// src/components/yard/CheckoutDestinationModal.tsx
// ✅ FIXED: External Garage now redirects to Service Bookings instead of direct checkout
// Modal for selecting checkout destination (Branch Transfer ONLY - Garage goes to bookings)
// ✅ SURGICALLY ADDED: sourceBranchId/sourceBranchName for proper display on receiving end
// Restyled: Yardao brand colours — purple removed

'use client'

import React, { useState, useMemo } from 'react'
import { X, Truck, Wrench, ArrowRight, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Branch } from '@/types/branch'
import { CheckoutDestination } from '@/types/transfer'

interface CheckoutDestinationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (destination: CheckoutDestination) => void
  vehicleRegistration: string
  currentBranchId: string
  availableBranches: Branch[]
  loading?: boolean
  // When true, offer a "Remove from Yard" option (for non-fleet vehicles:
  // visitors / external garage customers that are simply leaving).
  allowRemove?: boolean
}

export function CheckoutDestinationModal({
  isOpen,
  onClose,
  onConfirm,
  vehicleRegistration,
  currentBranchId,
  availableBranches,
  loading = false,
  allowRemove = false
}: CheckoutDestinationModalProps) {
  const [selectedType, setSelectedType] = useState<'branch_transfer' | 'external_garage' | 'remove' | null>(null)
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')

  // Filter out current branch from available branches
  const transferableBranches = useMemo(() => {
    return availableBranches.filter(b => b.slug !== currentBranchId)
  }, [availableBranches, currentBranchId])

  // ✅ NEW: Get current branch name for sourceBranchName
  const currentBranchName = useMemo(() => {
    const currentBranch = availableBranches.find(b => b.slug === currentBranchId)
    return currentBranch?.name || 'Unknown Branch'
  }, [availableBranches, currentBranchId])

  const handleConfirm = () => {
    if (selectedType === 'branch_transfer' && selectedBranchId) {
      const selectedBranch = transferableBranches.find(b => b.slug === selectedBranchId)
      if (selectedBranch) {
        // ✅ Branch transfer — call onConfirm to process the transfer
        onConfirm({
          type: 'branch_transfer',
          branchId: selectedBranch.slug,
          branchName: selectedBranch.name,
          sourceBranchId: currentBranchId,       // ✅ NEW: Pass source branch ID
          sourceBranchName: currentBranchName    // ✅ NEW: Pass source branch name
        })
      }
    } else if (selectedType === 'external_garage') {
      // ✅ External garage — triggers GarageCheckoutModal in parent
      onConfirm({ type: 'external_garage' })
    } else if (selectedType === 'remove') {
      // Non-fleet vehicle leaving the yard — plain remove (logs to history)
      onConfirm({ type: 'remove' })
    }
  }

  const canConfirm = useMemo(() => {
    if (selectedType === 'branch_transfer') return Boolean(selectedBranchId)
    return selectedType === 'external_garage' || selectedType === 'remove'
  }, [selectedType, selectedBranchId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-3 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col border border-[#e2e8e5] dark:border-gray-700">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-[#012619] px-5 py-4 rounded-t-2xl flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm">Check Out Vehicle</p>
            <p className="text-[#72A68E] text-xs mt-0.5 truncate">
              {vehicleRegistration} · Select destination
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Branch Transfer card */}
          <div
            onClick={() => !loading && setSelectedType('branch_transfer')}
            className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${
              selectedType === 'branch_transfer'
                ? 'border-[#025940] bg-[#f0f4f2] dark:bg-[#025940]/10'
                : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E]'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2.5 rounded-lg flex-shrink-0 ${
                selectedType === 'branch_transfer'
                  ? 'bg-[#025940] text-white'
                  : 'bg-[#f0f4f2] dark:bg-gray-700 text-[#8a9e94]'
              }`}>
                <Truck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-[#012619] dark:text-white mb-1">
                  Transfer to Branch
                </h3>
                <p className="text-xs text-[#8a9e94] dark:text-gray-400">
                  Move vehicle to another branch. It will appear in their incoming transfers.
                </p>

                {selectedType === 'branch_transfer' && (
                  <div className="mt-3">
                    <p className="text-xs text-[#8a9e94] font-medium mb-1.5">Select destination branch</p>
                    <select
                      value={selectedBranchId}
                      onChange={e => setSelectedBranchId(e.target.value)}
                      disabled={loading}
                      className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
                    >
                      <option value="">Choose a branch...</option>
                      {transferableBranches.map(branch => (
                        <option key={branch.id} value={branch.slug}>{branch.name}</option>
                      ))}
                    </select>
                    {transferableBranches.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        No other branches available for transfer
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* External Garage card */}
          <div
            onClick={() => !loading && setSelectedType('external_garage')}
            className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${
              selectedType === 'external_garage'
                ? 'border-[#025940] bg-[#f0f4f2] dark:bg-[#025940]/10'
                : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E]'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2.5 rounded-lg flex-shrink-0 ${
                selectedType === 'external_garage'
                  ? 'bg-[#025940] text-white'
                  : 'bg-[#f0f4f2] dark:bg-gray-700 text-[#8a9e94]'
              }`}>
                <Wrench className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-[#012619] dark:text-white mb-1">
                  Send to External Garage
                </h3>
                <p className="text-xs text-[#8a9e94] dark:text-gray-400">
                  Check out to external garage for service/repairs. Vehicle will show as "At Garage" with today's date.
                </p>

                {selectedType === 'external_garage' && (
                  <div className="mt-3 px-3 py-2 bg-[#f8faf9] dark:bg-gray-800 rounded-lg border border-[#e2e8e5] dark:border-gray-700" style={{ borderLeft: '3px solid #b3f243' }}>
                    <p className="text-xs text-[#4a5e54] dark:text-gray-300">
                      <span className="font-bold text-[#012619] dark:text-white">Next step:</span> Select which garage and add service notes
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Remove from Yard card — non-fleet (visitor / customer) vehicles only */}
          {allowRemove && (
            <div
              onClick={() => !loading && setSelectedType('remove')}
              className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${
                selectedType === 'remove'
                  ? 'border-[#025940] bg-[#f0f4f2] dark:bg-[#025940]/10'
                  : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E]'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-lg flex-shrink-0 ${
                  selectedType === 'remove'
                    ? 'bg-[#025940] text-white'
                    : 'bg-[#f0f4f2] dark:bg-gray-700 text-[#8a9e94]'
                }`}>
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#012619] dark:text-white mb-1">
                    Remove from Yard
                  </h3>
                  <p className="text-xs text-[#8a9e94] dark:text-gray-400">
                    Vehicle is leaving — remove it from the yard. For visitors and external customers, not in your fleet. Logged in checkout history.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Action bar ── */}
        <div className="flex-shrink-0 bg-[#f8faf9] dark:bg-gray-800/80 border-t border-[#e2e8e5] dark:border-gray-700 px-5 py-3 rounded-b-2xl flex gap-3">
          <Button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className="flex-1 bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span>Processing...</span>
            ) : selectedType === 'remove' ? (
              <><LogOut className="w-4 h-4" /><span>Remove from Yard</span></>
            ) : selectedType === 'external_garage' ? (
              <><Wrench className="w-4 h-4" /><span>Next: Select Garage</span></>
            ) : (
              <><ArrowRight className="w-4 h-4" /><span>Confirm Transfer</span></>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}