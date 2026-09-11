/**
 * cashjournal.handler.ts — IPC Handlers for Cash Journal
 *
 * RBAC resource: 'cash_journal'
 *   - admin:        full
 *   - secretariat:  none
 *   - accounting:   full
 *   - direction:    read
 *
 * @module CashJournalHandler
 */

import { ipcMain } from 'electron'
import { canRead, canWrite, getCurrentUser } from '../auth/rbac.service'
import { CashJournalRepository } from '../database/repositories/cashjournal.repository'
import { logAction } from '../auth/audit.service'
import { ThermalPrinterService } from '../services/thermal-printer.service'

export function registerCashJournalHandlers(): void {
  // CREATE
  ipcMain.handle('cashjournal:create', async (_, data) => {
    if (!canWrite('cash_journal')) {
      return { success: false, error: 'Accès refusé: création entrée journal' }
    }
    try {
      const user = getCurrentUser()
      const operatorName = user?.full_name || user?.username || 'Administrateur'
      const dataToCreate = {
        ...data,
        created_by: data.created_by || operatorName
      }
      const result = CashJournalRepository.create(dataToCreate)
      if (result.success) {
        logAction(user?.id || null, 'create', 'cash_journal', result.id, null, JSON.stringify(dataToCreate))
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la création'
      return { success: false, error: message }
    }
  })

  // LIST
  ipcMain.handle('cashjournal:list', async (_, filters) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé: lecture journal de caisse' }
    }
    try {
      const entries = CashJournalRepository.list(filters)
      return { success: true, entries }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // GET BY ID
  ipcMain.handle('cashjournal:get', async (_, id) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const entry = CashJournalRepository.getById(id)
      return { success: true, entry }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // UPDATE
  ipcMain.handle('cashjournal:update', async (_, id, updates) => {
    if (!canWrite('cash_journal')) {
      return { success: false, error: 'Accès refusé: modification entrée journal' }
    }
    try {
      const result = CashJournalRepository.update(id, updates)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'update', 'cash_journal', id, null, JSON.stringify(updates))
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de modification'
      return { success: false, error: message }
    }
  })

  // DELETE (soft)
  ipcMain.handle('cashjournal:delete', async (_, id) => {
    if (!canWrite('cash_journal')) {
      return { success: false, error: 'Accès refusé: suppression entrée journal' }
    }
    try {
      const result = CashJournalRepository.delete(id)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'delete', 'cash_journal', id, null, null)
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de suppression'
      return { success: false, error: message }
    }
  })

  // DAILY BALANCE
  ipcMain.handle('cashjournal:getDailyBalance', async (_, date) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const balance = CashJournalRepository.getDailyBalance(date)
      return { success: true, balance }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // MONTHLY BALANCE
  ipcMain.handle('cashjournal:getMonthlyBalance', async (_, year, month) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const balance = CashJournalRepository.getMonthlyBalance(year, month)
      return { success: true, balance }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // BALANCE SUMMARY
  ipcMain.handle('cashjournal:getBalanceSummary', async (_, startDate, endDate) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const summary = CashJournalRepository.getBalanceSummary(startDate, endDate)
      return { success: true, summary }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // TOTAL BALANCE (all-time)
  ipcMain.handle('cashjournal:getTotalBalance', async () => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const balance = CashJournalRepository.getTotalBalance()
      return { success: true, balance }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // --------------------------------------------
  // Avenant N°3 — Rapprochement & Z de Caisse
  // --------------------------------------------

  // DISTINCT CASHIERS
  ipcMain.handle('cashjournal:getDistinctCashiers', async () => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const cashiers = CashJournalRepository.getDistinctCashiers()
      return { success: true, cashiers }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture'
      return { success: false, error: message }
    }
  })

  // CASHIER DAILY SUMMARY (For reconciliation & Billetage)
  ipcMain.handle(
    'cashjournal:getCashierDailySummary',
    async (_, date: string, cashier?: string, stationCode?: string) => {
      if (!canRead('cash_journal')) {
        return { success: false, error: 'Accès refusé' }
      }
      try {
        const summary = CashJournalRepository.getCashierDailySummary(date, cashier, stationCode)
        return { success: true, summary }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Erreur de calcul du récapitulatif'
        return { success: false, error: message }
      }
    }
  )

  // CREATE CASH CLOSURE
  ipcMain.handle('cashjournal:createClosure', async (_, input) => {
    if (!canWrite('cash_journal')) {
      return { success: false, error: 'Accès refusé: clôture de caisse' }
    }
    try {
      const user = getCurrentUser()
      const cashierName = input.cashier_username || user?.username || 'Administrateur'
      const closureData = {
        ...input,
        cashier_username: cashierName
      }
      const result = CashJournalRepository.createClosure(closureData)
      if (result.success) {
        logAction(
          user?.id || null,
          'close_register',
          'cash_journal',
          result.id || null,
          null,
          JSON.stringify({
            closure_date: input.closure_date,
            total_tickets: input.total_tickets,
            expected_total: input.expected_total,
            counted_cash: input.counted_cash,
            cash_difference: input.cash_difference
          })
        )
      }
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la clôture'
      return { success: false, error: message }
    }
  })

  // GET CLOSURE
  ipcMain.handle('cashjournal:getClosure', async (_, date: string, cashier?: string) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const closure = CashJournalRepository.getClosure(date, cashier)
      return { success: true, closure }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture de clôture'
      return { success: false, error: message }
    }
  })

  // LIST CLOSURES
  ipcMain.handle('cashjournal:listClosures', async (_, schoolYear?: string) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé' }
    }
    try {
      const closures = CashJournalRepository.listClosures(schoolYear)
      return { success: true, closures }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de lecture des clôtures'
      return { success: false, error: message }
    }
  })

  // PRINT TICKET Z
  ipcMain.handle('cashjournal:printTicketZ', async (_, data, copies?: number) => {
    if (!canRead('cash_journal')) {
      return { success: false, error: 'Accès refusé: impression Ticket Z' }
    }
    try {
      const result = await ThermalPrinterService.printTicketZ(data, copies || 1)
      if (result.success) {
        const user = getCurrentUser()
        logAction(
          user?.id || null,
          'print_ticket_z',
          'cash_journal',
          null,
          null,
          JSON.stringify({
            closure_date: data.closure_date,
            cashier: data.cashier,
            total_tickets: data.total_tickets,
            expected_total: data.expected_total,
            counted_cash: data.counted_cash,
            cash_difference: data.cash_difference
          })
        )
      }
      return result
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erreur lors de l'impression du Ticket Z"
      return { success: false, error: message }
    }
  })
}
