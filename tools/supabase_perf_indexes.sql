-- ============================================================================
-- PROPOSITION D'OPTIMISATION — INDEX DE SYNCHRO (à exécuter SEULEMENT si accord)
-- ----------------------------------------------------------------------------
-- Contrairement aux scripts d'audit, celui-ci ÉCRIT (DDL additif) : il crée des
-- index. Il ne modifie AUCUNE donnée, ne supprime rien, est idempotent
-- (IF NOT EXISTS) et réversible (DROP INDEX). Sans risque pour les enregistrements.
-- Bénéfice : le pull (.gt('updated_at', ...) + tri) et les recherches par reçu /
-- élève passent d'un scan séquentiel à un index scan => synchro plus rapide/fiable.
-- À coller dans Supabase SQL Editor > Run (une fois).
-- ============================================================================

-- Index du curseur de pull sur toutes les tables synchronisées.
CREATE INDEX IF NOT EXISTS idx_users_updated_at            ON public.users(updated_at);
CREATE INDEX IF NOT EXISTS idx_students_updated_at         ON public.students(updated_at);
CREATE INDEX IF NOT EXISTS idx_student_fees_updated_at     ON public.student_fees(updated_at);
CREATE INDEX IF NOT EXISTS idx_student_payments_updated_at ON public.student_payments(updated_at);
CREATE INDEX IF NOT EXISTS idx_personnel_updated_at        ON public.personnel(updated_at);
CREATE INDEX IF NOT EXISTS idx_time_tracking_updated_at    ON public.time_tracking(updated_at);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_updated_at ON public.daily_attendance(updated_at);
CREATE INDEX IF NOT EXISTS idx_personnel_absences_updated_at ON public.personnel_absences(updated_at);
CREATE INDEX IF NOT EXISTS idx_salary_advances_updated_at  ON public.salary_advances(updated_at);
CREATE INDEX IF NOT EXISTS idx_custom_deductions_updated_at ON public.custom_deductions(updated_at);
CREATE INDEX IF NOT EXISTS idx_cash_journal_updated_at     ON public.cash_journal(updated_at);
CREATE INDEX IF NOT EXISTS idx_subjects_updated_at         ON public.subjects(updated_at);
CREATE INDEX IF NOT EXISTS idx_grades_updated_at           ON public.grades(updated_at);
CREATE INDEX IF NOT EXISTS idx_class_subjects_updated_at   ON public.class_subjects(updated_at);
CREATE INDEX IF NOT EXISTS idx_parent_events_updated_at    ON public.parent_events(updated_at);
CREATE INDEX IF NOT EXISTS idx_event_payments_updated_at   ON public.event_payments(updated_at);
CREATE INDEX IF NOT EXISTS idx_bus_attendance_updated_at   ON public.bus_attendance(updated_at);
CREATE INDEX IF NOT EXISTS idx_canteen_attendance_updated_at ON public.canteen_attendance(updated_at);
CREATE INDEX IF NOT EXISTS idx_assessments_updated_at      ON public.assessments(updated_at);
CREATE INDEX IF NOT EXISTS idx_cash_closures_updated_at    ON public.cash_closures(updated_at);

-- Index ciblés pour les recherches fréquentes (reçu, élève) et la parité deleted.
CREATE INDEX IF NOT EXISTS idx_student_payments_receipt    ON public.student_payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_cash_journal_receipt        ON public.cash_journal(receipt_number);
CREATE INDEX IF NOT EXISTS idx_student_payments_student    ON public.student_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_student        ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_students_registration       ON public.students(registration_number);

-- Vérification après coup (lecture seule) : les index existent bien.
-- SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%_updated_at' ORDER BY tablename;