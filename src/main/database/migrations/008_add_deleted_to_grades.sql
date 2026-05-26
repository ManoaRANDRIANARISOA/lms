-- Migration 008: Add deleted column to grades table
-- Ensures soft-delete consistency for the grades module (AGENT_ANCHOR §6).

ALTER TABLE grades ADD COLUMN deleted BOOLEAN DEFAULT 0;