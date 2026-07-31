-- Migration 030: Fix school_year for parent_events
-- Ensure all parent_events have a school_year based on their event_date

ALTER TABLE parent_events ADD COLUMN school_year TEXT;

UPDATE parent_events
SET school_year = 
  CASE 
    WHEN strftime('%m', event_date) >= '09' THEN strftime('%Y', event_date) || '-' || (CAST(strftime('%Y', event_date) AS INTEGER) + 1)
    ELSE (CAST(strftime('%Y', event_date) AS INTEGER) - 1) || '-' || strftime('%Y', event_date)
  END
WHERE school_year IS NULL AND event_date IS NOT NULL;
