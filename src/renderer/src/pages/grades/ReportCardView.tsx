/**
 * ReportCardView.tsx — Aperçu du bulletin individuel
 *
 * @module pages/grades/ReportCardView
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useGradeStore } from '@/store/useGradeStore'
import { useStudentStore } from '@/store/useStudentStore'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer, Award, AlertCircle, Download } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

function getMention(average: number): string {
  if (average >= 16) return 'Très Bien'
  if (average >= 14) return 'Bien'
  if (average >= 12) return 'Assez Bien'
  if (average >= 10) return 'Passable'
  return 'Insuffisant'
}

export default function ReportCardView(): React.JSX.Element {
  const { studentId } = useParams<{ studentId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [schoolYear, setSchoolYear] = useState(searchParams.get('year') || '2025-2026')
  const [term, setTerm] = useState(Number(searchParams.get('term') || 1))

  const { grades, studentAverage, fetchGradesByStudent, fetchStudentAverage } = useGradeStore()
  const { currentStudent, getStudent } = useStudentStore()

  useEffect(() => {
    if (studentId) {
      getStudent(studentId)
      fetchGradesByStudent(studentId, schoolYear, term)
      fetchStudentAverage(studentId, schoolYear, term)
    }
  }, [studentId, schoolYear, term])

  const student = currentStudent

  const [assessments, setAssessments] = useState<any[]>([])

  useEffect(() => {
    if (student?.class && window.api) {
      const load = async () => {
        try {
          const result = await window.api.assessment.list(schoolYear, student.class)
          if (result.success && result.assessments) {
            setAssessments(result.assessments)
          }
        } catch (e) {
          console.error(e)
        }
      }
      load()
    }
  }, [student?.class, schoolYear])

  if (!student) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  const totalCoefficient = grades.reduce((sum, g) => sum + (g.coefficient ?? 1), 0)
  const weightedSum = grades.reduce((sum, g) => sum + g.grade * (g.coefficient ?? 1), 0)
  const computedAverage = totalCoefficient > 0 ? weightedSum / totalCoefficient : 0
  const average = studentAverage?.average ?? computedAverage

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <ReadOnlyBanner resource="grades" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/grades')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Bulletin scolaire</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const gradesData = grades.map((g) => ({
                subject: g.subject_name || '—',
                grade: g.grade,
                coefficient: g.coefficient ?? 1,
                average: 0
              }))
              const result = await window.api.pdf.generateReportCard(
                {
                  first_name: student.first_name,
                  last_name: student.last_name,
                  class_name: student.class || '',
                  school_year: schoolYear,
                  term,
                  termName: assessments.find(a => a.term_value === term)?.name || `Trimestre ${term}`
                },
                gradesData,
                average
              )
              if (result.success && result.filePath) {
                await window.api.pdf.openFile(result.filePath)
              } else {
                alert(result.error || 'Erreur génération PDF')
              }
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Sélecteurs */}
      <div className="bg-white rounded-xl border shadow-sm p-4 flex gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Année scolaire</label>
          <input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Trimestre</label>
          <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
            className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-white"
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
      </div>

      {/* En-tête bulletin */}
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-2">
        <div className="text-center">
          <h2 className="text-xl font-bold">Lycée Manjary Soa</h2>
          <p className="text-sm text-muted-foreground">Bulletin de notes — {schoolYear} — {assessments.find(a => a.term_value === term)?.name || `Trimestre ${term}`}</p>
        </div>
        <div className="border-t pt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-medium">Nom :</span> {student.last_name}</p>
            <p><span className="font-medium">Prénom :</span> {student.first_name}</p>
            <p><span className="font-medium">Classe :</span> {student.class}</p>
          </div>
          <div>
            <p><span className="font-medium">Matricule :</span> {student.registration_number}</p>
            <p><span className="font-medium">Date de naissance :</span> {student.date_of_birth || '—'}</p>
          </div>
        </div>
      </div>

      {/* Tableau des notes */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Matière</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-20">Note</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-20">Coef.</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Total</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Appréciation</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {grades.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucune note pour ce trimestre.
                </td>
              </tr>
            )}
            {grades.map((g) => {
              const coef = g.coefficient ?? 1
              const total = g.grade * coef
              return (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{g.subject_name || '—'}</td>
                  <td className="px-4 py-3 text-center font-semibold">
                    <span className={g.grade < 10 ? 'text-red-600' : g.grade >= 14 ? 'text-green-600' : 'text-amber-600'}>
                      {g.grade.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{coef}</td>
                  <td className="px-4 py-3 text-center font-medium">{total.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{g.teacher_comment || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Récapitulatif */}
      <div className="bg-white rounded-xl border shadow-sm p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Moyenne générale</p>
          <p className={`text-3xl font-bold ${average < 10 ? 'text-red-600' : average >= 14 ? 'text-green-600' : 'text-amber-600'}`}>
            {average > 0 ? average.toFixed(2) : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Mention</p>
          <div className="flex items-center justify-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <p className="text-xl font-semibold">{average > 0 ? getMention(average) : '—'}</p>
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Total coefficients</p>
          <p className="text-3xl font-bold text-gray-700">{totalCoefficient}</p>
        </div>
      </div>

      {/* Avertissement si moyenne faible */}
      {average > 0 && average < 10 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Attention : moyenne insuffisante</p>
            <p className="text-sm">La moyenne de l'élève est inférieure à 10/20. Un suivi renforcé est recommandé.</p>
          </div>
        </div>
      )}
    </div>
  )
}
