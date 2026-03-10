-- Migration to add parent contacts and professions
ALTER TABLE students ADD COLUMN father_contact TEXT;
ALTER TABLE students ADD COLUMN mother_contact TEXT;
ALTER TABLE students ADD COLUMN father_profession TEXT;
ALTER TABLE students ADD COLUMN mother_profession TEXT;
