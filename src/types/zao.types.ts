// src/types/zao.types.ts
// All TypeScript types and interfaces for the Zao AI assistant.
// Import from here everywhere — never define these inline in the hook.

export interface GroqResponse {
  success: boolean
  answer: string
  analysis?: any
  dataStats?: any
  error?: string
  actionTaken?: string
  pendingAction?: PendingAction
}

export type PendingAction =
  | {
      type: 'checkout_garage_selection'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      garages?: GarageOption[]
      [key: string]: any
    }
  | {
      type: 'return_garage_selection'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      garageName: string
      vehicles?: Array<{ id: string; reg: string; make: string; model: string; garageName: string }>
      [key: string]: any
    }
  | {
      type: 'booking_provider_selection'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      date: string
      workRequired: string[]
      garages?: GarageOption[]
      [key: string]: any
    }
  | {
      type: 'checkin_widget'
      prefillReg: string
      fleetVehicles: Array<{ id: string; registration: string; make: string; model: string }>
      checkedInRegs: string[]
      [key: string]: any
    }
  | {
      type: 'booking_work_selection'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      date: string
      isExternal: boolean
      garageId?: string
      garageName?: string
      garageAddress?: string
      suggestedWork: string[]
      garages?: GarageOption[]
      [key: string]: any
    }
  | {
      type: 'booking_external_garage_selection'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      date: string
      workRequired: string[]
      garages?: GarageOption[]
      [key: string]: any
    }
  | {
      type: 'booking_date_needed'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      workRequired: string[]
      garages?: GarageOption[]
      [key: string]: any
    }
  | {
      type: 'checkin_confirm'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      [key: string]: any
    }
  | {
      type: 'hire_confirm'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      [key: string]: any
    }
  | {
      type: 'hire_return_confirm'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      [key: string]: any
    }
  | {
      type: 'branch_transfer_confirm'
      vehicleId: string
      vehicleReg: string
      vehicleMake: string
      vehicleModel: string
      fromBranchId: string
      fromBranchName: string
      toBranchId: string
      toBranchName: string
      [key: string]: any
    }
  | {
      // ── Reg needed — shows inline reg input field ─────────────────────────
      type: 'reg_needed'
      intent: 'checkout' | 'return' | 'hire_out' | 'mot_done'
      prompt: string
      [key: string]: any
    }
  | {
      // ── Note / Reminder creation ──────────────────────────────────────────
      // Zao parses the message with groqNoteParser, shows a preview card,
      // user confirms → saves to userNotes exactly like the Smart Paste modal.
      type: 'note_confirm'
      parsedNotes: Array<{
        summary: string
        date: string
        scheduledTime: string | null
        priority: 'low' | 'medium' | 'urgent'
        category: 'personal' | 'work' | 'vehicle' | 'finance'
        vehicleReg: string | null
        recurrence: 'none' | 'daily' | 'weekly' | 'monthly'
        contactDetails?: { company: string; phones: string[]; emails: string[]; url: string } | null
      }>
      contactDetails?: { company: string; phones: string[]; emails: string[]; url: string } | null
      [key: string]: any
    }

export interface GarageOption {
  id: string
  name: string
  address: string
}

export interface ConfirmBookingParams {
  vehicleId: string
  vehicleReg: string
  vehicleMake: string
  vehicleModel: string
  date: string
  workRequired: string[]
  isExternal: boolean
  garageId?: string
  garageName?: string
  garageAddress?: string
  customGarageName?: string
  customGarageAddress?: string
  timeSlot?: string
  externalCustomTime?: string
}

export interface UseGroqAssistantReturn {
  loading: boolean
  error: string | null
  lastQuery: string
  lastResponse: GroqResponse | null
  askQuestion: (question: string, branchSlug?: string, history?: import('@/lib/zao/groqClient').GroqMessage[]) => Promise<GroqResponse>
  confirmCheckoutToGarage: (vehicleId: string, garageId: string, garageName: string) => Promise<GroqResponse>
  confirmReturnFromGarage: (vehicleId: string, vehicleReg: string, garageName: string) => Promise<GroqResponse>
  confirmServiceBooking: (params: ConfirmBookingParams) => Promise<GroqResponse>
  confirmCheckIn: (vehicleId: string, vehicleReg: string, mileage?: string, condition?: string, status?: string, branchId?: string) => Promise<GroqResponse>
  confirmHireOut: (vehicleId: string, vehicleReg: string) => Promise<GroqResponse>
  confirmHireReturn: (vehicleId: string, vehicleReg: string) => Promise<GroqResponse>
  confirmBranchTransfer: (vehicleId: string, vehicleReg: string, toBranchId: string, toBranchName: string) => Promise<GroqResponse>
  clearError: () => void
  clearHistory: () => void
}