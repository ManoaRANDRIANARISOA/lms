-- Migration 037: Realign all real student payments & fees to official launch year 2026-2027
-- Fix month keys (2025-09 -> 2026-09), sync subscriptions, and restore class tuition fees

-- 1. Realign settings school_year to clean 2026-2027 (strip surrounding quotes)
UPDATE settings 
SET value = REPLACE(REPLACE(value, '"', ''), '''', '') 
WHERE key = 'school_year';

-- 2. Realign payments of active students (deleted = 0) to 2026-2027
UPDATE student_payments
SET school_year = '2026-2027'
WHERE student_id IN (SELECT id FROM students WHERE deleted = 0)
  AND (school_year = '2025-2026' OR school_year = '"2025-2026"' OR school_year IS NULL OR school_year = '');

-- 3. Fix month column for 2026-2027 school year (replace 2025- with 2026- for autumn months)
UPDATE student_payments
SET month = '2026-' || SUBSTR(month, 6)
WHERE month LIKE '2025-%'
  AND (school_year = '2026-2027' OR payment_date >= '2026-06-01')
  AND student_id IN (SELECT id FROM students WHERE deleted = 0);

-- 4. Realign cash_journal descriptions for these updated payments
UPDATE cash_journal
SET description = REPLACE(description, '(2025-', '(2026-')
WHERE description LIKE '%(2025-%'
  AND transaction_date >= '2026-06-01'
  AND related_student_id IN (SELECT id FROM students WHERE deleted = 0);

-- 5. Reconcile subscriptions in student_fees (2026-2027) based on actual payments
UPDATE student_fees
SET canteen_subscribed = 1,
    canteen_days_per_week = COALESCE(NULLIF(canteen_days_per_week, 0), 5),
    canteen_days = COALESCE(NULLIF(canteen_days, ''), '["Monday","Tuesday","Wednesday","Thursday","Friday"]'),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND student_id IN (
    SELECT DISTINCT student_id FROM student_payments 
    WHERE payment_type = 'canteen' AND deleted = 0
  );

UPDATE student_fees
SET bus_subscribed = 1,
    bus_route = COALESCE(NULLIF(bus_route, ''), 'Zone 1'),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND student_id IN (
    SELECT DISTINCT student_id FROM student_payments 
    WHERE payment_type = 'bus' AND deleted = 0
  );

-- 6. Merge subscriptions and is_reenrollment from 2025-2026 fee records to 2026-2027 fee records
UPDATE student_fees
SET 
  bus_subscribed = MAX(student_fees.bus_subscribed, COALESCE((SELECT sf_old.bus_subscribed FROM student_fees sf_old WHERE sf_old.student_id = student_fees.student_id AND sf_old.school_year = '2025-2026' LIMIT 1), 0)),
  canteen_subscribed = MAX(student_fees.canteen_subscribed, COALESCE((SELECT sf_old.canteen_subscribed FROM student_fees sf_old WHERE sf_old.student_id = student_fees.student_id AND sf_old.school_year = '2025-2026' LIMIT 1), 0)),
  bus_route = COALESCE(NULLIF(student_fees.bus_route, ''), (SELECT sf_old.bus_route FROM student_fees sf_old WHERE sf_old.student_id = student_fees.student_id AND sf_old.school_year = '2025-2026' LIMIT 1)),
  is_reenrollment = MAX(student_fees.is_reenrollment, COALESCE((SELECT sf_old.is_reenrollment FROM student_fees sf_old WHERE sf_old.student_id = student_fees.student_id AND sf_old.school_year = '2025-2026' LIMIT 1), 0)),
  updated_at = CURRENT_TIMESTAMP,
  version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND student_id IN (SELECT student_id FROM student_fees WHERE school_year = '2025-2026');

-- 7. Restore monthly_tuition for 2026-2027 where it was zero or missing (and not personnel child)
UPDATE student_fees
SET monthly_tuition = CASE
    WHEN class_name IN ('TPS', 'TA', 'TD') THEN 60000
    WHEN class_name IN ('CP1', 'CP2', 'CE1', 'CE2') THEN 45000
    WHEN class_name IN ('PS', 'MS', 'GS', 'CM1', 'CM2', '6ème', '5ème', '4ème', '3ème', '2nde', '1ère') THEN 50000
    WHEN tuition_level IN ('TPS', 'TA', 'TD') THEN 60000
    WHEN tuition_level IN ('CP1', 'CP2', 'CE1', 'CE2') THEN 45000
    ELSE 50000
  END,
  updated_at = CURRENT_TIMESTAMP,
  version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND (monthly_tuition IS NULL OR monthly_tuition = 0)
  AND student_id IN (
    SELECT id FROM students 
    WHERE (is_personnel_child IS NULL OR is_personnel_child = '0.0' OR is_personnel_child = '0' OR CAST(is_personnel_child AS REAL) = 0)
      AND class IS NOT NULL 
      AND class != '' 
      AND class != 'Non inscrit' 
      AND class != 'Classe non spécifiée'
      AND deleted = 0
  );
