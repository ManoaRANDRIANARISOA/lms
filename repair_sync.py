import sqlite3
import os

def repair_db(db_path):
    if not os.path.exists(db_path):
        print(f"[SKIP] No database found at {db_path}")
        return
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        print(f"\n[REPAIR] Opened {db_path}")

        # 1. Reset last_sync_time
        cur.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('last_sync_time', '\"2020-01-01T00:00:00.000Z\"', CURRENT_TIMESTAMP)")
        print(f"-> last_sync_time reset to 2020. Changes: {cur.rowcount}")

        # 2. Clear error_message from sync_queue where status = 'synced'
        cur.execute("UPDATE sync_queue SET error_message = NULL WHERE status = 'synced' AND error_message IS NOT NULL")
        print(f"-> Cleared stale errors from synced items. Records updated: {cur.rowcount}")

        # 3. Mark skipped items back to pending so they can retry now that schemas might be fixed
        cur.execute("UPDATE sync_queue SET status = 'pending', error_message = NULL WHERE status IN ('skipped', 'error')")
        print(f"-> Re-queued skipped/error items. Records updated: {cur.rowcount}")

        conn.commit()
        conn.close()
        print(f"[DONE] {db_path}")
    except Exception as err:
        print(f"[ERROR] Failed to repair {db_path}: {err}")

repair_db('database.sqlite')
repair_db(os.path.join(os.environ['APPDATA'], 'lms', 'database.sqlite'))
