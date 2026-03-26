
-- Migration 003: Add class history to student_fees
-- Run this in your Supabase SQL Editor to update your cloud database

ALTER TABLE student_fees ADD COLUMN IF NOT EXISTS class_name TEXT;

-- Create an index for performance on class history queries
CREATE INDEX IF NOT EXISTS idx_fees_class_history ON student_fees(student_id, school_year, class_name);
