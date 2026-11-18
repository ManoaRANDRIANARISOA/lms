-- ============================================================================
-- AUDIT SUPABASE UNIFIÉ — LMS v2.4.0 (LECTURE SEULE)
-- ----------------------------------------------------------------------------
-- Q1 = TOUTES les vérifications de schéma dans UNE SEULE grille (1 seul Run).
-- Q2 = intégrité des données dans UNE SEULE grille (à lancer APRÈS Q1, si aucune
--      table "MANQUANTE"). Les deux sont 100% lecture seule.
-- Coller Q1, Run, lire la grille. Puis coller Q2, Run, lire la grille.
-- Les lignes de problème remontent en premier (tri par statut).
-- ============================================================================

-- ============================ Q1 : SCHÉMA (une grille) ======================
WITH expected_tables(table_name) AS (
  VALUES ('users'),('students'),('student_fees'),('student_payments'),('personnel'),
         ('time_tracking'),('daily_attendance'),('personnel_absences'),('salary_advances'),
         ('custom_deductions'),('cash_journal'),('subjects'),('grades'),('class_subjects'),
         ('parent_events'),('event_payments'),('bus_attendance'),('canteen_attendance'),
         ('assessments'),('settings'),('cash_closures')
),
expected_cols(table_name, column_name) AS (
  VALUES
    ('students','id'),('students','deleted'),('students','updated_at'),
    ('student_payments','id'),('student_payments','deleted'),('student_payments','updated_at'),
    ('student_fees','id'),('student_fees','deleted'),('student_fees','updated_at'),
    ('cash_journal','id'),('cash_journal','deleted'),('cash_journal','updated_at'),
    ('cash_closures','id'),('cash_closures','updated_at'),
    ('users','id'),('users','deleted'),('users','updated_at'),
    ('settings','key'),('settings','value'),('settings','updated_at'),
    ('students','registration_number'),('students','class'),('students','gender'),
    ('students','is_personnel_child'),('students','parent_personnel_id'),
    ('student_payments','student_id'),('student_payments','payment_date'),('student_payments','amount'),
    ('student_payments','school_year'),('student_payments','receipt_number'),
    ('student_payments','print_count'),('student_payments','last_printed_at'),
    ('student_payments','last_printed_by'),('student_payments','created_by'),
    ('cash_journal','related_payment_id'),('cash_journal','related_student_id'),
    ('cash_journal','receipt_number'),('cash_journal','created_by'),('cash_journal','department'),
    ('cash_journal','print_count'),('cash_journal','last_printed_at'),('cash_journal','last_printed_by'),
    ('cash_journal','transaction_date'),('cash_journal','amount'),
    ('student_fees','student_id'),('student_fees','class_name'),('student_fees','tuition_level'),
    ('student_fees','monthly_tuition'),('student_fees','bus_route'),('student_fees','bus_monthly_fee'),
    ('student_fees','school_year'),
    ('cash_closures','closure_date'),('cash_closures','cashier_username'),('cash_closures','station_code'),
    ('cash_closures','is_locked'),('cash_closures','expected_total'),('cash_closures','counted_cash'),
    ('cash_closures','cash_difference'),('cash_closures','status'),('cash_closures','version')
),
local_only(table_name, column_name) AS (
  VALUES ('students','sync_status'),('students','last_synced_at'),('students','search_text'),
         ('student_payments','sync_status'),('student_payments','last_synced_at'),
         ('student_fees','sync_status'),('student_fees','last_synced_at'),('student_fees','is_reenrollment'),
         ('cash_journal','sync_status'),('cash_journal','last_synced_at'),
         ('cash_closures','sync_status'),('cash_closures','last_synced_at'),
         ('personnel','payroll_start_date'),('parent_events','school_year')
),
sync_tables(table_name) AS (
  VALUES ('users'),('students'),('student_fees'),('student_payments'),('personnel'),
         ('time_tracking'),('daily_attendance'),('personnel_absences'),('salary_advances'),
         ('custom_deductions'),('cash_journal'),('subjects'),('grades'),('class_subjects'),
         ('parent_events'),('event_payments'),('bus_attendance'),('canteen_attendance'),
         ('assessments'),('cash_closures')
)
SELECT 'A1_tables' AS section, e.table_name AS controle,
       CASE WHEN t.table_name IS NULL THEN 'MANQUANTE' ELSE 'OK' END AS statut, '' AS detail
