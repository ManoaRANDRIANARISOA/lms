-- Migration to add sub-grades
ALTER TABLE grades ADD COLUMN grade_journalier REAL;
ALTER TABLE grades ADD COLUMN grade_exam REAL;
