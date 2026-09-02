-- Migration 036: Link payments to cash journal, add created_by & receipt_number to cash_journal
ALTER TABLE student_payments ADD COLUMN created_by TEXT DEFAULT 'Administrateur';
ALTER TABLE cash_journal ADD COLUMN related_payment_id TEXT;
ALTER TABLE cash_journal ADD COLUMN receipt_number TEXT;
ALTER TABLE cash_journal ADD COLUMN created_by TEXT DEFAULT 'Administrateur';

-- Backfill cash_journal receipt_number and related_payment_id from student_payments
UPDATE cash_journal
SET receipt_number = (
    SELECT sp.receipt_number 
    FROM student_payments sp 
    WHERE sp.student_id = cash_journal.related_student_id 
      AND sp.payment_date = cash_journal.transaction_date 
      AND sp.amount = cash_journal.amount 
      AND sp.deleted = 0
    LIMIT 1
),
related_payment_id = (
    SELECT sp.id 
    FROM student_payments sp 
    WHERE sp.student_id = cash_journal.related_student_id 
      AND sp.payment_date = cash_journal.transaction_date 
      AND sp.amount = cash_journal.amount 
      AND sp.deleted = 0
    LIMIT 1
)
WHERE related_student_id IS NOT NULL;
