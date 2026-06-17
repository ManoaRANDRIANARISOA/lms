import { create } from 'zustand'
import type {
  Personnel,
  SalaryCalculation,
  TimeTracking,
  PersonnelAbsence,
  SalaryAdvance,
  CustomDeduction,
  DailyAttendance
} from '@shared/types'
import { handleStoreError } from '@/lib/store-utils'

interface PersonnelStore {
  personnel: Personnel[]
  currentPerson: Personnel | null
  timeTracking: TimeTracking[]
  absences: PersonnelAbsence[]
  advances: SalaryAdvance[]
  deductions: CustomDeduction[]
  dailyAttendance: DailyAttendance[]
  salaryCalculation: SalaryCalculation | null
  loading: boolean
  error: string | null

  fetchPersonnel: (filters?: Record<string, unknown>) => Promise<void>
  getPerson: (id: string) => Promise<void>
  createPerson: (data: Partial<Personnel>) => Promise<boolean>
  updatePerson: (id: string, data: Partial<Personnel>) => Promise<boolean>
  deletePerson: (id: string) => Promise<void>
  calculateSalary: (personnelId: string, month: string) => Promise<void>
  setTimeTracking: (data: Partial<TimeTracking> & { personnel_id: string }) => Promise<boolean>
  createAbsence: (data: Partial<PersonnelAbsence> & { personnel_id: string }) => Promise<boolean>
  createAdvance: (data: Partial<SalaryAdvance> & { personnel_id: string }) => Promise<boolean>
  createDeduction: (data: Partial<CustomDeduction> & { personnel_id: string }) => Promise<boolean>
  deleteDeduction: (id: string) => Promise<boolean>
  markAdvanceRepaid: (id: string, repaymentDate: string) => Promise<boolean>
  fetchMonthlyAttendance: (personnelId: string, year: number, month: number) => Promise<void>
  setAttendance: (data: {
    personnel_id: string
    attendance_date: string
    status: string
    hours_worked: number
    expected_hours?: number
    notes?: string
  }) => Promise<boolean>
  deleteAttendance: (id: string) => Promise<boolean>
  createSalaryExpense: (
    personnelId: string,
    month: string,
    netAmount: number,
    description?: string
  ) => Promise<boolean>
}

export const usePersonnelStore = create<PersonnelStore>((set, get) => ({
  personnel: [],
  currentPerson: null,
  timeTracking: [],
  absences: [],
  advances: [],
  deductions: [],
  dailyAttendance: [],
  salaryCalculation: null,
  loading: false,
  error: null,

  fetchPersonnel: async (filters = {}) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.list(filters)
      if (result.success) {
        set({ personnel: result.personnel || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch personnel')
    }
  },

  getPerson: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.get(id)
      if (result.success) {
        set({
          currentPerson: result.person,
          timeTracking: result.timeTracking || [],
          absences: result.absences || [],
          advances: result.advances || [],
          deductions: result.deductions || [],
          salaryCalculation: null,
          loading: false
        })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Get person')
    }
  },

  createPerson: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.create(data)
      if (result.success) {
        await get().fetchPersonnel()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create person')
      return false
    }
  },

  updatePerson: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.update(id, data)
      if (result.success) {
        await get().fetchPersonnel()
        if (get().currentPerson?.id === id) {
          await get().getPerson(id)
        }
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Update person')
      return false
    }
  },

  deletePerson: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.delete(id)
      if (result.success) {
        await get().fetchPersonnel()
        if (get().currentPerson?.id === id) {
          set({ currentPerson: null })
        }
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete person')
    }
  },

  calculateSalary: async (personnelId, month) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.calculateSalary(personnelId, month)
      if (result.success) {
        set({ salaryCalculation: result.calculation, loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Calculate salary')
    }
  },

  setTimeTracking: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.setTimeTracking(data)
      if (result.success) {
        await get().getPerson(data.personnel_id)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Set time tracking')
      return false
    }
  },

  createAbsence: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.createAbsence(data)
      if (result.success) {
        await get().getPerson(data.personnel_id)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create absence')
      return false
    }
  },

  createAdvance: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.createAdvance(data)
      if (result.success) {
        await get().getPerson(data.personnel_id)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create advance')
      return false
    }
  },

  createDeduction: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.createDeduction(data)
      if (result.success) {
        await get().getPerson(data.personnel_id)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create deduction')
      return false
    }
  },

  deleteDeduction: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.deleteDeduction(id)
      if (result.success) {
        const currentId = get().currentPerson?.id
        if (currentId) await get().getPerson(currentId)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete deduction')
      return false
    }
  },

  markAdvanceRepaid: async (id, repaymentDate) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.markAdvanceRepaid(id, repaymentDate)
      if (result.success) {
        const currentId = get().currentPerson?.id
        if (currentId) await get().getPerson(currentId)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Mark advance repaid')
      return false
    }
  },

  fetchMonthlyAttendance: async (personnelId, year, month) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.getMonthlyAttendance(personnelId, year, month)
      if (result.success) {
        set({ dailyAttendance: result.records || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch attendance')
    }
  },

  setAttendance: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.setAttendance(
        data as Parameters<typeof window.api.personnel.setAttendance>[0]
      )
      if (result.success) {
        await get().fetchMonthlyAttendance(
          data.personnel_id,
          new Date(data.attendance_date).getFullYear(),
          new Date(data.attendance_date).getMonth() + 1
        )
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Set attendance')
      return false
    }
  },

  deleteAttendance: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.deleteAttendance(id)
      if (result.success) {
        const currentId = get().currentPerson?.id
        if (currentId) {
          const d = new Date()
          await get().fetchMonthlyAttendance(currentId, d.getFullYear(), d.getMonth() + 1)
        }
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete attendance')
      return false
    }
  },

  createSalaryExpense: async (personnelId, month, netAmount, description) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.createSalaryExpense(
        personnelId,
        month,
        netAmount,
        description
      )
      set({ loading: false })
      return result.success
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create salary expense')
      return false
    }
  }
}))
