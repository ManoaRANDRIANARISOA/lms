-- Migration 010: Synchronize students.class from student_fees.class_name
-- Fixes existing students where class was stored in fees but not in students table.
-- Also repairs students with empty/null class who have fee records.

UPDATE students
SET class = (
  SELECT class_name 
  FROM student_fees sf 
  WHERE sf.student_id = students.id 
    AND (sf.class_name IS NOT NULL AND sf.class_name != '')
  ORDER BY sf.school_year DESC 
  LIMIT 1
)
WHERE (class IS NULL OR class = '' OR class = 'Classe non spécifiée')
  AND EXISTS (
    SELECT 1 FROM student_fees sf2
    WHERE sf2.student_id = students.id
      AND (sf2.class_name IS NOT NULL AND sf2.class_name != '')
  );

-- For students with no fee records, set a default class to satisfy NOT NULL constraint
UPDATE students
SET class = 'Non inscrit'
WHERE class IS NULL OR class = '' OR class = 'Classe non spécifiée';