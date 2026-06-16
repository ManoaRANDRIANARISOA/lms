-- Migration 019: Clean up sync_queue errors
-- Fixes orphaned records and invalid data that prevent sync

-- Step 1: Fix student_fees with null student_id (orphaned records)
UPDATE student_fees SET deleted = 1, sync_status = 'local_only'
WHERE student_id IS NULL OR student_id = '';

-- Step 2: Fix personnel with empty date strings
UPDATE personnel SET date_of_birth = NULL WHERE date_of_birth = '';
UPDATE personnel SET hire_date = NULL WHERE hire_date = '';
UPDATE personnel SET departure_date = NULL WHERE departure_date = '';

-- Step 3: Fix personnel sync status
UPDATE personnel SET sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT record_id FROM sync_queue WHERE status = 'error' AND table_name = 'personnel'
);

-- Step 4: Fix student_fees sync status
UPDATE student_fees SET sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT record_id FROM sync_queue WHERE status = 'error' AND table_name = 'student_fees'
);

-- Step 5: Mark orphaned time_tracking as local_only (personnel doesn't exist on remote)
UPDATE time_tracking SET sync_status = 'local_only'
WHERE personnel_id NOT IN (SELECT id FROM personnel WHERE deleted = 0);

-- Step 6: Clean all resolved sync_queue errors
DELETE FROM sync_queue WHERE status = 'error';