FROM expected_tables e
LEFT JOIN information_schema.tables t ON t.table_schema='public' AND t.table_name=e.table_name
UNION ALL
SELECT 'B2_colonnes', e.table_name||'.'||e.column_name,
       CASE WHEN c.column_name IS NULL THEN 'ABSENTE' ELSE 'OK' END, COALESCE(c.data_type,'')
FROM expected_cols e
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
UNION ALL
SELECT 'B3_local_only', l.table_name||'.'||l.column_name,
       CASE WHEN c.column_name IS NULL THEN 'absent_normal' ELSE 'PRESENTE_inattendue' END, ''
FROM local_only l
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=l.table_name AND c.column_name=l.column_name
UNION ALL
SELECT 'C2_index', s.table_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_index i
         JOIN pg_class ct ON ct.oid=i.indrelid
         JOIN pg_namespace n ON n.oid=ct.relnamespace
         JOIN pg_attribute a ON a.attrelid=ct.oid AND a.attnum = ANY(i.indkey)
         WHERE n.nspname='public' AND ct.relname=s.table_name AND a.attname='updated_at'
       ) THEN 'OK' ELSE 'PAS_INDEX_updated_at' END, ''
FROM sync_tables s
UNION ALL
SELECT 'E1_rls', c.relname,
       CASE WHEN c.relrowsecurity AND (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)=0
            THEN 'BLOQUANT_rls_sans_policy'
            WHEN c.relrowsecurity THEN 'rls_active'
            ELSE 'rls_off' END,
       'policies='||(SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY section, statut DESC, controle;


-- ============================ Q2 : DONNÉES (une grille) =====================
-- À lancer APRÈS Q1, uniquement si aucune table "MANQUANTE".
SELECT 'F1_recus_doublon' AS controle,
       (SELECT count(*) FROM (SELECT receipt_number FROM public.student_payments
         WHERE deleted=false AND receipt_number IS NOT NULL AND receipt_number<>''
         GROUP BY receipt_number HAVING count(*)>1) d)::text AS valeur
UNION ALL
SELECT 'F2_matricules_doublon',
       (SELECT count(*) FROM (SELECT registration_number FROM public.students
         WHERE deleted=false AND registration_number IS NOT NULL AND registration_number<>''
         GROUP BY registration_number HAVING count(*)>1) d)::text
UNION ALL
SELECT 'F3_paiements_orphelins',
       (SELECT count(*) FROM public.student_payments p
         WHERE p.deleted=false AND p.student_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=p.student_id))::text
UNION ALL
SELECT 'F4_frais_orphelins',
       (SELECT count(*) FROM public.student_fees f
         WHERE f.deleted=false AND f.student_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=f.student_id))::text
UNION ALL
SELECT 'F5_journal_orphelins',
       (SELECT count(*) FROM public.cash_journal c
         WHERE c.deleted=false AND c.related_payment_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.student_payments p WHERE p.id=c.related_payment_id))::text
UNION ALL
SELECT 'F6_payments_updated_at_null',
       (SELECT count(*) FROM public.student_payments WHERE updated_at IS NULL)::text
UNION ALL
SELECT 'F6_students_updated_at_null',
       (SELECT count(*) FROM public.students WHERE updated_at IS NULL)::text
UNION ALL
SELECT 'F7_students_tombstones',
       (SELECT count(*) FROM public.students WHERE deleted=true)::text
UNION ALL
SELECT 'F7_payments_tombstones',
       (SELECT count(*) FROM public.student_payments WHERE deleted=true)::text
UNION ALL
SELECT 'F7_journal_tombstones',
       (SELECT count(*) FROM public.cash_journal WHERE deleted=true)::text
UNION ALL
SELECT 'F8_closures_doublon',
       (SELECT count(*) FROM (SELECT closure_date, station_code, cashier_username
         FROM public.cash_closures GROUP BY closure_date, station_code, cashier_username
         HAVING count(*)>1) d)::text
UNION ALL
SELECT 'F9_finance_prices_present',
       (SELECT count(*) FROM public.settings WHERE key='finance_prices')::text
UNION ALL
SELECT 'F9_local_only_settings_fuites',
       (SELECT count(*) FROM public.settings
         WHERE key IN ('pos_station_code','printer_name','printer_copies','email_logs','email_last_sent_date'))::text
UNION ALL
SELECT 'X_buckets_photos',
       (SELECT count(*) FROM storage.buckets WHERE name='photos')::text;