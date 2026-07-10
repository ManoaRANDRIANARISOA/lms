import sqlite3

def check_schemas():
    conn = sqlite3.connect('database.sqlite')
    cur = conn.cursor()
    cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('salary_advances', 'student_payments', 'class_subjects', 'grades')")
    for row in cur.fetchall():
        print(f"--- {row[0]} ---")
        print(row[1])
    conn.close()

if __name__ == '__main__':
    check_schemas()
