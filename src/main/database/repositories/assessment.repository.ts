import db from '../db'
import { v4 as uuidv4 } from 'uuid'

export interface Assessment {
  id: string
  school_year: string
  class_name: string | null
  name: string
  term_value: number
  weight: number
  created_at: string
  updated_at: string
}

export const AssessmentRepository = {
  create: (data: Omit<Assessment, 'id' | 'created_at' | 'updated_at'>): { success: boolean; id?: string; error?: string } => {
    try {
      const id = uuidv4()
      
      const stmt = db.prepare(`
        INSERT INTO assessments (id, school_year, class_name, name, term_value, weight)
        VALUES (@id, @school_year, @class_name, @name, @term_value, @weight)
      `)
      
      stmt.run({
        id,
        school_year: data.school_year,
        class_name: data.class_name,
        name: data.name,
        term_value: data.term_value,
        weight: data.weight || 1.0
      })
      
      return { success: true, id }
    } catch (error) {
      console.error('Error creating assessment:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  },

  list: (schoolYear: string, className?: string): { success: boolean; assessments?: Assessment[]; error?: string } => {
    try {
      let stmt
      
      if (className) {
        // Obtenir les évaluations globales (class_name is null) ET celles spécifiques à la classe
        stmt = db.prepare(`
          SELECT * FROM assessments 
          WHERE school_year = ? AND (class_name IS NULL OR class_name = ?)
          ORDER BY term_value ASC
        `)
        const rows = stmt.all(schoolYear, className) as Assessment[]
        return { success: true, assessments: rows }
      } else {
        stmt = db.prepare(`
          SELECT * FROM assessments 
          WHERE school_year = ?
          ORDER BY term_value ASC
        `)
        const rows = stmt.all(schoolYear) as Assessment[]
        return { success: true, assessments: rows }
      }
    } catch (error) {
      console.error('Error listing assessments:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  },

  update: (id: string, updates: Partial<Assessment>): { success: boolean; error?: string } => {
    try {
      const setFields = Object.keys(updates)
        .filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at')
        .map(k => `${k} = @${k}`)
        
      if (setFields.length === 0) return { success: true }
      
      setFields.push('updated_at = CURRENT_TIMESTAMP')
      
      const stmt = db.prepare(`
        UPDATE assessments 
        SET ${setFields.join(', ')}
        WHERE id = @id
      `)
      
      stmt.run({ ...updates, id })
      return { success: true }
    } catch (error) {
      console.error('Error updating assessment:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  },

  delete: (id: string): { success: boolean; error?: string } => {
    try {
      const stmt = db.prepare('DELETE FROM assessments WHERE id = ?')
      stmt.run(id)
      return { success: true }
    } catch (error) {
      console.error('Error deleting assessment:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}
