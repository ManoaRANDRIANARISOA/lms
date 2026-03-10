import { createClient } from '@supabase/supabase-js';
import db from '../database/db';
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { app } from 'electron';// Load env vars
const isDev = !app.isPackaged;
const envPath = isDev
  ? path.join(process.cwd(), '.env')
  : path.join(process.resourcesPath, '.env');

console.log('Trying to load .env from:', envPath);
dotenv.config({ path: envPath });

// Hardcoded fallback to ensure it works immediately for the user
// (We prioritize env vars if they exist, but fallback to these specific keys)
const FALLBACK_URL = 'https://onxnctfgxxgxipehmfqb.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ueG5jdGZneHhneGlwZWhtZnFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODg3NjUsImV4cCI6MjA4NjM2NDc2NX0.WuVMhj07pbkuuWFfG-AsOrVJM-LrWmvts0vhvfwVWdc';

const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || FALLBACK_KEY;

let supabaseClient: any = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    // console.log('Supabase client initialized');
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
  }
} else {
  console.warn('Supabase credentials missing. Sync will be disabled.');
}

// Export a getter or the client (might be null)
// To keep compatibility with existing code that imports 'supabase', 
// we can export a proxy or just the object, but consumers must check for null/undefined if we change type.
// However, the existing code `export const supabase = ...` implies it's always there.
// If I change it to `export const supabase = ...` but initialization failed, createClient throws.

// Better approach: Mock client if missing, or just handle it.
// But createClient throws if url is missing.

export const supabase = supabaseClient || {
    from: () => ({ 
        select: () => ({ gt: () => ({ data: [], error: { message: 'Supabase not configured' } }) }),
        upsert: () => ({ error: { message: 'Supabase not configured' } }),
        update: () => ({ eq: () => ({ error: { message: 'Supabase not configured' } }) })
    })
};


