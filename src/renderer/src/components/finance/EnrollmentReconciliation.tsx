import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Search,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

interface ReconciliationItem {
  student_id: string
  first_name: string
  last_name: string
  class_name: string
  amount_paid: number
  payment_date: string
  receipt_number: string
  payment_type: string
  is_reenrollment: number
  past_years_count: number
  expected_if_new: number
  expected_if_returning: number
  balance_if_new: number
  balance_if_returning: number
}

interface EnrollmentReconciliationProps {
  onUpdated?: () => void
}

export default function EnrollmentReconciliation({ onUpdated }: EnrollmentReconciliationProps) {
  const { currentYear } = useAppStore()
  const [items, setItems] = useState<ReconciliationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'historical' | 'no_history'>('all')

  const loadData = async () => {
    setLoading(true)
    try {
      if (window.api?.student?.getPendingEnrollmentRectifications) {
        const res = await window.api.student.getPendingEnrollmentRectifications(currentYear)
        if (res.success && res.items) {
          setItems(res.items)
          // Par défaut, ne sélectionner personne pour laisser le choix strict à la responsable
          setSelectedIds([])
        } else if (res.error) {
          toast.error(res.error)
        }
      }
    } catch (e: unknown) {
      toast.error('Erreur lors du chargement des dossiers: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentYear])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterType === 'historical' && item.past_years_count === 0) return false
      if (filterType === 'no_history' && item.past_years_count > 0) return false

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        const fullName = `${item.last_name} ${item.first_name}`.toLowerCase()
        const cls = item.class_name.toLowerCase()
        const receipt = item.receipt_number.toLowerCase()
        if (!fullName.includes(term) && !cls.includes(term) && !receipt.includes(term)) {
          return false
        }
      }
      return true
    })
  }, [items, filterType, searchTerm])

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredItems.map((i) => i.student_id))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleBatchRectify = async () => {
    if (selectedIds.length === 0) return
    const count = selectedIds.length
    if (
      !confirm(
        `Confirmez-vous la conversion de ces ${count} élève(s) en "Réinscription (Ancien élève)" ?\n\nLeur reçu et paiement seront requalifiés en réinscription (115 000 Ar), supprimant le reste à payer de 25 000 Ar.`
      )
    ) {
      return
    }

    setProcessing(true)
    const toastId = toast.loading(`Requalification de ${count} dossier(s)...`)
    try {
      const res = await window.api.student.batchRectifyEnrollmentType(
        selectedIds,
        currentYear,
        'reenrollment'
      )
      if (res.success) {
        toast.success(
          `${res.count || count} élève(s) converti(s) en Réinscription avec succès !`,
          { id: toastId }
        )
        await loadData()
        if (onUpdated) onUpdated()
      } else {
        toast.error(res.error || 'Erreur lors de la requalification', { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setProcessing(false)
    }
  }

  const handleSingleRectify = async (studentId: string, studentName: string) => {
    setProcessing(true)
    const toastId = toast.loading(`Requalification de ${studentName}...`)
    try {
      const res = await window.api.student.rectifyEnrollmentType(
        studentId,
        currentYear,
        'reenrollment'
      )
      if (res.success) {
        toast.success(`${studentName} a été requalifié(e) en Réinscription`, { id: toastId })
        await loadData()
        if (onUpdated) onUpdated()
      } else {
        toast.error(res.error || 'Erreur lors de la requalification', { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setProcessing(false)
    }
  }

  const handleSyncFees = async () => {
    setProcessing(true)
    const toastId = toast.loading("Harmonisation des tarifs d'écolage sur la grille centralisée...")
    try {
      const res = await window.api.student.syncFeesWithPricing(currentYear)
      if (res.success) {
        toast.success(
          res.updatedCount && res.updatedCount > 0
            ? `${res.updatedCount} élève(s) aligné(s) sur les tarifs officiels (ex: CM1 à 45 000 Ar) !`
            : "Tous les tarifs d'écolage sont déjà parfaitement alignés sur la grille officielle.",
          { id: toastId }
        )
        if (onUpdated) onUpdated()
      } else {
        toast.error(res.error || 'Erreur lors de la synchronisation', { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-5 border rounded-xl bg-white shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-gray-800">
              Harmonisation Droits d'Inscription & Réinscription
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Permet à la direction/responsable de requalifier en un clic les anciens élèves ayant réglé 115 000 Ar
            enregistrés sous "Frais d'inscription" afin d'annuler les faux impayés de 25 000 Ar.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncFees}
            disabled={processing}
            className="text-xs gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            title="Assure que tous les élèves ont le tarif d'écolage de la grille centralisée (ex: CM1 à 45 000 Ar)"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', processing && 'animate-spin')} />
            Harmoniser Grille Écolages
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs gap-1"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-lg bg-indigo-50/60 border border-indigo-100 flex flex-col justify-between">
          <span className="text-xs font-medium text-indigo-700">Dossiers à vérifier (115 000 Ar)</span>
          <span className="text-2xl font-bold text-indigo-900 mt-1">{items.length}</span>
        </div>
        <div className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
          <span className="text-xs font-medium text-emerald-700">Déjà scolarisés en 2025-2026</span>
          <span className="text-2xl font-bold text-emerald-900 mt-1">
            {items.filter((i) => i.past_years_count > 0).length}
          </span>
        </div>
        <div className="p-3.5 rounded-lg bg-amber-50/60 border border-amber-100 flex flex-col justify-between">
          <span className="text-xs font-medium text-amber-700">Sans historique précédent</span>
          <span className="text-2xl font-bold text-amber-900 mt-1">
            {items.filter((i) => i.past_years_count === 0).length}
          </span>
        </div>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher nom, classe, reçu..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-white px-3 py-1 text-xs"
          >
            <option value="all">Tous ({items.length})</option>
            <option value="historical">Déjà scolarisés l'an passé</option>
            <option value="no_history">Nouveaux dossiers</option>
          </select>

          {selectedIds.length > 0 && (
            <Button
              size="sm"
              onClick={handleBatchRectify}
              disabled={processing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-medium shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Valider la sélection ({selectedIds.length}) en Réinscription
            </Button>
          )}
        </div>
      </div>

      {/* Tableau des cas */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50/80 sticky top-0 text-gray-600 uppercase font-semibold border-b">
              <tr>
                <th className="px-4 py-3 w-10 text-center">
                  <Checkbox
                    checked={
                      filteredItems.length > 0 && selectedIds.length === filteredItems.length
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th className="px-4 py-3">Élève & Classe</th>
                <th className="px-4 py-3">Historique École</th>
                <th className="px-4 py-3 text-right">Montant Réglé</th>
                <th className="px-4 py-3">Reçu & Date</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    Chargement des dossiers...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                    Aucun cas ambigu en attente. Tous les paiements de réinscription sont alignés.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedIds.includes(item.student_id)
                  const isHistorical = item.past_years_count > 0
                  return (
                    <tr
                      key={item.student_id}
                      className={cn(
                        'hover:bg-gray-50/60 transition-colors',
                        isSelected && 'bg-indigo-50/30'
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectOne(item.student_id)}
                          aria-label={`Sélectionner ${item.last_name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">
                          {item.last_name} {item.first_name}
                        </div>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                          {item.class_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isHistorical ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Ancien élève ({item.past_years_count} an passée)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                            Nouveau dossier scolaire
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-gray-900">
                          {item.amount_paid.toLocaleString()} Ar
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Tarif Réinscription : {item.expected_if_returning.toLocaleString()} Ar
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-gray-800 text-[11px]">
                          {item.receipt_number || '-'}
                        </div>
                        <div className="text-[10px] text-gray-400">{item.payment_date}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleSingleRectify(
                                item.student_id,
                                `${item.last_name} ${item.first_name}`
                              )
                            }
                            disabled={processing}
                            className="h-7 px-2 text-[11px] gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            title="Valider immédiatement comme Réinscription"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Réinscription
                          </Button>
                          <a
                            href={`#/students/${item.student_id}?tab=finance&year=${currentYear}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                            title="Consulter le dossier élève"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
