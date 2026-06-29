import { useAppStore } from '@/store/useAppStore'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus, AlertCircle } from 'lucide-react'
import { useClasses } from '@/lib/useClasses'
import { useAuthStore } from '@/store/useAuthStore'

export default function AssessmentSettings() {
  const { classes } = useClasses()
  const canWrite = useAuthStore((s) => s.canWrite)

  const [selectedClass, setSelectedClass] = useState<string>('')
  const [assessments, setAssessments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newTermValue, setNewTermValue] = useState<number | ''>('')

  useEffect(() => {
    if (selectedClass) {
      loadAssessments()
    } else {
      setAssessments([])
    }
  }, [selectedClass])

  const loadAssessments = async () => {
    try {
      setLoading(true)
      setError('')
      const schoolYear =
        ((await window.api.settings.get('school_year')) as string) ||
        useAppStore.getState().currentYear
      const result = await window.api.assessment.list(schoolYear, selectedClass)

      if (result.success && result.assessments) {
        setAssessments(result.assessments)
      } else {
        setError(result.error || 'Erreur de chargement')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim() || newTermValue === '') return

    try {
      setLoading(true)
      const schoolYear =
        ((await window.api.settings.get('school_year')) as string) ||
        useAppStore.getState().currentYear

      const data = {
        school_year: schoolYear,
        class_name: selectedClass, // specific to this class
        name: newName.trim(),
        term_value: Number(newTermValue),
        weight: 1.0
      }

      const result = await window.api.assessment.create(data)
      if (result.success) {
        setNewName('')
        setNewTermValue('')
        await loadAssessments()
      } else {
        setError(result.error || 'Erreur de création')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, isGlobal: boolean) => {
    if (isGlobal) {
      alert('Les trimestres par défaut (globaux) ne peuvent pas être supprimés.')
      return
    }

    if (!confirm('Voulez-vous vraiment supprimer cette évaluation ?')) return

    try {
      setLoading(true)
      const result = await window.api.assessment.delete(id)
      if (result.success) {
        await loadAssessments()
      } else {
        setError(result.error || 'Erreur de suppression')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded shadow max-w-xl border border-gray-100">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">Évaluations & Examens Blancs</h2>
      <p className="text-sm text-gray-500 mb-4">
        Par défaut, toutes les classes ont Trimestre 1, 2 et 3. Vous pouvez ajouter des examens
        supplémentaires (ex: "Essai N°1") spécifiques à une classe.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      <div className="mb-6">
        <Label htmlFor="class-select">Sélectionner une classe</Label>
        <select
          id="class-select"
          className="w-full mt-1 border rounded p-2 text-sm bg-white"
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
        >
          <option value="">-- Choisir une classe --</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {selectedClass && (
        <div className="space-y-4">
          <div className="border rounded divide-y">
            <div className="bg-gray-50 px-4 py-2 font-medium text-sm grid grid-cols-12 gap-2">
              <div className="col-span-2">Ordre</div>
              <div className="col-span-8">Nom de l'évaluation</div>
              <div className="col-span-2 text-center">Action</div>
            </div>

            {assessments.length === 0 && (
              <div className="p-4 text-center text-sm text-gray-500">Aucune évaluation</div>
            )}

            {assessments.map((a) => {
              const isGlobal = a.class_name === null
              return (
                <div
                  key={a.id}
                  className={`px-4 py-2 flex items-center grid grid-cols-12 gap-2 text-sm ${isGlobal ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="col-span-2 font-mono text-gray-500">{a.term_value}</div>
                  <div className="col-span-8">
                    <span className="font-medium">{a.name}</span>
                    {isGlobal && (
                      <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                        Par défaut
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    {!isGlobal && canWrite('settings') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(a.id, false)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {canWrite('settings') && (
            <div className="pt-4 border-t mt-4">
              <h4 className="text-sm font-medium mb-3">Ajouter un examen pour {selectedClass}</h4>
              <div className="flex gap-2">
                <div className="w-20">
                  <Input
                    type="number"
                    min="4"
                    max="10"
                    placeholder="N°"
                    value={newTermValue}
                    onChange={(e) => setNewTermValue(e.target.value ? Number(e.target.value) : '')}
                    title="Ordre technique (ex: 4)"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Nom (ex: Examen Blanc N°1)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={loading || !newName.trim() || newTermValue === ''}
                >
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Utilisez un ordre supérieur à 3 (4, 5, 6...) pour éviter les conflits avec les
                trimestres classiques.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
