import db from '../db'
import { addToSyncQueue } from '../../services/sync.service'

export class SettingsRepository {
  static get(key: string): unknown {
    try {
      const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as {
        value: unknown
      } | undefined
      if (!result || result.value === null || result.value === undefined) return null
      if (typeof result.value === 'string') {
        try {
          return JSON.parse(result.value)
        } catch {
          return result.value
        }
      }
      return result.value
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error)
      return null
    }
  }

  static getAll(): Record<string, unknown> {
    try {
      const results = db.prepare('SELECT key, value FROM settings').all() as {
        key: string
        value: unknown
      }[]
      const settings: Record<string, unknown> = {}
      results.forEach((row) => {
        if (typeof row.value === 'string') {
          try {
            settings[row.key] = JSON.parse(row.value)
          } catch {
            settings[row.key] = row.value
          }
        } else {
          settings[row.key] = row.value
        }
      })
      return settings
    } catch (error) {
      console.error('Error getting all settings:', error)
      return {}
    }
  }

  static set(key: string, value: unknown): boolean {
    try {
      const jsonValue = JSON.stringify(value)

      // Archive previous value in settings_history for rollbacks and safety
      try {
        const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
          | { value: string }
          | undefined
        if (existing && existing.value !== jsonValue) {
          db.prepare(
            'INSERT INTO settings_history (key, old_value, new_value) VALUES (?, ?, ?)'
          ).run(key, existing.value, jsonValue)
        }
      } catch (histErr) {
        console.warn('Failed to archive settings history:', histErr)
      }

      const stmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value, 
        updated_at = CURRENT_TIMESTAMP
      `)

      stmt.run(key, jsonValue)

      // Sync settings to cloud (optional — settings are lightweight config)
      addToSyncQueue('settings', key, 'update', { key, value: jsonValue })

      return true
    } catch (error) {
      console.error(`Error setting ${key}:`, error)
      return false
    }
  }
}
