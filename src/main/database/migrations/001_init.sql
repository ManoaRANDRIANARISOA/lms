-- ============================================
-- STUDENTS MODULE
-- ============================================

CREATE TABLE students (
    -- Metadata
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,
    
    -- Identification
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    photo_path TEXT,                    -- Local file path or cloud URL
    date_of_birth DATE,
    place_of_birth TEXT,
    class TEXT NOT NULL,                -- "3ème A", "CM2 B", etc.
    registration_number TEXT UNIQUE,     -- Auto-generated: YEAR-XXXXX
    enrollment_date DATE NOT NULL,
    departure_date DATE,
    previous_school TEXT,
    
    -- Family Information
    father_name TEXT,
    mother_name TEXT,
    guardian_name TEXT,
    guardian_contact TEXT,      -- Phone number (Optional)
    guardian_profession TEXT,
    address TEXT,
    
    -- Siblings (stored as JSON array of IDs)
    siblings TEXT DEFAULT '[]',          -- ["id1", "id2"]
    
    -- Search optimization
    search_text TEXT GENERATED ALWAYS AS (
        lower(first_name || ' ' || last_name || ' ' || registration_number)
    ) STORED
);

CREATE INDEX idx_students_class ON students(class);
CREATE INDEX idx_students_search ON students(search_text);
CREATE INDEX idx_students_sync ON students(sync_status);

-- ============================================

CREATE TABLE student_fees (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    school_year TEXT NOT NULL,           -- "2025-2026"
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,
    
    -- Enrollment Fees
    enrollment_fee REAL DEFAULT 0,
    reenrollment_fee REAL DEFAULT 0,
    notebook_fee REAL DEFAULT 0,
    fram_fee REAL DEFAULT 0,
    fram_paid_by_parent BOOLEAN DEFAULT 0,  -- For siblings
    
    -- Tuition
    tuition_level TEXT,                  -- preschool, primary, middle, high, staff
    monthly_tuition REAL DEFAULT 0,
    
    -- Bus
    bus_subscribed BOOLEAN DEFAULT 0,
    bus_route TEXT,
    bus_monthly_fee REAL DEFAULT 0,
    
    -- Canteen
    canteen_subscribed BOOLEAN DEFAULT 0,
    canteen_days_per_week INTEGER DEFAULT 0,
    canteen_daily_rate REAL DEFAULT 0,
    
    -- Uniforms
    uniform_tshirt_purchased BOOLEAN DEFAULT 0,
    uniform_apron_purchased BOOLEAN DEFAULT 0,
    uniform_shorts_purchased BOOLEAN DEFAULT 0,
    uniform_badge_purchased BOOLEAN DEFAULT 0,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, school_year)
);

-- ============================================

CREATE TABLE student_payments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,
    
    payment_date DATE NOT NULL,
    amount REAL NOT NULL,
    payment_type TEXT NOT NULL,          -- tuition, bus, canteen, enrollment, uniform, event
    month TEXT,                          -- For tuition (e.g., "2025-09")
    description TEXT,
    payment_method TEXT,                 -- cash, check, transfer, mobile_money
    receipt_number TEXT,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX idx_payments_student ON student_payments(student_id);
CREATE INDEX idx_payments_date ON student_payments(payment_date);

-- ============================================

CREATE TABLE bus_attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    attendance_date DATE NOT NULL,
    present BOOLEAN DEFAULT 1,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, attendance_date)
);

-- ============================================

CREATE TABLE canteen_attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    attendance_date DATE NOT NULL,
    present BOOLEAN DEFAULT 1,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, attendance_date)
);

-- ============================================

CREATE TABLE parent_events (
    id TEXT PRIMARY KEY,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,
    
    name TEXT NOT NULL,                  -- "École des parents", "Fête de Noël"
    event_date DATE,
    amount_per_parent REAL DEFAULT 0,
    description TEXT,
    status TEXT DEFAULT 'planned'        -- planned, ongoing, completed
);

-- ============================================

