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
import { PaymentRepository } from '../database/repositories/payment.repository'

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
      const operatorName = user?.full_name || user?.username || 'Administrateur'
      const originalCashier = paymentData.cashier_name || operatorName

      let isDuplicate = Boolean(paymentData.is_duplicate)
      let duplicateCount = paymentData.duplicate_count || 1

      // If payment_ids are provided, check and record print count
      if (paymentData.payment_ids && paymentData.payment_ids.length > 0) {
        const printRecord = PaymentRepository.recordReceiptPrint(paymentData.payment_ids, operatorName)
        if (printRecord.success) {
          isDuplicate = printRecord.is_duplicate
          duplicateCount = printRecord.print_count
        }
      }

      const dataWithCashier: ReceiptData = {
        ...paymentData,
        cashier_name: originalCashier,
        printed_by: operatorName,
        is_duplicate: isDuplicate,
        duplicate_count: duplicateCount
      }

      const defaultCopies = copies !== undefined ? copies : (Number(SettingsRepository.get('printer_copies')) || 2)
      const result = await ThermalPrinterService.printReceipt(dataWithCashier, defaultCopies)

      if (result.success) {
        logAction(user?.id || null, isDuplicate ? 'reprint_receipt' : 'print_receipt', 'payments', null, null, 'thermal_receipt_80mm')
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

  // --------------------------------------------
  // CHECK POS-80 STATUS
  // --------------------------------------------
  ipcMain.handle('printer:checkStatus', async () => {
    try {
      return await ThermalPrinterService.checkPrinterStatus()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur vérification imprimante'
      return { isInstalled: false, error: message }
    }
  })

  // --------------------------------------------
  // INSTALL / CONFIGURE POS-80 DRIVER (ADMIN ONLY)
  // --------------------------------------------
  ipcMain.handle('printer:installDriver', async () => {
    const user = getCurrentUser()
    if (!user || user.role !== 'admin') {
      return {
        success: false,
        isInstalled: false,
        error: 'Opération refusée : Seul un compte Administrateur peut configurer le matériel système.'
      }
    }

    try {
      const result = await ThermalPrinterService.installPrinterDriver()
      if (result.success) {
        logAction(user.id, 'configure_hardware', 'settings', null, null, 'printer_pos80_driver')
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'installation du pilote"
      return { success: false, isInstalled: false, error: message }
    }
  })

  // --------------------------------------------
  // AUTO-DETECT & BIND USB PORT (Fixes Nicon / Multi-printer conflicts)
  // --------------------------------------------
  ipcMain.handle('printer:autoDetectPort', async () => {
    try {
      return await ThermalPrinterService.autoDetectAndBindPort()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de détection automatique de port'
      return { success: false, error: message }
    }
  })

  // --------------------------------------------
  // CLEAR SPOOLER PRINT QUEUE
  // --------------------------------------------
  ipcMain.handle('printer:clearQueue', async (_, printerName?: string) => {
    try {
      return await ThermalPrinterService.clearSpoolerQueue(printerName)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de purge de la file d’attente'
      return { success: false, error: message }
    }
  })
}
