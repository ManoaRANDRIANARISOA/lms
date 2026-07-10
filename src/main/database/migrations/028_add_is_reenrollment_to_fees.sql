-- Ajouter la colonne is_reenrollment
ALTER TABLE student_fees ADD COLUMN is_reenrollment BOOLEAN DEFAULT 0;

-- Mettre à jour les anciens enregistrements pour considérer comme "réinscription" 
-- tous les frais liés à un élève ayant déjà été inscrit dans une année précédente.
UPDATE student_fees
SET is_reenrollment = 1
WHERE EXISTS (
    SELECT 1 FROM student_fees older
    WHERE older.student_id = student_fees.student_id
      AND REPLACE(older.school_year, '"', '') < REPLACE(student_fees.school_year, '"', '')
);

-- Mettre à jour les enregistrements pour considérer comme "réinscription"
-- tous les frais liés à un élève ayant un paiement de type 'reenrollment' pour la même année scolaire.
UPDATE student_fees
SET is_reenrollment = 1
WHERE EXISTS (
    SELECT 1 FROM student_payments p
    WHERE p.student_id = student_fees.student_id
      AND p.payment_type = 'reenrollment'
      AND p.school_year = student_fees.school_year
);
