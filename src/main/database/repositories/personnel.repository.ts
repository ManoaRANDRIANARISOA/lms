/**
 * personnel.repository.ts — Personnel Management Repository
 *
 * CRUD operations + time tracking + absences + salary advances
 * + custom deductions + salary calculation.
 *
 * @module PersonnelRepository
 */

import db from '../db'
import { addToSyncQueue } from '../../services/sync.service'
import { v4 as uuidv4 } from 'uuid'
import type {
  Personnel,
  TimeTracking,
  PersonnelAbsence,
  SalaryAdvance,
  CustomDeduction,
  SalaryCalculation,
  DailyAttendance
} from '../../../shared/types'

// ============================================
// PERSONNEL CRUD
// ============================================

export class PersonnelRepository {
  private static allowedFields = [
    'first_name', 'last_name', 'photo_path', 'date_of_birth', 'contact',
    'email', 'address', 'status', 'position', 'hire_date', 'departure_date',
    'teacher_level', 'teacher_subjects', 'salary_type', 'monthly_salary',
    'hourly_rate', 'has_droit', 'droit_amount', 'cnaps_rate', 'irsa_rate',
    'expected_monthly_hours', 'work_pattern', 'work_days', 'daily_hours'
  ]

  static create(person: Omit<Personnel, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'deleted'>) {
    const id = uuidv4()

    const fields: string[] = []
    const placeholders: string[] = []
    const values: any[] = []

    for (const key of Object.keys(person)) {
      if (this.allowedFields.includes(key)) {
        fields.push(key)
        placeholders.push('?')
        let val = (person as any)[key]
        // SQLite cannot bind NaN — replace with null
        if (val !== undefined && val !== null && Number.isNaN(val)) {
          val = null
        }
        // Empty strings for date fields should be treated as null
        if (key.includes('date') && val === '') {
          val = null
        }
        // SQLite cannot bind objects/arrays — serialize to JSON string
        if (val !== undefined && val !== null && typeof val === 'object') {
          val = JSON.stringify(val)
        }
        // Explicitly convert booleans to 0/1 for SQLite
        if (typeof val === 'boolean') {
          val = val ? 1 : 0
        }
        values.push(val !== undefined ? val : null)
      }
    }

    const stmt = db.prepare(`
      INSERT INTO personnel (id, ${fields.join(', ')}, created_at, updated_at, version, sync_status, deleted)
      VALUES (?, ${placeholders.join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
    `)

    // Sanitize person data for sync queue (same logic as DB values)
    const syncPerson: any = { id }
    for (const key of Object.keys(person)) {
      if (this.allowedFields.includes(key)) {
        let val = (person as any)[key]
        if (val !== undefined && val !== null && Number.isNaN(val)) val = null
        if (key.includes('date') && val === '') val = null
        if (val !== undefined && val !== null && typeof val === 'object') val = JSON.stringify(val)
        if (typeof val === 'boolean') val = val ? 1 : 0
        syncPerson[key] = val !== undefined ? val : null
      }
    }

    const transaction = db.transaction(() => {
      stmt.run(id, ...values)
      addToSyncQueue('personnel', id, 'create', syncPerson)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create personnel error:', error)
      return { success: false, error: error.message }
    }
  }

  static list(filters: { search?: string; position?: string; status?: string; deleted?: boolean } = {}) {
    let query = 'SELECT * FROM personnel WHERE deleted = 0'
    const params: any[] = []

    if (filters.position) {
      query += ' AND position = ?'
      params.push(filters.position)
    }
    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }
    if (filters.search) {
      query += ' AND (LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(contact) LIKE ?)'
      const like = `%${filters.search.toLowerCase()}%`
      params.push(like, like, like)
    }

    query += ' ORDER BY last_name, first_name'

    return db.prepare(query).all(...params) as Personnel[]
  }

  static getById(id: string) {
    const person = db.prepare('SELECT * FROM personnel WHERE id = ? AND deleted = 0').get(id) as Personnel | undefined
    if (!person) return null

    const timeTracking = db.prepare('SELECT * FROM time_tracking WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC').all(id) as TimeTracking[]
    const absences = db.prepare('SELECT * FROM personnel_absences WHERE personnel_id = ? AND deleted = 0 ORDER BY start_date DESC').all(id) as PersonnelAbsence[]
    const advances = db.prepare('SELECT * FROM salary_advances WHERE personnel_id = ? AND repaid = 0 AND deleted = 0 ORDER BY advance_date DESC').all(id) as SalaryAdvance[]
    const deductions = db.prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC').all(id) as CustomDeduction[]

    return { person, timeTracking, absences, advances, deductions }
  }

