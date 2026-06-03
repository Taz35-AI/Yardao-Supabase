// src/components/common/Buttons/BulkCheckoutButton.tsx
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { LogOut, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'

interface BulkCheckoutButtonProps {
  vehicles: CheckedInVehicle[]
  onBulkCheckout: (vehicleIds: string[]) => Promise<void>
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

export const BulkCheckoutButton = React.memo(function BulkCheckoutButton({
  vehicles,
  onBulkCheckout,
  className = '',
  variant = 'default',
  size = 'md',
  disabled = false
}: BulkCheckoutButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const handleBulkCheckout = async () => {
    if (!vehicles.length) {
      alert('No vehicles to check out')
      return
    }

    setIsProcessing(true)
    
    try {
      const vehicleIds = vehicles.map(vehicle => vehicle.id)
      logger.log(`Starting bulk checkout of ${vehicleIds.length} vehicles...`)
      
      await onBulkCheckout(vehicleIds)
      
      logger.log(`Successfully checked out ${vehicleIds.length} vehicles`)
      setShowConfirmation(false)
      
    } catch (error) {
      logger.error('Failed to bulk checkout vehicles:', error)
      alert(`Failed to check out vehicles. Please try again.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const getButtonSize = () => {
    switch (size) {
      case 'sm': return 'h-8 px-3 text-xs'
      case 'lg': return 'h-12 px-6 text-base'
      default: return 'h-10 px-4 text-sm'
    }
  }

  const getButtonVariant = () => {
    if (variant === 'outline') {
      return `
        border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300
        dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20
      `
    }
    return `
      bg-blue-600 hover:bg-blue-700 text-white
      dark:bg-blue-600 dark:hover:bg-blue-700
    `
  }

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Confirm Bulk Checkout
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This action cannot be undone
              </p>
            </div>
          </div>
          
          <div className="mb-6">
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Are you sure you want to check out all <strong>{vehicles.length}</strong> vehicles?
            </p>
            
            {vehicles.length <= 5 ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Vehicles to be checked out:</p>
                {vehicles.map(vehicle => (
                  <div key={vehicle.id} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    <span className="font-medium">{vehicle.registration}</span>
                    {vehicle.make && vehicle.model && (
                      <span className="ml-2 text-gray-500">- {vehicle.make} {vehicle.model}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                <p className="font-medium mb-2">Sample vehicles (showing first 3 of {vehicles.length}):</p>
                {vehicles.slice(0, 3).map(vehicle => (
                  <div key={vehicle.id} className="mb-1">
                    <span className="font-medium">{vehicle.registration}</span>
                    {vehicle.make && vehicle.model && (
                      <span className="ml-2 text-gray-500">- {vehicle.make} {vehicle.model}</span>
                    )}
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-2">...and {vehicles.length - 3} more vehicles</p>
              </div>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkCheckout}
              disabled={isProcessing}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking out...</span>
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>Confirm Checkout</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Button
      variant={variant}
      onClick={() => setShowConfirmation(true)}
      disabled={disabled || isProcessing || vehicles.length === 0}
      className={`
        ${getButtonSize()}
        ${getButtonVariant()}
        ${className}
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        flex items-center space-x-2
        min-w-fit
      `}
      title={vehicles.length === 0 ? 'No vehicles to check out' : `Check out all ${vehicles.length} vehicles`}
    >
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="hidden sm:inline">Processing...</span>
          <span className="sm:hidden">...</span>
        </>
      ) : (
        <>
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Bulk Checkout</span>
          <span className="sm:hidden">Checkout</span>
          {vehicles.length > 0 && (
            <span className="hidden md:inline bg-white/20 px-2 py-1 rounded-full text-xs font-medium">
              {vehicles.length}
            </span>
          )}
        </>
      )}
    </Button>
  )
})