import Database from 'better-sqlite3'

const db = new Database('database.sqlite')
const month = '2026-06'
console.log('Testing month:', month)

try {
  const allPersonnel = db
    .prepare('SELECT id, first_name, last_name FROM personnel WHERE deleted = 0')
    .all()
  for (const p of allPersonnel) {
    if (p.first_name === 'ra' && p.last_name === 'ra') {
      const expenses = db
        .prepare(
          `SELECT id, description, amount FROM cash_journal WHERE related_personnel_id = ? AND category = 'salaire' AND deleted = 0`
        )
        .all(p.id)
      console.log('Expenses:', expenses)

      const expenseMonth = db
        .prepare(
          `SELECT id FROM cash_journal WHERE related_personnel_id = ? AND category = 'salaire' AND description LIKE ? AND deleted = 0`
        )
        .get(p.id, `%${month}%`)
      console.log('Matches for month', month, ':', expenseMonth)
    }
  }
} catch (e) {
  console.error(e)
}
process.exit(0)
