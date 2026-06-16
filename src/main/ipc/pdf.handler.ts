/**
 * pdf.handler.ts — IPC Handlers for PDF Generation
 *
 * RBAC: requires 'payments' read for receipts, 'grades' read for report cards,
 * 'personnel' read for payslips, 'cash_journal' read for daily reports.
 *
 * @module PdfHandler
 */

import { ipcMain, shell, app } from 'electron'
import path from 'path'
import { canRead, getCurrentUser } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { PdfService } from '../services/pdf.service'

export function registerPdfHandlers(): void {
  // RECEIPT
  ipcMain.handle('pdf:generateReceipt', async (_, paymentData) => {
    if (!canRead('payments')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = PdfService.generateReceipt(paymentData)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'generate_pdf', 'payments', null, null, 'receipt')
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  })

  // CERTIFICATE
  ipcMain.handle('pdf:generateCertificate', async (_, studentData) => {
    if (!canRead('students')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = PdfService.generateCertificate(studentData)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'generate_pdf', 'students', null, null, 'certificate')
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  })

  // REPORT CARD
  ipcMain.handle('pdf:generateReportCard', async (_, studentData, grades, generalAverage) => {
    if (!canRead('grades')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = PdfService.generateReportCard(studentData, grades, generalAverage)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'generate_pdf', 'grades', null, null, 'report_card')
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  })

  // PAYSLIP
  ipcMain.handle('pdf:generatePayslip', async (_, personnelData, salaryCalc) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = PdfService.generatePayslip(personnelData, salaryCalc)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'generate_pdf', 'personnel', null, null, 'payslip')
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  })

  // DAILY REPORT
  ipcMain.handle('pdf:generateDailyReport', async (_, reportData) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const result = PdfService.generateDailyReport(reportData)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'generate_pdf', 'cash_journal', null, null, 'daily_report')
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur génération PDF'
      return { success: false, error: message }
    }
  })

  // OPEN FILE
  ipcMain.handle('pdf:openFile', async (_, filePath) => {
    const user = getCurrentUser()
    if (!user) {
      return { success: false, error: 'Accès refusé — Session invalide' }
    }
    try {
      const isDev = !app.isPackaged
      const allowedDir = path.resolve(
        isDev ? path.join(process.cwd(), 'pdf-output') : path.join(app.getPath('userData'), 'pdf-output')
      )
      const resolvedPath = path.resolve(filePath)

      if (!resolvedPath.startsWith(allowedDir)) {
        console.warn(`Blocked path traversal attempt by user ${user.username}: ${filePath}`)
        return { success: false, error: 'Accès refusé — Chemin invalide' }
      }

      await shell.openPath(resolvedPath)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur ouverture fichier'
      return { success: false, error: message }
    }
  })
}