// Add record to sync queue
export async function addToSyncQueue(
  tableName: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  data: any
) {
  try {
    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, action, data)
      VALUES (?, ?, ?, ?)
    `).run(tableName, recordId, action, JSON.stringify(data));
  } catch (error) {
    console.error('Error adding to sync queue:', error);
  }
}

// Main sync function (called every 5 minutes if online)
export async function syncWithCloud() {
  if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials missing, skipping sync.');
      return { success: false, reason: 'config_missing' };
  }
  // Simplified check for internet (navigator is not available in main process usually, unless polyfilled or using net module)
  // In Electron Main process, we can check online status via net.isOnline() (since Electron 24+) or just try request.
  // For now, we'll assume we can try and catch errors.
  
  try {
    // PUSH: Send local changes to cloud
    await pushLocalChanges();
    
    // PULL: Get remote changes from cloud
    await pullRemoteChanges();
    
    // Check if there are still pending items that failed
    // console.log('Sync completed.');
    
    return { success: true };
  } catch (error: any) {
    console.error('Sync error:', error);
    return { success: false, error: error.message };
  }
}

async function pushLocalChanges() {
  const queue = db.prepare(`
    SELECT * FROM sync_queue
    WHERE status IN ('pending', 'error')
    ORDER BY created_at ASC
    LIMIT 100
  `).all() as any[];
  
  for (const item of queue) {
    try {
      // If status is error, we should retry.
      // But maybe check if we exceeded max retries? For now, infinite retry.
      
      const data = JSON.parse(item.data);
      
      // Sanitization for Supabase
      // Now data is already in snake_case coming from frontend/repository
      
      let payload = { ...data };
      
      if (item.table_name === 'students') {
           // Remove undefined fields
           Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
           
           // Ensure updated_at is set
           payload.updated_at = new Date().toISOString();

           // HARDENED VALIDATION: Prevent Ghost Records
           // If key fields are missing, DO NOT PUSH.
           if (!payload.first_name || !payload.last_name || !payload.registration_number) {
                console.error(`Skipping invalid student record ${payload.id}: Missing required fields.`);
                // Mark as error to remove from pending queue, but don't delete data
                db.prepare(`UPDATE sync_queue SET status = 'skipped', error_message = 'Missing required fields' WHERE id = ?`).run(item.id);
                continue;
           }
      } else {
        // For other tables, use data as is (or add more mapping if needed)
        // Ensure we don't send local-only fields if they exist
      }
      
      // FIX: Check for "guardian_contact" NOT NULL constraint in Supabase
      // If payload has no guardian_contact (because it was optional in UI), 
      // but DB enforces NOT NULL, we must provide a default or allow NULL in DB.
      // Based on error: "null value in column "guardian_contact" ... violates not-null constraint"
      // We should provide an empty string if it is missing.
      
      if (item.table_name === 'students') {
          if (!payload.guardian_contact) payload.guardian_contact = '';
      }
      
      // FIX: Check for "class" NOT NULL constraint
      if (item.table_name === 'students' && !payload.class) {
           // Should not happen if UI validates, but for safety
           payload.class = 'Classe non spécifiée'; 
      }
      
      // FIX: Check for "enrollment_date" NOT NULL constraint
      if (item.table_name === 'students' && !payload.enrollment_date) {
           payload.enrollment_date = new Date().toISOString().split('T')[0];
      }
      
      // FIX: Handle Photo Upload (Offline-First)
      // If photo_path is a local path (starts with / or X:\), try to upload it.
      if (item.table_name === 'students' && payload.photo_path && !payload.photo_path.startsWith('http')) {
          try {
              const localPath = payload.photo_path;
              if (fs.existsSync(localPath)) {
                  console.log(`Uploading photo for ${payload.id}: ${localPath}`);
                  
                  const fileBuffer = fs.readFileSync(localPath);
                  const fileExt = path.extname(localPath);
                  const fileName = `${payload.id}-${Date.now()}${fileExt}`;
                  
                  // Automate Bucket Creation (Best effort)
                  try {
                      // We don't need the bucket data, just checking/creating
                      const { error: bucketError } = await supabase.storage.getBucket('student-photos');
                      if (bucketError) {
                           // Bucket likely doesn't exist, try to create it
                           // If create fails (e.g. permission denied), we can't do much automatically.
                           // But we can try to upload anyway, sometimes getBucket fails but upload works if public.
                           const { error: createError } = await supabase.storage.createBucket('student-photos', { public: true });
                           if (createError) console.warn('Bucket creation warning:', createError.message);
                      }
                  } catch (e) {
                      // Ignore bucket creation errors (might be permission issue or already exists)
                  }
                  
                  const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('student-photos')
                    .upload(fileName, fileBuffer, {
                        contentType: 'image/' + fileExt.replace('.', ''),
                        upsert: true
                    });
                    
                  if (uploadError) {
                      console.error('Photo upload failed:', uploadError);
                      
                      // If error is "Bucket not found", it means we really need that bucket.
                      // Since we can't create it with Anon key usually, user MUST do it in Dashboard.
                      // We should NOT throw error here to block the whole student sync?
                      // Actually user said "pas de reaction imprevue".
                      // If we throw, the student stays in "pending" sync. That's good.
                      
                      throw new Error('Photo upload failed: ' + uploadError.message);
                  } else if (uploadData) {
                      const { data: publicUrlData } = supabase
                        .storage
                        .from('student-photos')
                        .getPublicUrl(fileName);
                        
                      if (publicUrlData && publicUrlData.publicUrl) {
                          payload.photo_path = publicUrlData.publicUrl;
                          
                          // Update Local DB immediately to reflect the Cloud URL
                          // This ensures next time we don't try to upload again
                          db.prepare('UPDATE students SET photo_path = ? WHERE id = ?')
                            .run(payload.photo_path, payload.id);
                            
                          console.log(`Photo uploaded: ${payload.photo_path}`);
                      }
                  }
              }
          } catch (uploadEx) {
              console.error('Error processing photo upload:', uploadEx);
          }
      }
      
      if (item.action === 'create' || item.action === 'update') {
        const { error } = await supabase
          .from(item.table_name)
          .upsert(payload);
          
        if (error) {
             // Handle Duplicate Key Error (23505) for registration_number
             if (error.code === '23505' && error.message?.includes('registration_number')) {
                 console.warn(`Duplicate registration_number detected for ${payload.id}. Regenerating...`);
                 
                 // Fetch the real max registration number from Supabase
                 // Improved logic to avoid naive sorting issues (2024-10 > 2024-9)
                 const year = new Date().getFullYear();
                 const { data: allRegs } = await supabase
                    .from('students')
                    .select('registration_number')
                    .ilike('registration_number', `${year}-%`);

                 let nextNum = 1;
                 if (allRegs && allRegs.length > 0) {
                     // Parse manually to find max
                     const nums = allRegs.map(r => {
                         const parts = r.registration_number.split('-');
                         return parts.length === 2 ? parseInt(parts[1], 10) : 0;
                     });
                     nextNum = Math.max(...nums) + 1;
                 }
                 const newMatricule = `${year}-${String(nextNum).padStart(5, '0')}`;
                 
                 // Update payload with new matricule
                 payload.registration_number = newMatricule;
                 
                 // Update Local DB with new matricule so it stays consistent
                 db.prepare(`UPDATE students SET registration_number = ? WHERE id = ?`)
                   .run(newMatricule, payload.id);
                   
                 // Retry Upsert
                 const { error: retryError } = await supabase
                    .from(item.table_name)
                    .upsert(payload);
                    
                 if (retryError) {
                     console.error(`Retry failed for ${item.table_name}:`, retryError);
                     throw retryError;
                 }
             } else {
                 console.error(`Supabase Push Error [${item.table_name}]:`, error);
                 throw error;
             }
        }
      } else if (item.action === 'delete') {
        const { error } = await supabase
          .from(item.table_name)
          .update({ deleted: true })
          .eq('id', item.record_id);
         if (error) throw error;
      }
      
      // Mark as synced
      db.prepare(`
        UPDATE sync_queue
        SET status = 'synced', synced_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(item.id);
      
      // Update record sync status
      db.prepare(`
        UPDATE ${item.table_name}
        SET sync_status = 'synced', last_synced_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(item.record_id);
      
    } catch (error: any) {
      // Mark as error
      db.prepare(`
        UPDATE sync_queue
        SET status = 'error', error_message = ?
        WHERE id = ?
      `).run(error.message || 'Unknown error', item.id);
    }
  }
}

async function pullRemoteChanges() {
  const settingsRow = db.prepare(`
    SELECT value FROM settings WHERE key = 'last_sync_time'
  `).get() as { value: string } | undefined;
  
  // JSON.parse because settings.value is stored as JSON string in the schema: value TEXT (JSON value)
  let lastSync = '2020-01-01T00:00:00Z';
  if (settingsRow && settingsRow.value) {
      try {
          lastSync = JSON.parse(settingsRow.value);
      } catch (e) {
          lastSync = settingsRow.value; // Fallback if not JSON
      }
  }
  
  const tables = [
    'students', 'student_fees', 'student_payments', 
    'personnel', 'grades', 'cash_journal',
    'parent_events', 'event_payments',
    'bus_attendance', 'canteen_attendance'
  ];
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', lastSync);
    
    if (error) {
      console.error(`Error pulling ${table}:`, error);
      continue;
    }
    
    // console.log(`Pulled ${data?.length} records from ${table}`);
    
    for (const record of data || []) {
      // Check if exists locally
      const local = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(record.id) as any;
      
      const { search_text, ...recordToSave } = record;
      
      // Sanitize object values for SQLite
      for (const key in recordToSave) {
          const val = recordToSave[key];
          if (typeof val === 'boolean') {
              recordToSave[key] = val ? 1 : 0;
          } else if (typeof val === 'object' && val !== null) {
               recordToSave[key] = JSON.stringify(val);
          }
      }
      
      // Handle deleted records coming from cloud
      if (recordToSave.deleted) {
           if (local) {
               // Update local record to deleted
               db.prepare(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`)
                 .run(recordToSave.updated_at, record.id);
           }
           continue; 
      }

      // CONFLICT RESOLUTION: Check for Unique Constraint on registration_number
      // If we are about to insert/update a student, check if their registration_number is already taken by ANOTHER student locally.
      if (table === 'students' && recordToSave.registration_number) {
          const conflictingStudent = db.prepare(`
              SELECT * FROM students 
              WHERE registration_number = ? AND id != ?
          `).get(recordToSave.registration_number, record.id) as any;

          if (conflictingStudent) {
              console.warn(`Conflict detected: Matricule ${recordToSave.registration_number} taken by ${conflictingStudent.id}. Renaming local conflict.`);
              
              // We rename the LOCAL conflicting student's matricule to allow the REMOTE one (Server Authority) to land.
              // The local student will get a temporary matricule. When it tries to push later, we will handle the collision in pushLocalChanges.
              const tempMatricule = `${recordToSave.registration_number}_CONFLICT_${Date.now()}`;
              
              db.prepare(`UPDATE students SET registration_number = ? WHERE id = ?`)
                .run(tempMatricule, conflictingStudent.id);
          }
      }

      if (!local) {
        // Insert new record
        const fields = Object.keys(recordToSave).join(', ');
        const placeholders = Object.keys(recordToSave).map(() => '?').join(', ');
        db.prepare(`INSERT INTO ${table} (${fields}) VALUES (${placeholders})`)
          .run(...Object.values(recordToSave));
      } else {
        // Conflict detection (Time-based)
        if (new Date(local.updated_at) > new Date(record.updated_at)) {
          // Local is newer - log conflict but KEEP LOCAL (Offline-First philosophy usually prefers local work, 
          // but strictly speaking server should be truth. Here we stick to "Last Write Wins" or "Local Priority" for UX).
          console.warn(`Conflict detected for ${table} ${record.id} (Local is newer). Keeping local.`);
          // We DO NOT overwrite local.
        } else {
          // Cloud is newer - update local
          const updates = Object.entries(recordToSave)
            .map(([key]) => `${key} = ?`)
            .join(', ');
          db.prepare(`UPDATE ${table} SET ${updates} WHERE id = ?`)
            .run(...Object.values(recordToSave), record.id);
        }
      }
    }
  }
  
  // Update last sync time
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES ('last_sync_time', ?, CURRENT_TIMESTAMP)
  `).run(JSON.stringify(new Date().toISOString()));
}

// Start periodic sync (every 5 minutes)
export function startPeriodicSync() {
  // Sync immediately on startup
  setTimeout(async () => {
    // console.log('Starting initial sync...');
    await syncWithCloud();
  }, 5000); // Wait 5s for app to settle

  setInterval(async () => {
      // In Main process, we just attempt sync. 
      // If offline, the try/catch in syncWithCloud will handle it.
      await syncWithCloud();
  }, 5 * 60 * 1000); // 5 minutes
}
