/**
 * grade.handler.ts — IPC Handlers for Grades & Subjects Management
 *
 * RBAC resource: 'grades'
 *   - admin:        full
 *   - secretariat:  full
 *   - accounting:   none
 *   - direction:    read
 *
 * @module GradeHandler
 */

import { ipcMain } from 'electron'
import { canRead, canWrite } from '../auth/rbac.service'
import { GradeRepository } from '../database/repositories/grade.repository'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'

export function registerGradeHandlers(): void {
  // --------------------------------------------
  // SUBJECTS
  // --------------------------------------------
  ipcMain.handle('grade:createSubject', async (_, data) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.createSubject(data)
      if (result.success) {
        logAction(
          getCurrentUser()?.id || null,
          'create',
          'subjects',
          result.id,
          null,
          JSON.stringify(data)
        )
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la création de la matière' }
    }
  })

  ipcMain.handle('grade:listSubjects', async () => {
    if (!canRead('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const subjects = GradeRepository.listSubjects()
      return { success: true, subjects }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des matières' }
    }
  })

  ipcMain.handle('grade:updateSubject', async (_, id: string, updates: Record<string, unknown>) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.updateSubject(id, updates)
      if (result.success) {
        logAction(
          getCurrentUser()?.id || null,
          'update',
          'subjects',
          id,
          null,
          JSON.stringify(updates)
        )
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la mise à jour' }
    }
  })

  ipcMain.handle('grade:deleteSubject', async (_, id: string) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.deleteSubject(id)
      if (result.success) {
        logAction(getCurrentUser()?.id || null, 'delete', 'subjects', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  // --------------------------------------------
  // GRADES
  // --------------------------------------------
  ipcMain.handle('grade:createGrade', async (_, data: Record<string, unknown>) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.createGrade(
        data as Parameters<typeof GradeRepository.createGrade>[0]
      )
      if (result.success) {
        logAction(
          getCurrentUser()?.id || null,
          'create',
          'grades',
          result.id,
          null,
          JSON.stringify(data)
        )
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la création de la note' }
    }
  })

  ipcMain.handle('grade:updateGrade', async (_, id: string, updates: Record<string, unknown>) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.updateGrade(id, updates)
      if (result.success) {
        logAction(
          getCurrentUser()?.id || null,
          'update',
          'grades',
          id,
          null,
          JSON.stringify(updates)
        )
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la mise à jour' }
    }
  })

  ipcMain.handle('grade:deleteGrade', async (_, id: string) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.deleteGrade(id)
      if (result.success) {
        logAction(getCurrentUser()?.id || null, 'delete', 'grades', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  ipcMain.handle(
    'grade:getGradesByStudent',
    async (_, studentId: string, schoolYear: string, term?: number) => {
      if (!canRead('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const grades = GradeRepository.getGradesByStudent(studentId, schoolYear, term)
        return { success: true, grades }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du chargement des notes' }
      }
    }
  )

  ipcMain.handle(
    'grade:getGradesByClass',
    async (_, className: string, schoolYear: string, term: number) => {
      if (!canRead('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const grades = GradeRepository.getGradesByClass(className, schoolYear, term)
        return { success: true, grades }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du chargement des notes' }
      }
    }
  )

  ipcMain.handle(
    'grade:getStudentAverage',
    async (_, studentId: string, schoolYear: string, term: number) => {
      if (!canRead('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const average = GradeRepository.getStudentAverage(studentId, schoolYear, term)
        return { success: true, average }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du calcul de la moyenne' }
      }
    }
  )

  ipcMain.handle(
    'grade:getClassAverages',
    async (_, className: string, schoolYear: string, term: number) => {
      if (!canRead('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const averages = GradeRepository.getClassAverages(className, schoolYear, term)
        return { success: true, averages }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du calcul des moyennes' }
      }
    }
  )

  ipcMain.handle(
    'grade:getClassRanking',
    async (_, className: string, schoolYear: string, term: number) => {
      if (!canRead('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const ranking = GradeRepository.getClassRanking(className, schoolYear, term)
        return { success: true, ranking }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du calcul du classement' }
      }
    }
  )

  // --------------------------------------------
  // CLASS_SUBJECTS (Phase 3)
  // --------------------------------------------

  ipcMain.handle('grade:getClassSubjects', async (_, className: string) => {
    if (!canRead('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const subjects = GradeRepository.getClassSubjects(className)
      return { success: true, subjects }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des matières de la classe' }
    }
  })

  ipcMain.handle('grade:getAllClassSubjects', async () => {
    if (!canRead('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const subjects = GradeRepository.getAllClassSubjects()
      return { success: true, subjects }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des matières' }
    }
  })

  ipcMain.handle('grade:createClassSubject', async (_, data: Record<string, unknown>) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.createClassSubject(
        data as unknown as Parameters<typeof GradeRepository.createClassSubject>[0]
      )
      if (result.success) {
        logAction(
          getCurrentUser()?.id || null,
          'create',
          'class_subjects',
          result.id,
          null,
          JSON.stringify(data)
        )
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: "Erreur lors de l'ajout de la matière" }
    }
  })

  ipcMain.handle(
    'grade:updateClassSubject',
    async (_, id: string, updates: Record<string, unknown>) => {
      if (!canWrite('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const result = GradeRepository.updateClassSubject(id, updates)
        if (result.success) {
          logAction(
            getCurrentUser()?.id || null,
            'update',
            'class_subjects',
            id,
            null,
            JSON.stringify(updates)
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors de la mise à jour' }
      }
    }
  )

  ipcMain.handle('grade:deleteClassSubject', async (_, id: string) => {
    if (!canWrite('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = GradeRepository.deleteClassSubject(id)
      if (result.success) {
        logAction(getCurrentUser()?.id || null, 'delete', 'class_subjects', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  ipcMain.handle('grade:getClassesWithSubjects', async () => {
    if (!canRead('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const classes = GradeRepository.getClassesWithSubjects()
      return { success: true, classes }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des classes' }
    }
  })

  ipcMain.handle(
    'grade:getClassSubjectAverages',
    async (_, className: string, schoolYear: string, term: number) => {
      if (!canRead('grades')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const averages = GradeRepository.getClassSubjectAverages(className, schoolYear, term)
        return { success: true, averages }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du calcul des moyennes' }
      }
    }
  )
}
