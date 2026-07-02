import React, { useState, useEffect } from 'react'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Loader2 } from 'lucide-react'
import { useClasses } from '@/lib/useClasses'
import { useFinanceStore } from '@/store/useFinanceStore'

interface ReEnrollModalProps {
  isOpen: boolean
  onClose: () => void
  student: {
    id: string
    first_name: string
    last_name: string
    class: string
    siblings?: string | string[]
    is_personnel_child?: boolean
    parent_personnel_id?: string | null
    student_status?: string
  }
  currentYear: string
  isNewStudent: boolean
  enrolledYears?: string[]
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

const getPreviousYear = (year: string): string => {
  if (!year) return ''
  const parts = year.split('-')
  if (parts.length === 2) {
    const start = parseInt(parts[0])
    return `${start - 1}-${start}`
  }
  return year
}

export const ReEnrollModal: React.FC<ReEnrollModalProps> = ({
  isOpen,
  onClose,
  student,
  currentYear,
  isNewStudent,
  enrolledYears = [],
  onSuccess
}) => {
  const { classes: availableClasses } = useClasses()

  const [isReenrollmentOverride, setIsReenrollmentOverride] = useState(
    !isNewStudent || student.student_status === 'Ancien'
  )

  // Update override state when modal opens or student changes
  useEffect(() => {
    setIsReenrollmentOverride(!isNewStudent || student.student_status === 'Ancien')
  }, [isOpen, isNewStudent, student.student_status])

  const actualIsNewStudent = !isReenrollmentOverride
  const title = actualIsNewStudent ? 'Inscription' : 'Réinscription'

  const [targetYear, setTargetYear] = useState(
    isNewStudent ? currentYear : getNextYear(currentYear)
  )
  const [newClass, setNewClass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [annualAverage, setAnnualAverage] = useState<number | null>(null)
  
  const [initialPayment, setInitialPayment] = useState<string>('')
  const [framFratrieStatus, setFramFratrieStatus] = useState<{ isPaid: boolean; by?: string }>({
    isPaid: false
  })
  
  const { prices, fetchPrices } = useFinanceStore()

  useEffect(() => {
    if (student.id && targetYear && window.api) {
      // Pour une inscription en targetYear, on regarde les notes de l'année précédente
      const yearToCheck = getPreviousYear(targetYear)
      
      // Réinitialiser d'abord au cas où l'année change
      setAnnualAverage(null)
      
      // 4 is the annual term
      window.api.grade.getStudentAverage(student.id, yearToCheck, 4).then((res) => {
        if (res.success && typeof res.average === 'number') {
          setAnnualAverage(res.average)
        }
      }).catch((e) => {
        if (import.meta.env.DEV) console.error('Failed to load annual average:', e)
      })
    }
  }, [student.id, targetYear])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  useEffect(() => {
    if (student.id && targetYear && window.api) {
      window.api.payment.checkFramFratrie(student.id, targetYear).then((res) => {
        if (res.success) {
          setFramFratrieStatus({ isPaid: res.isPaid, by: res.by })
        }
      })
    }
  }, [student.id, targetYear])

  // Set initial newClass based on student and available classes
  useEffect(() => {
    if (availableClasses.length > 0) {
      if (student.class && student.class !== 'Classe non spécifiée' && student.class !== 'Non inscrit') {
        if (annualAverage !== null && annualAverage < 10) {
          // Redoublement suggéré
          setNewClass(student.class)
        } else {
          // Admis ou pas de moyenne connue
          const next = getNextClass(student.class, availableClasses)
          setNewClass(next)
        }
      } else {
        // Default to first class for new students
        setNewClass(availableClasses[0])
      }
    }
  }, [student.class, availableClasses, annualAverage])
  const enrollmentAmount = actualIsNewStudent ? (prices?.registration || 85000) : (prices?.reenrollment || 75000)
  const actualFramAmount = framFratrieStatus.isPaid ? 0 : (prices?.fram || 25000)
  const totalExpected = enrollmentAmount + actualFramAmount

  const isAlreadyEnrolled = enrolledYears.includes(targetYear)

  const handleReEnroll = async () => {
    if (!window.api) {
      setError('Erreur système: API non disponible')
      return
    }

    setLoading(true)
    setError(null)

    if (!newClass) {
      setError('Veuillez sélectionner une classe.')
      setLoading(false)
      return
    }

    try {
      // Calculate split
      const amt = initialPayment ? parseFloat(initialPayment) : 0
      let initialPaymentFram = 0
      let initialPaymentDroit = 0
      
      if (amt > 0) {
        if (!framFratrieStatus.isPaid) {
          initialPaymentFram = Math.min(amt, actualFramAmount)
          initialPaymentDroit = amt - initialPaymentFram
        } else {
          initialPaymentDroit = amt
        }
      }

      // Use the exposed API
      const result = await window.api.student.reEnroll(student.id, newClass, targetYear, initialPaymentDroit, initialPaymentFram, actualIsNewStudent)
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
          <Button onClick={handleReEnroll} disabled={loading || isAlreadyEnrolled}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmer {title}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700 flex flex-col gap-2">
          <p>
            Cette action inscrira l'élève dans la nouvelle classe pour l'année scolaire {targetYear}.
            {actualIsNewStudent
              ? " Il s'agit d'une première inscription."
              : " L'historique de l'année précédente sera conservé."}
          </p>
          {isNewStudent && (
             <label className="flex items-center gap-2 mt-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isReenrollmentOverride}
                  onChange={(e) => setIsReenrollmentOverride(e.target.checked)}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                Considérer comme une réinscription (Ancien élève)
             </label>
          )}
        </div>

        {isAlreadyEnrolled && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 p-3 rounded-md text-sm font-medium">
            Attention : L'élève est déjà inscrit pour l'année scolaire {targetYear}. Vous ne pouvez pas le réinscrire pour la même année.
          </div>
        )}

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
          {annualAverage !== null && !isNewStudent && (
            <p className={`text-xs mt-1 font-medium ${annualAverage >= 10 ? 'text-green-600' : 'text-amber-600'}`}>
              Suggestion automatique basée sur la moyenne annuelle ({annualAverage.toFixed(2)}/20) : {annualAverage >= 10 ? 'Admis(e) en classe supérieure' : 'Redoublement conseillé'}
            </p>
          )}
        </div>

        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold mb-3">Paiement à l'inscription</h4>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
              <h5 className="text-sm font-semibold text-gray-700 mb-2">Détail du montant dû :</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{actualIsNewStudent ? "Droits d'inscription" : 'Réinscription'} :</span>
                  <span className="font-semibold">{enrollmentAmount.toLocaleString()} Ar</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Cotisation FRAM :</span>
                  <span className={`font-semibold ${framFratrieStatus.isPaid ? 'text-emerald-600' : ''}`}>
                    {framFratrieStatus.isPaid ? `Exonéré (Déjà payé par la fratrie)` : `${actualFramAmount.toLocaleString()} Ar`}
                  </span>
                </div>
                
                <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-300 font-bold text-gray-800">
                  <span>Total à payer :</span>
                  <span>{totalExpected.toLocaleString()} Ar</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Montant versé par le parent (Ar)
              </label>
              <Input
                type="number"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                placeholder={`Ex: ${totalExpected}`}
              />
              <p className="text-xs text-gray-500 mt-1">
                L'argent versé couvrira d'abord le FRAM (s'il est dû), puis le reste ira au Droit.
                Le solde non payé sera enregistré comme reste à payer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
