/**
 * cashjournal.repository.ts — Cash Journal Data Access Layer
 *
 * Provides CRUD operations and balance queries for the cash_journal table.
 * Departments: 'bus' (transport) | 'ecole' (school)
 * Types: 'income' (recette) | 'expense' (dépense)
 *
 * @module CashJournalRepository
 */

import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'

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

import type {
  CashJournalFilters,
  CashierDailySummary,
  CashClosure,
  CashClosureInput
} from '../../../shared/types'

export class CashJournalRepository {
  static create(entry: Omit<CashJournalEntry, 'id' | 'created_at' | 'updated_at'>) {
    const id = uuidv4()
    try {
      db.prepare(
        `
        INSERT INTO cash_journal (
          id, transaction_date, type, department, category, subcategory,
          amount, description, payment_method,
          related_student_id, related_personnel_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        entry.transaction_date,
        entry.type,
        entry.department || 'ecole',
        entry.category,
        entry.subcategory || null,
        entry.amount,
        entry.description || null,
        entry.payment_method || 'cash',
        entry.related_student_id || null,
        entry.related_personnel_id || null,
        (entry as any).created_by || null
      )

      addToSyncQueue('cash_journal', id, 'create', {
        ...entry,
        id,
        created_by: (entry as any).created_by || null
      })
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: message }
    }
  }

  static list(filters: CashJournalFilters = {}) {
    let query = ''
    if (filters.schoolYear) {
      query = `
        SELECT cj.*, 
          s.first_name, 
          s.last_name, 
          s.registration_number,
          COALESCE(cj.receipt_number, sp.receipt_number) as receipt_number,
          COALESCE(cj.print_count, sp.print_count, 0) as print_count,
          COALESCE(cj.last_printed_at, sp.last_printed_at) as last_printed_at,
          COALESCE(cj.last_printed_by, sp.last_printed_by) as last_printed_by,
          COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, '')) as created_by,
          COALESCE(
            CASE WHEN s.departure_date IS NOT NULL THEN 'Quitté le ' || strftime('%d/%m/%Y', s.departure_date) ELSE NULL END,
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND sf.school_year = ? AND sf.class_name IS NOT NULL AND sf.class_name != ''),
            (SELECT 
               CASE 
                 WHEN school_year > ? THEN 'Pré-inscrit (' || class_name || ' en ' || school_year || ')'
                 ELSE 'Ancien (' || class_name || ' en ' || school_year || ')'
               END
             FROM student_fees sf
             WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
             ORDER BY school_year DESC LIMIT 1),
            'Non inscrit'
          ) as student_class
        FROM cash_journal cj
        LEFT JOIN students s ON cj.related_student_id = s.id
        LEFT JOIN student_payments sp ON (
          (cj.related_payment_id IS NOT NULL AND sp.id = cj.related_payment_id)
          OR (cj.related_payment_id IS NULL AND cj.related_student_id IS NOT NULL AND sp.student_id = cj.related_student_id AND sp.payment_date = cj.transaction_date AND sp.amount = cj.amount AND sp.deleted = 0)
        )
        WHERE cj.deleted = 0
      `
    } else {
      query = `
        SELECT cj.*, 
          s.first_name, 
          s.last_name, 
          s.registration_number,
          COALESCE(cj.receipt_number, sp.receipt_number) as receipt_number,
          COALESCE(cj.print_count, sp.print_count, 0) as print_count,
          COALESCE(cj.last_printed_at, sp.last_printed_at) as last_printed_at,
          COALESCE(cj.last_printed_by, sp.last_printed_by) as last_printed_by,
          COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, '')) as created_by,
          COALESCE(
            CASE WHEN s.departure_date IS NOT NULL THEN 'Quitté le ' || strftime('%d/%m/%Y', s.departure_date) ELSE NULL END,
            NULLIF(s.class, 'Classe non spécifiée'),
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
             ORDER BY sf.school_year DESC LIMIT 1),
            'Non inscrit'
          ) as student_class
        FROM cash_journal cj
        LEFT JOIN students s ON cj.related_student_id = s.id
        LEFT JOIN student_payments sp ON (
          (cj.related_payment_id IS NOT NULL AND sp.id = cj.related_payment_id)
          OR (cj.related_payment_id IS NULL AND cj.related_student_id IS NOT NULL AND sp.student_id = cj.related_student_id AND sp.payment_date = cj.transaction_date AND sp.amount = cj.amount AND sp.deleted = 0)
        )
        WHERE cj.deleted = 0
      `
    }
    const params: (string | number)[] = filters.schoolYear
      ? [filters.schoolYear, filters.schoolYear]
      : []

    if (filters.startDate) {
      query += ' AND date(cj.transaction_date) >= ?'
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      query += ' AND date(cj.transaction_date) <= ?'
      params.push(filters.endDate)
    }
    if (filters.type && filters.type !== 'all') {
      query += ' AND cj.type = ?'
      params.push(filters.type)
    }
    if (filters.department && filters.department !== 'all') {
      if (filters.department === 'eleve') {
        query += ' AND (cj.department = "eleve" OR (cj.department = "bus" AND cj.related_student_id IS NOT NULL))'
      } else if (filters.department === 'bus') {
        query += ' AND cj.department = "bus" AND cj.related_student_id IS NULL'
      } else {
        query += ' AND cj.department = ?'
        params.push(filters.department)
      }
    }
    if (filters.category && filters.category !== 'all') {
      const cats = filters.category
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c)
      if (cats.length === 1) {
        query += ' AND cj.category = ?'
        params.push(cats[0])
      } else if (cats.length > 1) {
        query += ` AND cj.category IN (${cats.map(() => '?').join(',')})`
        params.push(...cats)
      }
    }
    if (filters.createdBy && filters.createdBy !== 'all') {
      query += ' AND COALESCE(cj.created_by, sp.created_by, "admin") = ?'
      params.push(filters.createdBy)
    }
    if (filters.stationCode && filters.stationCode !== 'all') {
      query += ' AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ?)'
      params.push(`%-${filters.stationCode}-%`)
    }
    if (filters.search) {
      query +=
        ' AND (LOWER(cj.description) LIKE ? OR LOWER(cj.category) LIKE ? OR LOWER(s.first_name) LIKE ? OR LOWER(s.last_name) LIKE ?)'
      const s = `%${filters.search.toLowerCase()}%`
      params.push(s, s, s, s)
    }

    query += ' ORDER BY cj.transaction_date DESC, cj.created_at DESC'

    return db.prepare(query).all(...params)
  }

  static getById(id: string) {
    return db.prepare('SELECT * FROM cash_journal WHERE id = ? AND deleted = 0').get(id)
  }

  static update(id: string, updates: Partial<CashJournalEntry>) {
    const fields: string[] = []
    const values: (string | number | null)[] = []

    if (updates.transaction_date !== undefined) {
      fields.push('transaction_date = ?')
      values.push(updates.transaction_date)
    }
    if (updates.type !== undefined) {
      fields.push('type = ?')
      values.push(updates.type)
    }
    if (updates.department !== undefined) {
      fields.push('department = ?')
      values.push(updates.department)
    }
    if (updates.category !== undefined) {
      fields.push('category = ?')
      values.push(updates.category)
    }
    if (updates.subcategory !== undefined) {
      fields.push('subcategory = ?')
      values.push(updates.subcategory)
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?')
      values.push(updates.amount)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.payment_method !== undefined) {
      fields.push('payment_method = ?')
      values.push(updates.payment_method)
    }

    if (fields.length === 0) return { success: false, error: 'Aucun champ à modifier' }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    fields.push("sync_status = 'pending'")
    values.push(id)

    try {
      const result = db
        .prepare(`UPDATE cash_journal SET ${fields.join(', ')} WHERE id = ? AND deleted = 0`)
        .run(...values)
      if (result.changes === 0) return { success: false, error: 'Entrée non trouvée' }
      addToSyncQueue('cash_journal', id, 'update', updates)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: message }
    }
  }

  static delete(id: string) {
    try {
      const result = db
        .prepare(
          `
        UPDATE cash_journal SET deleted = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted = 0
      `
        )
        .run(id)
      if (result.changes === 0) return { success: false, error: 'Entrée non trouvée' }
      addToSyncQueue('cash_journal', id, 'delete', { id })
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: message }
    }
  }

  static getDailyBalance(date: string) {
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM cash_journal
      WHERE transaction_date = ? AND deleted = 0
    `
      )
      .get(date) as { total_income: number; total_expense: number; balance: number }

    return result
  }

  static getMonthlyBalance(year: number, month: number) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM cash_journal
      WHERE transaction_date LIKE ? AND deleted = 0
    `
      )
      .get(`${monthStr}%`) as { total_income: number; total_expense: number; balance: number }

    return result
  }

  static getBalanceSummary(startDate: string, endDate: string) {
    return db
      .prepare(
        `
      SELECT
        department,
        type,
        category,
        COUNT(*) as entry_count,
        SUM(amount) as total
      FROM cash_journal
      WHERE transaction_date >= ? AND transaction_date <= ? AND deleted = 0
      GROUP BY department, type, category
      ORDER BY department, type, total DESC
    `
      )
      .all(startDate, endDate)
  }

  static getTotalBalance() {
    const result = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
      FROM cash_journal
      WHERE deleted = 0
    `
      )
      .get() as { total_income: number; total_expense: number; balance: number }

    return result
  }

  // --------------------------------------------
  // Avenant N°3 — Rapprochement & Z de Caisse
  // --------------------------------------------

  /**
   * Retrieves list of all distinct operators/cashiers from canonical active users
   */
  static getDistinctCashiers(): string[] {
    try {
      const rows = db
        .prepare(
          `SELECT username as cashier FROM users WHERE active = 1 AND deleted = 0 ORDER BY username ASC`
        )
        .all() as { cashier: string }[]

      return rows.map((r) => r.cashier).filter(Boolean)
    } catch {
      return ['admin']
    }
  }

  /**
   * Calculates real-time cashier daily statistics & checks breakdown for reconciliation
   */
  static getCashierDailySummary(
    date: string,
    cashier?: string,
    stationCode?: string
  ): CashierDailySummary {
    let whereClause = "WHERE cj.deleted = 0 AND date(cj.transaction_date) = ? AND cj.type = 'income'"
    const params: (string | number)[] = [date]

    if (cashier && cashier !== 'all') {
      whereClause += ' AND COALESCE(cj.created_by, sp.created_by, "admin") = ?'
      params.push(cashier)
    }

    if (stationCode && stationCode !== 'all') {
      whereClause += ' AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ?)'
      params.push(`%-${stationCode}-%`)
    }

    const rows = db
      .prepare(
        `
      SELECT 
        cj.*,
        COALESCE(cj.receipt_number, sp.receipt_number) as receipt_num,
        COALESCE(cj.payment_method, sp.payment_method, 'cash') as method,
        s.first_name,
        s.last_name
      FROM cash_journal cj
      LEFT JOIN students s ON cj.related_student_id = s.id
      LEFT JOIN student_payments sp ON (
        (cj.related_payment_id IS NOT NULL AND sp.id = cj.related_payment_id)
        OR (cj.related_payment_id IS NULL AND cj.related_student_id IS NOT NULL AND sp.student_id = cj.related_student_id AND sp.payment_date = cj.transaction_date AND sp.amount = cj.amount AND sp.deleted = 0)
      )
      ${whereClause}
      ORDER BY cj.created_at ASC
    `
      )
      .all(...params) as any[]

    let expectedCash = 0
    let expectedCheck = 0
    let expectedMobile = 0
    let expectedTransfer = 0
    let expectedTotal = 0
    const receiptNumbers: string[] = []
    const checks: Array<{
      amount: number
      description?: string
      student_name?: string
      receipt_number?: string
    }> = []

    for (const r of rows) {
      const amt = Number(r.amount) || 0
      expectedTotal += amt
      const m = (r.method || 'cash').toLowerCase()
      if (m === 'check' || m === 'cheque') {
        expectedCheck += amt
        checks.push({
          amount: amt,
          description: r.description,
          student_name: r.first_name ? `${r.last_name} ${r.first_name}` : undefined,
          receipt_number: r.receipt_num
        })
      } else if (
        m === 'mobile_money' ||
        m === 'mvola' ||
        m === 'orange_money' ||
        m === 'airtel_money'
      ) {
        expectedMobile += amt
      } else if (m === 'transfer' || m === 'virement') {
        expectedTransfer += amt
      } else {
        expectedCash += amt
      }

      if (r.receipt_num) {
        receiptNumbers.push(r.receipt_num)
      }
    }

    const totalTickets = rows.length
    const averageBasket = totalTickets > 0 ? Math.round(expectedTotal / totalTickets) : 0
    const sortedReceipts = [...receiptNumbers].sort()

    return {
      date,
      cashier: cashier || 'all',
      station_code: stationCode || 'C1',
      total_tickets: totalTickets,
      expected_cash: expectedCash,
      expected_check: expectedCheck,
      expected_mobile: expectedMobile,
      expected_transfer: expectedTransfer,
      expected_total: expectedTotal,
      average_basket: averageBasket,
      first_receipt: sortedReceipts.length > 0 ? sortedReceipts[0] : undefined,
      last_receipt:
        sortedReceipts.length > 0 ? sortedReceipts[sortedReceipts.length - 1] : undefined,
      checks
    }
  }

  /**
   * Persists a cash closure record with billetage and accounting lock
   */
  static createClosure(input: CashClosureInput): {
    success: boolean
    id?: string
    error?: string
  } {
    const id = uuidv4()
    try {
      const breakdownStr = JSON.stringify(input.counted_breakdown)
      const status = input.cash_difference === 0 ? 'closed' : 'discrepancy'

      db.prepare(
        `
        INSERT INTO cash_closures (
          id, closure_date, closure_datetime, cashier_username, station_code,
          total_tickets, expected_cash, expected_check, expected_mobile, expected_transfer, expected_total,
          counted_cash, counted_breakdown, cash_difference, status, notes, is_locked
        ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `
      ).run(
        id,
        input.closure_date,
        input.cashier_username,
        input.station_code,
        input.total_tickets,
        input.expected_cash,
        input.expected_check,
        input.expected_mobile,
        input.expected_transfer,
        input.expected_total,
        input.counted_cash,
        breakdownStr,
        input.cash_difference,
        status,
        input.notes || null
      )

      addToSyncQueue('cash_closures', id, 'create', {
        id,
        closure_date: input.closure_date,
        cashier_username: input.cashier_username,
        station_code: input.station_code,
        total_tickets: input.total_tickets,
        expected_cash: input.expected_cash,
        expected_check: input.expected_check,
        expected_mobile: input.expected_mobile,
        expected_transfer: input.expected_transfer,
        expected_total: input.expected_total,
        counted_cash: input.counted_cash,
        counted_breakdown: breakdownStr,
        cash_difference: input.cash_difference,
        status,
        notes: input.notes || null,
        is_locked: 1
      })

      return { success: true, id }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Retrieves closure record for a specific date and cashier
   */
  static getClosure(date: string, cashier?: string): CashClosure | null {
    try {
      let query = 'SELECT * FROM cash_closures WHERE closure_date = ?'
      const params: string[] = [date]
      if (cashier && cashier !== 'all') {
        query += ' AND cashier_username = ?'
        params.push(cashier)
      }
      query += ' ORDER BY closure_datetime DESC LIMIT 1'
      const row = db.prepare(query).get(...params) as CashClosure | undefined
      return row || null
    } catch {
      return null
    }
  }

  /**
   * Lists past cash closures
   */
  static listClosures(schoolYear?: string): CashClosure[] {
    try {
      let query = 'SELECT * FROM cash_closures'
      const params: string[] = []
      if (schoolYear) {
        const [startYear] = schoolYear.split('-')
        query += ' WHERE closure_date >= ?'
        params.push(`${startYear}-08-01`)
      }
      query += ' ORDER BY closure_date DESC, closure_datetime DESC'
      return db.prepare(query).all(...params) as CashClosure[]
    } catch {
      return []
    }
  }
}
