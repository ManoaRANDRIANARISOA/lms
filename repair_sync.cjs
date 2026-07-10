const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

function repairDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`[SKIP] No database found at ${dbPath}`)
    return
  }
  try {
    const db = new Database(dbPath)
    console.log(`\n[REPAIR] Opened ${dbPath}`)

    // 1. Reset last_sync_time
    const resSettings = db
      .prepare(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('last_sync_time', '"2020-01-01T00:00:00.000Z"', CURRENT_TIMESTAMP)`
      )
      .run()
    console.log(`-> last_sync_time reset to 2020. Changes: ${resSettings.changes}`)

    // 2. Clear error_message from sync_queue where status = 'synced'
    const resCleared = db
      .prepare(
        `UPDATE sync_queue SET error_message = NULL WHERE status = 'synced' AND error_message IS NOT NULL`
      )
      .run()
    console.log(`-> Cleared stale errors from synced items. Records updated: ${resCleared.changes}`)

    // 3. Mark skipped items back to pending so they can retry now that schemas might be fixed
    const resSkipped = db
      .prepare(
        `UPDATE sync_queue SET status = 'pending', error_message = NULL WHERE status = 'skipped' OR status = 'error'`
      )
      .run()
    console.log(`-> Re-queued skipped/error items. Records updated: ${resSkipped.changes}`)

    db.close()
    console.log(`[DONE] ${dbPath}`)
  } catch (err) {
    console.error(`[ERROR] Failed to repair ${dbPath}:`, err)
  }
}

// Repair DEV Database
repairDb(path.join(__dirname, 'database.sqlite'))

// Repair Installed Database (if APPDATA is available)
if (process.env.APPDATA) {
  repairDb(path.join(process.env.APPDATA, 'lms', 'database.sqlite'))
} else {
  console.log('APPDATA not found, skipping Installed DB repair.')
}
