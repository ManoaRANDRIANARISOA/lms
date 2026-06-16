import React, { useState, useEffect } from 'react'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Loader2 } from 'lucide-react'
import { useClasses } from '@/lib/useClasses'

interface ReEnrollModalProps {
  isOpen: boolean
  onClose: () => void
  student: {
    id: string
    first_name: string
    last_name: string
    class: string
  }
  currentYear: string
  onSuccess: () => void
}

const getNextClass = (currentClass: string, allClasses: string[]): string => {
  if (!currentClass) return allClasses[0] || ''

  // Normalize strings for comparison
  const normalize = (s: string) => s.trim().toLowerCase()
  const c = normalize(currentClass)

  // Find current index
  const idx = allClasses.findIndex((cls) => normalize(cls) === c)

  if (idx !== -1 && idx < allClasses.length - 1) {
    return allClasses[idx + 1]
  }

  return currentClass
}

const getNextYear = (currentYear: string): string => {
  if (!currentYear) return '2026-2027'
  const parts = currentYear.split('-')
  if (parts.length === 2) {
    const start = parseInt(parts[0])
    return `${start + 1}-${start + 2}`
  }
  return currentYear
}

export const ReEnrollModal: React.FC<ReEnrollModalProps> = ({
  isOpen,
  onClose,
  student,
  currentYear,
  onSuccess
}) => {
  const { classes: availableClasses } = useClasses()

  const isNewStudent = !student.class || student.class === 'Classe non spécifiée'
  const title = isNewStudent ? 'Inscription' : 'Réinscription'

  const [targetYear, setTargetYear] = useState(
    isNewStudent ? currentYear : getNextYear(currentYear)
  )
  const [newClass, setNewClass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Set initial newClass based on student and available classes
  useEffect(() => {
    if (availableClasses.length > 0) {
      if (student.class && student.class !== 'Classe non spécifiée') {
        const next = getNextClass(student.class, availableClasses)
        setNewClass(next)
      } else {
        // Default to first class for new students
        setNewClass(availableClasses[0])
      }
    }
  }, [student.class, availableClasses])

  const handleReEnroll = async () => {
    if (!window.api) {
      setError('Erreur système: API non disponible')
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Use the exposed API
      const result = await window.api.student.reEnroll(student.id, newClass, targetYear)
      if (result.success) {
        onSuccess()
        onClose()
      } else {
        setError(result.error || "Échec de l'opération")
      }
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Re-enroll error:', err)
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`${title} : ${student.first_name} ${student.last_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleReEnroll} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmer {title}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700">
          Cette action inscrira l'élève dans la nouvelle classe pour l'année scolaire {targetYear}.
          {isNewStudent
            ? " Il s'agit d'une première inscription."
            : " L'historique de l'année précédente sera conservé."}
        </div>

        {error && <div className="bg-red-50 p-3 rounded-md text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Année Scolaire Cible
          </label>
          <Input
            value={targetYear}
            onChange={(e) => setTargetYear(e.target.value)}
            placeholder="Ex: 2026-2027"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nouvelle Classe</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
          >
            <option value="">Sélectionner une classe</option>
            {availableClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  )
}
