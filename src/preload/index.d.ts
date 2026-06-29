/**
 * preload/index.d.ts — TypeScript Declarations for Preload API
 *
 * Provides type information for the `window.api` and `window.electron`
 * objects exposed via the preload bridge.
 */

import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  User,
  Resource,
  AccessLevel,
  LoginResult,
  AuditLog,
  UserRow,
  UserRole,
  Student,
  Payment,
  FeeRecord,
  Personnel,
  TimeTracking,
  PersonnelAbsence,
  SalaryAdvance,
  CustomDeduction,
  DailyAttendance,
  SalaryCalculation,
  Subject,
  GradeWithSubject,
  StudentTermAverage,
  SubjectClassAverage,
  ClassSubject,
  CashJournalEntry,
  CashJournalFilters
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
  updateUser: (
    id: string,
    updates: {
      username?: string
      role?: UserRole
      full_name?: string
      email?: string
      active?: boolean
    }
  ) => Promise<{ success: boolean; user?: UserRow; error?: string }>
  deactivateUser: (id: string) => Promise<{ success: boolean; error?: string }>
  changePassword: (
    userId: string,
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>
  resetPassword: (
    userId: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>
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
  status?: string
  schoolYear?: string
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

interface ClassSubjectPayload {
  class_name: string
  subject_id: string
  coefficient?: number
  position?: number
}

// --------------------------------------------
// Full API Type
// --------------------------------------------
interface APIType {
  student: {
    create: (
      data: Partial<Student> & Record<string, unknown>
    ) => Promise<{ success: boolean; id?: string; registration_number?: string; error?: string }>
    list: (filters?: StudentFilters) => Promise<{ students: Student[]; total: number }>
    get: (id: string, schoolYear?: string) => Promise<{
      success: boolean
      student?: Student
      fees?: FeeRecord
      feesHistory?: FeeRecord[]
      payments?: Payment[]
      error?: string
    }>
    update: (
      id: string,
      updates: Partial<Student> & Record<string, unknown>
    ) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    reEnroll: (
      id: string,
      newClass: string,
      targetYear: string,
      initialPaymentDroit?: number,
      initialPaymentFram?: number
    ) => Promise<{ success: boolean; error?: string }>
    getServiceStats: () => Promise<Record<string, unknown>>
    repair: (
      targetYear: string
    ) => Promise<{ success: boolean; fixedCount?: number; error?: string }>

    resetDatabase: (includeRemote: boolean) => Promise<{ success: boolean; error?: string }>
  }
  payment: {
    create: (
      data: Omit<Payment, 'id' | 'created_at' | 'updated_at'>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    getByStudent: (studentId: string, schoolYear?: string) => Promise<Payment[]>
    getAll: (filters?: PaymentFilters) => Promise<Payment[]>
    getTuitionStatus: (
      studentId: string,
      schoolYear: string
    ) => Promise<{
      success: boolean
      feeRecord?: FeeRecord
      monthlyStatus?: Record<string, unknown>
      totalPaid?: number
      totalDue?: number
      error?: string
    }>
    getUnpaidAlerts: (schoolYear: string) => Promise<{
      success: boolean
      alerts?: Array<{
        student_id: string
        first_name: string
        last_name: string
        class_name: string
        unpaid_items: Array<{ type: string; description: string; amount: number }>
        total_due: number
      }>
      error?: string
    }>
    getExpectedRevenue: (
      schoolYear: string
    ) => Promise<{ success: boolean; expected?: number; error?: string }>
    checkFramFratrie: (
      studentId: string,
      schoolYear: string
    ) => Promise<{ success: boolean; isPaid: boolean; by?: string; error?: string }>
  }
  attendance: {
    recordBus: (
      date: string,
      records: Array<{ student_id: string; status: string }>
    ) => Promise<{ success: boolean; error?: string }>
    recordCanteen: (
      date: string,
      records: Array<{ student_id: string; status: string }>
    ) => Promise<{ success: boolean; error?: string }>
    getBusSubscribers: (date: string) => Promise<Student[]>
    getCanteenSubscribers: (date: string) => Promise<Student[]>
    getBusAttendance: (
      date: string
    ) => Promise<Array<{ student_id: string; status: string; date: string }>>
    getCanteenAttendance: (
      date: string
    ) => Promise<Array<{ student_id: string; status: string; date: string }>>
  }
  event: {
    create: (
      data: Record<string, unknown>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    list: (
      schoolYear?: string
    ) => Promise<{ success: boolean; events?: Record<string, unknown>[]; error?: string }>
    getById: (id: string) => Promise<{
      success: boolean
      event?: Record<string, unknown>
      participation?: Record<string, unknown>[]
      error?: string
    }>
    update: (
      id: string,
      updates: Record<string, unknown>
    ) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    addParticipants: (
      eventId: string,
      studentIds: string[],
      amountDue?: number
    ) => Promise<{ success: boolean; error?: string }>
    recordPayment: (
      eventId: string,
      studentId: string,
      amount: number,
      paymentMethod?: string
    ) => Promise<{ success: boolean; error?: string }>
    getByStudent: (
      studentId: string,
      schoolYear?: string
    ) => Promise<{ success: boolean; events?: any[]; error?: string }>
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
    getAll: () => Promise<Record<string, unknown>>
  }
  personnel: {
    create: (
      data: Partial<Personnel> & Record<string, unknown>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    list: (
      filters?: PersonnelFilters
    ) => Promise<{ success: boolean; personnel?: Personnel[]; error?: string }>
    get: (id: string) => Promise<{
      success: boolean
      person?: Personnel
      timeTracking?: TimeTracking[]
      absences?: PersonnelAbsence[]
      advances?: SalaryAdvance[]
      deductions?: CustomDeduction[]
      error?: string
    }>
    update: (
      id: string,
      updates: Partial<Personnel> & Record<string, unknown>
    ) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    setTimeTracking: (
      data: Partial<TimeTracking>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    getTimeTracking: (
      personnelId: string
    ) => Promise<{ success: boolean; records?: TimeTracking[]; error?: string }>
    createAbsence: (
      data: Partial<PersonnelAbsence>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    getAbsences: (
      personnelId: string
    ) => Promise<{ success: boolean; records?: PersonnelAbsence[]; error?: string }>
    deleteAbsence: (id: string) => Promise<{ success: boolean; error?: string }>
    createAdvance: (
      data: Partial<SalaryAdvance>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    getAdvances: (
      personnelId: string
    ) => Promise<{ success: boolean; records?: SalaryAdvance[]; error?: string }>
    markAdvanceRepaid: (
      id: string,
      repaymentDate: string
    ) => Promise<{ success: boolean; error?: string }>
    createDeduction: (
      data: Partial<CustomDeduction>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    getDeductions: (
      personnelId: string,
      month?: string
    ) => Promise<{ success: boolean; records?: CustomDeduction[]; error?: string }>
    deleteDeduction: (id: string) => Promise<{ success: boolean; error?: string }>
    calculateSalary: (
      personnelId: string,
      month: string
    ) => Promise<{ success: boolean; calculation?: SalaryCalculation; error?: string }>
    getMonthlyAttendance: (
      personnelId: string,
      year: number,
      month: number
    ) => Promise<{ success: boolean; records?: DailyAttendance[]; error?: string }>
    getDailyAttendance: (
      date: string
    ) => Promise<{ success: boolean; records?: DailyAttendance[]; error?: string }>
    setBulkAttendance: (
      records: Partial<DailyAttendance>[]
    ) => Promise<{ success: boolean; error?: string }>
    setAttendance: (
      data: Partial<DailyAttendance>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    deleteAttendance: (id: string) => Promise<{ success: boolean; error?: string }>
    getPayrollSummary: (
      month: string
    ) => Promise<{
      success: boolean
      summary?: Record<
        string,
        {
          isPaid: boolean
          isIgnored: boolean
          grossSalary: number
          netSalary: number
          hasWorked: boolean
        }
      >
      error?: string
    }>
    createSalaryExpense: (
      personnelId: string,
      month: string,
      netAmount: number,
      description?: string
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    ignoreMonth: (
      personnelId: string,
      month: string,
      reason?: string
    ) => Promise<{ success: boolean; error?: string }>
    unignoreMonth: (
      personnelId: string,
      month: string
    ) => Promise<{ success: boolean; error?: string }>
  }
  grade: {
    createSubject: (
      data: SubjectInput
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    listSubjects: () => Promise<{ success: boolean; subjects?: Subject[]; error?: string }>
    updateSubject: (
      id: string,
      updates: Partial<SubjectInput>
    ) => Promise<{ success: boolean; error?: string }>
    deleteSubject: (id: string) => Promise<{ success: boolean; error?: string }>
    createGrade: (data: GradeInput) => Promise<{ success: boolean; id?: string; error?: string }>
    updateGrade: (
      id: string,
      updates: Partial<GradeInput>
    ) => Promise<{ success: boolean; error?: string }>
    deleteGrade: (id: string) => Promise<{ success: boolean; error?: string }>
    getGradesByStudent: (
      studentId: string,
      schoolYear: string,
      term?: number
    ) => Promise<{ success: boolean; grades?: GradeWithSubject[]; error?: string }>
    getGradesByClass: (
      className: string,
      schoolYear: string,
      term: number
    ) => Promise<{
      success: boolean
      grades?: (GradeWithSubject & {
        first_name: string
        last_name: string
        class: string
        class_coefficient: number
      })[]
      error?: string
    }>
    getStudentAverage: (
      studentId: string,
      schoolYear: string,
      term: number
    ) => Promise<{
      success: boolean
      average?: { average: number; totalCoefficient: number } | null
      error?: string
    }>
    getClassAverages: (
      className: string,
      schoolYear: string,
      term: number
    ) => Promise<{ success: boolean; averages?: SubjectClassAverage[]; error?: string }>
    getClassRanking: (
      className: string,
      schoolYear: string,
      term: number
    ) => Promise<{ success: boolean; ranking?: StudentTermAverage[]; error?: string }>
    // Class Subjects (Phase 3)
    getClassSubjects: (
      className: string
    ) => Promise<{ success: boolean; subjects?: ClassSubject[]; error?: string }>
    getAllClassSubjects: () => Promise<{
      success: boolean
      subjects?: ClassSubject[]
      error?: string
    }>
    createClassSubject: (
      data: ClassSubjectPayload
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    updateClassSubject: (
      id: string,
      updates: Partial<ClassSubjectPayload>
    ) => Promise<{ success: boolean; error?: string }>
    deleteClassSubject: (id: string) => Promise<{ success: boolean; error?: string }>
    getClassesWithSubjects: () => Promise<{ success: boolean; classes?: string[]; error?: string }>
    getClassSubjectAverages: (
      className: string,
      schoolYear: string,
      term: number
    ) => Promise<{ success: boolean; averages?: SubjectClassAverage[]; error?: string }>
  }
  dashboard: {
    getStats: () => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
  }
  cashJournal: {
    create: (
      data: Omit<CashJournalEntry, 'id' | 'created_at' | 'updated_at'>
    ) => Promise<{ success: boolean; id?: string; error?: string }>
    list: (
      filters?: CashJournalFilters
    ) => Promise<{ success: boolean; entries?: CashJournalEntry[]; error?: string }>
    get: (id: string) => Promise<{ success: boolean; entry?: CashJournalEntry; error?: string }>
    update: (
      id: string,
      updates: Partial<CashJournalEntry>
    ) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    getDailyBalance: (date: string) => Promise<{
      success: boolean
      balance?: { total_income: number; total_expense: number; balance: number }
      error?: string
    }>
    getMonthlyBalance: (
      year: number,
      month: number
    ) => Promise<{
      success: boolean
      balance?: { total_income: number; total_expense: number; balance: number }
      error?: string
    }>
    getBalanceSummary: (
      startDate: string,
      endDate: string
    ) => Promise<{
      success: boolean
      summary?: Array<{
        department: string
        type: string
        category: string
        entry_count: number
        total: number
      }>
      error?: string
    }>
    getTotalBalance: () => Promise<{
      success: boolean
      balance?: { total_income: number; total_expense: number; balance: number }
      error?: string
    }>
    report: {
      monthlyFinance: (
        year: number,
        month: number
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      unpaid: (schoolYear: string) => Promise<{ success: boolean; data?: any; error?: string }>
      getExpectedRevenue: (
        schoolYear: string
      ) => Promise<{ success: boolean; expected?: number; error?: string }>
    }
    assessment: {
      create: (data: any) => Promise<{ success: boolean; id?: string; error?: string }>
      list: (
        schoolYear: string,
        className?: string
      ) => Promise<{ success: boolean; assessments?: any[]; error?: string }>
      update: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>
      delete: (id: string) => Promise<{ success: boolean; error?: string }>
    }
  }
  report: {
    monthlyFinance: (
      year: number,
      month: number
    ) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
    unpaid: (
      schoolYear: string
    ) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
    payroll: (
      year: number,
      month: number
    ) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
    tuition: (
      schoolYear: string
    ) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>
  }
  export: {
    csv: (
      data: Record<string, unknown>[],
      columns: Array<{ key: string; label: string }>,
      filename: string
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
  }
  email: {
    configure: (config: {
      enabled: boolean
      gmail_address: string
      gmail_app_password: string
      recipient_email: string
      auto_send_daily: boolean
    }) => Promise<{ success: boolean; error?: string }>
    testConnection: () => Promise<{ success: boolean; error?: string }>
    sendNow: (
      to: string,
      subject: string,
      body: string
    ) => Promise<{ success: boolean; error?: string }>
    getStatus: () => Promise<{
      success: boolean
      configured?: boolean
      enabled?: boolean
      auto_send?: boolean
      error?: string
    }>
    getLogs: () => Promise<{
      success: boolean
      logs?: Array<{
        sent_at: string
        recipient: string
        subject: string
        success: boolean
        error?: string
      }>
      error?: string
    }>
    sendDailyReport: () => Promise<{ success: boolean; error?: string }>
  }
  pdf: {
    generateReceipt: (data: {
      student_name: string
      class_name: string
      amount: number
      payment_type: string
      payment_date: string
      month?: string
      receipt_number?: string
      payment_method?: string
      department?: string
    }) => Promise<{ success: boolean; filePath?: string; error?: string }>
    generateCertificate: (data: {
      first_name: string
      last_name: string
      date_of_birth?: string
      place_of_birth?: string
      class_name: string
      school_year: string
      registration_number?: string
      father_name?: string
      mother_name?: string
      photo_path?: string
    }) => Promise<{ success: boolean; filePath?: string; error?: string }>
    generateReportCard: (
      studentData: {
        first_name: string
        last_name: string
        class_name: string
        school_year: string
        term: number
        termName?: string
      },
      grades: Array<{ subject: string; grade: number; coefficient: number; average: number }>,
      generalAverage: number
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    generatePayslip: (
      personnelData: { first_name: string; last_name: string; position: string; month: string },
      salaryCalc: {
        gross_salary: number
        cnaps: number
        ostie: number
        irsa: number
        total_deductions: number
        net_salary: number
      }
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    generateDailyReport: (data: {
      date: string
      total_income: number
      total_expense: number
      balance: number
      entries: Array<{
        type: string
        department: string
        category: string
        amount: number
        description?: string
      }>
    }) => Promise<{ success: boolean; filePath?: string; error?: string }>
    openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
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
    api: APIType
  }
}
