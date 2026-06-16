-- Migration 013: Seed collège and lycée subjects with coefficients
-- Transcribed from note&matiere.jpg

-- ============================================
-- SEED: Additional subjects needed for collège/lycée
-- ============================================

INSERT OR IGNORE INTO subjects (id, name, default_coefficient, created_at, updated_at, version, sync_status, deleted) VALUES
('subj-tech-0000-0000-0000-000000000017', 'Technologie', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-svt-0000-0000-0000-000000000018', 'SVT', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-eac-0000-0000-0000-000000000019', 'EAC', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-ses-0000-0000-0000-000000000020', 'SES', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-philo-0000-0000-0000-000000000021', 'Philosophie', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-pc-0000-0000-0000-000000000022', 'Physique-Chimie', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-del-0000-0000-0000-000000000023', 'Religion', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0);

-- ============================================
-- SEED: Collège — 6ème, 5ème, 4ème, 3ème
-- All levels have the same coefficients (from image)
-- ============================================

-- 6ème
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-6e-' || SUBSTR(s.id, 6) || '-0001', '6ème', s.id,
    CASE s.name
        WHEN 'Français' THEN 3
        WHEN 'Mathématiques' THEN 3
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Sciences' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 2
        WHEN 'Technologie' THEN 1
        WHEN 'Arts Plastiques' THEN 1
        WHEN 'Musique' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Sciences' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'Technologie' THEN 9
        WHEN 'Arts Plastiques' THEN 10
        WHEN 'Musique' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'Technologie', 'Arts Plastiques', 'Musique');

-- 5ème
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-5e-' || SUBSTR(s.id, 6) || '-0001', '5ème', s.id,
    CASE s.name
        WHEN 'Français' THEN 3
        WHEN 'Mathématiques' THEN 3
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Sciences' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 2
        WHEN 'Technologie' THEN 1
        WHEN 'Arts Plastiques' THEN 1
        WHEN 'Musique' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Sciences' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'Technologie' THEN 9
        WHEN 'Arts Plastiques' THEN 10
        WHEN 'Musique' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'Technologie', 'Arts Plastiques', 'Musique');

-- 4ème
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-4e-' || SUBSTR(s.id, 6) || '-0001', '4ème', s.id,
    CASE s.name
        WHEN 'Français' THEN 3
        WHEN 'Mathématiques' THEN 3
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Sciences' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 2
        WHEN 'Technologie' THEN 1
        WHEN 'Arts Plastiques' THEN 1
        WHEN 'Musique' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Sciences' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'Technologie' THEN 9
        WHEN 'Arts Plastiques' THEN 10
        WHEN 'Musique' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'Technologie', 'Arts Plastiques', 'Musique');

-- 3ème
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-3e-' || SUBSTR(s.id, 6) || '-0001', '3ème', s.id,
    CASE s.name
        WHEN 'Français' THEN 3
        WHEN 'Mathématiques' THEN 3
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Sciences' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 2
        WHEN 'Technologie' THEN 1
        WHEN 'Arts Plastiques' THEN 1
        WHEN 'Musique' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Sciences' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'Technologie' THEN 9
        WHEN 'Arts Plastiques' THEN 10
        WHEN 'Musique' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'Technologie', 'Arts Plastiques', 'Musique');

-- ============================================
-- SEED: Lycée — 2nde, 1ère, TA, TD
-- Lycée uses EAC (not Arts Plastiques), plus SES, Philosophie, Physique-Chimie, Religion
-- ============================================

-- 2nde
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-2nde-' || SUBSTR(s.id, 6) || '-0001', '2nde', s.id,
    CASE s.name
        WHEN 'Français' THEN 3
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Physique-Chimie' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 1
        WHEN 'EAC' THEN 1
        WHEN 'SES' THEN 1
        WHEN 'Religion' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Physique-Chimie' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'EAC' THEN 9
        WHEN 'SES' THEN 10
        WHEN 'Religion' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Physique-Chimie', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'EAC', 'SES', 'Religion');

-- 1ère
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-1ere-' || SUBSTR(s.id, 6) || '-0001', '1ère', s.id,
    CASE s.name
        WHEN 'Français' THEN 3
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Physique-Chimie' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 1
        WHEN 'EAC' THEN 1
        WHEN 'SES' THEN 1
        WHEN 'Religion' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Physique-Chimie' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'EAC' THEN 9
        WHEN 'SES' THEN 10
        WHEN 'Religion' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Physique-Chimie', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'EAC', 'SES', 'Religion');

-- TA (Terminale A — Littéraire)
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-ta-' || SUBSTR(s.id, 6) || '-0001', 'TA', s.id,
    CASE s.name
        WHEN 'Français' THEN 4
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Physique-Chimie' THEN 2
        WHEN 'SVT' THEN 2
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 2
        WHEN 'EPS' THEN 1
        WHEN 'EAC' THEN 1
        WHEN 'SES' THEN 1
        WHEN 'Religion' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Physique-Chimie' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'EAC' THEN 9
        WHEN 'SES' THEN 10
        WHEN 'Religion' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Physique-Chimie', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'EAC', 'SES', 'Religion');

-- TD (Terminale D — Scientifique)
INSERT OR IGNORE INTO class_subjects (id, class_name, subject_id, coefficient, position, created_at, updated_at, version, sync_status, deleted)
SELECT 'cs-td-' || SUBSTR(s.id, 6) || '-0001', 'TD', s.id,
    CASE s.name
        WHEN 'Français' THEN 2
        WHEN 'Mathématiques' THEN 4
        WHEN 'Histoire-Géographie' THEN 2
        WHEN 'Physique-Chimie' THEN 4
        WHEN 'SVT' THEN 4
        WHEN 'Anglais' THEN 2
        WHEN 'Malagasy' THEN 1
        WHEN 'EPS' THEN 1
        WHEN 'EAC' THEN 1
        WHEN 'SES' THEN 1
        WHEN 'Religion' THEN 1
        ELSE 1
    END,
    CASE s.name
        WHEN 'Français' THEN 1
        WHEN 'Mathématiques' THEN 2
        WHEN 'Histoire-Géographie' THEN 3
        WHEN 'Physique-Chimie' THEN 4
        WHEN 'SVT' THEN 5
        WHEN 'Anglais' THEN 6
        WHEN 'Malagasy' THEN 7
        WHEN 'EPS' THEN 8
        WHEN 'EAC' THEN 9
        WHEN 'SES' THEN 10
        WHEN 'Religion' THEN 11
        ELSE 99
    END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0
FROM subjects s
WHERE s.name IN ('Français', 'Mathématiques', 'Histoire-Géographie', 'Physique-Chimie', 'SVT', 'Anglais', 'Malagasy', 'EPS', 'EAC', 'SES', 'Religion');
