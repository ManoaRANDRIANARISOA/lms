/**
 * payment.handler.ts — IPC Handlers for Payments Module
 *
 * Manages student payment records (creation, listing, tuition status).
 * All operations are protected by RBAC checks.
 *
 * Permission resource: 'payments'
 *   - admin:        full access
 *   - secretariat:  read only
 *   - accounting:   full access
 *   - direction:    full access
 *
 * @module PaymentHandler
 */

import { ipcMain } from 'electron'
import { PaymentRepository } from '../database/repositories/payment.repository'
import { canRead, canWrite } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'

export function registerPaymentHandlers(): void {
  // --------------------------------------------
  // CREATE PAYMENT
  // --------------------------------------------
  ipcMain.handle('payment:create', async (_, payment) => {
    if (!canWrite('payments')) {
      return { success: false, error: 'Accès refusé: écriture paiements' }
    }
    const result = PaymentRepository.create(payment)
    if (result.success && result.id) {
      logAction(getCurrentUser()?.id || null, 'create', 'student_payments', result.id, null, JSON.stringify(payment))
    }
    return result
  })

  // --------------------------------------------
  // GET PAYMENTS BY STUDENT
  // --------------------------------------------
  ipcMain.handle('payment:getByStudent', async (_, studentId) => {
    if (!canRead('payments')) {
      return { success: false, error: 'Accès refusé: lecture paiements' }
    }
    return PaymentRepository.getByStudent(studentId)
  })

  // --------------------------------------------
  // GET ALL PAYMENTS (Global View)
  // --------------------------------------------
  ipcMain.handle('payment:getAll', async (_, filters) => {
    if (!canRead('payments')) {
      return { success: false, error: 'Accès refusé: lecture paiements' }
    }
    return PaymentRepository.getAll(filters)
  })

  // --------------------------------------------
  // GET TUITION STATUS
  // --------------------------------------------
  ipcMain.handle('payment:getTuitionStatus', async (_, studentId, schoolYear) => {
    if (!canRead('payments')) {
      return { success: false, error: 'Accès refusé: lecture paiements' }
    }
    return PaymentRepository.getTuitionStatus(studentId, schoolYear)
  })
}
