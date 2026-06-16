import { useAppStore } from '@/store/useAppStore'
/**
 * GradeBook.tsx — Carnet de notes (Vue par classe)
 *
 * Affiche un tableau croisé : élèves en lignes, matières en colonnes.
 * Utilise class_subjects pour déterminer les matières de la classe sélectionnée.
 * Dernière colonne = moyenne générale + rang.
 *
 * @module pages/grades/GradeBook
 */

import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGradeStore } from '@/store/useGradeStore'
import { useClasses } from '@/lib/useClasses'
import type { StudentTermAverage, ClassSubject } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, BookOpen, TrendingUp, Award } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

interface GradeCell {
  grade: number
  coefficient: number
  gradeId: string
}

export default function GradeBook(): React.JSX.Element {
  const navigate = useNavigate()
  const {
    classSubjects, fetchClassSubjects,
    classGrades, classAverages, classRanking,
    fetchGradesByClass, fetchClassSubjectAverages, fetchClassRanking,
    loading
  } = useGradeStore()

  const { classes: ALL_CLASSES } = useClasses()
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTerm, setSelectedTerm] = useState(1)
  const [schoolYear, setSchoolYear] = useState(useAppStore.getState().currentYear)

  const [assessments, setAssessments] = useState<any[]>([])

  useEffect(() => {
    if (selectedClass) {
      fetchClassSubjects(selectedClass)
      loadAssessments()
    } else {
      setAssessments([])
    }
  }, [selectedClass])

  const loadAssessments = async () => {
    if (!selectedClass || !window.api) return
    try {
      const result = await window.api.assessment.list(schoolYear, selectedClass)
      if (result.success && result.assessments) {
        setAssessments(result.assessments)
      } else {
        setAssessments([])
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (selectedClass) {
      fetchGradesByClass(selectedClass, schoolYear, selectedTerm)
      fetchClassSubjectAverages(selectedClass, schoolYear, selectedTerm)
      fetchClassRanking(selectedClass, schoolYear, selectedTerm)
    }
  }, [selectedClass, selectedTerm, schoolYear])

  // Build matrix: studentId -> { subjectId -> GradeCell }
  const matrix = useMemo(() => {
    const map: Record<string, Record<string, GradeCell>> = {}
    for (const g of classGrades) {
      if (!map[g.student_id]) map[g.student_id] = {}
      map[g.student_id][g.subject_id] = {
        grade: g.grade,
        coefficient: g.class_coefficient ?? g.coefficient ?? 1,
        gradeId: g.id
      }
    }
    return map
  }, [classGrades])

  const studentsInClass = useMemo(() => {
    const seen = new Set<string>()
    const list: { id: string; first_name: string; last_name: string }[] = []
    for (const g of classGrades) {
      if (!seen.has(g.student_id)) {
        seen.add(g.student_id)
        list.push({ id: g.student_id, first_name: g.first_name, last_name: g.last_name })
      }
    }
    return list
  }, [classGrades])

  // Use class_subjects for the subject list (ordered by position)
  const subjectList = useMemo(() => {
    if (classSubjects.length > 0) {
      return classSubjects.map((cs: ClassSubject) => ({
        id: cs.subject_id,
        name: cs.subject_name || '',
        coefficient: cs.coefficient
      }))
    }
    // Fallback: derive from grades if no class_subjects yet
    const seen = new Set<string>()
    const list: { id: string; name: string; coefficient: number }[] = []
    for (const g of classGrades) {
      if (!seen.has(g.subject_id)) {
        seen.add(g.subject_id)
        list.push({ id: g.subject_id, name: g.subject_name || '', coefficient: g.class_coefficient ?? g.coefficient ?? 1 })
      }
    }
    return list
  }, [classSubjects, classGrades])

  const rankingMap = useMemo(() => {
    const map: Record<string, StudentTermAverage> = {}
    for (const r of classRanking) {
      map[r.student_id] = r
    }
    return map
  }, [classRanking])

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="grades" />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/grades')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Carnet de notes</h1>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl border shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Classe</Label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">— Choisir —</option>
            {ALL_CLASSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {ALL_CLASSES.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Aucune classe configurée. Ajoutez des classes dans Paramètres.</p>
          )}
        </div>
        <div>
          <Label>Trimestre/Examen</Label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(Number(e.target.value))}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            {assessments.length === 0 ? (
              <>
                <option value={1}>Trimestre 1</option>
                <option value={2}>Trimestre 2</option>
                <option value={3}>Trimestre 3</option>
              </>
            ) : (
              assessments.map(a => (
                <option key={a.id} value={a.term_value}>{a.name}</option>
              ))
            )}
          </select>
        </div>
        <div>
          <Label>Année scolaire</Label>
          <Input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={() => navigate('/grades/entry')}>
            <BookOpen className="w-4 h-4 mr-2" />
            Saisie des notes
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground">Chargement...</p>}

      {selectedClass && (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left font-medium text-gray-600 sticky left-0 bg-gray-50 z-10">Élève</th>
                {subjectList.map((s) => (
                  <th key={s.id} className="px-3 py-3 text-center font-medium text-gray-600 min-w-[80px]">
                    {s.name}
                    <span className="block text-xs text-muted-foreground font-normal">coef. {s.coefficient}</span>
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium text-gray-600 bg-blue-50">
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  Moy.
                </th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 bg-amber-50">
                  <Award className="w-4 h-4 inline mr-1" />
                  Rang
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {studentsInClass.length === 0 && classSubjects.length === 0 && (
                <tr>
                  <td colSpan={subjectList.length + 3} className="px-3 py-8 text-center text-muted-foreground">
                    Aucune note enregistrée pour cette classe.<br />
                    <button
                      onClick={() => navigate('/grades/entry')}
                      className="text-primary hover:underline text-sm mt-1"
                    >
                      Aller à la saisie des notes →
                    </button>
                  </td>
                </tr>
              )}
              {studentsInClass.length === 0 && classSubjects.length > 0 && (
                <tr>
                  <td colSpan={subjectList.length + 3} className="px-3 py-8 text-center text-muted-foreground">
                    Aucun élève avec des notes dans cette classe.
                  </td>
                </tr>
              )}
              {studentsInClass.map((st) => {
                const rankInfo = rankingMap[st.id]
                return (
                  <tr key={st.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium sticky left-0 bg-white z-10">
                      <button
                        className="text-left hover:text-primary hover:underline"
                        onClick={() => navigate(`/grades/report/${st.id}?year=${schoolYear}&term=${selectedTerm}`)}
                      >
                        {st.last_name} {st.first_name}
                      </button>
                    </td>
                    {subjectList.map((subj) => {
                      const cell = matrix[st.id]?.[subj.id]
                      return (
                        <td key={subj.id} className="px-3 py-3 text-center">
                          {cell ? (
                            <span className={`font-semibold ${cell.grade < 10 ? 'text-red-600' : cell.grade >= 14 ? 'text-green-600' : 'text-amber-600'}`}>
                              {cell.grade.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-3 text-center font-bold bg-blue-50/50">
                      {rankInfo ? rankInfo.average.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-bold bg-amber-50/50">
                      {rankInfo ? rankInfo.rank : '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Class averages row */}
              {classAverages.length > 0 && (
                <tr className="bg-gray-100 font-semibold border-t-2">
                  <td className="px-3 py-3 sticky left-0 bg-gray-100 z-10">Moyenne classe</td>
                  {subjectList.map((subj) => {
                    const avg = classAverages.find((a) => a.subject_id === subj.id)
                    return (
                      <td key={subj.id} className="px-3 py-3 text-center">
                        {avg ? avg.average.toFixed(2) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-3 text-center bg-blue-50/50">—</td>
                  <td className="px-3 py-3 text-center bg-amber-50/50">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
