-- Migration 023: Add school_year to student_payments
-- Adds school_year tracking to multi-year payments

ALTER TABLE student_payments ADD COLUMN school_year TEXT;

-- Backfill existing payments using the active school year from settings
UPDATE student_payments 
SET school_year = (SELECT value FROM settings WHERE key = 'school_year' LIMIT 1) 
WHERE school_year IS NULL;
