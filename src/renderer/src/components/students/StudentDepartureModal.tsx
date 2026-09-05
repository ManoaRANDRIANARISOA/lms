import React, { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Calendar, UserX } from 'lucide-react'

interface StudentDepartureModalProps {
  isOpen: boolean
  onClose: () => void
  studentName: string
  onConfirm: (date: string, reason?: string) => Promise<boolean>
}

const COMMON_REASONS = [
  'Déménagement familial',
  'Changement d’établissement',
  'Arrêt temporaire de scolarité',
  'Raison de santé',
  'Autre motif'
]

export const StudentDepartureModal: React.FC<StudentDepartureModalProps> = ({
  isOpen,
  onClose,
  studentName,
  onConfirm
}) => {
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState(COMMON_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setDepartureDate(new Date().toISOString().split('T')[0])
      setReason(COMMON_REASONS[0])
      setCustomReason('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  const handleConfirm = async () => {
    if (!departureDate) {
      setError('Veuillez renseigner une date de départ valide.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const finalReason = reason === 'Autre motif' ? customReason.trim() : reason
      const success = await onConfirm(departureDate, finalReason || undefined)
      if (success) {
        onClose()
      } else {
        setError('Impossible d’enregistrer le départ. Veuillez réessayer.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title="Départ de l'élève"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting || !departureDate}
            className="flex items-center gap-1.5"
          >
            <UserX className="w-4 h-4" />
            {isSubmitting ? 'Enregistrement...' : 'Confirmer le départ'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-gray-700">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800 leading-relaxed">
            Vous vous apprêtez à déclarer le départ de{' '}
            <strong className="font-semibold text-red-900">{studentName}</strong>. Les impayés et
            frais mensuels ultérieurs à la date choisie ne seront plus comptabilisés.
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-red-100 border border-red-300 text-red-700 text-xs rounded">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="dep-date" className="flex items-center gap-1.5 font-medium text-gray-700">
            <Calendar className="w-4 h-4 text-gray-500" />
            Date effective de départ :
          </Label>
          <Input
            id="dep-date"
            type="date"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
            disabled={isSubmitting}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dep-reason" className="font-medium text-gray-700">
            Motif du départ (optionnel) :
          </Label>
          <select
            id="dep-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {COMMON_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {reason === 'Autre motif' && (
          <div className="space-y-1.5 animate-in fade-in duration-150">
            <Label htmlFor="custom-reason" className="font-medium text-gray-700">
              Précisez le motif :
            </Label>
            <Input
              id="custom-reason"
              placeholder="Ex: Transfert vers une école à l’étranger..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}
