-- Migration 038: Ensure all active students with a class have student_fees provisioned for 2026-2027 with class tuition prices

INSERT INTO student_fees (
  id, student_id, school_year, tuition_level, monthly_tuition, class_name,
  bus_subscribed, canteen_subscribed, fram_paid_by_parent, is_reenrollment,
  deleted, sync_status, created_at, updated_at, version
)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  s.id,
  '2026-2027',
  s.class,
  CASE
    WHEN CAST(s.is_personnel_child AS REAL) = 1.0 OR s.is_personnel_child = '1' OR s.is_personnel_child = 'true' THEN 0
    WHEN UPPER(s.class) IN ('TPS', 'TA', 'TD') OR UPPER(s.class) LIKE '%TERMINALE%' THEN 60000
    WHEN UPPER(s.class) IN ('CP1', 'CP2', 'CE1', 'CE2') THEN 45000
    ELSE 50000
  END,
  s.class,
  0,
  0,
  0,
  0,
  0,
  'pending',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  1
FROM students s
WHERE s.deleted = 0
  AND s.departure_date IS NULL
  AND s.class IS NOT NULL
  AND s.class != ''
  AND s.class != 'Classe non spécifiée'
  AND s.class != 'Non inscrit'
  AND NOT EXISTS (
    SELECT 1 FROM student_fees sf 
    WHERE sf.student_id = s.id 
      AND REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = '2026-2027'
      AND sf.deleted = 0
  );
