require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

async function checkSchema(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.error(`Error for ${table}:`, error.message)
  } else {
    if (data.length > 0) {
      console.log(`--- ${table} ---`)
      console.log(Object.keys(data[0]).join(', '))
    } else {
      console.log(`--- ${table} (Empty) ---`)
      // To get columns of empty table we can use a trick: insert a dummy or just use REST options,
      // but simple way: select with no rows might still not give keys if data array is empty.
    }
  }
}

async function run() {
  await checkSchema('salary_advances')
  await checkSchema('student_payments')
  await checkSchema('class_subjects')
  await checkSchema('grades')
}
run()
