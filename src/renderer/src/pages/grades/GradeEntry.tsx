import { useAppStore } from '@/store/useAppStore'
/**
 * GradeEntry.tsx — Saisie des notes par classe / matière / trimestre
 *
 * Uses class_subjects to determine available subjects and default coefficients per class.
 *
 * @module pages/grades/GradeEntry
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGradeStore } from '@/store/useGradeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useClasses } from '@/lib/useClasses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

interface StudentRow {
  id: string
  first_name: string
  last_name: string
  class: string
  existingGradeId?: string
  grade: string
  grade_journalier: string
  grade_exam: string
  coefficient: string
  comment: string
  behavior: 'none' | 'warning' | 'praise'
}

const BEHAVIOR_LABELS: Record<string, string> = {
  none: '—',
  warning: 'Avertissement',
  praise: 'Encouragement'
}

export default function GradeEntry(): React.JSX.Element {
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)
  const { classSubjects, fetchClassSubjects, createGrade, updateGrade, loading, error } =
    useGradeStore()

  const { classes: ALL_CLASSES } = useClasses()
  const [selectedClass, setSelectedClass] = useState('')
  const [assessments, setAssessments] = useState<any[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedTerm, setSelectedTerm] = useState(1)
  const [schoolYear, setSchoolYear] = useState(useAppStore.getState().currentYear)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (selectedClass) {
      fetchClassSubjects(selectedClass)
      loadAssessments()
    } else {
      setAssessments([])
      setStudents([])
      setSelectedSubject('')
    }
  }, [selectedClass])

  const loadAssessments = async () => {
    if (!selectedClass || !window.api) {
      setAssessments([])
      return
    }
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

  const loadStudents = async () => {
    if (!selectedClass) {
      setStudents([])
      return
    }
    try {
      const result = await window.api.student.list({ class: selectedClass })
      const studentList = result.students || []
      if (studentList.length > 0) {
        const rows: StudentRow[] = studentList.map((s: any) => ({
          id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          class: s.class,
          grade: '',
          grade_journalier: '',
          grade_exam: '',
          coefficient: '1',
          comment: '',
          behavior: 'none'
        }))
        setStudents(rows)
        if (selectedSubject) {
          await loadExistingGrades(rows)
        }
      } else {
        setStudents([])
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Load students error:', e)
      setStudents([])
    }
  }

  const loadExistingGrades = async (rows: StudentRow[]) => {
    try {
      const result = await window.api.grade.getGradesByClass(
        selectedClass,
        schoolYear,
        selectedTerm
      )
      if (result.success && result.grades) {
        const map: Record<string, any> = {}
        for (const g of result.grades) {
          if (g.subject_id === selectedSubject) {
            map[g.student_id] = g
          }
        }
        setStudents(
          rows.map((r) => {
            const existing = map[r.id]
            if (existing) {
              return {
                ...r,
                existingGradeId: existing.id,
                grade: String(existing.grade),
                grade_journalier:
                  existing.grade_journalier != null ? String(existing.grade_journalier) : '',
                grade_exam: existing.grade_exam != null ? String(existing.grade_exam) : '',
                coefficient: String(existing.class_coefficient ?? existing.coefficient ?? 1),
                comment: existing.teacher_comment || '',
                behavior: existing.behavior_note || 'none'
              }
            }
            return r
          })
        )
      }
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    if (selectedClass && selectedSubject) {
      loadStudents()
    }
  }, [selectedClass, selectedSubject, selectedTerm, schoolYear])

  const updateRow = (index: number, field: keyof StudentRow, value: any) => {
    setStudents((prev) => {
      const next = [...prev]
      const row = { ...next[index], [field]: value }

      // Auto-calculate final grade if journalier or exam is changed
      if (field === 'grade_journalier' || field === 'grade_exam') {
        const j = parseFloat(row.grade_journalier)
        const e = parseFloat(row.grade_exam)
        if (!isNaN(j) && !isNaN(e)) {
          row.grade = String((j + e) / 2)
        } else if (!isNaN(j)) {
          row.grade = String(j)
        } else if (!isNaN(e)) {
          row.grade = String(e)
        } else if (isNaN(j) && isNaN(e)) {
          row.grade = ''
        }
      }

      next[index] = row
      return next
    })
  }

  const handleSaveAll = async () => {
    setSaveMsg('')
    let saved = 0
    let failed = 0

    for (const row of students) {
      if (row.grade === '') continue
      const gradeValue = parseFloat(row.grade)
      if (Number.isNaN(gradeValue) || gradeValue < 0 || gradeValue > 20) {
        failed++
        continue
      }

      const payload = {
        student_id: row.id,
        subject_id: selectedSubject,
        school_year: schoolYear,
        term: selectedTerm,
        grade: gradeValue,
        grade_journalier: row.grade_journalier !== '' ? parseFloat(row.grade_journalier) : null,
        grade_exam: row.grade_exam !== '' ? parseFloat(row.grade_exam) : null,
        coefficient: parseFloat(row.coefficient) || 1,
        teacher_comment: row.comment || null,
        behavior_note: row.behavior
      }

      let ok = false
      if (row.existingGradeId) {
        const res = await updateGrade(row.existingGradeId, payload)
        ok = res
      } else {
        const res = await createGrade(payload)
        ok = res
      }
      if (ok) saved++
      else failed++
    }

    setSaveMsg(`${saved} note(s) enregistrée(s). ${failed > 0 ? failed + ' erreur(s).' : ''}`)
    if (saved > 0) {
      await loadStudents()
    }
  }

  const selectedSubjectInfo = classSubjects.find((cs) => cs.subject_id === selectedSubject)

  const isPrimaryOrPreschool = /^(PS|MS|GS|CP|CE|CM)/i.test(selectedClass)
  const label1 = isPrimaryOrPreschool ? 'Semi-Trim' : 'Journ.'
  const label2 = isPrimaryOrPreschool ? 'Trimestriel' : 'Exam'

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="grades" />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/grades')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Saisie des notes</h1>
      </div>

      {error && <p className="text-red-600 bg-red-50 p-3 rounded">{error}</p>}
      {saveMsg && (
        <p
          className={`p-3 rounded ${saveMsg.includes('erreur') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}
        >
          {saveMsg}
        </p>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Classe</Label>
          <select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value)
              setSelectedSubject('')
            }}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">— Choisir —</option>
            {ALL_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {ALL_CLASSES.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Aucune classe configurée. Ajoutez des classes dans Paramètres.
            </p>
          )}
        </div>
        <div>
          <Label>Matière</Label>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">— Choisir —</option>
            {classSubjects.map((cs) => (
              <option key={cs.subject_id} value={cs.subject_id}>
                {cs.subject_name} (coef. {cs.coefficient})
              </option>
            ))}
          </select>
          {selectedClass && classSubjects.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Aucune matière configurée pour cette classe.
              <button
                onClick={() => navigate('/grades/subjects')}
                className="underline hover:text-amber-800 ml-1"
              >
                Configurer les matières
              </button>
              .
            </p>
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
              assessments.map((a) => (
                <option key={a.id} value={a.term_value}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <Label>Année scolaire</Label>
          <Input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} />
        </div>
      </div>

      {/* Coefficient info banner */}
      {selectedSubjectInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <span className="font-medium">{selectedSubjectInfo.subject_name}</span>
          {' — '}Coefficient par défaut: {selectedSubjectInfo.subject_default_coefficient ?? 1}
          {' | '}Coefficient pour {selectedClass}:{' '}
          <span className="font-bold">{selectedSubjectInfo.coefficient}</span>
        </div>
      )}

      {/* Tableau de saisie */}
      {students.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Élève</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">{label1}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">{label2}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-24">Note Déf.</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">Coef.</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Commentaire</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">Comportement</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((row, idx) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {row.last_name} {row.first_name}
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      value={row.grade_journalier}
                      onChange={(e) => updateRow(idx, 'grade_journalier', e.target.value)}
                      disabled={!canWrite('grades')}
                      className="w-16"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      value={row.grade_exam}
                      onChange={(e) => updateRow(idx, 'grade_exam', e.target.value)}
                      disabled={!canWrite('grades')}
                      className="w-16"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      step={0.25}
                      value={row.grade}
                      onChange={(e) => updateRow(idx, 'grade', e.target.value)}
                      disabled={!canWrite('grades')}
                      className="w-16 font-bold"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={row.coefficient}
                      onChange={(e) => updateRow(idx, 'coefficient', e.target.value)}
                      disabled={!canWrite('grades')}
                      className="w-16"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      value={row.comment}
                      onChange={(e) => updateRow(idx, 'comment', e.target.value)}
                      disabled={!canWrite('grades')}
                      placeholder="Appréciation..."
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.behavior}
                      onChange={(e) => updateRow(idx, 'behavior', e.target.value)}
                      disabled={!canWrite('grades')}
                      className="w-full border rounded-md px-2 py-1 text-sm bg-white"
                    >
                      <option value="none">{BEHAVIOR_LABELS.none}</option>
                      <option value="warning">{BEHAVIOR_LABELS.warning}</option>
                      <option value="praise">{BEHAVIOR_LABELS.praise}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canWrite('grades') && (
            <div className="p-4 border-t flex justify-end">
              <Button onClick={handleSaveAll} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                Enregistrer les notes
              </Button>
            </div>
          )}
        </div>
      )}

      {students.length === 0 && selectedClass && (
        <div className="text-center py-8 space-y-2">
          <p className="text-muted-foreground">Aucun élève trouvé dans cette classe.</p>
          <p className="text-sm text-muted-foreground">
            Vérifiez que des élèves sont inscrits dans la classe "{selectedClass}".
          </p>
        </div>
      )}

      {students.length === 0 && !selectedClass && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed">
          <p className="text-muted-foreground text-lg font-medium">
            Sélectionnez une classe et une matière pour commencer
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Les notes saisies seront enregistrées par trimestre et par année scolaire.
          </p>
        </div>
      )}
    </div>
  )
}
