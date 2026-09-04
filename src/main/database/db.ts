import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const isDev = !app.isPackaged
const dbPath = isDev
  ? path.join(__dirname, '../../database.sqlite')
  : path.join(app.getPath('userData'), 'database.sqlite')

// Ensure directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Explicitly type db to avoid export errors
const db: Database.Database = new Database(dbPath, { verbose: undefined })
db.pragma('journal_mode = WAL')

// Migration runner
const runMigrations = (): void => {
  // Ensure migrations tracking table exists
  const migrationTableExists =
    (
      db
        .prepare(
          `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='migrations'`
        )
        .get() as { count: number }
    ).count > 0

  if (!migrationTableExists) {
    db.prepare(
      `CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run()
  }

  /**
   * Apply a single migration file if not already applied.
   * Resolves path relative to app root in dev, or resources dir in production.
   */
  function applyMigration(migFile: string): void {
    const alreadyApplied =
      (
        db.prepare('SELECT count(*) as count FROM migrations WHERE name = ?').get(migFile) as {
          count: number
        }
      ).count > 0

    if (alreadyApplied) return

    if (isDev) console.log(`Applying migration: ${migFile}`)

    const migrationPath = isDev
      ? path.join(app.getAppPath(), 'src/main/database/migrations', migFile)
      : path.join(process.resourcesPath, 'migrations', migFile)

    if (!fs.existsSync(migrationPath)) {
      console.warn(`Migration file not found: ${migrationPath}. Skipping.`)
      return
    }

    try {
      const migrationSql = fs.readFileSync(migrationPath, 'utf-8')
      const statements = migrationSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          for (const stmt of statements) {
            try {
              db.exec(stmt)
            } catch (stmtErr: unknown) {
              const msg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr)
              if (msg.includes('duplicate column name')) {
                // Ignore duplicate column name error (e.g. from schema repair)
              } else {
                throw stmtErr
              }
            }
          }
          db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migFile)
        })()
      } finally {
        db.pragma('foreign_keys = ON')
      }

      if (isDev) console.log(`Migration ${migFile} applied successfully.`)
    } catch (err) {
      console.error(`Migration ${migFile} failed:`, err)
    }
  }

  // Apply all migrations in order
  const migrations = [
    '001_init.sql',
    '002_add_parent_details.sql',
    '003_add_class_history.sql',
    '004_add_rbac.sql',
    '005_add_personnel_tables.sql',
    '006_add_daily_attendance.sql',
    '007_add_soft_delete_to_personnel_related.sql',
    '008_add_deleted_to_grades.sql',
    '009_seed_subjects.sql',
    '010_sync_student_class_from_fees.sql',
    '011_sync_subscriptions_with_payments.sql',
    '012_class_subjects.sql',
    '013_college_lycee_subjects.sql',
    '014_fix_preschool_subjects.sql',
    '015_seed_classes_setting.sql',
    '016_add_department_to_cash_journal.sql',
    '017_add_missing_indexes.sql',
    '018_fix_subject_uuids.sql',
    '019_clean_sync_errors.sql',
    '020_fix_class_subjects_fk.sql',
    '021_repair_fees_from_payments.sql',
    '022_add_journalier_exam_grades.sql',
    '023_add_personnel_cnaps_amounts.sql',
    '024_add_student_gender.sql',
    '025_add_assessments_table.sql',
    '026_add_uniform_items.sql',
    '026_add_parent_personnel_id.sql',
    '027_add_personnel_child.sql',
    '028_add_school_year_to_payments.sql',
    '028_add_is_reenrollment_to_fees.sql',
    '029_add_payroll_ignores.sql',
    '030_fix_event_school_year.sql',
    '031_add_payroll_start_date.sql',
    '032_add_app_logs.sql',
    '033_fix_payments_school_year_quotes.sql',
    '034_auto_provision_student_fees.sql',
    '035_normalize_receipt_numbers.sql',
    '036_link_payments_and_cash_journal.sql',
    '037_repair_payments_and_fees_alignment.sql',
    '038_auto_provision_all_enrolled_fees.sql',
    '039_normalize_receipt_station_codes.sql',
    '040_heal_finance_prices_settings.sql'
  ]
  migrations.forEach(applyMigration)
}

runMigrations()

// --------------------------------------------
// SCHEMA HEALING: Ensure expected columns exist
// (moved here from StudentRepository.update to avoid ALTER TABLE inside transactions)
// --------------------------------------------
function ensureTableColumns(tableName: string, columns: string[]): void {
  try {
    const info = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
    const existing = new Set(info.map((c) => c.name))
    for (const col of columns) {
      if (!existing.has(col)) {
        if (isDev) console.log(`[SchemaRepair] Adding missing column ${col} to ${tableName}`)
        db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${col} TEXT`).run()
      }
    }
  } catch (err) {
    console.error(`[SchemaRepair] Failed for ${tableName}:`, err)
  }
}

ensureTableColumns('students', [
  'first_name',
  'last_name',
  'date_of_birth',
  'place_of_birth',
  'class',
  'enrollment_date',
  'previous_school',
  'father_name',
  'mother_name',
  'guardian_name',
  'father_contact',
  'mother_contact',
  'guardian_contact',
  'father_profession',
  'mother_profession',
  'guardian_profession',
  'address',
  'photo_path',
  'siblings',
  'email',
  'gender',
  'is_personnel_child',
  'parent_personnel_id'
])

ensureTableColumns('student_fees', [
  'bus_subscribed',
  'bus_route',
  'canteen_subscribed',
  'canteen_days_per_week',
  'canteen_days',
  'uniform_tshirt_purchased',
  'uniform_apron_purchased',
  'uniform_shorts_purchased',
  'uniform_badge_purchased',
  'fram_paid_by_parent'
])

ensureTableColumns('parent_events', ['school_year'])

// SCHEMA HEALING: Ensure personnel sub-tables have soft-delete columns
// (Migration 007 was previously malformed as a single-line comment on some DBs.)
function ensureDeletedColumn(tableName: string): void {
  try {
    const info = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
    const hasDeleted = info.some((c) => c.name === 'deleted')
    if (!hasDeleted) {
      if (isDev) console.log(`[SchemaRepair] Adding missing 'deleted' column to ${tableName}`)
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN deleted BOOLEAN DEFAULT 0`).run()
    }
  } catch (err) {
    console.error(`[SchemaRepair] Failed for ${tableName}:`, err)
  }
}

ensureDeletedColumn('time_tracking')
ensureDeletedColumn('personnel_absences')
ensureDeletedColumn('salary_advances')
ensureDeletedColumn('custom_deductions')
ensureDeletedColumn('daily_attendance')

// AUTO-CLEANUP: Soft-delete corrupted students (empty registration_number) on startup
try {
  const deleted = db
    .prepare(
      `
      UPDATE students 
      SET deleted = 1, sync_status = 'pending'
      WHERE (registration_number IS NULL OR registration_number = '')
      AND deleted = 0
    `
    )
    .run()
  if (deleted.changes > 0) {
    if (isDev)
      console.log(
        `Cleanup: Soft-deleted ${deleted.changes} invalid student records (missing matricule).`
      )
  }
} catch (e) {
  console.error('Cleanup error:', e)
}

export default db
