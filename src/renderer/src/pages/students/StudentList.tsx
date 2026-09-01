import { useEffect, useState, type ChangeEvent } from 'react'
import { useStudentStore } from '@/store/useStudentStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, User, Download, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import StudentForm from './StudentForm'
import StudentDetail from './StudentDetail'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { usePermissions } from '@/lib/usePermissions'
import { useClasses } from '@/lib/useClasses'
import StudentExportModal from '@/components/students/StudentExportModal'

export default function StudentList() {
  const { students, currentStudent, currentFees, loading, fetchStudents } = useStudentStore()
  const currentYear = useAppStore((s) => s.currentYear)
  const { canWrite } = usePermissions()
  const { classes } = useClasses()
  const [search, setSearch] = useState('')
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [sortField, setSortField] = useState<string>('registration_number')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc') // Par défaut, desc pour voir les nouveaux en haut
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'detail'>('list')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [])

  useEffect(() => {
    if (view === 'list') {
      fetchStudents({
        search,
        class: selectedClass,
        status: selectedStatus,
        schoolYear: currentYear,
        sortField,
        sortDirection
      })
    }
  }, [search, selectedClass, selectedStatus, currentYear, view, sortField, sortDirection])

  const handleSearch = () => {
    fetchStudents({
      search,
      class: selectedClass,
      status: selectedStatus,
      schoolYear: currentYear,
      sortField,
      sortDirection
    })
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50 inline-block" />
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-4 h-4 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1 inline-block" />
    )
  }

  if (view === 'create') {
    return (
      <div className="p-6 w-full h-full">
        <StudentForm
          onSuccess={() => {
            setView('list')
            setSuccessMessage("Le dossier de l'élève a été créé avec succès.")
            setTimeout(() => setSuccessMessage(null), 5000)
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
            onClick={() => setIsExportModalOpen(true)}
            className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors"
          >
            <Download className="w-4 h-4 mr-2 text-blue-600" />
            Exporter la liste
          </Button>
          {canWrite('students') && (
            <Button onClick={() => setView('create')}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvel Élève
            </Button>
          )}
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-100 border border-green-200 text-green-800 px-4 py-3 rounded mb-4 flex justify-between items-center shadow-sm">
          <span className="font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Rechercher un élève (Nom, Matricule)..."
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              handleSearch()
            }
          }}
          className="max-w-md"
        />
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Actifs & En attente</option>
          <option value="Tous">Tous les statuts</option>
          <option value="Inscrit">Inscrit</option>
          <option value="Pré-inscrit">Pré-inscrit</option>
          <option value="Ancien">Ancien</option>
          <option value="Quitté">Quitté</option>
          <option value="Non inscrit">Non inscrit</option>
        </select>
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
                <th
                  className="p-4 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('registration_number')}
                >
                  <div className="flex items-center">
                    Matricule {renderSortIcon('registration_number')}
                  </div>
                </th>
                <th
                  className="p-4 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('last_name')}
                >
                  <div className="flex items-center">
                    Nom & Prénoms {renderSortIcon('last_name')}
                  </div>
                </th>
                <th
                  className="p-4 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('resolved_class')}
                >
                  <div className="flex items-center">Classe {renderSortIcon('resolved_class')}</div>
                </th>
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
                    {student.student_status && student.student_status !== 'Non inscrit' ? (
                      student.student_status === 'Ancien' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Ancien - {student.class}{' '}
                          {student.status_year ? `(en ${student.status_year})` : ''}
                        </span>
                      ) : student.student_status === 'Pré-inscrit' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Pré-inscrit - {student.class}{' '}
                          {student.status_year ? `(en ${student.status_year})` : ''}
                        </span>
                      ) : student.student_status === 'Quitté' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Quitté
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Inscrit - {student.class}
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Non inscrit
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {student.guardian_contact ||
                      student.father_contact ||
                      student.mother_contact ||
                      '-'}
                  </td>
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

      {/* Export Modal */}
      <StudentExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filters={{
          search,
          className: selectedClass,
          status: selectedStatus,
          schoolYear: currentYear,
          currentStudentsCount: students.length
        }}
      />
    </div>
  )
}
