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
import { normalizeStationCode, PaymentRepository } from './payment.repository'
import { SettingsRepository } from './settings.repository'

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
  CashClosureInput,
  CashierOption
} from '../../../shared/types'

/**
 * Resolves all identity aliases for an operator/cashier
 * (e.g. username 'admin' <-> 'Administrateur', 'aina-secretaire' <-> 'Nyaina Randrianarisoa')
 */
export function getCashierAliases(cashierIdentifier: string): string[] {
  if (!cashierIdentifier || cashierIdentifier === 'all') return []
  const rawTrimmed = cashierIdentifier.trim()
  const lower = rawTrimmed.toLowerCase()
  const aliases = new Set<string>([rawTrimmed])

  if (lower === 'admin' || lower === 'administrateur') {
    aliases.add('admin')
    aliases.add('Administrateur')
  }

  // Cross-reference canonical users table
  try {
    const user = db
      .prepare(
        `SELECT username, full_name FROM users 
         WHERE LOWER(TRIM(username)) = LOWER(TRIM(?)) OR LOWER(TRIM(full_name)) = LOWER(TRIM(?))`
      )
      .get(rawTrimmed, rawTrimmed) as
      | { username?: string; full_name?: string }
      | undefined

    if (user) {
      if (user.username && user.username.trim()) aliases.add(user.username.trim())
      if (user.full_name && user.full_name.trim()) aliases.add(user.full_name.trim())
    }
  } catch {
    // ignore
  }

  // Historical / merged account resolution
  if (lower.includes('dinah')) {
    aliases.add('dinah')
    aliases.add('dinah-secretaire')
    aliases.add('rakotoarivony dinah')
    aliases.add('RAkotoarivony Dinah Archelle')
    aliases.add('dinah-compta')
  } else if (lower.includes('aina') || lower.includes('nyaina')) {
    aliases.add('aina-secretaire')
    aliases.add('aina-compta')
    aliases.add('aina-secetaire')
    aliases.add('Nyaina Randrianarisoa')
    aliases.add('Nyaina')
  } else if (lower.includes('anjara') || lower.includes('razafinteseheno') || lower.includes('directrice')) {
    aliases.add('Anjara')
    aliases.add('Razafinteseheno')
    aliases.add('Directrice')
    aliases.add('R')
  } else if (lower.includes('econome')) {
    aliases.add('Econome')
    aliases.add('econome')
  }

  return Array.from(aliases).map((a) => a.trim()).filter(Boolean)
}

/**
 * Extracts official Ticket Z number from notes (e.g., "[Z-2026-C1-00045] Notes text")
 * or falls back deterministically to Z-YYYY-C<station>-<id_slice>
 */
export function parseClosureNumber(
  notes: string | null | undefined,
  fallback: { year: string; station: string; id: string }
): { closureNumber: string; cleanNotes?: string } {
  if (notes) {
    const match = notes.match(/^\[(Z-\d{4}-[A-Z0-9]+-\d{5}|Z-\d{4}-\d{5})\]\s*(.*)$/s)
    if (match) {
      return { closureNumber: match[1], cleanNotes: match[2].trim() || undefined }
    }
  }
  const cleanStation = normalizeStationCode(fallback.station)
  const idSuffix = fallback.id ? fallback.id.replace(/-/g, '').slice(0, 5).toUpperCase() : '00001'
  return {
    closureNumber: `Z-${fallback.year}-${cleanStation}-${idSuffix}`,
    cleanNotes: notes || undefined
  }
}

export class CashJournalRepository {
  static create(
    entry: Omit<CashJournalEntry, 'id' | 'created_at' | 'updated_at'> & {
      allow_post_closure_override?: boolean
      receipt_number?: string
      station_code?: string
    }
  ) {
    const rawStation = entry.station_code || (SettingsRepository.get('pos_station_code') as string)
    const currentStation = normalizeStationCode(rawStation)

    // Strict post-closure lock check
    const closure = db
      .prepare(
        `
      SELECT id, station_code, notes FROM cash_closures
      WHERE closure_date = ? 
        AND (station_code = ? OR station_code = 'CONSOLIDÉ')
        AND is_locked = 1
      LIMIT 1
    `
      )
      .get(entry.transaction_date, currentStation) as
      | { id: string; station_code: string; notes?: string }
      | undefined

    if (closure && !entry.allow_post_closure_override) {
      const zMatch = closure.notes ? closure.notes.match(/\[(Z-[^\]]+)\]/) : null
      const zLabel = zMatch ? zMatch[1] : `Z-${closure.station_code}`
      return {
        success: false,
        error: `La caisse du poste ${currentStation} est clôturée et scellée pour le ${entry.transaction_date} (${zLabel}). Saisie verrouillée. Déverrouillage Direction requis.`
      }
    }

