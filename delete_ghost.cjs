const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const schoolYear = '2025-2026'

const fees = db
  .prepare(
    `
  SELECT sf.id as fee_id, s.id as student_id, s.first_name, s.last_name, s.enrollment_date, sf.created_at,
         (SELECT COUNT(*) FROM student_payments sp WHERE sp.student_id = s.id AND sp.school_year = ?) as payment_count,
         (SELECT COUNT(*) FROM student_fees sf2 WHERE sf2.student_id = s.id) as total_fee_records
  FROM student_fees sf
  JOIN students s ON s.id = sf.student_id
  WHERE sf.school_year = ?
`
  )
  .all(schoolYear, schoolYear)

const zeroPaymentsAndMultipleYears = fees.filter(
  (f) => f.payment_count === 0 && f.total_fee_records > 1
)

console.log(`Found ${zeroPaymentsAndMultipleYears.length} ghost records to delete.`)

const deleteStmt = db.prepare('DELETE FROM student_fees WHERE id = ?')
let deletedCount = 0

db.transaction(() => {
  for (const record of zeroPaymentsAndMultipleYears) {
    console.log(
      `Deleting fee record ${record.fee_id} for student ${record.first_name} ${record.last_name}`
    )
    const result = deleteStmt.run(record.fee_id)
    deletedCount += result.changes

    // Push to sync queue so cloud gets updated
    db.prepare(
      `
      INSERT INTO sync_queue (table_name, record_id, action, data, status)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run('student_fees', record.fee_id, 'delete', null, 'pending')
  }
})()

console.log(`Successfully deleted ${deletedCount} ghost records.`)
process.exit(0)
