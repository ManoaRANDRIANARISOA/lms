const Database = require('better-sqlite3')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const devDb = new Database('database.sqlite')
const installedDbPath = path.join(process.env.APPDATA, 'lms', 'database.sqlite')
let installedDb = null
try {
  installedDb = new Database(installedDbPath)
} catch (e) {
  console.log('No installed DB found')
}

const SYNCABLE_TABLES = [
  'students',
  'student_fees',
  'student_payments',
  'personnel',
  'time_tracking',
  'daily_attendance',
  'personnel_absences',
  'salary_advances',
  'custom_deductions',
  'cash_journal',
  'subjects',
  'grades',
  'class_subjects',
  'parent_events',
  'event_payments',
  'bus_attendance',
  'canteen_attendance',
  'users'
]

async function compareAll() {
  console.log('| Table | Dev DB | Installed DB | Supabase |')
  console.log('|---|---|---|---|')
  for (const table of SYNCABLE_TABLES) {
    let devCount = 0
    try {
      devCount = devDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c
    } catch (e) {}

    let instCount = 0
    if (installedDb) {
      try {
        instCount = installedDb.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c
      } catch (e) {}
    }

    let supCount = 'Error'
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (!error) supCount = count

    console.log(`| ${table} | ${devCount} | ${instCount} | ${supCount} |`)
  }
}

compareAll()
