import sqlite3
import json

db_path = "database.sqlite"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# We need to trigger a sync for the student_fees that were affected by the bug.
# Since we already set them to '[]' locally but didn't trigger a sync, we'll just queue all '[]' for sync just to be sure.
# Actually, it's safe to just update sync_status='pending' for all student_fees where uniform_items_purchased = '[]' OR we can just add an entry to sync_queue if that table exists.
# Let's check if sync_queue table exists.
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue'")
has_sync_queue = cursor.fetchone() is not None

if has_sync_queue:
    # Just set sync_status = 'pending' on the student_fees table directly, the sync service will pick it up or we can insert into sync_queue
    cursor.execute("UPDATE student_fees SET sync_status = 'pending', version = version + 1 WHERE uniform_items_purchased = '[]'")
    print(f"Queued {cursor.rowcount} fee records for sync to fix Supabase.")
else:
    print("No sync_queue table found.")

conn.commit()
conn.close()
