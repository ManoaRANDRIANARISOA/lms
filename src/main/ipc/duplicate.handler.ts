/**
 * duplicate.handler.ts — Duplicate Student Scanner & Safe Merge Tool
 *
 * Scans for duplicate student records (same first/last name, class or registration number).
 * Allows safe merging: preserves all payments/grades onto the primary record,
 * then marks the orphan duplicate as soft-deleted.
 *
 * @module DuplicateHandler
 */

import { ipcMain } from 'electron'
import db from '../database/db'
import { addToSyncQueue } from '../services/sync.service'
import { canWrite, getCurrentUser } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'

export interface DuplicateGroup {
  name: string
  records: Array<{
    id: string
    registration_number: string | null
    first_name: string | null
    last_name: string | null
    class_name: string | null
    created_at: string
    payments_count: number
    fees_count: number
    grades_count: number
  }>
}

export function canonicalizeMonth(rawMonth: string | null | undefined): string {
  if (!rawMonth) return ''
  const trimmed = rawMonth.trim().toLowerCase()
  const map: Record<string, string> = {
    '09': 'septembre',
    'septembre': 'septembre',
    'sep': 'septembre',
    'sept': 'septembre',
    '10': 'octobre',
    'octobre': 'octobre',
    'oct': 'octobre',
    '11': 'novembre',
    'novembre': 'novembre',
    'nov': 'novembre',
    '12': 'décembre',
    'decembre': 'décembre',
    'décembre': 'décembre',
    'dec': 'décembre',
    '01': 'janvier',
    'janvier': 'janvier',
    'jan': 'janvier',
    '02': 'février',
    'fevrier': 'février',
    'février': 'février',
    'fev': 'février',
    '03': 'mars',
    'mars': 'mars',
    'mar': 'mars',
    '04': 'avril',
    'avril': 'avril',
    'avr': 'avril',
    '05': 'mai',
    'mai': 'mai',
    '06': 'juin',
    'juin': 'juin',
    '07': 'juillet',
    'juillet': 'juillet',
    '08': 'août',
    'aout': 'août',
    'août': 'août'
  }
  const dateMatch = trimmed.match(/^\d{4}-(\d{2})/)
  if (dateMatch && map[dateMatch[1]]) {
    return map[dateMatch[1]]
  }
  for (const [k, v] of Object.entries(map)) {
    if (trimmed.includes(k)) return v
  }
  return trimmed
}

