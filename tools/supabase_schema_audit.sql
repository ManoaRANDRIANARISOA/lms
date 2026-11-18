-- ============================================================================
-- AUDIT COMPLET SUPABASE — LMS v2.4.0 (LECTURE SEULE)
-- ----------------------------------------------------------------------------
-- À coller dans : Supabase Dashboard > SQL Editor > New query > Run.
-- 100% lecture seule : uniquement des SELECT sur les catalogues (information_schema,
-- pg_catalog) et des blocs DO qui ne font que SELECT + RAISE NOTICE.
-- AUCUNE écriture, AUCUN DDL, AUCUNE suppression. Sans risque pour la production.
--
-- Les résultats en grille apparaissent dans l'onglet "Results".
-- Les blocs DO (comptages exacts + intégrité des données) affichent leurs lignes
-- dans l'onglet "Messages" / "Output" (RAISE NOTICE).
--
-- But : vérifier que le schéma cloud concorde avec ce que le code local pousse/pull,
-- qu'il n'y a ni blocage RLS, ni colonne manquante, ni doublon/orphelin, et que les
-- index de performance sont présents.
-- ============================================================================


-- ============================================================================
-- A. INVENTAIRE & VOLUMÉTRIE
-- ============================================================================

-- A1. Tables attendues par la synchro vs tables réellement présentes.
--     Toute ligne "MANQUANTE" = table que le code attend mais absente du cloud.
WITH expected(table_name) AS (
  VALUES ('users'),('students'),('student_fees'),('student_payments'),('personnel'),
         ('time_tracking'),('daily_attendance'),('personnel_absences'),('salary_advances'),
         ('custom_deductions'),('cash_journal'),('subjects'),('grades'),('class_subjects'),
         ('parent_events'),('event_payments'),('bus_attendance'),('canteen_attendance'),
         ('assessments'),('settings'),('cash_closures')
)
SELECT e.table_name,
       CASE WHEN t.table_name IS NULL THEN 'MANQUANTE' ELSE 'OK' END AS etat
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema='public' AND t.table_name=e.table_name
ORDER BY etat DESC, e.table_name;

-- A2. Tables supplémentaires éventuelles (hors liste attendue) + volumétrie estimée.
SELECT relname AS table_name,
       n_live_tup AS lignes_estimees,
       pg_size_pretty(pg_total_relation_size(relid)) AS taille_totale,
       seq_scan, idx_scan,
       n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- A3. Comptages EXACTS par table attendue (robuste si une table manque).
--     Résultat dans l'onglet Messages.
DO $$
DECLARE
  t text; cnt bigint;
  expected text[] := ARRAY['users','students','student_fees','student_payments','personnel',
    'time_tracking','daily_attendance','personnel_absences','salary_advances','custom_deductions',
    'cash_journal','subjects','grades','class_subjects','parent_events','event_payments',
    'bus_attendance','canteen_attendance','assessments','settings','cash_closures'];
BEGIN
  FOREACH t IN ARRAY expected LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      RAISE NOTICE '[A3] TABLE MANQUANTE : %', t;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO cnt;
      RAISE NOTICE '[A3] % : % lignes', rpad(t,22), cnt;
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- B. ARCHITECTURE DES COLONNES (concordance avec le code)
-- ============================================================================

-- B1. Dump exhaustif de toutes les colonnes (la vérité du schéma cloud).
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
ORDER BY table_name, ordinal_position;

