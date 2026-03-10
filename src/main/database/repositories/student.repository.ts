import db from '../db';
import { addToSyncQueue } from '../../services/sync.service';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class StudentRepository {
  
  private static feeFields = [
      'bus_subscribed', 'bus_route', 'canteen_subscribed', 'canteen_days_per_week', 'canteen_days',
      'uniform_tshirt_purchased', 'uniform_apron_purchased', 'uniform_shorts_purchased', 'uniform_badge_purchased',
      'fram_paid_by_parent'
  ];
  
  private static studentAllowedFields = [
      'first_name', 'last_name', 'date_of_birth', 'place_of_birth', 'class', 
      'enrollment_date', 'previous_school', 'father_name', 'mother_name', 'guardian_name', 
      'father_contact', 'mother_contact', 'guardian_contact', 'father_profession', 'mother_profession', 'guardian_profession', 
      'address', 'photo_path', 'siblings', 'email'
  ];

  private static handlePhoto(sourcePath: string): string {
    if (!sourcePath) return '';
    if (sourcePath.startsWith('http')) return sourcePath; // Keep remote URLs

    try {
        const userDataPath = app.getPath('userData');
        const photosDir = path.join(userDataPath, 'photos');
        
        if (!fs.existsSync(photosDir)) {
            fs.mkdirSync(photosDir, { recursive: true });
        }

        // Check if already in photos dir
        // Normalize paths for comparison
        const normalizedSource = path.normalize(sourcePath);
        const normalizedPhotosDir = path.normalize(photosDir);

        if (normalizedSource.startsWith(normalizedPhotosDir)) return sourcePath;

        // Generate new filename
        const ext = path.extname(sourcePath) || '.jpg';
        const newFilename = `${uuidv4()}${ext}`;
        const destPath = path.join(photosDir, newFilename);

        fs.copyFileSync(sourcePath, destPath);
        return destPath;
    } catch (error) {
        console.error('Error copying photo:', error);
        return sourcePath; // Fallback
    }
  }

  static generateRegistrationNumber(): string {
    const year = new Date().getFullYear();
    // Better: Get MAX number for current year
    const result = db.prepare(`
      SELECT MAX(CAST(SUBSTR(registration_number, 6) AS INTEGER)) as max_num 
      FROM students 
      WHERE registration_number LIKE ?
    `).get(`${year}-%`) as { max_num: number | null };
    
    const nextNum = (result.max_num || 0) + 1;
    return `${year}-${String(nextNum).padStart(5, '0')}`;
  }

  static getSetting(key: string): string {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string };
    if (!result) return '';
    
    try {
        const parsed = JSON.parse(result.value);
        return typeof parsed === 'string' ? parsed.trim() : String(parsed).trim();
    } catch (e) {
        // Fallback for raw strings
        return result.value.replace(/['"]/g, '').trim();
    }
  }

  static determineTuitionLevel(className: string): string {
    const lowerClass = className.toLowerCase();
    if (lowerClass.includes('maternelle') || lowerClass.includes('ps') || lowerClass.includes('ms') || lowerClass.includes('gs')) return 'preschool';
    if (lowerClass.includes('cp') || lowerClass.includes('ce') || lowerClass.includes('cm') || lowerClass.includes('11') || lowerClass.includes('10') || lowerClass.includes('9') || lowerClass.includes('8') || lowerClass.includes('7')) return 'primary';
    if (lowerClass.includes('6') || lowerClass.includes('5') || lowerClass.includes('4') || lowerClass.includes('3')) return 'middle';
    if (lowerClass.includes('2') || lowerClass.includes('1') || lowerClass.includes('term')) return 'high';
    return 'primary'; // Default
  }

  // Helper to handle bidirectional sibling updates
    private static updateSiblingRelations(studentId: string, newSiblingIds: string[], oldSiblingIds: string[] = []) {
        const added = newSiblingIds.filter(id => !oldSiblingIds.includes(id));
        const removed = oldSiblingIds.filter(id => !newSiblingIds.includes(id));

        // Add current student to new siblings
        added.forEach(siblingId => {
            const sibling = db.prepare('SELECT siblings FROM students WHERE id = ?').get(siblingId) as { siblings: string };
            if (sibling) {
                const siblingsList = sibling.siblings ? JSON.parse(sibling.siblings) : [];
                if (!siblingsList.includes(studentId)) {
                    siblingsList.push(studentId);
                    const newSiblingsJson = JSON.stringify(siblingsList);
                    
                    db.prepare('UPDATE students SET siblings = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = "pending" WHERE id = ?')
                      .run(newSiblingsJson, siblingId);
                      
                    addToSyncQueue('students', siblingId, 'update', { siblings: newSiblingsJson });
                }
            }
        });

        // Remove current student from removed siblings
        removed.forEach(siblingId => {
            const sibling = db.prepare('SELECT siblings FROM students WHERE id = ?').get(siblingId) as { siblings: string };
            if (sibling) {
                const siblingsList = sibling.siblings ? JSON.parse(sibling.siblings) : [];
                const index = siblingsList.indexOf(studentId);
                if (index !== -1) {
                    siblingsList.splice(index, 1);
                    const newSiblingsJson = JSON.stringify(siblingsList);
                    
                    db.prepare('UPDATE students SET siblings = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = "pending" WHERE id = ?')
                      .run(newSiblingsJson, siblingId);
                      
                    addToSyncQueue('students', siblingId, 'update', { siblings: newSiblingsJson });
                }
            }
        });
    }

    private static normalizeClassName(className: string): string {
        if (!className) return '';
        return className.trim().replace(/\s+/g, ' '); // Trim and single spaces
    }

    static create(studentData: any) {
    // Handle photo path before transaction
    if (studentData.photo_path) {
        studentData.photo_path = this.handlePhoto(studentData.photo_path);
    }

    const createTransaction = db.transaction((data) => {
        const id = uuidv4();
        // Ensure registration number is generated if not provided (it shouldn't be provided by UI usually)
        const registration_number = this.generateRegistrationNumber();
        
        // Extract fee fields
        const feeData: any = {};
        const studentDataClean: any = {};
        
        Object.keys(data).forEach(key => {
            if (StudentRepository.feeFields.includes(key)) {
                feeData[key] = data[key];
            } else if (StudentRepository.studentAllowedFields.includes(key)) {
                studentDataClean[key] = data[key];
            }
        });

        // Sanitize class to ensure it's not null (database constraint)
        studentDataClean.class = this.normalizeClassName(studentDataClean.class);
        
        // Sanitize guardian_contact to ensure it's not null (database constraint)
        studentDataClean.guardian_contact = studentDataClean.guardian_contact || '';

        const stmt = db.prepare(`
            INSERT INTO students (
                id, first_name, last_name, date_of_birth, place_of_birth,
                class, registration_number, enrollment_date, 
                father_name, mother_name, guardian_name, 
                father_contact, mother_contact, guardian_contact,
                father_profession, mother_profession, guardian_profession,
                address, previous_school, photo_path, siblings
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        // Handle siblings as JSON string
        const siblingsArray = studentDataClean.siblings || [];
        const siblingsJson = JSON.stringify(siblingsArray);

        stmt.run(
            id, studentDataClean.first_name, studentDataClean.last_name,
            studentDataClean.date_of_birth, studentDataClean.place_of_birth,
            studentDataClean.class, registration_number,
            studentDataClean.enrollment_date, 
            studentDataClean.father_name, studentDataClean.mother_name, studentDataClean.guardian_name,
            studentDataClean.father_contact, studentDataClean.mother_contact, studentDataClean.guardian_contact,
            studentDataClean.father_profession, studentDataClean.mother_profession, studentDataClean.guardian_profession,
            studentDataClean.address, studentDataClean.previous_school, studentDataClean.photo_path, siblingsJson
        );
        
        // Update bidirectional siblings
        this.updateSiblingRelations(id, siblingsArray, []);

        // Initialize Student Fees for current year (Only if class is provided)
        if (studentDataClean.class) {
            let schoolYear = this.getSetting('school_year') || '2025-2026';
            schoolYear = schoolYear.replace(/['"]/g, '').trim();
            const level = this.determineTuitionLevel(studentDataClean.class);
            const tuitionFee = parseFloat(this.getSetting(`tuition_${level}`) || '0');
            
            const feeId = uuidv4();
            db.prepare(`
                INSERT INTO student_fees (
                    id, student_id, school_year, tuition_level, monthly_tuition, class_name,
                    bus_subscribed, bus_route, 
                    canteen_subscribed, canteen_days_per_week,
                    uniform_tshirt_purchased, uniform_apron_purchased, uniform_shorts_purchased, uniform_badge_purchased,
                    fram_paid_by_parent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                feeId, id, schoolYear, level, tuitionFee, studentDataClean.class,
                feeData.bus_subscribed ? 1 : 0, feeData.bus_route || null,
                feeData.canteen_subscribed ? 1 : 0, feeData.canteen_days_per_week || 0,
                feeData.uniform_tshirt_purchased ? 1 : 0, feeData.uniform_apron_purchased ? 1 : 0, feeData.uniform_shorts_purchased ? 1 : 0, feeData.uniform_badge_purchased ? 1 : 0,
                feeData.fram_paid_by_parent ? 1 : 0
            );

            addToSyncQueue('student_fees', feeId, 'create', { 
                id: feeId, student_id: id, school_year: schoolYear, 
                tuition_level: level, monthly_tuition: tuitionFee, class_name: studentDataClean.class,
                ...feeData
            });
        }

        // Add to sync queue
        addToSyncQueue('students', id, 'create', { ...studentDataClean, id, registration_number, siblings: siblingsJson });

        return { success: true, id, registration_number };
    });

    try {
        return createTransaction(studentData);
    } catch (error: any) {
      console.error('Error creating student:', error);
      return { success: false, error: error.message };
    }
  }

  static list(filters: any = {}) {
    const { search, class: className, limit = 50, offset = 0 } = filters;
    
    let query = 'SELECT * FROM students WHERE deleted = 0';
    const params: any[] = [];
    
    if (className) {
        query += ' AND class = ?';
        params.push(className);
    }
    
    if (search) {
        // Use generated column if available, or manual concat
        query += ' AND search_text LIKE ?';
        params.push(`%${search.toLowerCase()}%`);
    }
    
    query += ' ORDER BY last_name, first_name LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const students = db.prepare(query).all(...params).map((s: any) => ({
        ...s,
        siblings: s.siblings ? JSON.parse(s.siblings) : []
    }));
    
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total').split('ORDER BY')[0];
    const countResult = db.prepare(countQuery).get(...params.slice(0, -2)) as { total: number };
    
    return { students, total: countResult.total };
  }

  static getById(id: string) {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
    if (!student) return null;
    
    student.siblings = student.siblings ? JSON.parse(student.siblings) : [];

    const allFees = db.prepare('SELECT * FROM student_fees WHERE student_id = ? ORDER BY school_year DESC').all(id);
    console.log(`Getting fees for student ${id}, found ${allFees.length} records`);
    const schoolYear = this.getSetting('school_year') || '2025-2026';
    console.log(`Current school year setting: ${schoolYear}`);
    
    // valid fees for current year
    const fees: any = allFees.find((f: any) => {
        const dbYear = f.school_year.replace(/['"]/g, '').trim();
        const targetYear = schoolYear.replace(/['"]/g, '').trim();
        return dbYear === targetYear;
    });
    
    // SELF-HEALING: If fees exist but class_name is null, update it with student's class
    if (fees && !fees.class_name && student.class) {
        console.log(`Self-healing: Updating missing class_name for fee record ${fees.id} to ${student.class}`);
        db.prepare('UPDATE student_fees SET class_name = ? WHERE id = ?').run(student.class, fees.id);
        fees.class_name = student.class;
    }
    
    if (fees) console.log(`Returning fees for year: ${(fees as any).school_year}, ID: ${(fees as any).id}`);
    else console.log('No matching fees found, returning null or undefined');
    
    const payments = db.prepare('SELECT * FROM student_payments WHERE student_id = ? ORDER BY payment_date DESC').all(id);
    
    return { student, fees, feesHistory: allFees, payments };
  }

  static update(id: string, updates: any) {
    try {
      console.log(`[StudentRepository.update] Starting update for student ${id}`, JSON.stringify(updates, null, 2));

      // Self-healing: Ensure ALL allowed columns exist in the table
      try {
          const tableInfo = db.prepare('PRAGMA table_info(students)').all() as any[];
          const existingColumns = tableInfo.map(c => c.name);
          
          // Check all allowed fields to ensure robustness
          // This covers email, contacts, professions, etc.
          const missingColumns = StudentRepository.studentAllowedFields.filter(col => !existingColumns.includes(col));
          
          if (missingColumns.length > 0) {
              console.log('[StudentRepository.update] Self-healing: Adding missing columns:', missingColumns);
              missingColumns.forEach(col => {
                  try {
                      // Default to TEXT for simplicity. SQLite is flexible.
                      db.prepare(`ALTER TABLE students ADD COLUMN ${col} TEXT`).run();
                      console.log(`[StudentRepository.update] Added column ${col}`);
                  } catch (e) {
                      console.error(`[StudentRepository.update] Failed to add column ${col}`, e);
                  }
              });
          }

          // Self-healing for student_fees table
          const feesTableInfo = db.prepare('PRAGMA table_info(student_fees)').all() as any[];
          const existingFeesColumns = feesTableInfo.map(c => c.name);
          const missingFeesColumns = StudentRepository.feeFields.filter(col => !existingFeesColumns.includes(col));

          if (missingFeesColumns.length > 0) {
              console.log('[StudentRepository.update] Self-healing: Adding missing columns to student_fees:', missingFeesColumns);
              missingFeesColumns.forEach(col => {
                  try {
                      db.prepare(`ALTER TABLE student_fees ADD COLUMN ${col} TEXT`).run();
                      console.log(`[StudentRepository.update] Added column ${col} to student_fees`);
                  } catch (e) {
                      console.error(`[StudentRepository.update] Failed to add column ${col} to student_fees`, e);
                  }
              });
          }

      } catch (e) {
          console.warn('[StudentRepository.update] Self-healing check failed (non-fatal):', e);
      }

      // Handle special fields
      if (updates.photo_path) {
          updates.photo_path = this.handlePhoto(updates.photo_path);
      }
      
      let newSiblingsArray: string[] | undefined;
      let oldSiblingsArray: string[] = [];

      if (updates.siblings) {
          if (typeof updates.siblings !== 'string') {
              newSiblingsArray = updates.siblings;
              updates.siblings = JSON.stringify(updates.siblings);
          } else {
              newSiblingsArray = JSON.parse(updates.siblings);
          }

          const currentStudent = db.prepare('SELECT siblings FROM students WHERE id = ?').get(id) as { siblings: string };
          if (currentStudent && currentStudent.siblings) {
              oldSiblingsArray = JSON.parse(currentStudent.siblings);
          }
      }

      // Separate fee updates and student updates
      const studentUpdates: any = {};
      const feeUpdates: any = {};

      Object.keys(updates).forEach(key => {
          if (StudentRepository.feeFields.includes(key)) {
              feeUpdates[key] = updates[key];
          } else if (StudentRepository.studentAllowedFields.includes(key)) {
              studentUpdates[key] = updates[key];
              
              if (key === 'guardian_contact' && !studentUpdates[key]) {
                  studentUpdates[key] = '';
              }

              if (key === 'class' && typeof studentUpdates[key] === 'string') {
                  studentUpdates[key] = this.normalizeClassName(studentUpdates[key]);
              }
          }
      });

      console.log('[StudentRepository.update] Parsed Student Updates:', studentUpdates);
      console.log('[StudentRepository.update] Parsed Fee Updates:', feeUpdates);

      const updateTransaction = db.transaction(() => {
          // Update Sibling Relations
          if (newSiblingsArray) {
              this.updateSiblingRelations(id, newSiblingsArray, oldSiblingsArray);
          }

          // Update Students Table
          if (Object.keys(studentUpdates).length > 0) {
              const fields = Object.keys(studentUpdates).map(key => `${key} = ?`).join(', ');
              const values = Object.values(studentUpdates);
              
              const stmt = db.prepare(`
                UPDATE students
                SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
                WHERE id = ?
              `);
              const result = stmt.run(...values, id);
              console.log(`[StudentRepository.update] Updated student table. Changes: ${result.changes}`);
              
              if (result.changes > 0) {
                  addToSyncQueue('students', id, 'update', studentUpdates);
              }
          }

          // Update Fees Table
          if (Object.keys(feeUpdates).length > 0 || studentUpdates.class) {
              let schoolYear = this.getSetting('school_year') || '2025-2026';
              schoolYear = schoolYear.replace(/['"]/g, '').trim();
              
              // If class changed, update fee record too
              if (studentUpdates.class) {
                  feeUpdates.class_name = studentUpdates.class;
                  const newLevel = this.determineTuitionLevel(studentUpdates.class);
                  feeUpdates.tuition_level = newLevel;
                  feeUpdates.monthly_tuition = parseFloat(this.getSetting(`tuition_${newLevel}`) || '0');
                  console.log(`[StudentRepository.update] Class changed to ${studentUpdates.class}. New tuition level: ${newLevel}`);
              }

              // Find existing fee record
              const allFees = db.prepare('SELECT id, school_year FROM student_fees WHERE student_id = ? ORDER BY school_year DESC').all(id) as { id: string, school_year: string }[];
              
              const feeRecord = allFees.find(f => {
                  const dbYear = f.school_year.replace(/['"]/g, '').trim();
                  return dbYear === schoolYear;
              });

              if (feeRecord) {
                  console.log(`[StudentRepository.update] Updating existing fee record: ${feeRecord.id}`);
                  
                  // Filter feeUpdates to ensure they are valid columns
                  // We assume feeFields matches columns, but we must be careful with types
                  const validFeeUpdates: any = {};
                  Object.keys(feeUpdates).forEach(k => {
                      // Map booleans to 0/1
                      const val = feeUpdates[k];
                      if (k === 'canteen_days' && Array.isArray(val)) {
                          validFeeUpdates[k] = JSON.stringify(val);
                      } else {
                          validFeeUpdates[k] = typeof val === 'boolean' ? (val ? 1 : 0) : val;
                      }
                  });

                  const fields = Object.keys(validFeeUpdates).map(key => `${key} = ?`).join(', ');
                  const values = Object.values(validFeeUpdates);
                  
                  if (fields.length > 0) {
                      db.prepare(`
                        UPDATE student_fees
                        SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
                        WHERE id = ?
                      `).run(...values, feeRecord.id);
                      
                      addToSyncQueue('student_fees', feeRecord.id, 'update', validFeeUpdates);
                  }
              } else {
                  console.log(`[StudentRepository.update] No fee record found for year "${schoolYear}". Creating new one.`);
                  
                  const feeId = uuidv4();
                  let className = studentUpdates.class;
                  if (!className) {
                      const currentStudent = db.prepare('SELECT class FROM students WHERE id = ?').get(id) as { class: string };
                      className = currentStudent?.class || '';
                  }
                  
                  const level = this.determineTuitionLevel(className);
                  const tuitionFee = parseFloat(this.getSetting(`tuition_${level}`) || '0');
                  
                  // Construct new fee object
                  const newFeeRecord: any = {
                      id: feeId,
                      student_id: id,
                      school_year: schoolYear,
                      tuition_level: level,
                      monthly_tuition: tuitionFee,
                      class_name: className,
                      ...feeUpdates
                  };

                  // Convert booleans to 0/1 for DB
                  const dbFeeRecord: any = {};
                  Object.keys(newFeeRecord).forEach(k => {
                      const val = newFeeRecord[k];
                      if (k === 'canteen_days' && Array.isArray(val)) {
                          dbFeeRecord[k] = JSON.stringify(val);
                      } else {
                          dbFeeRecord[k] = typeof val === 'boolean' ? (val ? 1 : 0) : val;
                      }
                  });

                  // Insert
                  const keys = Object.keys(dbFeeRecord);
                  const placeholders = keys.map(() => '?').join(', ');
                  const values = Object.values(dbFeeRecord);
                  
                  db.prepare(`INSERT INTO student_fees (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
                  
                  addToSyncQueue('student_fees', feeId, 'create', newFeeRecord);
              }
          }
      });

      updateTransaction();
      console.log('[StudentRepository.update] Transaction committed successfully');
      
      return { success: true };
    } catch (error: any) {
      console.error('[StudentRepository.update] Update error:', error);
      return { success: false, error: error.message };
    }
  }

  static delete(id: string) {
    try {
      db.prepare(`
        UPDATE students
        SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
      `).run(id);
      
      addToSyncQueue('students', id, 'delete', { deleted: true });
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // New method to clear database (for development/reset)
  static resetDatabase() {
      try {
          db.prepare('DELETE FROM student_payments').run();
          db.prepare('DELETE FROM student_fees').run();
          db.prepare('DELETE FROM students').run();
          db.prepare('DELETE FROM sync_queue').run();
          // Reset other tables as needed
          return { success: true };
      } catch (error: any) {
          return { success: false, error: error.message };
      }
  }

  static reEnroll(id: string, newClass: string, targetYear: string) {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    if (!student) return { success: false, error: 'Student not found' };

    // Check if already enrolled
    const existingFee = db.prepare('SELECT id FROM student_fees WHERE student_id = ? AND school_year = ?').get(id, targetYear);
    if (existingFee) return { success: false, error: 'Student already enrolled for this year' };

    const level = this.determineTuitionLevel(newClass);
    const tuitionFee = parseFloat(this.getSetting(`tuition_${level}`) || '0');

    const transaction = db.transaction(() => {
        // Update Student Class (Current Status)
        db.prepare(`
            UPDATE students 
            SET class = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
            WHERE id = ?
        `).run(newClass, id);
        
        addToSyncQueue('students', id, 'update', { class: newClass });

        // Create New Fee Record (Enrollment History)
        const feeId = uuidv4();
        db.prepare(`
            INSERT INTO student_fees (
                id, student_id, school_year, tuition_level, monthly_tuition, class_name
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(feeId, id, targetYear, level, tuitionFee, newClass);

        addToSyncQueue('student_fees', feeId, 'create', {
            id: feeId, student_id: id, school_year: targetYear,
            tuition_level: level, monthly_tuition: tuitionFee, class_name: newClass
        });
    });

    try {
        transaction();
        return { success: true };
    } catch (error: any) {
        console.error('Re-enrollment error:', error);
        return { success: false, error: error.message };
    }
  }
}
