-- ============================================================================
-- Migration 043: Merge duplicate accounts activity & update admin password
-- Reassigns student_payments, cash_journal, and audit_logs from duplicate
-- accounts to canonical accounts before deactivating duplicates.
-- Sets canonical admin password hash to 'lms00admin'.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reassign activity for 'aina-secetaire' -> 'aina-secretaire'
-- ----------------------------------------------------------------------------
UPDATE student_payments
SET created_by = 'aina-secretaire'
WHERE created_by IN ('aina-secetaire', 'e25b0a90-7825-4c3a-a37a-06aeed82f90d');

UPDATE student_payments
SET last_printed_by = 'aina-secretaire'
WHERE last_printed_by IN ('aina-secetaire', 'e25b0a90-7825-4c3a-a37a-06aeed82f90d');

UPDATE cash_journal
SET created_by = 'aina-secretaire'
WHERE created_by IN ('aina-secetaire', 'e25b0a90-7825-4c3a-a37a-06aeed82f90d');

UPDATE audit_logs
SET user_id = 'a856c35c-93f8-4d1f-95d3-92d0c3e4b7e3'
WHERE user_id = 'e25b0a90-7825-4c3a-a37a-06aeed82f90d';

-- ----------------------------------------------------------------------------
-- 2. Reassign activity for 'dinah' -> 'dinah-secretaire'
-- ----------------------------------------------------------------------------
UPDATE student_payments
SET created_by = 'dinah-secretaire'
WHERE created_by IN ('dinah', 'a0d568e2-1da6-4f1a-9c63-2ee821e63a6c');

UPDATE student_payments
SET last_printed_by = 'dinah-secretaire'
WHERE last_printed_by IN ('dinah', 'a0d568e2-1da6-4f1a-9c63-2ee821e63a6c');

UPDATE cash_journal
SET created_by = 'dinah-secretaire'
WHERE created_by IN ('dinah', 'a0d568e2-1da6-4f1a-9c63-2ee821e63a6c');

UPDATE audit_logs
SET user_id = '49c2ccaf-78c6-454c-9d29-552378c99d73'
WHERE user_id = 'a0d568e2-1da6-4f1a-9c63-2ee821e63a6c';

-- ----------------------------------------------------------------------------
-- 3. Reassign activity for 'Directrice' -> 'Anjara'
-- ----------------------------------------------------------------------------
UPDATE student_payments
SET created_by = 'Anjara'
WHERE created_by IN ('Directrice', 'ea89a1c6-390b-46f1-a864-a914bdbf7f0e');

UPDATE student_payments
SET last_printed_by = 'Anjara'
WHERE last_printed_by IN ('Directrice', 'ea89a1c6-390b-46f1-a864-a914bdbf7f0e');

UPDATE cash_journal
SET created_by = 'Anjara'
WHERE created_by IN ('Directrice', 'ea89a1c6-390b-46f1-a864-a914bdbf7f0e');

UPDATE audit_logs
SET user_id = '2f2ebf96-6c65-47cf-b9b2-9e3949fde7a1'
WHERE user_id = 'ea89a1c6-390b-46f1-a864-a914bdbf7f0e';

-- ----------------------------------------------------------------------------
-- 4. Clean up any obsolete sessions for duplicate accounts
-- ----------------------------------------------------------------------------
DELETE FROM sessions WHERE user_id IN (
  'e25b0a90-7825-4c3a-a37a-06aeed82f90d',
  'a0d568e2-1da6-4f1a-9c63-2ee821e63a6c',
  'ea89a1c6-390b-46f1-a864-a914bdbf7f0e',
  '7a745406-b574-40e1-8379-1bcbaf8f7179'
);

-- ----------------------------------------------------------------------------
-- 5. Soft-delete and deactivate duplicate accounts
-- ----------------------------------------------------------------------------
UPDATE users
SET active = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP, version = version + 1
WHERE id IN (
  'e25b0a90-7825-4c3a-a37a-06aeed82f90d', -- aina-secetaire
  'a0d568e2-1da6-4f1a-9c63-2ee821e63a6c', -- dinah
  'ea89a1c6-390b-46f1-a864-a914bdbf7f0e', -- Directrice
  '7a745406-b574-40e1-8379-1bcbaf8f7179'  -- Nyaina
);

-- Also catch by username in case manual inserts had differing UUIDs
UPDATE users
SET active = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP, version = version + 1
WHERE username IN ('aina-secetaire', 'Directrice') AND deleted = 0;

-- ----------------------------------------------------------------------------
-- 6. Update admin password to 'lms00admin'
-- Hash: $2b$10$UgtQjPAqevxPFj8vlzrQjOr6UuiQQRknY1F/hCGXOK.hTX9v2a.A6
-- ----------------------------------------------------------------------------
UPDATE users
SET password_hash = '$2b$10$UgtQjPAqevxPFj8vlzrQjOr6UuiQQRknY1F/hCGXOK.hTX9v2a.A6',
    active = 1,
    deleted = 0,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE username = 'admin';
