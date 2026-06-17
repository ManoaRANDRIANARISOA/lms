import { useEffect, useState, type ChangeEvent } from 'react'
import { useStudentStore } from '@/store/useStudentStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, User, Download } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import StudentForm from './StudentForm'
import StudentDetail from './StudentDetail'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { usePermissions } from '@/lib/usePermissions'
import { useClasses } from '@/lib/useClasses'

export default function StudentList() {
  const { students, currentStudent, currentFees, loading, fetchStudents } = useStudentStore()
  const currentYear = useAppStore((s) => s.currentYear)
  const { canWrite } = usePermissions()
  const { classes } = useClasses()
  const [search, setSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'detail'>('list')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  useEffect(() => {
    fetchStudents()
  }, [])

  useEffect(() => {
    fetchStudents({ search, class: selectedClass, schoolYear: currentYear })
  }, [selectedClass, currentYear])

  const handleSearch = () => {
    fetchStudents({ search, class: selectedClass, schoolYear: currentYear })
  }

  if (view === 'create') {
    return (
      <div className="p-6 w-full h-full">
        <StudentForm
          onSuccess={() => {
            setView('list')
            fetchStudents()
          }}
          onCancel={() => setView('list')}
        />
      </div>
    )
  }

  if (view === 'edit') {
    return (
      <div className="p-6 w-full h-full">
        <StudentForm
          initialData={currentStudent}
          initialFees={currentFees}
          onSuccess={() => {
            setView('detail') // Go back to detail to see changes
            if (selectedStudentId) {
              // Detail view will refresh itself via useEffect
            }
          }}
          onCancel={() => setView('detail')}
        />
      </div>
    )
  }

  if (view === 'detail' && selectedStudentId) {
    return (
      <StudentDetail
        studentId={selectedStudentId}
        onBack={() => {
          setView('list')
          setSelectedStudentId(null)
        }}
        onEdit={() => {
          setView('edit')
        }}
      />
    )
  }

  return (
    <div className="p-6 w-full h-full">
      <ReadOnlyBanner resource="students" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestion des Élèves</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const result = await window.api.student.list({
                limit: 10000,
                schoolYear: currentYear
              })
              const students = result?.students || []
              await window.api.export.csv(
                students as unknown as Record<string, unknown>[],
                [
                  { key: 'registration_number', label: 'Matricule' },
                  { key: 'last_name', label: 'Nom' },
                  { key: 'first_name', label: 'Prénom' },
                  { key: 'class', label: 'Classe' },
                  { key: 'enrollment_date', label: "Date d'inscription" }
                ],
                'eleves_export.csv'
              )
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          {canWrite('students') && (
            <Button onClick={() => setView('create')}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvel Élève
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Rechercher un élève (Nom, Matricule)..."
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Toutes les classes</option>
          {classes.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>
        <Button onClick={handleSearch} variant="secondary">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">Chargement...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden w-full">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-600 uppercase">
              <tr>
                <th className="p-4">Matricule</th>
                <th className="p-4">Nom & Prénoms</th>
                <th className="p-4">Classe</th>
                <th className="p-4">Contact Tuteur</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    Aucun élève trouvé
                  </td>
                </tr>
              )}
              {students.map((student) => (
                <tr
                  key={student.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedStudentId(student.id)
                    setView('detail')
                  }}
                >
                  <td className="p-4 font-medium">{student.registration_number}</td>
                  <td className="p-4">
                    <div className="font-semibold">{student.last_name}</div>
                    <div className="text-gray-500">{student.first_name}</div>
                  </td>
                  <td className="p-4">
                    {student.class &&
                    student.class !== 'Non inscrit' &&
                    student.class !== 'Classe non spécifiée' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {student.class}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Non inscrit
                      </span>
                    )}
                  </td>
                  <td className="p-4">{student.guardian_contact}</td>
                  <td className="p-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedStudentId(student.id)
                        setView('detail')
                      }}
                    >
                      <User className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
