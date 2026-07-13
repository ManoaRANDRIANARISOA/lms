-- Ajouter la colonne payroll_start_date pour désolidariser le calcul des impayés de la date d'embauche
ALTER TABLE personnel ADD COLUMN payroll_start_date TEXT;

-- Mettre à jour les anciens enregistrements avec le mois en cours (ex: 2026-07-01)
-- Cela permet de solder tout le passif des années précédentes pour les employés existants
UPDATE personnel SET payroll_start_date = strftime('%Y-%m-01', 'now', 'localtime') WHERE payroll_start_date IS NULL;
