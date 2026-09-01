/**
 * printer.handler.ts — IPC Handlers for Thermal POS Printer
 *
 * Provides receipt printing, printer discovery and testing to the frontend.
 * RBAC: requires read access to payments or cash_journal.
 *
 * @module PrinterHandler
 */

import { ipcMain } from 'electron'
import { ThermalPrinterService, ReceiptData } from '../services/thermal-printer.service'
import { canRead, getCurrentUser } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { SettingsRepository } from '../database/repositories/settings.repository'

export function registerPrinterHandlers(): void {
  // --------------------------------------------
  // PRINT RECEIPT (Thermal 80mm ESC/POS)
  // --------------------------------------------
  ipcMain.handle('printer:printReceipt', async (_, paymentData: ReceiptData, copies?: number) => {
    if (!canRead('payments') && !canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const user = getCurrentUser()
      const cashierName = paymentData.cashier_name || user?.full_name || user?.username || 'Caisse'
      const dataWithCashier = { ...paymentData, cashier_name: cashierName }

      const defaultCopies = copies !== undefined ? copies : (Number(SettingsRepository.get('printer_copies')) || 2)
      const result = await ThermalPrinterService.printReceipt(dataWithCashier, defaultCopies)

      if (result.success) {
        logAction(user?.id || null, 'generate_pdf', 'payments', null, null, 'thermal_receipt_80mm')
      }

      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'impression du ticket"
      return { success: false, error: message }
    }
  })

  // --------------------------------------------
  // GET PRINTERS LIST
  // --------------------------------------------
  ipcMain.handle('printer:getPrinters', async () => {
    try {
      return await ThermalPrinterService.getInstalledPrinters()
    } catch {
      return [{ name: 'POS-80', isDefault: true, status: 'Normal' }]
    }
  })

  // --------------------------------------------
  // TEST PRINT
  // --------------------------------------------
  ipcMain.handle('printer:testPrint', async (_, printerName?: string) => {
    try {
      return await ThermalPrinterService.printTestReceipt(printerName)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur test impression'
      return { success: false, error: message }
    }
  })
}
