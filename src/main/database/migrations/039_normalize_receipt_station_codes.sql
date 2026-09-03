-- Migration 039: Normalize all legacy receipt numbers in student_payments and cash_journal to include station code 'C1'

UPDATE student_payments
SET receipt_number = 'REC-' || SUBSTR(receipt_number, 5, 4) || '-C1-' || SUBSTR(receipt_number, 10),
    sync_status = 'pending'
WHERE receipt_number LIKE 'REC-%' AND receipt_number NOT LIKE 'REC-%-%-%';

UPDATE cash_journal
SET receipt_number = 'REC-' || SUBSTR(receipt_number, 5, 4) || '-C1-' || SUBSTR(receipt_number, 10),
    sync_status = 'pending'
WHERE receipt_number LIKE 'REC-%' AND receipt_number NOT LIKE 'REC-%-%-%';
