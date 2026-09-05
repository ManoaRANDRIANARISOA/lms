import { createClient } from '@supabase/supabase-js'
import db from '../database/db'
import dotenv from 'dotenv'
import path from 'path'
import * as fs from 'fs'
import { app, BrowserWindow } from 'electron'
import { LoggerService } from './logger.service'

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
  'settings'
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
 * Health check to Supabase with latency measurement and 5s timeout
 */
export async function checkCloudHealth(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, error: 'Identifiants Supabase absents du fichier .env' }
  }

  const start = Date.now()
  try {
    const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error('Délai d’attente réseau dépassé (5s)')), 5000)
    )

    const probePromise = supabase
      .from('settings')
      .select('key')
      .limit(1)

    const result = (await Promise.race([probePromise, timeoutPromise])) as any

    if (result && result.error) {
      return { ok: false, error: result.error.message || 'Erreur retournée par Supabase' }
    }

    return { ok: true, latencyMs: Date.now() - start }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/**
 * Retrieve queue status
 */
export function getSyncQueueStatus(): {
  pendingCount: number
  errorCount: number
  lastSyncTime: string | null
} {
  try {
    const counts = db
      .prepare(
        `SELECT 
          SUM(CASE WHEN status IN ('pending', 'error') THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
         FROM sync_queue`
      )
      .get() as { pending: number | null; errors: number | null } | undefined

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
      lastSyncTime
    }
  } catch {
    return { pendingCount: 0, errorCount: 0, lastSyncTime: null }
  }
}

/**
 * Retrieve failed queue items
 */
