/**
 * attendance.handler.ts — IPC Handlers for Attendance (Bus & Canteen)
 *
 * Manages bus and canteen attendance tracking.
 * All operations are protected by RBAC checks.
 *
 * Permission resource: 'attendance'
 *   - admin:        full access
 *   - secretariat:  full access
 *   - accounting:   read only
 *   - direction:    read only
 *
 * @module AttendanceHandler
 */

import { ipcMain } from 'electron'
import { AttendanceRepository } from '../database/repositories/attendance.repository'
import { canRead, canWrite } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'

export function registerAttendanceHandlers(): void {
  // --------------------------------------------
  // BUS SUBSCRIBERS
  // --------------------------------------------
  ipcMain.handle('attendance:getBusSubscribers', async (_, schoolYear) => {
    if (!canRead('attendance')) {
      return { success: false, error: 'Accès refusé: lecture pointage' }
    }
    return AttendanceRepository.getBusSubscribers(schoolYear)
  })

  // --------------------------------------------
  // CANTEEN SUBSCRIBERS
  // --------------------------------------------
  ipcMain.handle('attendance:getCanteenSubscribers', async (_, schoolYear) => {
    if (!canRead('attendance')) {
      return { success: false, error: 'Accès refusé: lecture pointage' }
    }
    return AttendanceRepository.getCanteenSubscribers(schoolYear)
  })

  // --------------------------------------------
  // BUS ATTENDANCE (read)
  // --------------------------------------------
  ipcMain.handle('attendance:getBusAttendance', async (_, date) => {
    if (!canRead('attendance')) {
      return { success: false, error: 'Accès refusé: lecture pointage' }
    }
    return AttendanceRepository.getBusAttendance(date)
  })

  // --------------------------------------------
  // CANTEEN ATTENDANCE (read)
  // --------------------------------------------
  ipcMain.handle('attendance:getCanteenAttendance', async (_, date) => {
    if (!canRead('attendance')) {
      return { success: false, error: 'Accès refusé: lecture pointage' }
    }
    return AttendanceRepository.getCanteenAttendance(date)
  })

  // --------------------------------------------
  // RECORD BUS ATTENDANCE (write)
  // --------------------------------------------
  ipcMain.handle('attendance:recordBus', async (_, date, records) => {
    if (!canWrite('attendance')) {
      return { success: false, error: 'Accès refusé: écriture pointage' }
    }
    const result = AttendanceRepository.recordBusAttendance(date, records)
    if (result.success !== false) {
      logAction(
        getCurrentUser()?.id || null,
        'recordBus',
        'bus_attendance',
        null,
        null,
        JSON.stringify({ date, recordCount: records?.length })
      )
    }
    return result
  })

  // --------------------------------------------
  // RECORD CANTEEN ATTENDANCE (write)
  // --------------------------------------------
  ipcMain.handle('attendance:recordCanteen', async (_, date, records) => {
    if (!canWrite('attendance')) {
      return { success: false, error: 'Accès refusé: écriture pointage' }
    }
    const result = AttendanceRepository.recordCanteenAttendance(date, records)
    if (result.success !== false) {
      logAction(
        getCurrentUser()?.id || null,
        'recordCanteen',
        'canteen_attendance',
        null,
        null,
        JSON.stringify({ date, recordCount: records?.length })
      )
    }
    return result
  })
}
