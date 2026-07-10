import sqlite3
import os

def check_queue(db_path, name):
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute('SELECT action, table_name, status, count(*) FROM sync_queue GROUP BY action, table_name, status')
        print(f"--- {name} SYNC_QUEUE ---")
        for row in cur.fetchall():
            print(f"Action: {row[0]}, Table: {row[1]}, Status: {row[2]}, Count: {row[3]}")
            
        cur.execute('SELECT error_message, count(*) FROM sync_queue WHERE error_message IS NOT NULL GROUP BY error_message')
        errors = cur.fetchall()
        if errors:
            print(f"--- {name} ERRORS ---")
            for row in errors:
                print(f"Error: {row[0]} | Count: {row[1]}")
        conn.close()
    except Exception as e:
        print(f"Error checking {name}: {e}")

check_queue('database.sqlite', 'DEV')
check_queue(os.path.join(os.environ['APPDATA'], 'lms', 'database.sqlite'), 'INSTALLED')
