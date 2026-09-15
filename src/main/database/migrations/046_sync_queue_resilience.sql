-- Migration 046: Add updated_at to sync_queue and reset transient errors
-- =========================================================================

-- 1. Add updated_at column to sync_queue for tracking retry and quarantine timestamps
ALTER TABLE sync_queue ADD COLUMN updated_at DATETIME;

-- 2. Initialize updated_at with existing created_at values
UPDATE sync_queue SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Reset any stuck error records to pending so they can be re-attempted safely
UPDATE sync_queue SET status = 'pending', error_message = NULL WHERE status = 'error';
