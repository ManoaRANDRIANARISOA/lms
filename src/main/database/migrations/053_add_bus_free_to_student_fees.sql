-- 053 : gratuité transport explicite (v2.4.6)
-- bus_monthly_fee = 0 signifiait « repli sur le tarif de zone » : impossible de distinguer
-- un bus gratuit accordé d'une donnée manquante. bus_free = 1 marque une gratuité volontaire
-- (ni facturation ni alerte) ; un abonnement sans axe/tarif reste un signal à corriger.
-- Non destructif : ajoute la colonne + backfill 0. « duplicate column name » ignoré par le runner.
-- Le DDL Cloud correspondant (tools/supabase_student_fees_bus_free.sql) doit être appliqué globalement.
ALTER TABLE student_fees ADD COLUMN bus_free BOOLEAN DEFAULT 0;
UPDATE student_fees SET bus_free = 0 WHERE bus_free IS NULL;