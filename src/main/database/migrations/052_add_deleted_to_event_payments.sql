-- 052 : soft-delete sur event_payments (v2.4.1)
-- Le DDL Cloud correspondant (tools/supabase_event_payments_deleted.sql) est appliqué globalement.
-- Non destructif : ajoute la colonne + backfill 0. L'erreur "duplicate column name" est ignorée
-- par le runner si la colonne existe déjà (schema healing au démarrage).
ALTER TABLE event_payments ADD COLUMN deleted BOOLEAN DEFAULT 0;
UPDATE event_payments SET deleted = 0 WHERE deleted IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_payments_deleted ON event_payments (deleted);