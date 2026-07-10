import sqlite3
import os

def get_last_sync(db):
    try:
        conn = sqlite3.connect(db)
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key='last_sync_time'")
        res = cur.fetchone()
        print(f"{db} -> {res}")
        conn.close()
    except Exception as e:
        print(e)

get_last_sync('database.sqlite')
get_last_sync(os.path.join(os.environ['APPDATA'], 'lms', 'database.sqlite'))
