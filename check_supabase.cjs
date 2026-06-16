const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkSchema() {
  const checks = [
    { table: 'student_fees', select: 'id, uniform_items_purchased' },
    { table: 'grades', select: 'id, grade_journalier, grade_exam' },
    { table: 'personnel', select: 'id, cnaps_amount, irsa_amount' },
    { table: 'students', select: 'id, gender' },
    { table: 'assessments', select: 'id, name, school_year' }
  ];

  console.log('--- VÉRIFICATION DU SCHÉMA SUPABASE ---');
  for (const check of checks) {
    const { error } = await supabase.from(check.table).select(check.select).limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log(`❌ Table manquante : ${check.table}`);
      } else if (error.code === 'PGRST200') {
        console.log(`❌ Colonne manquante dans ${check.table} : ${error.message}`);
      } else {
        console.log(`❌ Erreur sur ${check.table} : ${error.message} (Code: ${error.code})`);
      }
    } else {
      console.log(`✅ Table et colonnes OK : ${check.table}`);
    }
  }
}

checkSchema().catch(console.error);
