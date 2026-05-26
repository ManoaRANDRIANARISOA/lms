-- ============================================
-- MIGRATION 005: Personnel Module Tables
-- ============================================
-- Creates all personnel-related tables if they don't exist.
-- Safe to run multiple times (IF NOT EXISTS).

-- Personnel (teachers, admin, staff)
CREATE TABLE IF NOT EXISTS personnel (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    photo_path TEXT,
    date_of_birth DATE,
    contact TEXT,
    email TEXT,
    address TEXT,

    status TEXT,                         -- fulltime, parttime
    position TEXT,                       -- teacher, admin, direction, maintenance, other
    hire_date DATE NOT NULL,
    departure_date DATE,

    teacher_level TEXT,                  -- preschool, primary, middle, high, multi
    teacher_subjects TEXT DEFAULT '[]',  -- JSON array

    salary_type TEXT,                    -- monthly, hourly
    monthly_salary REAL,
    hourly_rate REAL,

    has_droit BOOLEAN DEFAULT 0,
    droit_amount REAL DEFAULT 0,
    cnaps_rate REAL DEFAULT 0.01,      -- 1% (Madagascar norms — verify)
    irsa_rate REAL DEFAULT 0.01          -- 1% (Madagascar norms — verify)
);

-- Time Tracking (for hourly employees)
CREATE TABLE IF NOT EXISTS time_tracking (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',

    personnel_id TEXT NOT NULL,
    month TEXT NOT NULL,                -- "2025-09"
    hours_worked REAL NOT NULL,
    manually_edited BOOLEAN DEFAULT 0,
    edited_by TEXT,
    edit_reason TEXT,

    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE,
    UNIQUE(personnel_id, month)
);

-- Personnel Absences
CREATE TABLE IF NOT EXISTS personnel_absences (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',

    personnel_id TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,                         -- leave, sick, unjustified, other
    justified BOOLEAN DEFAULT 1,
    document_path TEXT,

    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

-- Salary Advances (avances sur salaire)
CREATE TABLE IF NOT EXISTS salary_advances (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',

    personnel_id TEXT NOT NULL,
    amount REAL NOT NULL,
    advance_date DATE NOT NULL,
    reason TEXT,
    repaid BOOLEAN DEFAULT 0,
    repayment_date DATE,

    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

-- Custom Deductions (déductions personnalisées)
CREATE TABLE IF NOT EXISTS custom_deductions (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',

    personnel_id TEXT NOT NULL,
    month TEXT NOT NULL,                -- "2025-09"
    label TEXT NOT NULL,
    amount REAL NOT NULL,

    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);
