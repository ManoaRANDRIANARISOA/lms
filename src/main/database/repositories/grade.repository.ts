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
  SubjectClassAverage,
  ClassSubject,
  ClassSubjectInput
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create subject error:', error)
      return { success: false, error: message }
    }
  }

  static listSubjects() {
    return db.prepare('SELECT * FROM subjects WHERE deleted = 0 ORDER BY name').all() as Subject[]
  }

  static updateSubject(id: string, updates: Partial<Subject>) {
    const allowed: Record<string, unknown> = {}
    const allowedFields = ['name', 'default_coefficient']
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        allowed[key] = (updates as Record<string, unknown>)[key]
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Update subject error:', error)
      return { success: false, error: message }
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // ============================================
  // CLASS_SUBJECTS CRUD (Phase 3)
  // ============================================

  static getClassSubjects(className: string): ClassSubject[] {
    return db.prepare(`
      SELECT cs.*, s.name as subject_name, s.default_coefficient as subject_default_coefficient
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      WHERE cs.class_name = ? AND cs.deleted = 0 AND s.deleted = 0
      ORDER BY cs.position, s.name
    `).all(className) as ClassSubject[]
  }

  static getAllClassSubjects(): ClassSubject[] {
    return db.prepare(`
      SELECT cs.*, s.name as subject_name, s.default_coefficient as subject_default_coefficient
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      WHERE cs.deleted = 0 AND s.deleted = 0
      ORDER BY cs.class_name, cs.position, s.name
    `).all() as ClassSubject[]
  }

  static createClassSubject(data: ClassSubjectInput) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
      `).run(id, data.class_name, data.subject_id, data.coefficient ?? 1, data.position ?? 0)
      addToSyncQueue('class_subjects', id, 'create', { id, ...data })
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE')) {
        return { success: false, error: 'Cette matière est déjà assignée à cette classe' }
      }
      return { success: false, error: message }
    }
  }

  static updateClassSubject(id: string, updates: Partial<ClassSubjectInput>) {
    const allowed: Record<string, unknown> = {}
    const allowedFields = ['coefficient', 'position']
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        allowed[key] = (updates as Record<string, unknown>)[key]
      }
    }
    if (Object.keys(allowed).length === 0) {
      return { success: false, error: 'Aucun champ valide à mettre à jour' }
    }

    const fields = Object.keys(allowed).map((k) => `${k} = ?`).join(', ')
    const values = Object.values(allowed)

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE class_subjects SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ? AND deleted = 0
      `).run(...values, id)
      addToSyncQueue('class_subjects', id, 'update', { id, ...allowed })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static deleteClassSubject(id: string) {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE class_subjects SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`).run(id)
      addToSyncQueue('class_subjects', id, 'delete', { deleted: true })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  /**
   * Get the coefficient for a subject in a specific class.
   * Falls back to the subject's default_coefficient if no class_subjects mapping exists.
   */
  static getSubjectCoefficient(subjectId: string, className: string): number {
    const cs = db.prepare(`
      SELECT coefficient FROM class_subjects
      WHERE class_name = ? AND subject_id = ? AND deleted = 0
    `).get(className, subjectId) as { coefficient: number } | undefined

    if (cs) return cs.coefficient

    const subj = db.prepare(`
      SELECT default_coefficient FROM subjects WHERE id = ? AND deleted = 0
    `).get(subjectId) as { default_coefficient: number } | undefined

    return subj?.default_coefficient ?? 1
  }

  /**
   * Get all distinct class names that have subjects configured.
   */
  static getClassesWithSubjects(): string[] {
    const rows = db.prepare(`
      SELECT DISTINCT class_name FROM class_subjects WHERE deleted = 0 ORDER BY class_name
    `).all() as { class_name: string }[]
    return rows.map(r => r.class_name)
  }

  // ============================================
  // GRADES CRUD
  // ============================================

  static createGrade(data: Omit<Grade, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'deleted'>) {
    const id = uuidv4()

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO grades (id, student_id, teacher_id, subject_id, school_year, term, grade, grade_journalier, grade_exam, coefficient, teacher_comment, behavior_note, created_at, updated_at, version, sync_status, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0)
      `).run(
        id,
        data.student_id,
        data.teacher_id || null,
        data.subject_id,
        data.school_year,
        data.term,
        data.grade,
        data.grade_journalier ?? null,
        data.grade_exam ?? null,
        data.coefficient ?? 1,
        data.teacher_comment || null,
        data.behavior_note || 'none'
      )
      addToSyncQueue('grades', id, 'create', { id, ...data })
    })

    try {
      transaction()
      return { success: true, id }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Create grade error:', error)
      return { success: false, error: message }
    }
  }

  static updateGrade(id: string, updates: Partial<Grade>) {
    const allowed: Record<string, unknown> = {}
    const allowedFields = ['grade', 'grade_journalier', 'grade_exam', 'coefficient', 'teacher_comment', 'behavior_note', 'teacher_id']
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        allowed[key] = (updates as Record<string, unknown>)[key]
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Update grade error:', error)
      return { success: false, error: message }
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static getGradesByStudent(studentId: string, schoolYear: string, term?: number) {
    let query = `
      SELECT g.*, s.name as subject_name, s.default_coefficient as subject_default_coefficient
      FROM grades g
      JOIN subjects s ON g.subject_id = s.id
      WHERE g.student_id = ? AND g.school_year = ? AND g.deleted = 0 AND s.deleted = 0
    `
    const params: unknown[] = [studentId, schoolYear]
    if (term !== undefined) {
      query += ' AND g.term = ?'
      params.push(term)
    }
    query += ' ORDER BY g.term, s.name'
    return db.prepare(query).all(...params) as GradeWithSubject[]
  }

  static getGradesByClass(className: string, schoolYear: string, term: number) {
    return db.prepare(`
      SELECT g.*, s.name as subject_name, st.first_name, st.last_name, st.class,
        COALESCE(cs.coefficient, s.default_coefficient, 1) as class_coefficient
      FROM grades g
      JOIN students st ON g.student_id = st.id
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN class_subjects cs ON cs.class_name = st.class AND cs.subject_id = g.subject_id AND cs.deleted = 0
      WHERE st.class = ? AND g.school_year = ? AND g.term = ? AND g.deleted = 0 AND st.deleted = 0 AND s.deleted = 0
      ORDER BY st.last_name, st.first_name, s.name
    `).all(className, schoolYear, term) as (GradeWithSubject & { first_name: string; last_name: string; class: string; class_coefficient: number })[]
  }

  static getStudentAverage(studentId: string, schoolYear: string, term: number): { average: number; totalCoefficient: number } | null {
    const rows = db.prepare(`
      SELECT g.grade,
        COALESCE(g.coefficient, cs.coefficient, s.default_coefficient, 1) as coeff
      FROM grades g
      JOIN subjects s ON g.subject_id = s.id
      JOIN students st ON g.student_id = st.id
      LEFT JOIN class_subjects cs ON cs.class_name = st.class AND cs.subject_id = g.subject_id AND cs.deleted = 0
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

  /**
   * Get class averages using only class_subjects subjects (even if no grades yet).
   * Returns all subjects configured for the class.
   */
  static getClassSubjectAverages(className: string, schoolYear: string, term: number): SubjectClassAverage[] {
    return db.prepare(`
      SELECT cs.subject_id, s.name as subject_name,
        COALESCE(AVG(g.grade), 0) as average,
        COUNT(DISTINCT g.student_id) as student_count
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      LEFT JOIN grades g ON g.subject_id = cs.subject_id
        AND g.school_year = ? AND g.term = ? AND g.deleted = 0
        AND g.student_id IN (SELECT id FROM students WHERE class = ? AND deleted = 0)
      WHERE cs.class_name = ? AND cs.deleted = 0 AND s.deleted = 0
      GROUP BY cs.subject_id, s.name, cs.position
      ORDER BY cs.position, s.name
    `).all(schoolYear, term, className, className) as SubjectClassAverage[]
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
