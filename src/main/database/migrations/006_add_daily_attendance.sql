-- ============================================
-- MIGRATION 006: Daily Attendance + Work Schedule Fields
-- ============================================
-- Adds daily attendance tracking and work schedule configuration
-- to support hybrid salary calculation for monthly employees.

-- Add work schedule columns to personnel (additive only)
ALTER TABLE personnel ADD COLUMN expected_monthly_hours REAL;
ALTER TABLE personnel ADD COLUMN work_pattern TEXT DEFAULT 'daily';
ALTER TABLE personnel ADD COLUMN work_days TEXT DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]';
ALTER TABLE personnel ADD COLUMN daily_hours REAL DEFAULT 8;

-- Daily Attendance (pointage journalier pour tous les employés)
CREATE TABLE IF NOT EXISTS daily_attendance (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',

    personnel_id TEXT NOT NULL,
    attendance_date DATE NOT NULL,      -- "2025-09-15"
    status TEXT NOT NULL,               -- present, absent, late, half_day, excused
    hours_worked REAL DEFAULT 0,        -- heures réellement faites ce jour
    expected_hours REAL DEFAULT 0,      -- heures prévues ce jour (copié de daily_hours ou autre)
    notes TEXT,                         -- observations libres
    session_info TEXT,                  -- JSON optionnel : [{subject:"Maths",hours:2}]

    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE,
    UNIQUE(personnel_id, attendance_date)
);
