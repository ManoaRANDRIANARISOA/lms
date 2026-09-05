/**
 * email.handler.ts — IPC Handlers for Email Service
 *
 * RBAC: 'settings' write required for configuration, 'reports' read for status/logs.
 *
 * @module EmailHandler
 */

import { ipcMain } from 'electron'
import { canRead, canWrite } from '../auth/rbac.service'
import { getCurrentUser } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { EmailService } from '../services/email.service'

export function registerEmailHandlers(): void {
  ipcMain.handle('email:configure', async (_, config) => {
    if (!canWrite('settings')) {
      return { success: false, error: 'Accès refusé: configuration email' }
    }
    const result = EmailService.configure(config)
    if (result.success) {
      const user = getCurrentUser()
      logAction(
        user?.id || null,
        'update',
        'settings',
        'email_config',
        null,
        'Configuration SMTP modifiée'
      )
    }
    return result
  })

  ipcMain.handle('email:testConnection', async () => {
    if (!canRead('settings')) {
      return { success: false, error: 'Accès refusé' }
    }
    return EmailService.testConnection()
  })

  ipcMain.handle('email:sendNow', async (_, to, subject, body) => {
    if (!canWrite('reports')) {
      return { success: false, error: 'Accès refusé' }
    }
    const result = await EmailService.sendEmail(to, subject, body)
    if (result.success) {
      const user = getCurrentUser()
      logAction(user?.id || null, 'create', 'reports', null, null, `Email envoyé à ${to}`)
    }
    return result
  })

  ipcMain.handle('email:getStatus', async () => {
    if (!canRead('settings')) {
      return { success: false, error: 'Accès refusé' }
    }
    return { success: true, ...EmailService.getStatus() }
  })

  ipcMain.handle('email:getLogs', async () => {
    if (!canRead('settings')) {
      return { success: false, error: 'Accès refusé' }
    }
    return { success: true, logs: EmailService.getLogs() }
  })

  ipcMain.handle('email:sendDailyReport', async (_, targetDate?: string) => {
    if (!canWrite('reports') && !canWrite('settings')) {
      return { success: false, error: 'Accès refusé' }
    }
    const result = await EmailService.sendDailyReport(targetDate)
    if (result.success) {
      const user = getCurrentUser()
      logAction(
        user?.id || null,
        'create',
        'reports',
        null,
        null,
        `Bilan journalier envoyé par email (${targetDate || 'aujourd\'hui'})`
      )
    }
    return result
  })
}