-- B2. Colonnes CRITIQUES attendues d'après le code de synchro/push.
--     "ABSENTE" = le code pousse/lit cette colonne mais elle n'existe pas côté cloud
--     => risque d'erreur PostgREST / blocage de push.
WITH expected_cols(table_name, column_name) AS (
  VALUES
    -- tronc commun indispensable au pull (curseur updated_at + tombstones deleted)
    ('students','id'),('students','deleted'),('students','updated_at'),
    ('student_payments','id'),('student_payments','deleted'),('student_payments','updated_at'),
    ('student_fees','id'),('student_fees','deleted'),('student_fees','updated_at'),
    ('cash_journal','id'),('cash_journal','deleted'),('cash_journal','updated_at'),
    ('cash_closures','id'),('cash_closures','updated_at'),
    ('users','id'),('users','deleted'),('users','updated_at'),
    ('settings','key'),('settings','value'),('settings','updated_at'),
    -- élèves
    ('students','registration_number'),('students','class'),('students','gender'),
    ('students','is_personnel_child'),('students','parent_personnel_id'),
    -- paiements (suivi impression multi-postes + année scolaire + reçu)
    ('student_payments','student_id'),('student_payments','payment_date'),('student_payments','amount'),
    ('student_payments','school_year'),('student_payments','receipt_number'),
    ('student_payments','print_count'),('student_payments','last_printed_at'),
    ('student_payments','last_printed_by'),('student_payments','created_by'),
    -- journal de caisse
    ('cash_journal','related_payment_id'),('cash_journal','related_student_id'),
    ('cash_journal','receipt_number'),('cash_journal','created_by'),('cash_journal','department'),
    ('cash_journal','print_count'),('cash_journal','last_printed_at'),('cash_journal','last_printed_by'),
    ('cash_journal','transaction_date'),('cash_journal','amount'),
    -- fiches de frais
    ('student_fees','student_id'),('student_fees','class_name'),('student_fees','tuition_level'),
    ('student_fees','monthly_tuition'),('student_fees','bus_route'),('student_fees','bus_monthly_fee'),
    ('student_fees','school_year'),
    -- clôtures de caisse (Ticket Z)
    ('cash_closures','closure_date'),('cash_closures','cashier_username'),('cash_closures','station_code'),
    ('cash_closures','is_locked'),('cash_closures','expected_total'),('cash_closures','counted_cash'),
    ('cash_closures','cash_difference'),('cash_closures','status'),('cash_closures','version')
)
SELECT e.table_name, e.column_name,
       CASE WHEN c.column_name IS NULL THEN 'ABSENTE' ELSE 'OK' END AS etat,
       c.data_type
FROM expected_cols e
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
ORDER BY etat DESC, e.table_name, e.column_name;

-- B3. Colonnes LOCAL-ONLY qui ne doivent NORMALEMENT PAS exister côté cloud
--     (le sanitiseur les supprime avant push : sync.service.ts ~1923).
--     "PRESENTE" = inattendu (inoffensif mais à examiner).
WITH local_only(table_name, column_name) AS (
  VALUES ('students','sync_status'),('students','last_synced_at'),('students','search_text'),
         ('student_payments','sync_status'),('student_payments','last_synced_at'),
         ('student_fees','sync_status'),('student_fees','last_synced_at'),('student_fees','is_reenrollment'),
         ('cash_journal','sync_status'),('cash_journal','last_synced_at'),
         ('cash_closures','sync_status'),('cash_closures','last_synced_at'),
         ('personnel','payroll_start_date'),('parent_events','school_year')
)
SELECT l.table_name, l.column_name,
       CASE WHEN c.column_name IS NULL THEN 'absent (normal)' ELSE 'PRESENTE (à vérifier)' END AS etat
FROM local_only l
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=l.table_name AND c.column_name=l.column_name
ORDER BY etat DESC, l.table_name;

-- B4. Type des colonnes clés de sync (deleted doit être booléen, updated_at temporel).
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND column_name IN ('deleted','updated_at','created_at','is_locked','school_year')
ORDER BY table_name, column_name;


-- ============================================================================
-- C. INDEX & PERFORMANCE (optimisations)
-- ============================================================================

-- C1. Tous les index par table.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
ORDER BY tablename, indexname;

