-- 023_add_personnel_cnaps_amounts.sql
-- Ajout des montants fixes pour CNaPS et IRSA (permettant le choix entre pourcentage ou montant exact)

ALTER TABLE personnel ADD COLUMN cnaps_amount REAL;
ALTER TABLE personnel ADD COLUMN irsa_amount REAL;