export function registerDuplicateHandlers(): void {
  // --------------------------------------------
  // SCAN FOR DUPLICATE STUDENTS
  // --------------------------------------------
  ipcMain.handle('duplicates:scan', async () => {
    try {
      // Find students sharing normalized first_name and last_name
      const duplicates = db
        .prepare(
          `
        SELECT 
          LOWER(TRIM(last_name)) as norm_last,
          LOWER(TRIM(first_name)) as norm_first,
          COUNT(*) as cnt
        FROM students
        WHERE deleted = 0
          AND last_name IS NOT NULL AND TRIM(last_name) != ''
        GROUP BY LOWER(TRIM(last_name)), LOWER(TRIM(first_name))
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
      `
        )
        .all() as { norm_last: string; norm_first: string; cnt: number }[]

      const groups: DuplicateGroup[] = []

      for (const d of duplicates) {
        const rows = db
          .prepare(
            `
          SELECT 
            s.id,
            s.registration_number,
            s.first_name,
            s.last_name,
            s.class as class_name,
            s.created_at,
            (SELECT COUNT(*) FROM student_payments p WHERE p.student_id = s.id AND p.deleted = 0) as payments_count,
            (SELECT COUNT(*) FROM student_fees f WHERE f.student_id = s.id AND f.deleted = 0) as fees_count,
            (SELECT COUNT(*) FROM grades g WHERE g.student_id = s.id) as grades_count
          FROM students s
          WHERE s.deleted = 0
            AND LOWER(TRIM(s.last_name)) = ?
            AND LOWER(TRIM(s.first_name)) = ?
          ORDER BY s.created_at ASC
        `
          )
          .all(d.norm_last, d.norm_first) as any[]

        if (rows.length > 1) {
          groups.push({
            name: `${rows[0].last_name || ''} ${rows[0].first_name || ''}`.trim(),
            records: rows
          })
        }
      }

      return { success: true, count: groups.length, groups }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur scan doublons'
      console.error('duplicates:scan error:', err)
      return { success: false, error: msg, groups: [] }
    }
  })

  // --------------------------------------------
  // MERGE DUPLICATES (PRESERVES PAYMENTS ON PRIMARY)
  // --------------------------------------------
  ipcMain.handle(
    'duplicates:merge',
    async (_, { keepId, removeId }: { keepId: string; removeId: string }) => {
      if (!canWrite('students')) {
        return { success: false, error: 'Accès refusé' }
      }

      const user = getCurrentUser()

      try {
        const keep = db.prepare('SELECT id, first_name, last_name FROM students WHERE id = ?').get(keepId) as any
        const remove = db.prepare('SELECT id, first_name, last_name FROM students WHERE id = ?').get(removeId) as any

        if (!keep || !remove) {
          return { success: false, error: 'Un des élèves est introuvable' }
        }

        const mergeTx = db.transaction(() => {
          // Re-point child records
          db.prepare('UPDATE student_payments SET student_id = ? WHERE student_id = ?').run(
            keepId,
            removeId
          )
          db.prepare('UPDATE grades SET student_id = ? WHERE student_id = ?').run(keepId, removeId)
          db.prepare('UPDATE bus_attendance SET student_id = ? WHERE student_id = ?').run(
            keepId,
            removeId
          )
          db.prepare('UPDATE canteen_attendance SET student_id = ? WHERE student_id = ?').run(
            keepId,
            removeId
          )

          // Soft delete duplicate
          db.prepare(
            `UPDATE students SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
          ).run(removeId)

          addToSyncQueue('students', removeId, 'delete', { id: removeId })
        })

        mergeTx()

        if (user) {
          logAction(
            user.id,
            'merge_duplicate_student',
            'students',
            removeId,
            null,
            `Fusion de ${remove.last_name} (${removeId}) vers profil conservé (${keepId})`
          )
        }

        return { success: true, message: 'Doublon fusionné et nettoyé avec succès !' }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur fusion doublons'
        console.error('duplicates:merge error:', err)
        return { success: false, error: msg }
      }
    }
  )

  // --------------------------------------------
  // SCAN FOR DUPLICATE PAYMENTS (Multi-Caisses C1 vs C2)
  // --------------------------------------------
  const PAYMENT_TYPE_LABELS: Record<string, string> = {
    tuition: 'Écolage',
    enrollment: 'Droit d’inscription',
    reenrollment: 'Réinscription',
    bus: 'Transport scolaire (Bus)',
    canteen: 'Cantine',
    uniform: 'Tenue / Uniforme',
    event: 'Événement scolaire',
    other: 'Frais divers'
  }

  ipcMain.handle('duplicates:scanPayments', async () => {
    try {
      const dupRows = db
        .prepare(
          `
        SELECT 
          sp.student_id,
          sp.payment_type,
          sp.school_year,
          CASE 
            WHEN sp.payment_type IN ('tuition', 'bus', 'canteen') THEN COALESCE(sp.month, '')
            WHEN sp.payment_type IN ('enrollment', 'reenrollment') THEN 'global'
            ELSE LOWER(TRIM(COALESCE(sp.description, '')))
          END as duplicate_key,
          COUNT(*) as cnt
        FROM student_payments sp
        WHERE sp.deleted = 0
        GROUP BY 
          sp.student_id, 
          sp.payment_type, 
          sp.school_year,
          CASE 
            WHEN sp.payment_type IN ('tuition', 'bus', 'canteen') THEN COALESCE(sp.month, '')
            WHEN sp.payment_type IN ('enrollment', 'reenrollment') THEN 'global'
            ELSE LOWER(TRIM(COALESCE(sp.description, '')))
          END
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
      `
        )
        .all() as {
        student_id: string
        payment_type: string
        school_year: string
        duplicate_key: string
        cnt: number
      }[]

      const groups: any[] = []

      for (const d of dupRows) {
        const student = db
          .prepare(
            `SELECT id, first_name, last_name, class as class_name, registration_number FROM students WHERE id = ?`
          )
          .get(d.student_id) as any

        if (!student) continue

        let query = `
          SELECT 
            sp.id,
            sp.receipt_number,
            sp.amount,
            sp.payment_date,
            sp.payment_method,
            sp.description,
            sp.month,
            sp.created_by,
            sp.created_at,
            sp.print_count
          FROM student_payments sp
          WHERE sp.student_id = ?
            AND sp.payment_type = ?
            AND (sp.school_year = ? OR (? IS NULL AND sp.school_year IS NULL))
            AND sp.deleted = 0
        `
        const params: any[] = [d.student_id, d.payment_type, d.school_year, d.school_year]

        if (d.payment_type === 'tuition' || d.payment_type === 'bus' || d.payment_type === 'canteen') {
          query += ` AND COALESCE(sp.month, '') = ?`
          params.push(d.duplicate_key)
        } else if (d.payment_type !== 'enrollment' && d.payment_type !== 'reenrollment') {
          query += ` AND LOWER(TRIM(COALESCE(sp.description, ''))) = ?`
          params.push(d.duplicate_key)
        }

        query += ` ORDER BY sp.payment_date ASC, sp.created_at ASC`

        const payments = db.prepare(query).all(...params) as any[]

        if (payments.length > 1) {
          const records = payments.map((p) => {
            let station = 'Inconnue'
            if (p.receipt_number) {
              const match = p.receipt_number.match(/REC-\d{4}-([A-Z0-9]+)-\d+/i)
              if (match) station = match[1].toUpperCase()
            }
            return {
              id: p.id,
              receipt_number: p.receipt_number,
              amount: p.amount,
              payment_date: p.payment_date,
              payment_method: p.payment_method || 'cash',
              created_by: p.created_by || 'Non renseigné',
              created_at: p.created_at,
              station,
              print_count: p.print_count || 0
            }
          })

          const displayPeriodOrDetail =
            d.payment_type === 'tuition' || d.payment_type === 'bus' || d.payment_type === 'canteen'
              ? payments[0].month || d.duplicate_key
              : payments[0].description || (d.payment_type === 'enrollment' || d.payment_type === 'reenrollment' ? 'Annuel' : '')

          groups.push({
            group_id: `${d.student_id}_${d.payment_type}_${d.school_year}_${d.duplicate_key}`,
            student: {
              id: student.id,
              first_name: student.first_name || '',
              last_name: student.last_name || '',
              class_name: student.class_name || null,
              registration_number: student.registration_number || null
            },
            payment_type: d.payment_type,
            payment_type_label: PAYMENT_TYPE_LABELS[d.payment_type] || d.payment_type,
            month: displayPeriodOrDetail,
            school_year: d.school_year || '',
            records
          })
        }
      }

      return { success: true, count: groups.length, groups }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur scan doublons de paiement'
      console.error('duplicates:scanPayments error:', err)
      return { success: false, error: msg, groups: [] }
    }
  })

  // --------------------------------------------
  // RESOLVE DUPLICATE PAYMENT (SAFE SOFT-DELETE)
  // --------------------------------------------
  ipcMain.handle(
    'duplicates:resolvePayment',
    async (
      _,
      {
        keepPaymentId,
        removePaymentId,
        reason
      }: { keepPaymentId: string; removePaymentId: string; reason?: string }
    ) => {
      if (!canWrite('payments')) {
        return { success: false, error: 'Accès refusé : gestion des paiements requise' }
      }

      const user = getCurrentUser()

      try {
        const keep = db
          .prepare('SELECT id, receipt_number, amount, student_id FROM student_payments WHERE id = ?')
          .get(keepPaymentId) as any
        const remove = db
          .prepare('SELECT id, receipt_number, amount, student_id FROM student_payments WHERE id = ?')
          .get(removePaymentId) as any

        if (!keep || !remove) {
          return { success: false, error: 'Un des paiements est introuvable' }
        }

        const resolveTx = db.transaction(() => {
          // 1. Soft-delete duplicate payment
          db.prepare(
            `UPDATE student_payments SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
          ).run(removePaymentId)
          addToSyncQueue('student_payments', removePaymentId, 'delete', { id: removePaymentId })

          // 2. Soft-delete associated cash_journal entries
          const cashEntries = db
            .prepare(
              `SELECT id FROM cash_journal WHERE (related_payment_id = ? OR (receipt_number = ? AND receipt_number IS NOT NULL AND receipt_number != '')) AND deleted = 0`
            )
            .all(removePaymentId, remove.receipt_number) as { id: string }[]

          for (const ce of cashEntries) {
            db.prepare(
              `UPDATE cash_journal SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
            ).run(ce.id)
            addToSyncQueue('cash_journal', ce.id, 'delete', { id: ce.id })
          }
        })

        resolveTx()

        if (user) {
          logAction(
            user.id,
            'cancel_duplicate_payment',
            'student_payments',
            removePaymentId,
            null,
            `Annulation paiement doublon ${remove.receipt_number || removePaymentId} (${remove.amount} Ar) conservé : ${keep.receipt_number || keepPaymentId} (${reason || 'Doublon caisse'})`
          )
        }

        return {
          success: true,
          message: `Doublon annulé avec succès (${remove.receipt_number || 'Reçu'} retiré, trésorerie et cloud synchronisés)`
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur résolution doublon paiement'
        console.error('duplicates:resolvePayment error:', err)
        return { success: false, error: msg }
      }
    }
  )

  // --------------------------------------------
  // AUTO RESOLVE ALL PAYMENT COLLISIONS (MULTI-POSTES)
  // Keeps the earliest receipt, cancels duplicate in cash & cloud
  // --------------------------------------------
  ipcMain.handle('duplicates:autoResolveCollisions', async () => {
    if (!canWrite('payments')) {
      return { success: false, error: 'Accès refusé : gestion des paiements requise' }
    }

    const user = getCurrentUser()

    try {
      const allPayments = db
        .prepare(
          `
        SELECT 
          sp.id,
          sp.student_id,
          sp.payment_type,
          sp.month,
          sp.description,
          sp.school_year,
          sp.amount,
          sp.payment_date,
          sp.created_at,
          sp.receipt_number,
          sp.created_by,
          s.first_name,
          s.last_name,
          s.class as class_name
        FROM student_payments sp
        JOIN students s ON s.id = sp.student_id
        WHERE sp.deleted = 0
        ORDER BY sp.payment_date ASC, sp.created_at ASC
      `
        )
        .all() as any[]

      // Group payments by student_id, cleanSchoolYear, payment_type, canonicalPeriod
      const groups = new Map<string, any[]>()
      for (const p of allPayments) {
        const cleanYear = (p.school_year || '').replace(/['"]/g, '').trim()
        const canonicalPeriod =
          p.payment_type === 'tuition' || p.payment_type === 'bus' || p.payment_type === 'canteen'
            ? canonicalizeMonth(p.month)
            : p.payment_type === 'enrollment' || p.payment_type === 'reenrollment'
              ? 'annual_droit'
              : (p.description || '').trim().toLowerCase()

        const groupKey = `${p.student_id}::${cleanYear}::${p.payment_type}::${canonicalPeriod}`
        if (!groups.has(groupKey)) {
          groups.set(groupKey, [])
        }
        groups.get(groupKey)!.push(p)
      }

      const collidingGroups = Array.from(groups.values()).filter((list) => list.length > 1)
      if (collidingGroups.length === 0) {
        return { success: true, count: 0, resolved: [], message: 'Aucune collision détectée. Vos paiements sont sains.' }
      }

      const resolvedList: any[] = []

      const autoTx = db.transaction(() => {
        for (const list of collidingGroups) {
          // Earliest payment is kept as the legitimate original
          const keep = list[0]
          const duplicates = list.slice(1)

          for (const remove of duplicates) {
            // 1. Soft-delete duplicate student_payment
            db.prepare(
              `UPDATE student_payments SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
            ).run(remove.id)
            addToSyncQueue('student_payments', remove.id, 'delete', { id: remove.id })

            // 2. Soft-delete corresponding cash_journal entries
            const cashEntries = db
              .prepare(
                `SELECT id FROM cash_journal 
                 WHERE (related_payment_id = ? OR (receipt_number = ? AND receipt_number IS NOT NULL AND receipt_number != '')) AND deleted = 0`
              )
              .all(remove.id, remove.receipt_number) as { id: string }[]

            for (const ce of cashEntries) {
              db.prepare(
                `UPDATE cash_journal SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
              ).run(ce.id)
              addToSyncQueue('cash_journal', ce.id, 'delete', { id: ce.id })
            }

            resolvedList.push({
              student_name: `${keep.last_name || ''} ${keep.first_name || ''}`.trim(),
              class_name: keep.class_name,
              payment_type: keep.payment_type,
              month: keep.month || keep.description || 'Annuel',
              amount: keep.amount,
              kept_receipt: keep.receipt_number || keep.id,
              removed_receipt: remove.receipt_number || remove.id
            })

            if (user) {
              logAction(
                user.id,
                'auto_cancel_duplicate_payment',
                'student_payments',
                remove.id,
                null,
                `Fusion auto multi-postes : Reçu doublon annulé ${remove.receipt_number || remove.id} (${remove.amount} Ar) au profit de l'original ${keep.receipt_number || keep.id}`
              )
            }
          }
        }
      })

      autoTx()

      return {
        success: true,
        count: resolvedList.length,
        resolved: resolvedList,
        message: `${resolvedList.length} paiement(s) en collision résolu(s) automatiquement. Les exemplaires originaux ont été conservés.`
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur auto-résolution collisions'
      console.error('duplicates:autoResolveCollisions error:', err)
      return { success: false, error: msg }
    }
  })
}
