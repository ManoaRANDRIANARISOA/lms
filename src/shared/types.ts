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

export interface FeeRecord {
  id: string
  student_id: string
  school_year: string
  class_name: string
  tuition_level: string
  enrollment_date: string
  registration_fee_paid: boolean
  tuition_paid_months: string[] // JSON string or array depending on context (usually parsed in frontend)

  bus_subscribed: boolean
  bus_route?: string

  canteen_subscribed: boolean
  canteen_days_per_week: number
  canteen_days: string[]

  uniform_tshirt_purchased: boolean
  uniform_apron_purchased: boolean
  uniform_shorts_purchased: boolean
  uniform_badge_purchased: boolean

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
