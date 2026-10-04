import { createClient } from '@supabase/supabase-js'
import db from '../database/db'
import dotenv from 'dotenv'
import path from 'path'
import * as fs from 'fs'
import { app, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { LoggerService } from './logger.service'
import { TelemetryService, isNetworkOrOfflineError } from './telemetry.service'

const isDev = !app.isPackaged
const envPath = isDev ? path.join(process.cwd(), '.env') : path.join(process.resourcesPath, '.env')

dotenv.config({ path: envPath })

// Supabase credentials MUST be provided by the .env file
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

let supabaseClient: any = null

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e)
  }
} else {
  console.warn('Supabase credentials missing. Sync will be disabled.')
}

export const supabase = supabaseClient || {
  from: () => ({
    select: () => ({
      gt: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: [], error: { message: 'Supabase non configuré' } })
        })
      }),
      eq: () => ({
        ilike: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null })
        }),
        maybeSingle: () => Promise.resolve({ data: null, error: null })
      }),
      ilike: () => Promise.resolve({ data: [], error: null }),
      limit: () => Promise.resolve({ data: [], error: { message: 'Supabase non configuré' } })
    }),
    upsert: () => Promise.resolve({ error: { message: 'Supabase non configuré' } }),
    update: () => ({ eq: () => Promise.resolve({ error: { message: 'Supabase non configuré' } }) }),
    delete: () => ({
      neq: () => Promise.resolve({ error: { message: 'Supabase non configuré' } }),
      not: () => Promise.resolve({ error: { message: 'Supabase non configuré' } })
    })
  }),
  storage: {
    getBucket: () => Promise.resolve({ error: { message: 'Supabase non configuré' } }),
    createBucket: () => Promise.resolve({ error: { message: 'Supabase non configuré' } }),
    from: () => ({
      upload: () => Promise.resolve({ error: { message: 'Supabase non configuré' } }),
      getPublicUrl: () => ({ data: { publicUrl: '' } })
    })
  }
}

const SYNCABLE_TABLES = new Set([
  'users',
  'students',
  'student_fees',
  'student_payments',
  'personnel',
  'time_tracking',
  'daily_attendance',
  'personnel_absences',
  'salary_advances',
  'custom_deductions',
  'cash_journal',
  'subjects',
  'grades',
  'class_subjects',
  'parent_events',
  'event_payments',
  'bus_attendance',
  'canteen_attendance',
  'assessments',
  'settings',
  'cash_closures'
])

export const LOCAL_ONLY_SETTINGS = new Set([
  'pos_station_code',
  'printer_name',
  'printer_copies',
  'email_logs',
  'email_last_sent_date'
])


export interface SyncProgress {
  phase: 'idle' | 'checking' | 'pushing' | 'pulling' | 'success' | 'error'
  current: number
  total: number
  percent: number
  message: string
  tableName?: string
  lastSync?: string
  pendingCount?: number
  errorCount?: number
}

let isSyncing = false

export function getIsSyncing(): boolean {
  return isSyncing
}

export function broadcastProgress(progress: SyncProgress): void {
  try {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('sync:progress', progress)
      }
    })
  } catch {
    // Ignore if window is unavailable
  }
}

/**
 * Health check to Supabase with latency measurement and progressive retry for unstable/slow connections
 */
export async function checkCloudHealth(timeoutMs: number = 15000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, error: 'Identifiants Supabase absents du fichier .env' }
  }

  const performCheck = async (timeout: number) => {
    const start = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const { error } = (await (supabase
        .from('settings')
        .select('key')
        .limit(1) as any)
        .abortSignal(controller.signal)) as any

      clearTimeout(timeoutId)

      if (error) {
        return { ok: false, error: error.message || 'Erreur retournée par Supabase' }
      }

      return { ok: true, latencyMs: Date.now() - start }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }

  let result = await performCheck(timeoutMs)
  // If first check failed due to timeout/abort/fetch error on weak connection, try 1 grace retry before declaring offline
  if (
    !result.ok &&
    (result.error?.toLowerCase().includes('abort') ||
      result.error?.toLowerCase().includes('timeout') ||
      result.error?.toLowerCase().includes('fetch'))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 800))
    const retryResult = await performCheck(10000)
    if (retryResult.ok) {
      return retryResult
    }
  }

  return result
}


/**
 * Retrieve queue status
 */
export function getSyncQueueStatus(): {
  pendingCount: number
  errorCount: number
  failedCount: number
  quarantinedCount: number
  lastSyncTime: string | null
} {
  try {
    const counts = db
      .prepare(
        `SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
         FROM sync_queue`
      )
      .get() as { pending: number | null; errors: number | null; failed: number | null; quarantined: number | null } | undefined

    const settingRow = db
      .prepare("SELECT value FROM settings WHERE key = 'last_sync_time'")
      .get() as { value: string } | undefined

    let lastSyncTime: string | null = null
    if (settingRow && settingRow.value) {
      try {
        lastSyncTime = JSON.parse(settingRow.value)
      } catch {
        lastSyncTime = settingRow.value
      }
    }

    return {
      pendingCount: counts?.pending || 0,
      errorCount: counts?.errors || 0,
      failedCount: counts?.failed || 0,
      quarantinedCount: counts?.quarantined || 0,
      lastSyncTime
    }
  } catch {
    return { pendingCount: 0, errorCount: 0, failedCount: 0, quarantinedCount: 0, lastSyncTime: null }
  }
}

/**
 * Retrieve failed, error or quarantined queue items
 */
export function getSyncQueueErrors(limit = 100) {
  try {
    return db
      .prepare(
        `SELECT id, table_name, record_id, action, status, error_message, created_at, COALESCE(updated_at, created_at) as updated_at
         FROM sync_queue
         WHERE status IN ('error', 'failed', 'skipped', 'quarantined')
         ORDER BY id DESC LIMIT ?`
      )
      .all(limit)
  } catch (err) {
    console.error('getSyncQueueErrors error:', err)
    return []
  }
}

/**
 * Reset all failed, error, and skipped records to pending for safe retry
 */
export function retrySyncErrors(): { changes: number } {
  try {
    const res = db
      .prepare(
        `UPDATE sync_queue
         SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('error', 'failed', 'skipped', 'quarantined')`
      )
      .run()
    return { changes: res.changes }
  } catch {
    return { changes: 0 }
  }
}

/**
 * Quarantines all failed/skipped queue items, transmits error telemetry to Supabase,
 * and immediately triggers push for the remaining healthy items.
 */
