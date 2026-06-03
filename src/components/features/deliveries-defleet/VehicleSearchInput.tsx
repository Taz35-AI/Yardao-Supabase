// src/components/features/deliveries-defleet/VehicleSearchInput.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Search } from 'lucide-react'
import { DeliveryOperationType } from './DeliveriesDefleetContent'

interface VehicleSearchInputProps {
  value: string
  onChange: (value: string) => void
  onVehicleSelect: (vehicle: any) => void
  vehicles: any[]
  operationType: DeliveryOperationType
  placeholder?: string
}

export function VehicleSearchInput({ 
  value, 
  onChange, 
  onVehicleSelect, 
  vehicles, 
  operationType, 
  placeholder 
}: VehicleSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const searchVehicles = (query: string): any[] => {
    if (!query || query.length < 1 || !vehicles) return []
    
    const lowerQuery = query.toLowerCase()
    return vehicles
      .filter(vehicle => {
        if (!vehicle) return false
        
        const registration = vehicle.registration?.toString()?.toLowerCase() || ''
        const make = vehicle.make?.toString()?.toLowerCase() || ''
        const model = vehicle.model?.toString()?.toLowerCase() || ''
        
        return registration.includes(lowerQuery) ||
               make.includes(lowerQuery) ||
               model.includes(lowerQuery)
      })
      .slice(0, 8)
  }

  useEffect(() => {
    if (operationType === 'defleet' && value.length >= 1) {
      const results = searchVehicles(value)
      setSearchResults(results)
      setIsOpen(results.length > 0)
    } else {
      setSearchResults([])
      setIsOpen(false)
    }
  }, [value, vehicles, operationType])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase()
    onChange(newValue)
  }

  const handleVehicleSelect = (vehicle: any) => {
    onVehicleSelect(vehicle)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-sm border border-blue-300 dark:border-blue-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm pr-10"
      />
      
      {operationType === 'defleet' && (
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-blue-400" />
      )}

      {isOpen && searchResults.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded-xl shadow-lg max-h-48 overflow-y-auto"
        >
          {searchResults.map((vehicle, index) => (
            <button
              key={index}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                handleVehicleSelect(vehicle)
              }}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-blue-100 dark:border-blue-700 last:border-b-0 first:rounded-t-xl last:rounded-b-xl flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-sm">{vehicle.registration}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {vehicle.make} {vehicle.model}
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">Fleet</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}