  static update(id: string, updates: Partial<Personnel>) {
    const allowedUpdates: Record<string, any> = {}
    for (const key of Object.keys(updates)) {
      if (this.allowedFields.includes(key)) {
        allowedUpdates[key] = (updates as any)[key]
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return { success: false, error: 'Aucun champ valide à mettre à jour' }
    }

    const fields = Object.keys(allowedUpdates).map((k) => `${k} = ?`).join(', ')
    const values = Object.entries(allowedUpdates).map(([k, v]) => {
      if (v !== undefined && v !== null && Number.isNaN(v)) return null
      if (k.includes('date') && v === '') return null
      if (v !== undefined && v !== null && typeof v === 'object') return JSON.stringify(v)
      if (typeof v === 'boolean') return v ? 1 : 0
      return v
    })

    const stmt = db.prepare(`
      UPDATE personnel
      SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
      WHERE id = ? AND deleted = 0
    `)

    // Sanitize updates for sync queue (same logic as DB values)
    const syncUpdates: any = { id }
    for (const key of Object.keys(allowedUpdates)) {
      let val = allowedUpdates[key]
      if (val !== undefined && val !== null && Number.isNaN(val)) val = null
      if (key.includes('date') && val === '') val = null
      if (val !== undefined && val !== null && typeof val === 'object') val = JSON.stringify(val)
      if (typeof val === 'boolean') val = val ? 1 : 0
      syncUpdates[key] = val !== undefined ? val : null
    }

    const transaction = db.transaction(() => {
      stmt.run(...values, id)
      addToSyncQueue('personnel', id, 'update', syncUpdates)
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      console.error('Update personnel error:', error)
      return { success: false, error: error.message }
    }
  }

  static delete(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE personnel
        SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
      `).run(id)
      addToSyncQueue('personnel', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      console.error('Delete personnel error:', error)
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // TIME TRACKING
  // ============================================

  static setTimeTracking(data: Omit<TimeTracking, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO time_tracking (id, personnel_id, month, hours_worked, manually_edited, edited_by, edit_reason, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
        ON CONFLICT(personnel_id, month) DO UPDATE SET
        hours_worked = excluded.hours_worked,
        manually_edited = excluded.manually_edited,
        edited_by = excluded.edited_by,
        edit_reason = excluded.edit_reason,
        updated_at = CURRENT_TIMESTAMP,
        version = version + 1,
        sync_status = 'pending'
      `).run(id, data.personnel_id, data.month, data.hours_worked, data.manually_edited ? 1 : 0, data.edited_by || null, data.edit_reason || null)
      addToSyncQueue('time_tracking', id, 'update', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Set time tracking error:', error)
      return { success: false, error: error.message }
    }
  }

  static getTimeTracking(personnelId: string) {
    return db.prepare('SELECT * FROM time_tracking WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC').all(personnelId) as TimeTracking[]
  }

  // ============================================
  // ABSENCES
  // ============================================

  static createAbsence(data: Omit<PersonnelAbsence, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO personnel_absences (id, personnel_id, start_date, end_date, reason, justified, document_path, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `).run(id, data.personnel_id, data.start_date, data.end_date, data.reason || null, data.justified !== false ? 1 : 0, data.document_path || null)
      addToSyncQueue('personnel_absences', id, 'create', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create absence error:', error)
      return { success: false, error: error.message }
    }
  }

  static getAbsences(personnelId: string) {
    return db.prepare('SELECT * FROM personnel_absences WHERE personnel_id = ? AND deleted = 0 ORDER BY start_date DESC').all(personnelId) as PersonnelAbsence[]
  }

  static deleteAbsence(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE personnel_absences SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`).run(id)
      addToSyncQueue('personnel_absences', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // SALARY ADVANCES
  // ============================================

  static createAdvance(data: Omit<SalaryAdvance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO salary_advances (id, personnel_id, amount, advance_date, reason, repaid, repayment_date, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `).run(id, data.personnel_id, data.amount, data.advance_date, data.reason || null, data.repaid ? 1 : 0, data.repayment_date || null)
      addToSyncQueue('salary_advances', id, 'create', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create advance error:', error)
      return { success: false, error: error.message }
    }
  }

  static getAdvances(personnelId: string) {
    return db.prepare('SELECT * FROM salary_advances WHERE personnel_id = ? AND deleted = 0 ORDER BY advance_date DESC').all(personnelId) as SalaryAdvance[]
  }

  static markAdvanceRepaid(id: string, repaymentDate: string) {
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE salary_advances SET repaid = 1, repayment_date = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
      `).run(repaymentDate, id)
      addToSyncQueue('salary_advances', id, 'update', { id, repaid: true, repayment_date: repaymentDate })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // CUSTOM DEDUCTIONS
  // ============================================

  static createDeduction(data: Omit<CustomDeduction, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO custom_deductions (id, personnel_id, month, label, amount, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `).run(id, data.personnel_id, data.month, data.label, data.amount)
      addToSyncQueue('custom_deductions', id, 'create', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create deduction error:', error)
      return { success: false, error: error.message }
    }
  }

  static getDeductions(personnelId: string, month?: string) {
    if (month) {
      return db.prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? AND month = ? AND deleted = 0').all(personnelId, month) as CustomDeduction[]
    }
    return db.prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC').all(personnelId) as CustomDeduction[]
  }

  static deleteDeduction(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE custom_deductions SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`).run(id)
      addToSyncQueue('custom_deductions', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // DAILY ATTENDANCE
  // ============================================

  static getMonthlyAttendance(personnelId: string, year: number, month: number) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    return db.prepare(
      'SELECT * FROM daily_attendance WHERE personnel_id = ? AND attendance_date LIKE ? AND deleted = 0 ORDER BY attendance_date'
    ).all(personnelId, `${monthStr}%`) as DailyAttendance[]
  }

  static setAttendance(data: Omit<DailyAttendance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>) {
    const existing = db.prepare(
      'SELECT id FROM daily_attendance WHERE personnel_id = ? AND attendance_date = ? AND deleted = 0'
    ).get(data.personnel_id, data.attendance_date) as { id: string } | undefined

    const transaction = db.transaction(() => {
      if (existing) {
        db.prepare(`
          UPDATE daily_attendance
          SET status = ?, hours_worked = ?, expected_hours = ?, notes = ?, session_info = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
          WHERE id = ?
        `).run(data.status, data.hours_worked, data.expected_hours || 0, data.notes || null, data.session_info || null, existing.id)
        addToSyncQueue('daily_attendance', existing.id, 'update', { id: existing.id, ...data })
      } else {
        const id = uuidv4()
        db.prepare(`
          INSERT INTO daily_attendance (id, personnel_id, attendance_date, status, hours_worked, expected_hours, notes, session_info, created_at, updated_at, version, sync_status, deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
        `).run(id, data.personnel_id, data.attendance_date, data.status, data.hours_worked, data.expected_hours || 0, data.notes || null, data.session_info || null)
        addToSyncQueue('daily_attendance', id, 'create', { id, ...data })
      }
    })

    try {
      transaction()
      return { success: true, id: existing?.id }
    } catch (error: any) {
      console.error('Set attendance error:', error)
      return { success: false, error: error.message }
    }
  }

  static deleteAttendance(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE daily_attendance SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`).run(id)
      addToSyncQueue('daily_attendance', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      console.error('Delete attendance error:', error)
      return { success: false, error: error.message }
    }
  }

  // Helper: expected hours for a month based on work_pattern + work_days + daily_hours
  static getExpectedHoursForMonth(year: number, month: number, person: Personnel): number {
    const daysInMonth = new Date(year, month, 0).getDate()
    const pattern = person.work_pattern || 'daily'
    const dailyHours = person.daily_hours || 8

    if (pattern === 'monthly' || pattern === 'custom') {
      return person.expected_monthly_hours || 160
    }

    const workDays = (person.work_days && person.work_days.length > 0)
      ? person.work_days
      : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    let workingDaysCount = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day)
      if (workDays.includes(dayNames[date.getDay()])) {
        workingDaysCount++
      }
    }

    return workingDaysCount * dailyHours
  }

  // ============================================
  // SALARY PAYMENT → Cash Journal Link
  // ============================================

  static createSalaryExpense(personnelId: string, month: string, netAmount: number, description?: string) {
    const id = uuidv4()
    const transactionDate = new Date().toISOString().split('T')[0]
    const desc = description || `Fiche de paie - ${month}`

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO cash_journal (id, transaction_date, type, category, amount, description, related_personnel_id, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `).run(id, transactionDate, 'expense', 'salaire', netAmount, desc, personnelId)
      addToSyncQueue('cash_journal', id, 'create', {
        id, transaction_date: transactionDate, type: 'expense', category: 'salaire', amount: netAmount, description: desc, related_personnel_id: personnelId
      })
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create salary expense error:', error)
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // SALARY CALCULATION
  // ============================================

  static calculateSalary(personnelId: string, month: string): SalaryCalculation | null {
    const person = db.prepare('SELECT * FROM personnel WHERE id = ? AND deleted = 0').get(personnelId) as Personnel | undefined
    if (!person) return null

    const [year, mon] = month.split('-').map(Number)
    const monthStart = `${month}-01`
    const monthEndDate = new Date(year, mon, 0)
    const monthEnd = `${month}-${String(monthEndDate.getDate()).padStart(2, '0')}`

    // Daily attendance for the month
    const attendance = db.prepare(
      'SELECT * FROM daily_attendance WHERE personnel_id = ? AND attendance_date >= ? AND attendance_date <= ? ORDER BY attendance_date'
    ).all(personnelId, monthStart, monthEnd) as DailyAttendance[]

    const totalHoursWorked = attendance.reduce((sum, a) => {
      // paid_leave counts as expected_hours (no deduction)
      if (a.status === 'paid_leave') {
        return sum + (a.expected_hours || person.daily_hours || 8)
      }
      return sum + (a.hours_worked || 0)
    }, 0)

    // Informational absences (for display only — salary is based on actual hours)
    const absences = db.prepare(
      'SELECT * FROM personnel_absences WHERE personnel_id = ? AND start_date <= ? AND end_date >= ?'
    ).all(personnelId, monthEnd, monthStart) as PersonnelAbsence[]

    const advances = db.prepare('SELECT * FROM salary_advances WHERE personnel_id = ? AND repaid = 0').all(personnelId) as SalaryAdvance[]
    const deductions = db.prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? AND month = ?').all(personnelId, month) as CustomDeduction[]

    // Base salary calculation
    let grossSalary = 0
    let baseSalary = 0
    let hoursWorked = totalHoursWorked
    let expectedHours = 0
    let hourlyEquivalentRate = 0
    let absencesDeduction = 0
    let overtimePay = 0
    let totalAbsenceDays = 0

    if (person.salary_type === 'hourly' && person.hourly_rate) {
      // Hourly: hours × rate. Fallback to time_tracking if no daily attendance.
      if (totalHoursWorked > 0) {
        baseSalary = totalHoursWorked * person.hourly_rate
        grossSalary = baseSalary
        hourlyEquivalentRate = person.hourly_rate
      } else {
        const tracking = db.prepare('SELECT * FROM time_tracking WHERE personnel_id = ? AND month = ?').get(personnelId, month) as TimeTracking | undefined
        if (tracking) {
          hoursWorked = tracking.hours_worked
          baseSalary = hoursWorked * person.hourly_rate
          grossSalary = baseSalary
          hourlyEquivalentRate = person.hourly_rate
        }
      }
    } else if (person.salary_type === 'monthly' && person.monthly_salary) {
      // Monthly hybrid: quota-based calculation
      baseSalary = person.monthly_salary
      expectedHours = this.getExpectedHoursForMonth(year, mon, person)
      hourlyEquivalentRate = expectedHours > 0 ? person.monthly_salary / expectedHours : 0

      const diff = totalHoursWorked - expectedHours
      if (diff < 0) {
        absencesDeduction = Math.abs(diff) * hourlyEquivalentRate
      } else if (diff > 0) {
        overtimePay = diff * hourlyEquivalentRate
      }

      grossSalary = baseSalary - absencesDeduction + overtimePay
    }

    // Count absence days (informational only)
    for (const absence of absences) {
      const absenceStart = new Date(absence.start_date)
      const absenceEnd = new Date(absence.end_date)
      const monthStartDate = new Date(monthStart)
      const monthEndDateObj = new Date(monthEnd)

      const effectiveStart = absenceStart > monthStartDate ? absenceStart : monthStartDate
      const effectiveEnd = absenceEnd < monthEndDateObj ? absenceEnd : monthEndDateObj

      if (effectiveStart <= effectiveEnd) {
        const days = Math.max(1, Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        totalAbsenceDays += days
      }
    }

    grossSalary = Math.max(0, grossSalary)

    // CNAPS (retraite)
    const cnapsRate = person.cnaps_rate || 0.01
    const cnapsDeduction = grossSalary * cnapsRate

    // IRSA (impôt revenu)
    const irsaRate = person.irsa_rate || 0.01
    const irsaDeduction = grossSalary * irsaRate

    // Droit (if applicable)
    const droitDeduction = person.has_droit && person.droit_amount ? person.droit_amount : 0

    // Advances
    const advancesTotal = advances.reduce((sum, a) => sum + a.amount, 0)

    // Custom deductions
    const customDeductionsTotal = deductions.reduce((sum, d) => sum + d.amount, 0)

    const netSalary = Math.max(0, grossSalary - cnapsDeduction - irsaDeduction - droitDeduction - advancesTotal - customDeductionsTotal)

    return {
      grossSalary,
      cnapsDeduction,
      irsaDeduction,
      droitDeduction,
      advancesTotal,
      customDeductionsTotal,
      netSalary,
      details: {
        baseSalary,
        hoursWorked: hoursWorked || undefined,
        expectedHours: expectedHours || undefined,
        hourlyRate: person.hourly_rate || undefined,
        hourlyEquivalentRate: hourlyEquivalentRate || undefined,
        absencesDeduction: absencesDeduction || undefined,
        overtimePay: overtimePay || undefined,
        totalAbsenceDays: totalAbsenceDays || undefined
      }
    }
  }
}
