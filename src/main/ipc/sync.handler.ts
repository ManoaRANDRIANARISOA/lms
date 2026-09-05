/**
 * sync.handler.ts — IPC Handlers for Cloud Synchronization & Queue Management
 */

import { ipcMain, app } from 'electron'
import {
  syncWithCloud,
  checkCloudHealth,
  getSyncQueueStatus,
  getSyncQueueErrors,
  retrySyncErrors,
  getIsSyncing
} from '../services/sync.service'

export function registerSyncHandlers(): void {
  // --------------------------------------------
  // App version (Dynamic)
  // --------------------------------------------
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion() || '1.1.7'
  })

  // --------------------------------------------
  // SYNC STATUS
  // --------------------------------------------
  ipcMain.handle('sync:getStatus', async () => {
    try {
      const queueStatus = getSyncQueueStatus()
      const health = await checkCloudHealth()

      return {
        success: true,
        isSyncing: getIsSyncing(),
        isOnline: health.ok,
        latencyMs: health.latencyMs,
        healthError: health.error,
        ...queueStatus
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        isSyncing: false,
        isOnline: false,
        pendingCount: 0,
        errorCount: 0,
        lastSyncTime: null,
        error: message
      }
    }
  })

  // --------------------------------------------
  // TRIGGER SYNC
  // --------------------------------------------
  ipcMain.handle('sync:start', async (_, forceFullSync: boolean = false) => {
    try {
      const result = await syncWithCloud(forceFullSync)
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  // --------------------------------------------
  // GET QUEUE ERRORS / ANOMALIES
  // --------------------------------------------
  ipcMain.handle('sync:getErrors', async () => {
    try {
      const errors = getSyncQueueErrors()
      return { success: true, errors }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message, errors: [] }
    }
  })

  // --------------------------------------------
  // RETRY FAILED ITEMS
  // --------------------------------------------
  ipcMain.handle('sync:retryErrors', async () => {
    try {
      const result = retrySyncErrors()
      // Immediately start sync to re-attempt pushing the cleared queue
      syncWithCloud().catch((e) => console.error('Background retry sync error:', e))
      return { success: true, count: result.changes }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
