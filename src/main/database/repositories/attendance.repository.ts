import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import { addToSyncQueue } from '../../services/sync.service'

export class AttendanceRepository {
  static getBusSubscribers(schoolYear: string) {
    return db
      .prepare(
        `
      SELECT s.id, s.first_name, s.last_name, s.class, s.registration_number, sf.bus_route
      FROM students s
      JOIN student_fees sf ON s.id = sf.student_id
      WHERE sf.school_year = ? AND sf.bus_subscribed = 1 AND s.deleted = 0
      ORDER BY s.class, s.last_name
    `
      )
      .all(schoolYear)
  }

  static getCanteenSubscribers(schoolYear: string) {
    return db
      .prepare(
        `
      SELECT s.id, s.first_name, s.last_name, s.class, s.registration_number
      FROM students s
      JOIN student_fees sf ON s.id = sf.student_id
      WHERE sf.school_year = ? AND sf.canteen_subscribed = 1 AND s.deleted = 0
      ORDER BY s.class, s.last_name
    `
      )
      .all(schoolYear)
  }

  static getBusAttendance(date: string) {
    return db
      .prepare(
        `
      SELECT student_id, present 
      FROM bus_attendance 
      WHERE attendance_date = ?
    `
      )
      .all(date)
  }

  static getCanteenAttendance(date: string) {
    return db
      .prepare(
        `
      SELECT student_id, present 
      FROM canteen_attendance 
      WHERE attendance_date = ?
    `
      )
      .all(date)
  }

  private static recordAttendance(
    tableName: string,
    date: string,
    records: { studentId: string; present: boolean }[]
  ) {
    const transaction = db.transaction(() => {
      for (const record of records) {
        const existing = db
          .prepare(`SELECT id FROM ${tableName} WHERE student_id = ? AND attendance_date = ?`)
          .get(record.studentId, date) as { id: string }

        if (existing) {
          db.prepare(
            `
            UPDATE ${tableName} 
            SET present = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
            WHERE id = ?
          `
          ).run(record.present ? 1 : 0, existing.id)

          addToSyncQueue(tableName, existing.id, 'update', { present: record.present })
        } else {
          const id = uuidv4()
          db.prepare(
            `
            INSERT INTO ${tableName} (id, student_id, attendance_date, present)
            VALUES (?, ?, ?, ?)
          `
          ).run(id, record.studentId, date, record.present ? 1 : 0)

          addToSyncQueue(tableName, id, 'create', {
            id,
            student_id: record.studentId,
            attendance_date: date,
            present: record.present
          })
        }
      }
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`${tableName} attendance error:`, error)
      return { success: false, error: message }
    }
  }

  static recordBusAttendance(date: string, records: { studentId: string; present: boolean }[]) {
    return this.recordAttendance('bus_attendance', date, records)
  }

  static recordCanteenAttendance(date: string, records: { studentId: string; present: boolean }[]) {
    return this.recordAttendance('canteen_attendance', date, records)
  }
}
