-- v2.4.1 — Migration tracée : colonne `deleted` sur event_payments (Cloud Supabase)
-- À exécuter dans Supabase SQL Editor (la clé anon ne peut pas faire de DDL).
-- Non destructif : ajoute la colonne + backfill à false, ne supprime aucune ligne.
-- APRÈS ce DDL, exécuter le script local gardé : scratch/migrate_event_payments_deleted.cjs
-- puis basculer filterDeleted=true (event_payments) dans sync.service.ts (porte de parité)
-- et .eq('deleted', false) sur le compteur Cloud event_payments dans telemetry.service.ts.

ALTER TABLE public.event_payments
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

UPDATE public.event_payments SET deleted = false WHERE deleted IS NULL;

-- Index optionnel pour les filtres deleted=false (parité / heartbeats)
CREATE INDEX IF NOT EXISTS idx_event_payments_deleted ON public.event_payments (deleted);