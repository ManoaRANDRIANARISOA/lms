import { create } from 'zustand'
import type { Subject, GradeWithSubject, StudentTermAverage, SubjectClassAverage } from '@shared/types'

interface GradeStore {
  subjects: Subject[]
  grades: GradeWithSubject[]
  classGrades: (GradeWithSubject & { first_name: string; last_name: string; class: string })[]
  studentAverage: { average: number; totalCoefficient: number } | null
  classAverages: SubjectClassAverage[]
  classRanking: StudentTermAverage[]
  loading: boolean
  error: string | null

  fetchSubjects: () => Promise<void>
  createSubject: (data: Pick<Subject, 'name' | 'default_coefficient'>) => Promise<boolean>
  updateSubject: (id: string, data: Partial<Pick<Subject, 'name' | 'default_coefficient'>>) => Promise<boolean>
  deleteSubject: (id: string) => Promise<boolean>

  fetchGradesByStudent: (studentId: string, schoolYear: string, term?: number) => Promise<void>
  createGrade: (data: any) => Promise<boolean>
  updateGrade: (id: string, data: any) => Promise<boolean>
  deleteGrade: (id: string) => Promise<boolean>

  fetchGradesByClass: (className: string, schoolYear: string, term: number) => Promise<void>
  fetchStudentAverage: (studentId: string, schoolYear: string, term: number) => Promise<void>
  fetchClassAverages: (className: string, schoolYear: string, term: number) => Promise<void>
  fetchClassRanking: (className: string, schoolYear: string, term: number) => Promise<void>
}

export const useGradeStore = create<GradeStore>((set, get) => ({
  subjects: [],
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch subjects error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create subject error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Update subject error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Delete subject error:', error)
      set({ error: error.message, loading: false })
      return false
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch grades error:', error)
      set({ error: error.message, loading: false })
    }
  },

  createGrade: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.createGrade(data)
      if (result.success) {
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Create grade error:', error)
      set({ error: error.message, loading: false })
      return false
    }
  },

  updateGrade: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.grade.updateGrade(id, data)
      if (result.success) {
        set({ loading: false })
        return true
      } else {
        set({ error: result.error, loading: false })
        return false
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Update grade error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Delete grade error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch class grades error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch student average error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch class averages error:', error)
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Fetch class ranking error:', error)
      set({ error: error.message, loading: false })
    }
  }
}))