-- C2. Tables de sync SANS index sur updated_at (le pull filtre .gt('updated_at', ...)).
--     Absence = scan séquentiel à chaque pull => lenteur/blocage sur grosses tables.
WITH sync_tables(table_name) AS (
  VALUES ('users'),('students'),('student_fees'),('student_payments'),('personnel'),
         ('time_tracking'),('daily_attendance'),('personnel_absences'),('salary_advances'),
         ('custom_deductions'),('cash_journal'),('subjects'),('grades'),('class_subjects'),
         ('parent_events'),('event_payments'),('bus_attendance'),('canteen_attendance'),
         ('assessments'),('cash_closures')
)
SELECT s.table_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_index i
         JOIN pg_class ci ON ci.oid=i.indexrelid
         JOIN pg_class ct ON ct.oid=i.indrelid
         JOIN pg_namespace n ON n.oid=ct.relnamespace
         JOIN pg_attribute a ON a.attrelid=ct.oid AND a.attnum = ANY(i.indkey)
         WHERE n.nspname='public' AND ct.relname=s.table_name AND a.attname='updated_at'
       ) THEN 'OK' ELSE 'PAS D''INDEX updated_at' END AS index_updated_at
FROM sync_tables s
ORDER BY index_updated_at DESC, s.table_name;


-- ============================================================================
-- D. CONTRAINTES & INTÉGRITÉ STRUCTURELLE
-- ============================================================================

-- D1. Contraintes (PK, FK, UNIQUE, CHECK).
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name,
       ccu.table_name AS table_referencee, ccu.column_name AS colonne_referencee
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema
WHERE tc.table_schema='public'
ORDER BY tc.table_name, tc.constraint_type;


-- ============================================================================
-- E. SÉCURITÉ RLS (risque de blocage de la synchro avec la clé anon)
-- ============================================================================

-- E1. RLS activée ? + nombre de policies. Si RLS=true sans policy permissive pour
--     anon/authenticated, le push/pull avec la clé anon est BLOQUÉ.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_activee,
       c.relforcerowsecurity AS rls_forcee,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS nb_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relrowsecurity DESC, c.relname;

-- E2. Détail des policies (rôles autorisés, commande, permissivité).
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, policyname;


-- ============================================================================
-- F. INTÉGRITÉ DES DONNÉES (doublons, orphelins, blocages de pull)
--    Résultats dans l'onglet Messages. Chaque test est gardé par to_regclass.
-- ============================================================================
DO $$
DECLARE
  cnt bigint;
