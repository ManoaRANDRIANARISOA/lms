import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const isDev = !app.isPackaged;
const dbPath = isDev
  ? path.join(__dirname, '../../database.sqlite')
  : path.join(app.getPath('userData'), 'database.sqlite');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Explicitly type db to avoid export errors
const db: Database.Database = new Database(dbPath, { verbose: undefined });
db.pragma('journal_mode = WAL');

// Migration runner
const runMigrations = () => {
  const migrationTableExists = (db.prepare(`
    SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='migrations'
  `).get() as { count: number }).count > 0;

  if (!migrationTableExists) {
    db.prepare(`
      CREATE TABLE migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  }

  // We are looking for the migration file. 
  // In production, we need to make sure resources are copied correctly.
  // For now, let's assume we can read the file we just copied.
  // In electron-vite, resources are handled differently. 
  // We'll read the file content I just copied to 001_init.sql
  
  // Note: For simplicity in this environment, I'll inline the migration checking for the first file.
  // In a real app, I'd iterate through the folder.
  
  const initMigrationName = '001_init.sql';
  const migrationApplied = (db.prepare('SELECT count(*) as count FROM migrations WHERE name = ?').get(initMigrationName) as { count: number }).count > 0;

  if (!migrationApplied) {
    // ... (existing code for 001)
    console.log('Applying migration: 001_init.sql');
    try {
      let migrationPath = path.join(__dirname, '../src/main/database/migrations/001_init.sql');
      if (isDev) {
         migrationPath = path.resolve(app.getAppPath(), 'src/main/database/migrations/001_init.sql');
      } else {
         migrationPath = path.join(process.resourcesPath, 'migrations/001_init.sql');
      }

      if (fs.existsSync(migrationPath)) {
        const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
        db.exec(migrationSql);
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(initMigrationName);
        console.log('Migration 001 applied successfully.');
      } else {
         const fallbackPath = 'C:\\rep\\School\\lms\\src\\main\\database\\migrations\\001_init.sql';
         if (fs.existsSync(fallbackPath)) {
             const migrationSql = fs.readFileSync(fallbackPath, 'utf-8');
             db.exec(migrationSql);
             db.prepare('INSERT INTO migrations (name) VALUES (?)').run(initMigrationName);
             console.log('Migration 001 applied successfully (fallback).');
         }
      }
    } catch (err) {
      console.error('Migration 001 failed:', err);
    }
  }

  // Check for 002
    const mig002Name = '002_add_parent_details.sql';
    const mig002Applied = (db.prepare('SELECT count(*) as count FROM migrations WHERE name = ?').get(mig002Name) as { count: number }).count > 0;
    
    if (!mig002Applied) {
        console.log('Applying migration: 002_add_parent_details.sql');
        // ... (implementation omitted for brevity, similar to 001)
        // Note: Assuming the implementation is correct based on the pattern
        // To be safe, I'll copy the robust pattern from 003 below
        try {
            const migFile = '002_add_parent_details.sql';
            let migrationPath = isDev 
                ? path.join(app.getAppPath(), 'src/main/database/migrations', migFile)
                : path.join(process.resourcesPath, 'migrations', migFile);
                
            if (!fs.existsSync(migrationPath)) {
                // Try hardcoded fallback
                migrationPath = `C:\\rep\\School\\lms\\src\\main\\database\\migrations\\${migFile}`;
            }

            if (fs.existsSync(migrationPath)) {
                const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
                db.exec(migrationSql);
                db.prepare('INSERT INTO migrations (name) VALUES (?)').run(mig002Name);
                console.log(`Migration ${migFile} applied successfully.`);
            } else {
                console.warn(`Migration file ${migFile} not found.`);
            }
        } catch (err) {
            console.error('Migration 002 failed:', err);
        }
    }

    // Check for 003
    const mig003Name = '003_add_class_history.sql';
    const mig003Applied = (db.prepare('SELECT count(*) as count FROM migrations WHERE name = ?').get(mig003Name) as { count: number }).count > 0;
    
    if (!mig003Applied) {
        console.log('Applying migration: 003_add_class_history.sql');
        try {
            const migFile = '003_add_class_history.sql';
            let migrationPath = isDev 
                ? path.join(app.getAppPath(), 'src/main/database/migrations', migFile)
                : path.join(process.resourcesPath, 'migrations', migFile);
                
            if (!fs.existsSync(migrationPath)) {
                migrationPath = `C:\\rep\\School\\lms\\src\\main\\database\\migrations\\${migFile}`;
            }

            if (fs.existsSync(migrationPath)) {
                const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
                db.exec(migrationSql);
                db.prepare('INSERT INTO migrations (name) VALUES (?)').run(mig003Name);
                console.log(`Migration ${migFile} applied successfully.`);
            } else {
                console.warn(`Migration file ${migFile} not found.`);
            }
        } catch (err) {
            console.error('Migration 003 failed:', err);
        }
    }
};

runMigrations();

// AUTO-CLEANUP: Remove corrupted students (empty registration_number) on startup
try {
    const deleted = db.prepare("DELETE FROM students WHERE registration_number IS NULL OR registration_number = ''").run();
    if (deleted.changes > 0) {
        console.log(`Cleanup: Removed ${deleted.changes} invalid student records (missing matricule).`);
    }
} catch (e) {
    console.error("Cleanup error:", e);
}

export default db;
