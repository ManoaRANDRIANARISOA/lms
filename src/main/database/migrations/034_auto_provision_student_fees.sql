-- Migration 034: Auto-provision student_fees for active students with a class who lack fee records for 2026-2027

INSERT INTO student_fees (
  id, student_id, school_year, tuition_level, monthly_tuition, class_name,
  bus_subscribed, canteen_subscribed, fram_paid_by_parent, is_reenrollment,
  deleted, sync_status
)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  s.id,
  '2026-2027',
  s.class,
  0,
  s.class,
  0,
  0,
  0,
  0,
  0,
  'pending'
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
