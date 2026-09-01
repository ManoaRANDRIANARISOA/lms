import { createClient } from '@supabase/supabase-js'
import db from '../database/db'
import dotenv from 'dotenv'
import path from 'path'
import * as fs from 'fs'
import { app } from 'electron' // Load env vars
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
    // console.log('Supabase client initialized');
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e)
  }
} else {
  console.warn('Supabase credentials missing. Sync will be disabled.')
}

// Export a getter or the client (might be null)
// To keep compatibility with existing code that imports 'supabase',
// we can export a proxy or just the object, but consumers must check for null/undefined if we change type.
// However, the existing code `export const supabase = ...` implies it's always there.
// If I change it to `export const supabase = ...` but initialization failed, createClient throws.

// Better approach: Mock client if missing, or just handle it.
// But createClient throws if url is missing.

export const supabase = supabaseClient || {
  from: () => ({
    select: () => ({ gt: () => ({ data: [], error: { message: 'Supabase not configured' } }) }),
    upsert: () => ({ error: { message: 'Supabase not configured' } }),
    update: () => ({ eq: () => ({ error: { message: 'Supabase not configured' } }) }),
    delete: () => ({ neq: () => ({ error: { message: 'Supabase not configured' } }) })
  }),
  storage: {
    getBucket: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
    createBucket: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
    from: () => ({
      upload: () => Promise.resolve({ error: { message: 'Supabase not configured' } }),
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

/**
 * Add a record to the local sync queue.
 * IMPORTANT: This function is SYNCHRONOUS because it is called inside
 * better-sqlite3 transactions (db.transaction) which do not support async.
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
  } catch (error) {
    console.error('Error adding to sync queue:', error)
  }
}

// Main sync function (called every 5 minutes if online)
export async function syncWithCloud(forceFullSync: boolean = false) {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials missing, skipping sync.')
    return { success: false, reason: 'config_missing' }
  }

  try {
    // PUSH: Send local changes to cloud
    await pushLocalChanges()

    // PULL: Get remote changes from cloud
    await pullRemoteChanges(forceFullSync)

    return { success: true }
  } catch (error: any) {
    console.error('Sync error:', error)
    return { success: false, error: error.message }
  }
}

// Wipe Remote Data
export async function wipeRemoteData() {
  if (!supabaseUrl || !supabaseKey) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    // Delete in reverse order of dependencies

    // 1. Attendance & Event Payments
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

    // 2. Core Student Data
    const { error: errCash } = await supabase
      .from('cash_journal')
      .delete()
      .not('related_student_id', 'is', null)
    if (errCash) console.error('Error wiping student cash journal:', errCash)

    const { error: err1 } = await supabase
      .from('student_payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (err1) console.error('Error wiping payments:', err1)

    const { error: err2 } = await supabase
      .from('student_fees')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (err2) console.error('Error wiping fees:', err2)

    const { error: err3 } = await supabase
      .from('students')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (err3) console.error('Error wiping students:', err3)

    if (err1 || err2 || err3 || errBus || errCanteen || errEventPay || errCash) {
      return { success: false, error: 'Partial failure checking console logs' }
    }
    return { success: true }
  } catch (e: any) {
    console.error('Remote wipe error:', e)
    return { success: false, error: e.message }
  }
}

// Table sync priority: parent tables must be pushed before child tables
// to avoid FK violations on Supabase.
// This ordering is inlined in the SQL query below.

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

async function pushLocalChanges() {
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
          WHEN 'subjects' THEN 1
          WHEN 'students' THEN 2
          WHEN 'personnel' THEN 2
          WHEN 'student_fees' THEN 3
          WHEN 'class_subjects' THEN 3
          WHEN 'grades' THEN 4
          WHEN 'time_tracking' THEN 4
          WHEN 'daily_attendance' THEN 4
          WHEN 'personnel_absences' THEN 4
          WHEN 'salary_advances' THEN 4
          WHEN 'custom_deductions' THEN 4
          WHEN 'student_payments' THEN 5
          WHEN 'cash_journal' THEN 5
          WHEN 'parent_events' THEN 5
          WHEN 'event_payments' THEN 6
          WHEN 'bus_attendance' THEN 6
          WHEN 'canteen_attendance' THEN 6
          WHEN 'users' THEN 7
          WHEN 'settings' THEN 8
          ELSE 99
        END
      END ASC,
      created_at ASC
    LIMIT 100
  `
    )
    .all() as any[]

  const failedTables = new Set<string>()

  for (const item of queue) {
    try {
      if (!SYNCABLE_TABLES.has(item.table_name)) {
        console.error(`Skipping unauthorized table in sync queue: ${item.table_name}`)
        db.prepare(
          `UPDATE sync_queue SET status = 'skipped', error_message = 'Forbidden table name' WHERE id = ?`
        ).run(item.id)
        continue
      }

      // Special case: Do not push `last_sync_time` or other machine-specific settings
      if (item.table_name === 'settings') {
        let data: any
        try {
          data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data
        } catch {
          data = { key: item.record_id, value: item.data }
        }
        if (data.key === 'last_sync_time' || item.record_id === 'last_sync_time') {
          db.prepare(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`).run(item.id)
          continue
        }
      }

      // Check dependencies to prevent FK violations
      const deps = TABLE_DEPENDENCIES[item.table_name] || []
      const hasFailedDep = deps.some((dep) => failedTables.has(dep))
      if (hasFailedDep) {
        db.prepare(
          `UPDATE sync_queue SET status = 'pending', error_message = 'Delayed due to parent table error' WHERE id = ?`
        ).run(item.id)
        continue
      }

      const data = JSON.parse(item.data)
      let payload = { ...data }

      // FIX: Ensure payload has id for upsert and localRow fetching (except settings where PK is key)
      if (item.table_name === 'settings') {
        if (!payload.key && item.record_id) payload.key = item.record_id
      } else {
        if (!payload.id && item.record_id) {
          payload.id = item.record_id
        }
      }

      // FIX: Merge with full local row to prevent Supabase UPSERT failures
      // due to missing NOT NULL columns if the remote record is missing.
      try {
        if (item.table_name === 'settings' && payload.key && item.action !== 'delete') {
          const localRow = db.prepare(`SELECT * FROM settings WHERE key = ?`).get(payload.key) as any
          if (localRow) payload = { ...payload, ...localRow }
        } else if (payload.id && item.action !== 'delete') {
          const localRow = db
            .prepare(`SELECT * FROM ${item.table_name} WHERE id = ?`)
            .get(payload.id)
          if (localRow) {
            payload = { ...payload, ...localRow }
          }
        }
      } catch (e) {
        console.warn('Could not merge local row for sync:', e)
      }

      // FIX: Remove GENERATED columns that Postgres will reject
      if ('search_text' in payload) {
        delete payload.search_text
      }
      // FIX: Strip local-only columns that do not exist in Supabase yet
      if ('is_reenrollment' in payload) delete payload.is_reenrollment;
      if ('payroll_start_date' in payload) delete payload.payroll_start_date;
      if (item.table_name === 'parent_events' && 'school_year' in payload) delete payload.school_year;

      // FIX: Sanitize empty date strings for PostgreSQL
      // PostgreSQL rejects "" as date, must be NULL
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

      // FIX: Skip records with missing required foreign keys
      if (item.table_name === 'student_fees' && !payload.student_id) {
        console.warn(`Skipping student_fees ${payload.id}: missing student_id`)
        db.prepare(
          `UPDATE sync_queue SET status = 'skipped', error_message = 'Missing student_id' WHERE id = ?`
        ).run(item.id)
        continue
      }
      if (item.table_name === 'student_fees' && !payload.school_year) {
        console.warn(`Skipping student_fees ${payload.id}: missing school_year`)
        db.prepare(
          `UPDATE sync_queue SET status = 'skipped', error_message = 'Missing school_year' WHERE id = ?`
        ).run(item.id)
        continue
      }

      if (item.table_name === 'students') {
        // Remove undefined fields
        Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key])

        // Ensure updated_at is set
        payload.updated_at = new Date().toISOString()

        // HARDENED VALIDATION: Prevent Ghost Records
        // If key fields are missing, DO NOT PUSH.
        if (
          item.action === 'create' &&
          (!payload.first_name || !payload.last_name || !payload.registration_number)
        ) {
          console.error(`Skipping invalid student record ${payload.id}: Missing required fields.`)
          // Mark as error to remove from pending queue, but don't delete data
          db.prepare(
            `UPDATE sync_queue SET status = 'skipped', error_message = 'Missing required fields' WHERE id = ?`
          ).run(item.id)
          continue
        }
      } else {
        // For other tables, use data as is (or add more mapping if needed)
        // Ensure we don't send local-only fields if they exist
      }

      // FIX: Check for "guardian_contact" NOT NULL constraint in Supabase
      // If payload has no guardian_contact (because it was optional in UI),
      // but DB enforces NOT NULL, we must provide a default or allow NULL in DB.
      // Based on error: "null value in column "guardian_contact" ... violates not-null constraint"
      // We should provide an empty string if it is missing.

      if (item.table_name === 'students') {
        if (!payload.guardian_contact) payload.guardian_contact = ''
      }

      // FIX: Check for "class" NOT NULL constraint
      // IMPORTANT: Only set default class on CREATE, never on UPDATE.
      // Partial updates (e.g. address change) do not include 'class' in the payload.
      // We removed the 'Non inscrit' default because it overwrites local data on pull. SQLite allows empty strings.

      // FIX: Check for "enrollment_date" NOT NULL constraint
      if (item.table_name === 'students' && !payload.enrollment_date) {
        payload.enrollment_date = new Date().toISOString().split('T')[0]
      }

      // FIX: Handle Photo Upload (Offline-First)
      // If photo_path is a local path (starts with / or X:\), try to upload it.
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
            const fileName = `${payload.id}-${Date.now()}${fileExt}`

            // Automate Bucket Creation (Best effort)
            try {
              // We don't need the bucket data, just checking/creating
              const { error: bucketError } = await supabase.storage.getBucket('student-photos')
              if (bucketError) {
                // Bucket likely doesn't exist, try to create it
                // If create fails (e.g. permission denied), we can't do much automatically.
                // But we can try to upload anyway, sometimes getBucket fails but upload works if public.
                const { error: createError } = await supabase.storage.createBucket(
                  'student-photos',
                  { public: true }
                )
                if (createError) console.warn('Bucket creation warning:', createError.message)
              }
            } catch (e) {
              // Ignore bucket creation errors (might be permission issue or already exists)
            }

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('student-photos')
              .upload(fileName, fileBuffer, {
                contentType: 'image/' + fileExt.replace('.', ''),
                upsert: true
              })

            if (uploadError) {
              console.error('Photo upload failed:', uploadError)

              // If error is "Bucket not found", it means we really need that bucket.
              // Since we can't create it with Anon key usually, user MUST do it in Dashboard.
              // We should NOT throw error here to block the whole student sync?
              // Actually user said "pas de reaction imprevue".
              // If we throw, the student stays in "pending" sync. That's good.

              throw new Error('Photo upload failed: ' + uploadError.message)
            } else if (uploadData) {
              const { data: publicUrlData } = supabase.storage
                .from('student-photos')
                .getPublicUrl(fileName)

              if (publicUrlData && publicUrlData.publicUrl) {
                payload.photo_path = publicUrlData.publicUrl

                // Update Local DB immediately to reflect the Cloud URL
                // This ensures next time we don't try to upload again
                db.prepare('UPDATE students SET photo_path = ? WHERE id = ?').run(
                  payload.photo_path,
                  payload.id
                )
              }
            }
          }
        } catch (uploadEx) {
          console.error('Error processing photo upload:', uploadEx)
        }
      }

      // Users table: password_hash is synced. It is securely hashed with bcrypt.

      if (item.action === 'create' || item.action === 'update') {
        // Convert SQLite booleans (0/1 or "0.0") to PostgreSQL booleans (true/false)
        const supabasePayload: any = {}
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

        // Handle tables with composite unique constraints that differ from PK
        let upsertError: any
        if (item.table_name === 'settings') {
          delete supabasePayload.id
          const settingPayload = {
            key: payload.key || item.record_id,
            value: typeof payload.value === 'string' ? payload.value : JSON.stringify(payload.value),
            updated_at: new Date().toISOString()
          }
          const { error } = await supabase.from('settings').upsert(settingPayload, { onConflict: 'key' })
          upsertError = error
        } else if (item.table_name === 'time_tracking') {
          const { error } = await supabase
            .from(item.table_name)
            .upsert(supabasePayload, { onConflict: 'personnel_id,month' })
          upsertError = error
        } else if (item.table_name === 'grades') {
          const { error } = await supabase
            .from(item.table_name)
            .upsert(supabasePayload, { onConflict: 'student_id,subject_id,school_year,term' })
          upsertError = error
        } else {
          const { error } = await supabase.from(item.table_name).upsert(supabasePayload)
          upsertError = error
        }

        if (upsertError) {
          // Handle Duplicate Key Error (23505) for registration_number
          if (
            upsertError.code === '23505' &&
            upsertError.message?.includes('registration_number')
          ) {
            console.warn(
              `Duplicate registration_number detected for ${payload.id}. Regenerating...`
            )

            // Fetch the real max registration number from Supabase
            // Improved logic to avoid naive sorting issues (2024-10 > 2024-9)
            const year = new Date().getFullYear()
            const { data: allRegs } = await supabase
              .from('students')
              .select('registration_number')
              .ilike('registration_number', `${year}-%`)

            let nextNum = 1
            if (allRegs && allRegs.length > 0) {
              // Parse manually to find max
              const nums = allRegs.map((r) => {
                const parts = r.registration_number.split('-')
                return parts.length === 2 ? parseInt(parts[1], 10) : 0
              })
              nextNum = Math.max(...nums) + 1
            }
            const newMatricule = `${year}-${String(nextNum).padStart(5, '0')}`

            // Update payload with new matricule
            payload.registration_number = newMatricule

            // Update Local DB with new matricule so it stays consistent
            db.prepare(`UPDATE students SET registration_number = ? WHERE id = ?`).run(
              newMatricule,
              payload.id
            )

            // Retry Upsert
            const { error: retryError } = await supabase.from(item.table_name).upsert(payload)

            if (retryError) {
              console.error(`Retry failed for ${item.table_name}:`, retryError)
              throw retryError
            }
          } else {
            throw upsertError
          }
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
        `
        UPDATE sync_queue
        SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL
        WHERE id = ?
      `
      ).run(item.id)

      // Update record sync status
      db.prepare(
        `
        UPDATE ${item.table_name}
        SET sync_status = 'synced'
        WHERE id = ?
      `
      ).run(item.record_id)
    } catch (error: any) {
      // Add to failed tables so dependents are skipped
      failedTables.add(item.table_name)

      const errorCode = error?.code || ''
      const isUnrecoverable = errorCode === '23503' || errorCode === '23505' || errorCode === '23502' || errorCode === '22001'

      if (!isUnrecoverable) {
        LoggerService.log(
          'error',
          'sync',
          `Erreur de synchronisation (Push) sur ${item.table_name}`,
          error
        )
      }

      db.prepare(
        `
        UPDATE sync_queue
        SET status = ?, error_message = ?
        WHERE id = ?
      `
      ).run(isUnrecoverable ? 'skipped' : 'error', error.message || 'Unknown error', item.id)
    }
  }
}

async function pullRemoteChanges(forceFullSync: boolean = false) {
  let hasPullErrors = false
  const settingsRow = db
    .prepare(
      `
    SELECT value FROM settings WHERE key = 'last_sync_time'
  `
    )
    .get() as { value: string } | undefined

  // JSON.parse because settings.value is stored as JSON string in the schema: value TEXT (JSON value)
  let lastSync = '2020-01-01T00:00:00Z'
  if (!forceFullSync && settingsRow && settingsRow.value) {
    try {
      lastSync = JSON.parse(settingsRow.value)
    } catch (e) {
      lastSync = settingsRow.value // Fallback if not JSON
    }
  }

  const tables = [
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
    // Note: 'settings' and 'users' are handled separately or excluded from generic sync
  ]

  db.pragma('foreign_keys = OFF')

  try {
    for (const table of tables) {
      if (!SYNCABLE_TABLES.has(table)) {
        console.error(`Skipping unauthorized table in pull: ${table}`)
        continue
      }

      // POSTGREST PAGINATION: Fetch in 1000-record chunks to prevent truncation
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
          LoggerService.log('error', 'sync', `Erreur de synchronisation (Pull) sur ${table}`, error)
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

      for (const record of allRecords) {
        // Check if exists locally
        const local = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(record.id) as any

        const { search_text, ...recordToSave } = record

        // Sanitize object values for SQLite
        for (const key in recordToSave) {
          const val = recordToSave[key]
          if (typeof val === 'boolean') {
            recordToSave[key] = val ? 1 : 0
          } else if (typeof val === 'object' && val !== null) {
            recordToSave[key] = JSON.stringify(val)
          }
        }

        // Handle deleted records coming from cloud
        if (recordToSave.deleted) {
          if (local) {
            // Update local record to deleted
            db.prepare(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`).run(
              recordToSave.updated_at,
              record.id
            )
          } else {
            // We must insert it as deleted, so foreign keys don't break!
            // Especially for students/personnel that other tables reference.
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

        // Handle schema differences for cash_journal
        if (table === 'cash_journal' && !recordToSave.department) {
          recordToSave.department = 'eleve'
        }

        // CONFLICT RESOLUTION: Check for Unique Constraint on registration_number
        // If we are about to insert/update a student, check if their registration_number is already taken by ANOTHER student locally.
        if (table === 'students' && recordToSave.registration_number) {
          const conflictingStudent = db
            .prepare(
              `
                SELECT * FROM students 
                WHERE registration_number = ? AND id != ?
            `
            )
            .get(recordToSave.registration_number, record.id) as any

          if (conflictingStudent) {
            console.warn(
              `Conflict detected: Matricule ${recordToSave.registration_number} taken by ${conflictingStudent.id}. Renaming local conflict.`
            )

            // We rename the LOCAL conflicting student's matricule to allow the REMOTE one (Server Authority) to land.
            // The local student will get a temporary matricule. When it tries to push later, we will handle the collision in pushLocalChanges.
            const tempMatricule = `${recordToSave.registration_number}_CONFLICT_${Date.now()}`

            db.prepare(`UPDATE students SET registration_number = ? WHERE id = ?`).run(
              tempMatricule,
              conflictingStudent.id
            )
          }
        }

        // CONFLICT RESOLUTION: Generic Unique Constraints
        // If Supabase sends a record that conflicts with a local unique index (but has a different UUID),
        // we delete the local conflicting record to let the Server Authority win.
        const uniqueConstraints = {
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

        const constraintKeys = uniqueConstraints[table]
        if (constraintKeys) {
          // Check if all keys exist in recordToSave
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
              console.warn(
                `Unique constraint conflict detected on ${table} for ${constraintKeys.join(',')}. Deleting local conflict ${conflict.id} to favor cloud record ${record.id}.`
              )
              db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(conflict.id)
            }
          }
        }

        try {
          if (!local) {
            // Insert new record
            const fields = Object.keys(recordToSave).join(', ')
            const placeholders = Object.keys(recordToSave)
              .map(() => '?')
              .join(', ')
            db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`).run(
              ...Object.values(recordToSave)
            )
          } else {
            // Conflict detection (Time-based)
            if (new Date(local.updated_at) > new Date(record.updated_at)) {
              // Local is newer
              console.warn(
                `Conflict detected for ${table} ${record.id} (Local is newer). Keeping local.`
              )
            } else {
              // Cloud is newer - update local
              const updates = Object.entries(recordToSave)
                .map(([key]) => `${key} = ?`)
                .join(', ')
              db.prepare(`UPDATE ${table} SET ${updates} WHERE id = ?`).run(
                ...Object.values(recordToSave),
                record.id
              )
            }
          }
        } catch (err: any) {
          console.error(`Sync error on pull for ${table} ID ${record.id}:`, err)
          hasPullErrors = true
        }
      }
    }

    // --------------------------------------------
    // Pull users from cloud (with pagination)
    // --------------------------------------------
    try {
      let remoteUsers: any[] = []
      let userPage = 0
      const userPageSize = 1000
      let fetchMoreUsers = true

      while (fetchMoreUsers) {
        const from = userPage * userPageSize
        const to = from + userPageSize - 1
        const { data, error: usersError } = await supabase
          .from('users')
          .select('id, username, role, full_name, email, active, version, updated_at, password_hash')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true })
          .range(from, to)

        if (usersError) {
          console.error('Error pulling users:', usersError)
          hasPullErrors = true
          fetchMoreUsers = false
          break
        }

        if (data && data.length > 0) {
          remoteUsers.push(...data)
          if (data.length < userPageSize) {
            fetchMoreUsers = false
          } else {
            userPage++
          }
        } else {
          fetchMoreUsers = false
        }
      }

      for (const remoteUser of remoteUsers) {
        const localUser = db.prepare('SELECT * FROM users WHERE id = ?').get(remoteUser.id) as any

        const { ...userData } = remoteUser

        // Sanitize booleans for SQLite
        if (typeof userData.active === 'boolean') {
          userData.active = userData.active ? 1 : 0
        }

        if (!localUser) {
          // New user from cloud
          const fields = Object.keys(userData).join(', ')
          const placeholders = Object.keys(userData)
            .map(() => '?')
            .join(', ')
          db.prepare(
            `INSERT INTO users (${fields}, sync_status) VALUES (${placeholders}, 'synced')`
          ).run(...Object.values(userData))
        } else {
          // Conflict detection (Time-based)
          if (new Date(localUser.updated_at) > new Date(remoteUser.updated_at)) {
            console.warn(
              `Conflict detected for users ${remoteUser.id} (Local is newer). Keeping local.`
            )
          } else {
            // Cloud is newer - update local
            const updates = Object.entries(userData)
              .map(([key]) => `${key} = ?`)
              .join(', ')
            db.prepare(`UPDATE users SET ${updates}, sync_status = 'synced' WHERE id = ?`).run(
              ...Object.values(userData),
              remoteUser.id
            )
          }
        }
      }
    } catch (e) {
      console.error('Error syncing users from cloud:', e)
      hasPullErrors = true
    }

    // --------------------------------------------
    // Pull settings from cloud (school_year, school_name, finance_prices, etc.)
    // --------------------------------------------
    try {
      const { data: remoteSettings, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .neq('key', 'last_sync_time')

      if (!settingsError && remoteSettings) {
        for (const remoteSetting of remoteSettings) {
          const localSetting = db
            .prepare('SELECT value, updated_at FROM settings WHERE key = ?')
            .get(remoteSetting.key) as { value: string; updated_at: string } | undefined

          if (!localSetting) {
            db.prepare(
              'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
            ).run(
              remoteSetting.key,
              remoteSetting.value,
              remoteSetting.updated_at || new Date().toISOString()
            )
          } else {
            const localDate = new Date(localSetting.updated_at || '2000-01-01')
            const remoteDate = new Date(remoteSetting.updated_at || '2000-01-01')
            if (remoteDate >= localDate) {
              db.prepare(
                'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?'
              ).run(
                remoteSetting.value,
                remoteSetting.updated_at || new Date().toISOString(),
                remoteSetting.key
              )
            }
          }
        }
      }
    } catch (e) {
      console.error('Error syncing settings from cloud:', e)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }

  // Update last sync time ONLY if no errors occurred
  if (!hasPullErrors) {
    db.prepare(
      `
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('last_sync_time', ?, CURRENT_TIMESTAMP)
    `
    ).run(JSON.stringify(new Date().toISOString()))
  }
}

// Start periodic sync (every 5 minutes)
export function startPeriodicSync() {
  // Sync immediately on startup (1s delay to let DB initialize)
  setTimeout(async () => {
    // console.log('Starting initial sync...');
    await syncWithCloud()
  }, 1000)

  setInterval(
    async () => {
      // In Main process, we just attempt sync.
      // If offline, the try/catch in syncWithCloud will handle it.
      await syncWithCloud()
    },
    5 * 60 * 1000
  ) // 5 minutes
}
