require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const { execSync } = require('child_process')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
const localData = JSON.parse(execSync('python dump_counts.py').toString())

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
    let supCount = 'Error'
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (!error) supCount = count

    console.log(`| ${table} | ${localData[table].dev} | ${localData[table].inst} | ${supCount} |`)
  }
}

compareAll()
