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

export interface CashJournalFilters {
  startDate?: string
  endDate?: string
  type?: string
  department?: string
  category?: string
  search?: string
  schoolYear?: string
}

export class CashJournalRepository {
  static create(entry: Omit<CashJournalEntry, 'id' | 'created_at' | 'updated_at'>) {
    const id = uuidv4()
    try {
      db.prepare(
        `
        INSERT INTO cash_journal (
          id, transaction_date, type, department, category, subcategory,
          amount, description, payment_method,
          related_student_id, related_personnel_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        entry.related_personnel_id || null
      )

      addToSyncQueue('cash_journal', id, 'create', { ...entry, id })
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
        SELECT cj.*, s.first_name, s.last_name, 
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
        WHERE cj.deleted = 0
      `
    } else {
      query = `
        SELECT cj.*, s.first_name, s.last_name, 
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
        WHERE cj.deleted = 0
      `
    }
    const params: (string | number)[] = filters.schoolYear ? [filters.schoolYear, filters.schoolYear] : []

    if (filters.startDate) {
      query += ' AND cj.transaction_date >= ?'
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      query += ' AND cj.transaction_date <= ?'
      params.push(filters.endDate)
    }
    if (filters.type && filters.type !== 'all') {
      query += ' AND cj.type = ?'
      params.push(filters.type)
    }
    if (filters.department && filters.department !== 'all') {
      query += ' AND cj.department = ?'
      params.push(filters.department)
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
}
