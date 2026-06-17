import { create } from 'zustand'
import type { FeeRecord, Payment } from '@shared/types'
import { handleStoreError } from '@/lib/store-utils'

export interface Student {
  id: string
  first_name: string
  last_name: string
  gender?: 'M' | 'F'
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
  is_personnel_child?: boolean
  parent_personnel_id?: string | null

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
  currentFees: FeeRecord | null
  currentFeesHistory: FeeRecord[] | null
  currentPayments: Payment[] | null
  loading: boolean
  error: string | null

  fetchStudents: (filters?: {
    search?: string
    class?: string
    schoolYear?: string
  }) => Promise<void>
  getStudent: (id: string) => Promise<void>
  createStudent: (data: Partial<Student>) => Promise<boolean>
  updateStudent: (id: string, data: Partial<Student>) => Promise<boolean>
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
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch students')
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
    } catch (error: unknown) {
      handleStoreError(error, set, 'Get student')
    }
  },

  createStudent: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.student.create(data)
      if (result.success) {
        const initialAmount = (data as Record<string, unknown>).initial_payment_amount as
          | number
          | undefined
        if (initialAmount && initialAmount > 0) {
          try {
            await window.api.payment.create({
              student_id: result.id || (result as { student?: { id: string } }).student?.id || '',
              amount: initialAmount,
              payment_type:
                ((data as Record<string, unknown>).initial_payment_type as
                  | 'tuition'
                  | 'bus'
                  | 'canteen'
                  | 'enrollment'
                  | 'uniform'
                  | 'event'
                  | 'other') || 'enrollment',
              payment_method: 'cash',
              payment_date: new Date().toISOString().split('T')[0],
              description: "Paiement initial à l'inscription (Droits, etc.)"
            })
          } catch (paymentErr) {
            console.error('Failed to record initial payment:', paymentErr)
          }
        }
        await get().fetchStudents()
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create student')
      return false
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
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Update student')
      return false
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
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete student')
    }
  }
}))
