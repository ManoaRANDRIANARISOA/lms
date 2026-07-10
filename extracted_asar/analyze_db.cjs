const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const schoolYear = '2025-2026'

// Get all fees for the current year
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

console.log(`Total fee records for ${schoolYear}: ${fees.length}`)

const zeroPayments = fees.filter((f) => f.payment_count === 0)
console.log(`Fee records with 0 payments for ${schoolYear}: ${zeroPayments.length}`)

const zeroPaymentsAndMultipleYears = zeroPayments.filter((f) => f.total_fee_records > 1)
console.log(
  `...of which have fee records in MULTIPLE years (i.e. 'Anciens' silently re-enrolled): ${zeroPaymentsAndMultipleYears.length}`
)

// Print a few examples
console.log('\nExamples of Anciens with 0 payments for current year:')
console.log(zeroPaymentsAndMultipleYears.slice(0, 5))
