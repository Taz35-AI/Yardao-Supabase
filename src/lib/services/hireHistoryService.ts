// src/lib/services/hireHistoryService.ts
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  Timestamp 
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { 
  HireHistoryRecord, 
  HireHistoryQueryResult, 
  PeriodSelection 
} from '@/types/hireHistory'
import { logger } from '@/lib/logger'

export class HireHistoryService {
  private static readonly COLLECTION = 'hireHistory'

  /**
   * Get hire history for a specific vehicle within a date range
   */
  static async getVehicleHireHistory(
    registration: string,
    organizationId: string,
    periodSelection: PeriodSelection
  ): Promise<HireHistoryQueryResult> {
    try {
      logger.log(`📊 Fetching hire history for ${registration}`, {
        period: periodSelection.label,
        startDate: periodSelection.startDate,
        endDate: periodSelection.endDate
      })

      const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
      
      // Query all hire records for this vehicle
      // We'll filter dates client-side to handle overlapping periods correctly
      const q = query(
        collection(db, this.COLLECTION),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg),
        orderBy('hireStartDate', 'desc')
      )

      const snapshot = await getDocs(q)
      logger.log(`Found ${snapshot.size} total hire records for ${registration}`)

      // Convert to HireHistoryRecord objects
      const allRecords: HireHistoryRecord[] = snapshot.docs.map(doc => {
        const data = doc.data()
        const convertedRecord = {
          id: doc.id,
          ...data,
          hireStartDate: this.convertToDate(data.hireStartDate),
          hireEndDate: data.hireEndDate ? this.convertToDate(data.hireEndDate) : null,
          createdAt: this.convertToDate(data.createdAt),
          updatedAt: data.updatedAt ? this.convertToDate(data.updatedAt) : undefined
        } as HireHistoryRecord
        
        logger.log(`Record ${doc.id} dates:`, {
          hireStartDate: convertedRecord.hireStartDate,
          hireEndDate: convertedRecord.hireEndDate,
          raw: {
            start: data.hireStartDate,
            end: data.hireEndDate
          }
        })
        
        return convertedRecord
      })

      // Filter records that overlap with our period
      const relevantRecords = allRecords.filter(record => 
        this.recordOverlapsPeriod(record, periodSelection.startDate, periodSelection.endDate)
      )

      logger.log(`${relevantRecords.length} records overlap with selected period`)

      // Calculate total days on hire within the period
      let totalDaysOnHire = 0
      
      for (const record of relevantRecords) {
        const daysInPeriod = this.calculateDaysInPeriod(
          record,
          periodSelection.startDate,
          periodSelection.endDate
        )
        totalDaysOnHire += daysInPeriod
      }

      // Calculate utilization rate for this vehicle
      const totalDaysInPeriod = this.daysBetween(periodSelection.startDate, periodSelection.endDate)
      const utilizationRate = totalDaysInPeriod > 0 
        ? (totalDaysOnHire / totalDaysInPeriod) * 100 
        : 0

      return {
        registration: cleanReg,
        totalDaysOnHire,
        numberOfHires: relevantRecords.length,
        hireRecords: relevantRecords,
        periodStart: periodSelection.startDate,
        periodEnd: periodSelection.endDate,
        utilizationRate: Math.round(utilizationRate * 10) / 10  // Round to 1 decimal
      }
    } catch (error) {
      logger.error('Error fetching hire history:', error)
      throw new Error(`Failed to fetch hire history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Check if a hire record overlaps with the selected period
   */
  private static recordOverlapsPeriod(
    record: HireHistoryRecord, 
    periodStart: Date, 
    periodEnd: Date
  ): boolean {
    const hireStart = this.convertToDate(record.hireStartDate)
    const hireEnd = record.hireEndDate ? this.convertToDate(record.hireEndDate) : new Date() // Use today if still out
    
    // Hire overlaps if:
    // - It started before/during period AND ended during/after period
    return hireStart <= periodEnd && hireEnd >= periodStart
  }

  /**
   * Calculate how many days of a hire fall within the selected period
   */
  private static calculateDaysInPeriod(
    record: HireHistoryRecord,
    periodStart: Date,
    periodEnd: Date
  ): number {
    const hireStart = this.convertToDate(record.hireStartDate)
    const hireEnd = record.hireEndDate ? this.convertToDate(record.hireEndDate) : new Date() // Use today if still out

    // Find the actual start and end dates within the period
    const actualStart = hireStart > periodStart ? hireStart : periodStart
    const actualEnd = hireEnd < periodEnd ? hireEnd : periodEnd

    // Calculate days between (inclusive)
    const days = this.daysBetween(actualStart, actualEnd)
    
    logger.log(`Hire ${record.id}: ${days} days in period`, {
      hireStart: hireStart.toISOString().split('T')[0],
      hireEnd: record.hireEndDate ? hireEnd.toISOString().split('T')[0] : 'Still Out',
      actualStart: actualStart.toISOString().split('T')[0],
      actualEnd: actualEnd.toISOString().split('T')[0]
    })

    return days
  }

  /**
   * Calculate days between two dates (inclusive)
   */
  private static daysBetween(start: Date, end: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    const startTime = new Date(start).setHours(0, 0, 0, 0)
    const endTime = new Date(end).setHours(0, 0, 0, 0)
    const diffMs = endTime - startTime
    return Math.floor(diffMs / msPerDay) + 1 // +1 to make it inclusive
  }

  /**
   * Convert Firestore Timestamp to Date
   */
  private static convertToDate(value: any): Date {
    if (value instanceof Timestamp) {
      return value.toDate()
    }
    if (value instanceof Date) {
      return value
    }
    if (typeof value === 'string') {
      return new Date(value)
    }
    return new Date()
  }

  /**
   * Get period selection from predefined option
   */
  static getPeriodSelection(option: string): PeriodSelection {
    const now = new Date()
    now.setHours(23, 59, 59, 999) // End of today
    
    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0) // Start of day

    switch (option) {
      case '7days':
        startDate.setDate(now.getDate() - 6) // Last 7 days including today
        return {
          option: '7days',
          startDate,
          endDate: now,
          label: 'Last 7 Days'
        }
      
      case '14days':
        startDate.setDate(now.getDate() - 13)
        return {
          option: '14days',
          startDate,
          endDate: now,
          label: 'Last 14 Days'
        }
      
      case '30days':
        startDate.setDate(now.getDate() - 29)
        return {
          option: '30days',
          startDate,
          endDate: now,
          label: 'Last 30 Days'
        }
      
      case '3months':
        startDate.setMonth(now.getMonth() - 3)
        return {
          option: '3months',
          startDate,
          endDate: now,
          label: 'Last 3 Months'
        }
      
      case '6months':
        startDate.setMonth(now.getMonth() - 6)
        return {
          option: '6months',
          startDate,
          endDate: now,
          label: 'Last 6 Months'
        }
      
      case '1year':
        startDate.setFullYear(now.getFullYear() - 1)
        return {
          option: '1year',
          startDate,
          endDate: now,
          label: 'Last 1 Year'
        }
      
      default:
        // Default to last 30 days
        startDate.setDate(now.getDate() - 29)
        return {
          option: '30days',
          startDate,
          endDate: now,
          label: 'Last 30 Days'
        }
    }
  }

  /**
   * Create custom period selection
   */
  static createCustomPeriod(startDate: Date, endDate: Date): PeriodSelection {
    return {
      option: 'custom',
      startDate,
      endDate,
      label: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
    }
  }
}