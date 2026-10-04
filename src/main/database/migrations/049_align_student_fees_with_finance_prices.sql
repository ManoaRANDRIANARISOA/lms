-- 049_align_student_fees_with_finance_prices.sql
-- Aligner les tarifs statiques de student_fees sur la configuration centralisee finance_prices
-- Preserve strictement l'integrite financiere et l'exoneration des enfants du personnel

-- 1. CM1 : 45 000 Ar (corrige l'ecart de 50 000 Ar introduit par les anciens scripts)
UPDATE student_fees
SET monthly_tuition = 45000,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND (class_name = 'CM1' OR tuition_level = 'CM1')
  AND monthly_tuition = 50000
  AND student_id NOT IN (
    SELECT id FROM students 
    WHERE is_personnel_child = 1 OR is_personnel_child = '1' OR is_personnel_child = '1.0' OR is_personnel_child = 'true'
  );

-- 2. 3eme : 55 000 Ar
UPDATE student_fees
SET monthly_tuition = 55000,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND (class_name = '3ème' OR tuition_level = '3ème' OR class_name = '3eme' OR tuition_level = '3eme')
  AND monthly_tuition = 50000
  AND student_id NOT IN (
    SELECT id FROM students 
    WHERE is_personnel_child = 1 OR is_personnel_child = '1' OR is_personnel_child = '1.0' OR is_personnel_child = 'true'
  );

-- 3. 2nde : 55 000 Ar
UPDATE student_fees
SET monthly_tuition = 55000,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND (class_name = '2nde' OR tuition_level = '2nde' OR class_name = 'Seconde' OR tuition_level = 'Seconde')
  AND (monthly_tuition = 50000 OR monthly_tuition = 55001)
  AND student_id NOT IN (
    SELECT id FROM students 
    WHERE is_personnel_child = 1 OR is_personnel_child = '1' OR is_personnel_child = '1.0' OR is_personnel_child = 'true'
  );

-- 4. 1ere : 55 000 Ar
UPDATE student_fees
SET monthly_tuition = 55000,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND (class_name = '1ère' OR tuition_level = '1ère' OR class_name = 'Première' OR tuition_level = 'Première')
  AND monthly_tuition = 50000
  AND student_id NOT IN (
    SELECT id FROM students 
    WHERE is_personnel_child = 1 OR is_personnel_child = '1' OR is_personnel_child = '1.0' OR is_personnel_child = 'true'
  );

-- 5. 6eme coquille 50001 -> 50000 Ar
UPDATE student_fees
SET monthly_tuition = 50000,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027'
  AND (class_name = '6ème' OR tuition_level = '6ème' OR class_name = '6eme' OR tuition_level = '6eme')
  AND monthly_tuition = 50001
  AND student_id NOT IN (
    SELECT id FROM students 
    WHERE is_personnel_child = 1 OR is_personnel_child = '1' OR is_personnel_child = '1.0' OR is_personnel_child = 'true'
  );
