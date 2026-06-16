/**
 * settings.handler.ts — IPC Handlers for System Settings
 *
 * Manages application settings (school config, finance prices, etc.).
 * Read access is restricted per the RBAC permission matrix.
 * Write access is admin-only.
 *
 * Permission resource: 'settings'
 *   - admin:        full access (read + write)
 *   - secretariat:  none
 *   - accounting:   none
 *   - direction:    read only
 *
 * @module SettingsHandler
 */

import { ipcMain } from 'electron'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { canRead, canWrite } from '../auth/rbac.service'
import { logAction } from '../auth/audit.service'
import { getCurrentUser } from '../auth/rbac.service'

export function registerSettingsHandlers(): void {
  // --------------------------------------------
  // GET SINGLE SETTING
  // --------------------------------------------
  ipcMain.handle('settings:get', (_, key: string) => {
    if (!canRead('settings')) {
      return null
    }
    return SettingsRepository.get(key)
  })

  // --------------------------------------------
  // GET ALL SETTINGS
  // --------------------------------------------
  ipcMain.handle('settings:getAll', () => {
    if (!canRead('settings')) {
      return []
    }
    return SettingsRepository.getAll()
  })

  // --------------------------------------------
  // SET SETTING (admin only)
  // --------------------------------------------
  ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
    if (!canWrite('settings')) {
      return { success: false, error: 'Accès refusé: modification paramètres' }
    }
    const oldValue = SettingsRepository.get(key)
    const result = SettingsRepository.set(key, value)
    if (result) {
      logAction(
        getCurrentUser()?.id || null,
        'update',
        'settings',
        key,
        oldValue !== null ? JSON.stringify(oldValue) : null,
        JSON.stringify(value)
      )
    }
    return { success: result }
  })
}
