CREATE TABLE IF NOT EXISTS payroll_ignores (
  id TEXT PRIMARY KEY,
  personnel_id TEXT NOT NULL,
  month TEXT NOT NULL, -- Format 'YYYY-MM'
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

-- Index pour accélérer les requêtes de vérification par mois
CREATE INDEX IF NOT EXISTS idx_payroll_ignores_personnel_month ON payroll_ignores(personnel_id, month);
