-- ============================================================================
-- v2.4.1 — PRÉREQUIS CLOUD (additif, idempotent, réversible)
-- À exécuter dans Supabase SQL Editor AVANT le déploiement de v2.4.1.
--
-- Ajoute la colonne de référence du reçu d'origine, utilisée par l'assistant
-- lorsqu'une collision de numéro de reçu entre paiements DISTINCTS est
-- renumérotée après validation humaine. Le reçu d'origine (document légal
-- déjà remis au parent) est ainsi préservé et propagé à tous les postes.
--
-- Aucune donnée existante n'est modifiée. Aucune suppression. DROP possible
-- en rollback (voir fin de fichier).
-- ============================================================================

ALTER TABLE public.student_payments
  ADD COLUMN IF NOT EXISTS original_receipt_number text;

ALTER TABLE public.cash_journal
  ADD COLUMN IF NOT EXISTS original_receipt_number text;

-- Vérification (lecture seule) : les deux colonnes doivent apparaître.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('student_payments', 'cash_journal')
  AND column_name = 'original_receipt_number'
ORDER BY table_name;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uniquement si nécessaire, après avoir vidé toute référence) :
--   ALTER TABLE public.student_payments DROP COLUMN IF EXISTS original_receipt_number;
--   ALTER TABLE public.cash_journal     DROP COLUMN IF EXISTS original_receipt_number;
-- ----------------------------------------------------------------------------