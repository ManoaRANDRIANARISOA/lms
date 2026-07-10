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
import { ArrowLeft, BookOpen, TrendingUp, Award, Layers } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

interface GradeCell {
  grade: number
  coefficient: number
  gradeId: string
}

export default function GradeBook(): React.JSX.Element {
  const navigate = useNavigate()
  const {
    classSubjects,
    fetchClassSubjects,
    classGrades,
    classAverages,
    classRanking,
    fetchGradesByClass,
    fetchClassSubjectAverages,
    fetchClassRanking,
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
        list.push({
          id: g.subject_id,
          name: g.subject_name || '',
          coefficient: g.class_coefficient ?? g.coefficient ?? 1
        })
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
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          Carnet de notes
        </h1>
      </div>

      {/* Top Bar: Class Selection */}
      <div className="flex items-center gap-2 flex-wrap pb-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 font-medium text-sm">
          <Layers className="w-4 h-4" />
          Classes :
        </div>

        {ALL_CLASSES.map((c) => (
          <React.Fragment key={c}>
            {['CP1', '6ème', '2nde', 'TPS'].includes(c) && (
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 mr-1 shrink-0">
                {c === 'CP1'
                  ? 'Primaire'
                  : c === '6ème'
                    ? 'Collège'
                    : c === '2nde'
                      ? 'Lycée'
                      : 'Autres'}
              </div>
            )}
            {c === 'PS' && (
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 mr-1 shrink-0">
                Préscolaire
              </div>
            )}
            <button
              onClick={() => setSelectedClass(c)}
              className={`shrink-0 px-4 py-2 rounded-full transition-all text-sm ${
                selectedClass === c
                  ? 'bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border hover:border-gray-300'
              }`}
            >
              {c}
            </button>
          </React.Fragment>
        ))}
        {ALL_CLASSES.length === 0 && (
          <p className="text-xs text-amber-600 ml-2">
            Aucune classe configurée. Ajoutez des classes dans Paramètres.
          </p>
        )}
      </div>

      {/* Secondary Filtres (Trimestre, Année) */}
      <div className="bg-white rounded-2xl border shadow-sm p-5 flex flex-col md:flex-row gap-6 items-end">
        <div className="flex-1 w-full md:max-w-md">
          <Label className="text-gray-500 text-xs uppercase tracking-wider mb-2 block">
            Trimestre / Évaluation
          </Label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(Number(e.target.value))}
            className="w-full border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all"
          >
            {assessments.length === 0 ? (
              <>
                <option value={1}>Trimestre 1</option>
                <option value={2}>Trimestre 2</option>
                <option value={3}>Trimestre 3</option>
              </>
            ) : (
              assessments.map((a) => (
                <option key={a.id} value={a.term_value}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="w-full md:w-48">
          <Label className="text-gray-500 text-xs uppercase tracking-wider mb-2 block">
            Année scolaire
          </Label>
          <Input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="border-gray-200 rounded-lg bg-gray-50 focus:bg-white"
          />
        </div>
        <div className="flex items-end ml-auto">
          <Button onClick={() => navigate('/grades/entry')} className="shadow-sm">
            <BookOpen className="w-4 h-4 mr-2" />
            Saisie des notes
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground">Chargement...</p>}

      {selectedClass && (
        <div className="bg-white rounded-2xl border shadow-sm w-full">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px] text-left">
              <thead className="bg-gray-50/80 border-b">
                <tr>
                  <th className="px-6 py-5 font-semibold text-gray-600 sticky left-0 bg-gray-50/95 z-10 whitespace-nowrap border-r border-gray-100 shadow-[1px_0_0_0_#f3f4f6]">
                    Élève
                  </th>
                  {subjectList.map((s) => (
                    <th
                      key={s.id}
                      className="px-4 py-5 text-center font-semibold text-gray-600 min-w-[100px]"
                    >
                      <div className="line-clamp-1" title={s.name}>
                        {s.name}
                      </div>
                      <span className="block text-xs text-gray-400 font-normal mt-1">
                        coef. {s.coefficient}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-5 text-center font-semibold text-primary bg-blue-50/50 min-w-[100px]">
                    <TrendingUp className="w-4 h-4 inline mr-1.5" />
                    Moyenne
                  </th>
                  <th className="px-4 py-5 text-center font-semibold text-amber-600 bg-amber-50/50 min-w-[100px]">
                    <Award className="w-4 h-4 inline mr-1.5" />
                    Rang
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {studentsInClass.length === 0 && classSubjects.length === 0 && (
                  <tr>
                    <td
                      colSpan={subjectList.length + 3}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Aucune note enregistrée pour cette classe.
                      <br />
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
                    <td
                      colSpan={subjectList.length + 3}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Aucun élève avec des notes dans cette classe.
                    </td>
                  </tr>
                )}
                {studentsInClass.map((st) => {
                  const rankInfo = rankingMap[st.id]
                  return (
                    <tr key={st.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-50 group-hover:bg-blue-50/30">
                        <button
                          className="text-left hover:text-primary hover:underline transition-all"
                          onClick={() =>
                            navigate(
                              `/grades/report/${st.id}?year=${schoolYear}&term=${selectedTerm}`
                            )
                          }
                        >
                          {st.last_name} {st.first_name}
                        </button>
                      </td>
                      {subjectList.map((subj) => {
                        const cell = matrix[st.id]?.[subj.id]
                        return (
                          <td key={subj.id} className="px-4 py-4 text-center">
                            {cell ? (
                              <span
                                className={`inline-flex items-center justify-center w-12 h-8 rounded-md font-bold text-[13px] ${
                                  cell.grade < 10
                                    ? 'bg-red-50 text-red-600'
                                    : cell.grade >= 14
                                      ? 'bg-green-50 text-green-700'
                                      : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {cell.grade.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-4 text-center font-bold text-primary bg-blue-50/30">
                        {rankInfo ? rankInfo.average.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-amber-700 bg-amber-50/30">
                        {rankInfo ? (
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm border border-amber-100">
                            {rankInfo.rank}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
                {/* Class averages row */}
                {classAverages.length > 0 && (
                  <tr className="bg-gray-50/80 font-bold border-t-2 border-gray-200">
                    <td className="px-6 py-5 sticky left-0 bg-gray-50/95 z-10 border-r border-gray-200 text-gray-700">
                      Moyenne classe
                    </td>
                    {subjectList.map((subj) => {
                      const avg = classAverages.find((a) => a.subject_id === subj.id)
                      return (
                        <td key={subj.id} className="px-4 py-5 text-center text-gray-600">
                          {avg ? avg.average.toFixed(2) : '—'}
                        </td>
                      )
                    })}
                    <td className="px-4 py-5 text-center bg-blue-50/50 text-gray-500">—</td>
                    <td className="px-4 py-5 text-center bg-amber-50/50 text-gray-500">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
