-- Migration 009: Seed default subjects
-- Insère les matières courantes du curriculum malgache
-- Safe to run multiple times (INSERT OR IGNORE)

INSERT OR IGNORE INTO subjects (id, name, default_coefficient, created_at, updated_at, version, sync_status, deleted) VALUES
('subj-math-00000000-0000-0000-000000000001', 'Mathématiques', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-fr-00000000-0000-0000-000000000002', 'Français', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-sci-00000000-0000-0000-000000000003', 'Sciences', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-hg-00000000-0000-0000-000000000004', 'Histoire-Géographie', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-ang-00000000-0000-0000-000000000005', 'Anglais', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-mal-00000000-0000-0000-000000000006', 'Malagasy', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-eps-00000000-0000-0000-000000000007', 'EPS', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-art-00000000-0000-0000-000000000008', 'Arts Plastiques', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-mus-00000000-0000-0000-000000000009', 'Musique', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0),
('subj-mor-00000000-0000-0000-000000000010', 'Éducation Morale', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending', 0);