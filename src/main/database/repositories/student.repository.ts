import db from '../db'
import { addToSyncQueue, wipeRemoteData } from '../../services/sync.service'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export class StudentRepository {
  private static feeFields = [
    'bus_subscribed',
    'bus_route',
    'canteen_subscribed',
    'canteen_days_per_week',
    'canteen_days',
    'uniform_tshirt_purchased',
    'uniform_apron_purchased',
    'uniform_shorts_purchased',
    'uniform_badge_purchased',
    'fram_paid_by_parent'
  ]

  private static studentAllowedFields = [
    'first_name',
    'last_name',
    'gender',
    'date_of_birth',
    'place_of_birth',
    'class',
    'enrollment_date',
    'previous_school',
    'father_name',
    'mother_name',
    'guardian_name',
    'father_contact',
    'mother_contact',
    'guardian_contact',
    'father_profession',
    'mother_profession',
    'guardian_profession',
    'address',
    'photo_path',
    'siblings',
    'email'
  ]

  private static DEFAULT_PRICES = {
    tuition: {
      PS: 60000,
      MS: 60000,
      GS: 60000,
      CP: 70000,
      CE1: 70000,
      CE2: 70000,
      CM1: 80000,
      CM2: 80000,
      '6ème': 90000,
      '5ème': 90000,
      '4ème': 100000,
      '3ème': 100000,
      Seconde: 110000,
      Première: 110000,
      Terminale: 120000
    }
  }

  private static handlePhoto(sourcePath: string): string {
    if (!sourcePath) return ''
    if (sourcePath.startsWith('http')) return sourcePath // Keep remote URLs

    try {
      const userDataPath = app.getPath('userData')
      const photosDir = path.join(userDataPath, 'photos')

      if (!fs.existsSync(photosDir)) {
        fs.mkdirSync(photosDir, { recursive: true })
      }

      // Check if already in photos dir
      // Normalize paths for comparison
      const normalizedSource = path.normalize(sourcePath)
      const normalizedPhotosDir = path.normalize(photosDir)

      if (normalizedSource.startsWith(normalizedPhotosDir)) return sourcePath

      // Generate new filename
      const ext = path.extname(sourcePath) || '.jpg'
      const newFilename = `${uuidv4()}${ext}`
      const destPath = path.join(photosDir, newFilename)

      fs.copyFileSync(sourcePath, destPath)
      return destPath
    } catch (error) {
      console.error('Error copying photo:', error)
      return sourcePath // Fallback
    }
  }

  static generateRegistrationNumber(): string {
    const year = new Date().getFullYear()
    // Better: Get MAX number for current year
    const result = db
      .prepare(
        `
      SELECT MAX(CAST(SUBSTR(registration_number, 6) AS INTEGER)) as max_num 
      FROM students 
      WHERE registration_number LIKE ?
    `
      )
      .get(`${year}-%`) as { max_num: number | null }

    const nextNum = (result.max_num || 0) + 1
    return `${year}-${String(nextNum).padStart(5, '0')}`
  }

  static getSetting(key: string): string {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as {
      value: string
    }
    if (!result) return ''

    try {
      const parsed = JSON.parse(result.value)
      return typeof parsed === 'string' ? parsed.trim() : String(parsed).trim()
    } catch (e) {
      // Fallback for raw strings
      return result.value.replace(/['"]/g, '').trim()
    }
  }

  static getTuitionPrice(className: string): number {
    const config = this.resolveTuitionConfig(className)
    return config.price
  }

  static resolveTuitionConfig(className: string): { price: number; key: string } {
    if (!className) return { price: 0, key: '' }

    let prices: Record<string, unknown> | null = null
    try {
      const result = db
        .prepare("SELECT value FROM settings WHERE key = 'finance_prices'")
        .get() as { value: string }
      if (result && result.value) {
        prices = JSON.parse(result.value)
      }
    } catch (e) {
      console.error('Error resolving tuition config:', e)
    }

    const tuitionPrices =
      prices && prices.tuition ? prices.tuition : StudentRepository.DEFAULT_PRICES.tuition

    // Try to find matching key in tuition prices
    const keys = Object.keys(tuitionPrices)
    // Sort by length descending to match longest specific key first
    keys.sort((a, b) => b.length - a.length)

    const normalizedClass = className.trim()

    for (const key of keys) {
      if (normalizedClass.includes(key)) {
        return { price: Number(tuitionPrices[key]) || 0, key: key }
      }
    }

    return { price: 0, key: '' }
  }

  static determineTuitionLevel(className: string): string {
    const config = this.resolveTuitionConfig(className)
    if (config.key) return config.key

    // Fallback for legacy compatibility
    const lowerClass = className.toLowerCase()
    if (
      lowerClass.includes('maternelle') ||
      lowerClass.includes('ps') ||
      lowerClass.includes('ms') ||
      lowerClass.includes('gs')
    )
      return 'preschool'
    if (
      lowerClass.includes('cp') ||
      lowerClass.includes('ce') ||
      lowerClass.includes('cm') ||
      lowerClass.includes('11') ||
      lowerClass.includes('10') ||
      lowerClass.includes('9') ||
      lowerClass.includes('8') ||
      lowerClass.includes('7')
    )
      return 'primary'
    if (
      lowerClass.includes('6') ||
      lowerClass.includes('5') ||
      lowerClass.includes('4') ||
      lowerClass.includes('3')
    )
      return 'middle'
    if (lowerClass.includes('2') || lowerClass.includes('1') || lowerClass.includes('term'))
      return 'high'
    return 'primary' // Default
  }

  // Helper to handle bidirectional sibling updates
  private static updateSiblingRelations(
    studentId: string,
    newSiblingIds: string[],
    oldSiblingIds: string[] = []
  ) {
    const added = newSiblingIds.filter((id) => !oldSiblingIds.includes(id))
    const removed = oldSiblingIds.filter((id) => !newSiblingIds.includes(id))

    // Add current student to new siblings
    added.forEach((siblingId) => {
      if (siblingId === studentId) return // prevent self-referencing loops
      const sibling = db.prepare('SELECT siblings FROM students WHERE id = ?').get(siblingId) as {
        siblings: string
      }
      if (sibling) {
        const siblingsList = sibling.siblings ? JSON.parse(sibling.siblings) : []
        if (!siblingsList.includes(studentId)) {
          siblingsList.push(studentId)
          const newSiblingsJson = JSON.stringify(siblingsList)

          db.prepare(
            'UPDATE students SET siblings = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = "pending" WHERE id = ?'
          ).run(newSiblingsJson, siblingId)

          addToSyncQueue('students', siblingId, 'update', { siblings: newSiblingsJson })
        }
      }
    })

    // Remove current student from removed siblings
    removed.forEach((siblingId) => {
      const sibling = db.prepare('SELECT siblings FROM students WHERE id = ?').get(siblingId) as {
        siblings: string
      }
      if (sibling) {
        const siblingsList = sibling.siblings ? JSON.parse(sibling.siblings) : []
        const index = siblingsList.indexOf(studentId)
        if (index !== -1) {
          siblingsList.splice(index, 1)
          const newSiblingsJson = JSON.stringify(siblingsList)

          db.prepare(
            'UPDATE students SET siblings = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = "pending" WHERE id = ?'
          ).run(newSiblingsJson, siblingId)

          addToSyncQueue('students', siblingId, 'update', { siblings: newSiblingsJson })
        }
      }
    })
  }

  private static normalizeClassName(className: string): string {
    if (!className) return ''
    return className.trim().replace(/\s+/g, ' ') // Trim and single spaces
  }

  static create(studentData: Record<string, unknown>) {
    // Handle photo path before transaction
    if (studentData.photo_path) {
      studentData.photo_path = this.handlePhoto(studentData.photo_path as string)
    }

    const createTransaction = db.transaction((data) => {
      const id = uuidv4()
      // Ensure registration number is generated if not provided (it shouldn't be provided by UI usually)
      const registration_number = this.generateRegistrationNumber()

      // Extract fee fields
      const feeData: Record<string, unknown> = {}
      const studentDataClean: Record<string, unknown> = {}

      Object.keys(data).forEach((key) => {
        if (StudentRepository.feeFields.includes(key)) {
          feeData[key] = data[key]
        } else if (StudentRepository.studentAllowedFields.includes(key)) {
          studentDataClean[key] = data[key]
        }
      })

      // Sanitize class to ensure it's not null (database constraint)
      studentDataClean.class = this.normalizeClassName(studentDataClean.class as string)

      // Sanitize guardian_contact to ensure it's not null (database constraint)
      studentDataClean.guardian_contact = studentDataClean.guardian_contact || ''

      const stmt = db.prepare(`
            INSERT INTO students (
                id, first_name, last_name, gender, date_of_birth, place_of_birth,
                class, registration_number, enrollment_date, 
                father_name, mother_name, guardian_name, 
                father_contact, mother_contact, guardian_contact,
                father_profession, mother_profession, guardian_profession,
                address, previous_school, photo_path, siblings
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

      // Handle siblings as JSON string
      const siblingsArray = studentDataClean.siblings || []
      const siblingsJson = JSON.stringify(siblingsArray)
      stmt.run(
        id,
        studentDataClean.first_name,
        studentDataClean.last_name,
        studentDataClean.gender,
        studentDataClean.date_of_birth,
        studentDataClean.place_of_birth,
        studentDataClean.class,
        registration_number,
        studentDataClean.enrollment_date,
        studentDataClean.father_name,
        studentDataClean.mother_name,
        studentDataClean.guardian_name,
        studentDataClean.father_contact,
        studentDataClean.mother_contact,
        studentDataClean.guardian_contact,
        studentDataClean.father_profession,
        studentDataClean.mother_profession,
        studentDataClean.guardian_profession,
        studentDataClean.address,
        studentDataClean.previous_school,
        studentDataClean.photo_path,
        siblingsJson
      )

      // Update bidirectional siblings
      this.updateSiblingRelations(id, siblingsArray as string[], [])

      // Initialize Student Fees for current year (Only if class is provided)
      if (studentDataClean.class) {
        let schoolYear = this.getSetting('school_year') || '2025-2026'
        schoolYear = schoolYear.replace(/['"]/g, '').trim()

        const config = this.resolveTuitionConfig(studentDataClean.class as string)
        const level = config.key || this.determineTuitionLevel(studentDataClean.class as string)
        const tuitionFee = config.price

        const feeId = uuidv4()
        db.prepare(
          `
                INSERT INTO student_fees (
                    id, student_id, school_year, tuition_level, monthly_tuition, class_name,
                    bus_subscribed, bus_route, 
                    canteen_subscribed, canteen_days_per_week,
                    uniform_tshirt_purchased, uniform_apron_purchased, uniform_shorts_purchased, uniform_badge_purchased,
                    fram_paid_by_parent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
        ).run(
          feeId,
          id,
          schoolYear,
          level,
          tuitionFee,
          studentDataClean.class,
          feeData.bus_subscribed ? 1 : 0,
          feeData.bus_route || null,
          feeData.canteen_subscribed ? 1 : 0,
          feeData.canteen_days_per_week || 0,
          feeData.uniform_tshirt_purchased ? 1 : 0,
          feeData.uniform_apron_purchased ? 1 : 0,
          feeData.uniform_shorts_purchased ? 1 : 0,
          feeData.uniform_badge_purchased ? 1 : 0,
          feeData.fram_paid_by_parent ? 1 : 0
        )

        addToSyncQueue('student_fees', feeId, 'create', {
          id: feeId,
          student_id: id,
          school_year: schoolYear,
          tuition_level: level,
          monthly_tuition: tuitionFee,
          class_name: studentDataClean.class,
          ...feeData
        })
      }

      // Add to sync queue
      addToSyncQueue('students', id, 'create', {
        ...studentDataClean,
        gender: studentDataClean.gender,
        id,
        registration_number,
        siblings: siblingsJson
      })

      return { success: true, id, registration_number }
    })

    try {
      return createTransaction(studentData)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error creating student:', error)
      return { success: false, error: message }
    }
  }

  static list(filters: { search?: string; class?: string; limit?: number; offset?: number } = {}) {
    const { search, class: className, limit = 50, offset = 0 } = filters

    // Build WHERE clause incrementally (same conditions for data and count)
    const conditions = ['s.deleted = 0']
    const params: unknown[] = []

    if (search) {
      conditions.push('s.search_text LIKE ?')
      params.push(`%${search.toLowerCase()}%`)
    }

    const whereClause = conditions.join(' AND ')

    // Sub-query that resolves class with fallback to student_fees
    const resolvedSubQuery = `
      SELECT s.*,
        COALESCE(NULLIF(s.class, 'Classe non spécifiée'),
                 (SELECT class_name FROM student_fees sf
                  WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
                  ORDER BY sf.school_year DESC LIMIT 1),
                 'Non inscrit'
        ) as resolved_class
      FROM students s
      WHERE ${whereClause}
    `

    // Apply class filter post-resolution if needed
    const classFilter = className ? "WHERE resolved_class = ?" : ''
    const classParam = className ? [className] : []

    const dataQuery = `
      SELECT * FROM (${resolvedSubQuery})
      ${classFilter}
      ORDER BY last_name, first_name
      LIMIT ? OFFSET ?
    `
    const dataParams = [...params, ...classParam, limit, offset]

    const countQuery = `
      SELECT COUNT(*) as total FROM (${resolvedSubQuery})
      ${classFilter}
    `
    const countParams = [...params, ...classParam]

    const students = db
      .prepare(dataQuery)
      .all(...dataParams) as Record<string, unknown>[]
    const mappedStudents = students.map((s) => ({
        ...s,
        class: s.resolved_class,
        siblings: s.siblings ? JSON.parse(s.siblings as string) : []
      }))

    const countResult = db.prepare(countQuery).get(...countParams) as { total: number }

    return { students: mappedStudents, total: countResult.total }
  }

  static getById(id: string) {
    const student = db.prepare(`
      SELECT *,
        COALESCE(NULLIF(class, 'Classe non spécifiée'),
                 (SELECT class_name FROM student_fees sf
                  WHERE sf.student_id = students.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
                  ORDER BY sf.school_year DESC LIMIT 1),
                 'Non inscrit'
        ) as resolved_class
      FROM students
      WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined

    if (!student) return null

    student.class = student.resolved_class
    delete student.resolved_class
    student.siblings = student.siblings ? JSON.parse(student.siblings as string) : []

    const allFees = db
      .prepare('SELECT * FROM student_fees WHERE student_id = ? ORDER BY school_year DESC')
      .all(id) as Record<string, unknown>[]
    const schoolYear = this.getSetting('school_year') || '2025-2026'

    // valid fees for current year
    const fees = allFees.find((f) => {
      const dbYear = (f.school_year as string).replace(/['"]/g, '').trim()
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      return dbYear === targetYear
    }) as Record<string, unknown> | undefined

    // Repair legacy fee records missing class_name
    if (fees && !fees.class_name && student.class) {
      db.prepare('UPDATE student_fees SET class_name = ? WHERE id = ?').run(student.class, fees.id)
      fees.class_name = student.class
    }

    // Parse JSON fields in fees
    if (fees) {
      try {
        if (typeof fees.canteen_days === 'string') {
          fees.canteen_days = JSON.parse(fees.canteen_days as string)
        }
        if (typeof fees.tuition_paid_months === 'string') {
          fees.tuition_paid_months = JSON.parse(fees.tuition_paid_months as string)
        }
      } catch (e) {
        console.error('Error parsing fee JSON fields:', e)
        // Don't overwrite with empty arrays on error, let frontend handle or keep raw
      }
    }

    const payments = db
      .prepare('SELECT * FROM student_payments WHERE student_id = ? ORDER BY payment_date DESC')
      .all(id)

    return { student, fees, feesHistory: allFees, payments }
  }

  static update(id: string, updates: Record<string, unknown>) {
    try {


      // Handle special fields
      if (updates.photo_path) {
        updates.photo_path = this.handlePhoto(updates.photo_path as string)
      }

      let newSiblingsArray: string[] | undefined
      let oldSiblingsArray: string[] = []

      if (updates.siblings) {
        if (typeof updates.siblings !== 'string') {
          newSiblingsArray = updates.siblings as string[]
          updates.siblings = JSON.stringify(updates.siblings)
        } else {
          newSiblingsArray = JSON.parse(updates.siblings)
        }

        const currentStudent = db.prepare('SELECT siblings FROM students WHERE id = ?').get(id) as {
          siblings: string
        }
        if (currentStudent && currentStudent.siblings) {
          oldSiblingsArray = JSON.parse(currentStudent.siblings)
        }
      }

      // Separate fee updates and student updates
      const studentUpdates: Record<string, unknown> = {}
      const feeUpdates: Record<string, unknown> = {}

      Object.keys(updates).forEach((key) => {
        if (StudentRepository.feeFields.includes(key)) {
          feeUpdates[key] = updates[key]
        } else if (StudentRepository.studentAllowedFields.includes(key)) {
          studentUpdates[key] = updates[key]

          if (key === 'guardian_contact' && !studentUpdates[key]) {
            studentUpdates[key] = ''
          }

          if (key === 'class' && typeof studentUpdates[key] === 'string') {
            studentUpdates[key] = this.normalizeClassName(studentUpdates[key])
          }
        }
      })



      const updateTransaction = db.transaction(() => {
        // Update Sibling Relations
        if (newSiblingsArray) {
          this.updateSiblingRelations(id, newSiblingsArray, oldSiblingsArray)
        }

        // Update Students Table
        if (Object.keys(studentUpdates).length > 0) {
          const fields = Object.keys(studentUpdates)
            .map((key) => `${key} = ?`)
            .join(', ')
          const values = Object.values(studentUpdates)

          const stmt = db.prepare(`
                UPDATE students
                SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
                WHERE id = ?
              `)
          const result = stmt.run(...values, id)

          if (result.changes > 0) {
            addToSyncQueue('students', id, 'update', studentUpdates)
          }
        }

        // Update Fees Table
        if (Object.keys(feeUpdates).length > 0 || studentUpdates.class) {
          let schoolYear = this.getSetting('school_year') || '2025-2026'
          schoolYear = schoolYear.replace(/['"]/g, '').trim()

          // If class changed, update fee record too
          if (studentUpdates.class) {
            feeUpdates.class_name = studentUpdates.class
            const config = this.resolveTuitionConfig(studentUpdates.class as string)
            feeUpdates.tuition_level =
              config.key || this.determineTuitionLevel(studentUpdates.class as string)
            feeUpdates.monthly_tuition = config.price

          }

          // Find existing fee record
          const allFees = db
            .prepare(
              'SELECT id, school_year FROM student_fees WHERE student_id = ? ORDER BY school_year DESC'
            )
            .all(id) as { id: string; school_year: string }[]

          const feeRecord = allFees.find((f) => {
            const dbYear = f.school_year.replace(/['"]/g, '').trim()
            return dbYear === schoolYear
          })

          if (feeRecord) {


            // Filter feeUpdates to ensure they are valid columns
            // We assume feeFields matches columns, but we must be careful with types
            const validFeeUpdates: Record<string, unknown> = {}
            Object.keys(feeUpdates).forEach((k) => {
              // Map booleans to 0/1
              const val = feeUpdates[k]
              if (k === 'canteen_days' && Array.isArray(val)) {
                validFeeUpdates[k] = JSON.stringify(val)
              } else {
                validFeeUpdates[k] = typeof val === 'boolean' ? (val ? 1 : 0) : val
              }
            })

            const fields = Object.keys(validFeeUpdates)
              .map((key) => `${key} = ?`)
              .join(', ')
            const values = Object.values(validFeeUpdates)

            if (fields.length > 0) {
              db.prepare(
                `
                        UPDATE student_fees
                        SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
                        WHERE id = ?
                      `
              ).run(...values, feeRecord.id)

              addToSyncQueue('student_fees', feeRecord.id, 'update', { ...validFeeUpdates, student_id: id })
            }
          } else {


            const feeId = uuidv4()
            let className = studentUpdates.class as string
            if (!className) {
              const currentStudent = db
                .prepare('SELECT class FROM students WHERE id = ?')
                .get(id) as { class: string }
              className = currentStudent?.class || ''
            }

            const level = this.determineTuitionLevel(className)
            const tuitionFee = this.getTuitionPrice(className)

            // Construct new fee object
            const newFeeRecord: Record<string, unknown> = {
              id: feeId,
              student_id: id,
              school_year: schoolYear,
              tuition_level: level,
              monthly_tuition: tuitionFee,
              class_name: className,
              ...feeUpdates
            }

            // Convert booleans to 0/1 for DB
            const dbFeeRecord: Record<string, unknown> = {}
            Object.keys(newFeeRecord).forEach((k) => {
              const val = newFeeRecord[k]
              if (k === 'canteen_days' && Array.isArray(val)) {
                dbFeeRecord[k] = JSON.stringify(val)
              } else {
                dbFeeRecord[k] = typeof val === 'boolean' ? (val ? 1 : 0) : val
              }
            })

            // Insert
            const keys = Object.keys(dbFeeRecord)
            const placeholders = keys.map(() => '?').join(', ')
            const values = Object.values(dbFeeRecord)

            db.prepare(
              `INSERT INTO student_fees (${keys.join(', ')}) VALUES (${placeholders})`
            ).run(...values)

            addToSyncQueue('student_fees', feeId, 'create', newFeeRecord)
          }
        }
      })

      updateTransaction()


      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[StudentRepository.update] Update error:', error)
      return { success: false, error: message }
    }
  }

  static delete(id: string) {
    try {
      db.prepare(
        `
        UPDATE students
        SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
      `
      ).run(id)

      addToSyncQueue('students', id, 'delete', { deleted: true })

      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // New method to clear database (for development/reset)
  static async resetDatabase(includeRemote: boolean = false) {
    try {
      if (includeRemote) {

        await wipeRemoteData()
      }


      // 1. Delete Attendance & Event Payments
      db.prepare('DELETE FROM bus_attendance').run()
      db.prepare('DELETE FROM canteen_attendance').run()
      db.prepare('DELETE FROM event_payments').run()

      // 2. Delete Core Student Data
      db.prepare('DELETE FROM student_payments').run()
      db.prepare('DELETE FROM student_fees').run()
      db.prepare('DELETE FROM students').run()

      // 3. Clear Sync Queue (to prevent ghosts)
      db.prepare('DELETE FROM sync_queue').run()

      // Reset other tables as needed
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static reEnroll(id: string, newClass: string, targetYear: string) {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id)
    if (!student) return { success: false, error: 'Student not found' }

    // Check if already enrolled
    const existingFee = db
      .prepare('SELECT id FROM student_fees WHERE student_id = ? AND school_year = ?')
      .get(id, targetYear)
    if (existingFee) return { success: false, error: 'Student already enrolled for this year' }

    const level = this.determineTuitionLevel(newClass)
    const tuitionFee = this.getTuitionPrice(newClass)

    const transaction = db.transaction(() => {
      // Update Student Class (Current Status)
      db.prepare(
        `
            UPDATE students 
            SET class = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
            WHERE id = ?
        `
      ).run(newClass, id)

      addToSyncQueue('students', id, 'update', { class: newClass })

      // Create New Fee Record (Enrollment History)
      const feeId = uuidv4()
      db.prepare(
        `
            INSERT INTO student_fees (
                id, student_id, school_year, tuition_level, monthly_tuition, class_name
            ) VALUES (?, ?, ?, ?, ?, ?)
        `
      ).run(feeId, id, targetYear, level, tuitionFee, newClass)

      addToSyncQueue('student_fees', feeId, 'create', {
        id: feeId,
        student_id: id,
        school_year: targetYear,
        tuition_level: level,
        monthly_tuition: tuitionFee,
        class_name: newClass
      })
    })

    try {
      transaction()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Re-enrollment error:', error)
      return { success: false, error: message }
    }
  }

  static getServiceStats() {
    const schoolYear = this.getSetting('school_year') || '2025-2026'

    const rows = db
      .prepare(
        `
          SELECT canteen_days, canteen_subscribed, bus_route, bus_subscribed 
          FROM student_fees 
          WHERE school_year = ?
      `
      )
      .all(schoolYear) as { canteen_subscribed: number; canteen_days: string; bus_subscribed: number; bus_route: string }[]

    const canteenStats: Record<string, number> = {
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0
    }

    const busStats: Record<string, number> = {}

    rows.forEach((row) => {
      // Canteen
      if (row.canteen_subscribed && row.canteen_days) {
        try {
          const days = JSON.parse(row.canteen_days)
          if (Array.isArray(days)) {
            days.forEach((day) => {
              if (canteenStats[day] !== undefined) canteenStats[day]++
            })
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Bus
      if (row.bus_subscribed && row.bus_route) {
        const route = row.bus_route.trim()
        if (route) {
          busStats[route] = (busStats[route] || 0) + 1
        }
      }
    })

    return { canteenStats, busStats, totalStudents: rows.length }
  }

  static repairEnrollments(targetYear: string = '2025-2026') {

    const students = db
      .prepare("SELECT id, class FROM students WHERE class IS NOT NULL AND class != ''")
      .all() as { id: string; class: string }[]
    let fixedCount = 0

    const transaction = db.transaction(() => {
      for (const student of students) {
        const existingFee = db
          .prepare('SELECT id FROM student_fees WHERE student_id = ? AND school_year = ?')
          .get(student.id, targetYear)

        if (!existingFee) {

          const level = this.determineTuitionLevel(student.class)
          const tuitionFee = this.getTuitionPrice(student.class)
          const feeId = uuidv4()

          db.prepare(
            `
                      INSERT INTO student_fees (
                          id, student_id, school_year, tuition_level, monthly_tuition, class_name
                      ) VALUES (?, ?, ?, ?, ?, ?)
                  `
          ).run(feeId, student.id, targetYear, level, tuitionFee, student.class)

          addToSyncQueue('student_fees', feeId, 'create', {
            id: feeId,
            student_id: student.id,
            school_year: targetYear,
            tuition_level: level,
            monthly_tuition: tuitionFee,
            class_name: student.class
          })

          fixedCount++
        }
      }
    })

    try {
      transaction()
      return { success: true, fixedCount }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Repair error:', error)
      return { success: false, error: message }
    }
  }
}
