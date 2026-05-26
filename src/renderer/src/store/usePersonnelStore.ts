import { create } from 'zustand'
import type { Personnel, SalaryCalculation } from '@shared/types'

interface PersonnelStore {
  personnel: Personnel[]
  currentPerson: Personnel | null
  timeTracking: any[]
  absences: any[]
  advances: any[]
  deductions: any[]
  dailyAttendance: any[]
  salaryCalculation: SalaryCalculation | null
  loading: boolean
  error: string | null

  fetchPersonnel: (filters?: any) => Promise<void>
  getPerson: (id: string) => Promise<void>
  createPerson: (data: Partial<Personnel>) => Promise<boolean>
  updatePerson: (id: string, data: Partial<Personnel>) => Promise<boolean>
  deletePerson: (id: string) => Promise<void>
  calculateSalary: (personnelId: string, month: string) => Promise<void>
  setTimeTracking: (data: any) => Promise<boolean>
  createAbsence: (data: any) => Promise<boolean>
  createAdvance: (data: any) => Promise<boolean>
  createDeduction: (data: any) => Promise<boolean>
  markAdvanceRepaid: (id: string, repaymentDate: string) => Promise<boolean>
  fetchMonthlyAttendance: (personnelId: string, year: number, month: number) => Promise<void>
  setAttendance: (data: any) => Promise<boolean>
  deleteAttendance: (id: string) => Promise<boolean>
  createSalaryExpense: (personnelId: string, month: string, netAmount: number, description?: string) => Promise<boolean>
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch personnel error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Get person error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create person error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Update person error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Delete person error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Calculate salary error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Set time tracking error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create absence error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create advance error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create deduction error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Mark advance repaid error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch attendance error:', error)
      set({ error: error.message, loading: false })
    }
  },

  setAttendance: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.setAttendance(data)
      if (result.success) {
        await get().fetchMonthlyAttendance(data.personnel_id, new Date(data.attendance_date).getFullYear(), new Date(data.attendance_date).getMonth() + 1)
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Set attendance error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Delete attendance error:', error)
      set({ error: error.message, loading: false })
      return false
    }
  },

  createSalaryExpense: async (personnelId, month, netAmount, description) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.personnel.createSalaryExpense(personnelId, month, netAmount, description)
      set({ loading: false })
      return result.success
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create salary expense error:', error)
      set({ error: error.message, loading: false })
      return false
    }
  }
}))
