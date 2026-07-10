import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'
import { StudentRepository } from './student.repository'

export interface Payment {
  id: string
  student_id: string
  payment_date: string
  amount: number
  payment_type: 'tuition' | 'bus' | 'canteen' | 'enrollment' | 'uniform' | 'event' | 'other'
  month?: string // "2025-09"
  description?: string
  payment_method?: 'cash' | 'check' | 'transfer' | 'mobile_money' | 'discount'
  receipt_number?: string
  school_year?: string
  created_at?: string
  updated_at?: string
}

export class PaymentRepository {
  static create(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>) {
    const id = uuidv4()
    const stmt = db.prepare(`
      INSERT INTO student_payments (
        id, student_id, payment_date, amount, payment_type, month, 
        description, payment_method, receipt_number, school_year
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        payment.receipt_number || null,
        payment.school_year || null
      )

      addToSyncQueue('student_payments', id, 'create', { ...payment, id })

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
          ? `Paiement ${cashCategory}${payment.month ? ` (${payment.month})` : ''} — ${studentName.last_name} ${studentName.first_name}`
          : `Paiement ${cashCategory}${payment.month ? ` (${payment.month})` : ''}`

        const cashDepartment = payment.payment_type === 'bus' ? 'bus' : 'eleve'

        const cashId = uuidv4()
        db.prepare(
          `
          INSERT INTO cash_journal (id, transaction_date, type, department, category, amount, description, payment_method, related_student_id)
          VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?)
        `
        ).run(
          cashId,
          payment.payment_date,
          cashDepartment,
          cashCategory,
          payment.amount,
          cashDescription,
          payment.payment_method || 'cash',
          payment.student_id
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
          related_student_id: payment.student_id
        })
      }

      // SYNC: When a bus or canteen payment is recorded, ensure the subscription flag
      // in student_fees is activated. This keeps the two sources of truth coherent.
      if (payment.payment_type === 'bus' || payment.payment_type === 'canteen') {
        const schoolYear = StudentRepository.getSetting('school_year') || '2025-2026'
        const targetYear = schoolYear.replace(/['"]/g, '').trim()

        // Find the fee record for current year
        const feeRecord = db
          .prepare(
            'SELECT id, bus_subscribed, canteen_subscribed FROM student_fees WHERE student_id = ? AND school_year = ?'
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
        const schoolYear = StudentRepository.getSetting('school_year') || '2025-2026'
        const targetYear = schoolYear.replace(/['"]/g, '').trim()
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
            } catch (e) {}

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

  static getByStudent(studentId: string, schoolYear?: string) {
    if (schoolYear) {
      return db
        .prepare(
          `
        SELECT * FROM student_payments 
        WHERE student_id = ? AND school_year = ?
        ORDER BY payment_date DESC
      `
        )
        .all(studentId, schoolYear)
    }

    return db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE student_id = ? 
      ORDER BY payment_date DESC
    `
      )
      .all(studentId)
  }

  static getAll(
    filters: { startDate?: string; endDate?: string; type?: string; search?: string } = {}
  ) {
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

    return db.prepare(query).all(...params)
  }

  static getTuitionStatus(studentId: string, schoolYear: string) {
    // 1. Get Fee Structure
    let feeRecord = db
      .prepare(
        `
      SELECT * FROM student_fees 
      WHERE student_id = ? AND school_year = ?
    `
      )
      .get(studentId, schoolYear) as Record<string, unknown> | undefined

    if (!feeRecord) {
      // Try with quotes if not found (legacy fallback)
      const feeRecordQuoted = db
        .prepare(
          `
            SELECT * FROM student_fees 
            WHERE student_id = ? AND school_year = ?
        `
        )
        .get(studentId, `"${schoolYear}"`) as Record<string, unknown> | undefined

      if (!feeRecordQuoted) {
        return { success: false, error: 'No fee record found for this year' }
      }
      // Found with quotes, use it
      feeRecord = feeRecordQuoted
    }

    // 2. Get Tuition Payments
    const payments = db
      .prepare(
        `
      SELECT * FROM student_payments 
      WHERE student_id = ? AND payment_type = 'tuition'
    `
      )
      .all(studentId) as { month: string; amount: number }[]

    // Fetch global settings for dynamic pricing
    let globalMonthlyTuition: number | null = null
    try {
      if (feeRecord && feeRecord.tuition_level) {
        const studentObj = db
          .prepare('SELECT is_personnel_child FROM students WHERE id = ?')
          .get(studentId) as { is_personnel_child: any } | undefined
        const rawPC = studentObj?.is_personnel_child
        const isPersonnelChild =
          rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
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
    // Terminale (TA/TD) goes until July, others stop in June
    const [startYearStr, endYearStr] = schoolYear.replace(/"/g, '').split('-')
    const startYear = parseInt(startYearStr)
    const endYear = parseInt(endYearStr)
    const className = (feeRecord.class_name as string) || ''
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
        : (feeRecord.monthly_tuition as number) || 0

    const status = months.map((m) => {
      const paidForMonth = payments
        .filter((p) => p.month === m.key)
        .reduce((sum, p) => sum + p.amount, 0)

      let status = 'unpaid'
      if (paidForMonth >= monthlyTuition) status = 'paid'
      else if (paidForMonth > 0) status = 'partial'

      return {
        month: m.name,
        key: m.key,
        expected: monthlyTuition,
        paid: paidForMonth,
        status,
        balance: monthlyTuition - paidForMonth
      }
    })

    return {
      success: true,
      feeRecord,
      status
    }
  }

  static getUnpaidAlerts(schoolYear: string) {
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

      // 1. Fetch Finance Config (prices)
      let prices: any = {}
      try {
        const settingsRecord = db
          .prepare("SELECT value FROM settings WHERE key = 'finance_prices'")
          .get() as { value: string } | undefined
        if (settingsRecord?.value) {
          prices = JSON.parse(settingsRecord.value)
        }
      } catch (e) {}

      // 2. Fetch Active Students & Fees
      const students = db
        .prepare(
          `
        SELECT s.id, s.first_name, s.last_name, s.class, s.departure_date, s.is_personnel_child,
               sf.monthly_tuition, sf.bus_subscribed, sf.bus_route, 
               sf.canteen_subscribed, sf.canteen_days_per_week, sf.canteen_days
        FROM students s
        JOIN student_fees sf ON sf.student_id = s.id
        WHERE sf.school_year = ? 
          AND s.deleted = 0 
          AND sf.deleted = 0
      `
        )
        .all(targetYear) as Array<any>

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
        GROUP BY student_id, payment_type, month
      `
        )
        .all() as Array<{
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

      const eventsMap = new Map<string, any[]>()
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
        const checkMonthlyService = (type: string, monthlyCost: number, labelPrefix: string) => {
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
            } catch (e) {}
          }
          const effectiveDays = daysCount === 0 ? 5 : daysCount
          if (effectiveDays >= 5) {
            canteenCost = prices?.canteen?.monthly || 0
          } else {
            canteenCost = (prices?.canteen?.daily || 0) * effectiveDays * 4
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
        WHERE sf.school_year = ? AND s.deleted = 0 AND sf.deleted = 0
      `
        )
        .get(targetYear) as { expected: number } | undefined

      return { success: true, expected: result?.expected || 0 }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de base de données'
      return { success: false, error: message }
    }
  }

  static checkFramFratrie(studentId: string, schoolYear: string) {
    try {
      const student = db.prepare('SELECT siblings FROM students WHERE id = ?').get(studentId) as
        | { siblings: string | null }
        | undefined
      if (!student || !student.siblings) return { success: true, isPaid: false }

      let siblings: string[] = []
      try {
        siblings = JSON.parse(student.siblings)
      } catch (e) {}

      if (siblings.length === 0) return { success: true, isPaid: false }

      // Check if any sibling has a payment for 'fram'
      const placeholders = siblings.map(() => '?').join(',')

      // Note: fram payment might just be payment_type='fram' but wait, what about fram_paid_by_parent?
      // First check if any sibling has fram_paid_by_parent in student_fees
      const siblingsWithFramParent = db
        .prepare(
          `
        SELECT id FROM student_fees 
        WHERE student_id IN (${placeholders}) 
        AND school_year = ? 
        AND fram_paid_by_parent = 1
      `
        )
        .all(...siblings, schoolYear)

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
        AND p.school_year = ?
      `
        )
        .all(...siblings, schoolYear) as any[]

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
