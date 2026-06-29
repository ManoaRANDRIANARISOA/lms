import sqlite3
from datetime import datetime

db_path = "database.sqlite"

def get_school_year(date_str):
    if not date_str:
        return None
    try:
        # e.g., "2025-10-15"
        d = datetime.strptime(date_str, "%Y-%m-%d")
        year = d.year
        month = d.month
        if month >= 8:
            return f"{year}-{year + 1}"
        else:
            return f"{year - 1}-{year}"
    except Exception as e:
        return None

def main():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT id, event_date, school_year FROM parent_events")
    events = cursor.fetchall()

    updated = 0
    for event_id, event_date, current_year in events:
        expected_year = get_school_year(event_date)
        if expected_year and expected_year != current_year:
            # We assume parent_events has sync_status and version (like all other synced tables)
            # Let's check if they exist to avoid crashes
            cursor.execute("PRAGMA table_info(parent_events)")
            columns = [info[1] for info in cursor.fetchall()]
            
            if 'sync_status' in columns and 'version' in columns:
                cursor.execute(
                    "UPDATE parent_events SET school_year = ?, sync_status = 'pending', version = version + 1 WHERE id = ?",
                    (expected_year, event_id)
                )
            else:
                cursor.execute(
                    "UPDATE parent_events SET school_year = ? WHERE id = ?",
                    (expected_year, event_id)
                )
            updated += 1
            print(f"Updated event {event_id}: {current_year} -> {expected_year}")

    conn.commit()
    conn.close()
    print(f"Fixed {updated} events in the database.")

if __name__ == "__main__":
    main()
