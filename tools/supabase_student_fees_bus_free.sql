-- DDL Cloud Supabase — gratuité transport explicite (v2.4.6)
-- À appliquer globalement via le SQL Editor Supabase (dernière grille de validation).
-- Miroir local : src/main/database/migrations/053_add_bus_free_to_student_fees.sql
-- Non destructif : ajoute la colonne si absente, backfill 0, aucune donnée écrasée.
ALTER TABLE public.student_fees ADD COLUMN IF NOT EXISTS bus_free boolean DEFAULT false;
UPDATE public.student_fees SET bus_free = false WHERE bus_free IS NULL;