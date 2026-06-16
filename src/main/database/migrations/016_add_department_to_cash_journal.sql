-- Migration 016: Add department column to cash_journal
-- Departments: 'bus' (transport) and 'ecole' (school)
-- This allows filtering journal entries by department for clearer financial reporting.

ALTER TABLE cash_journal ADD COLUMN department TEXT NOT NULL DEFAULT 'ecole';
