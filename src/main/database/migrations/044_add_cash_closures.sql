-- ============================================================================
-- Migration 044: Add cash closures table for Z de Caisse (Avenant N°3)
-- Allows cashiers and Direction to perform physical billetage, calculate
-- cash variances, print official 80mm Thermal Z Tickets, and seal the register.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_closures (
    id TEXT PRIMARY KEY,
    closure_date DATE NOT NULL,
    closure_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
    cashier_username TEXT NOT NULL,
    station_code TEXT NOT NULL DEFAULT 'C1',
    total_tickets INTEGER NOT NULL DEFAULT 0,
    expected_cash REAL NOT NULL DEFAULT 0,
    expected_check REAL NOT NULL DEFAULT 0,
    expected_mobile REAL NOT NULL DEFAULT 0,
    expected_transfer REAL NOT NULL DEFAULT 0,
    expected_total REAL NOT NULL DEFAULT 0,
    counted_cash REAL NOT NULL DEFAULT 0,
    counted_breakdown TEXT,
    cash_difference REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'closed',
    notes TEXT,
    is_locked INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_closures_date ON cash_closures(closure_date);
CREATE INDEX IF NOT EXISTS idx_cash_closures_cashier ON cash_closures(cashier_username);
CREATE INDEX IF NOT EXISTS idx_cash_closures_station ON cash_closures(station_code);
