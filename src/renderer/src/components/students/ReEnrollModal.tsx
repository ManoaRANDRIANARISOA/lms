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
  }
  currentYear: string
  isNewStudent: boolean
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
  isNewStudent,
  onSuccess
}) => {
  const { classes: availableClasses } = useClasses()

  const title = isNewStudent ? 'Inscription' : 'Réinscription'

  const [targetYear, setTargetYear] = useState(
    isNewStudent ? currentYear : getNextYear(currentYear)
  )
  const [newClass, setNewClass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [initialPayment, setInitialPayment] = useState<string>('')
  const [framFratrieStatus, setFramFratrieStatus] = useState<{ isPaid: boolean; by?: string }>({
    isPaid: false
  })
  
  const { prices, fetchPrices } = useFinanceStore()

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
      if (student.class && student.class !== 'Classe non spécifiée') {
        const next = getNextClass(student.class, availableClasses)
        setNewClass(next)
      } else {
        // Default to first class for new students
        setNewClass(availableClasses[0])
      }
    }
  }, [student.class, availableClasses])
  const enrollmentAmount = isNewStudent ? (prices?.registration || 85000) : (prices?.reenrollment || 75000)
  const actualFramAmount = framFratrieStatus.isPaid ? 0 : (prices?.fram || 25000)
  const totalExpected = enrollmentAmount + actualFramAmount

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
      const result = await window.api.student.reEnroll(student.id, newClass, targetYear, initialPaymentDroit, initialPaymentFram)
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

        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold mb-3">Paiement à l'inscription</h4>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
              <h5 className="text-sm font-semibold text-gray-700 mb-2">Détail du montant dû :</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">{isNewStudent ? "Droits d'inscription" : 'Réinscription'} :</span>
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