    let receiptNumber = entry.receipt_number || null
    if (entry.type === 'income' && !receiptNumber) {
      receiptNumber = PaymentRepository.generateReceiptNumber(undefined, currentStation)
    }

    const id = uuidv4()
    try {
      db.prepare(
        `
        INSERT INTO cash_journal (
          id, transaction_date, type, department, category, subcategory,
          amount, description, payment_method,
          related_student_id, related_personnel_id, created_by, receipt_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        (entry as any).created_by || null,
        receiptNumber
      )

      addToSyncQueue('cash_journal', id, 'create', {
        ...entry,
        id,
        created_by: (entry as any).created_by || null,
        receipt_number: receiptNumber
      })
      return { success: true, id, receipt_number: receiptNumber || undefined }
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
             WHERE sf.student_id = s.id AND sf.school_year = ? AND sf.class_name IS NOT NULL AND sf.class_name != '' LIMIT 1),
            NULLIF(s.class, 'Classe non spécifiée'),
            'Non inscrit'
          ) as student_class
        FROM cash_journal cj
        LEFT JOIN students s ON cj.related_student_id = s.id
        LEFT JOIN student_payments sp ON cj.related_payment_id = sp.id
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
        LEFT JOIN student_payments sp ON cj.related_payment_id = sp.id
        WHERE cj.deleted = 0
      `
    }
    const params: (string | number)[] = filters.schoolYear
      ? [filters.schoolYear]
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
        query += " AND (cj.department = 'eleve' OR (cj.department = 'bus' AND cj.related_student_id IS NOT NULL))"
      } else if (filters.department === 'bus') {
        query += " AND cj.department = 'bus' AND cj.related_student_id IS NULL"
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
      if (cats.length > 0) {
        const allVariants: string[] = []
        for (const cat of cats) {
          allVariants.push(cat)
          const unaccented = cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          if (unaccented !== cat) allVariants.push(unaccented)
          if (cat.toLowerCase() === 'ecolage') allVariants.push('écolage')
          if (cat.toLowerCase() === 'reinscription') allVariants.push('réinscription')
          if (cat.toLowerCase() === 'evenement') allVariants.push('événement')
        }
        const uniqueVariants = Array.from(new Set(allVariants))
        query += ` AND LOWER(cj.category) IN (${uniqueVariants.map(() => 'LOWER(?)').join(',')})`
        params.push(...uniqueVariants)
      }
    }
    if (filters.createdBy && filters.createdBy !== 'all') {
      const aliases = getCashierAliases(filters.createdBy)
      if (aliases.length > 0) {
        query += ` AND TRIM(LOWER(COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, ''), 'admin'))) IN (${aliases.map(() => 'TRIM(LOWER(?))').join(',')})`
        params.push(...aliases)
      }
    }
    if (filters.stationCode && filters.stationCode !== 'all') {
      if (filters.stationCode.toUpperCase() === 'C1') {
        query += " AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ? OR (COALESCE(cj.receipt_number, sp.receipt_number) LIKE 'REC-%' AND COALESCE(cj.receipt_number, sp.receipt_number) NOT LIKE 'REC-%-%-%'))"
        params.push(`%-C1-%`)
      } else {
        query += ' AND (COALESCE(cj.receipt_number, sp.receipt_number) LIKE ?)'
        params.push(`%-${filters.stationCode}-%`)
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

  // --------------------------------------------
  // Avenant N°3 — Rapprochement & Z de Caisse
  // --------------------------------------------

  /**
   * Retrieves list of all distinct operators/cashiers from canonical active users
   * perfectly matching the user management directory.
   */
  static getDistinctCashiers(): CashierOption[] {
    try {
      const users = db
        .prepare(
          `SELECT username, full_name, role FROM users WHERE active = 1 AND deleted = 0 ORDER BY 
            CASE role 
              WHEN 'admin' THEN 1 
              WHEN 'direction' THEN 2 
              WHEN 'accounting' THEN 3 
              WHEN 'secretariat' THEN 4 
              ELSE 5 
            END, username ASC`
        )
        .all() as { username: string; full_name?: string; role?: string }[]

      return users.map((u) => {
        const cleanFull = u.full_name ? u.full_name.trim() : ''
        const cleanUser = u.username.trim()
        const displayName =
          cleanFull && cleanFull.toLowerCase() !== cleanUser.toLowerCase()
            ? `${cleanFull} (${cleanUser})`
            : cleanUser
        return {
          username: cleanUser,
          fullName: cleanFull,
          role: u.role || 'user',
          displayName
        }
      })
    } catch {
      return [
        {
          username: 'admin',
          fullName: 'Administrateur',
          role: 'admin',
          displayName: 'Administrateur (admin)'
        }
      ]
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
    let whereClause = "WHERE cj.deleted = 0 AND date(cj.transaction_date) = ?"
    const params: (string | number)[] = [date]

    if (cashier && cashier !== 'all') {
      const aliases = getCashierAliases(cashier)
      if (aliases.length > 0) {
        whereClause += ` AND TRIM(LOWER(COALESCE(NULLIF(cj.created_by, ''), NULLIF(sp.created_by, ''), 'admin'))) IN (${aliases.map(() => 'TRIM(LOWER(?))').join(',')})`
        params.push(...aliases)
      }
    }

    if (stationCode && stationCode !== 'all') {
      const cleanStation = normalizeStationCode(stationCode)
      if (cleanStation === 'C1') {
        whereClause += ` AND (
          COALESCE(cj.receipt_number, sp.receipt_number) LIKE ? 
          OR (COALESCE(cj.receipt_number, sp.receipt_number) LIKE 'REC-%' AND COALESCE(cj.receipt_number, sp.receipt_number) NOT LIKE 'REC-%-%-%')
          OR (COALESCE(cj.receipt_number, sp.receipt_number) IS NULL)
        )`
        params.push(`%-C1-%`)
      } else {
        whereClause += ` AND (
          COALESCE(cj.receipt_number, sp.receipt_number) LIKE ?
          OR (COALESCE(cj.receipt_number, sp.receipt_number) IS NULL)
        )`
        params.push(`%-${cleanStation}-%`)
      }
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

    let expectedCashIncome = 0
    let expectedCashExpense = 0
    let expectedIncome = 0
    let expectedExpenses = 0
    let expectedCheck = 0
    let expectedMobile = 0
    let expectedTransfer = 0
    const receiptNumbers: string[] = []
    const checks: Array<{
      amount: number
      description?: string
      student_name?: string
      receipt_number?: string
    }> = []

    let ticketCount = 0

    for (const r of rows) {
      const amt = Number(r.amount) || 0
      const isExpense = r.type === 'expense'
      const m = (r.method || 'cash').toLowerCase()

      if (isExpense) {
        expectedExpenses += amt
        if (m === 'cash' || !m) {
          expectedCashExpense += amt
        }
      } else {
        ticketCount++
        expectedIncome += amt
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
          expectedCashIncome += amt
        }

        if (r.receipt_num) {
          receiptNumbers.push(r.receipt_num)
        }
      }
    }

    const netCash = expectedCashIncome - expectedCashExpense
    const expectedTotal = expectedIncome - expectedExpenses
    const totalTickets = ticketCount
    const averageBasket = totalTickets > 0 ? Math.round(expectedIncome / totalTickets) : 0
    const sortedReceipts = [...receiptNumbers].sort()

    return {
      date,
      cashier: cashier || 'all',
      station_code: stationCode || 'C1',
      total_tickets: totalTickets,
      expected_cash: netCash,
      expected_cash_income: expectedCashIncome,
      expected_cash_expense: expectedCashExpense,
      expected_expenses: expectedExpenses,
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
   * Generates sequential official Ticket Z number: Z-YYYY-C<station>-XXXXX
   */
  static generateClosureNumber(stationCode?: string, closureDate?: string): string {
    const year = closureDate ? closureDate.substring(0, 4) : new Date().getFullYear().toString()
    const cleanStation = normalizeStationCode(stationCode)

    try {
      // Find highest sequence number for this station and year
      const prefix = `[Z-${year}-${cleanStation}-`
      const maxRows = db
        .prepare(
          `
        SELECT notes FROM cash_closures 
        WHERE notes LIKE ?
        ORDER BY closure_datetime DESC
      `
        )
        .all(`${prefix}%`) as { notes?: string }[]

      let maxSeq = 0
      for (const r of maxRows) {
        if (!r.notes) continue
        const m = r.notes.match(new RegExp(`\\[Z-${year}-${cleanStation}-(\\d{5})\\]`))
        if (m) {
          const num = parseInt(m[1], 10)
          if (num > maxSeq) maxSeq = num
        }
      }

      // If no tag found, also check total count for that station & year as base
      if (maxSeq === 0) {
        const countRow = db
          .prepare(
            `
          SELECT COUNT(*) as cnt FROM cash_closures
          WHERE closure_date LIKE ? AND (station_code = ? OR station_code = ?)
        `
          )
          .get(`${year}%`, cleanStation, stationCode || cleanStation) as { cnt: number } | undefined
        maxSeq = countRow?.cnt || 0
      }

      const nextNum = (maxSeq + 1).toString().padStart(5, '0')
      return `Z-${year}-${cleanStation}-${nextNum}`
    } catch {
      return `Z-${year}-${cleanStation}-00001`
    }
  }

  /**
   * Persists a cash closure record with billetage and accounting lock
   */
  static createClosure(input: CashClosureInput): {
    success: boolean
    id?: string
    closure_number?: string
    error?: string
  } {
    const id = uuidv4()
    try {
      const breakdownStr = JSON.stringify(input.counted_breakdown)
      const status = input.cash_difference === 0 ? 'closed' : 'discrepancy'

      const closureNumber =
        input.closure_number ||
        CashJournalRepository.generateClosureNumber(input.station_code, input.closure_date)

      const fullNotes = `[${closureNumber}]${input.notes ? ` ${input.notes.trim()}` : ''}`

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
        fullNotes
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
        notes: fullNotes,
        is_locked: 1
      })

      return { success: true, id, closure_number: closureNumber }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Retrieves closure record for a specific date, cashier and station
   */
  static getClosure(date: string, cashier?: string, stationCode?: string): CashClosure | null {
    try {
      let query = 'SELECT * FROM cash_closures WHERE closure_date = ?'
      const params: string[] = [date]
      if (cashier && cashier !== 'all') {
        const aliases = getCashierAliases(cashier)
        if (aliases.length > 0) {
          query += ` AND TRIM(LOWER(cashier_username)) IN (${aliases.map(() => 'TRIM(LOWER(?))').join(',')})`
          params.push(...aliases)
        }
      }
      if (stationCode && stationCode !== 'all') {
        const cleanStation = normalizeStationCode(stationCode)
        query += ` AND (station_code = ? OR station_code = 'CONSOLIDÉ')`
        params.push(cleanStation)
      }
      query += ' ORDER BY closure_datetime DESC LIMIT 1'
      const row = db.prepare(query).get(...params) as any
      if (!row) return null

      const { closureNumber, cleanNotes } = parseClosureNumber(row.notes, {
        year: (row.closure_date || '').substring(0, 4) || new Date().getFullYear().toString(),
        station: row.station_code || 'C1',
        id: row.id
      })

      return {
        ...row,
        closure_number: closureNumber,
        notes: cleanNotes
      }
    } catch {
      return null
    }
  }

  /**
   * Lists past cash closures with parsed official closure numbers
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
      const rows = db.prepare(query).all(...params) as any[]
      return rows.map((r) => {
        const { closureNumber, cleanNotes } = parseClosureNumber(r.notes, {
          year: (r.closure_date || '').substring(0, 4) || new Date().getFullYear().toString(),
          station: r.station_code || 'C1',
          id: r.id
        })
        return {
          ...r,
          closure_number: closureNumber,
          notes: cleanNotes
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Unlocks a cash closure by Direction / Administrator with mandatory audit trail
   */
  static unlockClosure(
    closureId: string,
    unlockedBy: string,
    reason?: string
  ): { success: boolean; error?: string } {
    try {
      const existing = db
        .prepare('SELECT id, notes FROM cash_closures WHERE id = ?')
        .get(closureId) as { id: string; notes?: string } | undefined
      if (!existing) {
        return { success: false, error: 'Clôture introuvable' }
      }
      const noteAppend = ` [DÉVERROUILLÉ par ${unlockedBy} le ${new Date().toISOString()}${reason ? ` - Motif: ${reason}` : ''}]`
      db.prepare(
        `UPDATE cash_closures SET is_locked = 0, status = 'unlocked', notes = notes || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(noteAppend, closureId)

      addToSyncQueue('cash_closures', closureId, 'update', {
        id: closureId,
        is_locked: 0,
        status: 'unlocked',
        notes: (existing.notes || '') + noteAppend
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