CREATE TABLE event_payments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    parent_id TEXT,                      -- If tracking by parent (for siblings)
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    amount_due REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    paid BOOLEAN DEFAULT 0,
    payment_date DATE,
    
    FOREIGN KEY (event_id) REFERENCES parent_events(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================
-- PERSONNEL MODULE
-- ============================================

CREATE TABLE personnel (
    id TEXT PRIMARY KEY,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,
    
    -- Identification
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    photo_path TEXT,
    date_of_birth DATE,
    contact TEXT,
    email TEXT,
    address TEXT,
    
    -- Professional
    status TEXT,                         -- fulltime, parttime
    position TEXT,                       -- teacher, admin, direction, maintenance
    hire_date DATE NOT NULL,
    departure_date DATE,
    
    -- Teacher Specifics
    teacher_level TEXT,                  -- preschool, primary, middle, high, multi
    teacher_subjects TEXT DEFAULT '[]',  -- JSON array of subjects
    
    -- Salary
    salary_type TEXT,                    -- monthly, hourly
    monthly_salary REAL,
    hourly_rate REAL,
    
    -- Deductions Config
    has_droit BOOLEAN DEFAULT 0,
    droit_amount REAL DEFAULT 0,
    cnaps_rate REAL DEFAULT 0.01,        -- 1% (verify Madagascar norms)
    irsa_rate REAL DEFAULT 0.01          -- 1% (verify Madagascar norms)
);

-- ============================================

CREATE TABLE time_tracking (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    month TEXT NOT NULL,                 -- "2025-09"
    hours_worked REAL NOT NULL,
    manually_edited BOOLEAN DEFAULT 0,
    edited_by TEXT,
    edit_reason TEXT,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE,
    UNIQUE(personnel_id, month)
);

-- ============================================

CREATE TABLE personnel_absences (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,                         -- leave, sick, unjustified, other
    justified BOOLEAN DEFAULT 1,
    document_path TEXT,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

-- ============================================

CREATE TABLE salary_advances (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    amount REAL NOT NULL,
    advance_date DATE NOT NULL,
    reason TEXT,
    repaid BOOLEAN DEFAULT 0,
    repayment_date DATE,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

-- ============================================

CREATE TABLE custom_deductions (
    id TEXT PRIMARY KEY,
    personnel_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    month TEXT NOT NULL,                 -- "2025-09"
    label TEXT NOT NULL,                 -- "School fees for child"
    amount REAL NOT NULL,
    
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

-- ============================================
-- FINANCIAL MODULE
-- ============================================

CREATE TABLE cash_journal (
    id TEXT PRIMARY KEY,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    last_synced_at DATETIME,
    deleted BOOLEAN DEFAULT 0,
    
    transaction_date DATE NOT NULL,
    type TEXT NOT NULL,                  -- income, expense
    category TEXT NOT NULL,              -- scolarite, entretien, salaire, banque, autre
    subcategory TEXT,
    amount REAL NOT NULL,
    description TEXT,
    payment_method TEXT,                 -- cash, check, transfer, mobile_money
    
    -- Links
    related_student_id TEXT,
    related_personnel_id TEXT,
    
    FOREIGN KEY (related_student_id) REFERENCES students(id) ON DELETE SET NULL,
    FOREIGN KEY (related_personnel_id) REFERENCES personnel(id) ON DELETE SET NULL
);

CREATE INDEX idx_cash_date ON cash_journal(transaction_date);
CREATE INDEX idx_cash_type ON cash_journal(type);

-- ============================================
-- GRADES MODULE
-- ============================================

CREATE TABLE subjects (
    id TEXT PRIMARY KEY,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    deleted BOOLEAN DEFAULT 0,
    
    name TEXT NOT NULL UNIQUE,           -- "Mathématiques", "Français"
    default_coefficient REAL DEFAULT 1
);

-- ============================================

CREATE TABLE grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    teacher_id TEXT,
    subject_id TEXT NOT NULL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    
    school_year TEXT NOT NULL,           -- "2025-2026"
    term INTEGER NOT NULL,               -- 1, 2, or 3
    grade REAL NOT NULL,                 -- 0-20
    coefficient REAL DEFAULT 1,
    teacher_comment TEXT,
    behavior_note TEXT,                  -- none, warning, praise
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES personnel(id) ON DELETE SET NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE(student_id, subject_id, school_year, term)
);

CREATE INDEX idx_grades_student ON grades(student_id);
CREATE INDEX idx_grades_term ON grades(school_year, term);

-- ============================================
-- AUTH & USERS
-- ============================================

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,         -- bcrypt hash
    role TEXT NOT NULL,                  -- admin, secretariat, accounting, direction
    full_name TEXT,
    email TEXT,
    active BOOLEAN DEFAULT 1,
    last_login DATETIME
);

-- ============================================
-- SYNC QUEUE
-- ============================================

CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,                -- create, update, delete
    data TEXT,                           -- JSON payload
    status TEXT DEFAULT 'pending',       -- pending, synced, error
    error_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_at DATETIME
);

CREATE INDEX idx_sync_status ON sync_queue(status);

-- ============================================
-- SETTINGS
-- ============================================

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,                          -- JSON value
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO settings (key, value) VALUES
('school_name', '"Lycée Manjary Soa"'),
('school_year', '"2025-2026"'),
('tuition_preschool', '50000'),
('tuition_primary', '60000'),
('tuition_middle', '75000'),
('tuition_high', '90000'),
('canteen_daily_rate', '2000'),
('email_auto_send', 'true'),
('email_send_time', '"18:00"'),
('sync_frequency_minutes', '5');

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    user_id TEXT,
    action TEXT NOT NULL,                -- login, create, update, delete, generate_pdf
    table_name TEXT,
    record_id TEXT,
    old_value TEXT,                      -- JSON
    new_value TEXT,                      -- JSON
    
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);