BEGIN
  -- F1. Reçus en doublon (norme REC-YYYY-C<station>-XXXXX) sur paiements non supprimés.
  IF to_regclass('public.student_payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM (SELECT receipt_number FROM public.student_payments
             WHERE deleted=false AND receipt_number IS NOT NULL AND receipt_number<>''''
             GROUP BY receipt_number HAVING count(*)>1) d' INTO cnt;
    RAISE NOTICE '[F1] student_payments : % numéros de reçu en doublon', cnt;
  END IF;

  -- F2. Matricules en doublon sur élèves non supprimés.
  IF to_regclass('public.students') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM (SELECT registration_number FROM public.students
             WHERE deleted=false AND registration_number IS NOT NULL AND registration_number<>''''
             GROUP BY registration_number HAVING count(*)>1) d' INTO cnt;
    RAISE NOTICE '[F2] students : % matricules en doublon', cnt;
  END IF;

  -- F3. Paiements orphelins (student_id sans élève correspondant).
  IF to_regclass('public.student_payments') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.student_payments p
             WHERE p.deleted=false AND p.student_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=p.student_id)' INTO cnt;
    RAISE NOTICE '[F3] student_payments orphelins (student_id) : %', cnt;
  END IF;

  -- F4. Fiches de frais orphelines.
  IF to_regclass('public.student_fees') IS NOT NULL AND to_regclass('public.students') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.student_fees f
             WHERE f.deleted=false AND f.student_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=f.student_id)' INTO cnt;
    RAISE NOTICE '[F4] student_fees orphelines (student_id) : %', cnt;
  END IF;

  -- F5. Journal caisse orphelin (related_payment_id sans paiement).
  IF to_regclass('public.cash_journal') IS NOT NULL AND to_regclass('public.student_payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cash_journal c
             WHERE c.deleted=false AND c.related_payment_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.student_payments p WHERE p.id=c.related_payment_id)' INTO cnt;
    RAISE NOTICE '[F5] cash_journal orphelins (related_payment_id) : %', cnt;
  END IF;

  -- F6. updated_at NULL/vidé sur tables de sync (casse le curseur de pull).
  IF to_regclass('public.student_payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.student_payments WHERE updated_at IS NULL' INTO cnt;
    RAISE NOTICE '[F6] student_payments updated_at NULL : %', cnt;
  END IF;
  IF to_regclass('public.students') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.students WHERE updated_at IS NULL' INTO cnt;
    RAISE NOTICE '[F6] students updated_at NULL : %', cnt;
  END IF;

  -- F7. Tombstones (deleted=true) par table clé — parité inter-postes.
  IF to_regclass('public.students') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.students WHERE deleted=true' INTO cnt;
    RAISE NOTICE '[F7] students supprimés (tombstones) : %', cnt;
  END IF;
  IF to_regclass('public.student_payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.student_payments WHERE deleted=true' INTO cnt;
    RAISE NOTICE '[F7] student_payments supprimés (tombstones) : %', cnt;
  END IF;
  IF to_regclass('public.cash_journal') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cash_journal WHERE deleted=true' INTO cnt;
    RAISE NOTICE '[F7] cash_journal supprimés (tombstones) : %', cnt;
  END IF;

  -- F8. Clôtures en doublon sur la clé naturelle (date, poste, caissier).
  IF to_regclass('public.cash_closures') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM (SELECT closure_date, station_code, cashier_username
             FROM public.cash_closures GROUP BY closure_date, station_code, cashier_username
             HAVING count(*)>1) d' INTO cnt;
    RAISE NOTICE '[F8] cash_closures : % clés naturelles (date/poste/caissier) en doublon', cnt;
  END IF;

  -- F9. finance_prices présent dans settings ? + clés local-only qui auraient fui au cloud.
  IF to_regclass('public.settings') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.settings WHERE key=''finance_prices''' INTO cnt;
    RAISE NOTICE '[F9] settings finance_prices présent : % (attendu >=1)', cnt;
    EXECUTE 'SELECT count(*) FROM public.settings
             WHERE key IN (''pos_station_code'',''printer_name'',''printer_copies'',''email_logs'',''email_last_sent_date'')' INTO cnt;
    RAISE NOTICE '[F9] settings clés local-only présentes au cloud (normal=0) : %', cnt;
  END IF;
END $$;


-- ============================================================================
-- G. TRIGGERS, FONCTIONS, EXTENSIONS
-- ============================================================================

-- G1. Triggers (un trigger BEFORE UPDATE qui écrase updated_at peut casser le pull).
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema='public'
ORDER BY event_object_table, trigger_name;

-- G2. Extensions installées.
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- G3. Bucket storage "photos" (utilisé par la synchro des photos élèves).
SELECT id, name, public FROM storage.buckets ORDER BY name;

-- ============================================================================
-- FIN DE L'AUDIT — Aucune modification n'a été effectuée.
-- Interprétation rapide :
--   A1/B2 "MANQUANTE"/"ABSENTE"  => schéma cloud incomplet, push/pull à risque.
--   B3 "PRESENTE"                => colonne local-only inattendue (inoffensif).
--   C2 "PAS D'INDEX updated_at"  => pull lent, à optimiser.
--   E1 rls_activee=true + nb_policies=0 => BLOCAGE synchro clé anon.
--   F1/F2/F8 doublons > 0        => collisions à résoudre (assistant local).
--   F3/F4/F5 orphelins > 0       => intégrité référentielle à corriger.
--   F6 updated_at NULL > 0       => curseur de pull potentiellement bloqué.
--   F9 finance_prices=0          => config financière absente du cloud.
-- ============================================================================