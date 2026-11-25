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

export function normalizeStationCode(raw?: string | null): string {
  if (!raw) return 'C1'
  const trimmed = String(raw).trim().toUpperCase()
  const numMatch = trimmed.match(/^(?:CAISSE\s*|POSTE\s*|C)?\s*(\d+)$/i)
  if (numMatch) {
    return `C${numMatch[1]}`
  }
  const clean = trimmed.replace(/[^A-Z0-9]/g, '')
  return clean || 'C1'
}

export class PaymentRepository {
  /**
   * Plus haut numéro de séquence déjà présent EN LOCAL pour ce poste/année,
   * tous reçus confondus (student_payments + cash_journal, y compris supprimés).
   * Inclut le repli legacy 'REC-YYYY-XXXXX' (sans poste) pour C1.
   */
  private static localMaxReceiptSeq(stationCode: string, yearPrefix: string): number {
    const patternWithStation = `REC-${yearPrefix}-${stationCode}-%`
    const patternWithoutStation = `REC-${yearPrefix}-%`
    const maxStationRecord = db
      .prepare(
        `
      SELECT MAX(max_num) as max_num FROM (
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
        UNION ALL
        SELECT MAX(
          CAST(
            SUBSTR(
              receipt_number,
              INSTR(receipt_number, '-' || ? || '-') + LENGTH(? || '-') + 1
            ) AS INTEGER
          )
        ) as max_num
        FROM cash_journal
        WHERE receipt_number LIKE ?
      )
    `
      )
      .get(
        stationCode,
        stationCode,
        patternWithStation,
        stationCode,
        stationCode,
        patternWithStation
      ) as { max_num: number | null } | undefined

    let maxNum = maxStationRecord?.max_num || 0
    if (maxNum <= 0 && stationCode === 'C1') {
      const legacyMax = db
        .prepare(
          `
        SELECT MAX(max_num) as max_num FROM (
          SELECT MAX(CAST(SUBSTR(receipt_number, 10) AS INTEGER)) as max_num
          FROM student_payments
          WHERE receipt_number LIKE ? AND receipt_number NOT LIKE 'REC-%-%-%'
          UNION ALL
          SELECT MAX(CAST(SUBSTR(receipt_number, 10) AS INTEGER)) as max_num
          FROM cash_journal
          WHERE receipt_number LIKE ? AND receipt_number NOT LIKE 'REC-%-%-%'
        )
      `
        )
        .get(patternWithoutStation, patternWithoutStation) as { max_num: number | null } | undefined
      maxNum = legacyMax?.max_num || 0
    }
    return maxNum > 0 ? maxNum : 0
  }

  /**
   * Plancher monotone local-only (non synchronisé, non historisé) des numéros de
   * reçu déjà émis pour ce poste/année. Protège contre la réutilisation d'un
   * numéro quand la vue locale est incomplète (synchro bloquée, restauration).
   * Écrit directement dans settings pour éviter tout envoi cloud / spam d'historique.
   */
  private static readReceiptHighWater(stationCode: string, yearPrefix: string): number {
    try {
      const row = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(`receipt_hwm_${stationCode}_${yearPrefix}`) as { value: string } | undefined
      const n = row ? parseInt(JSON.parse(row.value), 10) : 0
      return Number.isFinite(n) && n > 0 ? n : 0
    } catch {
      return 0
    }
  }