export function getSyncQueueErrors(limit = 50) {
  try {
    return db
      .prepare(
        `SELECT id, table_name, record_id, action, status, error_message, created_at, updated_at
         FROM sync_queue
         WHERE status IN ('error', 'skipped')
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(limit)
  } catch {
    return []
  }
}

/**
 * Reset all failed and skipped records to pending for safe retry
 */
export function retrySyncErrors(): { changes: number } {
  try {
    const res = db
      .prepare(
        `UPDATE sync_queue
         SET status = 'pending', error_message = NULL
         WHERE status IN ('error', 'skipped')`
      )
      .run()
    return { changes: res.changes }
  } catch {
    return { changes: 0 }
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

    // PUSH: Send local changes to cloud
    await pushLocalChanges()

    // PULL: Get remote changes from cloud
    await pullRemoteChanges(forceFullSync)

    const finalStatus = getSyncQueueStatus()
    broadcastProgress({
      phase: 'success',
      current: 100,
      total: 100,
      percent: 100,
      message: 'Synchronisation terminée avec succès',
      lastSync: finalStatus.lastSyncTime || new Date().toISOString(),
      pendingCount: finalStatus.pendingCount,
      errorCount: finalStatus.errorCount
    })

    return { success: true }
  } catch (error: any) {
    console.error('Sync error:', error)
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

  if ('search_text' in payload) delete payload.search_text
  if ('is_reenrollment' in payload) delete payload.is_reenrollment
  if ('payroll_start_date' in payload) delete payload.payroll_start_date
  if (tableName === 'parent_events' && 'school_year' in payload) delete payload.school_year

  const dateFields = [
    'date_of_birth',
    'departure_date',
    'hire_date',
    'start_date',
    'end_date',
    'payment_date',
    'attendance_date',
    'advance_date',
    'repayment_date'
  ]
  for (const field of dateFields) {
    if (payload[field] === '') {
      payload[field] = null
    }
  }

  if (tableName === 'students') {
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k])
    if (!payload.guardian_contact) payload.guardian_contact = ''
    if (!payload.enrollment_date) payload.enrollment_date = new Date().toISOString().split('T')[0]
    payload.updated_at = new Date().toISOString()
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
 * Deep merge finance_prices to prevent wiping out custom bus routes or uniform items
 */
function deepMergeFinancePrices(local: any, remote: any): any {
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

  // Bus prices: merge dictionaries minus tombstones
  const combinedBusPrices = { ...(remote.bus || {}), ...(local.bus || {}) }
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

  // Uniform prices: merge dictionaries minus tombstones
  const combinedUniformPrices = { ...(remote.uniforms || {}), ...(local.uniforms || {}) }
  for (const i of tombstonedUniforms) {
    delete combinedUniformPrices[i]
  }

  // Tuition: merge dictionaries, prefer non-zero
  const tuitionKeys = Array.from(
    new Set([...Object.keys(remote.tuition || {}), ...Object.keys(local.tuition || {})])
  )
  const combinedTuition: Record<string, number> = {}
  for (const k of tuitionKeys) {
    const locVal = local.tuition?.[k]
    const remVal = remote.tuition?.[k]
    combinedTuition[k] = locVal && locVal > 0 ? locVal : remVal || 0
  }

  return {
    ...remote,
    ...local,
    busRoutes: combinedRoutes,
    bus: combinedBusPrices,
    deletedBusRoutes: Array.from(tombstonedRoutes),
    uniformItems: combinedUniforms,
    uniforms: combinedUniformPrices,
    deletedUniformItems: Array.from(tombstonedUniforms),
    tuition: combinedTuition
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

    if (queue.length === 0) break

    const failedTables = new Set<string>()

    for (const item of queue) {
      if (failedTables.has(item.table_name)) {
        continue
      }

      // Dependency check: skip child tables if parent table failed
      const deps = TABLE_DEPENDENCIES[item.table_name] || []
      if (deps.some((d) => failedTables.has(d))) {
        continue
      }

      try {
        let rawData: any = {}
        try {
          rawData = JSON.parse(item.data)
        } catch {
          rawData = {}
        }

        const payload = sanitizeRowPayload(item.table_name, item.action, rawData, item.record_id)

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
              .upsert(payload, { onConflict: 'username' })
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
          } else {
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
        failedTables.add(item.table_name)
        const errMsg = error?.message || 'Erreur inconnue Supabase'
        LoggerService.log(
          'error',
          'sync',
          `Échec envoi (${item.table_name} ID: ${item.record_id}) : ${errMsg}`,
          error
        )

        // Keep status as error so it remains visible in the Sync modal and can be retried
        db.prepare(
          `UPDATE sync_queue
           SET status = 'error', error_message = ?
           WHERE id = ?`
        ).run(errMsg, item.id)
      }
    }
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

  let lastSync = '2020-01-01T00:00:00Z'
  if (!forceFullSync && settingsRow && settingsRow.value) {
    try {
      lastSync = JSON.parse(settingsRow.value)
    } catch {
      lastSync = settingsRow.value
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
    'canteen_attendance'
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
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true })
          .range(from, to)

        if (error) {
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
              db.prepare(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`).run(
                recordToSave.updated_at,
                record.id
              )
            } else {
              const fields = Object.keys(recordToSave).join(', ')
              const placeholders = Object.keys(recordToSave)
                .map(() => '?')
                .join(', ')
              db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`).run(
                ...Object.values(recordToSave)
              )
            }
            continue
          }

          if (table === 'cash_journal' && !recordToSave.department) {
            recordToSave.department = 'eleve'
          }

          // Safe conflict resolution for unique constraints
          const uniqueConstraints: Record<string, string[]> = {
            users: ['username'],
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
              // Local vs Cloud resolution
              const localDate = new Date(local.updated_at || '2000-01-01')
              const cloudDate = new Date(record.updated_at || '2000-01-01')
              if (localDate <= cloudDate || forceFullSync) {
                const updates = Object.entries(recordToSave)
                  .map(([key]) => `${key} = ?`)
                  .join(', ')
                db.prepare(`UPDATE ${table} SET ${updates}, sync_status = 'synced' WHERE id = ?`).run(
                  ...Object.values(recordToSave),
                  record.id
                )
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
              .prepare("SELECT value FROM settings WHERE key = 'finance_prices'")
              .get() as { value: string } | undefined

            const remotePricesVal =
              typeof remoteRow.value === 'string'
                ? JSON.parse(remoteRow.value)
                : remoteRow.value
            const localPricesVal = localPricesRow
              ? typeof localPricesRow.value === 'string'
                ? JSON.parse(localPricesRow.value)
                : localPricesRow.value
              : {}

            const merged = deepMergeFinancePrices(localPricesVal, remotePricesVal)
            db.prepare(
              `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('finance_prices', ?, ?)`
            ).run(JSON.stringify(merged), remoteRow.updated_at || new Date().toISOString())
          } else if (remoteRow.key !== 'last_sync_time') {
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
