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
    'uniform_items_purchased',
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
    'email',
    'is_personnel_child',
    'parent_personnel_id',
    'departure_date'
  ]

  private static translateError(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('no column named'))
      return `Erreur système : colonne de base de données introuvable. L'application est en train de se mettre à jour.`
    if (msg.includes('UNIQUE constraint failed'))
      return `Erreur : Cet enregistrement existe déjà (ex: numéro matricule doublon).`
    if (msg.includes('FOREIGN KEY constraint failed'))
      return `Erreur : Liaison impossible. L'élément lié n'existe pas.`
    if (msg.includes('SQLITE_')) return `Erreur inattendue de la base de données.`
    return msg
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

  static parseBoolean(val: unknown): boolean {
    if (val === null || val === undefined) return false
    if (typeof val === 'boolean') return val
    if (typeof val === 'number') return val === 1
    if (typeof val === 'string') {
      const trimmed = val.trim().toLowerCase()
      return trimmed === '1' || trimmed === '1.0' || trimmed === 'true'
    }
    return false
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

  static getCurrentSchoolYear(): string {
    const saved = this.getSetting('school_year')
    if (saved && saved.trim()) {
      return saved.replace(/['"]/g, '').trim()
    }
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`
  }

  static getSetting(key: string): string {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as {
      value: string
    }
    if (!result) return ''

    try {
      const parsed = JSON.parse(result.value)
      return typeof parsed === 'string' ? parsed.trim() : String(parsed).trim()
    } catch {
      // Fallback for raw strings
      return result.value.replace(/['"]/g, '').trim()
    }
  }

  static getTuitionPrice(className: string, isPersonnelChild: boolean = false): number {
    if (isPersonnelChild) return 0
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

    const tuitionPrices = prices && prices.tuition ? prices.tuition : {}

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
    return className || 'unknown'
  }

  // Helper to handle bidirectional sibling updates
  private static updateSiblingRelations(
    studentId: string,
    newSiblingIds: string[],
    oldSiblingIds: string[] = []
  ): void {
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
            "UPDATE students SET siblings = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending' WHERE id = ?"
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
            "UPDATE students SET siblings = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending' WHERE id = ?"
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

  static create(studentData: Record<string, unknown>): {
    success: boolean
    id?: string
    registration_number?: string
    error?: string
  } {
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
                address, previous_school, photo_path, siblings, is_personnel_child, parent_personnel_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

      // Handle siblings as JSON string
      const siblingsArray = studentDataClean.siblings || []
      const siblingsJson = JSON.stringify(siblingsArray)
      stmt.run(
        id,
        studentDataClean.first_name ?? null,
        studentDataClean.last_name ?? null,
        studentDataClean.gender ?? null,
        studentDataClean.date_of_birth ?? null,
        studentDataClean.place_of_birth ?? null,
        studentDataClean.class ?? null,
        registration_number,
        studentDataClean.enrollment_date ?? null,
        studentDataClean.father_name ?? null,
        studentDataClean.mother_name ?? null,
        studentDataClean.guardian_name ?? null,
        studentDataClean.father_contact ?? null,
        studentDataClean.mother_contact ?? null,
        studentDataClean.guardian_contact ?? null,
        studentDataClean.father_profession ?? null,
        studentDataClean.mother_profession ?? null,
        studentDataClean.guardian_profession ?? null,
        studentDataClean.address ?? null,
        studentDataClean.previous_school ?? null,
        studentDataClean.photo_path ?? null,
        siblingsJson,
        studentDataClean.is_personnel_child !== undefined
          ? studentDataClean.is_personnel_child
            ? 1
            : 0
          : null,
        studentDataClean.parent_personnel_id !== undefined
          ? studentDataClean.parent_personnel_id
          : null
      )

      // Update bidirectional siblings
      this.updateSiblingRelations(id, siblingsArray as string[], [])

      // Initialize Student Fees for current year (Only if class is provided)
      if (studentDataClean.class) {
        let schoolYear = this.getSetting('school_year') || '2025-2026'
        schoolYear = schoolYear.replace(/['"]/g, '').trim()

        const config = this.resolveTuitionConfig(studentDataClean.class as string)
        const level = config.key || this.determineTuitionLevel(studentDataClean.class as string)
        const tuitionFee = this.getTuitionPrice(
          studentDataClean.class as string,
          this.parseBoolean(studentDataClean.is_personnel_child)
        )

        const feeId = uuidv4()
        db.prepare(
          `
                INSERT INTO student_fees (
                    id, student_id, school_year, tuition_level, monthly_tuition, class_name,
                    bus_subscribed, bus_route, 
                    canteen_subscribed, canteen_days_per_week,
                    uniform_items_purchased,
                    fram_paid_by_parent, is_reenrollment
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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
          feeData.uniform_items_purchased ? JSON.stringify(feeData.uniform_items_purchased) : '[]',
          feeData.fram_paid_by_parent ? 1 : 0
        )

        addToSyncQueue('student_fees', feeId, 'create', {
          id: feeId,
          student_id: id,
          school_year: schoolYear,
          tuition_level: level,
          monthly_tuition: tuitionFee,
          class_name: studentDataClean.class,
          is_reenrollment: 0,
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
      const message = this.translateError(error)
      console.error('Error creating student:', error)
      return { success: false, error: message }
    }
  }

  static list(
    filters: {
      search?: string
      class?: string
      status?: string
      schoolYear?: string
      limit?: number
      offset?: number
      sortField?: string
      sortDirection?: 'asc' | 'desc'
    } = {}
  ): { students: Record<string, unknown>[]; total: number } {
    const {
      search,
      class: className,
      status,
      schoolYear,
      limit = 5000,
      offset = 0,
      sortField,
      sortDirection = 'asc'
    } = filters

    // Build WHERE clause incrementally (same conditions for data and count)
    const conditions = ['s.deleted = 0']
    const params: unknown[] = []

    if (search) {
      conditions.push('s.search_text LIKE ?')
      params.push(`%${search.toLowerCase()}%`)
    }

    const whereClause = conditions.join(' AND ')

    let resolvedSubQuery = ''
    let subQueryParams: unknown[] = []

    const targetSchoolYear = schoolYear ? schoolYear.replace(/['"]/g, '').trim() : ''

    if (schoolYear) {
      resolvedSubQuery = `
        SELECT s.*,
          COALESCE(
            CASE WHEN s.departure_date IS NOT NULL THEN 'Quitté le ' || strftime('%d/%m/%Y', s.departure_date) ELSE NULL END,
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') = ? AND sf.class_name IS NOT NULL AND sf.class_name != ''),
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
             ORDER BY sf.school_year DESC LIMIT 1),
            NULLIF(NULLIF(s.class, 'Classe non spécifiée'), 'Non inscrit'),
            NULLIF(s.class, 'Classe non spécifiée'),
            'Non spécifiée'
          ) as resolved_class,
          (SELECT school_year FROM student_fees sf
           WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
           ORDER BY school_year DESC LIMIT 1) as status_year,
          CASE
            WHEN s.departure_date IS NOT NULL THEN 'Quitté'
            WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') = ?) THEN 'Inscrit'
            WHEN (s.class IS NOT NULL AND s.class != '' AND s.class != 'Classe non spécifiée' AND s.class != 'Non inscrit') THEN 'Inscrit'
            WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') > ?) THEN 'Pré-inscrit'
            WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') < ?) THEN 'Ancien'
            ELSE 'Non inscrit'
          END as student_status
        FROM students s
        WHERE ${whereClause}
      `
      subQueryParams = [
        targetSchoolYear,
        targetSchoolYear,
        targetSchoolYear,
        targetSchoolYear,
        ...params
      ]
    } else {
      resolvedSubQuery = `
        SELECT s.*,
          COALESCE(
            CASE WHEN s.departure_date IS NOT NULL THEN 'Quitté le ' || strftime('%d/%m/%Y', s.departure_date) ELSE NULL END,
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') = ? AND sf.class_name IS NOT NULL AND sf.class_name != ''),
            (SELECT class_name FROM student_fees sf
             WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
             ORDER BY sf.school_year DESC LIMIT 1),
            NULLIF(NULLIF(s.class, 'Classe non spécifiée'), 'Non inscrit'),
            NULLIF(s.class, 'Classe non spécifiée'),
            'Non spécifiée'
          ) as resolved_class,
          (SELECT school_year FROM student_fees sf
           WHERE sf.student_id = s.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
           ORDER BY school_year DESC LIMIT 1) as status_year,
          CASE
            WHEN s.departure_date IS NOT NULL THEN 'Quitté'
            WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') = ?) THEN 'Inscrit'
            WHEN (s.class IS NOT NULL AND s.class != '' AND s.class != 'Classe non spécifiée' AND s.class != 'Non inscrit') THEN 'Inscrit'
            WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') > ?) THEN 'Pré-inscrit'
            WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = s.id AND REPLACE(sf.school_year, '"', '') < ?) THEN 'Ancien'
            ELSE 'Non inscrit'
          END as student_status
        FROM students s
        WHERE ${whereClause}
      `
      // For fallback we might not have a targetSchoolYear, so we use the default setting
      const fallbackYear = this.getCurrentSchoolYear()
      subQueryParams = [fallbackYear, fallbackYear, fallbackYear, fallbackYear, ...params]
    }

    // Apply filters post-resolution if needed
    const postConditions: string[] = []
    const postParams: unknown[] = []

    if (className) {
      postConditions.push('resolved_class = ?')
      postParams.push(className)
    }

    if (status) {
      postConditions.push('student_status = ?')
      postParams.push(status)
    }

    const postFilter = postConditions.length > 0 ? `WHERE ${postConditions.join(' AND ')}` : ''

    let orderClause = `
      ORDER BY 
        CASE WHEN registration_number IS NULL OR registration_number = '' THEN 1 ELSE 0 END ASC,
        registration_number ASC, 
        last_name ASC, 
        first_name ASC
    `
    if (sortField) {
      const allowedSortFields = ['registration_number', 'last_name', 'first_name', 'resolved_class']
      if (allowedSortFields.includes(sortField)) {
        const direction = sortDirection === 'desc' ? 'DESC' : 'ASC'
        orderClause = `
          ORDER BY 
            CASE WHEN ${sortField} IS NULL OR ${sortField} = '' THEN 1 ELSE 0 END ASC,
            ${sortField} ${direction}
        `
        if (sortField === 'last_name') {
          orderClause += `, first_name ${direction}`
        }
      }
    }

    const dataQuery = `
      SELECT * FROM (${resolvedSubQuery})
      ${postFilter}
      ${orderClause}
      LIMIT ? OFFSET ?
    `
    const dataParams = [...subQueryParams, ...postParams, limit, offset]

    const countQuery = `
      SELECT COUNT(*) as total FROM (${resolvedSubQuery})
      ${postFilter}
    `
    const countParams = [...subQueryParams, ...postParams]

    const students = db.prepare(dataQuery).all(...dataParams) as Record<string, unknown>[]
    const mappedStudents = students.map((s) => ({
      ...s,
      class: s.resolved_class,
      siblings: s.siblings ? JSON.parse(s.siblings as string) : []
    }))

    const countResult = db.prepare(countQuery).get(...countParams) as { total: number }

    return { students: mappedStudents, total: countResult.total }
  }

  static getById(id: string, targetSchoolYear?: string): Record<string, unknown> | null {
    let yearQuery = `REPLACE((SELECT value FROM settings WHERE key = 'school_year'), '"', '')`
    const params: unknown[] = [id]

    if (targetSchoolYear) {
      yearQuery = '?'
      params.unshift(targetSchoolYear, targetSchoolYear, targetSchoolYear, targetSchoolYear)
    }

    const student = db
      .prepare(
        `
      SELECT *,
        COALESCE(
                 (SELECT class_name FROM student_fees sf
                  WHERE sf.student_id = students.id AND REPLACE(sf.school_year, '"', '') = ${yearQuery} AND sf.class_name IS NOT NULL AND sf.class_name != ''),
                 (SELECT class_name FROM student_fees sf
                  WHERE sf.student_id = students.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
                  ORDER BY sf.school_year DESC LIMIT 1),
                 NULLIF(NULLIF(class, 'Classe non spécifiée'), 'Non inscrit'),
                 NULLIF(class, 'Classe non spécifiée'),
                 'Non spécifiée'
        ) as resolved_class,
        CASE
          WHEN departure_date IS NOT NULL THEN 'Quitté'
          WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = students.id AND REPLACE(sf.school_year, '"', '') = ${yearQuery}) THEN 'Inscrit'
          WHEN (class IS NOT NULL AND class != '' AND class != 'Classe non spécifiée' AND class != 'Non inscrit') THEN 'Inscrit'
          WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = students.id AND REPLACE(sf.school_year, '"', '') > ${yearQuery}) THEN 'Pré-inscrit'
          WHEN EXISTS (SELECT 1 FROM student_fees sf WHERE sf.student_id = students.id AND REPLACE(sf.school_year, '"', '') < ${yearQuery}) THEN 'Ancien'
          ELSE 'Non inscrit'
        END as student_status,
        (SELECT school_year FROM student_fees sf
         WHERE sf.student_id = students.id AND sf.class_name IS NOT NULL AND sf.class_name != ''
         ORDER BY school_year DESC LIMIT 1) as status_year
      FROM students
      WHERE id = ?
    `
      )
      .get(...params) as Record<string, unknown> | undefined

    if (!student) return null

    student.class = student.resolved_class
    delete student.resolved_class
    student.siblings = student.siblings ? JSON.parse(student.siblings as string) : []

    const allFees = db
      .prepare('SELECT * FROM student_fees WHERE student_id = ? ORDER BY school_year DESC')
      .all(id) as Record<string, unknown>[]
    const schoolYear = targetSchoolYear || this.getSetting('school_year') || '2025-2026'

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

    // Parse JSON fields in student if any
    student.is_personnel_child = this.parseBoolean(student.is_personnel_child)

    allFees.forEach((f) => {
      try {
        if (typeof f.canteen_days === 'string') {
          f.canteen_days = JSON.parse(f.canteen_days as string)
        }
        if (typeof f.uniform_items_purchased === 'string') {
          f.uniform_items_purchased = JSON.parse(f.uniform_items_purchased as string)
        }
        if (typeof f.tuition_paid_months === 'string') {
          f.tuition_paid_months = JSON.parse(f.tuition_paid_months as string)
        }
      } catch (e) {
        let isHandled = false
        if (
          typeof f.uniform_items_purchased === 'string' &&
          !f.uniform_items_purchased.startsWith('[')
        ) {
          f.uniform_items_purchased = f.uniform_items_purchased
            ? f.uniform_items_purchased.split(',').filter(Boolean)
            : []
          isHandled = true
        }
        if (typeof f.canteen_days === 'string' && !f.canteen_days.startsWith('[')) {
          f.canteen_days = f.canteen_days ? f.canteen_days.split(',').filter(Boolean) : []
          isHandled = true
        }

        if (!isHandled) {
          console.error('Error parsing fee JSON fields:', e)
        }
      }

      // Parse boolean fields to avoid "0.0" truthiness
      StudentRepository.feeFields.forEach((field) => {
        if (f[field] !== undefined) {
          if (!field.includes('days') && !field.includes('route') && !field.includes('items')) {
            f[field] = this.parseBoolean(f[field])
          }
        }
      })
    })

    const payments = db
      .prepare('SELECT * FROM student_payments WHERE student_id = ? ORDER BY payment_date DESC')
      .all(id)

    return { student, fees, feesHistory: allFees, payments }
  }

  static update(
    id: string,
    updates: Record<string, unknown>
  ): { success: boolean; student?: Record<string, unknown>; error?: string } {
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
          const values = Object.values(studentUpdates).map((val) =>
            typeof val === 'boolean' ? (val ? 1 : 0) : val ?? null
          )

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

          // If class or personnel status changed, update fee record too
          if (
            studentUpdates.class !== undefined ||
            studentUpdates.is_personnel_child !== undefined ||
            studentUpdates.parent_personnel_id !== undefined
          ) {
            const currentClass =
              studentUpdates.class !== undefined
                ? (studentUpdates.class as string)
                : (
                    db.prepare('SELECT class FROM students WHERE id = ?').get(id) as
                      | { class?: string }
                      | undefined
                  )?.class || ''

            const dbStudent = db
              .prepare('SELECT is_personnel_child FROM students WHERE id = ?')
              .get(id) as { is_personnel_child?: unknown } | undefined
            const dbIsPersonnelChild = this.parseBoolean(dbStudent?.is_personnel_child)

            const currentIsPersonnelChild =
              studentUpdates.is_personnel_child !== undefined
                ? this.parseBoolean(studentUpdates.is_personnel_child)
                : studentUpdates.parent_personnel_id !== undefined
                  ? Boolean(studentUpdates.parent_personnel_id)
                  : dbIsPersonnelChild

            if (studentUpdates.class !== undefined) {
              feeUpdates.class_name = currentClass
              const config = this.resolveTuitionConfig(currentClass)
              feeUpdates.tuition_level = config.key || this.determineTuitionLevel(currentClass)
            }
            feeUpdates.monthly_tuition = this.getTuitionPrice(
              currentClass,
              Boolean(currentIsPersonnelChild)
            )
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
              if (Array.isArray(val)) {
                validFeeUpdates[k] = JSON.stringify(val)
              } else {
                validFeeUpdates[k] = typeof val === 'boolean' ? (val ? 1 : 0) : val ?? null
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

              addToSyncQueue('student_fees', feeRecord.id, 'update', {
                ...validFeeUpdates,
                student_id: id
              })
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
            let isPersonnelChild = studentUpdates.is_personnel_child as boolean
            if (isPersonnelChild === undefined) {
              const currentStudentPC = db
                .prepare('SELECT is_personnel_child FROM students WHERE id = ?')
                .get(id) as { is_personnel_child?: unknown } | undefined
              isPersonnelChild = this.parseBoolean(currentStudentPC?.is_personnel_child)
            }
            const tuitionFee = this.getTuitionPrice(className, isPersonnelChild)

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
              if (Array.isArray(val)) {
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

  static delete(id: string): { success: boolean; error?: string } {
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

  static async repairSync(): Promise<{ success: boolean; error?: string }> {
    try {
      db.prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('last_sync_time', '\"2020-01-01T00:00:00.000Z\"', CURRENT_TIMESTAMP)"
      ).run()
      db.prepare(
        "UPDATE sync_queue SET error_message = NULL WHERE status = 'synced' AND error_message IS NOT NULL"
      ).run()
      db.prepare(
        "UPDATE sync_queue SET status = 'pending', error_message = NULL WHERE status IN ('skipped', 'error')"
      ).run()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static async resetDatabase(
    includeRemote: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (includeRemote) {
        await wipeRemoteData()
      }

      // 1. Delete Attendance & Event Payments
      db.prepare('DELETE FROM bus_attendance').run()
      db.prepare('DELETE FROM canteen_attendance').run()
      db.prepare('DELETE FROM event_payments').run()

      // 2. Delete Core Student Data
      db.prepare('DELETE FROM cash_journal WHERE related_student_id IS NOT NULL').run()
      db.prepare('DELETE FROM student_payments').run()
      db.prepare('DELETE FROM student_fees').run()
      db.prepare('DELETE FROM students').run()

      // 3. Clear Sync Queue for student related tables only
      db.prepare(
        `
        DELETE FROM sync_queue 
        WHERE table_name IN ('students', 'student_fees', 'student_payments', 'event_payments', 'bus_attendance', 'canteen_attendance')
      `
      ).run()

      // Reset other tables as needed
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  static reEnroll(
    id: string,
    newClass: string,
    targetYear: string,
    initialPaymentDroit?: number,
    initialPaymentFram?: number,
    isNewStudentOverride?: boolean
  ): { success: boolean; error?: string } {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!student) return { success: false, error: 'Student not found' }

    // Check if already enrolled
    const existingFee = db
      .prepare('SELECT id FROM student_fees WHERE student_id = ? AND school_year = ?')
      .get(id, targetYear)
    if (existingFee) return { success: false, error: 'Student already enrolled for this year' }

    const level = this.determineTuitionLevel(newClass)
    const currentStudentPC = db
      .prepare('SELECT is_personnel_child FROM students WHERE id = ?')
      .get(id) as { is_personnel_child?: unknown } | undefined
    const isPersonnelChild = this.parseBoolean(currentStudentPC?.is_personnel_child)

    const tuitionFee = this.getTuitionPrice(newClass, isPersonnelChild)

    const transaction = db.transaction(() => {
      const isNewStudent =
        isNewStudentOverride !== undefined
          ? isNewStudentOverride
          : !student.class || student.class === 'Classe non spécifiée'

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
      const isFramFullyPaid = initialPaymentFram && initialPaymentFram >= 25000 // Approximate check
      db.prepare(
        `
            INSERT INTO student_fees (
                id, student_id, school_year, tuition_level, monthly_tuition, class_name, fram_paid_by_parent, is_reenrollment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        feeId,
        id,
        targetYear,
        level,
        tuitionFee,
        newClass,
        isFramFullyPaid ? 1 : 0,
        !isNewStudent ? 1 : 0
      )

      addToSyncQueue('student_fees', feeId, 'create', {
        id: feeId,
        student_id: id,
        school_year: targetYear,
        tuition_level: level,
        monthly_tuition: tuitionFee,
        class_name: newClass,
        fram_paid_by_parent: isFramFullyPaid ? 1 : 0,
        is_reenrollment: !isNewStudent ? 1 : 0
      })

      const currentDate = new Date().toISOString().split('T')[0]

      // Create Fram Payment Record if > 0
      if (initialPaymentFram && initialPaymentFram > 0) {
        const paymentId = uuidv4()
        const desc = 'Cotisation FRAM'

        db.prepare(
          `
            INSERT INTO student_payments (
                id, student_id, amount, payment_date, payment_type, payment_method, description, school_year
            ) VALUES (?, ?, ?, ?, 'fram', 'cash', ?, ?)
          `
        ).run(paymentId, id, initialPaymentFram, currentDate, desc, targetYear)

        addToSyncQueue('student_payments', paymentId, 'create', {
          id: paymentId,
          student_id: id,
          amount: initialPaymentFram,
          payment_date: currentDate,
          payment_type: 'fram',
          payment_method: 'cash',
          description: desc,
          school_year: targetYear
        })

        // Add to cash_journal
        const cashId = uuidv4()
        const cashDesc = `Paiement ${desc} — ${student.last_name} ${student.first_name}`
        db.prepare(
          `
          INSERT INTO cash_journal (id, transaction_date, type, department, category, amount, description, payment_method, related_student_id)
          VALUES (?, ?, 'income', 'eleve', 'divers', ?, ?, 'cash', ?)
        `
        ).run(cashId, currentDate, initialPaymentFram, cashDesc, id)

        addToSyncQueue('cash_journal', cashId, 'create', {
          id: cashId,
          transaction_date: currentDate,
          type: 'income',
          department: 'eleve',
          category: 'divers',
          amount: initialPaymentFram,
          description: cashDesc,
          payment_method: 'cash',
          related_student_id: id
        })
      }

      // Create Enrollment Payment Record if > 0
      if (initialPaymentDroit && initialPaymentDroit > 0) {
        const paymentId = uuidv4()
        const paymentType = isNewStudent ? 'enrollment' : 'reenrollment'
        const desc = isNewStudent ? "Droits d'inscription" : 'Droits de réinscription'

        db.prepare(
          `
            INSERT INTO student_payments (
                id, student_id, amount, payment_date, payment_type, payment_method, description, school_year
            ) VALUES (?, ?, ?, ?, ?, 'cash', ?, ?)
          `
        ).run(paymentId, id, initialPaymentDroit, currentDate, paymentType, desc, targetYear)

        addToSyncQueue('student_payments', paymentId, 'create', {
          id: paymentId,
          student_id: id,
          amount: initialPaymentDroit,
          payment_date: currentDate,
          payment_type: paymentType,
          payment_method: 'cash',
          description: desc,
          school_year: targetYear
        })

        // Add to cash_journal
        const cashId = uuidv4()
        const cashDesc = `Paiement ${desc} — ${student.last_name} ${student.first_name}`
        const cashCategory = isNewStudent ? 'inscription' : 'réinscription'
        db.prepare(
          `
          INSERT INTO cash_journal (id, transaction_date, type, department, category, amount, description, payment_method, related_student_id)
          VALUES (?, ?, 'income', 'eleve', ?, ?, ?, 'cash', ?)
        `
        ).run(cashId, currentDate, cashCategory, initialPaymentDroit, cashDesc, id)

        addToSyncQueue('cash_journal', cashId, 'create', {
          id: cashId,
          transaction_date: currentDate,
          type: 'income',
          department: 'eleve',
          category: cashCategory,
          amount: initialPaymentDroit,
          description: cashDesc,
          payment_method: 'cash',
          related_student_id: id
        })
      }
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

  static getServiceStats(): {
    canteenStats: Record<string, number>
    busStats: Record<string, number>
    totalStudents: number
  } {
    const schoolYear = this.getSetting('school_year') || '2025-2026'

    const rows = db
      .prepare(
        `
          SELECT canteen_days, canteen_subscribed, bus_route, bus_subscribed 
          FROM student_fees 
          WHERE school_year = ?
      `
      )
      .all(schoolYear) as {
      canteen_subscribed: number
      canteen_days: string
      bus_subscribed: number
      bus_route: string
    }[]

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
        } catch {
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

  static repairEnrollments(targetYear: string = '2025-2026'): {
    success: boolean
    repaired: number
    error?: string
  } {
    const students = db
      .prepare(
        "SELECT id, class, is_personnel_child FROM students WHERE class IS NOT NULL AND class != ''"
      )
      .all() as { id: string; class: string; is_personnel_child: number | null }[]
    let fixedCount = 0

    const transaction = db.transaction(() => {
      for (const student of students) {
        const existingFee = db
          .prepare('SELECT id FROM student_fees WHERE student_id = ? AND school_year = ?')
          .get(student.id, targetYear)

        if (!existingFee) {
          const level = this.determineTuitionLevel(student.class)
          const tuitionFee = this.getTuitionPrice(
            student.class,
            Boolean(student.is_personnel_child)
          )
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
      return { success: true, repaired: fixedCount }
    } catch (error: unknown) {
      const message = this.translateError(error)
      console.error('Error updating student:', error)
      return { success: false, repaired: 0, error: message }
    }
  }
}
