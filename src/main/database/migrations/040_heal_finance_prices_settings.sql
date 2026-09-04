-- ============================================================
-- Migration 040: Seed and Heal Finance Prices Settings
--
-- Ensures 'finance_prices' exists in SQLite settings.
-- Replaces any legacy test artifacts (20 000 / 10 000 Ar)
-- with the official school rates (145 000 / 115 000 Ar).
-- ============================================================

-- 1. Insert default finance_prices if completely missing
INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES (
  'finance_prices',
  '{"tuition":{"PS":60000,"MS":60000,"GS":60000,"CP":70000,"CE1":70000,"CE2":70000,"CM1":80000,"CM2":80000,"6ème":90000,"5ème":90000,"4ème":100000,"3ème":100000,"Seconde":110000,"Première":110000,"Terminale":120000},"classes":["PS","MS","GS","CP","CE1","CE2","CM1","CM2","6ème","5ème","4ème","3ème","Seconde","Première","Terminale"],"fram":15000,"registration":145000,"reenrollment":115000,"canteen":{"daily":2000,"monthly":40000},"bus":{"Zone 1":30000,"Zone 2":40000,"Zone 3":50000},"busRoutes":["Zone 1","Zone 2","Zone 3"],"uniforms":{"Tablier":15000,"T-shirt":10000,"Survêtement":25000,"Badge":5000},"uniformItems":["Tablier","T-shirt","Survêtement","Badge"]}',
  CURRENT_TIMESTAMP
);

-- 2. If finance_prices was saved with legacy 20000 registration / 10000 reenrollment, auto-rectify it
UPDATE settings
SET value = REPLACE(REPLACE(value, '"registration":20000', '"registration":145000'), '"reenrollment":10000', '"reenrollment":115000'),
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'finance_prices' AND (value LIKE '%"registration":20000%' OR value LIKE '%"reenrollment":10000%');

UPDATE settings
SET value = REPLACE(REPLACE(value, '"registration": 20000', '"registration": 145000'), '"reenrollment": 10000', '"reenrollment": 115000'),
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'finance_prices' AND (value LIKE '%"registration": 20000%' OR value LIKE '%"reenrollment": 10000%');
