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
}
