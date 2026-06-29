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
import { uploadToStorage } from '../services/storage.service'

export function registerSettingsHandlers(): void {
  // --------------------------------------------
  // GET SINGLE SETTING
  // --------------------------------------------
  ipcMain.handle('settings:get', (_, key: string) => {
    // Les paramètres de base sont publics pour tous les utilisateurs connectés
    const PUBLIC_SETTINGS = [
      'school_year',
      'school_name',
      'school_logo',
      'auth_require_password_change'
    ]

    if (!PUBLIC_SETTINGS.includes(key) && !canRead('settings')) {
      return null
    }
    return SettingsRepository.get(key)
  })

  // --------------------------------------------
  // GET ALL SETTINGS
  // --------------------------------------------
  ipcMain.handle('settings:getAll', () => {
    const all = SettingsRepository.getAll()
    if (!canRead('settings')) {
      const PUBLIC_SETTINGS = [
        'school_year',
        'school_name',
        'school_logo',
        'auth_require_password_change'
      ]
      const filtered: Record<string, unknown> = {}
      for (const key of PUBLIC_SETTINGS) {
        if (key in all) filtered[key] = all[key]
      }
      return filtered
    }
    return all
  })

  // --------------------------------------------
  // SET SETTING (admin only)
  // --------------------------------------------
  ipcMain.handle('settings:set', async (_, key: string, value: unknown) => {
    if (!canWrite('settings')) {
      return { success: false, error: 'Accès refusé: modification paramètres' }
    }
    
    // Upload school logo if provided as a local path
    let finalValue = value
    if (key === 'school_logo' && typeof value === 'string') {
      finalValue = await uploadToStorage(value, 'settings')
    }

    const oldValue = SettingsRepository.get(key)
    const result = SettingsRepository.set(key, finalValue)
    if (result) {
      logAction(
        getCurrentUser()?.id || null,
        'update',
        'settings',
        key,
        oldValue !== null ? JSON.stringify(oldValue) : null,
        JSON.stringify(finalValue)
      )
    }
    return { success: result }
  })
}
