/**
 * personnel.handler.ts — IPC Handlers for Personnel Management
 *
 * RBAC resource: 'personnel'
 *   - admin:        full
 *   - secretariat:  none
 *   - accounting:   full
 *   - direction:    read
 *
 * @module PersonnelHandler
 */

import { ipcMain } from 'electron'
import { canRead, canWrite } from '../auth/rbac.service'
import { PersonnelRepository } from '../database/repositories/personnel.repository'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'
import db from '../database/db'
import type {
  Personnel,
  TimeTracking,
  PersonnelAbsence,
  SalaryAdvance,
  CustomDeduction,
  DailyAttendance
} from '../../shared/types'

export function registerPersonnelHandlers(): void {
  // --------------------------------------------
  // CREATE
  // --------------------------------------------
  ipcMain.handle('personnel:create', async (_, data) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé: création personnel' }
    }

    try {
      const result = PersonnelRepository.create(data)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'create', 'personnel', result.id, null, JSON.stringify(data))
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la création du personnel' }
    }
  })

  // --------------------------------------------
  // LIST
  // --------------------------------------------
  ipcMain.handle('personnel:list', async (_, filters = {}) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const personnel = PersonnelRepository.list(filters)
      return { success: true, personnel }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement du personnel' }
    }
  })

  // --------------------------------------------
  // GET BY ID (with related data)
  // --------------------------------------------
  ipcMain.handle('personnel:get', async (_, id: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const result = PersonnelRepository.getById(id)
      if (!result) {
        // Diagnostic: check if person exists without deleted filter
        const raw = db
          .prepare('SELECT id, first_name, last_name, deleted FROM personnel WHERE id = ?')
          .get(id) as
          | { id: string; first_name: string; last_name: string; deleted: number }
          | undefined
        if (raw) {
          console.warn(`[Personnel] Record exists but deleted=${raw.deleted} for id=${id}`)
          return {
            success: false,
            error: `Personnel marqué comme supprimé (deleted=${raw.deleted})`
          }
        }
        return { success: false, error: 'Personnel introuvable' }
      }
      return { success: true, ...result }
    } catch (error: unknown) {
      console.error('[Personnel:get] Error:', error)
      return { success: false, error: 'Erreur lors du chargement du personnel' }
    }
  })

  // --------------------------------------------
  // UPDATE
  // --------------------------------------------
  ipcMain.handle('personnel:update', async (_, id: string, updates: Partial<Personnel>) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé: modification personnel' }
    }

    try {
      const result = PersonnelRepository.update(id, updates)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'update', 'personnel', id, null, JSON.stringify(updates))
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la mise à jour' }
    }
  })

  // --------------------------------------------
  // DELETE (soft)
  // --------------------------------------------
  ipcMain.handle('personnel:delete', async (_, id: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé: suppression personnel' }
    }

    try {
      const result = PersonnelRepository.delete(id)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'delete', 'personnel', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  // --------------------------------------------
  // TIME TRACKING
  // --------------------------------------------
  ipcMain.handle(
    'personnel:setTimeTracking',
    async (
      _,
      data: Omit<TimeTracking, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
    ) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.setTimeTracking(data)
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'update',
            'personnel',
            data.personnel_id,
            null,
            JSON.stringify(data)
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors de la saisie des heures' }
      }
    }
  )

  ipcMain.handle('personnel:getTimeTracking', async (_, personnelId: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const records = PersonnelRepository.getTimeTracking(personnelId)
      return { success: true, records }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des heures' }
    }
  })

  // --------------------------------------------
  // ABSENCES
  // --------------------------------------------
  ipcMain.handle(
    'personnel:createAbsence',
    async (
      _,
      data: Omit<PersonnelAbsence, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
    ) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.createAbsence(data)
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'create',
            'personnel_absences',
            result.id,
            null,
            JSON.stringify(data)
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: "Erreur lors de la création de l'absence" }
      }
    }
  )

  ipcMain.handle('personnel:getAbsences', async (_, personnelId: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const records = PersonnelRepository.getAbsences(personnelId)
      return { success: true, records }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des absences' }
    }
  })

  ipcMain.handle('personnel:deleteAbsence', async (_, id: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const result = PersonnelRepository.deleteAbsence(id)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'delete', 'personnel_absences', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  // --------------------------------------------
  // SALARY ADVANCES
  // --------------------------------------------
  ipcMain.handle(
    'personnel:createAdvance',
    async (
      _,
      data: Omit<SalaryAdvance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
    ) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.createAdvance(data)
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'create',
            'salary_advances',
            result.id,
            null,
            JSON.stringify(data)
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: "Erreur lors de la création de l'avance" }
      }
    }
  )

  ipcMain.handle('personnel:getAdvances', async (_, personnelId: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const records = PersonnelRepository.getAdvances(personnelId)
      return { success: true, records }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des avances' }
    }
  })

  ipcMain.handle('personnel:markAdvanceRepaid', async (_, id: string, repaymentDate: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const result = PersonnelRepository.markAdvanceRepaid(id, repaymentDate)
      if (result.success) {
        const user = getCurrentUser()
        logAction(
          user?.id || null,
          'update',
          'salary_advances',
          id,
          null,
          JSON.stringify({ repaymentDate })
        )
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du remboursement' }
    }
  })

  // --------------------------------------------
  // CUSTOM DEDUCTIONS
  // --------------------------------------------
  ipcMain.handle(
    'personnel:createDeduction',
    async (
      _,
      data: Omit<CustomDeduction, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
    ) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.createDeduction(data)
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'create',
            'custom_deductions',
            result.id,
            null,
            JSON.stringify(data)
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors de la création de la déduction' }
      }
    }
  )

  ipcMain.handle('personnel:getDeductions', async (_, personnelId: string, month?: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const records = PersonnelRepository.getDeductions(personnelId, month)
      return { success: true, records }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement des déductions' }
    }
  })

  ipcMain.handle('personnel:deleteDeduction', async (_, id: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const result = PersonnelRepository.deleteDeduction(id)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'delete', 'custom_deductions', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  // --------------------------------------------
  // DAILY ATTENDANCE
  // --------------------------------------------
  ipcMain.handle(
    'personnel:getMonthlyAttendance',
    async (_, personnelId: string, year: number, month: number) => {
      if (!canRead('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const records = PersonnelRepository.getMonthlyAttendance(personnelId, year, month)
        return { success: true, records }
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors du chargement du pointage' }
      }
    }
  )

  ipcMain.handle('personnel:getDailyAttendance', async (_, date: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const records = PersonnelRepository.getDailyAttendance(date)
      return { success: true, records }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement du pointage journalier' }
    }
  })

  ipcMain.handle(
    'personnel:setBulkAttendance',
    async (
      _,
      records: Omit<
        DailyAttendance,
        'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'
      >[]
    ) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.setBulkAttendance(records)
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'create',
            'daily_attendance_bulk',
            null,
            null,
            JSON.stringify({ count: records.length })
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors de la sauvegarde du pointage en masse' }
      }
    }
  )

  ipcMain.handle(
    'personnel:setAttendance',
    async (
      _,
      data: Omit<DailyAttendance, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status'>
    ) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.setAttendance(data)
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'create',
            'daily_attendance',
            result.id,
            null,
            JSON.stringify(data)
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors de la sauvegarde du pointage' }
      }
    }
  )

  ipcMain.handle('personnel:deleteAttendance', async (_, id: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const result = PersonnelRepository.deleteAttendance(id)
      if (result.success) {
        const user = getCurrentUser()
        logAction(user?.id || null, 'delete', 'daily_attendance', id, null, null)
      }
      return result
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors de la suppression' }
    }
  })

  // --------------------------------------------
  // SALARY PAYMENT → Finance Link
  // --------------------------------------------
  ipcMain.handle(
    'personnel:createSalaryExpense',
    async (_, personnelId: string, month: string, netAmount: number, description?: string) => {
      if (!canWrite('personnel')) {
        return { success: false, error: 'Accès refusé' }
      }

      try {
        const result = PersonnelRepository.createSalaryExpense(
          personnelId,
          month,
          netAmount,
          description
        )
        if (result.success) {
          const user = getCurrentUser()
          logAction(
            user?.id || null,
            'create',
            'cash_journal',
            result.id,
            null,
            JSON.stringify({ personnelId, month, netAmount })
          )
        }
        return result
      } catch (error: unknown) {
        return { success: false, error: 'Erreur lors de la création de la dépense' }
      }
    }
  )

  // --------------------------------------------
  // SALARY CALCULATION
  // --------------------------------------------
  ipcMain.handle('personnel:calculateSalary', async (_, personnelId: string, month: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const calculation = PersonnelRepository.calculateSalary(personnelId, month)
      if (!calculation) {
        return { success: false, error: 'Personnel introuvable' }
      }
      return { success: true, calculation }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du calcul du salaire' }
    }
  })

  // --------------------------------------------
  // PAYROLL SUMMARY
  // --------------------------------------------
  ipcMain.handle('personnel:getPayrollSummary', async (_, month: string) => {
    if (!canRead('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const summary = PersonnelRepository.getPayrollSummary(month)
      return { success: true, summary }
    } catch (error: unknown) {
      return { success: false, error: 'Erreur lors du chargement du résumé de paie' }
    }
  })

  ipcMain.handle('personnel:ignoreMonth', async (_, personnelId: string, month: string, reason?: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }
    const result = PersonnelRepository.ignoreMonth(personnelId, month, reason)
    if (result.success) {
      logAction(getCurrentUser()?.id || null, 'ignoreMonth', 'payroll_ignores', personnelId, null, `Ignored ${month}`)
    }
    return result
  })

  ipcMain.handle('personnel:unignoreMonth', async (_, personnelId: string, month: string) => {
    if (!canWrite('personnel')) {
      return { success: false, error: 'Accès refusé' }
    }
    const result = PersonnelRepository.unignoreMonth(personnelId, month)
    if (result.success) {
      logAction(getCurrentUser()?.id || null, 'unignoreMonth', 'payroll_ignores', personnelId, null, `Unignored ${month}`)
    }
    return result
  })
}
