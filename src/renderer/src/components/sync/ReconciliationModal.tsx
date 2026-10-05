/**
 * ReconciliationModal.tsx — Visual Assistant for Orphaned & Blocked Records
 *
 * Provides a user-guided, financial-safe interface to resolve
 * student payments or cash journal entries that failed sync due to
 * missing foreign key dependencies (e.g. orphan student_id).
 */

import React, { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSyncStore } from '@/store/useSyncStore'
import { toast } from 'sonner'
import {
  AlertTriangle,
  UserCheck,
  UserPlus,
  Wallet,
  Trash2,
  Search,
  CheckCircle,
  RefreshCw,
  Info,
  Calendar
} from 'lucide-react'

interface ReconciliationItem {
  id: number
  table_name: string
  record_id: string
  action: string
  status: string
  payload: any
  error_message?: string
  retry_count: number
  created_at: string
  updated_at: string
}

interface StudentOption {
  id: string
  first_name: string
  last_name: string
  class_name?: string
  registration_number?: string
}

export const ReconciliationModal: React.FC = () => {
  const { isReconciliationOpen, closeReconciliation, startSync } = useSyncStore()
  const [items, setItems] = useState<ReconciliationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [processingId, setProcessingId] = useState<number | null>(null)

  // Sub-actions states
  const [activeAction, setActiveAction] = useState<{
    itemId: number
    type: 'attach' | 'create_student' | 'convert_cash' | 'discard'
  } | null>(null)

  // Attach search
  const [studentSearch, setStudentSearch] = useState('')
  const [studentResults, setStudentResults] = useState<StudentOption[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')

  // Create student form
  const [newStudent, setNewStudent] = useState({
    first_name: '',
    last_name: '',
    class_name: '',
    gender: 'M',
    registration_number: ''
  })

  // Discard reason
  const [discardReason, setDiscardReason] = useState('')

  const fetchItems = async () => {
    if (!window.api?.sync?.getReconciliationItems) return
    setLoading(true)
    try {
      const res = await window.api.sync.getReconciliationItems()
      const list = Array.isArray(res) ? res : (res?.items || [])
      setItems(list)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur lors du chargement des anomalies : ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isReconciliationOpen) {
      fetchItems()
      setActiveAction(null)
    }
  }, [isReconciliationOpen])

  // Search students for attach action
  useEffect(() => {
    if (!studentSearch.trim() || !window.api?.student?.list) {
      setStudentResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.student.list({ search: studentSearch.trim() })
        if (res && res.students) {
          setStudentResults(res.students.slice(0, 10))
        }
      } catch {
        setStudentResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [studentSearch])

  // Action: Attach to existing student
  const handleAttach = async (queueId: number) => {
    if (!selectedStudentId) {
      toast.error('Veuillez sélectionner un élève dans la liste.')
      return
    }
    setProcessingId(queueId)
    try {
      const res = await window.api.sync.reconcileAttachStudent(queueId, selectedStudentId)
      if (res.success) {
        toast.success(res.message || 'Écriture rattachée avec succès à l’élève !')
        setActiveAction(null)
        setSelectedStudentId('')
        await fetchItems()
        startSync(false)
      } else {
        toast.error(res.error || 'Échec du rattachement')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setProcessingId(null)
    }
  }

  // Action: Create missing student
  const handleCreateStudent = async (queueId: number) => {
    if (!newStudent.first_name.trim() || !newStudent.last_name.trim()) {
      toast.error('Le prénom et le nom de l’élève sont requis.')
      return
    }
    setProcessingId(queueId)
    try {
      const res = await window.api.sync.reconcileCreateMissingStudent(queueId, newStudent)
      if (res.success) {
        toast.success(res.message || 'Fiche élève créée et écriture réconciliée !')
        setActiveAction(null)
        setNewStudent({ first_name: '', last_name: '', class_name: '', gender: 'M', registration_number: '' })
        await fetchItems()
        startSync(false)
      } else {
        toast.error(res.error || 'Échec de la création')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setProcessingId(null)
    }
  }

  // Action: Convert to general cash
  const handleConvertToCash = async (queueId: number) => {
    setProcessingId(queueId)
    try {
      const res = await window.api.sync.reconcileConvertToGeneralCash(queueId)
      if (res.success) {
        toast.success(res.message || 'Écriture convertie en opération de caisse générale autonome !')
        setActiveAction(null)
        await fetchItems()
        startSync(false)
      } else {
        toast.error(res.error || 'Échec de conversion')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setProcessingId(null)
    }
  }

  // Action: Discard orphan
  const handleDiscard = async (queueId: number) => {
    if (!discardReason.trim()) {
      toast.error('Veuillez indiquer un motif d’annulation pour l’historique d’audit.')
      return
    }
    setProcessingId(queueId)
    try {
      const res = await window.api.sync.reconcileDiscardOrphan(queueId, discardReason.trim())
      if (res.success) {
        toast.success(res.message || 'Écriture orpheline annulée et archivée dans l’audit.')
        setActiveAction(null)
        setDiscardReason('')
        await fetchItems()
        startSync(false)
      } else {
        toast.error(res.error || 'Échec de l’annulation')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <Dialog
      isOpen={isReconciliationOpen}
      onClose={closeReconciliation}
      title="Assistant Visuel de Réconciliation des Écritures"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full text-xs text-gray-500">
          <span>{items.length} écriture(s) orpheline(s) en attente</span>
          <Button variant="outline" size="sm" onClick={closeReconciliation}>
            Fermer
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Intro Banner */}
        <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg flex items-start gap-3 text-xs text-indigo-900">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-indigo-950">
              Pourquoi ces écritures sont-elles bloquées ?
            </div>
            <p className="text-[11px] text-indigo-900/80 leading-relaxed">
              Ces paiements ou mouvements de caisse font référence à un identifiant d'élève qui n'existe pas dans le Cloud (créé hors-ligne sur un autre poste ou supprimé). Choisissez pour chaque écriture la décision métier appropriée : rattachement, création de la fiche, ou conversion comptable.
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="py-12 text-center text-gray-500 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span>Recherche des écritures bloquées...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs flex flex-col items-center gap-2 bg-gray-50 rounded-xl border border-gray-200">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
            <span className="font-semibold text-gray-800 text-sm">
              Toutes les écritures sont réconciliées !
            </span>
            <span className="text-[11px] text-gray-500">
              Aucune transaction n'est bloquée ou en quarantaine sur ce poste.
            </span>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {items.map((item) => {
              const p = item.payload || {}
              const isItemActive = activeAction?.itemId === item.id
              const amount = p.amount ? Number(p.amount).toLocaleString('fr-FR') : '0'
              const dateStr = p.payment_date || p.transaction_date || item.created_at

              return (
                <div
                  key={item.id}
                  className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs space-y-3 hover:border-gray-300 transition-all"
                >
                  {/* Top Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {item.table_name === 'student_payments' ? 'Paiement Scolaire' : 'Journal de Caisse'}
                      </span>
                      <span className="text-xs font-semibold text-gray-900">
                        {p.receipt_number ? `Reçu N° ${p.receipt_number}` : `Réf: ${item.record_id}`}
                      </span>
                      {item.status === 'failed' && (
                        <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 px-2 py-0.2 rounded-full">
                          Échec d'envoi ({item.retry_count} essais)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(dateStr).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>

                  {/* Transaction Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Montant</span>
                      <span className="font-bold text-gray-900">{amount} Ar</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Type de Frais</span>
                      <span className="font-medium text-gray-800 truncate block">
                        {p.payment_type || p.category || 'Écolage / Frais'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Mois / Période</span>
                      <span className="font-medium text-gray-800">{p.month || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">ID Élève Inconnu</span>
                      <span className="font-mono text-[11px] text-rose-700 truncate block" title={p.student_id || p.related_student_id}>
                        {(p.student_id || p.related_student_id || 'N/A').slice(0, 12)}...
                      </span>
                    </div>
                  </div>

                  {/* Error detail */}
                  {item.error_message && (
                    <div className="text-[11px] text-rose-700 bg-rose-50/50 p-2 rounded border border-rose-100 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
                      <span className="truncate" title={item.error_message}>
                        Contrainte Cloud : {item.error_message}
                      </span>
                    </div>
                  )}

                  {/* Action Buttons Group */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant={isItemActive && activeAction.type === 'attach' ? 'default' : 'outline'}
                      className="text-xs h-7"
                      onClick={() =>
                        setActiveAction(
                          isItemActive && activeAction.type === 'attach'
                            ? null
                            : { itemId: item.id, type: 'attach' }
                        )
                      }
                      disabled={processingId === item.id}
                    >
                      <UserCheck className="w-3.5 h-3.5 mr-1 text-blue-600" />
                      Rattacher à un élève existant
                    </Button>

                    <Button
                      size="sm"
                      variant={isItemActive && activeAction.type === 'create_student' ? 'default' : 'outline'}
                      className="text-xs h-7"
                      onClick={() =>
                        setActiveAction(
                          isItemActive && activeAction.type === 'create_student'
                            ? null
                            : { itemId: item.id, type: 'create_student' }
                        )
                      }
                      disabled={processingId === item.id}
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Créer la fiche élève manquante
                    </Button>

                    <Button
                      size="sm"
                      variant={isItemActive && activeAction.type === 'convert_cash' ? 'default' : 'outline'}
                      className="text-xs h-7"
                      onClick={() =>
                        setActiveAction(
                          isItemActive && activeAction.type === 'convert_cash'
                            ? null
                            : { itemId: item.id, type: 'convert_cash' }
                        )
                      }
                      disabled={processingId === item.id}
                      title="Transforme en écriture de caisse générale autonome (recette diverse)"
                    >
                      <Wallet className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                      Basculer en caisse générale
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 ml-auto"
                      onClick={() =>
                        setActiveAction(
                          isItemActive && activeAction.type === 'discard'
                            ? null
                            : { itemId: item.id, type: 'discard' }
                        )
                      }
                      disabled={processingId === item.id}
                      title="Annule l'écriture avec traçabilité dans le journal d'audit"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Annuler
                    </Button>
                  </div>

                  {/* Action Forms / Sub-drawers */}
                  {isItemActive && activeAction.type === 'attach' && (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2 mt-2">
                      <div className="text-xs font-semibold text-blue-900">
                        Rechercher l'élève auquel rattacher ce paiement :
                      </div>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                        <Input
                          placeholder="Rechercher par nom, prénom ou matricule..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          className="pl-8 text-xs h-8 bg-white"
                          autoFocus
                        />
                      </div>

                      {studentResults.length > 0 && (
                        <div className="border border-blue-200 rounded-md bg-white max-h-36 overflow-y-auto divide-y divide-blue-50">
                          {studentResults.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setSelectedStudentId(s.id)}
                              className={`w-full text-left p-2 text-xs flex justify-between items-center transition-colors ${
                                selectedStudentId === s.id
                                  ? 'bg-blue-100 font-semibold text-blue-900'
                                  : 'hover:bg-blue-50/50 text-gray-700'
                              }`}
                            >
                              <span>
                                {s.last_name} {s.first_name} {s.class_name ? `(${s.class_name})` : ''}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {s.registration_number || s.id.slice(0, 8)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => setActiveAction(null)}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          disabled={!selectedStudentId || processingId === item.id}
                          onClick={() => handleAttach(item.id)}
                          className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {processingId === item.id ? 'Rattachement...' : 'Confirmer le rattachement'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {isItemActive && activeAction.type === 'create_student' && (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2 mt-2">
                      <div className="text-xs font-semibold text-emerald-900">
                        Créer la fiche élève manquante pour valider l'intégrité :
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-gray-600 block mb-0.5">Nom de famille *</label>
                          <Input
                            placeholder="Nom..."
                            value={newStudent.last_name}
                            onChange={(e) => setNewStudent({ ...newStudent, last_name: e.target.value })}
                            className="text-xs h-8 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-600 block mb-0.5">Prénom *</label>
                          <Input
                            placeholder="Prénom..."
                            value={newStudent.first_name}
                            onChange={(e) => setNewStudent({ ...newStudent, first_name: e.target.value })}
                            className="text-xs h-8 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-600 block mb-0.5">Classe</label>
                          <Input
                            placeholder="Ex: 6ème A, CM2..."
                            value={newStudent.class_name}
                            onChange={(e) => setNewStudent({ ...newStudent, class_name: e.target.value })}
                            className="text-xs h-8 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-600 block mb-0.5">Matricule (optionnel)</label>
                          <Input
                            placeholder="Ex: MAT-2026-001"
                            value={newStudent.registration_number}
                            onChange={(e) =>
                              setNewStudent({ ...newStudent, registration_number: e.target.value })
                            }
                            className="text-xs h-8 bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => setActiveAction(null)}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            !newStudent.first_name.trim() ||
                            !newStudent.last_name.trim() ||
                            processingId === item.id
                          }
                          onClick={() => handleCreateStudent(item.id)}
                          className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {processingId === item.id ? 'Création...' : 'Créer & Réconcilier'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {isItemActive && activeAction.type === 'convert_cash' && (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 mt-2">
                      <div className="text-xs font-semibold text-indigo-900">
                        Conversion en écriture de caisse générale :
                      </div>
                      <p className="text-[11px] text-indigo-800">
                        Le montant ({amount} Ar) sera conservé dans le solde de caisse et la recette financière, mais détaché de la contrainte élève. Cela débloquera immédiatement la synchronisation sans perte financière.
                      </p>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => setActiveAction(null)}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          disabled={processingId === item.id}
                          onClick={() => handleConvertToCash(item.id)}
                          className="text-xs h-7 bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {processingId === item.id ? 'Conversion...' : 'Confirmer la conversion'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {isItemActive && activeAction.type === 'discard' && (
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg space-y-2 mt-2">
                      <div className="text-xs font-semibold text-rose-900">
                        Annuler définitivement l'écriture orpheline :
                      </div>
                      <Input
                        placeholder="Motif de l'annulation (ex: saisie de test fictive, doublon)..."
                        value={discardReason}
                        onChange={(e) => setDiscardReason(e.target.value)}
                        className="text-xs h-8 bg-white"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => setActiveAction(null)}
                        >
                          Retour
                        </Button>
                        <Button
                          size="sm"
                          disabled={!discardReason.trim() || processingId === item.id}
                          onClick={() => handleDiscard(item.id)}
                          className="text-xs h-7 bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          {processingId === item.id ? 'Annulation...' : 'Confirmer l’annulation'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}
