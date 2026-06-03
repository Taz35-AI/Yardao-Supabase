// src/hooks/fleet/useVehicleForm.ts
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { contractService } from '@/lib/contractService'
import { vehicleLookupService } from '@/lib/services/vehicleLookupService'
import { userProfileService } from '@/lib/firestore'
import { Contract, InsuranceStatus } from '@/types'
import { logger } from '@/lib/logger'
import { VehicleDiagramType } from '@/components/common/DamageMapper/DamageMapper'

interface VehicleFormData {
  dateAcquired: string
  registration: string
  make: string
  model: string
  colour: string
  size: string
  motExpiry: string
  taxExpiry: string
  comments: string
  condition: string
  contract: string
  contractColor: string
  contractId: string
  insuranceStatus: InsuranceStatus | null
  vehicleDiagramType: VehicleDiagramType | ''
}

interface UseVehicleFormProps {
  conditions: string[]
  existingVehicles: any[]
  onAdd: (vehicle: any) => Promise<void>
  prefillData?: {       // ← ADD
    registration: string
    make: string
    model: string
  }
}

export function useVehicleForm({ conditions, existingVehicles, onAdd, prefillData }: UseVehicleFormProps) {
  const { user } = useAuth()
  
  // Get today's date in YYYY-MM-DD format for default
  const getTodayDate = () => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }
  
  // Form state
  const [formData, setFormData] = useState<VehicleFormData>({
    dateAcquired: getTodayDate(),
    registration: '',
    make: '',
    model: '',
    colour: '',
    size: '',
    motExpiry: '',
    taxExpiry: '',
    comments: '',
    condition: conditions[0] || '',
    contract: '',
    contractColor: '',
    contractId: '',
    insuranceStatus: null,
    vehicleDiagramType: '',
  })
  
  useEffect(() => {
    if (!prefillData?.registration) return
    setFormData(prev => ({
      ...prev,
      registration: prefillData.registration,
      make:         prefillData.make,
      model:        prefillData.model,
    }))
  }, [prefillData])

  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [duplicateError, setDuplicateError] = useState<boolean>(false)

  // DVLA lookup-by-registration state
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupDone, setLookupDone] = useState(false)
  const [lookupRecall, setLookupRecall] = useState(false)

  // Look up the entered registration via the DVLA Cloud Function and prefill
  // the fields DVLA returns. (DVLA does NOT provide model — user fills that.)
  const lookupVehicle = async () => {
    const reg = formData.registration.trim()
    if (!reg) {
      setLookupError('Enter a registration first')
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    setLookupDone(false)
    setLookupRecall(false)
    try {
      const data = await vehicleLookupService.lookup(reg)
      setFormData(prev => ({
        ...prev,
        registration: data.registration || prev.registration,
        make: data.make || prev.make,
        model: data.model || prev.model,
        colour: data.colour || prev.colour,
        // DVLA returns ISO dates (YYYY-MM-DD) — ready for the date inputs.
        motExpiry: data.motExpiry || prev.motExpiry,
        taxExpiry: data.taxExpiry || prev.taxExpiry,
      }))
      setLookupRecall(data.hasOutstandingRecall === 'Yes')
      setLookupDone(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vehicle lookup failed'
      setLookupError(message.replace(/[⚠️❌]/g, '').trim())
    } finally {
      setLookupLoading(false)
    }
  }

  // Contracts state
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(true)

  // Load contracts on component mount
  useEffect(() => {
    const loadContracts = async () => {
      if (!user) return

      try {
        setContractsLoading(true)
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          const contractsList = await contractService.getContracts(profile.organizationId)
          setContracts(contractsList)
          logger.log('📋 Loaded contracts for vehicle form:', contractsList)
        }
      } catch (error) {
        logger.error('Error loading contracts:', error)
      } finally {
        setContractsLoading(false)
      }
    }

    loadContracts()
  }, [user])

  // Check for duplicate registration as user types
  useEffect(() => {
    if (!formData.registration) {
      setDuplicateError(false)
      return
    }

    const cleanReg = formData.registration.trim().toUpperCase().replace(/\s+/g, '')
    const duplicate = existingVehicles.find(v => {
      const existingReg = (v.registration || '').toUpperCase().replace(/\s+/g, '')
      return existingReg === cleanReg
    })

    setDuplicateError(!!duplicate)
  }, [formData.registration, existingVehicles])

  // Handle form field changes
  const handleChange = (field: string, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value }
      
      // When contract changes, update contract color
      if (field === 'contract') {
        const selectedContract = contracts.find(c => c.name === value)
        newData.contractColor = selectedContract?.color || ''
        newData.contractId = selectedContract?.id || ''
      }
      
      return newData
    })
    
    // Clear submit error when user starts typing again
    if (submitError) {
      setSubmitError(null)
    }

    // Editing the registration invalidates any previous lookup feedback
    if (field === 'registration') {
      setLookupError(null)
      setLookupDone(false)
      setLookupRecall(false)
    }
  }

  // Insurance toggle — mirrors FleetVehicleEditModal (status only)
  const handleInsuranceToggle = (status: InsuranceStatus) => {
    setFormData(prev => ({ ...prev, insuranceStatus: status }))
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // PREVENT submission if duplicate detected
    if (duplicateError) {
      setSubmitError('Cannot add vehicle: This registration already exists in the fleet')
      return
    }
    
    setLoading(true)
    setSubmitError(null)

    try {
      // Include contract, dateAcquired, and diagram type in the vehicle data
      const vehicleData = {
        ...formData,
        contract: formData.contract || null,
        contractColor: formData.contractColor || null,
        contractId: formData.contractId || null,
        insuranceStatus: formData.insuranceStatus,
        dateAcquired: formData.dateAcquired || getTodayDate(),
        vehicleDiagramType: formData.vehicleDiagramType || null,
      }
      
      await onAdd(vehicleData)
      
      // Clear form on success
      setFormData({
        dateAcquired: getTodayDate(),
        registration: '',
        make: '',
        model: '',
        colour: '',
        size: '',
        motExpiry: '',
        taxExpiry: '',
        comments: '',
        condition: conditions[0] || '',
        contract: '',
        contractColor: '',
        contractId: '',
        insuranceStatus: null,
        vehicleDiagramType: '',
      })
      setDuplicateError(false)
      
    } catch (error) {
      logger.error('Failed to add vehicle:', error)
      
      // Handle error
      const errorMessage = error instanceof Error ? error.message : 'Failed to add vehicle'
      setSubmitError(errorMessage.replace(/[⚠️❌]/g, '').trim())
      
      // Don't clear the form on error so user can modify and retry
    } finally {
      setLoading(false)
    }
  }

  // Format date for display (dd/mm/yyyy)
  const formatDateForDisplay = (isoDate: string): string => {
    if (!isoDate) return ''
    const date = new Date(isoDate)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  // Get contract badge style for preview
  const getContractBadgeStyle = (contractColor: string) => {
    if (!contractColor) return { backgroundColor: '#C5D9D0', color: '#025940' }
    
    const hex = contractColor.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    const textColor = brightness > 128 ? '#000000' : '#ffffff'
    
    return {
      backgroundColor: contractColor,
      color: textColor
    }
  }

  return {
    formData,
    loading,
    submitError,
    duplicateError,
    lookupLoading,
    lookupError,
    lookupDone,
    lookupRecall,
    lookupVehicle,
    contracts,
    contractsLoading,
    handleChange,
    handleInsuranceToggle,
    handleSubmit,
    formatDateForDisplay,
    getContractBadgeStyle,
    getTodayDate
  }
}