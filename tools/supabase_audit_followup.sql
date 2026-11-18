-- ============================================================================
-- DIAGNOSTIC CIBLÉ SUPABASE — LMS (LECTURE SEULE)
-- ----------------------------------------------------------------------------
-- À lancer UNE REQUÊTE À LA FOIS (sélectionner le bloc puis Run), car le SQL
-- Editor n'affiche que le dernier résultat. Chaque bloc = une grille.
-- Aucun risque : SELECT uniquement.
-- ============================================================================

-- ===== Q3 : CLASSIFICATION des 219 reçus partagés (le plus décisif) =========
-- Dit si ce sont des paniers légitimes (multi-mois/types), des collisions
-- (plusieurs élèves), ou des doublons suspects (même élève/mois/montant).
WITH dup AS (
  SELECT receipt_number
  FROM public.student_payments
  WHERE deleted=false AND receipt_number IS NOT NULL AND receipt_number<>''
  GROUP BY receipt_number HAVING count(*)>1
),
agg AS (
  SELECT p.receipt_number,
         count(*) AS lignes,
         count(DISTINCT p.student_id) AS eleves,
         count(DISTINCT p.month) AS mois,
         count(DISTINCT p.payment_type) AS types,
         count(DISTINCT p.amount) AS montants
  FROM public.student_payments p JOIN dup d ON d.receipt_number=p.receipt_number
  WHERE p.deleted=false
  GROUP BY p.receipt_number
)
SELECT CASE
         WHEN eleves>1 THEN '1_collision_plusieurs_eleves'
         WHEN mois>1 OR types>1 THEN '2_panier_multi_mois_ou_types'
         WHEN montants=1 THEN '3_doublon_suspect_meme_montant'
         ELSE '4_autre_a_examiner'
       END AS categorie,
       count(*) AS nb_recus,
       sum(lignes) AS nb_lignes_concernees
FROM agg
GROUP BY 1
ORDER BY 1;


-- ===== Q4 : ÉCHANTILLON détaillé des reçus partagés (50 premiers) ==========
WITH dup AS (
  SELECT receipt_number
  FROM public.student_payments
  WHERE deleted=false AND receipt_number IS NOT NULL AND receipt_number<>''
  GROUP BY receipt_number HAVING count(*)>1
)
SELECT p.receipt_number,
       count(*) AS lignes,
       count(DISTINCT p.student_id) AS eleves,
       count(DISTINCT p.month) AS mois,
       count(DISTINCT p.payment_type) AS types,
       count(DISTINCT p.amount) AS montants,
       min(p.payment_date) AS date_min,
       max(p.payment_date) AS date_max,
       sum(p.amount) AS somme_ar
FROM public.student_payments p JOIN dup d ON d.receipt_number=p.receipt_number
WHERE p.deleted=false
GROUP BY p.receipt_number
ORDER BY lignes DESC, eleves DESC
LIMIT 50;


-- ===== Q5 : Les 3 clés local-only présentes au cloud (bénin, pull les ignore)
SELECT key, left(value, 60) AS apercu_valeur, updated_at
FROM public.settings
WHERE key IN ('pos_station_code','printer_name','printer_copies','email_logs','email_last_sent_date')
ORDER BY key;


-- ===== Q6 : La ligne cash_journal orpheline (F5=1) ==========================
SELECT c.id, c.transaction_date, c.receipt_number, c.related_payment_id,
       c.amount, c.department, c.created_by, left(c.description,80) AS description
FROM public.cash_journal c
WHERE c.deleted=false AND c.related_payment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.student_payments p WHERE p.id=c.related_payment_id);


-- ===== Q7 : QUI a créé les lignes en collision (cause des 219 reçus partagés)
-- Si des created_by différents (ou des dates juillet vs septembre) partagent le
-- même numéro C1 => plusieurs postes/compteurs C1 en parallèle ou réinitialisés.
WITH dup AS (
  SELECT receipt_number FROM public.student_payments
  WHERE deleted=false AND receipt_number IS NOT NULL AND receipt_number<>''
  GROUP BY receipt_number HAVING count(*)>1
)
SELECT p.receipt_number, p.payment_date, p.created_by, p.amount, p.payment_type, p.month,
       s.registration_number, s.last_name, s.first_name
FROM public.student_payments p
JOIN dup d ON d.receipt_number=p.receipt_number
LEFT JOIN public.students s ON s.id=p.student_id
WHERE p.deleted=false
ORDER BY p.receipt_number, p.payment_date
LIMIT 80;


-- ===== Q8 : VRAIS DOUBLONS de saisie (même élève+type+mois+montant+date) =====
-- Classe B : double enregistrement du MÊME paiement => à dédupliquer (garder l'ancien).
-- N'apparaît PAS dans les 219 collisions (qui sont des élèves différents).
-- 8a : combien de groupes de doublons suspects.
SELECT count(*) AS nb_groupes_doublons FROM (
  SELECT student_id, payment_type, month, amount, payment_date
  FROM public.student_payments
  WHERE deleted=false
  GROUP BY student_id, payment_type, month, amount, payment_date
  HAVING count(*)>1
) d;

-- 8b : détail des groupes (ids + reçus + créateurs) pour décision au cas par cas.
SELECT student_id, payment_type, month, amount, payment_date, count(*) AS n,
       array_agg(id ORDER BY created_at) AS ids,
       array_agg(receipt_number ORDER BY created_at) AS recus,
       array_agg(created_by ORDER BY created_at) AS createurs
FROM public.student_payments
WHERE deleted=false
GROUP BY student_id, payment_type, month, amount, payment_date
HAVING count(*)>1
ORDER BY n DESC, payment_date
LIMIT 100;