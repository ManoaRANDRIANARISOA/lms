import db from '../db';

export class SettingsRepository {
  static get(key: string): any {
    try {
      const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string };
      return result ? JSON.parse(result.value) : null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  static getAll(): Record<string, any> {
    try {
      const results = db.prepare('SELECT key, value FROM settings').all() as { key: string, value: string }[];
      const settings: Record<string, any> = {};
      results.forEach(row => {
        settings[row.key] = JSON.parse(row.value);
      });
      return settings;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  }

  static set(key: string, value: any): boolean {
    try {
      const jsonValue = JSON.stringify(value);
      
      const stmt = db.prepare(`
        INSERT INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value, 
        updated_at = CURRENT_TIMESTAMP
      `);
      
      stmt.run(key, jsonValue);
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }
}
