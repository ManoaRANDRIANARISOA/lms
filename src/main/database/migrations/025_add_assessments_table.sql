-- 025_add_assessments_table.sql
-- Create table for dynamic assessments per class

CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    school_year TEXT NOT NULL,
    class_name TEXT, -- NULL means it applies to all classes
    name TEXT NOT NULL,
    term_value INTEGER NOT NULL,
    weight REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_year, class_name, term_value)
);

-- Initialize with default trimesters for all classes
INSERT OR IGNORE INTO assessments (id, school_year, class_name, name, term_value, weight) 
VALUES 
    (lower(hex(randomblob(16))), '2025-2026', NULL, 'Trimestre 1', 1, 1.0),
    (lower(hex(randomblob(16))), '2025-2026', NULL, 'Trimestre 2', 2, 1.0),
    (lower(hex(randomblob(16))), '2025-2026', NULL, 'Trimestre 3', 3, 1.0);
