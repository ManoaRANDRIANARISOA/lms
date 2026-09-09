-- Migration 042: Fix department for student transport payments in cash_journal
-- Ensures student transport payments have department = 'eleve' instead of 'bus',
-- aligning with all other student services (tuition, canteen, uniform) and making filters work.

UPDATE cash_journal 
SET department = 'eleve' 
WHERE category = 'transport' 
  AND related_student_id IS NOT NULL 
  AND department = 'bus';
