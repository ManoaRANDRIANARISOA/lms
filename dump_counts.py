import sqlite3
import os
import json

db_dev = 'database.sqlite'
db_inst = os.path.join(os.environ['APPDATA'], 'lms', 'database.sqlite')

tables = [
  'students', 'student_fees', 'student_payments', 'personnel', 'time_tracking',
  'daily_attendance', 'personnel_absences', 'salary_advances', 'custom_deductions',
  'cash_journal', 'subjects', 'grades', 'class_subjects', 'parent_events',
  'event_payments', 'bus_attendance', 'canteen_attendance', 'users'
]

counts = {}
for t in tables:
    counts[t] = {'dev': 0, 'inst': 0}

try:
    c = sqlite3.connect(db_dev)
    cur = c.cursor()
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            counts[t]['dev'] = cur.fetchone()[0]
        except: pass
    c.close()
except: pass

try:
    c = sqlite3.connect(db_inst)
    cur = c.cursor()
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            counts[t]['inst'] = cur.fetchone()[0]
        except: pass
    c.close()
except: pass

print(json.dumps(counts))
