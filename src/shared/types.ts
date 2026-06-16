// ============================================
// Shared Types — Lycée Manjary Soa LMS
// ============================================
// Centralized type definitions used across
// main process, preload, and renderer.
// ============================================

// --------------------------------------------
// Auth & RBAC Types
// --------------------------------------------

/** The 4 roles defined in the Avenant RBAC specification */
export type UserRole = 'admin' | 'secretariat' | 'accounting' | 'direction'

/** Access levels for each resource/role combination */
export type AccessLevel = 'full' | 'read' | 'none'

/** Resource keys matching the Avenant permission matrix */
export type Resource =
  | 'students'
  | 'payments'
  | 'attendance'
  | 'grades'
  | 'cash_journal'
  | 'personnel'
  | 'reports'
  | 'settings'
  | 'users'
  | 'audit'
  | 'events'

/** User object returned by auth services (never contains password_hash) */
export interface User {
  id: string
  username: string
  role: UserRole
  full_name: string
  email: string
}

/** Result of a login attempt */
export interface LoginResult {
  ok: boolean
  user?: User
  token?: string
  error?: string
  /** True if the user must change their password (default admin on first login) */
  requirePasswordChange?: boolean
}

/** Authentication state for the frontend store */
export interface AuthState {
  user: User | null
  token: string | null
  permissions: Record<Resource, AccessLevel> | null
  accessibleResources: Resource[]
  isAuthenticated: boolean
}

/** Audit log entry */
export interface AuditLog {
  id: number
  user_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_value: string | null
  new_value: string | null
  timestamp: string
}

/** User row from the database (excludes password_hash) */
export interface UserRow {
  id: string
  username: string
  role: UserRole
  full_name: string | null
  email: string | null
  active: number
  last_login: string | null
  created_at: string
  updated_at: string
  version: number
  sync_status: string
  deleted: number
}

// --------------------------------------------
// Finance & Student Types
// --------------------------------------------

export interface FinancePrices {
  tuition: Record<string, number>
  classes: string[]
  registration: number
  reenrollment: number
  canteen: {
    daily: number
    monthly: number
  }
  bus: Record<string, number>
  busRoutes: string[]
  uniforms: Record<string, number>
  uniformItems: string[]
}

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

  // Services & Fees (Optional/Merged from FeeRecord)
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
  tuition_level?: string
  email?: string
}

export interface Payment {
  id: string
  student_id: string
  payment_date: string
  amount: number
  payment_type: 'tuition' | 'bus' | 'canteen' | 'enrollment' | 'uniform' | 'event' | 'other'
  month?: string // "2025-09"
  description?: string
  payment_method?: 'cash' | 'check' | 'transfer' | 'mobile_money'
  receipt_number?: string
  created_at?: string
  updated_at?: string
}

export interface CashJournalEntry {
  id: string
  transaction_date: string
  type: 'income' | 'expense'
  department: 'bus' | 'ecole'
  category: string
  subcategory?: string
  amount: number
  description?: string
  payment_method?: string
  related_student_id?: string
  related_personnel_id?: string
  created_at?: string
  updated_at?: string
}

export interface CashJournalFilters {
  startDate?: string
  endDate?: string
  type?: string
  department?: string
  category?: string
  search?: string
}

export interface FeeRecord {
  id: string
  student_id: string
  school_year: string
  class_name: string
  tuition_level: string
  enrollment_date: string
  registration_fee_paid: boolean
  tuition_paid_months: string[]

  bus_subscribed: boolean
  bus_route?: string

  canteen_subscribed: boolean
  canteen_days_per_week: number
  canteen_days: string[]

  uniform_items_purchased?: string[]

  monthly_tuition: number
  fram_paid_by_parent: boolean

  created_at?: string
  updated_at?: string
}

export interface SchoolConfig {
  school_name: string
  current_year: string
  school_logo?: string
}

// --------------------------------------------
// Personnel Types
// --------------------------------------------

