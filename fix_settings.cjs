const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

const currentYearSetting = db.prepare("SELECT value FROM settings WHERE key = 'current_year'").get();
if (currentYearSetting) {
  db.prepare("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'school_year'").run(currentYearSetting.value);
  console.log('Successfully updated school_year to match current_year:', currentYearSetting.value);
}

process.exit(0);
