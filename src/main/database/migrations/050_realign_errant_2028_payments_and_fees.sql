-- Migration 050: Realign errant 2027-2028 and 2026_2027 payments and fees to 2026-2027
-- 1. Normalize 2026_2027 typo for Nomentsoa and general payments
UPDATE student_fees 
SET class_name = 'TA', tuition_level = 'Lycée', monthly_tuition = 60000.0 
WHERE student_id = 'fb220791-4eb6-4f27-bc91-43795d29b996' AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026-2027';

DELETE FROM student_fees 
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026_2027';

UPDATE student_payments 
SET school_year = '2026-2027' 
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2026_2027';

-- 2. Realign genuine payments inadvertently registered under 2027-2028 by station operators
-- Henintsoa Christian RAKOTOBE: tuition September 2026
UPDATE student_payments 
SET school_year = '2026-2027', month = '2026-09' 
WHERE id = '92a6524a-31d6-42c9-9119-090b37877807';

-- Tohy Iloniaiko RASOLOFO: tuition October 2026
UPDATE student_payments 
SET school_year = '2026-2027', month = '2026-10' 
WHERE id = '9c34e72d-c474-4ceb-98e1-a9ca7848e4ef';

-- Fitahiana ANDRIANIAVO: reenrollment 2026-2027
UPDATE student_payments 
SET school_year = '2026-2027' 
WHERE id = 'd8558007-aa0c-4461-8bd7-aae899cdf985';

-- Andritiana RAZAKAMAHAVONJY: reenrollment & fram 2026-2027
UPDATE student_payments 
SET school_year = '2026-2027' 
WHERE id IN ('515d2c5a-7537-48de-b707-830ff5400bda', '09e26175-c9d1-487d-8850-fcd84c0e5970');

-- Hiraina ANDRIAMIHAMISON: polo uniform
UPDATE student_payments 
SET school_year = '2026-2027' 
WHERE id = 'b1c119aa-d291-4bab-b9f5-d89cbe410d52';

-- Salohy RAMBELOHERINIRINA: uniform
UPDATE student_payments 
SET school_year = '2026-2027' 
WHERE id = '52db3f75-bb4b-4d7a-b25a-054c4a2b2924';

-- Tolotra RAKOTOARIVAO: uniform
UPDATE student_payments 
SET school_year = '2026-2027' 
WHERE id = '5ac68856-fdda-4850-a9be-6fe336df0145';

-- 3. Harmonize cash_journal descriptions for Henintsoa and Tohy
UPDATE cash_journal 
SET description = REPLACE(description, '2027-09', '2026-09') 
WHERE description LIKE '%2027-09%';

UPDATE cash_journal 
SET description = REPLACE(description, '2027-10', '2026-10') 
WHERE description LIKE '%2027-10%';

-- 4. Purge remaining orphan duplicate test payments in 2027-2028 (which have no cash_journal entry and are already settled in 2026-2027)
DELETE FROM student_payments 
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2027-2028';

-- 5. Purge errant student_fees for 2027-2028 (all students already have their valid 2026-2027 fee record)
DELETE FROM student_fees 
WHERE REPLACE(REPLACE(school_year, '"', ''), '''', '') = '2027-2028';
