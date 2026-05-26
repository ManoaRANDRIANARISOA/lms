-- ============================================
-- MIGRATION 004: Auth & RBAC Module
-- Adds sessions table, extends users for sync,
-- and seeds the default admin account.
-- ============================================

-- --------------------------------------------
-- 1. Sessions table for secure session management
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,                    -- UUID session token
    user_id TEXT NOT NULL,                  -- FK to users.id
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,           -- Session expiry time
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP, -- Updated on each IPC call

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fast lookup: find session by token, find sessions by user
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- --------------------------------------------
-- 2. Extend users table with sync metadata
--    (users table already exists from 001_init.sql)
--    We add columns needed for cloud sync + RBAC
-- --------------------------------------------

-- Add sync metadata columns to users table (for cloud sync compatibility)
ALTER TABLE users ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN sync_status TEXT DEFAULT 'pending';
ALTER TABLE users ADD COLUMN last_synced_at DATETIME;
ALTER TABLE users ADD COLUMN deleted BOOLEAN DEFAULT 0;

-- --------------------------------------------
-- 3. Seed default admin user
--    Password: "admin123" (bcrypt hash, cost factor 10)
--    The admin MUST change this on first login.
--    Hash generated with: bcryptjs.hashSync('admin123', 10)
-- --------------------------------------------
INSERT OR IGNORE INTO users (id, username, password_hash, role, full_name, email, active, last_login, version, sync_status, deleted)
VALUES (
    'default-admin-00000000-0000-0000-000000000001',
    'admin',
    '$2b$10$2VK2TkuYDUBo2imZ2.Mw2uFP2VDLYPYTA3ftqtK87FkUtzZuDBYxi',
    'admin',
    'Administrateur',
    'admin@manjary.mg',
    1,
    NULL,
    1,
    'pending',
    0
);

-- --------------------------------------------
-- 4. Audit logs enhancements
--    (audit_logs table already exists from 001_init.sql)
--    Add index for faster queries by table_name + timestamp
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- --------------------------------------------
-- 5. Settings for auth configuration
-- --------------------------------------------
INSERT OR IGNORE INTO settings (key, value) VALUES
('auth_session_timeout_minutes', '60'),
('auth_require_password_change', 'true'),
('auth_min_password_length', '8'),
('rbac_offer_level', '"securite"');
