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
const runMigrations = () => {
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

    console.log(`Applying migration: ${migFile}`)

    const migrationPath = isDev
      ? path.join(app.getAppPath(), 'src/main/database/migrations', migFile)
      : path.join(process.resourcesPath, 'migrations', migFile)

    if (!fs.existsSync(migrationPath)) {
      console.warn(`Migration file not found: ${migrationPath}. Skipping.`)
      return
    }

    try {
      const migrationSql = fs.readFileSync(migrationPath, 'utf-8')
      db.exec(migrationSql)
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migFile)
      console.log(`Migration ${migFile} applied successfully.`)
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
    '011_sync_subscriptions_with_payments.sql'
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
        console.log(`[SchemaRepair] Adding missing column ${col} to ${tableName}`)
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
  'email'
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

// AUTO-CLEANUP: Remove corrupted students (empty registration_number) on startup
try {
  const deleted = db
    .prepare("DELETE FROM students WHERE registration_number IS NULL OR registration_number = ''")
    .run()
  if (deleted.changes > 0) {
    console.log(`Cleanup: Removed ${deleted.changes} invalid student records (missing matricule).`)
  }
} catch (e) {
  console.error('Cleanup error:', e)
}

export default db
