import db from '../database/db'
import { BrowserWindow } from 'electron'

export class LoggerService {
  /**
   * Logs a message to the database and optionally to the Electron console,
   * then broadcasts it to the renderer process if it's an error.
   */
  static log(
    level: 'info' | 'warn' | 'error',
    context: string,
    message: string,
    details?: any
  ): void {
    const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null

    // Always log to the Electron console for developers
    if (level === 'error') {
      console.error(`[${context}] ${message}`, details || '')
    } else if (level === 'warn') {
      console.warn(`[${context}] ${message}`, details || '')
    } else {
      console.log(`[${context}] ${message}`, details || '')
    }

    try {
      db.prepare(
        `INSERT INTO app_logs (level, context, message, details) VALUES (?, ?, ?, ?)`
      ).run(level, context, message, detailsStr)
    } catch (dbError) {
      console.error('Failed to write log to database:', dbError)
    }

    // Broadcast severe errors to the renderer to show a Toast notification
    if (level === 'error') {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('app:log-error', { context, message, details: detailsStr })
        }
      })
    }
  }

  static getLogs(limit = 100, offset = 0) {
    try {
      const logs = db
        .prepare(`SELECT * FROM app_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(limit, offset)
      const countResult = db.prepare(`SELECT COUNT(*) as total FROM app_logs`).get() as { total: number }
      return { success: true, logs, total: countResult.total }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }

  static clearLogs() {
    try {
      db.prepare(`DELETE FROM app_logs`).run()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
}
