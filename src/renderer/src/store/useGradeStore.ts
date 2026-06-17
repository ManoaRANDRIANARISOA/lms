import { create } from 'zustand'
import type {
  Subject,
  GradeWithSubject,
  StudentTermAverage,
  SubjectClassAverage,
  ClassSubject,
  ClassSubjectInput
} from '@shared/types'
import { handleStoreError } from '@/lib/store-utils'

interface GradeStore {
  subjects: Subject[]
  classSubjects: ClassSubject[]
  allClassSubjects: ClassSubject[]
  grades: GradeWithSubject[]
  classGrades: (GradeWithSubject & {
    first_name: string
    last_name: string
    class: string
    class_coefficient: number
  })[]
  studentAverage: { average: number; totalCoefficient: number } | null
  classAverages: SubjectClassAverage[]
  classRanking: StudentTermAverage[]
  loading: boolean
  error: string | null

  fetchSubjects: () => Promise<void>
  createSubject: (data: Pick<Subject, 'name' | 'default_coefficient'>) => Promise<boolean>
  updateSubject: (
    id: string,
    data: Partial<Pick<Subject, 'name' | 'default_coefficient'>>
  ) => Promise<boolean>
  deleteSubject: (id: string) => Promise<boolean>

  fetchClassSubjects: (className: string) => Promise<void>
  fetchAllClassSubjects: () => Promise<void>
  createClassSubject: (data: ClassSubjectInput) => Promise<boolean>
  updateClassSubject: (id: string, data: Partial<ClassSubjectInput>) => Promise<boolean>
  deleteClassSubject: (id: string) => Promise<boolean>
  fetchClassesWithSubjects: () => Promise<string[]>

  fetchGradesByStudent: (studentId: string, schoolYear: string, term?: number) => Promise<void>
  createGrade: (data: Record<string, unknown>) => Promise<boolean>
  updateGrade: (id: string, data: Record<string, unknown>) => Promise<boolean>
  deleteGrade: (id: string) => Promise<boolean>

  fetchGradesByClass: (className: string, schoolYear: string, term: number) => Promise<void>
  fetchStudentAverage: (studentId: string, schoolYear: string, term: number) => Promise<void>
  fetchClassAverages: (className: string, schoolYear: string, term: number) => Promise<void>
  fetchClassSubjectAverages: (className: string, schoolYear: string, term: number) => Promise<void>
  fetchClassRanking: (className: string, schoolYear: string, term: number) => Promise<void>
}

export const useGradeStore = create<GradeStore>((set, get) => ({
  subjects: [],
  classSubjects: [],
  allClassSubjects: [],
  grades: [],
  classGrades: [],
  studentAverage: null,
  classAverages: [],
  classRanking: [],
  loading: false,
  error: null,

  // Subjects
  fetchSubjects: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.listSubjects()
      if (result.success) {
        set({ subjects: result.subjects || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch subjects')
    }
  },

  createSubject: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.createSubject(data)
      if (result.success) {
        await get().fetchSubjects()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create subject')
      return false
    }
  },

  updateSubject: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.updateSubject(id, data)
      if (result.success) {
        await get().fetchSubjects()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Update subject')
      return false
    }
  },

  deleteSubject: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.deleteSubject(id)
      if (result.success) {
        await get().fetchSubjects()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete subject')
      return false
    }
  },

  // Class Subjects (Phase 3)
  fetchClassSubjects: async (className) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getClassSubjects(className)
      if (result.success) {
        set({ classSubjects: result.subjects || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch class subjects')
    }
  },

  fetchAllClassSubjects: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getAllClassSubjects()
      if (result.success) {
        set({ allClassSubjects: result.subjects || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch all class subjects')
    }
  },

  createClassSubject: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.createClassSubject(data)
      if (result.success) {
        await get().fetchClassSubjects(data.class_name)
        await get().fetchAllClassSubjects()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create class subject')
      return false
    }
  },

  updateClassSubject: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.updateClassSubject(id, data)
      if (result.success) {
        await get().fetchAllClassSubjects()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Update class subject')
      return false
    }
  },

  deleteClassSubject: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.deleteClassSubject(id)
      if (result.success) {
        await get().fetchAllClassSubjects()
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete class subject')
      return false
    }
  },

  fetchClassesWithSubjects: async () => {
    try {
      const result = await window.api.grade.getClassesWithSubjects()
      if (result.success) {
        return result.classes || []
      }
      return []
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error('Fetch classes with subjects error:', error)
      return []
    }
  },

  // Grades
  fetchGradesByStudent: async (studentId, schoolYear, term) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getGradesByStudent(studentId, schoolYear, term)
      if (result.success) {
        set({ grades: result.grades || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch grades')
    }
  },

  createGrade: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.createGrade(
        data as unknown as Parameters<typeof window.api.grade.createGrade>[0]
      )
      if (result.success) {
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Create grade')
      return false
    }
  },

  updateGrade: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.updateGrade(
        id,
        data as unknown as Parameters<typeof window.api.grade.updateGrade>[1]
      )
      if (result.success) {
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Update grade')
      return false
    }
  },

  deleteGrade: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.deleteGrade(id)
      if (result.success) {
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Delete grade')
      return false
    }
  },

  fetchGradesByClass: async (className, schoolYear, term) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getGradesByClass(className, schoolYear, term)
      if (result.success) {
        set({ classGrades: result.grades || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch class grades')
    }
  },

  fetchStudentAverage: async (studentId, schoolYear, term) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getStudentAverage(studentId, schoolYear, term)
      if (result.success) {
        set({ studentAverage: result.average || null, loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch student average')
    }
  },

  fetchClassAverages: async (className, schoolYear, term) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getClassAverages(className, schoolYear, term)
      if (result.success) {
        set({ classAverages: result.averages || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch class averages')
    }
  },

  fetchClassSubjectAverages: async (className, schoolYear, term) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getClassSubjectAverages(className, schoolYear, term)
      if (result.success) {
        set({ classAverages: result.averages || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch class subject averages')
    }
  },

  fetchClassRanking: async (className, schoolYear, term) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.getClassRanking(className, schoolYear, term)
      if (result.success) {
        set({ classRanking: result.ranking || [], loading: false })
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch class ranking')
    }
  }
}))
