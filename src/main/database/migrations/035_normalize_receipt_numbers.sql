-- Migration 035: Normalize receipt numbers and add duplicate tracking columns

-- 1. Add duplicate tracking columns to student_payments if they do not exist
ALTER TABLE student_payments ADD COLUMN print_count INTEGER DEFAULT 0;
ALTER TABLE student_payments ADD COLUMN last_printed_at DATETIME;
ALTER TABLE student_payments ADD COLUMN last_printed_by TEXT;

-- 2. Backfill sequential receipt numbers for existing payments that lack a receipt_number
WITH numbered AS (
  SELECT 
    id,
    'REC-' || SUBSTR(COALESCE(payment_date, '2026'), 1, 4) || '-' || printf('%05d', ROW_NUMBER() OVER (ORDER BY payment_date ASC, created_at ASC)) AS new_receipt_no
  FROM student_payments
  WHERE receipt_number IS NULL OR receipt_number = ''
)
UPDATE student_payments
SET receipt_number = (SELECT new_receipt_no FROM numbered WHERE numbered.id = student_payments.id)
WHERE id IN (SELECT id FROM numbered);
