import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'
import { StudentRepository } from './student.repository'
import { PaymentRepository, normalizeStationCode } from './payment.repository'
import { SettingsRepository } from './settings.repository'

export interface ParentEvent {
  id: string
  name: string
  event_date: string
  amount_per_parent: number
  description?: string
  status: 'planned' | 'ongoing' | 'completed'
  school_year?: string
}

export interface EventPayment {
  id: string
  event_id: string
  student_id: string
  parent_id?: string
  amount_due: number
  amount_paid: number
  paid: boolean
  payment_date?: string
}

export class EventRepository {
  static create(event: Omit<ParentEvent, 'id'>) {
    const id = uuidv4()

    try {
      db.prepare(
        `
        INSERT INTO parent_events (id, name, event_date, amount_per_parent, description, status, school_year)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        event.name,
        event.event_date,
        event.amount_per_parent,
        event.description || null,
        event.status || 'planned',
        event.school_year || null
      )

      addToSyncQueue('parent_events', id, 'create', { id, ...event })

      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error creating event:', error)
      return { success: false, error: message }
    }
  }

  static list(schoolYear?: string) {
    try {
      let query = 'SELECT * FROM parent_events WHERE deleted = 0'
      const params: any[] = []

      if (schoolYear) {
        query += ' AND (school_year = ? OR school_year IS NULL)'
        params.push(schoolYear)
      }

      query += ' ORDER BY event_date DESC'

      const events = db.prepare(query).all(...params)
      return { success: true, events }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static getById(id: string) {
    try {
      const event = db.prepare('SELECT * FROM parent_events WHERE id = ?').get(id)
      if (!event) return { success: false, error: 'Event not found' }

      // Get participation stats
      const participation = db
        .prepare(
          `
        SELECT 
          ep.*, 
          s.first_name, s.last_name, s.class
        FROM event_payments ep
        JOIN students s ON ep.student_id = s.id
        WHERE ep.event_id = ? AND ep.deleted = 0
      `
        )
        .all(id)

      return { success: true, event, participation }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static update(id: string, updates: Partial<ParentEvent>) {
    try {
      const fields = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(', ')
      const values = Object.values(updates)

      db.prepare(
        `
        UPDATE parent_events 
        SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `
      ).run(...values, id)

      addToSyncQueue('parent_events', id, 'update', updates)

      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static delete(id: string) {
    try {
      db.prepare(
        `
        UPDATE parent_events 
        SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' 
        WHERE id = ?
      `
      ).run(id)

      addToSyncQueue('parent_events', id, 'delete', { deleted: true })

      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // Initialize participants for an event (e.g. all students or specific class)
  static addParticipants(eventId: string, studentIds: string[], amountDue: number) {
    const transaction = db.transaction(() => {
      for (const studentId of studentIds) {
        // INSERT OR IGNORE + index unique partiel (event_id, student_id) WHERE deleted=0 :
        // un poste aux données périmées ne peut plus créer de doublon de participation.
        const id = uuidv4()
        const res = db
          .prepare(
            `
            INSERT OR IGNORE INTO event_payments (id, event_id, student_id, amount_due, amount_paid, paid)
            VALUES (?, ?, ?, ?, 0, 0)
          `
          )
          .run(id, eventId, studentId, amountDue)

        if (res.changes > 0) {
          addToSyncQueue('event_payments', id, 'create', {
            id,
            event_id: eventId,
            student_id: studentId,
            amount_due: amountDue,
            amount_paid: 0,
            paid: false
          })
        }
      }
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // Healing idempotent au démarrage : un poste aux données périmées a ré-ajouté tous les
  // participants d'un événement (vague du 27/10 : 772 doublons vides). Règle déterministe :
  // on garde la ligne portant un paiement, sinon la plus ancienne ; seules les lignes VIDES
  // sont tombstonées (deleted=1) et propagées via la file de sync — aucun montant touché.
  static healDuplicateParticipants(): { duplicatesRemoved: number; departedRemoved: number } {
    let duplicatesRemoved = 0
    let departedRemoved = 0
    try {
      const tombstone = (id: string): void => {
        db.prepare(
          `UPDATE event_payments SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
        ).run(id)
        addToSyncQueue('event_payments', id, 'delete', { deleted: true })
      }

      const dupGroups = db
        .prepare(
          `SELECT event_id, student_id FROM event_payments WHERE deleted = 0
           GROUP BY event_id, student_id HAVING COUNT(*) > 1`
        )
        .all() as Array<{ event_id: string; student_id: string }>

      db.transaction(() => {
        for (const g of dupGroups) {
          const rows = db
            .prepare(
              `SELECT id, amount_paid, paid FROM event_payments
               WHERE event_id = ? AND student_id = ? AND deleted = 0
               ORDER BY (amount_paid > 0) DESC, created_at ASC, id ASC`
            )
            .all(g.event_id, g.student_id) as Array<{
            id: string
            amount_paid: number
            paid: number
          }>
          for (const row of rows.slice(1)) {
            if (row.amount_paid > 0 || row.paid === 1) continue
            tombstone(row.id)
            duplicatesRemoved++
          }
        }

        // Élèves partis avant la date de l'événement : participation vide tombstonée.
        // Une participation payée est conservée (traçabilité) ; les alertes l'ignorent via la garde departure_date.
        const departed = db
          .prepare(
            `SELECT ep.id FROM event_payments ep
             JOIN parent_events e ON e.id = ep.event_id
             JOIN students s ON s.id = ep.student_id
             WHERE ep.deleted = 0 AND e.deleted = 0 AND ep.amount_paid = 0 AND ep.paid = 0
               AND s.departure_date IS NOT NULL AND s.departure_date != ''
               AND substr(s.departure_date, 1, 10) < e.event_date`
          )
          .all() as Array<{ id: string }>
        for (const row of departed) {
          tombstone(row.id)
          departedRemoved++
        }
      })()

      db.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_event_payments_active
         ON event_payments(event_id, student_id) WHERE deleted = 0`
      ).run()
    } catch (err) {
      console.error('Event participant healing failed:', err)
    }
    return { duplicatesRemoved, departedRemoved }
  }

  static recordPayment(
    eventId: string,
    studentId: string,
    amount: number,
    paymentMethod: string = 'cash',
    cashierName?: string
  ): { success: boolean; error?: string } {
    // Mêmes normes que PaymentRepository.create : station configurée, caissier réel,
    // élève actif, caisse non scellée — la norme REC-YYYY-C<station>-XXXXX ne souffre pas d'exception.
    const rawStation = SettingsRepository.get('pos_station_code') as string
    if (!rawStation || !String(rawStation).trim()) {
      return {
        success: false,
        error:
          'Code station non configuré sur ce poste. Configurez-le dans les Paramètres (ex. C1, C2…) avant toute saisie de paiement — norme de numérotation REC-YYYY-C<station>-XXXXX.'
      }
    }
    const currentStation = normalizeStationCode(rawStation)

    if (!cashierName || !cashierName.trim()) {
      return { success: false, error: 'Session opérateur introuvable. Veuillez vous reconnecter.' }
    }
    const cashierUser = cashierName.trim()

    const targetStudent = db
      .prepare('SELECT id, deleted FROM students WHERE id = ?')
      .get(studentId) as { id: string; deleted: number } | undefined
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

    const paymentDate = new Date().toISOString().split('T')[0]
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
      .get(paymentDate, currentStation) as
      | { id: string; station_code: string; notes?: string }
      | undefined
    if (closure) {
      const zMatch = closure.notes ? closure.notes.match(/\[(Z-[^\]]+)\]/) : null
      const zLabel = zMatch ? zMatch[1] : `Z-${closure.station_code}`
      return {
        success: false,
        error: `La caisse du poste ${currentStation} est clôturée et scellée pour le ${paymentDate} (${zLabel}). Saisie verrouillée. Déverrouillage Direction requis.`
      }
    }

    const transaction = db.transaction(() => {
      // 1. Get or Create Event Payment Record
      let paymentRecord = db
        .prepare(
          `SELECT * FROM event_payments WHERE event_id = ? AND student_id = ? AND deleted = 0
           ORDER BY (amount_paid > 0) DESC, created_at ASC, id ASC LIMIT 1`
        )
        .get(eventId, studentId) as Record<string, unknown> | undefined

      if (!paymentRecord) {
        // Create if not exists (adhoc participation)
        const event = db
          .prepare('SELECT amount_per_parent FROM parent_events WHERE id = ?')
          .get(eventId) as { amount_per_parent: number } | undefined
        const amountDue = event ? event.amount_per_parent : amount

        const id = uuidv4()
        db.prepare(
          `
          INSERT INTO event_payments (id, event_id, student_id, amount_due, amount_paid, paid)
          VALUES (?, ?, ?, ?, 0, 0)
        `
        ).run(id, eventId, studentId, amountDue)

        paymentRecord = { id, amount_paid: 0, amount_due: amountDue }

        addToSyncQueue('event_payments', id, 'create', {
          id,
          event_id: eventId,
          student_id: studentId,
          amount_due: amountDue,
          amount_paid: 0,
          paid: false
        })
      }

      // 2. Update Event Payment Record
      const newAmountPaid = (paymentRecord.amount_paid as number) + amount
      const isPaid = newAmountPaid >= (paymentRecord.amount_due as number)

      db.prepare(
        `
        UPDATE event_payments 
        SET amount_paid = ?, paid = ?, payment_date = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `
      ).run(newAmountPaid, isPaid ? 1 : 0, paymentDate, paymentRecord.id as string)

      addToSyncQueue('event_payments', paymentRecord.id as string, 'update', {
        amount_paid: newAmountPaid,
        paid: isPaid,
        payment_date: paymentDate
      })

      // 3. Record in General Ledger (Student Payments)
      const ledgerId = uuidv4()
      const schoolYear = StudentRepository.getCurrentSchoolYear()
      const receiptNumber = PaymentRepository.generateReceiptNumber(schoolYear, currentStation)

      db.prepare(
        `
        INSERT INTO student_payments (
            id, student_id, payment_date, amount, payment_type, description, payment_method, school_year, receipt_number, created_by, print_count
        ) VALUES (?, ?, ?, ?, 'event', ?, ?, ?, ?, ?, 0)
      `
      ).run(
        ledgerId,
        studentId,
        paymentDate,
        amount,
        `Paiement événement: ${eventId}`,
        paymentMethod,
        schoolYear,
        receiptNumber,
        cashierUser
      )

      addToSyncQueue('student_payments', ledgerId, 'create', {
        id: ledgerId,
        student_id: studentId,
        payment_date: paymentDate,
        amount,
        payment_type: 'event',
        description: `Paiement événement: ${eventId}`,
        payment_method: paymentMethod,
        school_year: schoolYear,
        receipt_number: receiptNumber,
        created_by: cashierUser
      })

      // 4. Create cash_journal entry
      const studentName = db
        .prepare('SELECT first_name, last_name FROM students WHERE id = ?')
        .get(studentId) as { first_name: string; last_name: string } | undefined

      const eventName = db.prepare('SELECT name FROM parent_events WHERE id = ?').get(eventId) as
        | { name: string }
        | undefined

      const cashDescription = studentName
        ? `Paiement événement (${eventName?.name || eventId}) — ${studentName.last_name} ${studentName.first_name}`
        : `Paiement événement (${eventName?.name || eventId})`

      const cashId = uuidv4()
      db.prepare(
        `
        INSERT INTO cash_journal (
          id, transaction_date, type, department, category, amount, description, payment_method, related_student_id, related_payment_id, receipt_number, created_by
        ) VALUES (?, ?, 'income', 'eleve', 'événement', ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(cashId, paymentDate, amount, cashDescription, paymentMethod, studentId, ledgerId, receiptNumber, cashierUser)

      addToSyncQueue('cash_journal', cashId, 'create', {
        id: cashId,
        transaction_date: paymentDate,
        type: 'income',
        department: 'eleve',
        category: 'événement',
        amount: amount,
        description: cashDescription,
        payment_method: paymentMethod,
        related_student_id: studentId,
        related_payment_id: ledgerId,
        receipt_number: receiptNumber,
        created_by: cashierUser
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
  static getByStudent(studentId: string, schoolYear?: string) {
    try {
      // Get student and siblings
      const student = db.prepare('SELECT siblings FROM students WHERE id = ?').get(studentId) as
        | { siblings: string }
        | undefined
      if (!student) return { success: false, error: 'Student not found' }

      const siblings = student.siblings ? JSON.parse(student.siblings) : []
      const familyIds = [studentId, ...siblings]
      const placeholders = familyIds.map(() => '?').join(', ')

      // Get all event payments for this family (ignore those soft-deleted once the column exists)
      const hasEpDeleted = (
        db.prepare('PRAGMA table_info(event_payments)').all() as Array<{ name: string }>
      ).some((c) => c.name === 'deleted')
      const payments = db
        .prepare(
          `
        SELECT 
          ep.event_id, ep.amount_due, ep.amount_paid, ep.paid, ep.payment_date, ep.student_id,
          s.first_name, s.last_name
        FROM event_payments ep
        JOIN students s ON ep.student_id = s.id
        WHERE ep.student_id IN (${placeholders})
          ${hasEpDeleted ? 'AND ep.deleted = 0' : ''}
      `
        )
        .all(...familyIds) as any[]

      if (payments.length === 0) {
        return { success: true, events: [] }
      }

      const eventIds = [...new Set(payments.map((p) => p.event_id))]
      const eventPlaceholders = eventIds.map(() => '?').join(', ')

      // Get event details (active events only — deleted duplicates must not appear in the dossier)
      let eventQuery = `SELECT * FROM parent_events WHERE deleted = 0 AND id IN (${eventPlaceholders})`
      const params = [...eventIds]

      if (schoolYear) {
        eventQuery += ` AND (school_year = ? OR school_year IS NULL)`
        params.push(schoolYear)
      }

      eventQuery += ` ORDER BY event_date DESC`

      const events = db.prepare(eventQuery).all(...params) as any[]

      // Combine
      const result = events.map((ev) => {
        const familyPayments = payments.filter((p) => p.event_id === ev.id)
        const totalPaid = familyPayments.reduce((sum, p) => sum + p.amount_paid, 0)
        // If any sibling is fully paid, the event is considered paid for the family
        const isPaid = familyPayments.some((p) => p.paid === 1) || totalPaid >= ev.amount_per_parent
        // L'élève a-t-il réglé lui-même (vs couvert uniquement par un frère/sœur) ?
        // Sert au badge « RÉGLÉ » vs « RÉGLÉ (FRATRIE) » — un élève sans fratrie qui paie
        // lui-même ne doit jamais voir la mention fratrie.
        const selfPayment = familyPayments.find((p) => p.student_id === studentId)
        const selfPaid =
          !!selfPayment &&
          (selfPayment.paid === 1 || selfPayment.amount_paid >= ev.amount_per_parent)

        return {
          ...ev,
          event_name: ev.name,
          family_payment_status: {
            total_paid: totalPaid,
            is_paid: isPaid,
            self_paid: selfPaid,
            payments: familyPayments
          }
        }
      })

      return { success: true, events: result }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }
}
