-- Up
ALTER TABLE students ADD COLUMN gender TEXT CHECK(gender IN ('M', 'F'));

-- Down
-- SQLite ne supporte pas facilement le DROP COLUMN, la colonne restera.
