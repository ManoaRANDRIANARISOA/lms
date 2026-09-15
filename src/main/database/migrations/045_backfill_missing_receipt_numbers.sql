-- Migration 045: Backfill missing receipt numbers in student_payments and cash_journal
-- The missing receipts (from July 2026) map to sequential range REC-2026-C1-00001 to REC-2026-C1-00512.

-- 1. Number orphan student_payments chronologically
WITH numbered_sp AS (
  SELECT 
    id,
    'REC-2026-C1-' || printf('%05d', ROW_NUMBER() OVER (ORDER BY payment_date ASC, created_at ASC)) AS new_receipt_no
  FROM student_payments
  WHERE receipt_number IS NULL OR receipt_number = ''
)
UPDATE student_payments
SET receipt_number = (SELECT new_receipt_no FROM numbered_sp WHERE numbered_sp.id = student_payments.id),
    sync_status = 'pending',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM numbered_sp);

-- 2. Link cash_journal to student_payments by exact match if unlinked
UPDATE cash_journal
SET related_payment_id = (
  SELECT sp.id FROM student_payments sp
  WHERE sp.student_id = cash_journal.related_student_id
    AND sp.payment_date = cash_journal.transaction_date
    AND sp.amount = cash_journal.amount
  LIMIT 1
)
WHERE related_payment_id IS NULL AND related_student_id IS NOT NULL;

-- 3. Synchronize receipt_number into cash_journal from linked student_payments
UPDATE cash_journal
SET receipt_number = (
  SELECT sp.receipt_number FROM student_payments sp
  WHERE sp.id = cash_journal.related_payment_id
),
sync_status = 'pending',
updated_at = CURRENT_TIMESTAMP
WHERE (receipt_number IS NULL OR receipt_number = '')
  AND related_payment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM student_payments sp 
    WHERE sp.id = cash_journal.related_payment_id 
      AND sp.receipt_number IS NOT NULL 
      AND sp.receipt_number != ''
  );

-- 4. Number any remaining orphan cash_journal entries that have no related_payment_id
WITH cj_offset AS (
  SELECT COALESCE(MAX(CAST(SUBSTR(receipt_number, 13) AS INTEGER)), 512) as base_num
  FROM student_payments
  WHERE receipt_number LIKE 'REC-2026-C1-%' AND CAST(SUBSTR(receipt_number, 13) AS INTEGER) <= 540
),
numbered_cj AS (
  SELECT 
    id,
    'REC-2026-C1-' || printf('%05d', (SELECT base_num FROM cj_offset) + ROW_NUMBER() OVER (ORDER BY transaction_date ASC, id ASC)) AS new_receipt_no
  FROM cash_journal
  WHERE (receipt_number IS NULL OR receipt_number = '')
)
UPDATE cash_journal
SET receipt_number = (SELECT new_receipt_no FROM numbered_cj WHERE numbered_cj.id = cash_journal.id),
    sync_status = 'pending',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM numbered_cj);
