/**
 * grade.repository.ts — Grades & Subjects Management Repository
 *
 * CRUD subjects + grades + averages + class ranking.
 *
 * @module GradeRepository
 */

import db from '../db'
import { addToSyncQueue } from '../../services/sync.service'
import { v4 as uuidv4 } from 'uuid'
import type {
  Subject,
  Grade,
  GradeWithSubject,
  StudentTermAverage,
  SubjectClassAverage
} from '../../../shared/types'

// ============================================
// SUBJECTS CRUD
// ============================================

export class GradeRepository {
  static createSubject(data: Omit<Subject, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'deleted'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO subjects (id, name, default_coefficient, created_at, updated_at, version, sync_status, deleted)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
      `).run(id, data.name, data.default_coefficient ?? 1)
      addToSyncQueue('subjects', id, 'create', { id, ...data })
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create subject error:', error)
      return { success: false, error: error.message }
    }
  }

  static listSubjects() {
    return db.prepare('SELECT * FROM subjects WHERE deleted = 0 ORDER BY name').all() as Subject[]
  }

  static updateSubject(id: string, updates: Partial<Subject>) {
    const allowed: Record<string, any> = {}
    const allowedFields = ['name', 'default_coefficient']
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        allowed[key] = (updates as any)[key]
      }
    }
    if (Object.keys(allowed).length === 0) {
      return { success: false, error: 'Aucun champ valide à mettre à jour' }
    }

    const fields = Object.keys(allowed).map((k) => `${k} = ?`).join(', ')
    const values = Object.values(allowed)

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE subjects SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ? AND deleted = 0
      `).run(...values, id)
      addToSyncQueue('subjects', id, 'update', { id, ...allowed })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      console.error('Update subject error:', error)
      return { success: false, error: error.message }
    }
  }

  static deleteSubject(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE subjects SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`).run(id)
      addToSyncQueue('subjects', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ============================================
  // GRADES CRUD
  // ============================================

  static createGrade(data: Omit<Grade, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'deleted'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO grades (id, student_id, teacher_id, subject_id, school_year, term, grade, coefficient, teacher_comment, behavior_note, created_at, updated_at, version, sync_status, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
      `).run(
        id,
        data.student_id,
        data.teacher_id || null,
        data.subject_id,
        data.school_year,
        data.term,
        data.grade,
        data.coefficient ?? 1,
        data.teacher_comment || null,
        data.behavior_note || 'none'
      )
      addToSyncQueue('grades', id, 'create', { id, ...data })
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: any) {
      console.error('Create grade error:', error)
      return { success: false, error: error.message }
    }
  }

  static updateGrade(id: string, updates: Partial<Grade>) {
    const allowed: Record<string, any> = {}
    const allowedFields = ['grade', 'coefficient', 'teacher_comment', 'behavior_note', 'teacher_id']
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        allowed[key] = (updates as any)[key]
      }
    }
    if (Object.keys(allowed).length === 0) {
      return { success: false, error: 'Aucun champ valide à mettre à jour' }
    }

    const fields = Object.keys(allowed).map((k) => `${k} = ?`).join(', ')
    const values = Object.values(allowed)

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE grades SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ? AND deleted = 0
      `).run(...values, id)
      addToSyncQueue('grades', id, 'update', { id, ...allowed })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      console.error('Update grade error:', error)
      return { success: false, error: error.message }
    }
  }

  static deleteGrade(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE grades SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`).run(id)
      addToSyncQueue('grades', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  static getGradesByStudent(studentId: string, schoolYear: string, term?: number) {
    let query = `
      SELECT g.*, s.name as subject_name, s.default_coefficient as subject_default_coefficient
      FROM grades g
      JOIN subjects s ON g.subject_id = s.id
      WHERE g.student_id = ? AND g.school_year = ? AND g.deleted = 0 AND s.deleted = 0
    `
    const params: any[] = [studentId, schoolYear]
    if (term !== undefined) {
      query += ' AND g.term = ?'
      params.push(term)
    }
    query += ' ORDER BY g.term, s.name'
    return db.prepare(query).all(...params) as GradeWithSubject[]
  }

  static getGradesByClass(className: string, schoolYear: string, term: number) {
    return db.prepare(`
      SELECT g.*, s.name as subject_name, st.first_name, st.last_name, st.class
      FROM grades g
      JOIN students st ON g.student_id = st.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE st.class = ? AND g.school_year = ? AND g.term = ? AND g.deleted = 0 AND st.deleted = 0 AND s.deleted = 0
      ORDER BY st.last_name, st.first_name, s.name
    `).all(className, schoolYear, term) as (GradeWithSubject & { first_name: string; last_name: string; class: string })[]
  }

  static getStudentAverage(studentId: string, schoolYear: string, term: number): { average: number; totalCoefficient: number } | null {
    const rows = db.prepare(`
      SELECT g.grade, COALESCE(g.coefficient, s.default_coefficient, 1) as coeff
      FROM grades g
      JOIN subjects s ON g.subject_id = s.id
      WHERE g.student_id = ? AND g.school_year = ? AND g.term = ? AND g.deleted = 0 AND s.deleted = 0
    `).all(studentId, schoolYear, term) as { grade: number; coeff: number }[]

    if (rows.length === 0) return null

    let totalWeighted = 0
    let totalCoeff = 0
    for (const r of rows) {
      totalWeighted += r.grade * r.coeff
      totalCoeff += r.coeff
    }

    return {
      average: totalCoeff > 0 ? totalWeighted / totalCoeff : 0,
      totalCoefficient: totalCoeff
    }
  }

  static getClassAverages(className: string, schoolYear: string, term: number): SubjectClassAverage[] {
    return db.prepare(`
      SELECT g.subject_id, s.name as subject_name, AVG(g.grade) as average, COUNT(*) as student_count
      FROM grades g
      JOIN students st ON g.student_id = st.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE st.class = ? AND g.school_year = ? AND g.term = ? AND g.deleted = 0 AND st.deleted = 0 AND s.deleted = 0
      GROUP BY g.subject_id, s.name
      ORDER BY s.name
    `).all(className, schoolYear, term) as SubjectClassAverage[]
  }

  static getClassRanking(className: string, schoolYear: string, term: number): StudentTermAverage[] {
    const students = db.prepare(`
      SELECT id, first_name, last_name, class
      FROM students
      WHERE class = ? AND deleted = 0
      ORDER BY last_name, first_name
    `).all(className) as { id: string; first_name: string; last_name: string; class: string }[]

    const result: StudentTermAverage[] = []

    for (const st of students) {
      const avg = this.getStudentAverage(st.id, schoolYear, term)
      result.push({
        student_id: st.id,
        first_name: st.first_name,
        last_name: st.last_name,
        class: st.class,
        average: avg ? avg.average : 0,
        totalCoefficient: avg ? avg.totalCoefficient : 0,
        rank: 0 // computed below
      })
    }

    // Sort by average descending
    result.sort((a, b) => b.average - a.average)

    // Assign ranks (handle ties)
    for (let i = 0; i < result.length; i++) {
      if (i > 0 && result[i].average === result[i - 1].average) {
        result[i].rank = result[i - 1].rank
      } else {
        result[i].rank = i + 1
      }
    }

    return result
  }
}
