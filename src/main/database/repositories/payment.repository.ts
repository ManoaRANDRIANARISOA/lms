import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'
import { StudentRepository } from './student.repository'
import { SettingsRepository } from './settings.repository'

export interface Payment {
  id: string
  student_id: string
  payment_date: string
  amount: number
  payment_type: 'tuition' | 'bus' | 'canteen' | 'enrollment' | 'uniform' | 'event' | 'other' | 'fram' | 'reenrollment'
  month?: string // "2025-09"
  description?: string
  payment_method?: 'cash' | 'check' | 'transfer' | 'mobile_money' | 'discount'
  receipt_number?: string
  school_year?: string
  print_count?: number
  last_printed_at?: string
  last_printed_by?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

export class PaymentRepository {
  static generateReceiptNumber(schoolYear?: string, customStationCode?: string): string {
    let yearPrefix = new Date().getFullYear().toString()
    if (schoolYear) {
      const match = schoolYear.replace(/['"]/g, '').match(/^(\d{4})/)
      if (match) {
        yearPrefix = match[1]
      }
    }

    const stationCode =
      (customStationCode || (SettingsRepository.get('pos_station_code') as string) || 'C1')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '') || 'C1'

    const patternWithStation = `REC-${yearPrefix}-${stationCode}-%`
    const patternWithoutStation = `REC-${yearPrefix}-%`

    // Find highest sequence number for this station
    const maxStationRecord = db
      .prepare(
        `
      SELECT MAX(
        CAST(
          SUBSTR(
            receipt_number, 
            INSTR(receipt_number, '-' || ? || '-') + LENGTH(? || '-') + 1
          ) AS INTEGER
        )
      ) as max_num 
      FROM student_payments 
      WHERE receipt_number LIKE ?
    `
      )
      .get(stationCode, stationCode, patternWithStation) as { max_num: number | null } | undefined

    let nextNum = 1
    if (maxStationRecord && maxStationRecord.max_num && maxStationRecord.max_num > 0) {
      nextNum = maxStationRecord.max_num + 1
    } else if (stationCode === 'C1') {
      // Fallback for C1: check legacy receipts format 'REC-2026-00061'
      const legacyMax = db
        .prepare(
          `
        SELECT MAX(CAST(SUBSTR(receipt_number, 10) AS INTEGER)) as max_num 
        FROM student_payments 
        WHERE receipt_number LIKE ? AND receipt_number NOT LIKE 'REC-%-%-%'
      `
        )
        .get(patternWithoutStation) as { max_num: number | null } | undefined

      nextNum = (legacyMax?.max_num || 0) + 1
    }

    return `REC-${yearPrefix}-${stationCode}-${String(nextNum).padStart(5, '0')}`
  }

  static recordReceiptPrint(
    paymentIds: string[],
    userName: string = 'Administrateur'
  ): { success: boolean; is_duplicate: boolean; print_count: number } {
    if (!paymentIds || paymentIds.length === 0) {
      return { success: false, is_duplicate: false, print_count: 0 }
    }

    const placeholders = paymentIds.map(() => '?').join(',')
    const currentRecords = db
      .prepare(
        `SELECT id, receipt_number, print_count, amount, payment_type FROM student_payments WHERE id IN (${placeholders})`
      )
      .all(...paymentIds) as {
      id: string
      receipt_number: string
      print_count: number
      amount: number
      payment_type: string
    }[]

    const maxPrintCount = Math.max(0, ...currentRecords.map((r) => r.print_count || 0))
    const isDuplicate = maxPrintCount >= 1
    const newPrintCount = maxPrintCount + 1

    db.prepare(
      `
      UPDATE student_payments 
      SET print_count = COALESCE(print_count, 0) + 1,
          last_printed_at = CURRENT_TIMESTAMP,
          last_printed_by = ?
      WHERE id IN (${placeholders})
    `
    ).run(userName, ...paymentIds)

    // Audit log
    try {
      const receiptNumbers = currentRecords.map((r) => r.receipt_number).filter(Boolean).join(', ')
      const totalAmount = currentRecords.reduce((sum, r) => sum + (r.amount || 0), 0)

      db.prepare(
        `
        INSERT INTO app_logs (level, context, message, details)
        VALUES ('info', 'printer', ?, ?)
      `
      ).run(
        isDuplicate
          ? `Duplicata N°${newPrintCount} émis par ${userName} pour reçu(s): ${receiptNumbers} (Total: ${totalAmount.toLocaleString()} Ar)`
          : `Reçu original émis par ${userName} pour reçu(s): ${receiptNumbers} (Total: ${totalAmount.toLocaleString()} Ar)`,
        JSON.stringify({
          action: isDuplicate ? 'reprint_receipt' : 'print_receipt',
          user_id: userName,
          payment_ids: paymentIds,
          receipt_numbers: receiptNumbers,
          is_duplicate: isDuplicate,
          print_count: newPrintCount,
          total_amount: totalAmount
        })
      )
    } catch (e) {
      console.warn('Could not write receipt print audit log:', e)
    }

    return { success: true, is_duplicate: isDuplicate, print_count: newPrintCount }
  }

  static create(
    payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>
  ): { success: boolean; id?: string; receipt_number?: string; error?: string } {
    const id = uuidv4()
    const cleanSchoolYear = (
      payment.school_year ||
      StudentRepository.getCurrentSchoolYear() ||
      '2026-2027'
    )
      .replace(/['"]/g, '')
      .trim()

    const receiptNumber = payment.receipt_number || this.generateReceiptNumber(cleanSchoolYear)
    const cashierUser = payment.created_by || 'Administrateur'

    const stmt = db.prepare(`
      INSERT INTO student_payments (
        id, student_id, payment_date, amount, payment_type, month, 
        description, payment_method, receipt_number, school_year, print_count, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `)

    const transaction = db.transaction(() => {
      stmt.run(
        id,
        payment.student_id,
        payment.payment_date,
        payment.amount,
        payment.payment_type,
        payment.month || null,
        payment.description || null,
        payment.payment_method || 'cash',
        receiptNumber,
        cleanSchoolYear,
        cashierUser
      )

      addToSyncQueue('student_payments', id, 'create', {
        ...payment,
        id,
        receipt_number: receiptNumber,
        school_year: cleanSchoolYear,
        created_by: cashierUser
      })

      // SYNC: Create a corresponding cash_journal entry so the school's cash register
      // reflects all student payments. Same pattern as personnel:createSalaryExpense.
      if (payment.payment_method !== 'discount') {
        const cashCategories: Record<string, string> = {
          tuition: 'écolage',
          enrollment: 'inscription',
          reenrollment: 'réinscription',
          bus: 'transport',
          canteen: 'cantine',
          uniform: 'uniforme',
          event: 'événement',
          other: 'divers'
        }
        const cashCategory = cashCategories[payment.payment_type] || 'divers'
        const studentName = db
          .prepare('SELECT first_name, last_name FROM students WHERE id = ?')
          .get(payment.student_id) as { first_name: string; last_name: string } | undefined
        const cashDescription = studentName
          ? `Paiement ${cashCategory}${payment.month ? ` (${payment.month})` : ''}${
              (payment.payment_type === 'uniform' || payment.payment_type === 'other') &&
              payment.description
                ? ` (${payment.description})`
                : ''
            } — ${studentName.last_name} ${studentName.first_name}`
          : `Paiement ${cashCategory}${payment.month ? ` (${payment.month})` : ''}${
              (payment.payment_type === 'uniform' || payment.payment_type === 'other') &&
              payment.description
                ? ` (${payment.description})`
                : ''
            }`

        const cashDepartment = payment.payment_type === 'bus' ? 'bus' : 'eleve'

        const cashId = uuidv4()
        db.prepare(
          `
          INSERT INTO cash_journal (
            id, transaction_date, type, department, category, 
            amount, description, payment_method, related_student_id,
            related_payment_id, receipt_number, created_by
          ) VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          cashId,
          payment.payment_date,
          cashDepartment,
          cashCategory,
          payment.amount,
          cashDescription,
          payment.payment_method || 'cash',
          payment.student_id,
          id,
          receiptNumber,
          cashierUser
        )
        addToSyncQueue('cash_journal', cashId, 'create', {
          id: cashId,
          transaction_date: payment.payment_date,
          type: 'income',
          department: cashDepartment,
          category: cashCategory,
          amount: payment.amount,
          description: cashDescription,
          payment_method: payment.payment_method || 'cash',
          related_student_id: payment.student_id,
          related_payment_id: id,
          receipt_number: receiptNumber,
          created_by: cashierUser
        })
      }

      // SYNC: When a bus or canteen payment is recorded, ensure the subscription flag
      // in student_fees is activated. This keeps the two sources of truth coherent.
      if (payment.payment_type === 'bus' || payment.payment_type === 'canteen') {
        const targetYear = cleanSchoolYear

        // Find the fee record for current year
        const feeRecord = db
          .prepare(
            'SELECT id, bus_subscribed, canteen_subscribed FROM student_fees WHERE student_id = ? AND REPLACE(REPLACE(school_year, \'"\', \'\'), \'\'\'\', \'\') = ?'
          )
          .get(payment.student_id, targetYear) as
          | { id: string; bus_subscribed: number; canteen_subscribed: number }
          | undefined

        if (feeRecord) {
          const updates: Record<string, unknown> = {}
          if (payment.payment_type === 'bus' && !feeRecord.bus_subscribed) {
            updates.bus_subscribed = 1
          }
          if (payment.payment_type === 'canteen' && !feeRecord.canteen_subscribed) {
            updates.canteen_subscribed = 1
          }

          if (Object.keys(updates).length > 0) {
            const fields = Object.keys(updates)
              .map((k) => `${k} = ?`)
              .join(', ')
            db.prepare(
              `UPDATE student_fees SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending' WHERE id = ?`
            ).run(...Object.values(updates), feeRecord.id)

            addToSyncQueue('student_fees', feeRecord.id, 'update', {
              ...updates,
              student_id: payment.student_id
            })
          }
        }
      }

      // SYNC: When a uniform payment is recorded, mark the item as purchased
      if (payment.payment_type === 'uniform' && payment.description) {
        const targetYear = StudentRepository.getCurrentSchoolYear()
        const itemName = (payment.description as string).split(' - ')[0].trim()

        if (itemName) {
          const feeRecord = db
            .prepare(
              `SELECT id, uniform_items_purchased FROM student_fees WHERE student_id = ? AND school_year = ?`
            )
            .get(payment.student_id, targetYear) as
            | { id: string; uniform_items_purchased: string | null }
            | undefined

          if (feeRecord) {
            let purchased: string[] = []
            try {
              if (feeRecord.uniform_items_purchased) {
                purchased = JSON.parse(feeRecord.uniform_items_purchased)
              }
            } catch {
              // Ignore parse error
            }

            if (!purchased.includes(itemName)) {
              purchased.push(itemName)
              const newPurchasedStr = JSON.stringify(purchased)
              db.prepare(
                `UPDATE student_fees SET uniform_items_purchased = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending' WHERE id = ?`
              ).run(newPurchasedStr, feeRecord.id)

              addToSyncQueue('student_fees', feeRecord.id, 'update', {
                uniform_items_purchased: newPurchasedStr,
                student_id: payment.student_id
              })
            }
          }
        }
      }
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create payment error:', error)
      return { success: false, error: message }
    }
  }

  static getByStudent(studentId: string, schoolYear?: string): Payment[] {
    if (schoolYear) {
      const cleanYear = schoolYear.replace(/['"]/g, '').trim()
      const parts = cleanYear.split('-')
      const startYear = parts[0]
      const endYear = parts[1] || parts[0]

      return db
        .prepare(
          `
        SELECT * FROM student_payments 
        WHERE student_id = ? 
          AND (
            REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
            OR (
              (school_year IS NULL OR REPLACE(REPLACE(school_year, '"', ''), '''', '') = '' OR payment_date >= ? || '-06-01')
              AND (
                month LIKE ? OR month LIKE ?
                OR payment_date BETWEEN ? AND ?
              )
            )
          )
        ORDER BY payment_date DESC, created_at DESC
      `
        )
        .all(
          studentId,
          cleanYear,
          startYear,
          `${startYear}-%`,
          `${endYear}-%`,
          `${startYear}-06-01`,
          `${endYear}-08-31`
        ) as Payment[]
    }

    return db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE student_id = ? 
      ORDER BY payment_date DESC, created_at DESC
    `
      )
      .all(studentId) as Payment[]
  }

  static getAll(
    filters: { startDate?: string; endDate?: string; type?: string; search?: string } = {}
  ): (Payment & { first_name?: string; last_name?: string; class_name?: string })[] {
    let query = `
      SELECT sp.*, s.first_name, s.last_name, s.class as class_name 
      FROM student_payments sp 
      LEFT JOIN students s ON sp.student_id = s.id
    `
    const params: unknown[] = []
    const conditions: string[] = []

    if (filters.startDate) {
      conditions.push('sp.payment_date >= ?')
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      conditions.push('sp.payment_date <= ?')
      params.push(filters.endDate)
    }
    if (filters.type && filters.type !== 'all') {
      conditions.push('sp.payment_type = ?')
      params.push(filters.type)
    }
    if (filters.search) {
      const searchTerm = `%${filters.search.toLowerCase()}%`
      conditions.push(
        '(lower(s.first_name) LIKE ? OR lower(s.last_name) LIKE ? OR lower(sp.description) LIKE ? OR lower(sp.payment_type) LIKE ? OR sp.payment_date LIKE ? OR CAST(sp.amount AS TEXT) LIKE ?)'
      )
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm)
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY sp.payment_date DESC, sp.created_at DESC'

    return db.prepare(query).all(...params) as (Payment & {
      first_name?: string
      last_name?: string
      class_name?: string
    })[]
  }

  static getTuitionStatus(studentId: string, schoolYear: string): Record<string, unknown> {
    const cleanYear = schoolYear.replace(/['"]/g, '').trim()

    // 1. Get Fee Structure
    let feeRecord = db
      .prepare(
        `
      SELECT * FROM student_fees 
      WHERE student_id = ? AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
    `
      )
      .get(studentId, cleanYear) as Record<string, unknown> | undefined

    if (!feeRecord) {
      // Auto-provision if student has active class
      const studentObj = db
        .prepare(
          'SELECT class, is_personnel_child, departure_date FROM students WHERE id = ? AND deleted = 0'
        )
        .get(studentId) as
        | { class?: string; is_personnel_child?: unknown; departure_date?: string | null }
        | undefined

      if (
        studentObj &&
        studentObj.class &&
        studentObj.class !== 'Non inscrit' &&
        studentObj.class !== 'Classe non spécifiée' &&
        !studentObj.departure_date
      ) {
        const rawPC = studentObj.is_personnel_child
        const isPC =
          rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
        const tuitionLevel = StudentRepository.determineTuitionLevel(studentObj.class)
        const monthlyTuition = StudentRepository.getTuitionPrice(studentObj.class, isPC)
        const newFeeId = uuidv4()

        try {
          db.prepare(
            `
            INSERT INTO student_fees (
              id, student_id, school_year, tuition_level, monthly_tuition, class_name,
              bus_subscribed, canteen_subscribed, fram_paid_by_parent, is_reenrollment,
              deleted, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'pending')
          `
          ).run(newFeeId, studentId, cleanYear, tuitionLevel, monthlyTuition, studentObj.class)

          feeRecord = db
            .prepare('SELECT * FROM student_fees WHERE id = ?')
            .get(newFeeId) as Record<string, unknown> | undefined
        } catch (e) {
          console.error('Error auto-creating student fee record in getTuitionStatus:', e)
        }
      }

      if (!feeRecord) {
        return { success: false, error: 'No fee record found for this year' }
      }
    }

    const [startYearStr, endYearStr] = cleanYear.split('-')
    const startYear = parseInt(startYearStr) || 2026
    const endYear = parseInt(endYearStr) || 2027

    // 2. Get Tuition Payments
    const payments = db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE student_id = ? 
        AND payment_type = 'tuition'
        AND (
          REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
          OR month LIKE ?
          OR month LIKE ?
        )
    `
      )
      .all(studentId, cleanYear, `${startYear}-%`, `${endYear}-%`) as { month: string; amount: number }[]

    // Track whether student is personnel child
    let isPersonnelChild = false
    try {
      const studentObj = db
        .prepare('SELECT is_personnel_child FROM students WHERE id = ?')
        .get(studentId) as { is_personnel_child?: unknown } | undefined
      const rawPC = studentObj?.is_personnel_child
      isPersonnelChild =
        rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
    } catch {
      // Ignore
    }

    // Fetch global settings for dynamic pricing
    let globalMonthlyTuition: number | null = null
    try {
      if (feeRecord && feeRecord.tuition_level) {
        if (isPersonnelChild) {
          globalMonthlyTuition = 0
        } else {
          const config = StudentRepository.resolveTuitionConfig(feeRecord.tuition_level as string)
          if (config && config.price > 0) {
            globalMonthlyTuition = config.price
          }
        }
      }
    } catch (e) {
      console.error('Error fetching dynamic tuition prices:', e)
    }

    // 3. Calculate Status for each month
    const className = (feeRecord?.class_name as string) || ''
    const isTerminale = className === 'TA' || className === 'TD' || className === 'Terminale'

    const months = [
      { name: 'Septembre', key: `${startYear}-09` },
      { name: 'Octobre', key: `${startYear}-10` },
      { name: 'Novembre', key: `${startYear}-11` },
      { name: 'Décembre', key: `${startYear}-12` },
      { name: 'Janvier', key: `${endYear}-01` },
      { name: 'Février', key: `${endYear}-02` },
      { name: 'Mars', key: `${endYear}-03` },
      { name: 'Avril', key: `${endYear}-04` },
      { name: 'Mai', key: `${endYear}-05` },
      { name: 'Juin', key: `${endYear}-06` },
      ...(isTerminale ? [{ name: 'Juillet', key: `${endYear}-07` }] : [])
    ]

    // Use global price if available, otherwise fallback to stored record
    const monthlyTuition =
      globalMonthlyTuition !== null
        ? globalMonthlyTuition
        : (feeRecord?.monthly_tuition as number) || 0

    const status = months.map((m) => {
      const paidForMonth = payments
        .filter((p) => p.month === m.key || (p.month && p.month.slice(5) === m.key.slice(5)))
        .reduce((sum, p) => sum + p.amount, 0)

      let status = 'unpaid'
      if (isPersonnelChild) {
        status = 'exempt'
      } else if (monthlyTuition > 0) {
        if (paidForMonth >= monthlyTuition) status = 'paid'
        else if (paidForMonth > 0) status = 'partial'
      } else {
        status = paidForMonth > 0 ? 'paid' : 'unassigned_class'
      }

      return {
        month: m.name,
        key: m.key,
        expected: isPersonnelChild ? 0 : monthlyTuition,
        paid: paidForMonth,
        status,
        balance: isPersonnelChild ? 0 : Math.max(0, monthlyTuition - paidForMonth)
      }
    })

    return {
      success: true,
      feeRecord,
      status
    }
  }

  static getUnpaidAlerts(
    schoolYear: string
  ): { success: boolean; alerts?: Record<string, unknown>[]; error?: string } {
    try {
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      const [startYearStr, endYearStr] = targetYear.split('-')
      const startYear = parseInt(startYearStr)
      const endYear = parseInt(endYearStr)

      const months = [
        `${startYear}-09`,
        `${startYear}-10`,
        `${startYear}-11`,
        `${startYear}-12`,
        `${endYear}-01`,
        `${endYear}-02`,
        `${endYear}-03`,
        `${endYear}-04`,
        `${endYear}-05`,
        `${endYear}-06`
      ]
      const terminaleMonths = [...months, `${endYear}-07`]

      // 1. Fetch Finance Config (prices) with robust fallbacks
      let prices: Record<string, any> = {
        bus: { 'Zone 1': 30000, 'Zone 2': 40000, 'Zone 3': 50000 },
        canteen: { daily: 2000, monthly: 40000 },
        fram: 15000,
        registration: 145000,
        reenrollment: 115000
      }
      try {
        const settingsRecord = db
          .prepare("SELECT value FROM settings WHERE key = 'finance_prices'")
          .get() as { value: string } | undefined
        if (settingsRecord?.value) {
          const parsed = JSON.parse(settingsRecord.value)
          prices = {
            ...prices,
            ...parsed,
            bus: { ...prices.bus, ...(parsed.bus || {}) },
            canteen: { ...prices.canteen, ...(parsed.canteen || {}) }
          }
        }
      } catch {
        // Ignore parse errors
      }

      // 2. Fetch Active Students & Fees
      const students = db
        .prepare(
          `
        SELECT s.id, s.first_name, s.last_name, s.class, s.departure_date, s.is_personnel_child,
               sf.monthly_tuition, sf.bus_subscribed, sf.bus_route, 
               sf.canteen_subscribed, sf.canteen_days_per_week, sf.canteen_days
        FROM students s
        JOIN student_fees sf ON sf.student_id = s.id
        WHERE REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? 
          AND s.deleted = 0 
          AND sf.deleted = 0
      `
        )
        .all(targetYear) as Array<Record<string, any>>

      if (students.length === 0) {
        return { success: true, alerts: [] }
      }

      // 3. Fetch Payments
      const payments = db
        .prepare(
          `
        SELECT student_id, payment_type, month, SUM(amount) as total_paid
        FROM student_payments
        WHERE deleted = 0 
          AND payment_type IN ('tuition', 'bus', 'canteen')
          AND (
            REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
            OR (
              school_year IS NULL 
              AND (
                month LIKE ? OR month LIKE ?
                OR payment_date BETWEEN ? AND ?
              )
            )
          )
        GROUP BY student_id, payment_type, month
      `
        )
        .all(
          targetYear,
          `${startYear}-%`,
          `${endYear}-%`,
          `${startYear}-06-01`,
          `${endYear}-08-31`
        ) as Array<{
        student_id: string
        payment_type: string
        month: string
        total_paid: number
      }>

      const paymentMap = new Map<string, number>()
      payments.forEach((p) => {
        paymentMap.set(`${p.student_id}_${p.payment_type}_${p.month}`, p.total_paid)
      })

      // 4. Fetch Unpaid Events
      const unpaidEvents = db
        .prepare(
          `
        SELECT ep.student_id, e.name as event_name, ep.amount_due, ep.amount_paid
        FROM event_payments ep
        JOIN parent_events e ON ep.event_id = e.id
        WHERE ep.paid = 0 AND e.deleted = 0
      `
        )
        .all() as Array<{
        student_id: string
        event_name: string
        amount_due: number
        amount_paid: number
      }>

      const eventsMap = new Map<string, Array<Record<string, any>>>()
      unpaidEvents.forEach((ev) => {
        if (!eventsMap.has(ev.student_id)) eventsMap.set(ev.student_id, [])
        eventsMap.get(ev.student_id)!.push(ev)
      })

      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      const alerts: Array<Record<string, unknown>> = []

      students.forEach((student) => {
        const isTerminale =
          student.class === 'TA' || student.class === 'TD' || student.class === 'Terminale'
        const studentMonths = isTerminale ? terminaleMonths : months

        let totalDue = 0
        const unpaidItems: Array<{ type: string; description: string; amount: number }> = []

        // Helper to check monthly subscriptions
        const checkMonthlyService = (
          type: string,
          monthlyCost: number,
          labelPrefix: string
        ): void => {
          if (monthlyCost <= 0) return
          studentMonths.forEach((m) => {
            if (m > currentMonth) return // Not yet due
            if (student.departure_date && m > student.departure_date.substring(0, 7)) return // After departure

            const paidAmount = paymentMap.get(`${student.id}_${type}_${m}`) || 0
            const balance = monthlyCost - paidAmount
            if (balance > 0) {
              unpaidItems.push({
                type,
                description: `${labelPrefix} (${m})`,
                amount: balance
              })
              totalDue += balance
            }
          })
        }

        // --- Tuition ---
        const isPersonnelChild =
          student.is_personnel_child === 1 ||
          student.is_personnel_child === '1' ||
          student.is_personnel_child === true ||
          student.is_personnel_child === 'true'
        const tuitionCost = isPersonnelChild ? 0 : student.monthly_tuition || 0
        checkMonthlyService('tuition', tuitionCost, 'Écolage')

        // --- Bus ---
        if (student.bus_subscribed && student.bus_route) {
          const busCost = prices?.bus?.[student.bus_route] || 0
          checkMonthlyService('bus', busCost, 'Transport')
        }

        // --- Canteen ---
        if (student.canteen_subscribed) {
          let canteenCost = 0
          let daysCount = student.canteen_days_per_week || 0
          if (typeof student.canteen_days === 'string') {
            try {
              const parsed = JSON.parse(student.canteen_days)
              if (Array.isArray(parsed) && parsed.length > 0) daysCount = parsed.length
            } catch {
              // Ignore parse error
            }
          }
          const effectiveDays = daysCount === 0 ? 5 : daysCount
          const monthlyPrice = Number(prices?.canteen?.monthly) || 0
          const dailyPrice = Number(prices?.canteen?.daily) || 0
          if (monthlyPrice > 0 && effectiveDays >= 5) {
            canteenCost = monthlyPrice
          } else {
            canteenCost = dailyPrice * effectiveDays * 4
          }
          checkMonthlyService('canteen', canteenCost, 'Cantine')
        }

        // --- Events ---
        const sEvents = eventsMap.get(student.id) || []
        sEvents.forEach((ev) => {
          const balance = ev.amount_due - ev.amount_paid
          if (balance > 0) {
            unpaidItems.push({
              type: 'event',
              description: `Événement: ${ev.event_name}`,
              amount: balance
            })
            totalDue += balance
          }
        })

        if (unpaidItems.length > 0) {
          alerts.push({
            student_id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            class_name: student.class || '-',
            unpaid_items: unpaidItems,
            total_due: totalDue
          })
        }
      })

      return { success: true, alerts }
    } catch (error: unknown) {
      console.error('Error fetching unpaid alerts:', error)
      const message = error instanceof Error ? error.message : 'Erreur de base de données'
      return { success: false, error: message }
    }
  }

  static getExpectedRevenue(schoolYear: string): {
    success: boolean
    expected?: number
    error?: string
  } {
    try {
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      const result = db
        .prepare(
          `
        SELECT COALESCE(SUM(sf.monthly_tuition), 0) as expected
        FROM student_fees sf
        JOIN students s ON s.id = sf.student_id
        WHERE REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? AND s.deleted = 0 AND sf.deleted = 0
      `
        )
        .get(targetYear) as { expected: number } | undefined

      return { success: true, expected: result?.expected || 0 }
    } catch (error: unknown) {
      console.error('Error fetching expected revenue:', error)
      const message = error instanceof Error ? error.message : 'Erreur de base de données'
      return { success: false, error: message }
    }
  }

  static checkFramFratrie(
    studentId: string,
    schoolYear: string
  ): { success: boolean; isPaid?: boolean; by?: string; error?: string } {
    try {
      const cleanYear = schoolYear.replace(/['"]/g, '').trim()
      const student = db.prepare('SELECT siblings FROM students WHERE id = ?').get(studentId) as
        | { siblings: string | null }
        | undefined
      if (!student || !student.siblings) return { success: true, isPaid: false }

      let siblings: string[] = []
      try {
        siblings = JSON.parse(student.siblings)
      } catch {
        // Ignore parse error
      }

      if (siblings.length === 0) return { success: true, isPaid: false }

      // Check if any sibling has a payment for 'fram'
      const placeholders = siblings.map(() => '?').join(',')

      // First check if any sibling has fram_paid_by_parent in student_fees
      const siblingsWithFramParent = db
        .prepare(
          `
        SELECT id FROM student_fees 
        WHERE student_id IN (${placeholders}) 
        AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = ? 
        AND fram_paid_by_parent = 1
      `
        )
        .all(...siblings, cleanYear)

      if (siblingsWithFramParent.length > 0) {
        return { success: true, isPaid: true, by: 'parent' }
      }

      // Next, check actual payments
      const payments = db
        .prepare(
          `
        SELECT p.student_id, s.first_name, s.last_name
        FROM student_payments p
        JOIN students s ON p.student_id = s.id
        WHERE p.payment_type = 'fram' 
        AND p.student_id IN (${placeholders})
        AND (
          REPLACE(REPLACE(p.school_year, '"', ''), '''', '') = ?
          OR p.payment_date BETWEEN ? AND ?
        )
      `
        )
        .all(
          ...siblings,
          cleanYear,
          `${cleanYear.split('-')[0]}-06-01`,
          `${cleanYear.split('-')[1] || cleanYear.split('-')[0]}-08-31`
        ) as Array<{
          student_id: string
          first_name: string
          last_name: string
        }>

      if (payments.length > 0) {
        const siblingNames = payments.map((p) => `${p.first_name} ${p.last_name}`).join(', ')
        return { success: true, isPaid: true, by: siblingNames }
      }

      return { success: true, isPaid: false }
    } catch (err) {
      console.error('Error checking fram fratrie:', err)
      return { success: false, error: 'Error checking fratrie' }
    }
  }
}
