import { create } from 'zustand'

export interface Student {
  id: string
  first_name: string
  last_name: string
  photo_path?: string
  date_of_birth?: string
  place_of_birth?: string
  class: string
  registration_number: string
  enrollment_date: string
  departure_date?: string
  previous_school?: string

  father_name?: string
  father_contact?: string
  father_profession?: string

  mother_name?: string
  mother_contact?: string
  mother_profession?: string

  guardian_name?: string
  guardian_contact?: string
  guardian_profession?: string
  address?: string

  siblings: string[] // IDs

  // Services & Fees (Optional for display/update)
  bus_subscribed?: boolean
  bus_route?: string
  canteen_subscribed?: boolean
  canteen_days_per_week?: number
  canteen_days?: string[]

  uniform_tshirt_purchased?: boolean
  uniform_apron_purchased?: boolean
  uniform_shorts_purchased?: boolean
  uniform_badge_purchased?: boolean

  fram_paid_by_parent?: boolean
}

interface StudentStore {
  students: Student[]
  currentStudent: Student | null
  currentFees: any | null
  currentFeesHistory: any[] | null
  currentPayments: any[] | null
  loading: boolean
  error: string | null

  fetchStudents: (filters?: any) => Promise<void>
  getStudent: (id: string) => Promise<void>
  createStudent: (data: Partial<Student>) => Promise<void>
  updateStudent: (id: string, data: Partial<Student>) => Promise<void>
  deleteStudent: (id: string) => Promise<void>
}

export const useStudentStore = create<StudentStore>((set, get) => ({
  students: [],
  currentStudent: null,
  currentFees: null,
  currentFeesHistory: null,
  currentPayments: null,
  loading: false,
  error: null,

  fetchStudents: async (filters = {}) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.student.list(filters)
      set({ students: result.students, loading: false })
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch error:', error)
      set({ error: error.message, loading: false })
    }
  },

  getStudent: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.student.get(id)
      if (result.success) {
        set({
          currentStudent: result.student,
          currentFees: result.fees,
          currentFeesHistory: result.feesHistory,
          currentPayments: result.payments,
          loading: false
        })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Get student error:', error)
      set({ error: error.message, loading: false })
    }
  },

  createStudent: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.student.create(data)
      if (result.success) {
        await get().fetchStudents()
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create student error:', error)
      set({ error: error.message, loading: false })
    }
  },

  updateStudent: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.student.update(id, data)
      if (result.success) {
        await get().fetchStudents()
        const current = get().currentStudent
        if (current && current.id === id) {
          await get().getStudent(id)
        }
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Update student error:', error)
      set({ error: error.message, loading: false })
    }
  },

  deleteStudent: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.student.delete(id)
      if (result.success) {
        await get().fetchStudents()
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Delete student error:', error)
      set({ error: error.message, loading: false })
    }
  }
}))
