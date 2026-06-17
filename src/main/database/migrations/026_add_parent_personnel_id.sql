-- Migration to add parent_personnel_id to students
ALTER TABLE students ADD COLUMN parent_personnel_id TEXT;
