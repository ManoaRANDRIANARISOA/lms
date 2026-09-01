-- Migration 033: Clean quotes from school_year across settings, student_payments, and student_fees
-- and re-align payments made for 2026-2027

-- 1. Remove surrounding double/single quotes in settings for school_year
UPDATE settings 
SET value = REPLACE(REPLACE(value, '"', ''), '''', '') 
WHERE key = 'school_year';

-- 2. Remove surrounding double/single quotes in student_payments
UPDATE student_payments 
SET school_year = REPLACE(REPLACE(school_year, '"', ''), '''', '') 
WHERE school_year IS NOT NULL;

-- 3. Remove surrounding double/single quotes in student_fees
UPDATE student_fees 
SET school_year = REPLACE(REPLACE(school_year, '"', ''), '''', '') 
WHERE school_year IS NOT NULL;

-- 4. Re-align 2026 summer/autumn registrations and payments to 2026-2027 school year
-- All payments made from June 2026 onwards for students enrolled in 2026-2027 belong to 2026-2027
UPDATE student_payments
SET school_year = '2026-2027'
WHERE (payment_date >= '2026-06-01' OR month >= '2026-09')
  AND (school_year = '2025-2026' OR school_year = '"2025-2026"' OR school_year IS NULL)
  AND student_id IN (
    SELECT student_id FROM student_fees WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  );
