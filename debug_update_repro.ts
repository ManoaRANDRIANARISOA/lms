
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Setup DB path - manually pointing to the file found by Glob
const dbPath = path.join(process.cwd(), 'database.sqlite');
console.log('Opening DB at:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found at:', dbPath);
    process.exit(1);
}

const db = new Database(dbPath);

// 1. Check Settings
try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('school_year') as { value: string };
    console.log('Raw school_year setting:', setting);
    if (setting) {
        try {
            // Check if it's a JSON string or raw string
            // If it's "2025-2026" (with quotes), JSON.parse works.
            // If it's 2025-2026 (no quotes), JSON.parse fails.
            console.log('Parsed school_year:', JSON.parse(setting.value));
        } catch (e) {
            console.log('JSON parse failed, value might be raw string:', setting.value);
        }
    } else {
        console.log('Setting school_year NOT FOUND');
    }
} catch (e) {
    console.error('Error reading settings:', e);
}

// 2. Create a test student if not exists
const testStudentId = 'test-update-repro-id';
try {
    const existing = db.prepare('SELECT id, class FROM students WHERE id = ?').get(testStudentId);
    if (!existing) {
        console.log('Creating test student...');
        db.prepare(`
            INSERT INTO students (id, first_name, last_name, class, enrollment_date)
            VALUES (?, 'Test', 'Repro', '6ème', '2025-01-01')
        `).run(testStudentId);
    } else {
        console.log('Test student exists:', existing);
    }
} catch (e) {
    console.error('Error creating/checking student:', e);
}

// 3. Simulate Update Logic
console.log('--- Simulating Update Logic ---');

const schoolYearRaw = db.prepare('SELECT value FROM settings WHERE key = ?').get('school_year') as { value: string };
let schoolYear = '2025-2026'; // Default

if (schoolYearRaw) {
    try {
        schoolYear = JSON.parse(schoolYearRaw.value);
    } catch (e) {
        schoolYear = schoolYearRaw.value;
    }
}
schoolYear = schoolYear.replace(/['"]/g, '').trim();
console.log('Target School Year:', schoolYear);

// Check for existing fee record
const existingFee = db.prepare('SELECT * FROM student_fees WHERE student_id = ? AND school_year = ?').get(testStudentId, schoolYear);
console.log('Existing fee record:', existingFee);

// Simulate the UPDATE payload
const updates = {
    class: '5ème',
    uniform_apron_purchased: true
};

const feeUpdates: any = {};
if (updates.uniform_apron_purchased) feeUpdates.uniform_apron_purchased = true;

if (existingFee) {
    console.log('Case: UPDATE existing fee record');
    // ...
} else {
    console.log('Case: CREATE new fee record');
    
    // Simulate creation logic
    // const feeId = 'test-fee-id-' + Date.now();
    // ...
    // Verify dynamic SQL construction
    const insertFields = ['id', 'student_id', 'school_year', 'tuition_level', 'monthly_tuition', 'class_name', ...Object.keys(feeUpdates)];
    const placeholders = insertFields.map(() => '?').join(', ');
    
    console.log('Insert Query:', `INSERT INTO student_fees (${insertFields.join(', ')}) VALUES (${placeholders})`);
    console.log('Values:', [
        'new-fee-id', testStudentId, schoolYear, 'primary', 100000, updates.class,
        ...Object.values(feeUpdates).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v)
    ]);
}