export async function quarantineAndUnblockQueue(): Promise<{
  success: boolean
  quarantinedCount: number
  remainingPending: number
  message: string
}> {
  try {
    const failedItems = db
      .prepare(
        `SELECT id, table_name, record_id, error_message 
         FROM sync_queue 
         WHERE status IN ('error', 'failed', 'skipped')`
      )
      .all() as { id: number; table_name: string; record_id: string; error_message: string | null }[]

    const currentStatus = getSyncQueueStatus()

    // 1. Report each failed item to Supabase audit_logs via TelemetryService
    for (const item of failedItems) {
      await TelemetryService.reportSyncBlockage(
        item.table_name,
        item.record_id,
        item.error_message || 'Blocage persistant isolé par déblocage forcé',
        currentStatus.pendingCount
      )
    }

    // 2. Mark blocking rows as 'quarantined'
    const res = db
      .prepare(
        `UPDATE sync_queue 
         SET status = 'quarantined', updated_at = CURRENT_TIMESTAMP 
         WHERE status IN ('error', 'failed', 'skipped')`
      )
      .run()

    const remaining = (
      db.prepare(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'`).get() as { c: number }
    ).c

    // 3. Immediately trigger background sync for the remaining healthy items
    syncWithCloud().catch((e) => console.error('Auto sync after unblock error:', e))

    return {
      success: true,
      quarantinedCount: res.changes,
      remainingPending: remaining,
      message: `${res.changes} élément(s) bloquant(s) mis en quarantaine et signalés au cloud. ${remaining} modification(s) en cours d'envoi.`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      quarantinedCount: 0,
      remainingPending: 0,
      message: `Erreur lors du déblocage : ${msg}`
    }
  }
}

export interface ReconciliationItem {
  id: number
  table_name: string
  record_id: string
  action: string
  status: string
  error_message: string | null
  receipt_number?: string
  amount?: number
  date?: string
  created_by?: string
  student_id?: string
  student_name?: string
  class_name?: string
  description?: string
  created_at: string
}

/**
 * Retrieve all items in error, failed, or quarantined status for visual human reconciliation
 */
export function getReconciliationItems(): ReconciliationItem[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, table_name, record_id, action, status, error_message, data, created_at
         FROM sync_queue
         WHERE status IN ('error', 'failed', 'quarantined')
         ORDER BY id DESC LIMIT 100`
      )
      .all() as Array<{
        id: number
        table_name: string
        record_id: string
        action: string
        status: string
        error_message: string | null
        data: string
        created_at: string
      }>

    const items: ReconciliationItem[] = []

    for (const r of rows) {
      let parsedData: any = {}
      try {
        parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : r.data || {}
      } catch {
        parsedData = {}
      }

      let receiptNumber = parsedData.receipt_number
      let amount = parsedData.amount
      let date = parsedData.payment_date || parsedData.transaction_date || parsedData.created_at
      let createdBy = parsedData.created_by
      let studentId = parsedData.student_id || parsedData.related_student_id
      let studentName: string | undefined
      let className: string | undefined
      let description = parsedData.description || parsedData.notes

      // If missing from payload, inspect local SQLite table directly
      if (r.table_name === 'student_payments') {
        const localPay = db
          .prepare(
            'SELECT receipt_number, amount, payment_date, created_by, student_id FROM student_payments WHERE id = ?'
          )
          .get(r.record_id) as any
        if (localPay) {
          receiptNumber = receiptNumber || localPay.receipt_number
          amount = amount !== undefined ? amount : localPay.amount
          date = date || localPay.payment_date
          createdBy = createdBy || localPay.created_by
          studentId = studentId || localPay.student_id
        }
      } else if (r.table_name === 'cash_journal') {
        const localCj = db
          .prepare(
            'SELECT receipt_number, amount, transaction_date, created_by, related_student_id, description FROM cash_journal WHERE id = ?'
          )
          .get(r.record_id) as any
        if (localCj) {
          receiptNumber = receiptNumber || localCj.receipt_number
          amount = amount !== undefined ? amount : localCj.amount
          date = date || localCj.transaction_date
          createdBy = createdBy || localCj.created_by
          studentId = studentId || localCj.related_student_id
          description = description || localCj.description
        }
      }

      if (studentId) {
        const localStudent = db
          .prepare('SELECT first_name, last_name, class_name FROM students WHERE id = ?')
          .get(studentId) as any
        if (localStudent) {
          studentName = `${localStudent.first_name || ''} ${localStudent.last_name || ''}`.trim()
          className = localStudent.class_name
        } else {
          studentName = `Élève ID: ${studentId} (Introuvable)`
        }
      }

      items.push({
        id: r.id,
        table_name: r.table_name,
        record_id: r.record_id,
        action: r.action,
        status: r.status,
        error_message: r.error_message,
        receipt_number: receiptNumber,
        amount,
        date,
        created_by: createdBy,
        student_id: studentId,
        student_name: studentName,
        class_name: className,
        description,
        created_at: r.created_at
      })
    }

    return items
  } catch (err) {
    console.error('getReconciliationItems error:', err)
    return []
  }
}

/**
 * Re-links an orphan payment or cash_journal entry to an existing student
 */
export function reconcileAttachStudent(
  queueId: number,
  targetStudentId: string
): { success: boolean; error?: string } {
  try {
    const queueItem = db
      .prepare('SELECT * FROM sync_queue WHERE id = ?')
      .get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement de file introuvable' }
    }

    const student = db
      .prepare('SELECT id, first_name, last_name FROM students WHERE id = ? AND deleted = 0')
      .get(targetStudentId) as any
    if (!student) {
      return { success: false, error: 'Élève cible introuvable' }
    }

    const nowIso = new Date().toISOString()

    if (queueItem.table_name === 'student_payments') {
      db.prepare(
        'UPDATE student_payments SET student_id = ?, sync_status = "pending", updated_at = ? WHERE id = ?'
      ).run(targetStudentId, nowIso, queueItem.record_id)

      // Also update linked cash_journal if exists
      db.prepare(
        'UPDATE cash_journal SET related_student_id = ?, sync_status = "pending", updated_at = ? WHERE related_payment_id = ?'
      ).run(targetStudentId, nowIso, queueItem.record_id)
    } else if (queueItem.table_name === 'cash_journal') {
      db.prepare(
        'UPDATE cash_journal SET related_student_id = ?, sync_status = "pending", updated_at = ? WHERE id = ?'
      ).run(targetStudentId, nowIso, queueItem.record_id)
    }

    // Update queue item payload
    let parsedData: any = {}
    try {
      parsedData = JSON.parse(queueItem.data || '{}')
    } catch {
      parsedData = {}
    }

    if (queueItem.table_name === 'cash_journal') {
      parsedData.related_student_id = targetStudentId
    } else {
      parsedData.student_id = targetStudentId
    }
    parsedData.updated_at = nowIso

    db.prepare(
      `UPDATE sync_queue
       SET data = ?, status = 'pending', retry_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(JSON.stringify(parsedData), queueId)

    // Audit log in settings_history
    try {
      db.prepare(
        `INSERT INTO settings_history (key, old_value, new_value, changed_by, created_at)
         VALUES (?, ?, ?, 'reconciliation_attach', CURRENT_TIMESTAMP)`
      ).run(
        `reconciliation:${queueItem.table_name}:${queueItem.record_id}`,
        queueItem.data,
        JSON.stringify(parsedData)
      )
    } catch {}

    // Immediately trigger sync
    syncWithCloud().catch((e) => console.error('Auto sync after attach error:', e))

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Reconciles an orphan entry by creating the missing student record first
 */
export function reconcileCreateMissingStudent(
  queueId: number,
  studentData: {
    first_name: string
    last_name: string
    class_name: string
    registration_number?: string
  }
): { success: boolean; error?: string } {
  try {
    const queueItem = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement de file introuvable' }
    }

    const newStudentId = uuidv4()
    const nowIso = new Date().toISOString()
    const currentYear = new Date().getFullYear().toString()
    const regNum = studentData.registration_number || `${currentYear}-${Math.floor(10000 + Math.random() * 90000)}`

    // 1. Insert new student locally
    db.prepare(`
      INSERT INTO students (
        id, registration_number, first_name, last_name, class_name,
        enrollment_date, status, active, deleted, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, date('now'), 'active', 1, 0, 'pending', ?, ?)
    `).run(
      newStudentId,
      regNum,
      studentData.first_name.trim(),
      studentData.last_name.trim(),
      studentData.class_name.trim(),
      nowIso,
      nowIso
    )

    // 2. Queue student creation so parent is pushed before child
    addToSyncQueue('students', newStudentId, 'create', {
      id: newStudentId,
      registration_number: regNum,
      first_name: studentData.first_name.trim(),
      last_name: studentData.last_name.trim(),
      class_name: studentData.class_name.trim(),
      enrollment_date: nowIso.split('T')[0],
      status: 'active',
      active: 1,
      deleted: 0,
      updated_at: nowIso
    })

    // 3. Attach orphan payment/cash to this new student
    return reconcileAttachStudent(queueId, newStudentId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Reclassifies an orphan student payment or cash item into a general cash transaction
 */
export function reconcileConvertToGeneralCash(
  queueId: number
): { success: boolean; error?: string } {
  try {
    const queueItem = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement introuvable' }
    }

    const nowIso = new Date().toISOString()

    if (queueItem.table_name === 'cash_journal') {
      db.prepare(`
        UPDATE cash_journal 
        SET related_student_id = NULL, department = 'general', sync_status = 'pending', updated_at = ?
        WHERE id = ?
      `).run(nowIso, queueItem.record_id)

      let parsedData: any = {}
      try {
        parsedData = JSON.parse(queueItem.data || '{}')
      } catch {}
      parsedData.related_student_id = null
      parsedData.department = 'general'
      parsedData.updated_at = nowIso

      db.prepare(`
        UPDATE sync_queue
        SET data = ?, status = 'pending', retry_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(parsedData), queueId)
    } else if (queueItem.table_name === 'student_payments') {
      const localPay = db.prepare('SELECT * FROM student_payments WHERE id = ?').get(queueItem.record_id) as any
      if (localPay) {
        // Create matching general cash journal entry
        const cashId = uuidv4()
        db.prepare(`
          INSERT INTO cash_journal (
            id, transaction_date, amount, transaction_type, category,
            description, created_by, department, receipt_number, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, 'income', 'divers', ?, ?, 'general', ?, 'pending', ?, ?)
        `).run(
          cashId,
          localPay.payment_date || nowIso.split('T')[0],
          localPay.amount,
          `Recette diverse réconciliée (Reçu: ${localPay.receipt_number || 'N/A'})`,
          localPay.created_by || 'Système',
          localPay.receipt_number || null,
          nowIso,
          nowIso
        )

        addToSyncQueue('cash_journal', cashId, 'create', {
          id: cashId,
          transaction_date: localPay.payment_date || nowIso.split('T')[0],
          amount: localPay.amount,
          transaction_type: 'income',
          category: 'divers',
          description: `Recette diverse réconciliée (Reçu: ${localPay.receipt_number || 'N/A'})`,
          created_by: localPay.created_by || 'Système',
          department: 'general',
          receipt_number: localPay.receipt_number || null,
          updated_at: nowIso
        })

        // Soft-delete orphan payment
        db.prepare('UPDATE student_payments SET deleted = 1, sync_status = "synced", updated_at = ? WHERE id = ?').run(
          nowIso,
          queueItem.record_id
        )
      }

      // Mark queue item completed/synced
      db.prepare("UPDATE sync_queue SET status = 'synced', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        queueId
      )
    }

    syncWithCloud().catch((e) => console.error('Auto sync after convert to general cash error:', e))
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Discards an irrecoverable orphan queue item with full audit traceability
 */
export function reconcileDiscardOrphan(
  queueId: number,
  reason: string
): { success: boolean; error?: string } {
  try {
    const queueItem = db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(queueId) as any
    if (!queueItem) {
      return { success: false, error: 'Enregistrement introuvable' }
    }

    // Save into settings_history
    try {
      db.prepare(
        `INSERT INTO settings_history (key, old_value, new_value, changed_by, created_at)
         VALUES (?, ?, ?, 'reconciliation_discard', CURRENT_TIMESTAMP)`
      ).run(
        `reconciliation:discarded:${queueItem.table_name}:${queueItem.record_id}`,
        queueItem.data,
        JSON.stringify({ reason, timestamp: new Date().toISOString() })
      )
    } catch {}

    // Mark deleted in local table
    try {
      db.prepare(`UPDATE ${queueItem.table_name} SET deleted = 1, sync_status = 'synced' WHERE id = ?`).run(
        queueItem.record_id
      )
    } catch {}

    // Remove from sync_queue
    db.prepare('DELETE FROM sync_queue WHERE id = ?').run(queueId)

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Add a record to the local sync queue.
 * Synchronous to fit into SQLite transactions.
 */
export function addToSyncQueue(
  tableName: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  data: any
): void {
  if (!SYNCABLE_TABLES.has(tableName)) {
    console.error(`Rejected unauthorized table for sync: ${tableName}`)
    return
  }
  try {
    db.prepare(
      `
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES (?, ?, ?, ?)
    `
    ).run(tableName, recordId, action, JSON.stringify(data))

    // Broadcast updated pending count to UI
    const status = getSyncQueueStatus()
    broadcastProgress({
      phase: isSyncing ? 'pushing' : 'idle',
      current: 0,
      total: status.pendingCount,
      percent: 0,
      message: `${status.pendingCount} modification(s) en attente`,
      pendingCount: status.pendingCount,
      errorCount: status.errorCount
    })
  } catch (error) {
    console.error('Error adding to sync queue:', error)
  }
}

/**
 * Main sync function (called manually via button or periodically)
 */
export async function syncWithCloud(forceFullSync: boolean = false) {
  if (isSyncing) {
    return { success: false, reason: 'already_syncing' }
  }

  if (!supabaseUrl || !supabaseKey) {
    broadcastProgress({
      phase: 'error',
      current: 0,
      total: 0,
      percent: 0,
      message: 'Supabase non configuré (.env manquant)'
    })
    return { success: false, reason: 'config_missing' }
  }

  isSyncing = true

  try {
    const queueStatus = getSyncQueueStatus()
    broadcastProgress({
      phase: 'checking',
      current: 0,
      total: queueStatus.pendingCount,
      percent: 5,
      message: 'Vérification de la connexion au cloud Supabase...',
      pendingCount: queueStatus.pendingCount,
      errorCount: queueStatus.errorCount
    })

    const health = await checkCloudHealth()
    if (!health.ok) {
      broadcastProgress({
        phase: 'error',
        current: 0,
        total: queueStatus.pendingCount,
        percent: 0,
        message: `Connexion impossible : ${health.error}`,
        pendingCount: queueStatus.pendingCount,
        errorCount: queueStatus.errorCount
      })
      isSyncing = false
      return { success: false, error: health.error }
    }

    // PULL FIRST: Get remote changes from cloud first to absorb any remote deletions/updates
    await pullRemoteChanges(forceFullSync)

    // PUSH: Send local changes to cloud
    await pushLocalChanges()

    // Flush any pending error/sync telemetry to Supabase audit_logs
    await TelemetryService.flushPendingLogs().catch(() => {})

    // Publish workstation status heartbeat to cloud for real-time multi-station convergence
    await TelemetryService.publishWorkstationHeartbeat().catch(() => {})

    const finalStatus = getSyncQueueStatus()
    const totalBlocked = finalStatus.errorCount + finalStatus.failedCount + finalStatus.quarantinedCount
    const hasUnsyncedItems = finalStatus.pendingCount > 0 || totalBlocked > 0

    // Notify all open renderer windows that sync completed to trigger instant UI refresh
    try {
      const wins = BrowserWindow.getAllWindows()
      wins.forEach((w) => {
        if (!w.isDestroyed()) {
          w.webContents.send('app:sync-completed')
        }
      })
    } catch {}

    if (hasUnsyncedItems) {
      broadcastProgress({
        phase: totalBlocked > 0 ? 'error' : 'pushing',
        current: 100,
        total: 100,
        percent: 100,
        message: totalBlocked > 0
          ? `Synchro partielle : ${totalBlocked} écriture(s) bloquée(s)`
          : `${finalStatus.pendingCount} modification(s) en attente`,
        lastSync: finalStatus.lastSyncTime || new Date().toISOString(),
        pendingCount: finalStatus.pendingCount,
        errorCount: totalBlocked
      })

      return {
        success: false,
        partial: true,
        pendingCount: finalStatus.pendingCount,
        errorCount: totalBlocked,
        error: `${finalStatus.pendingCount} modification(s) en attente, ${totalBlocked} écriture(s) bloquée(s).`
      }
    }

    broadcastProgress({
      phase: 'success',
      current: 100,
      total: 100,
      percent: 100,
      message: 'Synchronisation terminée avec succès',
      lastSync: finalStatus.lastSyncTime || new Date().toISOString(),
      pendingCount: 0,
      errorCount: 0
    })

    return { success: true }
  } catch (error: any) {
    console.error('Sync error:', error)
    // Flush telemetry on fatal exception as well
    await TelemetryService.flushPendingLogs().catch(() => {})
    const finalStatus = getSyncQueueStatus()
    broadcastProgress({
      phase: 'error',
      current: 0,
      total: 0,
      percent: 0,
      message: `Erreur de synchronisation : ${error.message || 'Erreur inconnue'}`,
      pendingCount: finalStatus.pendingCount,
      errorCount: finalStatus.errorCount
    })
    return { success: false, error: error.message }
  } finally {
    isSyncing = false
  }
}

// Table sync priority: parent tables must be pushed before child tables
const TABLE_DEPENDENCIES: Record<string, string[]> = {
  class_subjects: ['subjects'],
  student_fees: ['students'],
  personnel_absences: ['personnel'],
  salary_advances: ['personnel'],
  custom_deductions: ['personnel'],
  grades: ['students', 'subjects', 'class_subjects'],
  time_tracking: ['personnel'],
  daily_attendance: ['students'],
  student_payments: ['students', 'student_fees'],
  cash_journal: ['students', 'student_payments'],
  event_payments: ['students', 'parent_events'],
  bus_attendance: ['students'],
  canteen_attendance: ['students']
}

function sanitizeRowPayload(tableName: string, action: string, rawData: any, recordId: string): any {
  let payload = { ...rawData }

  if (tableName === 'settings') {
    if (!payload.key && recordId) payload.key = recordId
  } else {
    if (!payload.id && recordId) payload.id = recordId
  }

  // Merge full local row for create/update to prevent missing NOT NULL constraint failures
  try {
    if (tableName === 'settings' && payload.key && action !== 'delete') {
      const localRow = db.prepare(`SELECT * FROM settings WHERE key = ?`).get(payload.key) as any
      if (localRow) payload = { ...payload, ...localRow }
    } else if (payload.id && action !== 'delete') {
      const localRow = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(payload.id) as any
      if (localRow) payload = { ...payload, ...localRow }
    }
  } catch {
    // Ignore local merge error
  }

  // Strip local SQLite-only columns that do not exist on Supabase
  if ('search_text' in payload) delete payload.search_text
  if ('sync_status' in payload) delete payload.sync_status
  if ('last_synced_at' in payload) delete payload.last_synced_at

  // student_payments on Supabase contains print_count, last_printed_at, last_printed_by, created_by, receipt_number
  // Keep all of them in payload for multi-workstation print synchronization

  if (tableName === 'cash_journal') {
    // cash_journal on Supabase tracks related_payment_id, receipt_number, created_by, print_count, last_printed_at, last_printed_by
  }
  // UUID foreign key fields that must be null instead of empty string "" to satisfy Postgres uuid syntax
  // ONLY format if the column exists on the record to prevent injecting alien columns into tables
  const uuidFields = [
    'parent_personnel_id',
    'related_student_id',
    'related_personnel_id',
    'related_payment_id',
    'student_id',
    'personnel_id',
    'subject_id',
    'event_id',
    'parent_id'
  ]
  for (const field of uuidFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      if (payload[field] === '' || payload[field] === 'null' || payload[field] === undefined) {
        payload[field] = null
      }
    }
  }

  if (tableName === 'student_fees') {
    delete payload.is_reenrollment
    if (!payload.school_year || typeof payload.school_year !== 'string' || !payload.school_year.trim()) {
      try {
        const row = db.prepare("SELECT value FROM settings WHERE key IN ('school_year', 'current_school_year') ORDER BY CASE WHEN key = 'school_year' THEN 1 ELSE 2 END LIMIT 1").get() as any
        let val = ''
        if (row?.value) {
          try {
            const parsed = JSON.parse(row.value)
            val = typeof parsed === 'string' ? parsed.trim() : String(parsed).trim()
          } catch {
            val = String(row.value).replace(/['"]/g, '').trim()
          }
        }
        if (!val) {
          const now = new Date()
          const month = now.getMonth() + 1
          const year = now.getFullYear()
          val = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
        }
        payload.school_year = val
      } catch {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()
        payload.school_year = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
      }
    }
  }
  if (tableName === 'personnel') {
    delete payload.payroll_start_date
  }
  if (tableName === 'parent_events' && 'school_year' in payload) {
    delete payload.school_year
  }

  const dateFields = [
    'date_of_birth',
    'departure_date',
    'hire_date',
    'start_date',
    'end_date',
    'payment_date',
    'attendance_date',
    'advance_date',
    'repayment_date',
    'transaction_date'
  ]
  for (const field of dateFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field) && payload[field] === '') {
      payload[field] = null
    }
  }

  if (tableName === 'students') {
    if (!payload.guardian_contact) payload.guardian_contact = ''
    if (!payload.enrollment_date) payload.enrollment_date = new Date().toISOString().split('T')[0]
    if (payload.parent_personnel_id === '' || payload.parent_personnel_id === 'null') {
      payload.parent_personnel_id = null
    }
  }

  // Remove any undefined keys across all tables to avoid malformed PostgREST payloads
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) {
      delete payload[k]
    }
  }

  // Ensure updated_at is always stamped on push for all tables tracking it.
  // This guarantees that other workstations pull the changes immediately via .gt('updated_at', lastSync).
  const nowIso = new Date().toISOString()
  if (
    tableName === 'students' ||
    tableName === 'student_payments' ||
    tableName === 'student_fees' ||
    tableName === 'cash_journal' ||
    tableName === 'personnel' ||
    tableName === 'grades' ||
    tableName === 'parent_events' ||
    tableName === 'event_payments' ||
    tableName === 'time_tracking' ||
    tableName === 'daily_attendance' ||
    tableName === 'users' ||
    tableName === 'cash_closures' ||
    'updated_at' in payload
  ) {
    payload.updated_at = nowIso
    try {
      if (payload.id) {
        db.prepare(`UPDATE ${tableName} SET updated_at = ? WHERE id = ?`).run(nowIso, payload.id)
      } else if (tableName === 'settings' && payload.key) {
        db.prepare(`UPDATE settings SET updated_at = ? WHERE key = ?`).run(nowIso, payload.key)
      }
    } catch {
      // Harmless if table/column does not exist in local schema
    }
  }

  // Convert boolean fields
  const booleanFields = [
    'deleted',
    'active',
    'bus_subscribed',
    'canteen_subscribed',
    'uniform_tshirt_purchased',
    'uniform_apron_purchased',
    'uniform_shorts_purchased',
    'uniform_badge_purchased',
    'fram_paid_by_parent',
    'is_personnel_child',
    'manually_edited',
    'justified',
    'present',
    'paid',
    'repaid',
    'has_droit'
  ]

  const supabasePayload: any = {}
  for (const key of Object.keys(payload)) {
    const val = payload[key]
    if (booleanFields.includes(key)) {
      supabasePayload[key] =
        val === 1 ||
        val === '1' ||
        val === '1.0' ||
        val === 1.0 ||
        val === true ||
        val === 'true'
    } else if (typeof val === 'boolean') {
      supabasePayload[key] = val
    } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
      supabasePayload[key] = JSON.stringify(val)
    } else {
      supabasePayload[key] = val
    }
  }

  return supabasePayload
}

/**
 * Deep merge finance_prices to prevent wiping out custom bus routes or uniform items,
 * while respecting recency of manual price updates between workstations.
 */
function deepMergeFinancePrices(local: any, remote: any, preferRemote = false): any {
  if (!local && !remote) return {}
  if (!local) return remote
  if (!remote) return local

  // Tombstones (deleted items)
  const tombstonedRoutes = new Set([
    ...(Array.isArray(local.deletedBusRoutes) ? local.deletedBusRoutes : []),
    ...(Array.isArray(remote.deletedBusRoutes) ? remote.deletedBusRoutes : [])
  ])

  // Bus routes: union of arrays minus tombstones
  const localRoutes = (Array.isArray(local.busRoutes) ? local.busRoutes : []).filter(
    (r: string) => !tombstonedRoutes.has(r)
  )
  const remoteRoutes = (Array.isArray(remote.busRoutes) ? remote.busRoutes : []).filter(
    (r: string) => !tombstonedRoutes.has(r)
  )
  const combinedRoutes = Array.from(new Set([...localRoutes, ...remoteRoutes]))

  // Bus prices: merge dictionaries minus tombstones, preferring the more recent workstation's changes
  const combinedBusPrices = preferRemote
    ? { ...(local.bus || {}), ...(remote.bus || {}) }
    : { ...(remote.bus || {}), ...(local.bus || {}) }
  for (const r of tombstonedRoutes) {
    delete combinedBusPrices[r]
  }

  // Tombstones for uniform items
  const tombstonedUniforms = new Set([
    ...(Array.isArray(local.deletedUniformItems) ? local.deletedUniformItems : []),
    ...(Array.isArray(remote.deletedUniformItems) ? remote.deletedUniformItems : [])
  ])

  // Uniform items: union of arrays minus tombstones
  const localUniforms = (Array.isArray(local.uniformItems) ? local.uniformItems : []).filter(
    (i: string) => !tombstonedUniforms.has(i)
  )
  const remoteUniforms = (Array.isArray(remote.uniformItems) ? remote.uniformItems : []).filter(
    (i: string) => !tombstonedUniforms.has(i)
  )
  const combinedUniforms = Array.from(new Set([...localUniforms, ...remoteUniforms]))

  // Uniform prices: merge dictionaries minus tombstones, preferring the more recent workstation's changes
  const combinedUniformPrices = preferRemote
    ? { ...(local.uniforms || {}), ...(remote.uniforms || {}) }
    : { ...(remote.uniforms || {}), ...(local.uniforms || {}) }
  for (const i of tombstonedUniforms) {
    delete combinedUniformPrices[i]
  }

  // Tuition: merge dictionaries respecting the more recent workstation's saved prices
  const tuitionKeys = Array.from(
    new Set([...Object.keys(remote.tuition || {}), ...Object.keys(local.tuition || {})])
  )
  const combinedTuition: Record<string, number> = {}
  for (const k of tuitionKeys) {
    const locVal = local.tuition?.[k]
    const remVal = remote.tuition?.[k]
    if (preferRemote) {
      combinedTuition[k] = remVal !== undefined && remVal > 0 ? remVal : (locVal || 0)
    } else {
      combinedTuition[k] = locVal !== undefined && locVal > 0 ? locVal : (remVal || 0)
    }
  }

  // Pick primary based on recency
  const primary = preferRemote ? remote : local
  const secondary = preferRemote ? local : remote

  return {
    ...secondary,
    ...primary,
    busRoutes: combinedRoutes,
    bus: combinedBusPrices,
    deletedBusRoutes: Array.from(tombstonedRoutes),
    uniformItems: combinedUniforms,
    uniforms: combinedUniformPrices,
    deletedUniformItems: Array.from(tombstonedUniforms),
    tuition: combinedTuition,
    classes: Array.from(new Set([...(primary.classes || []), ...(secondary.classes || [])]))
  }
}

/**
 * Push local changes to Supabase with batching, auto-healing of FKs, and real-time progress.
 */
async function pushLocalChanges() {
  const totalItemsCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM sync_queue WHERE status IN ('pending', 'error')"
      )
      .get() as { c: number }
  ).c

  if (totalItemsCount === 0) {
    return
  }

  let processedCount = 0
  const attemptedIds = new Set<string>()
  const sessionFailedTables = new Set<string>()

  while (true) {
    // Select batch of up to 50 items sorted by dependency order
    const queue = db
      .prepare(
        `
      SELECT * FROM sync_queue
      WHERE status IN ('pending', 'error')
      ORDER BY
        CASE WHEN status = 'error' THEN 1 ELSE 0 END ASC,
        CASE WHEN action = 'delete' THEN
          CASE table_name
            WHEN 'settings' THEN 1
            WHEN 'users' THEN 2
            WHEN 'event_payments' THEN 3
            WHEN 'bus_attendance' THEN 3
            WHEN 'canteen_attendance' THEN 3
            WHEN 'student_payments' THEN 4
            WHEN 'cash_journal' THEN 4
            WHEN 'parent_events' THEN 4
            WHEN 'grades' THEN 5
            WHEN 'time_tracking' THEN 5
            WHEN 'daily_attendance' THEN 5
            WHEN 'personnel_absences' THEN 5
            WHEN 'salary_advances' THEN 5
            WHEN 'custom_deductions' THEN 5
            WHEN 'student_fees' THEN 6
            WHEN 'class_subjects' THEN 6
            WHEN 'students' THEN 7
            WHEN 'personnel' THEN 7
            WHEN 'subjects' THEN 8
            ELSE 99
          END
        ELSE
          CASE table_name
            WHEN 'users' THEN 0
            WHEN 'settings' THEN 1
            WHEN 'subjects' THEN 2
            WHEN 'students' THEN 3
            WHEN 'personnel' THEN 3
            WHEN 'student_fees' THEN 4
            WHEN 'class_subjects' THEN 4
            WHEN 'grades' THEN 5
            WHEN 'time_tracking' THEN 5
            WHEN 'daily_attendance' THEN 5
            WHEN 'personnel_absences' THEN 5
            WHEN 'salary_advances' THEN 5
            WHEN 'custom_deductions' THEN 5
            WHEN 'student_payments' THEN 6
            WHEN 'cash_journal' THEN 6
            WHEN 'parent_events' THEN 6
            WHEN 'event_payments' THEN 7
            WHEN 'bus_attendance' THEN 7
            WHEN 'canteen_attendance' THEN 7
            ELSE 99
          END
        END ASC,
        created_at ASC
      LIMIT 50
    `
      )
      .all() as any[]

    const unattemptedItems = queue.filter((item) => !attemptedIds.has(item.id))
    if (unattemptedItems.length === 0) break

    for (const item of unattemptedItems) {
      attemptedIds.add(item.id)

      if (sessionFailedTables.has(item.table_name)) {
        continue
      }

      // Dependency check: skip child tables if parent table failed
      const deps = TABLE_DEPENDENCIES[item.table_name] || []
      if (deps.some((d) => sessionFailedTables.has(d))) {
        continue
      }

      let payload: any = null
      try {
        let rawData: any = {}
        try {
          rawData = JSON.parse(item.data)
        } catch {
          rawData = {}
        }

        payload = sanitizeRowPayload(item.table_name, item.action, rawData, item.record_id)

        // Skip workstation-specific local settings from cloud push
        if (item.table_name === 'settings' && LOCAL_ONLY_SETTINGS.has(payload.key || item.record_id)) {
          db.prepare("UPDATE sync_queue SET status = 'completed', error_message = NULL WHERE id = ?").run(item.id)
          continue
        }

        // Photo upload handling (Offline-first)
        if (
          item.table_name === 'students' &&
          payload.photo_path &&
          !payload.photo_path.startsWith('http')
        ) {
          try {
            const localPath = payload.photo_path
            if (fs.existsSync(localPath)) {
              const fileBuffer = fs.readFileSync(localPath)
              const fileExt = path.extname(localPath)
              const fileName = `${payload.id}${fileExt}`

              const { error: uploadError } = await supabase.storage
                .from('photos')
                .upload(fileName, fileBuffer, {
                  contentType: `image/${fileExt.replace('.', '')}`,
                  upsert: true
                })

              if (!uploadError) {
                const { data } = supabase.storage.from('photos').getPublicUrl(fileName)
                payload.photo_path = data.publicUrl
              }
            }
          } catch (e) {
            console.error('Failed to upload photo for student:', payload.id, e)
          }
        }

        if (item.action === 'create' || item.action === 'update') {
          let upsertError: any = null

          if (item.table_name === 'settings') {
            const settingPayload = {
              key: payload.key,
              value: typeof payload.value === 'string' ? payload.value : JSON.stringify(payload.value),
              updated_at: payload.updated_at || new Date().toISOString()
            }

            // Deep merge finance_prices before push to prevent overwriting cloud routes
            if (settingPayload.key === 'finance_prices') {
              try {
                const { data: cloudSetting } = await supabase
                  .from('settings')
                  .select('value')
                  .eq('key', 'finance_prices')
                  .maybeSingle()
                if (cloudSetting?.value) {
                  const cloudVal = typeof cloudSetting.value === 'string' ? JSON.parse(cloudSetting.value) : cloudSetting.value
                  const localVal = typeof settingPayload.value === 'string' ? JSON.parse(settingPayload.value) : settingPayload.value
                  const merged = deepMergeFinancePrices(localVal, cloudVal)
                  settingPayload.value = JSON.stringify(merged)
                }
              } catch (mergeErr) {
                console.warn('Error merging finance_prices before push:', mergeErr)
              }
            }

            const { error } = await supabase
              .from('settings')
              .upsert(settingPayload, { onConflict: 'key' })
            upsertError = error
          } else if (item.table_name === 'users') {
            const { error } = await supabase
              .from('users')
              .upsert(payload, { onConflict: 'id' })
            upsertError = error
          } else if (item.table_name === 'time_tracking') {
            const { error } = await supabase
              .from(item.table_name)
              .upsert(payload, { onConflict: 'personnel_id,month' })
            upsertError = error
          } else if (item.table_name === 'grades') {
            const { error } = await supabase
              .from(item.table_name)
              .upsert(payload, { onConflict: 'student_id,subject_id,school_year,term' })
            upsertError = error
          } else if (item.table_name === 'student_fees') {
            const { error } = await supabase
              .from('student_fees')
              .upsert(payload, { onConflict: 'student_id,school_year' })
            upsertError = error
          } else {
            // ANTI-RESURRECTION SAFEGUARD:
            // If the cloud already marked this record as deleted, an offline update must NOT overwrite deleted=true with deleted=false
            if (payload && (payload.deleted === 0 || payload.deleted === false || payload.deleted === undefined)) {
              try {
                const { data: remoteCheck } = await supabase
                  .from(item.table_name)
                  .select('deleted')
                  .eq('id', item.record_id)
                  .maybeSingle()
                if (remoteCheck?.deleted) {
                  db.prepare(`UPDATE ${item.table_name} SET deleted = 1, sync_status = 'synced' WHERE id = ?`).run(item.record_id)
                  db.prepare("UPDATE sync_queue SET status = 'completed', error_message = NULL WHERE id = ?").run(item.id)
                  continue
                }
              } catch {
                // Non-blocking fallback
              }
            }

            const { error } = await supabase.from(item.table_name).upsert(payload)
            upsertError = error
          }

          if (upsertError) {
            throw upsertError
          }
        } else if (item.action === 'delete') {
          const { error } = await supabase
            .from(item.table_name)
            .update({ deleted: true })
            .eq('id', item.record_id)
          if (error) throw error
        }

        // Mark as synced
        db.prepare(
          `UPDATE sync_queue
           SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL
           WHERE id = ?`
        ).run(item.id)

        try {
          db.prepare(`UPDATE ${item.table_name} SET sync_status = 'synced' WHERE id = ?`).run(
            item.record_id
          )
        } catch {
          // Some tables like settings have key as PK
        }

        processedCount++
        const progressPercent = Math.min(
          50,
          Math.round((processedCount / Math.max(1, totalItemsCount)) * 50)
        )
        broadcastProgress({
          phase: 'pushing',
          current: processedCount,
          total: totalItemsCount,
          percent: progressPercent,
          message: `Envoi au cloud : ${item.table_name} (${processedCount}/${totalItemsCount})`,
          tableName: item.table_name,
          pendingCount: Math.max(0, totalItemsCount - processedCount)
        })
      } catch (error: any) {
        const errMsg = error?.message || 'Erreur inconnue Supabase'
        const isOffline = isNetworkOrOfflineError(error) || isNetworkOrOfflineError(errMsg)

        if (isOffline) {
          LoggerService.log(
            'warn',
            'sync',
            `Poste hors-ligne lors de l'envoi (${item.table_name}) : reprise automatique dès reconnexion`
          )
          break
        }

        // ── AUTO-HEALING ATTEMPTS ──
        let autoHealed = false

        // 1. Auto-heal: Column missing in remote schema cache (PGRST204)
        const missingColMatch = errMsg.match(/Could not find the '(\w+)' column of/i)
        if (missingColMatch && missingColMatch[1] && payload && payload[missingColMatch[1]] !== undefined) {
          const badCol = missingColMatch[1]
          console.warn(`[Auto-healing sync] Column '${badCol}' missing in remote '${item.table_name}'. Stripping and retrying.`)
          delete payload[badCol]
          const { error: retryErr } = await supabase.from(item.table_name).upsert(payload)
          if (!retryErr) {
            autoHealed = true
          }
        }

        // 2. Auto-heal: Duplicate unique constraint on student_fees (23505)
        if (!autoHealed && error?.code === '23505' && item.table_name === 'student_fees') {
          try {
            const { data: cloudRow } = await supabase
              .from('student_fees')
              .select('id')
              .eq('student_id', payload.student_id)
              .eq('school_year', payload.school_year)
              .maybeSingle()
            if (cloudRow?.id) {
              const updatePayload = { ...payload, id: cloudRow.id }
              const { error: updErr } = await supabase
                .from('student_fees')
                .update(updatePayload)
                .eq('id', cloudRow.id)
              if (!updErr) {
                autoHealed = true
              }
            }
          } catch (feeHealErr) {
            console.warn('[Auto-healing sync] student_fees resolution failed:', feeHealErr)
          }
        }

        // 2b. Auto-heal: Duplicate unique constraint on students (registration_number collision across stations)
        if (!autoHealed && error?.code === '23505' && item.table_name === 'students' && errMsg.includes('students_registration_number_key')) {
          try {
            console.warn(`[Auto-healing sync] Registration number collision on student '${item.record_id}' (${payload.registration_number}). Resolving collision...`)
            const currentYearPrefix = new Date().getFullYear().toString()

            // Check if student with this matricule in cloud is identical (same first_name, last_name)
            const { data: cloudMatch } = await supabase
              .from('students')
              .select('id, first_name, last_name, registration_number')
              .eq('registration_number', payload.registration_number)
              .maybeSingle()

            if (
              cloudMatch &&
              cloudMatch.first_name?.trim().toLowerCase() === payload.first_name?.trim().toLowerCase() &&
              cloudMatch.last_name?.trim().toLowerCase() === payload.last_name?.trim().toLowerCase()
            ) {
              // Same student created under different UUID across stations: adopt cloud ID locally
              console.warn(`[Auto-healing sync] Matching student found in cloud (ID: ${cloudMatch.id}). Aligning local UUID...`)
              db.prepare('UPDATE students SET id = ?, sync_status = "synced" WHERE id = ?').run(cloudMatch.id, item.record_id)
              db.prepare('UPDATE student_fees SET student_id = ? WHERE student_id = ?').run(cloudMatch.id, item.record_id)
              db.prepare('UPDATE student_payments SET student_id = ? WHERE student_id = ?').run(cloudMatch.id, item.record_id)
              db.prepare('UPDATE cash_journal SET related_student_id = ? WHERE related_student_id = ?').run(cloudMatch.id, item.record_id)
              autoHealed = true
            } else {
              // Distinct student: allocate next non-colliding registration number
              const localMaxRow = db.prepare(`
                SELECT MAX(CAST(SUBSTR(registration_number, 6) AS INTEGER)) as max_num 
                FROM students 
                WHERE registration_number LIKE ?
              `).get(`${currentYearPrefix}-%`) as { max_num: number | null } | undefined

              let nextNum = (localMaxRow?.max_num || 0) + 1

              // Also check remote max to be safe
              const { data: remoteMaxRows } = await supabase
                .from('students')
                .select('registration_number')
                .ilike('registration_number', `${currentYearPrefix}-%`)
                .order('registration_number', { ascending: false })
                .limit(1)

              if (remoteMaxRows && remoteMaxRows.length > 0) {
                const remoteNum = parseInt(remoteMaxRows[0].registration_number.split('-')[1]) || 0
                if (remoteNum >= nextNum) {
                  nextNum = remoteNum + 1
                }
              }

              const newRegNum = `${currentYearPrefix}-${String(nextNum).padStart(5, '0')}`
              console.warn(`[Auto-healing sync] Reassigning unique registration_number '${newRegNum}' to student '${item.record_id}'`)

              db.prepare('UPDATE students SET registration_number = ? WHERE id = ?').run(newRegNum, item.record_id)
              payload.registration_number = newRegNum

              const { error: retryErr } = await supabase.from('students').upsert(payload)
              if (!retryErr) {
                autoHealed = true
              }
            }
          } catch (stHealErr) {
            console.warn('[Auto-healing sync] Student registration_number collision auto-heal failed:', stHealErr)
          }
        }

        // 3. Auto-heal: Foreign key violation missing parent student (23503)
        if (!autoHealed && error?.code === '23503' && (item.table_name === 'student_payments' || item.table_name === 'cash_journal' || item.table_name === 'student_fees')) {
          try {
            const studentId = item.table_name === 'cash_journal' ? payload.related_student_id : payload.student_id
            if (studentId) {
              const localStudent = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any
              if (localStudent) {
                console.warn(`[Auto-healing sync] Pushing missing parent student '${studentId}' to Supabase before retrying '${item.table_name}'`)
                const formattedStudent = sanitizeRowPayload('students', 'create', localStudent, localStudent.id)
                const { error: studentErr } = await supabase.from('students').upsert(formattedStudent)
                if (!studentErr) {
                  const { error: retryErr } = await supabase.from(item.table_name).upsert(payload)
                  if (!retryErr) {
                    autoHealed = true
                  }
                } else if (studentErr?.code === '23505') {
                  // Registration number collision on student: resolve collision and retry
                  const currentYearPrefix = new Date().getFullYear().toString()
                  const localMaxRow = db.prepare(`
                    SELECT MAX(CAST(SUBSTR(registration_number, 6) AS INTEGER)) as max_num 
                    FROM students 
                    WHERE registration_number LIKE ?
                  `).get(`${currentYearPrefix}-%`) as { max_num: number | null } | undefined
                  const nextNum = (localMaxRow?.max_num || 0) + 1
                  const newRegNum = `${currentYearPrefix}-${String(nextNum).padStart(5, '0')}`
                  db.prepare('UPDATE students SET registration_number = ? WHERE id = ?').run(newRegNum, localStudent.id)
                  formattedStudent.registration_number = newRegNum
                  const { error: retryStudentErr } = await supabase.from('students').upsert(formattedStudent)
                  if (!retryStudentErr) {
                    const { error: retryErr } = await supabase.from(item.table_name).upsert(payload)
                    if (!retryErr) {
                      autoHealed = true
                    }
                  }
                } else if (item.table_name === 'cash_journal') {
                  // Fallback: If parent student push fails on constraint, nullify related_student_id on cash_journal so ledger is not blocked
                  console.warn(`[Auto-healing sync] Student push failed (${studentErr.message}). Nullifying related_student_id on cash_journal '${item.record_id}'`)
                  payload.related_student_id = null
                  const { error: retryCjErr } = await supabase.from('cash_journal').upsert(payload)
                  if (!retryCjErr) {
                    autoHealed = true
                  }
                }
              } else if (item.table_name === 'cash_journal') {
                // Orphaned student reference in cash_journal: clear foreign key so the financial transaction is recorded
                console.warn(`[Auto-healing sync] Nullifying orphaned related_student_id on cash_journal '${item.record_id}'`)
                payload.related_student_id = null
                const { error: retryErr } = await supabase.from('cash_journal').upsert(payload)
                if (!retryErr) {
                  autoHealed = true
                }
              } else if (item.table_name === 'student_payments') {
                // Truly orphaned payment (student does not exist locally): quarantine to prevent blocking the queue
                console.warn(`[Auto-healing sync] Parent student '${studentId}' not found for payment '${item.record_id}'. Quarantining.`)
                db.prepare(`UPDATE sync_queue SET status = 'quarantined', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                  .run(`Élève parent inexistant (${studentId}) - paiement mis en quarantaine pour réconciliation`, item.id)
                continue
              }
            }
          } catch (fkHealErr) {
            console.warn('[Auto-healing sync] Foreign key resolution failed:', fkHealErr)
          }
        }

        if (autoHealed) {
          db.prepare(
            `UPDATE sync_queue
             SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL
             WHERE id = ?`
          ).run(item.id)
          try {
            db.prepare(`UPDATE ${item.table_name} SET sync_status = 'synced' WHERE id = ?`).run(
              item.record_id
            )
          } catch {}
          processedCount++
          continue
        }

        // ── UNRECOVERABLE ROW ERROR HANDLING ──
        // Distinguish systemic table/schema failure from isolated row failure
        const isTableSchemaErr =
          error?.code === 'PGRST204' ||
          error?.code === 'PGRST200' ||
          error?.code === '42P01' ||
          errMsg.includes('relation') ||
          errMsg.includes('schema cache')

        if (isTableSchemaErr) {
          sessionFailedTables.add(item.table_name)
        }

        // Report to cloud telemetry & SQLite mouchard (with automatic 15-min deduplication)
        TelemetryService.reportSyncBlockage(
          item.table_name,
          item.record_id,
          errMsg,
          totalItemsCount
        ).catch(() => {})

        const currentRetries = Number(item.retry_count || 0) + 1
        const newStatus = currentRetries >= 5 ? 'failed' : 'error'

        db.prepare(
          `UPDATE sync_queue
           SET status = ?, retry_count = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(newStatus, currentRetries, errMsg, item.id)
      }
    }
  }

  // Flush any pending telemetry to Supabase audit_logs
  await TelemetryService.flushPendingLogs().catch(() => {})
}

interface MergeResult {
  mergedRecord: Record<string, any>
  stillPendingFields: Record<string, any>
  hasConflict: boolean
  shouldKeepDelete: boolean
}

/**
 * 3-Way Field-Level Merge for concurrent offline/online modifications across workstations.
 *
 * Example Scenario:
 * - PC 1 modified fields offline on Monday (e.g. address, phone).
 * - PC 2 modified fields online on Monday evening (e.g. classroom, phone).
 * - On Wednesday, PC 1 connects and pulls PC 2's remote changes.
 *
 * Result:
 * - Non-conflicting fields are merged (PC 1 gets PC 2's classroom; PC 1 keeps address).
 * - Conflicting fields (phone) resolve via Last-Write-Wins (LWW) based on true modification timestamps.
 * - Local queue is updated so subsequent push sends the unified record without wiping out remote changes.
 */
function mergeRecordFields(
  tableName: string,
  localRecord: Record<string, any>,
  remoteRecord: Record<string, any>,
  pendingQueueItems: any[],
  colNames: Set<string>
): MergeResult {
  // 1. Check if local had a pending delete action
  const deleteItem = pendingQueueItems.find((q) => q.action === 'delete')
  if (deleteItem) {
    const localDeleteTime = new Date(deleteItem.created_at || '2000-01-01').getTime()
    const remoteUpdateTime = new Date(remoteRecord.updated_at || '2000-01-01').getTime()
    if (remoteUpdateTime > localDeleteTime) {
      // Remote was updated after local delete -> remote update wins
      return {
        mergedRecord: { ...remoteRecord },
        stillPendingFields: {},
        hasConflict: true,
        shouldKeepDelete: false
      }
    } else {
      // Local delete is newer -> local delete wins
      return {
        mergedRecord: { ...localRecord, deleted: 1 },
        stillPendingFields: { deleted: 1 },
        hasConflict: true,
        shouldKeepDelete: true
      }
    }
  }

  // 2. Aggregate local changes
  const localQueuedData: Record<string, any> = {}

  for (const q of pendingQueueItems) {
    try {
      const parsed = typeof q.data === 'string' ? JSON.parse(q.data || '{}') : (q.data || {})
      Object.assign(localQueuedData, parsed)
    } catch {}
  }

  const localChangedFields = new Set(
    Object.keys(localQueuedData).filter(
      (k) => k !== 'id' && k !== 'sync_status' && k !== 'search_text' && k !== 'created_at' && k !== 'updated_at'
    )
  )

  const mergedRecord: Record<string, any> = { ...localRecord }
  const stillPendingFields: Record<string, any> = {}
  let hasConflict = false

  for (const col of Object.keys(remoteRecord)) {
    if (!colNames.has(col) || col === 'id' || col === 'sync_status' || col === 'search_text') {
      continue
    }

    const localVal = localRecord[col]
    const remoteVal = remoteRecord[col]

    if (!localChangedFields.has(col)) {
      // Field was untouched locally by PC 1: adopt remote value (PC 2's modification)!
      mergedRecord[col] = remoteVal
    } else {
      // Field was modified locally by PC 1!
      const isSame =
        localVal === remoteVal ||
        (localVal == null && remoteVal == null) ||
        (typeof localVal === 'number' && typeof remoteVal === 'number' && localVal === remoteVal) ||
        String(localVal) === String(remoteVal)

      if (isSame) {
        mergedRecord[col] = localVal
      } else {
        // True field divergence:
        // Local user explicitly modified this field offline.
        // Preserve local modification and queue it to be propagated to cloud alongside remote merged fields.
        hasConflict = true
        mergedRecord[col] = localVal
        stillPendingFields[col] = localVal
        LoggerService.log(
          'info',
          'sync',
          `[Arbitrage Conflit] Table ${tableName}, ID ${remoteRecord.id}, Champ '${col}' : modification locale (${localVal}) préservée face à la valeur distante (${remoteVal})`
        )
      }
    }
  }

  // 3. Sensitive domain protections (Receipt numbers & print tracking)
  if (tableName === 'student_payments' || tableName === 'cash_journal') {
    if (!mergedRecord.receipt_number && localRecord.receipt_number) {
      mergedRecord.receipt_number = localRecord.receipt_number
    }
    mergedRecord.print_count = Math.max(
      Number(localRecord.print_count || 0),
      Number(remoteRecord.print_count || 0)
    )
    if (!mergedRecord.last_printed_at && localRecord.last_printed_at) {
      mergedRecord.last_printed_at = localRecord.last_printed_at
    }
    if (!mergedRecord.last_printed_by && localRecord.last_printed_by) {
      mergedRecord.last_printed_by = localRecord.last_printed_by
    }
  }

  return {
    mergedRecord,
    stillPendingFields,
    hasConflict,
    shouldKeepDelete: false
  }
}

/**
 * Pull remote changes from Supabase in batch transactions with non-destructive conflict handling.
 */
async function pullRemoteChanges(forceFullSync: boolean = false) {
  let hasPullErrors = false
  const settingsRow = db
    .prepare("SELECT value FROM settings WHERE key = 'last_sync_time'")
    .get() as { value: string } | undefined

  let fetchThreshold = '2020-01-01T00:00:00Z'
  if (!forceFullSync && settingsRow && settingsRow.value) {
    try {
      const parsed = JSON.parse(settingsRow.value)
      const dateVal = new Date(parsed)
      if (!isNaN(dateVal.getTime())) {
        // 5-minute safety overlap window to ensure no remote changes are missed due to clock drift
        fetchThreshold = new Date(dateVal.getTime() - 5 * 60 * 1000).toISOString()
      } else {
        fetchThreshold = parsed
      }
    } catch {
      fetchThreshold = settingsRow.value
    }
  }

  const tables = [
    'users',
    'students',
    'student_fees',
    'student_payments',
    'personnel',
    'time_tracking',
    'daily_attendance',
    'personnel_absences',
    'salary_advances',
    'custom_deductions',
    'cash_journal',
    'subjects',
    'grades',
    'class_subjects',
    'assessments',
    'parent_events',
    'event_payments',
    'bus_attendance',
    'canteen_attendance',
    'cash_closures'
  ]

  db.pragma('foreign_keys = OFF')

  try {
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i]
      if (!SYNCABLE_TABLES.has(table)) continue

      const tablePercent = 50 + Math.round(((i + 1) / (tables.length + 2)) * 45)
      broadcastProgress({
        phase: 'pulling',
        current: i + 1,
        total: tables.length,
        percent: tablePercent,
        message: `Récupération depuis le cloud : ${table}...`,
        tableName: table
      })

      // Fetch paginated remote records
      let allRecords: any[] = []
      let page = 0
      const pageSize = 1000
      let fetchMore = true

      while (fetchMore) {
        const from = page * pageSize
        const to = from + pageSize - 1
        const pkCol = table === 'settings' ? 'key' : 'id'
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .gt('updated_at', fetchThreshold)
          .order('updated_at', { ascending: true })
          .order(pkCol, { ascending: true })
          .range(from, to)

        if (error) {
          if (error.code === 'PGRST205') {
            console.warn(`[Sync] Table non encore disponible sur Supabase : ${table} (PGRST205).`)
            fetchMore = false
            break
          }
          if (isNetworkOrOfflineError(error)) {
            LoggerService.log('warn', 'sync', `Récupération en attente de connexion réseau sur ${table}`)
            fetchMore = false
            break
          }
          LoggerService.log('error', 'sync', `Erreur de récupération sur ${table}`, error)
          hasPullErrors = true
          fetchMore = false
          break
        }

        if (data && data.length > 0) {
          allRecords.push(...data)
          if (data.length < pageSize) {
            fetchMore = false
          } else {
            page++
          }
        } else {
          fetchMore = false
        }
      }

      if (allRecords.length === 0) continue

      // Wrap in SQLite transaction for maximum speed and atomic consistency
      const applyTableBatch = db.transaction((records: any[]) => {
        for (const record of records) {
          const local = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(record.id) as any
          const { search_text, ...recordToSave } = record

          for (const key in recordToSave) {
            const val = recordToSave[key]
            if (typeof val === 'boolean') {
              recordToSave[key] = val ? 1 : 0
            } else if (typeof val === 'object' && val !== null) {
              recordToSave[key] = JSON.stringify(val)
            }
          }

          if (recordToSave.deleted) {
            if (local) {
              // Check if local workstation has a pending edit made strictly AFTER the remote deletion
              let pendingItems: any[] = []
              try {
                pendingItems = db
                  .prepare(
                    `SELECT * FROM sync_queue WHERE table_name = ? AND record_id = ? AND status IN ('pending', 'error')`
                  )
                  .all(table, record.id) as any[]
              } catch {
                pendingItems = []
              }

              let localHasNewerEdit = false
              const remoteDelTime = new Date(recordToSave.updated_at || '2000-01-01').getTime()

              for (const q of pendingItems) {
                if (q.action !== 'delete') {
                  const qTime = new Date(q.created_at || q.updated_at || '2000-01-01').getTime()
                  if (qTime > remoteDelTime) {
                    localHasNewerEdit = true
                    break
                  }
                }
              }

              if (localHasNewerEdit) {
                // Local user actively edited/re-enrolled this record AFTER the remote deletion
                // Keep local active, let push propagate it
                continue
              }

              // Remote deletion confirmed: apply deleted = 1 and clear stale unpushed updates
              db.prepare(
                `UPDATE ${table} SET deleted = 1, sync_status = 'synced', updated_at = ? WHERE id = ?`
              ).run(recordToSave.updated_at, record.id)

              try {
                db.prepare(
                  `DELETE FROM sync_queue WHERE table_name = ? AND record_id = ? AND action != 'delete'`
                ).run(table, record.id)
              } catch {
                // Table might not be in sync_queue
              }
            } else {
              const fields = Object.keys(recordToSave).join(', ')
              const placeholders = Object.keys(recordToSave)
                .map(() => '?')
                .join(', ')
              db.prepare(
                `INSERT INTO ${table} (${fields}, sync_status) VALUES (${placeholders}, 'synced')`
              ).run(...Object.values(recordToSave))
            }
            continue
          }

          if (table === 'cash_journal' && !recordToSave.department) {
            recordToSave.department = 'eleve'
          }

          // Protect receipt_number & print status from regression (cloud pull must never reset local impressions or erase receipt numbers)
          if (table === 'student_payments' || table === 'cash_journal') {
            if (!recordToSave.receipt_number && local?.receipt_number) {
              recordToSave.receipt_number = local.receipt_number
            }
            recordToSave.print_count = Math.max(Number(local?.print_count || 0), Number(recordToSave.print_count || 0))
            if (!recordToSave.last_printed_at && local?.last_printed_at) {
              recordToSave.last_printed_at = local.last_printed_at
            }
            if (!recordToSave.last_printed_by && local?.last_printed_by) {
              recordToSave.last_printed_by = local.last_printed_by
            }

            // If local workstation has a verified receipt number but remote cloud has NULL, schedule cloud healing
            if (local?.receipt_number && !record.receipt_number) {
              addToSyncQueue(table, local.id, 'update', {
                id: local.id,
                receipt_number: local.receipt_number,
                updated_at: new Date().toISOString()
              })
            }
          }

          // Safe conflict resolution for unique constraints (tables with composite candidate keys)
          const uniqueConstraints: Record<string, string[]> = {
            student_fees: ['student_id', 'school_year'],
            bus_attendance: ['student_id', 'attendance_date'],
            canteen_attendance: ['student_id', 'attendance_date'],
            salary_calculations: ['personnel_id', 'month'],
            grades: ['student_id', 'subject_id', 'school_year', 'term'],
            custom_deductions: ['personnel_id', 'month'],
            daily_attendance: ['personnel_id', 'attendance_date'],
            class_subjects: ['class_name', 'subject_id'],
            assessments: ['school_year', 'class_name', 'term_value'],
            time_tracking: ['personnel_id', 'month']
          }

          const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[]
          const colNames = new Set(cols.map((c) => c.name))

          for (const k of Object.keys(recordToSave)) {
            if (!colNames.has(k)) {
              delete recordToSave[k]
            }
          }

          // Handle table unique constraints safely
          const constraintKeys = uniqueConstraints[table]
          if (constraintKeys) {
            const hasAllKeys = constraintKeys.every(
              (k) => recordToSave[k] !== undefined && recordToSave[k] !== null
            )
            if (hasAllKeys) {
              const whereClause = constraintKeys.map((k) => `${k} = ?`).join(' AND ')
              const values = constraintKeys.map((k) => recordToSave[k])
              const conflict = db
                .prepare(`SELECT id FROM ${table} WHERE ${whereClause} AND id != ?`)
                .get(...values, record.id) as any

              if (conflict) {
                db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(conflict.id)
              }
            }
          }

          try {
            if (!local) {
              const fields = Object.keys(recordToSave).join(', ')
              const placeholders = Object.keys(recordToSave)
                .map(() => '?')
                .join(', ')
              db.prepare(
                `INSERT INTO ${table} (${fields}, sync_status) VALUES (${placeholders}, 'synced')`
              ).run(...Object.values(recordToSave))
            } else {
              // Local record exists: check if there are pending unpushed changes
              let pendingItems: any[] = []
              try {
                pendingItems = db
                  .prepare(
                    `SELECT * FROM sync_queue WHERE table_name = ? AND record_id = ? AND status IN ('pending', 'error') ORDER BY id ASC`
                  )
                  .all(table, record.id) as any[]
              } catch {
                pendingItems = []
              }

              if (pendingItems.length === 0) {
                // No pending local edits: apply remote updates directly
                const localDate = new Date(local.updated_at || '2000-01-01')
                const cloudDate = new Date(record.updated_at || '2000-01-01')
                const hasNewerPrint =
                  table === 'student_payments' &&
                  (recordToSave.print_count || 0) > (local.print_count || 0)

                if (localDate <= cloudDate || forceFullSync || hasNewerPrint) {
                  const updates = Object.entries(recordToSave)
                    .filter(([k]) => colNames.has(k) && k !== 'id')
                    .map(([key]) => `${key} = ?`)
                    .join(', ')
                  const vals = Object.entries(recordToSave)
                    .filter(([k]) => colNames.has(k) && k !== 'id')
                    .map(([, v]) => v)

                  db.prepare(`UPDATE ${table} SET ${updates}, sync_status = 'synced' WHERE id = ?`).run(
                    ...vals,
                    record.id
                  )

                  if (table === 'student_payments') {
                    try {
                      db.prepare(`
                        UPDATE cash_journal 
                        SET print_count = MAX(COALESCE(print_count, 0), ?),
                            last_printed_at = COALESCE(?, last_printed_at),
                            last_printed_by = COALESCE(?, last_printed_by),
                            receipt_number = COALESCE(?, receipt_number)
                        WHERE related_payment_id = ?
                      `).run(
                        recordToSave.print_count || 0,
                        recordToSave.last_printed_at || null,
                        recordToSave.last_printed_by || null,
                        recordToSave.receipt_number || null,
                        record.id
                      )
                    } catch {}
                  }
                }
              } else {
                // CONCURRENT EDIT DETECTED: 3-way field-level merge
                const mergeRes = mergeRecordFields(table, local, recordToSave, pendingItems, colNames)

                if (mergeRes.shouldKeepDelete) {
                  db.prepare(`UPDATE ${table} SET deleted = 1 WHERE id = ?`).run(record.id)
                  continue
                }

                // If remote update superseded local delete, remove delete queue item
                const delQ = pendingItems.find((q) => q.action === 'delete')
                if (delQ && !mergeRes.shouldKeepDelete) {
                  db.prepare(`DELETE FROM sync_queue WHERE id = ?`).run(delQ.id)
                  pendingItems = pendingItems.filter((q) => q.id !== delQ.id)
                }

                const updateCols = Object.keys(mergeRes.mergedRecord).filter(
                  (k) => colNames.has(k) && k !== 'id'
                )
                const setClause = updateCols.map((c) => `${c} = ?`).join(', ')
                const updateVals = updateCols.map((c) => mergeRes.mergedRecord[c])
                const hasPendingToPush = Object.keys(mergeRes.stillPendingFields).length > 0
                const nextStatus = hasPendingToPush ? 'pending' : 'synced'

                db.prepare(`UPDATE ${table} SET ${setClause}, sync_status = ? WHERE id = ?`).run(
                  ...updateVals,
                  nextStatus,
                  record.id
                )

                // Update sync_queue accordingly
                if (hasPendingToPush && pendingItems.length > 0) {
                  const latestQ = pendingItems[pendingItems.length - 1]
                  db.prepare(
                    `UPDATE sync_queue SET data = ?, status = 'pending', error_message = NULL WHERE id = ?`
                  ).run(
                    JSON.stringify({ ...mergeRes.mergedRecord, ...mergeRes.stillPendingFields }),
                    latestQ.id
                  )

                  if (pendingItems.length > 1) {
                    const oldIds = pendingItems.slice(0, -1).map((q) => q.id)
                    db.prepare(`DELETE FROM sync_queue WHERE id IN (${oldIds.map(() => '?').join(',')})`).run(
                      ...oldIds
                    )
                  }
                } else if (pendingItems.length > 0) {
                  const allIds = pendingItems.map((q) => q.id)
                  db.prepare(
                    `UPDATE sync_queue SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL WHERE id IN (${allIds.map(() => '?').join(',')})`
                  ).run(...allIds)
                }

                if (table === 'student_payments') {
                  try {
                    db.prepare(`
                      UPDATE cash_journal 
                      SET print_count = MAX(COALESCE(print_count, 0), ?),
                          last_printed_at = COALESCE(?, last_printed_at),
                          last_printed_by = COALESCE(?, last_printed_by),
                          receipt_number = COALESCE(?, receipt_number)
                      WHERE related_payment_id = ?
                    `).run(
                      mergeRes.mergedRecord.print_count || 0,
                      mergeRes.mergedRecord.last_printed_at || null,
                      mergeRes.mergedRecord.last_printed_by || null,
                      mergeRes.mergedRecord.receipt_number || null,
                      record.id
                    )
                  } catch {}
                }

                if (mergeRes.hasConflict) {
                  try {
                    db.prepare(`
                      INSERT INTO settings_history (key, old_value, new_value, changed_by, created_at)
                      VALUES (?, ?, ?, 'sync_field_merge', CURRENT_TIMESTAMP)
                    `).run(
                      `conflict:${table}:${record.id}`,
                      JSON.stringify(local),
                      JSON.stringify(mergeRes.mergedRecord)
                    )
                  } catch {}
                }
              }
            }
          } catch (err) {
            console.error(`Sync error applying row in ${table}:`, err)
            hasPullErrors = true
          }
        }
      })

      applyTableBatch(allRecords)
    }

    // Pull and safely deep-merge settings from cloud (finance_prices, class_sections)
    try {
      broadcastProgress({
        phase: 'pulling',
        current: tables.length,
        total: tables.length,
        percent: 95,
        message: 'Synchronisation des tarifs et paramètres...',
        tableName: 'settings'
      })

      const { data: cloudSettings, error: settingsPullError } = await supabase
        .from('settings')
        .select('*')

      if (!settingsPullError && cloudSettings) {
        for (const remoteRow of cloudSettings) {
          if (remoteRow.key === 'finance_prices' && remoteRow.value) {
            const localPricesRow = db
              .prepare("SELECT value, updated_at FROM settings WHERE key = 'finance_prices'")
              .get() as { value: string; updated_at?: string } | undefined

            const remotePricesVal =
              typeof remoteRow.value === 'string'
                ? JSON.parse(remoteRow.value)
                : remoteRow.value
            const localPricesVal = localPricesRow
              ? typeof localPricesRow.value === 'string'
                ? JSON.parse(localPricesRow.value)
                : localPricesRow.value
              : {}

            const remoteDate = new Date(remoteRow.updated_at || '2000-01-01')
            const localDate = new Date(localPricesRow?.updated_at || '2000-01-01')
            const preferRemote = remoteDate >= localDate

            const merged = deepMergeFinancePrices(localPricesVal, remotePricesVal, preferRemote)
            db.prepare(
              `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('finance_prices', ?, ?)`
            ).run(JSON.stringify(merged), remoteRow.updated_at || new Date().toISOString())
          } else if (remoteRow.key !== 'last_sync_time' && !LOCAL_ONLY_SETTINGS.has(remoteRow.key)) {
            const localRow = db
              .prepare('SELECT value, updated_at FROM settings WHERE key = ?')
              .get(remoteRow.key) as { value: string; updated_at?: string } | undefined

            if (!localRow || new Date(localRow.updated_at || '2000-01-01') <= new Date(remoteRow.updated_at || '2000-01-01')) {
              db.prepare(
                `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`
              ).run(
                remoteRow.key,
                typeof remoteRow.value === 'object' ? JSON.stringify(remoteRow.value) : remoteRow.value,
                remoteRow.updated_at || new Date().toISOString()
              )
            }
          }
        }
      }
    } catch (settingsErr) {
      console.error('Error pulling and merging settings:', settingsErr)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }

  if (!hasPullErrors) {
    db.prepare(
      `INSERT OR REPLACE INTO settings (key, value, updated_at)
       VALUES ('last_sync_time', ?, CURRENT_TIMESTAMP)`
    ).run(JSON.stringify(new Date().toISOString()))
  }
}

/**
 * Start periodic sync loop with safety checks
 */
export function startPeriodicSync() {
  setTimeout(async () => {
    await syncWithCloud()
  }, 2000)

  setInterval(async () => {
    await syncWithCloud()
  }, 5 * 60 * 1000)
}

/**
 * Wipe Remote Data for development / reset purposes
 */
export async function wipeRemoteData() {
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: 'Supabase non configuré' }
  }

  try {
    const { error: errBus } = await supabase
      .from('bus_attendance')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: errCanteen } = await supabase
      .from('canteen_attendance')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: errEventPay } = await supabase
      .from('event_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    const { error: errCash } = await supabase
      .from('cash_journal')
      .delete()
      .not('related_student_id', 'is', null)

    const { error: err1 } = await supabase
      .from('student_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: err2 } = await supabase
      .from('student_fees')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: err3 } = await supabase
      .from('students')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (err1 || err2 || err3 || errBus || errCanteen || errEventPay || errCash) {
      return { success: false, error: 'Échec partiel de purge distante' }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
