-- ============================================================================
-- Migration 051: Heal and align sync outbox across all workstations
-- Resets stale orphan pending statuses and cleans phantom queue entries.
-- Preserves genuine offline user edits while preventing ancient re-pushes.
-- ============================================================================

-- 1. Align tables: Any record marked 'pending' without an active un-synced queue item
-- was touched by legacy defaults or migrations. Mark them 'synced' safely.

UPDATE student_payments 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'student_payments' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE cash_journal 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'cash_journal' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE students 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'students' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE student_fees 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'student_fees' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE personnel 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'personnel' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE users 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'users' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE grades 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'grades' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE parent_events 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'parent_events' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE event_payments 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'event_payments' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE bus_attendance 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'bus_attendance' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE canteen_attendance 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'canteen_attendance' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE cash_closures 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'cash_closures' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE time_tracking 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'time_tracking' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE daily_attendance 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'daily_attendance' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE personnel_absences 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'personnel_absences' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE salary_advances 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'salary_advances' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE custom_deductions 
SET sync_status = 'synced' 
WHERE sync_status = 'pending' 
  AND id NOT IN (SELECT record_id FROM sync_queue WHERE table_name = 'custom_deductions' AND status IN ('pending', 'error', 'failed', 'quarantined'));

UPDATE class_subjects SET sync_status = 'synced';
UPDATE subjects SET sync_status = 'synced';

-- 2. Clean up sync_queue: purge structural tables and old completed syncs older than 7 days
DELETE FROM sync_queue WHERE table_name IN ('class_subjects', 'subjects');
DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < datetime('now', '-7 days');

-- 3. Reset failed / skipped items to pending so they can auto-heal under LWW guard
UPDATE sync_queue 
SET status = 'pending', retry_count = 0, error_message = NULL 
WHERE status IN ('failed', 'error', 'skipped');
