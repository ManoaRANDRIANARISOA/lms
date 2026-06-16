/**
 * report.handler.ts — IPC Handlers for Reports & Export
 *
 * RBAC: 'reports' resource for report generation, 'payments'/'students' for CSV export.
 *
 * @module ReportHandler
 */

import { ipcMain } from 'electron'
import { canRead } from '../auth/rbac.service'
import { ReportService } from '../services/report.service'
import { ExportService } from '../services/export.service'

export function registerReportHandlers(): void {
  ipcMain.handle('report:monthlyFinance', async (_, year, month) => {
    if (!canRead('reports')) return { success: false, error: 'Accès refusé' }
    try {
      return { success: true, data: ReportService.generateMonthlyFinanceReport(year, month) }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' }
    }
  })

  ipcMain.handle('report:unpaid', async (_, schoolYear) => {
    if (!canRead('reports')) return { success: false, error: 'Accès refusé' }
    try {
      return { success: true, data: ReportService.generateUnpaidReport(schoolYear) }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' }
    }
  })

  ipcMain.handle('report:payroll', async (_, year, month) => {
    if (!canRead('reports')) return { success: false, error: 'Accès refusé' }
    try {
      return { success: true, data: ReportService.generatePayrollReport(year, month) }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' }
    }
  })

  ipcMain.handle('report:tuition', async (_, schoolYear) => {
    if (!canRead('reports')) return { success: false, error: 'Accès refusé' }
    try {
      return { success: true, data: ReportService.generateTuitionReport(schoolYear) }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur' }
    }
  })

  ipcMain.handle('export:csv', async (_, data, columns, filename) => {
    if (!canRead('students')) return { success: false, error: 'Accès refusé' }
    return ExportService.exportToCSV(data, columns, filename)
  })
}
