-- ============================================================================
-- v2.4.4 — Durcissement CLOUD : unicité de participation par élève et par événement
-- À exécuter dans le SQL Editor Supabase APRÈS convergence des postes en v2.4.4
-- (les tombstones des 772 doublons vides + 6 élèves partis doivent être arrivés).
-- Non destructif : CREATE UNIQUE INDEX IF NOT EXISTS, partiel sur deleted = false.
-- ============================================================================

-- 1. Vérification AVANT (doit renvoyer 0 ligne sinon l'index échouera) :
SELECT event_id, student_id, COUNT(*) AS n
FROM event_payments
WHERE deleted = false
GROUP BY event_id, student_id
HAVING COUNT(*) > 1;

-- 2. Index unique partiel (même règle que le local SQLite) :
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_payments_active
ON event_payments (event_id, student_id)
WHERE deleted = false;

-- 3. Vérification APRÈS : compte des participations actives de FETES DE NOEL
-- Attendu : 786 lignes (792 distincts - 6 élèves partis), 0 doublon.
SELECT e.name, COUNT(*) AS lignes, COUNT(DISTINCT ep.student_id) AS eleves_distincts
FROM event_payments ep
JOIN parent_events e ON e.id = ep.event_id
WHERE ep.deleted = false AND e.deleted = false
GROUP BY e.name;