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

export function registerCashJournalHandlers(): void {
  // CREATE
  ipcMain.handle('cashjournal:create', async (_, data) => {
    if (!canWrite('cash_journal')) {
      return { success: false, error: 'Accès refusé: création entrée journal' }
    }
    try {
      const result = CashJournalRepository.create(data)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'create', 'cash_journal', result.id, null, JSON.stringify(data))
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
}
