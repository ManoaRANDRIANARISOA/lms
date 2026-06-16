-- Migration 015: Seed classes setting
-- Single source of truth for class list used across all modules

INSERT OR IGNORE INTO settings (key, value) VALUES
('classes', '["PS","MS","GS","CP1","CP2","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","2nde","1ère","TA","TD"]');
