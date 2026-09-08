-- Migration 041: Add print tracking columns to cash_journal and backfill related_payment_id
-- Ensures printing status ("Non imprimé" -> "Original émis" -> "Duplicata") updates immediately and reliably across both Suivi Élève and Finance Journal.

-- 1. Add print tracking columns to cash_journal if not existing
-- (SQLite ignores duplicate ADD COLUMN via db.ts runMigrations error handling)
ALTER TABLE cash_journal ADD COLUMN print_count INTEGER DEFAULT 0;
ALTER TABLE cash_journal ADD COLUMN last_printed_at DATETIME;
ALTER TABLE cash_journal ADD COLUMN last_printed_by TEXT;

-- 2. Backfill missing related_payment_id links from student_payments
UPDATE cash_journal
SET related_payment_id = (
    SELECT sp.id 
    FROM student_payments sp 
    WHERE sp.student_id = cash_journal.related_student_id 
      AND sp.payment_date = cash_journal.transaction_date 
      AND sp.amount = cash_journal.amount 
      AND sp.deleted = 0
    LIMIT 1
)
WHERE related_student_id IS NOT NULL AND related_payment_id IS NULL;

-- 3. Synchronize existing print_count, timestamps and receipt_number from student_payments
UPDATE cash_journal
SET print_count = (
    SELECT COALESCE(sp.print_count, 0)
    FROM student_payments sp
    WHERE sp.id = cash_journal.related_payment_id
),
last_printed_at = (
    SELECT sp.last_printed_at
    FROM student_payments sp
    WHERE sp.id = cash_journal.related_payment_id
),
last_printed_by = (
    SELECT sp.last_printed_by
    FROM student_payments sp
    WHERE sp.id = cash_journal.related_payment_id
),
receipt_number = COALESCE(
    cash_journal.receipt_number,
    (SELECT sp.receipt_number FROM student_payments sp WHERE sp.id = cash_journal.related_payment_id)
)
WHERE related_payment_id IS NOT NULL;
