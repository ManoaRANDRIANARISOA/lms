/**
 * preload/index.d.ts — TypeScript Declarations for Preload API
 *
 * Provides type information for the `window.api` and `window.electron`
 * objects exposed via the preload bridge.
 */

import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  User, Resource, AccessLevel, LoginResult, AuditLog, UserRow, UserRole,
  Student, Payment, FeeRecord, FinancePrices,
  Personnel, TimeTracking, PersonnelAbsence, SalaryAdvance, CustomDeduction, DailyAttendance, SalaryCalculation,
  Subject, Grade, GradeWithSubject, StudentTermAverage, SubjectClassAverage,
  SchoolConfig
} from '../shared/types'

// --------------------------------------------
// Auth API Type
// --------------------------------------------
interface AuthAPI {
  login: (username: string, password: string) => Promise<LoginResult>
  checkSession: (token: string) => Promise<User | null>
  logout: (token?: string) => Promise<{ ok: boolean }>
  getCurrentUser: () => Promise<User | null>
  getPermissions: () => Promise<{
    success: boolean
    user?: User
    permissions?: Record<Resource, AccessLevel>
    accessibleResources?: Resource[]
    error?: string
  }>
  activity: (token: string) => Promise<{ ok: boolean }>
  listUsers: () => Promise<{ success: boolean; users?: UserRow[]; error?: string }>
  createUser: (userData: {
    username: string
    password: string
    role: UserRole
    full_name?: string
    email?: string
  }) => Promise<{ success: boolean; user?: UserRow; error?: string }>
  updateUser: (id: string, updates: {
    username?: string
    role?: UserRole
    full_name?: string
    email?: string
    active?: boolean
  }) => Promise<{ success: boolean; user?: UserRow; error?: string }>
  deactivateUser: (id: string) => Promise<{ success: boolean; error?: string }>
  changePassword: (userId: string, currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  resetPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  getAuditLogs: (filters?: {
    user_id?: string
    action?: string
    table_name?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }) => Promise<{ success: boolean; logs?: AuditLog[]; total?: number; error?: string }>
}

// --------------------------------------------
// Dialog API Type
// --------------------------------------------
interface DialogAPI {
  openFile: () => Promise<{ filePath: string; preview: string | null } | null>
}

// --------------------------------------------
// Student Filters
// --------------------------------------------
interface StudentFilters {
  search?: string
  class?: string
  limit?: number
  offset?: number
}

// --------------------------------------------
// Payment Filters
// --------------------------------------------
interface PaymentFilters {
  startDate?: string
  endDate?: string
  type?: string
  search?: string
}

// --------------------------------------------
// Personnel Filters
// --------------------------------------------
interface PersonnelFilters {
  search?: string
  position?: string
  status?: string
}

// --------------------------------------------
// Grade Payloads
// --------------------------------------------
interface SubjectInput {
  name: string
  default_coefficient?: number
}

interface GradeInput {
  student_id: string
  subject_id: string
  school_year: string
  term: number
  grade: number
  coefficient?: number
  teacher_comment?: string
  behavior_note?: 'none' | 'warning' | 'praise'
}

// --------------------------------------------
// Full API Type
// --------------------------------------------
interface ElectronAPI {
  student: {
    create: (data: Partial<Student> & Record<string, unknown>) => Promise<{ success: boolean; id?: string; registration_number?: string; error?: string }>
    list: (filters?: StudentFilters) => Promise<{ students: Student[]; total: number }>
    get: (id: string) => Promise<{ success: boolean; student?: Student; fees?: FeeRecord; feesHistory?: FeeRecord[]; payments?: Payment[]; error?: string }>
    update: (id: string, updates: Partial<Student> & Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    reEnroll: (id: string, newClass: string, targetYear: string) => Promise<{ success: boolean; error?: string }>
    getServiceStats: () => Promise<Record<string, unknown>>
    repair: (targetYear: string) => Promise<{ success: boolean; fixedCount?: number; error?: string }>
    resetDatabase: (includeRemote: boolean) => Promise<{ success: boolean; error?: string }>
  }
  payment: {
    create: (data: Omit<Payment, 'id' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; id?: string; error?: string }>
    getByStudent: (studentId: string) => Promise<Payment[]>
    getAll: (filters?: PaymentFilters) => Promise<Payment[]>
    getTuitionStatus: (studentId: string, schoolYear: string) => Promise<{ success: boolean; feeRecord?: FeeRecord; monthlyStatus?: Record<string, unknown>; totalPaid?: number; totalDue?: number; error?: string }>
  }
  attendance: {
    recordBus: (date: string, records: Array<{ student_id: string; status: string }>) => Promise<{ success: boolean; error?: string }>
    recordCanteen: (date: string, records: Array<{ student_id: string; status: string }>) => Promise<{ success: boolean; error?: string }>
    getBusSubscribers: (date: string) => Promise<Student[]>
    getCanteenSubscribers: (date: string) => Promise<Student[]>
    getBusAttendance: (date: string) => Promise<Array<{ student_id: string; status: string; date: string }>>
    getCanteenAttendance: (date: string) => Promise<Array<{ student_id: string; status: string; date: string }>>
  }
  event: {
    create: (data: Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: string }>
    list: () => Promise<{ success: boolean; events?: Record<string, unknown>[]; error?: string }>
    getById: (id: string) => Promise<{ success: boolean; event?: Record<string, unknown>; participation?: Record<string, unknown>[]; error?: string }>
    update: (id: string, updates: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    addParticipants: (eventId: string, studentIds: string[], amountDue?: number) => Promise<{ success: boolean; error?: string }>
    recordPayment: (eventId: string, studentId: string, amount: number, paymentMethod?: string) => Promise<{ success: boolean; error?: string }>
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
    getAll: () => Promise<Record<string, unknown>>
  }
  personnel: {
    create: (data: Partial<Personnel> & Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: string }>
    list: (filters?: PersonnelFilters) => Promise<{ success: boolean; personnel?: Personnel[]; error?: string }>
    get: (id: string) => Promise<{ success: boolean; person?: Personnel; timeTracking?: TimeTracking[]; absences?: PersonnelAbsence[]; advances?: SalaryAdvance[]; deductions?: CustomDeduction[]; error?: string }>
    update: (id: string, updates: Partial<Personnel> & Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    setTimeTracking: (data: Partial<TimeTracking>) => Promise<{ success: boolean; id?: string; error?: string }>
    getTimeTracking: (personnelId: string) => Promise<{ success: boolean; records?: TimeTracking[]; error?: string }>
    createAbsence: (data: Partial<PersonnelAbsence>) => Promise<{ success: boolean; id?: string; error?: string }>
    getAbsences: (personnelId: string) => Promise<{ success: boolean; records?: PersonnelAbsence[]; error?: string }>
    deleteAbsence: (id: string) => Promise<{ success: boolean; error?: string }>
    createAdvance: (data: Partial<SalaryAdvance>) => Promise<{ success: boolean; id?: string; error?: string }>
    getAdvances: (personnelId: string) => Promise<{ success: boolean; records?: SalaryAdvance[]; error?: string }>
    markAdvanceRepaid: (id: string, repaymentDate: string) => Promise<{ success: boolean; error?: string }>
    createDeduction: (data: Partial<CustomDeduction>) => Promise<{ success: boolean; id?: string; error?: string }>
    getDeductions: (personnelId: string, month?: string) => Promise<{ success: boolean; records?: CustomDeduction[]; error?: string }>
    deleteDeduction: (id: string) => Promise<{ success: boolean; error?: string }>
    calculateSalary: (personnelId: string, month: string) => Promise<{ success: boolean; calculation?: SalaryCalculation; error?: string }>
    getMonthlyAttendance: (personnelId: string, year: number, month: number) => Promise<{ success: boolean; records?: DailyAttendance[]; error?: string }>
    setAttendance: (data: Partial<DailyAttendance>) => Promise<{ success: boolean; id?: string; error?: string }>
    deleteAttendance: (id: string) => Promise<{ success: boolean; error?: string }>
    createSalaryExpense: (personnelId: string, month: string, netAmount: number, description?: string) => Promise<{ success: boolean; id?: string; error?: string }>
  }
  grade: {
    createSubject: (data: SubjectInput) => Promise<{ success: boolean; id?: string; error?: string }>
    listSubjects: () => Promise<{ success: boolean; subjects?: Subject[]; error?: string }>
    updateSubject: (id: string, updates: Partial<SubjectInput>) => Promise<{ success: boolean; error?: string }>
    deleteSubject: (id: string) => Promise<{ success: boolean; error?: string }>
    createGrade: (data: GradeInput) => Promise<{ success: boolean; id?: string; error?: string }>
    updateGrade: (id: string, updates: Partial<GradeInput>) => Promise<{ success: boolean; error?: string }>
    deleteGrade: (id: string) => Promise<{ success: boolean; error?: string }>
    getGradesByStudent: (studentId: string, schoolYear: string, term?: number) => Promise<{ success: boolean; grades?: GradeWithSubject[]; error?: string }>
    getGradesByClass: (className: string, schoolYear: string, term: number) => Promise<{ success: boolean; grades?: (GradeWithSubject & { first_name: string; last_name: string; class: string })[]; error?: string }>
    getStudentAverage: (studentId: string, schoolYear: string, term: number) => Promise<{ success: boolean; average?: { average: number; totalCoefficient: number } | null; error?: string }>
    getClassAverages: (className: string, schoolYear: string, term: number) => Promise<{ success: boolean; averages?: SubjectClassAverage[]; error?: string }>
    getClassRanking: (className: string, schoolYear: string, term: number) => Promise<{ success: boolean; ranking?: StudentTermAverage[]; error?: string }>
  }
  dashboard: {
    getStats: () => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
  }
  auth: AuthAPI
  dialog: DialogAPI
}

// --------------------------------------------
// Global Window Declaration
// --------------------------------------------
declare global {
  interface Window {
    electron: ElectronAPI
    api: ElectronAPI
  }
}
