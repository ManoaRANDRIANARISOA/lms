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
    'first_name',
    'last_name',
    'photo_path',
    'date_of_birth',
    'contact',
    'email',
    'address',
    'status',
    'position',
    'hire_date',
    'departure_date',
    'teacher_level',
    'teacher_subjects',
    'salary_type',
    'monthly_salary',
    'hourly_rate',
    'has_droit',
    'droit_amount',
    'cnaps_rate',
    'irsa_rate',
    'cnaps_amount',
    'irsa_amount',
    'expected_monthly_hours',
    'work_pattern',
    'work_days',
    'daily_hours'
  ]

  private static sanitizeValue(key: string, val: unknown): unknown {
    if (val !== undefined && val !== null && Number.isNaN(val)) return null
    if (key.includes('date') && val === '') return null
    if (val !== undefined && val !== null && typeof val === 'object') return JSON.stringify(val)
    if (typeof val === 'boolean') return val ? 1 : 0
    return val !== undefined ? val : null
  }

  private static sanitizePersonnelFields(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(data)) {
      result[key] = this.sanitizeValue(key, val)
    }
    return result
  }

  private static sanitizeForSync(data: Record<string, unknown>): Record<string, unknown> {
    return this.sanitizePersonnelFields(data)
  }

  static create(
    person: Omit<
      Personnel,
      'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'deleted'
    >
  ) {
    const id = uuidv4()

    const filtered: Record<string, unknown> = {}
    for (const key of Object.keys(person)) {
      if (this.allowedFields.includes(key)) {
        filtered[key] = (person as Record<string, unknown>)[key]
      }
    }

    const sanitized = this.sanitizePersonnelFields(filtered)
    const fields = Object.keys(sanitized)
    const placeholders = fields.map(() => '?')
    const values = Object.values(sanitized)

    const stmt = db.prepare(`
      INSERT INTO personnel (id, ${fields.join(', ')}, created_at, updated_at, version, sync_status, deleted)
      VALUES (?, ${placeholders.join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
    `)

    const syncPerson: Record<string, unknown> = { id, ...this.sanitizeForSync(filtered) }

    const transaction = db.transaction(() => {
      stmt.run(id, ...values)
      addToSyncQueue('personnel', id, 'create', syncPerson)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create personnel error:', error)
      return { success: false, error: message }
    }
  }

  static list(
    filters: { search?: string; position?: string; status?: string; deleted?: boolean } = {}
  ) {
    let query = 'SELECT * FROM personnel WHERE deleted = 0'
    const params: unknown[] = []

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
    const person = db.prepare('SELECT * FROM personnel WHERE id = ? AND deleted = 0').get(id) as
      | Personnel
      | undefined
    if (!person) return null

    // Related queries are optional — don't fail if a sub-table has issues
    let timeTracking: TimeTracking[] = []
    let absences: PersonnelAbsence[] = []
    let advances: SalaryAdvance[] = []
    let deductions: CustomDeduction[] = []

    try {
      timeTracking = db
        .prepare(
          'SELECT * FROM time_tracking WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC'
        )
        .all(id) as TimeTracking[]
    } catch (e) {
      // Fallback if deleted column doesn't exist
      try {
        timeTracking = db
          .prepare('SELECT * FROM time_tracking WHERE personnel_id = ? ORDER BY month DESC')
          .all(id) as TimeTracking[]
      } catch {
        /* ignore */
      }
    }

    try {
      absences = db
        .prepare(
          'SELECT * FROM personnel_absences WHERE personnel_id = ? AND deleted = 0 ORDER BY start_date DESC'
        )
        .all(id) as PersonnelAbsence[]
    } catch (e) {
      try {
        absences = db
          .prepare(
            'SELECT * FROM personnel_absences WHERE personnel_id = ? ORDER BY start_date DESC'
          )
          .all(id) as PersonnelAbsence[]
      } catch {
        /* ignore */
      }
    }

    try {
      advances = db
        .prepare(
          'SELECT * FROM salary_advances WHERE personnel_id = ? AND repaid = 0 AND deleted = 0 ORDER BY advance_date DESC'
        )
        .all(id) as SalaryAdvance[]
    } catch (e) {
      try {
        advances = db
          .prepare(
            'SELECT * FROM salary_advances WHERE personnel_id = ? AND repaid = 0 ORDER BY advance_date DESC'
          )
          .all(id) as SalaryAdvance[]
      } catch {
        /* ignore */
      }
    }

    try {
      deductions = db
        .prepare(
          'SELECT * FROM custom_deductions WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC'
        )
        .all(id) as CustomDeduction[]
    } catch (e) {
      try {
        deductions = db
          .prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? ORDER BY month DESC')
          .all(id) as CustomDeduction[]
      } catch {
        /* ignore */
      }
    }

    return { person, timeTracking, absences, advances, deductions }
  }

  static update(id: string, updates: Partial<Personnel>) {
    const allowedUpdates: Record<string, unknown> = {}
    for (const key of Object.keys(updates)) {
      if (this.allowedFields.includes(key)) {
        allowedUpdates[key] = (updates as Record<string, unknown>)[key]
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return { success: false, error: 'Aucun champ valide à mettre à jour' }
    }

    const sanitized = this.sanitizePersonnelFields(allowedUpdates)
    const fields = Object.keys(sanitized)
      .map((k) => `${k} = ?`)
      .join(', ')
    const values = Object.values(sanitized)

    const stmt = db.prepare(`
      UPDATE personnel
      SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
      WHERE id = ? AND deleted = 0
    `)

    const syncUpdates: Record<string, unknown> = { id, ...this.sanitizeForSync(allowedUpdates) }

    const transaction = db.transaction(() => {
      stmt.run(...values, id)
      addToSyncQueue('personnel', id, 'update', syncUpdates)
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Update personnel error:', error)
      return { success: false, error: message }
    }
  }

  static delete(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(
        `
        UPDATE personnel
        SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
      `
      ).run(id)
      addToSyncQueue('personnel', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Delete personnel error:', error)
      return { success: false, error: message }
    }
  }

  // ============================================
  // TIME TRACKING
  // ============================================

  static setTimeTracking(
    data: Omit<TimeTracking, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
  ) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(
        `
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
      `
      ).run(
        id,
        data.personnel_id,
        data.month,
        data.hours_worked,
        data.manually_edited ? 1 : 0,
        data.edited_by || null,
        data.edit_reason || null
      )
      addToSyncQueue('time_tracking', id, 'update', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Set time tracking error:', error)
      return { success: false, error: message }
    }
  }

  static getTimeTracking(personnelId: string) {
    try {
      return db
        .prepare(
          'SELECT * FROM time_tracking WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC'
        )
        .all(personnelId) as TimeTracking[]
    } catch {
      return db
        .prepare('SELECT * FROM time_tracking WHERE personnel_id = ? ORDER BY month DESC')
        .all(personnelId) as TimeTracking[]
    }
  }

  // ============================================
  // ABSENCES
  // ============================================

  static createAbsence(
    data: Omit<PersonnelAbsence, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
  ) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO personnel_absences (id, personnel_id, start_date, end_date, reason, justified, document_path, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `
      ).run(
        id,
        data.personnel_id,
        data.start_date,
        data.end_date,
        data.reason || null,
        data.justified !== false ? 1 : 0,
        data.document_path || null
      )
      addToSyncQueue('personnel_absences', id, 'create', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create absence error:', error)
      return { success: false, error: message }
    }
  }

  static getAbsences(personnelId: string) {
    try {
      return db
        .prepare(
          'SELECT * FROM personnel_absences WHERE personnel_id = ? AND deleted = 0 ORDER BY start_date DESC'
        )
        .all(personnelId) as PersonnelAbsence[]
    } catch {
      return db
        .prepare('SELECT * FROM personnel_absences WHERE personnel_id = ? ORDER BY start_date DESC')
        .all(personnelId) as PersonnelAbsence[]
    }
  }

  static deleteAbsence(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE personnel_absences SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
      ).run(id)
      addToSyncQueue('personnel_absences', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // ============================================
  // SALARY ADVANCES
  // ============================================

  static createAdvance(
    data: Omit<SalaryAdvance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
  ) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO salary_advances (id, personnel_id, amount, advance_date, reason, repaid, repayment_date, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `
      ).run(
        id,
        data.personnel_id,
        data.amount,
        data.advance_date,
        data.reason || null,
        data.repaid ? 1 : 0,
        data.repayment_date || null
      )
      addToSyncQueue('salary_advances', id, 'create', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create advance error:', error)
      return { success: false, error: message }
    }
  }

  static getAdvances(personnelId: string) {
    try {
      return db
        .prepare(
          'SELECT * FROM salary_advances WHERE personnel_id = ? AND deleted = 0 ORDER BY advance_date DESC'
        )
        .all(personnelId) as SalaryAdvance[]
    } catch {
      return db
        .prepare('SELECT * FROM salary_advances WHERE personnel_id = ? ORDER BY advance_date DESC')
        .all(personnelId) as SalaryAdvance[]
    }
  }

  static markAdvanceRepaid(id: string, repaymentDate: string) {
    const transaction = db.transaction(() => {
      db.prepare(
        `
        UPDATE salary_advances SET repaid = 1, repayment_date = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
      `
      ).run(repaymentDate, id)
      addToSyncQueue('salary_advances', id, 'update', {
        id,
        repaid: true,
        repayment_date: repaymentDate
      })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // ============================================
  // CUSTOM DEDUCTIONS
  // ============================================

  static createDeduction(
    data: Omit<CustomDeduction, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
  ) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO custom_deductions (id, personnel_id, month, label, amount, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `
      ).run(id, data.personnel_id, data.month, data.label, data.amount)
      addToSyncQueue('custom_deductions', id, 'create', data)
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create deduction error:', error)
      return { success: false, error: message }
    }
  }

  static getDeductions(personnelId: string, month?: string) {
    if (month) {
      try {
        return db
          .prepare(
            'SELECT * FROM custom_deductions WHERE personnel_id = ? AND month = ? AND deleted = 0'
          )
          .all(personnelId, month) as CustomDeduction[]
      } catch {
        return db
          .prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? AND month = ?')
          .all(personnelId, month) as CustomDeduction[]
      }
    }
    try {
      return db
        .prepare(
          'SELECT * FROM custom_deductions WHERE personnel_id = ? AND deleted = 0 ORDER BY month DESC'
        )
        .all(personnelId) as CustomDeduction[]
    } catch {
      return db
        .prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? ORDER BY month DESC')
        .all(personnelId) as CustomDeduction[]
    }
  }

  static deleteDeduction(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE custom_deductions SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
      ).run(id)
      addToSyncQueue('custom_deductions', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // ============================================
  // DAILY ATTENDANCE
  // ============================================

  static getMonthlyAttendance(personnelId: string, year: number, month: number) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    try {
      return db
        .prepare(
          'SELECT * FROM daily_attendance WHERE personnel_id = ? AND attendance_date LIKE ? AND deleted = 0 ORDER BY attendance_date'
        )
        .all(personnelId, `${monthStr}%`) as DailyAttendance[]
    } catch {
      return db
        .prepare(
          'SELECT * FROM daily_attendance WHERE personnel_id = ? AND attendance_date LIKE ? ORDER BY attendance_date'
        )
        .all(personnelId, `${monthStr}%`) as DailyAttendance[]
    }
  }

  static getDailyAttendance(date: string) {
    try {
      return db
        .prepare('SELECT * FROM daily_attendance WHERE attendance_date = ? AND deleted = 0')
        .all(date) as DailyAttendance[]
    } catch {
      return db
        .prepare('SELECT * FROM daily_attendance WHERE attendance_date = ?')
        .all(date) as DailyAttendance[]
    }
  }

  static setBulkAttendance(
    records: Omit<DailyAttendance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>[]
  ) {
    const transaction = db.transaction(() => {
      for (const data of records) {
        let existing: { id: string } | undefined
        try {
          existing = db
            .prepare(
              'SELECT id FROM daily_attendance WHERE personnel_id = ? AND attendance_date = ? AND deleted = 0'
            )
            .get(data.personnel_id, data.attendance_date) as { id: string } | undefined
        } catch {
          existing = db
            .prepare(
              'SELECT id FROM daily_attendance WHERE personnel_id = ? AND attendance_date = ?'
            )
            .get(data.personnel_id, data.attendance_date) as { id: string } | undefined
        }

        if (existing) {
          db.prepare(
            `
            UPDATE daily_attendance
            SET status = ?, hours_worked = ?, expected_hours = ?, notes = ?, session_info = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
            WHERE id = ?
          `
          ).run(
            data.status,
            data.hours_worked,
            data.expected_hours || 0,
            data.notes || null,
            data.session_info || null,
            existing.id
          )
          addToSyncQueue('daily_attendance', existing.id, 'update', { id: existing.id, ...data })
        } else {
          const id = uuidv4()
          db.prepare(
            `
            INSERT INTO daily_attendance (id, personnel_id, attendance_date, status, hours_worked, expected_hours, notes, session_info, created_at, updated_at, version, sync_status, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
          `
          ).run(
            id,
            data.personnel_id,
            data.attendance_date,
            data.status,
            data.hours_worked,
            data.expected_hours || 0,
            data.notes || null,
            data.session_info || null
          )
          addToSyncQueue('daily_attendance', id, 'create', { id, ...data })
        }
      }
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Set bulk attendance error:', error)
      return { success: false, error: message }
    }
  }

  static setAttendance(
    data: Omit<DailyAttendance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
  ) {
    let existing: { id: string } | undefined
    try {
      existing = db
        .prepare(
          'SELECT id FROM daily_attendance WHERE personnel_id = ? AND attendance_date = ? AND deleted = 0'
        )
        .get(data.personnel_id, data.attendance_date) as { id: string } | undefined
    } catch {
      existing = db
        .prepare('SELECT id FROM daily_attendance WHERE personnel_id = ? AND attendance_date = ?')
        .get(data.personnel_id, data.attendance_date) as { id: string } | undefined
    }

    const transaction = db.transaction(() => {
      if (existing) {
        db.prepare(
          `
          UPDATE daily_attendance
          SET status = ?, hours_worked = ?, expected_hours = ?, notes = ?, session_info = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
          WHERE id = ?
        `
        ).run(
          data.status,
          data.hours_worked,
          data.expected_hours || 0,
          data.notes || null,
          data.session_info || null,
          existing.id
        )
        addToSyncQueue('daily_attendance', existing.id, 'update', { id: existing.id, ...data })
      } else {
        const id = uuidv4()
        db.prepare(
          `
          INSERT INTO daily_attendance (id, personnel_id, attendance_date, status, hours_worked, expected_hours, notes, session_info, created_at, updated_at, version, sync_status, deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
        `
        ).run(
          id,
          data.personnel_id,
          data.attendance_date,
          data.status,
          data.hours_worked,
          data.expected_hours || 0,
          data.notes || null,
          data.session_info || null
        )
        addToSyncQueue('daily_attendance', id, 'create', { id, ...data })
      }
    })

    try {
      transaction()
      return { success: true, id: existing?.id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Set attendance error:', error)
      return { success: false, error: message }
    }
  }

  static deleteAttendance(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE daily_attendance SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
      ).run(id)
      addToSyncQueue('daily_attendance', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Delete attendance error:', error)
      return { success: false, error: message }
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

    const workDays =
      person.work_days && person.work_days.length > 0
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

  static createSalaryExpense(
    personnelId: string,
    month: string,
    netAmount: number,
    description?: string
  ) {
    const id = uuidv4()
    const transactionDate = new Date().toISOString().split('T')[0]
    const desc = description || `Fiche de paie - ${month}`

    let department = 'ecole'
    try {
      const person = db.prepare('SELECT position FROM personnel WHERE id = ?').get(personnelId) as
        | { position: string }
        | undefined
      if (person && person.position === 'chauffeur') {
        department = 'bus'
      }
    } catch (e) {
      // Ignorer l'erreur et garder 'ecole' par défaut
    }

    const transaction = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO cash_journal (id, transaction_date, type, department, category, amount, description, related_personnel_id, created_at, updated_at, version, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
      `
      ).run(id, transactionDate, 'expense', department, 'salaire', netAmount, desc, personnelId)
      addToSyncQueue('cash_journal', id, 'create', {
        id,
        transaction_date: transactionDate,
        type: 'expense',
        department,
        category: 'salaire',
        amount: netAmount,
        description: desc,
        related_personnel_id: personnelId
      })
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create salary expense error:', error)
      return { success: false, error: message }
    }
  }

  // ============================================
  // SALARY CALCULATION
  // ============================================

  static calculateSalary(personnelId: string, month: string): SalaryCalculation | null {
    const person = db
      .prepare('SELECT * FROM personnel WHERE id = ? AND deleted = 0')
      .get(personnelId) as Personnel | undefined
    if (!person) return null

    const [year, mon] = month.split('-').map(Number)
    const monthStart = `${month}-01`
    const monthEndDate = new Date(year, mon, 0)
    const monthEnd = `${month}-${String(monthEndDate.getDate()).padStart(2, '0')}`

    // Daily attendance for the month
    const attendance = db
      .prepare(
        'SELECT * FROM daily_attendance WHERE personnel_id = ? AND attendance_date >= ? AND attendance_date <= ? ORDER BY attendance_date'
      )
      .all(personnelId, monthStart, monthEnd) as DailyAttendance[]

    const totalHoursWorked = attendance.reduce((sum, a) => {
      // paid_leave counts as expected_hours (no deduction)
      if (a.status === 'paid_leave') {
        return sum + (a.expected_hours || person.daily_hours || 8)
      }
      return sum + (a.hours_worked || 0)
    }, 0)

    // Informational absences (for display only — salary is based on actual hours)
    const absences = db
      .prepare(
        'SELECT * FROM personnel_absences WHERE personnel_id = ? AND start_date <= ? AND end_date >= ?'
      )
      .all(personnelId, monthEnd, monthStart) as PersonnelAbsence[]

    const advances = db
      .prepare('SELECT * FROM salary_advances WHERE personnel_id = ? AND repaid = 0')
      .all(personnelId) as SalaryAdvance[]
    const deductions = db
      .prepare('SELECT * FROM custom_deductions WHERE personnel_id = ? AND month = ?')
      .all(personnelId, month) as CustomDeduction[]

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
      // Hourly: Calendar hours by default, but manual tracking overrides if set
      const tracking = db
        .prepare('SELECT * FROM time_tracking WHERE personnel_id = ? AND month = ?')
        .get(personnelId, month) as TimeTracking | undefined

      if (tracking && tracking.manually_edited) {
        hoursWorked = tracking.hours_worked
      } else {
        hoursWorked = totalHoursWorked
      }

      baseSalary = hoursWorked * person.hourly_rate
      grossSalary = baseSalary
      hourlyEquivalentRate = person.hourly_rate
    } else if (person.salary_type === 'monthly' && person.monthly_salary) {
      // Monthly: Exception-based calculation. Full salary minus explicitly recorded missing hours.
      baseSalary = person.monthly_salary
      expectedHours = this.getExpectedHoursForMonth(year, mon, person)
      hourlyEquivalentRate = expectedHours > 0 ? person.monthly_salary / expectedHours : 0

      let totalAbsentHours = 0
      let totalOvertimeHours = 0
      for (const a of attendance) {
        const expectedForDay = a.expected_hours || person.daily_hours || 8
        const workedForDay = a.status === 'paid_leave' ? expectedForDay : a.hours_worked || 0
        if (workedForDay < expectedForDay) {
          totalAbsentHours += expectedForDay - workedForDay
        } else if (workedForDay > expectedForDay) {
          totalOvertimeHours += workedForDay - expectedForDay
        }
      }

      hoursWorked = Math.max(0, expectedHours - totalAbsentHours + totalOvertimeHours)
      absencesDeduction = totalAbsentHours * hourlyEquivalentRate
      overtimePay = totalOvertimeHours * hourlyEquivalentRate

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
        const days = Math.max(
          1,
          Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        )
        totalAbsenceDays += days
      }
    }

    grossSalary = Math.max(0, grossSalary)

    // CNAPS (retraite)
    let cnapsDeduction = 0
    if (person.cnaps_amount !== undefined && person.cnaps_amount !== null) {
      cnapsDeduction = person.cnaps_amount
    } else {
      const cnapsRate = person.cnaps_rate || 0.01
      cnapsDeduction = grossSalary * cnapsRate
    }

    // IRSA (impôt revenu)
    let irsaDeduction = 0
    if (person.irsa_amount !== undefined && person.irsa_amount !== null) {
      irsaDeduction = person.irsa_amount
    } else {
      const irsaRate = person.irsa_rate || 0.01
      irsaDeduction = grossSalary * irsaRate
    }

    // Droit (if applicable)
    const droitDeduction = person.has_droit && person.droit_amount ? person.droit_amount : 0

    // Advances
    const advancesTotal = advances.reduce((sum, a) => sum + a.amount, 0)

    // Custom deductions
    const customDeductionsTotal = deductions.reduce((sum, d) => sum + d.amount, 0)

    const netSalary = Math.max(
      0,
      grossSalary -
        cnapsDeduction -
        irsaDeduction -
        droitDeduction -
        advancesTotal -
        customDeductionsTotal
    )

    let isPaid = false
    try {
      // Vérifier si un paiement a déjà été effectué dans le cash_journal pour ce mois et ce personnel
      const expense = db
        .prepare(
          `
        SELECT id FROM cash_journal 
        WHERE related_personnel_id = ? AND category = 'salaire' AND description LIKE ? AND deleted = 0
      `
        )
        .get(personnelId, `%${month}%`)
      if (expense) {
        isPaid = true
      }
    } catch (e) {
      // Ignorer si l'historique cash_journal est indisponible
    }

    return {
      grossSalary,
      cnapsDeduction,
      irsaDeduction,
      droitDeduction,
      advancesTotal,
      customDeductionsTotal,
      netSalary,
      isPaid,
      details: {
        baseSalary,
        hoursWorked: hoursWorked !== null ? hoursWorked : undefined,
        expectedHours: expectedHours !== null ? expectedHours : undefined,
        hourlyRate: person.hourly_rate || undefined,
        hourlyEquivalentRate: hourlyEquivalentRate !== null ? hourlyEquivalentRate : undefined,
        absencesDeduction: absencesDeduction !== null ? absencesDeduction : undefined,
        overtimePay: overtimePay !== null ? overtimePay : undefined,
        totalAbsenceDays: totalAbsenceDays !== null ? totalAbsenceDays : undefined
      }
    }
  }
}