  private static writeReceiptHighWater(stationCode: string, yearPrefix: string, value: number): void {
    try {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      ).run(`receipt_hwm_${stationCode}_${yearPrefix}`, JSON.stringify(value))
    } catch (e) {
      console.warn('[Receipt] high-water write failed:', e)
    }
  }

  /**
   * Après un pull réussi, relève le plancher local au MAX observé (les lignes
   * cloud rapatriées incluses) afin qu'un numéro déjà émis ailleurs ne soit
   * jamais réattribué, même si la ligne locale venait à manquer.
   */
  static bumpReceiptHighWaterFromLocal(schoolYear?: string, customStationCode?: string): void {
    let yearPrefix = new Date().getFullYear().toString()
    const sy = schoolYear || (SettingsRepository.get('school_year') as string)
    if (sy) {
      const match = String(sy).replace(/['"]/g, '').match(/^(\d{4})/)
      if (match) yearPrefix = match[1]
    }
    const stationCode = normalizeStationCode(
      customStationCode || (SettingsRepository.get('pos_station_code') as string)
    )
    const localMax = this.localMaxReceiptSeq(stationCode, yearPrefix)
    const hwm = this.readReceiptHighWater(stationCode, yearPrefix)
    if (localMax > hwm) this.writeReceiptHighWater(stationCode, yearPrefix, localMax)
  }

  static generateReceiptNumber(schoolYear?: string, customStationCode?: string): string {
    let yearPrefix = new Date().getFullYear().toString()
    if (schoolYear) {
      const match = schoolYear.replace(/['"]/g, '').match(/^(\d{4})/)
      if (match) {
        yearPrefix = match[1]
      }
    }

    const rawStation = customStationCode || (SettingsRepository.get('pos_station_code') as string)
    const stationCode = normalizeStationCode(rawStation)

    // Unicité future : MAX local (toutes lignes) ET plancher monotone local-only.
    // Le plancher est relevé après chaque pull (bumpReceiptHighWaterFromLocal),
    // ce qui intègre les numéros émis sur les autres postes une fois synchronisés.
    const localMax = this.localMaxReceiptSeq(stationCode, yearPrefix)
    const hwm = this.readReceiptHighWater(stationCode, yearPrefix)
    const nextNum = Math.max(localMax, hwm) + 1
    this.writeReceiptHighWater(stationCode, yearPrefix, nextNum)

    return `REC-${yearPrefix}-${stationCode}-${String(nextNum).padStart(5, '0')}`
  }

  static recordReceiptPrint(
    paymentIds: string[],
    userName: string = 'Administrateur',
    receiptNumber?: string
  ): { success: boolean; is_duplicate: boolean; print_count: number; duplicate_count: number } {
    if (!paymentIds || paymentIds.length === 0) {
      return { success: false, is_duplicate: false, print_count: 0, duplicate_count: 0 }
    }

    const spIds = new Set<string>()
    const cjIds = new Set<string>()

    for (const rawId of paymentIds) {
      if (!rawId) continue

      // 1. Check in student_payments
      const sp = db.prepare('SELECT id FROM student_payments WHERE id = ?').get(rawId) as
        | { id: string }
        | undefined
      if (sp) {
        spIds.add(sp.id)
        // Find matching cash_journal entry
        const cjLinked = db
          .prepare('SELECT id FROM cash_journal WHERE related_payment_id = ?')
          .all(sp.id) as { id: string }[]
        cjLinked.forEach((r) => cjIds.add(r.id))
      }

      // 2. Check in cash_journal
      const cj = db
        .prepare(
          'SELECT id, related_payment_id, related_student_id, transaction_date, amount FROM cash_journal WHERE id = ?'
        )
        .get(rawId) as
        | {
            id: string
            related_payment_id: string | null
            related_student_id: string | null
            transaction_date: string
            amount: number
          }
        | undefined

      if (cj) {
        cjIds.add(cj.id)
        if (cj.related_payment_id) {
          spIds.add(cj.related_payment_id)
        } else if (cj.related_student_id) {
          // Find matching student_payments entry
          const matchSp = db
            .prepare(
              `SELECT id FROM student_payments 
               WHERE student_id = ? AND payment_date = ? AND amount = ? AND deleted = 0 
               LIMIT 1`
            )
            .get(cj.related_student_id, cj.transaction_date, cj.amount) as
            | { id: string }
            | undefined
          if (matchSp) {
            spIds.add(matchSp.id)
            // Permanently link in cash_journal for instant joins
            db.prepare('UPDATE cash_journal SET related_payment_id = ? WHERE id = ?').run(
              matchSp.id,
              cj.id
            )
          }
        }
      }
    }

    const spList = Array.from(spIds)
    const cjList = Array.from(cjIds)

    let currentSpRecords: {
      id: string
      receipt_number: string | null
      print_count: number
      amount: number
    }[] = []
    if (spList.length > 0) {
      const ph = spList.map(() => '?').join(',')
      currentSpRecords = db
        .prepare(
          `SELECT id, receipt_number, print_count, amount FROM student_payments WHERE id IN (${ph})`
        )
        .all(...spList) as any[]
    }

    let currentCjRecords: {
      id: string
      receipt_number: string | null
      print_count: number
      amount: number
    }[] = []
    if (cjList.length > 0) {
      const ph = cjList.map(() => '?').join(',')
      currentCjRecords = db
        .prepare(
          `SELECT id, receipt_number, print_count, amount FROM cash_journal WHERE id IN (${ph})`
        )
        .all(...cjList) as any[]
    }

    const allRecords = [...currentSpRecords, ...currentCjRecords]
    const maxPrintCount = Math.max(0, ...allRecords.map((r) => r.print_count || 0))
    const isDuplicate = maxPrintCount >= 1
    const newPrintCount = maxPrintCount + 1
    // Accounting standard:
    // 1st print: maxPrintCount = 0 -> Original (duplicate_count = 0)
    // 2nd print: maxPrintCount = 1 -> Duplicata N° 1 (duplicate_count = 1)
    // 3rd print: maxPrintCount = 2 -> Duplicata N° 2 (duplicate_count = 2)
    const currentDuplicateNumber = isDuplicate ? maxPrintCount : 0

    // Update student_payments
    if (spList.length > 0) {
      const ph = spList.map(() => '?').join(',')
      const nowIso = new Date().toISOString()
      if (receiptNumber) {
        db.prepare(
          `
          UPDATE student_payments 
          SET print_count = COALESCE(print_count, 0) + 1,
              last_printed_at = CURRENT_TIMESTAMP,
              last_printed_by = ?,
              receipt_number = COALESCE(receipt_number, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${ph})
        `
        ).run(userName, receiptNumber, ...spList)
      } else {
        db.prepare(
          `
          UPDATE student_payments 
          SET print_count = COALESCE(print_count, 0) + 1,
              last_printed_at = CURRENT_TIMESTAMP,
              last_printed_by = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${ph})
        `
        ).run(userName, ...spList)
      }

      for (const spId of spList) {
        addToSyncQueue('student_payments', spId, 'update', {
          id: spId,
          print_count: newPrintCount,
          last_printed_at: nowIso,
          last_printed_by: userName,
          ...(receiptNumber ? { receipt_number: receiptNumber } : {})
        })
      }
    }

    // Update cash_journal
    if (cjList.length > 0) {
      const ph = cjList.map(() => '?').join(',')
      if (receiptNumber) {
        db.prepare(
          `
          UPDATE cash_journal 
          SET print_count = COALESCE(print_count, 0) + 1,
              last_printed_at = CURRENT_TIMESTAMP,
              last_printed_by = ?,
              receipt_number = COALESCE(receipt_number, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${ph})
        `
        ).run(userName, receiptNumber, ...cjList)
      } else {
        db.prepare(
          `
          UPDATE cash_journal 
          SET print_count = COALESCE(print_count, 0) + 1,
              last_printed_at = CURRENT_TIMESTAMP,
              last_printed_by = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${ph})
        `
        ).run(userName, ...cjList)
      }

      for (const cjId of cjList) {
        addToSyncQueue('cash_journal', cjId, 'update', {
          id: cjId,
          ...(receiptNumber ? { receipt_number: receiptNumber } : {})
        })
      }
    }

    // Audit log
    try {
      const receiptNumbers = Array.from(
        new Set(
          [
            ...currentSpRecords.map((r) => r.receipt_number),
            ...currentCjRecords.map((r) => r.receipt_number),
            receiptNumber
          ].filter(Boolean)
        )
      ).join(', ')

      const totalAmount = currentSpRecords.reduce((sum, r) => sum + (r.amount || 0), 0)

      db.prepare(
        `
        INSERT INTO app_logs (level, context, message, details)
        VALUES ('info', 'printer', ?, ?)
      `
      ).run(
        isDuplicate
          ? `Duplicata N°${currentDuplicateNumber} émis par ${userName} pour reçu(s): ${receiptNumbers || 'Groupé'} (Total: ${totalAmount.toLocaleString()} Ar)`
          : `Reçu original émis par ${userName} pour reçu(s): ${receiptNumbers || 'Groupé'} (Total: ${totalAmount.toLocaleString()} Ar)`,
        JSON.stringify({
          action: isDuplicate ? 'reprint_receipt' : 'print_receipt',
          user_id: userName,
          payment_ids: paymentIds,
          receipt_numbers: receiptNumbers,
          is_duplicate: isDuplicate,
          duplicate_count: currentDuplicateNumber,
          print_count: newPrintCount,
          total_amount: totalAmount
        })
      )
    } catch (e) {
      console.warn('Could not write receipt print audit log:', e)
    }

    return {
      success: true,
      is_duplicate: isDuplicate,
      print_count: newPrintCount,
      duplicate_count: currentDuplicateNumber
    }
  }

  static create(
    payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'> & {
      allow_post_closure_override?: boolean
      station_code?: string
    }
  ): { success: boolean; id?: string; receipt_number?: string; error?: string } {
    const rawStation = payment.station_code || (SettingsRepository.get('pos_station_code') as string)
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
      .get(payment.payment_date, currentStation) as
      | { id: string; station_code: string; notes?: string }
      | undefined

    if (closure && !payment.allow_post_closure_override) {
      const zMatch = closure.notes ? closure.notes.match(/\[(Z-[^\]]+)\]/) : null
      const zLabel = zMatch ? zMatch[1] : `Z-${closure.station_code}`
      return {
        success: false,
        error: `La caisse du poste ${currentStation} est clôturée et scellée pour le ${payment.payment_date} (${zLabel}). Saisie verrouillée. Déverrouillage Direction requis.`
      }
    }

    // Le code station doit être configuré : un défaut silencieux sur C1 provoquerait
    // des collisions de numéros de reçu avec la vraie caisse C1 (norme REC-YYYY-C<station>-XXXXX).
    if (!rawStation || !String(rawStation).trim()) {
      return {
        success: false,
        error:
          'Code station non configuré sur ce poste. Configurez-le dans les Paramètres (ex. C1, C2…) avant toute saisie de paiement — norme de numérotation REC-YYYY-C<station>-XXXXX.'
      }
    }

    // Interdire les paiements sur un élève supprimé/fusionné : ils doivent suivre la fiche active
    const targetStudent = db
      .prepare('SELECT id, deleted FROM students WHERE id = ?')
      .get(payment.student_id) as { id: string; deleted: number } | undefined
    if (!targetStudent) {
      return { success: false, error: 'Élève introuvable : paiement impossible.' }
    }
    if (targetStudent.deleted === 1) {
      return {
        success: false,
        error:
          'Cette fiche élève est supprimée/fusionnée. Utilisez la fiche active (recherche par nom ou matricule) pour saisir le paiement.'
      }
    }

    const id = uuidv4()
    const cleanSchoolYear = (
      payment.school_year ||
      StudentRepository.getCurrentSchoolYear()
    )
      .replace(/['"]/g, '')
      .trim()

    // SAFEGUARD: Prevent accidental duplicate payment of an already fully paid tuition month
    if (payment.payment_type === 'tuition' && payment.month) {
      const existing = db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total_paid 
           FROM student_payments 
           WHERE student_id = ? 
             AND payment_type = 'tuition' 
             AND month = ? 
             AND school_year = ? 
             AND deleted = 0`
        )
        .get(payment.student_id, payment.month, cleanSchoolYear) as { total_paid: number } | undefined

      const totalPaid = Number(existing?.total_paid || 0)

      // Fetch student's tuition fee (prioritizing central dynamic pricing from finance_prices)
      const studentRow = db
        .prepare(`SELECT class, is_personnel_child FROM students WHERE id = ?`)
        .get(payment.student_id) as
        | { class?: string; is_personnel_child?: unknown }
        | undefined
      const isPC =
        studentRow?.is_personnel_child == 1 ||
        studentRow?.is_personnel_child === '1' ||
        studentRow?.is_personnel_child === '1.0' ||
        studentRow?.is_personnel_child === true ||
        studentRow?.is_personnel_child === 'true'

      const feeRow = db
        .prepare(
          `SELECT monthly_tuition, tuition_level FROM student_fees WHERE student_id = ? AND school_year = ? AND deleted = 0`
        )
        .get(payment.student_id, cleanSchoolYear) as
        | { monthly_tuition: number | null; tuition_level?: string }
        | undefined

      let expectedMonthlyFee = 0
      if (isPC) {
        expectedMonthlyFee = 0
      } else {
        expectedMonthlyFee = this.resolveEffectiveTuition(studentRow?.class, feeRow, false).price
      }

      if (expectedMonthlyFee > 0 && totalPaid >= expectedMonthlyFee) {
        return {
          success: false,
          error: `Le mois d'écolage ${payment.month} est déjà intégralement réglé (${totalPaid.toLocaleString()} Ar / ${expectedMonthlyFee.toLocaleString()} Ar) pour cet élève.`
        }
      }
    }

    const receiptNumber =
      payment.receipt_number || this.generateReceiptNumber(cleanSchoolYear, currentStation)
    const cashierUser = payment.created_by || null

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
          fram: 'fram',
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

        // All student payments (tuition, transport, canteen, uniform, etc.) belong to 'eleve' department
        const cashDepartment = 'eleve'

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
      return { success: true, id, receipt_number: receiptNumber }
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
          AND deleted = 0
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
        AND deleted = 0
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
      conditions.push('date(sp.payment_date) >= ?')
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      conditions.push('date(sp.payment_date) <= ?')
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

  /**
   * Traçabilité complète des paiements (direction/admin) : actifs ET supprimés,
   * poste d'origine via le reçu, opérateur, statut sync + file, miroir caisse,
   * et nombre d'entrées d'audit. Permet de distinguer une erreur de manipulation
   * (suppression, antidate, mois décalé) d'une erreur logiciel (sync bloquée, collision).
   */
  static getTraceability(
    filters: {
      startDate?: string
      endDate?: string
      type?: string
      station?: string
      search?: string
      includeDeleted?: boolean
      syncStatus?: string
      schoolYear?: string
      limit?: number
      offset?: number
    } = {}
  ): { rows: Record<string, unknown>[]; total: number; signals: Record<string, number> } {
    const conditions: string[] = []
    const params: unknown[] = []

    if (!filters.includeDeleted) conditions.push('sp.deleted = 0')
    if (filters.startDate) {
      conditions.push('date(sp.payment_date) >= ?')
      params.push(filters.startDate)
    }
    if (filters.endDate) {
      conditions.push('date(sp.payment_date) <= ?')
      params.push(filters.endDate)
    }
    if (filters.type && filters.type !== 'all') {
      conditions.push('sp.payment_type = ?')
      params.push(filters.type)
    }
    if (filters.station && filters.station !== 'all') {
      conditions.push("sp.receipt_number LIKE ('%-' || ? || '-%')")
      params.push(filters.station)
    }
    if (filters.syncStatus && filters.syncStatus !== 'all') {
      conditions.push('sp.sync_status = ?')
      params.push(filters.syncStatus)
    }
    if (filters.schoolYear) {
      conditions.push("REPLACE(REPLACE(sp.school_year,'\"',''),'''','') = ?")
      params.push(filters.schoolYear)
    }
    if (filters.search) {
      const t = `%${filters.search.toLowerCase()}%`
      conditions.push(
        '(lower(s.first_name) LIKE ? OR lower(s.last_name) LIKE ? OR lower(s.registration_number) LIKE ? OR lower(sp.receipt_number) LIKE ? OR lower(sp.description) LIKE ? OR lower(sp.created_by) LIKE ?)'
      )
      params.push(t, t, t, t, t, t)
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
    const totalRow = db
      .prepare(`SELECT COUNT(*) as c FROM student_payments sp LEFT JOIN students s ON sp.student_id = s.id${where}`)
      .get(...params) as { c: number } | undefined
    const total = totalRow?.c || 0

    const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 2000)
    const offset = Math.max(Number(filters.offset) || 0, 0)

    const rows = db
      .prepare(
        `
        SELECT sp.*, s.first_name, s.last_name, s.registration_number, s.class as class_name,
          sq.status as queue_status, sq.error_message as queue_error,
          COALESCE(sq.updated_at, sq.created_at) as queue_updated_at,
          (SELECT COUNT(*) FROM audit_logs al WHERE al.table_name = 'student_payments' AND al.record_id = sp.id) as audit_count,
          (SELECT COUNT(*) FROM cash_journal cj WHERE cj.related_payment_id = sp.id) as cash_mirror_count,
          (SELECT COUNT(*) FROM cash_journal cj WHERE cj.related_payment_id = sp.id AND cj.deleted = 1) as cash_mirror_deleted_count
        FROM student_payments sp
        LEFT JOIN students s ON sp.student_id = s.id
        LEFT JOIN sync_queue sq ON sq.id = (
          SELECT MAX(id) FROM sync_queue WHERE table_name = 'student_payments' AND record_id = sp.id
        )
        ${where}
        ORDER BY sp.payment_date DESC, sp.created_at DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as Record<string, unknown>[]

    for (const r of rows) {
      const m = String(r.receipt_number || '').match(/^REC-\d{4}-([A-Z0-9]+)-/)
      r.origin_station = m ? m[1] : ''
    }

    // Signaux agrégés sur l'ENSEMBLE du jeu filtré (indépendants de la pagination) :
    // le filtre « Tous » page 1 ne doit plus masquer les antidatés/mois décalés des pages suivantes.
    const sig = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN sp.deleted = 1 THEN 1 ELSE 0 END) as deleted,
          SUM(CASE WHEN sq.status IN ('error','failed','quarantined') THEN 1 ELSE 0 END) as blocked,
          SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM cash_journal cj WHERE cj.related_payment_id = sp.id) THEN 1 ELSE 0 END) as orphan,
          SUM(CASE WHEN sp.payment_date IS NOT NULL AND sp.created_at IS NOT NULL AND date(sp.payment_date) < date(sp.created_at) THEN 1 ELSE 0 END) as backdated,
          SUM(CASE WHEN sp.month IS NOT NULL AND sp.month != '' AND sp.payment_date IS NOT NULL AND substr(sp.month,1,7) != substr(sp.payment_date,1,7) THEN 1 ELSE 0 END) as shifted
        FROM student_payments sp
        LEFT JOIN students s ON sp.student_id = s.id
        LEFT JOIN sync_queue sq ON sq.id = (
          SELECT MAX(id) FROM sync_queue WHERE table_name = 'student_payments' AND record_id = sp.id
        )
        ${where}
      `
      )
      .get(...params) as Record<string, number | null> | undefined
    const signals = {
      deleted: Number(sig?.deleted) || 0,
      blocked: Number(sig?.blocked) || 0,
      orphan: Number(sig?.orphan) || 0,
      backdated: Number(sig?.backdated) || 0,
      shifted: Number(sig?.shifted) || 0
    }
    return { rows, total, signals }
  }

  /** Piste d'audit complète d'un paiement (création, modifications, suppressions). */
  static getPaymentAuditTrail(paymentId: string): Record<string, unknown>[] {
    return db
      .prepare(
        `
        SELECT al.id, al.action, al.user_id, al.old_value, al.new_value, al.timestamp, u.username as user_name
        FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
        WHERE al.table_name = 'student_payments' AND al.record_id = ?
        ORDER BY al.id ASC
      `
      )
      .all(paymentId) as Record<string, unknown>[]
  }

  /**
   * Source de vérité unique de l'écolage : la fiche student_fees fait foi quand
   * monthly_tuition est explicitement renseigné (y compris 0 = exonération accordée) ;
   * la configuration centralisée (finance_prices) ne sert que de repli.
   */
  private static resolveEffectiveTuition(
    studentClass: string | null | undefined,
    feeRecord: Record<string, unknown> | null | undefined,
    isPersonnelChild: boolean
  ): { price: number; level: string } {
    const feeLevel = (feeRecord?.tuition_level as string) || ''
    const feeClass = (feeRecord?.class_name as string) || ''
    if (isPersonnelChild) return { price: 0, level: feeLevel || studentClass || '' }
    const monthly = feeRecord?.monthly_tuition
    if (monthly !== null && monthly !== undefined && monthly !== '') {
      return { price: Number(monthly) || 0, level: feeLevel || feeClass || studentClass || '' }
    }
    const candidates = [studentClass, feeLevel, feeClass].filter(Boolean) as string[]
    for (const candidate of candidates) {
      const config = StudentRepository.resolveTuitionConfig(candidate)
      if (config.price > 0) return { price: config.price, level: config.key || candidate }
    }
    return { price: 0, level: feeLevel || feeClass }
  }

  /** Règle Terminale centralisée (TA/TD/Terminale) — partagée par alertes, fiche et rapports. */
  private static isTerminaleClass(cls: string | null | undefined): boolean {
    const c = (cls || '').trim()
    return c === 'TA' || c === 'TD' || c === 'Terminale'
  }

  /** Clés de mois d'écolage centralisées (Sept→Juin, +Juillet si Terminale). */
  private static tuitionMonthKeys(
    startYear: number,
    endYear: number,
    isTerminale: boolean
  ): string[] {
    const keys = [
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
    return isTerminale ? [...keys, `${endYear}-07`] : keys
  }

  static getTuitionStatus(studentId: string, schoolYear: string): Record<string, unknown> {
    const cleanYear = schoolYear.replace(/['"]/g, '').trim()

    // 1. Get Fee Structure (même sélection déterministe que getUnpaidAlerts : plus ancienne fiche active)
    let feeRecord = db
      .prepare(
        `
      SELECT * FROM student_fees 
      WHERE student_id = ? AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
        AND deleted = 0
      ORDER BY created_at ASC, id ASC
      LIMIT 1
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

    // 2. Paiements d'écolage — même fenêtre canonique que la liste des impayés (getUnpaidAlerts)
    //    pour garantir la cohérence fiche ↔ alertes : année scolaire exacte, repli uniquement
    //    si school_year NULL/vide (mois de l'année OU date de paiement dans la fenêtre).
    const payments = db
      .prepare(
        `
      SELECT month, SUM(amount) as amount
      FROM student_payments
      WHERE student_id = ?
        AND payment_type = 'tuition'
        AND deleted = 0
        AND (
          REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
          OR (
            (school_year IS NULL OR REPLACE(REPLACE(school_year, '"', ''), '''', '') = '')
            AND (
              month LIKE ? OR month LIKE ?
              OR payment_date BETWEEN ? AND ?
            )
          )
        )
      GROUP BY month
    `
      )
      .all(
        studentId,
        cleanYear,
        `${startYear}-%`,
        `${endYear}-%`,
        `${startYear}-06-01`,
        `${endYear}-08-31`
      ) as {
      month: string
      amount: number
    }[]

    const studentObj = db
      .prepare(
        'SELECT class, is_personnel_child, departure_date FROM students WHERE id = ? AND deleted = 0'
      )
      .get(studentId) as
      | { class?: string; is_personnel_child?: unknown; departure_date?: string | null }
      | undefined
    const rawPC = studentObj?.is_personnel_child
    const isPersonnelChild =
      rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'

    const effective = this.resolveEffectiveTuition(studentObj?.class, feeRecord, isPersonnelChild)

    // 3. Calculate Status for each month
    //    Terminale déduit de la classe actuelle de l'élève (même source que les alertes),
    //    repli sur la fiche — et clés de mois issues du helper centralisé.
    const resolvedClass = (studentObj?.class as string) || (feeRecord?.class_name as string) || ''
    const isTerminale = this.isTerminaleClass(resolvedClass)

    const monthLabels: Record<string, string> = {
      '09': 'Septembre',
      '10': 'Octobre',
      '11': 'Novembre',
      '12': 'Décembre',
      '01': 'Janvier',
      '02': 'Février',
      '03': 'Mars',
      '04': 'Avril',
      '05': 'Mai',
      '06': 'Juin',
      '07': 'Juillet'
    }
    const months = this.tuitionMonthKeys(startYear, endYear, isTerminale).map((key) => ({
      name: monthLabels[key.slice(5)] || key,
      key
    }))

    // Tarif effectif : configuration centralisée prioritaire (même source que la liste impayés)
    const monthlyTuition = effective.price

    const status = months.map((m) => {
      const paidForMonth = payments.find((p) => p.month === m.key)?.amount || 0

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

      const months = this.tuitionMonthKeys(startYear, endYear, false)
      const terminaleMonths = this.tuitionMonthKeys(startYear, endYear, true)

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
               s.enrollment_date, s.siblings,
               sf.monthly_tuition, sf.tuition_level, sf.bus_subscribed, sf.bus_route, sf.bus_monthly_fee,
               sf.bus_free, sf.canteen_subscribed, sf.canteen_days_per_week, sf.canteen_days,
               sf.is_reenrollment, sf.enrollment_fee, sf.reenrollment_fee, sf.class_name,
               (SELECT COUNT(*) FROM student_fees sf_past 
                WHERE sf_past.student_id = s.id 
                  AND REPLACE(REPLACE(sf_past.school_year, '"', ''), '''', '') < ?
                  AND sf_past.deleted = 0) as past_years_count
        FROM students s
        LEFT JOIN student_fees sf ON sf.id = (
          SELECT sf2.id FROM student_fees sf2
          WHERE sf2.student_id = s.id
            AND REPLACE(REPLACE(sf2.school_year, '"', ''), '''', '') = ?
            AND sf2.deleted = 0
          ORDER BY sf2.created_at ASC, sf2.id ASC
          LIMIT 1
        )
        WHERE s.deleted = 0
      `
        )
        .all(targetYear, targetYear) as Array<Record<string, any>>

      if (students.length === 0) {
        return { success: true, alerts: [] }
      }

      // 3. Fetch Monthly Payments (tuition, bus, canteen)
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
              (school_year IS NULL OR REPLACE(REPLACE(school_year, '"', ''), '''', '') = '')
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

      // 4. Fetch Registration / Reenrollment Payments (droits)
      const droitPayments = db
        .prepare(
          `
        SELECT student_id, payment_type, SUM(amount) as total_paid
        FROM student_payments
        WHERE deleted = 0 
          AND payment_type IN ('enrollment', 'reenrollment')
          AND (
            REPLACE(REPLACE(school_year, '"', ''), '''', '') = ?
            OR (
              (school_year IS NULL OR REPLACE(REPLACE(school_year, '"', ''), '''', '') = '')
              AND payment_date BETWEEN ? AND ?
            )
          )
        GROUP BY student_id, payment_type
      `
        )
        .all(targetYear, `${startYear}-06-01`, `${endYear}-08-31`) as Array<{
        student_id: string
        payment_type: string
        total_paid: number
      }>

      const droitPaymentMap = new Map<string, { enrollment: number; reenrollment: number }>()
      droitPayments.forEach((p) => {
        const current = droitPaymentMap.get(p.student_id) || { enrollment: 0, reenrollment: 0 }
        if (p.payment_type === 'enrollment') {
          current.enrollment += p.total_paid
        } else if (p.payment_type === 'reenrollment') {
          current.reenrollment += p.total_paid
        }
        droitPaymentMap.set(p.student_id, current)
      })

      // 5. Fetch Unpaid Events (scoped to target school year)
      const unpaidEvents = db
        .prepare(
          `
        SELECT ep.id, ep.student_id, ep.event_id, e.name as event_name, e.event_date,
               ep.amount_due, ep.amount_paid, ep.created_at
        FROM event_payments ep
        JOIN parent_events e ON ep.event_id = e.id
        WHERE ep.paid = 0 AND ep.deleted = 0 AND e.deleted = 0
          AND (e.school_year = ? OR e.school_year IS NULL)
      `
        )
        .all(targetYear) as Array<{
        id: string
        student_id: string
        event_id: string
        event_name: string
        event_date: string | null
        amount_due: number
        amount_paid: number
        created_at: string
      }>

      const eventsMap = new Map<string, Array<Record<string, any>>>()
      unpaidEvents.forEach((ev) => {
        if (!eventsMap.has(ev.student_id)) eventsMap.set(ev.student_id, [])
        eventsMap.get(ev.student_id)!.push(ev)
      })
      // Garde anti-double-facturation : une seule ligne par élève et par événement —
      // celle portant un paiement, sinon la plus ancienne (déterministe, même règle que le healing).
      for (const [sid, rows] of eventsMap) {
        const byEvent = new Map<string, Record<string, any>>()
        for (const row of rows) {
          const prev = byEvent.get(row.event_id)
          if (!prev) {
            byEvent.set(row.event_id, row)
            continue
          }
          const rowHasPayment = row.amount_paid > 0
          const prevHasPayment = prev.amount_paid > 0
          if (rowHasPayment !== prevHasPayment) {
            if (rowHasPayment) byEvent.set(row.event_id, row)
            continue
          }
          if (
            row.created_at < prev.created_at ||
            (row.created_at === prev.created_at && row.id < prev.id)
          ) {
            byEvent.set(row.event_id, row)
          }
        }
        eventsMap.set(sid, Array.from(byEvent.values()))
      }

      // Couverture fratrie des événements : un événement est couvert pour toute la famille
      // dès qu'un membre a payé intégralement ou que le cumul famille atteint amount_per_parent.
      // Aligné sur EventRepository.getByStudent pour éviter la divergence badge / alertes.
      const epFullRows = db
        .prepare(
          `
        SELECT ep.student_id, ep.event_id, ep.amount_paid, ep.paid, e.amount_per_parent
        FROM event_payments ep
        JOIN parent_events e ON ep.event_id = e.id
        WHERE ep.deleted = 0 AND e.deleted = 0
          AND (e.school_year = ? OR e.school_year IS NULL)
      `
        )
        .all(targetYear) as Array<{
        student_id: string
        event_id: string
        amount_paid: number
        paid: number
        amount_per_parent: number
      }>
      const epByStudent = new Map<string, Map<string, { paid: number; amount_paid: number }>>()
      const amountPerParent = new Map<string, number>()
      for (const r of epFullRows) {
        amountPerParent.set(r.event_id, Number(r.amount_per_parent) || 0)
        if (!epByStudent.has(r.student_id)) epByStudent.set(r.student_id, new Map())
        epByStudent.get(r.student_id)!.set(r.event_id, {
          paid: Number(r.paid) || 0,
          amount_paid: Number(r.amount_paid) || 0
        })
      }
      const isEventCoveredByFamily = (student: Record<string, any>, eventId: string): boolean => {
        let siblingIds: string[] = []
        try {
          const parsed = student.siblings ? JSON.parse(student.siblings) : []
          if (Array.isArray(parsed)) siblingIds = parsed.filter((x) => typeof x === 'string')
        } catch {
          siblingIds = []
        }
        const familyIds = [student.id, ...siblingIds]
        const due = amountPerParent.get(eventId) || 0
        let familyPaid = 0
        for (const fid of familyIds) {
          const row = epByStudent.get(fid)?.get(eventId)
          if (!row) continue
          if (row.paid === 1) return true
          familyPaid += row.amount_paid
        }
        return due > 0 && familyPaid >= due
      }

      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      const alerts: Array<Record<string, unknown>> = []

      students.forEach((student) => {
        // Décision Direction : les élèves partis (departure_date renseigné) sont exclus de
        // toutes les alertes d'impayés, même s'ils n'ont rien payé (traçabilité conservée ailleurs).
        if (student.departure_date && String(student.departure_date).trim()) return

        const resolvedClass = student.class || student.class_name || ''
        const isTerminale = this.isTerminaleClass(resolvedClass)
        const studentMonths = isTerminale ? terminaleMonths : months

        let totalDue = 0
        const unpaidItems: Array<{
          type: string
          description: string
          amount: number
          month?: string
        }> = []

        // Helper to check monthly subscriptions (threshold at 100 Ar to prevent fractional/1 Ar residue)
        const checkMonthlyService = (
          type: string,
          monthlyCost: number,
          labelPrefix: string
        ): void => {
          if (monthlyCost <= 0) return
          studentMonths.forEach((m) => {
            if (m > currentMonth) return // Not yet due
            // Inscription tardive : aucun mois d'écolage/service facturé avant le mois d'inscription.
            if (student.enrollment_date && m < String(student.enrollment_date).substring(0, 7)) return

            const paidAmount = paymentMap.get(`${student.id}_${type}_${m}`) || 0
            const balance = monthlyCost - paidAmount
            if (balance >= 100) {
              unpaidItems.push({
                type,
                description: `${labelPrefix} (${m})`,
                amount: balance,
                month: m
              })
              totalDue += balance
            }
          })
        }

        // --- Droits d'inscription / réinscription ---
        const isDepartedBeforeSchoolYear =
          student.departure_date && student.departure_date < `${startYear}-09-01`
        if (!isDepartedBeforeSchoolYear) {
          const studentDroits = droitPaymentMap.get(student.id) || {
            enrollment: 0,
            reenrollment: 0
          }
          const hasReenPay = studentDroits.reenrollment > 0
          const hasEnrPay = studentDroits.enrollment > 0

          const isConfirmedReenrollment =
            student.is_reenrollment === 1 ||
            student.is_reenrollment === true ||
            student.is_reenrollment === '1'

          let isReturning = false
          if (isConfirmedReenrollment) {
            isReturning = true
          } else if (hasReenPay) {
            isReturning = true
          } else if (hasEnrPay) {
            isReturning = false
          } else {
            isReturning = Number(student.past_years_count) > 0
          }

          const defaultRegPrice = Number(prices.registration) || 140000
          const defaultReenPrice = Number(prices.reenrollment) || 115000
          const customFee = Number(isReturning ? student.reenrollment_fee : student.enrollment_fee) || 0
          const expectedDroit = customFee > 0 ? customFee : (isReturning ? defaultReenPrice : defaultRegPrice)

          const totalPaidDroit = studentDroits.enrollment + studentDroits.reenrollment
          const balanceDroit = expectedDroit - totalPaidDroit

          if (balanceDroit >= 100) {
            const droitType = isReturning ? 'reenrollment' : 'enrollment'
            const label = isReturning ? 'Réinscription' : "Frais d'inscription"
            unpaidItems.push({
              type: droitType,
              description: label,
              amount: balanceDroit
            })
            totalDue += balanceDroit
          }
        }

        // --- Tuition (Centralized Dynamic Pricing) ---
        const isPersonnelChild = StudentRepository.parseBoolean(student.is_personnel_child)

        let tuitionCost = 0
        if (!isPersonnelChild) {
          tuitionCost = this.resolveEffectiveTuition(
            student.class,
            {
              tuition_level: student.tuition_level,
              class_name: student.class_name,
              monthly_tuition: student.monthly_tuition
            },
            false
          ).price
        }
        checkMonthlyService('tuition', tuitionCost, 'Écolage')

        // --- Bus (transport exceptionnel : gratuité explicite vs donnée manquante) ---
        // bus_free = gratuité accordée (ni facture ni alerte). Sinon un abonnement sans axe
        // ou sans tarif est un signal de configuration à corriger, pas une facture silencieuse.
        if (student.bus_subscribed && !StudentRepository.parseBoolean(student.bus_free)) {
          if (student.bus_route === 'variable') {
            const customBusFee = Number(student.bus_monthly_fee) || 0
            if (customBusFee > 0) {
              checkMonthlyService('bus', customBusFee, 'Transport')
            }
            // Tarif variable sans forfait mensuel fixe : suivi géré à l'encaissement, pas d'alerte de config manquante.
          } else if (student.bus_route) {
            const customBusFee = Number(student.bus_monthly_fee) || 0
            const busCost =
              customBusFee > 0 ? customBusFee : prices?.bus?.[student.bus_route] || 0
            if (busCost > 0) {
              checkMonthlyService('bus', busCost, 'Transport')
            } else {
              unpaidItems.push({
                type: 'bus_config',
                description: `Transport : tarif manquant pour l'axe « ${student.bus_route} »`,
                amount: 0
              })
            }
          } else {
            unpaidItems.push({
              type: 'bus_config',
              description: 'Transport abonné sans axe renseigné',
              amount: 0
            })
          }
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
          // Fratrie : événement déjà couvert par la famille → pas d'alerte pour cet élève
          // (même règle que le badge « Payé (fratrie) » de la fiche événement).
          if (isEventCoveredByFamily(student, ev.event_id)) return
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
            class_name: resolvedClass || '-',
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
        AND deleted = 0
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
        AND p.deleted = 0
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