export interface Personnel {
  id: string
  first_name: string
  last_name: string
  photo_path?: string
  date_of_birth?: string
  contact?: string
  email?: string
  address?: string
  status?: 'fulltime' | 'parttime'
  position?: 'teacher' | 'admin' | 'direction' | 'maintenance' | 'other'
  hire_date: string
  departure_date?: string
  teacher_level?: 'preschool' | 'primary' | 'middle' | 'high' | 'multi'
  teacher_subjects?: string[]
  salary_type?: 'monthly' | 'hourly'
  monthly_salary?: number
  hourly_rate?: number
  has_droit?: boolean
  droit_amount?: number
  cnaps_rate?: number
  cnaps_amount?: number
  irsa_rate?: number
  irsa_amount?: number
  // Work schedule (for attendance tracking)
  expected_monthly_hours?: number
  work_pattern?: 'daily' | 'weekly' | 'monthly' | 'custom'
  work_days?: string[]          // e.g. ["Monday","Tuesday","Wednesday","Thursday","Friday"]
  daily_hours?: number          // expected hours per working day
  // Metadata
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
  deleted?: number
}

export interface TimeTracking {
  id: string
  personnel_id: string
  month: string // "2025-09"
  hours_worked: number
  manually_edited?: boolean
  edited_by?: string
  edit_reason?: string
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
}

export interface PersonnelAbsence {
  id: string
  personnel_id: string
  start_date: string
  end_date: string
  reason?: 'leave' | 'sick' | 'unjustified' | 'other'
  justified?: boolean
  document_path?: string
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
}

export interface SalaryAdvance {
  id: string
  personnel_id: string
  amount: number
  advance_date: string
  reason?: string
  repaid?: boolean
  repayment_date?: string
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
}

export interface CustomDeduction {
  id: string
  personnel_id: string
  month: string // "2025-09"
  label: string
  amount: number
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
}

export interface DailyAttendance {
  id: string
  personnel_id: string
  attendance_date: string          // "2025-09-15"
  status: 'present' | 'absent' | 'late' | 'half_day' | 'excused' | 'paid_leave'
  hours_worked: number
  expected_hours?: number
  notes?: string
  session_info?: string            // JSON string for future extensibility
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
}

export interface SalaryCalculation {
  grossSalary: number
  cnapsDeduction: number
  irsaDeduction: number
  droitDeduction: number
  advancesTotal: number
  customDeductionsTotal: number
  netSalary: number
  details: {
    baseSalary: number
    hoursWorked?: number
    expectedHours?: number
    hourlyRate?: number
    hourlyEquivalentRate?: number
    absencesDeduction?: number
    overtimePay?: number
    totalAbsenceDays?: number
  }
}

// --------------------------------------------
// Grades & Subjects Types
// --------------------------------------------

export interface Subject {
  id: string
  name: string
  default_coefficient?: number
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
  deleted?: number
}

export interface Grade {
  id: string
  student_id: string
  teacher_id?: string
  subject_id: string
  school_year: string
  term: number
  grade: number
  grade_journalier?: number
  grade_exam?: number
  coefficient?: number
  teacher_comment?: string
  behavior_note?: 'none' | 'warning' | 'praise'
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
  deleted?: number
}

export interface GradeWithSubject extends Grade {
  subject_name?: string
  subject_default_coefficient?: number
  // Optional student info (populated when fetched by class)
  first_name?: string
  last_name?: string
  class?: string
}

export interface StudentTermAverage {
  student_id: string
  first_name: string
  last_name: string
  class: string
  average: number
  totalCoefficient: number
  rank: number
}

export interface SubjectClassAverage {
  subject_id: string
  subject_name: string
  average: number
  student_count: number
}

// --------------------------------------------
// Class-Subject Mapping (Phase 3)
// --------------------------------------------

/** Mapping between a class level and a subject with class-specific coefficient */
export interface ClassSubject {
  id: string
  class_name: string
  subject_id: string
  coefficient: number
  position: number
  created_at?: string
  updated_at?: string
  version?: number
  sync_status?: string
  deleted?: number
  // Joined fields (populated when fetched with subject info)
  subject_name?: string
  subject_default_coefficient?: number
}

/** Input for creating/updating a class-subject mapping */
export interface ClassSubjectInput {
  class_name: string
  subject_id: string
  coefficient?: number
  position?: number
}
