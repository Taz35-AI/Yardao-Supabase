// src/components/fleet/form-fields/SmartSizeInput.tsx
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/Input'
import { ChevronDown } from 'lucide-react'

interface SmartSizeInputProps {
  value: string
  onChange: (value: string) => void
  existingVehicles?: any[]
}

export function SmartSizeInput({ value, onChange, existingVehicles = [] }: SmartSizeInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Default size options - static, never changes
  const defaultSizes = [
    'Small Car', 'Medium Car', 'Large Car',
    'Small Van', 'Medium Van', 'Large Van',
    '7.5T', '18T', '26T', '32T', '44T'
  ]

  // Get all available sizes when dropdown opens or input changes
  const getAllSizes = () => {
    const existingSizes = existingVehicles
      .map(v => v.size)
      .filter(Boolean)
      .filter((size, index, arr) => arr.indexOf(size) === index)
    
    return [...new Set([...existingSizes, ...defaultSizes])].sort()
  }

  // Update filtered suggestions when input changes
  const updateSuggestions = (inputValue: string) => {
    const allSizes = getAllSizes()
    
    if (inputValue && inputValue.length > 0) {
      const filtered = allSizes.filter(size =>
        size.toLowerCase().includes(inputValue.toLowerCase())
      )
      setFilteredSuggestions(filtered.slice(0, 8))
    } else {
      setFilteredSuggestions(allSizes.slice(0, 8))
    }
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    updateSuggestions(newValue)
    setIsOpen(true)
  }

  // Handle size selection from dropdown
  const handleSizeSelect = (selectedSize: string) => {
    onChange(selectedSize)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  // Handle input focus
  const handleFocus = () => {
    updateSuggestions(value)
    setIsOpen(true)
  }

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const existingSizesList = existingVehicles?.map(v => v.size).filter(Boolean) || []

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="e.g., Large Van"
          className="bg-white border-[#72A68E] rounded-xl pr-10"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#025940]"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && filteredSuggestions.length > 0 && (
        <div
          className="absolute z-10 w-full mt-1 bg-white border border-[#72A68E] rounded-xl shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((size, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSizeSelect(size)}
              className="w-full text-left px-4 py-2 hover:bg-[#C5D9D0]/30 text-[#025940] text-sm border-b border-[#C5D9D0]/50 last:border-b-0 first:rounded-t-xl last:rounded-b-xl flex items-center justify-between"
            >
              <span>{size}</span>
              {existingSizesList.includes(size) && (
                <span className="text-xs text-[#025940] bg-[#C5D9D0]/50 px-2 py-0.5 rounded-full">
                  Used
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}