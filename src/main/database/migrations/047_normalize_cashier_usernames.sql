-- Migration 047: Normalize legacy created_by and last_printed_by usernames
-- =========================================================================

-- 1. Normalize 'Administrateur' to canonical username 'admin'
UPDATE student_payments SET created_by = 'admin' WHERE created_by = 'Administrateur';
UPDATE student_payments SET last_printed_by = 'admin' WHERE last_printed_by = 'Administrateur';
UPDATE cash_journal SET created_by = 'admin' WHERE created_by = 'Administrateur';
UPDATE cash_journal SET last_printed_by = 'admin' WHERE last_printed_by = 'Administrateur';

-- 2. Normalize 'Anjara Randrianarisoa' to canonical username 'Anjara'
UPDATE student_payments SET created_by = 'Anjara' WHERE created_by = 'Anjara Randrianarisoa';
UPDATE student_payments SET last_printed_by = 'Anjara' WHERE last_printed_by = 'Anjara Randrianarisoa';
UPDATE cash_journal SET created_by = 'Anjara' WHERE created_by = 'Anjara Randrianarisoa';
UPDATE cash_journal SET last_printed_by = 'Anjara' WHERE last_printed_by = 'Anjara Randrianarisoa';
