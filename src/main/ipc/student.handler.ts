/**
 * student.handler.ts — IPC Handlers for Student Management
 *
 * Manages student CRUD operations, re-enrollment, and service stats.
 * All operations are protected by RBAC checks with audit logging.
 *
 * Permission resource: 'students'
 *   - admin:        full access
 *   - secretariat:  full access
 *   - accounting:   read only
 *   - direction:    full access
 *
 * @module StudentHandler
 */

import { ipcMain } from 'electron'
import { canRead, canWrite } from '../auth/rbac.service'
import { StudentRepository } from '../database/repositories/student.repository'
import { syncWithCloud } from '../services/sync.service'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'

export function registerStudentHandlers(): void {
  // --------------------------------------------
  // CREATE STUDENT
  // --------------------------------------------
  ipcMain.handle('student:create', async (_, studentData) => {
    if (!canWrite('students')) {
      return { success: false, error: 'Accès refusé: création élève' }
    }
    // Kick off a background sync to fetch the latest registration number sequence,
    // but never block creation waiting for the network.
    syncWithCloud().catch((e) => {
      console.warn('Background sync before creation failed, proceeding anyway:', e)
    })

    const result = StudentRepository.create(studentData) as { success: boolean; id?: string; registration_number?: string; error?: string }
    if (result.success && result.id) {
      logAction(
        getCurrentUser()?.id || null,
        'create',
        'students',
        result.id,
        null,
        JSON.stringify(studentData)
      )
    }
    return result
  })

  // --------------------------------------------
  // LIST STUDENTS (with filters, pagination)
  // --------------------------------------------
  ipcMain.handle('student:list', async (_, filters = {}) => {
    if (!canRead('students')) {
      return { success: false, error: 'Accès refusé: lecture élèves' }
    }
    return StudentRepository.list(filters)
  })

  // --------------------------------------------
  // GET STUDENT BY ID
  // --------------------------------------------
  ipcMain.handle('student:get', async (_, id) => {
    if (!canRead('students')) {
      return { success: false, error: 'Accès refusé: lecture élèves' }
    }
    const result = StudentRepository.getById(id)
    if (!result) return { success: false, error: 'Élève introuvable' }
    return { success: true, ...result }
  })

  // --------------------------------------------
  // UPDATE STUDENT
  // --------------------------------------------
  ipcMain.handle('student:update', async (_, id, updates) => {
    if (!canWrite('students')) {
      return { success: false, error: 'Accès refusé: modification élève' }
    }
    const oldStudent = StudentRepository.getById(id)
    const result = StudentRepository.update(id, updates)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'update',
        'students',
        id,
        oldStudent ? JSON.stringify(oldStudent) : null,
        JSON.stringify(updates)
      )
    }
    return result
  })

  // --------------------------------------------
  // DELETE (SOFT DELETE)
  // --------------------------------------------
  ipcMain.handle('student:delete', async (_, id) => {
    if (!canWrite('students')) {
      return { success: false, error: 'Accès refusé: suppression élève' }
    }
    const oldStudent = StudentRepository.getById(id)
    const result = StudentRepository.delete(id)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'delete',
        'students',
        id,
        oldStudent ? JSON.stringify(oldStudent) : null,
        null
      )
    }
    return result
  })

  // --------------------------------------------
  // RE-ENROLL STUDENT
  // --------------------------------------------
  ipcMain.handle('student:reEnroll', async (_, id, newClass, targetYear) => {
    if (!canWrite('students')) {
      return { success: false, error: 'Accès refusé: réinscription élève' }
    }
    const result = StudentRepository.reEnroll(id, newClass, targetYear)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'reEnroll',
        'students',
        id,
        null,
        JSON.stringify({ newClass, targetYear })
      )
    }
    return result
  })

  // --------------------------------------------
  // SERVICE STATS
  // --------------------------------------------
  ipcMain.handle('student:serviceStats', async () => {
    if (!canRead('students')) {
      return { success: false, error: 'Accès refusé: lecture élèves' }
    }
    return StudentRepository.getServiceStats()
  })

  // --------------------------------------------
  // REPAIR ENROLLMENTS
  // --------------------------------------------
  ipcMain.handle('student:repair', async (_, targetYear) => {
    if (!canWrite('students')) {
      return { success: false, error: 'Accès refusé: réparation inscriptions' }
    }
    const result = StudentRepository.repairEnrollments(targetYear)
    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'repair',
        'students',
        null,
        null,
        JSON.stringify({ targetYear })
      )
    }
    return result
  })

  // --------------------------------------------
  // RESET DATABASE (Dev only — no RBAC check, should be disabled in prod)
  // --------------------------------------------
  ipcMain.handle('db:reset', async (_, includeRemote) => {
    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      return { success: false, error: 'Opération non autorisée en production' }
    }
    return StudentRepository.resetDatabase(includeRemote)
  })
}
