const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
db.exec(`
CREATE TABLE IF NOT EXISTS payroll_ignores (
  id TEXT PRIMARY KEY,
  personnel_id TEXT NOT NULL,
  month TEXT NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payroll_ignores_personnel_month ON payroll_ignores(personnel_id, month);
`);
console.log('Migration OK');
