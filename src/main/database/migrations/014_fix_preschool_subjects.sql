-- Migration 014: Fix preschool & primary subjects to match curriculum
-- Removes old incorrect class_subjects and re-seeds with correct subjects

-- ============================================
-- STEP 1: Insert all missing subjects
-- ============================================

INSERT OR IGNORE INTO subjects (id, name, default_coefficient, created_at, updated_at, version, sync_status, deleted) VALUES
-- Preschool shared
('subj-premath-0000-0000-0000-000000001', 'Pré-math', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-preecri-0000-0000-0000-000000002', 'Pré-écriture', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-prelect-0000-0000-0000-000000003', 'Pré-lecture', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-numer-0000-0000-0000-00000000004', 'Numération', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-langmor-0000-0000-0000-000000005', 'Langage et Morale', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-vocab-0000-0000-0000-00000000006', 'Vocabulaire', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-chant-0000-0000-0000-00000000007', 'Chant et Récitation', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-color-0000-0000-0000-00000000008', 'Coloriage', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-peint-0000-0000-0000-00000000009', 'Peinture', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-motri-0000-0000-0000-00000000010', 'Motricité Fine', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-condu-0000-0000-0000-00000000011', 'Conduite', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
-- MS extras
('subj-dicte-0000-0000-0000-00000000012', 'Dictée', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-decou-0000-0000-0000-00000000013', 'Découpage', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
-- GS specific
('subj-lect-0000-0000-0000-000000000014', 'Lecture', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-vakiteny-0000-0000-0000-000000015', 'Vakiteny', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-dessin-0000-0000-0000-00000000016', 'Dessin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
-- Primary shared
('subj-calcul-0000-0000-0000-00000000017', 'Calcul', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-sorato-0000-0000-0000-00000000018', 'Soratononina', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-recit-0000-0000-0000-00000000019', 'Récitation et Chant', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
-- CP2-CM2 extras
('subj-tantara-0000-0000-0000-0000000020', 'Tantara', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0);

-- ============================================
-- STEP 2: Remove old incorrect class_subjects for preschool & primary
-- ============================================

DELETE FROM class_subjects WHERE class_name IN ('PS', 'MS', 'GS', 'CP', 'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2');

-- ============================================
-- STEP 3: Re-seed with correct subjects
-- ============================================

-- PS
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-ps-' || SUBSTR(s.id, 6) || '-0001', 'PS', s.id, 1,
    CASE s.name WHEN 'Pré-math' THEN 1 WHEN 'Pré-écriture' THEN 2 WHEN 'Pré-lecture' THEN 3
        WHEN 'Numération' THEN 4 WHEN 'Langage et Morale' THEN 5 WHEN 'Vocabulaire' THEN 6
        WHEN 'Chant et Récitation' THEN 7 WHEN 'Coloriage' THEN 8 WHEN 'Peinture' THEN 9
        WHEN 'Motricité Fine' THEN 10 WHEN 'Conduite' THEN 11 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Pré-math','Pré-écriture','Pré-lecture','Numération','Langage et Morale','Vocabulaire','Chant et Récitation','Coloriage','Peinture','Motricité Fine','Conduite');

-- MS
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-ms-' || SUBSTR(s.id, 6) || '-0001', 'MS', s.id, 1,
    CASE s.name WHEN 'Pré-math' THEN 1 WHEN 'Pré-écriture' THEN 2 WHEN 'Pré-lecture' THEN 3
        WHEN 'Numération' THEN 4 WHEN 'Langage et Morale' THEN 5 WHEN 'Vocabulaire' THEN 6
        WHEN 'Chant et Récitation' THEN 7 WHEN 'Coloriage' THEN 8 WHEN 'Peinture' THEN 9
        WHEN 'Motricité Fine' THEN 10 WHEN 'Conduite' THEN 11 WHEN 'Dictée' THEN 12 WHEN 'Découpage' THEN 13 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Pré-math','Pré-écriture','Pré-lecture','Numération','Langage et Morale','Vocabulaire','Chant et Récitation','Coloriage','Peinture','Motricité Fine','Conduite','Dictée','Découpage');

-- GS
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-gs-' || SUBSTR(s.id, 6) || '-0001', 'GS', s.id, 1,
    CASE s.name WHEN 'Français' THEN 1 WHEN 'Malagasy' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dessin' THEN 4 WHEN 'Découpage' THEN 5 WHEN 'Coloriage' THEN 6
        WHEN 'Peinture' THEN 7 WHEN 'Lecture' THEN 8 WHEN 'Vakiteny' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Chant et Récitation' THEN 11 WHEN 'Conduite' THEN 12 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Français','Malagasy','Calcul','Dessin','Découpage','Coloriage','Peinture','Lecture','Vakiteny','Langage et Morale','Chant et Récitation','Conduite');

-- CP1
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-cp1-' || SUBSTR(s.id, 6) || '-0001', 'CP1', s.id, 1,
    CASE s.name WHEN 'Malagasy' THEN 1 WHEN 'Français' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dictée' THEN 4 WHEN 'Soratononina' THEN 5 WHEN 'Vakiteny' THEN 6
        WHEN 'Lecture' THEN 7 WHEN 'Anglais' THEN 8 WHEN 'Dessin' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Récitation et Chant' THEN 11 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Malagasy','Français','Calcul','Dictée','Soratononina','Vakiteny','Lecture','Anglais','Dessin','Langage et Morale','Récitation et Chant');

-- CP2 to CM2 (same subjects: CP1 + Tantara, Géographie, SVT)
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-cp2-' || SUBSTR(s.id, 6) || '-0001', 'CP2', s.id, 1,
    CASE s.name WHEN 'Malagasy' THEN 1 WHEN 'Français' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dictée' THEN 4 WHEN 'Soratononina' THEN 5 WHEN 'Vakiteny' THEN 6
        WHEN 'Lecture' THEN 7 WHEN 'Anglais' THEN 8 WHEN 'Dessin' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Récitation et Chant' THEN 11
        WHEN 'Tantara' THEN 12 WHEN 'Géographie' THEN 13 WHEN 'SVT' THEN 14 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Malagasy','Français','Calcul','Dictée','Soratononina','Vakiteny','Lecture','Anglais','Dessin','Langage et Morale','Récitation et Chant','Tantara','Géographie','SVT');

INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-ce1-' || SUBSTR(s.id, 6) || '-0002', 'CE1', s.id, 1,
    CASE s.name WHEN 'Malagasy' THEN 1 WHEN 'Français' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dictée' THEN 4 WHEN 'Soratononina' THEN 5 WHEN 'Vakiteny' THEN 6
        WHEN 'Lecture' THEN 7 WHEN 'Anglais' THEN 8 WHEN 'Dessin' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Récitation et Chant' THEN 11
        WHEN 'Tantara' THEN 12 WHEN 'Géographie' THEN 13 WHEN 'SVT' THEN 14 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Malagasy','Français','Calcul','Dictée','Soratononina','Vakiteny','Lecture','Anglais','Dessin','Langage et Morale','Récitation et Chant','Tantara','Géographie','SVT');

INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-ce2-' || SUBSTR(s.id, 6) || '-0002', 'CE2', s.id, 1,
    CASE s.name WHEN 'Malagasy' THEN 1 WHEN 'Français' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dictée' THEN 4 WHEN 'Soratononina' THEN 5 WHEN 'Vakiteny' THEN 6
        WHEN 'Lecture' THEN 7 WHEN 'Anglais' THEN 8 WHEN 'Dessin' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Récitation et Chant' THEN 11
        WHEN 'Tantara' THEN 12 WHEN 'Géographie' THEN 13 WHEN 'SVT' THEN 14 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Malagasy','Français','Calcul','Dictée','Soratononina','Vakiteny','Lecture','Anglais','Dessin','Langage et Morale','Récitation et Chant','Tantara','Géographie','SVT');

INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-cm1-' || SUBSTR(s.id, 6) || '-0002', 'CM1', s.id, 1,
    CASE s.name WHEN 'Malagasy' THEN 1 WHEN 'Français' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dictée' THEN 4 WHEN 'Soratononina' THEN 5 WHEN 'Vakiteny' THEN 6
        WHEN 'Lecture' THEN 7 WHEN 'Anglais' THEN 8 WHEN 'Dessin' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Récitation et Chant' THEN 11
        WHEN 'Tantara' THEN 12 WHEN 'Géographie' THEN 13 WHEN 'SVT' THEN 14 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Malagasy','Français','Calcul','Dictée','Soratononina','Vakiteny','Lecture','Anglais','Dessin','Langage et Morale','Récitation et Chant','Tantara','Géographie','SVT');

INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-cm2-' || SUBSTR(s.id, 6) || '-0002', 'CM2', s.id, 1,
    CASE s.name WHEN 'Malagasy' THEN 1 WHEN 'Français' THEN 2 WHEN 'Calcul' THEN 3
        WHEN 'Dictée' THEN 4 WHEN 'Soratononina' THEN 5 WHEN 'Vakiteny' THEN 6
        WHEN 'Lecture' THEN 7 WHEN 'Anglais' THEN 8 WHEN 'Dessin' THEN 9
        WHEN 'Langage et Morale' THEN 10 WHEN 'Récitation et Chant' THEN 11
        WHEN 'Tantara' THEN 12 WHEN 'Géographie' THEN 13 WHEN 'SVT' THEN 14 ELSE 99 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s WHERE s.name IN ('Malagasy','Français','Calcul','Dictée','Soratononina','Vakiteny','Lecture','Anglais','Dessin','Langage et Morale','Récitation et Chant','Tantara','Géographie','SVT');
