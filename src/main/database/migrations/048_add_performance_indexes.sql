-- Migration 048: Add targeted performance indexes for journal and payments
CREATE INDEX IF NOT EXISTS idx_cash_journal_deleted ON cash_journal(deleted);
CREATE INDEX IF NOT EXISTS idx_cash_journal_created_by ON cash_journal(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_journal_related_payment ON cash_journal(related_payment_id);
CREATE INDEX IF NOT EXISTS idx_cash_journal_receipt ON cash_journal(receipt_number);
CREATE INDEX IF NOT EXISTS idx_student_payments_deleted ON student_payments(deleted);
CREATE INDEX IF NOT EXISTS idx_student_payments_created_by ON student_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_student_payments_receipt ON student_payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_student_payments_composite ON student_payments(student_id, payment_date, deleted);
CREATE INDEX IF NOT EXISTS idx_students_deleted ON students(deleted);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry ON sync_queue(status, retry_count);
CREATE INDEX IF NOT EXISTS idx_cash_closures_date ON cash_closures(closure_date, cashier_username);
