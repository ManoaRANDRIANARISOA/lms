import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  CreditCard,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Check,
  ShieldAlert
} from 'lucide-react'

export const DuplicateManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'payments' | 'students'>('payments')

  // Payment Duplicates State
  const [paymentGroups, setPaymentGroups] = useState<any[]>([])
  const [scanningPayments, setScanningPayments] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const [resolvingPaymentId, setResolvingPaymentId] = useState<string | null>(null)
  const [autoResolving, setAutoResolving] = useState(false)
  const [autoResolvedList, setAutoResolvedList] = useState<any[]>([])

  // Student Duplicates State
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [scanningStudents, setScanningStudents] = useState(false)
  const [studentMessage, setStudentMessage] = useState<string | null>(null)
  const [mergingStudentId, setMergingStudentId] = useState<string | null>(null)

  // Scan Payments
  const handleScanPayments = async () => {
    setScanningPayments(true)
    setPaymentMessage(null)
    try {
      if (window.api?.duplicates?.scanPayments) {
        const res = await window.api.duplicates.scanPayments()
        if (res.success) {
          setPaymentGroups(res.groups || [])
          if (!res.groups || res.groups.length === 0) {
            setPaymentMessage('Aucun doublon de paiement détecté. Tous les écolages et écritures de caisse sont parfaitement cohérents.')
          }
        } else {
          setPaymentMessage('Erreur : ' + (res.error || 'Erreur inconnue'))
        }
      }
    } catch (e: any) {
      setPaymentMessage('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setScanningPayments(false)
    }
  }

  // Auto Resolve Collisions
  const handleAutoResolveCollisions = async () => {
    if (
      !confirm(
        'Résolution automatique multi-postes :\n\n' +
        'Le système va parcourir tous les paiements en double (ex: écolage payé sur PC1 et PC2).\n' +
        'Il conservera automatiquement le 1er reçu émis (l\'original le plus ancien) et annulera le doublon en caisse et sur le cloud.\n\n' +
        'Voulez-vous lancer la résolution automatique ?'
      )
    )
      return

    setAutoResolving(true)
    try {
      if (window.api?.duplicates?.autoResolveCollisions) {
        const res = await window.api.duplicates.autoResolveCollisions()
        if (res.success) {
          setAutoResolvedList(res.resolved || [])
          setPaymentMessage(res.message || 'Collisions résolues avec succès.')
          await handleScanPayments()
        } else {
          setPaymentMessage('Erreur : ' + (res.error || 'Erreur inconnue'))
        }
      }
    } catch (e: any) {
      setPaymentMessage('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setAutoResolving(false)
    }
  }

  // Resolve Payment Duplicate
  const handleResolvePayment = async (
    group: any,
    keepRecord: any,
    removeRecord: any
  ) => {
    const confirmMsg =
      `Confirmation d'annulation de paiement en doublon :\n\n` +
      `Élève : ${group.student.last_name} ${group.student.first_name} (${group.student.class_name || 'Sans classe'})\n` +
      `Motif : ${group.payment_type_label} ${group.month ? `(${group.month})` : ''}\n\n` +
      `✅ CONSERVER : Reçu ${keepRecord.receipt_number || 'N/A'} — ${keepRecord.amount.toLocaleString('fr-FR')} Ar (${keepRecord.station || 'Caisse'})\n` +
      `❌ ANNULER & SUPPRIMER : Reçu ${removeRecord.receipt_number || 'N/A'} — ${removeRecord.amount.toLocaleString('fr-FR')} Ar (${removeRecord.station || 'Caisse'})\n\n` +
      `Cette action va passer le reçu ${removeRecord.receipt_number || ''} en annulé, déduire son montant du journal de caisse pour équilibrer la trésorerie et propager l'annulation sur le Cloud Supabase.\n\n` +
      `Voulez-vous continuer ?`

    if (!confirm(confirmMsg)) return

    setResolvingPaymentId(removeRecord.id)
    try {
      if (window.api?.duplicates?.resolvePayment) {
        const res = await window.api.duplicates.resolvePayment(
          keepRecord.id,
          removeRecord.id,
          `Doublon résolu inter-caisses (${keepRecord.station || 'Caisse'} conservée)`
        )
        if (res.success) {
          await handleScanPayments()
        } else {
          alert('Erreur lors de la résolution : ' + res.error)
        }
      }
    } catch (e: any) {
      alert('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setResolvingPaymentId(null)
    }
  }

  // Scan Students
  const handleScanStudents = async () => {
    setScanningStudents(true)
    setStudentMessage(null)
    try {
      if (window.api?.duplicates?.scan) {
        const res = await window.api.duplicates.scan()
        if (res.success) {
          setStudentGroups(res.groups || [])
          if (!res.groups || res.groups.length === 0) {
            setStudentMessage('Aucun dossier élève en doublon détecté. Les profils élèves sont sains.')
          }
        } else {
          setStudentMessage('Erreur : ' + (res.error || 'Erreur inconnue'))
        }
      }
    } catch (e: any) {
      setStudentMessage('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setScanningStudents(false)
    }
  }

  // Merge Students
  const handleMergeStudents = async (keepId: string, removeId: string) => {
    if (
      !confirm(
        'Voulez-vous vraiment fusionner ces dossiers ?\nTous les paiements, notes et présences seront rattachés au profil conservé. Le profil en doublon sera désactivé.'
      )
    ) {
      return
    }

    setMergingStudentId(removeId)
    try {
      if (window.api?.duplicates?.merge) {
        const res = await window.api.duplicates.merge(keepId, removeId)
        if (res.success) {
          await handleScanStudents()
        } else {
          alert('Erreur fusion : ' + res.error)
        }
      }
    } catch (e: any) {
      alert('Erreur : ' + (e?.message || 'Erreur inconnue'))
    } finally {
      setMergingStudentId(null)
    }
  }

  return (
    <div className="bg-white p-6 rounded shadow max-w-4xl border border-gray-100 mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-800">
              Centre de Contrôle & Doublons
            </h2>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Outils de réconciliation de données en cas de double saisie sur deux ordinateurs (PC 1 / PC 2) ou de doublons d'élèves.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-lg self-start sm:self-auto border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'payments'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Paiements Multi-Postes</span>
            {paymentGroups.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {paymentGroups.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'students'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Dossiers Élèves</span>
            {studentGroups.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {studentGroups.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PAIEMENTS MULTI-POSTES (C1 vs C2) */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/50 p-3.5 rounded-lg border border-indigo-100">
            <div className="text-xs text-indigo-900">
              <span className="font-semibold">Vérification des doubles saisies d'écolage :</span>
              <p className="text-indigo-700/80 mt-0.5">
                Détecte les cas où un élève a été encaissé à la fois sur le Poste 1 et sur le Poste 2 pour le même mois et la même année scolaire.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleScanPayments}
                disabled={scanningPayments || autoResolving}
                variant="outline"
                className="text-xs h-8 px-3 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                {scanningPayments ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Scan en cours...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Scanner les paiements
                  </>
                )}
              </Button>

              {paymentGroups.length > 0 && (
                <Button
                  type="button"
                  onClick={handleAutoResolveCollisions}
                  disabled={autoResolving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 text-xs h-8 px-3 font-medium shadow-xs"
                >
                  {autoResolving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Résolution auto...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Résoudre tout (Garder 1er reçu)
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {autoResolvedList.length > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-2">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {autoResolvedList.length} collision(s) résolue(s) avec succès :
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-emerald-100 bg-white rounded border border-emerald-100">
                {autoResolvedList.map((item, idx) => (
                  <div key={idx} className="p-2 flex justify-between items-center text-[11px]">
                    <div>
                      <span className="font-medium text-gray-900">{item.student_name}</span>{' '}
                      <span className="text-gray-500">({item.class_name || 'Sans classe'})</span> —{' '}
                      <span className="text-emerald-700">{item.month}</span> ({item.amount.toLocaleString()} Ar)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono">
                        Gardé: {item.kept_receipt}
                      </span>
                      <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 line-through font-mono">
                        Annulé: {item.removed_receipt}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {paymentMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                paymentMessage.includes('Aucun doublon')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {paymentMessage.includes('Aucun doublon') ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{paymentMessage}</span>
            </div>
          )}

          {paymentGroups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  {paymentGroups.length} groupe{paymentGroups.length > 1 ? 's' : ''} de paiement{paymentGroups.length > 1 ? 's' : ''} en doublon détecté{paymentGroups.length > 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-gray-500 italic">
                  Cliquez sur "Conserver ce reçu" pour valider l'exemplaire légitime et annuler le doublon
                </span>
              </div>

              {paymentGroups.map((group) => (
                <div
                  key={group.group_id}
                  className="p-4 rounded-lg border border-amber-200 bg-amber-50/20 space-y-3"
                >
                  {/* Student Title & Context */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-amber-100 pb-2.5">
                    <div>
                      <span className="font-bold text-gray-900 text-sm">
                        {group.student.last_name} {group.student.first_name}
                      </span>
                      {group.student.class_name && (
                        <span className="ml-2 px-2 py-0.5 bg-gray-200/80 text-gray-700 rounded text-xs font-medium">
                          {group.student.class_name}
                        </span>
                      )}
                      {group.student.registration_number && (
                        <span className="ml-1.5 text-xs text-gray-500 font-mono">
                          (Matr: {group.student.registration_number})
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded self-start sm:self-auto">
                      {group.payment_type_label} {group.month ? `— ${group.month}` : ''} ({group.school_year})
                    </div>
                  </div>

                  {/* Comparative Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.records.map((rec: any, idx: number) => {
                      const otherRec = group.records.find((r: any) => r.id !== rec.id)
                      const isResolving = resolvingPaymentId === rec.id || resolvingPaymentId === otherRec?.id

                      return (
                        <div
                          key={rec.id}
                          className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-2xs space-y-2.5 flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  rec.station === 'C1'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : rec.station === 'C2'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : 'bg-gray-100 text-gray-700 border-gray-200'
                                }`}
                              >
                                Poste : {rec.station} (Reçu {idx + 1})
                              </span>
                              <span className="text-sm font-extrabold text-gray-900 font-mono">
                                {rec.amount?.toLocaleString('fr-FR')} Ar
                              </span>
                            </div>

                            <div className="text-xs space-y-1 text-gray-600 bg-gray-50/70 p-2 rounded border border-gray-100">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Numéro de reçu :</span>
                                <span className="font-mono font-bold text-gray-800">
                                  {rec.receipt_number || 'Non attribué'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Date de paiement :</span>
                                <span className="font-medium text-gray-800">
                                  {rec.payment_date}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Encaissé par :</span>
                                <span className="text-gray-700 truncate max-w-[150px]">
                                  {rec.created_by}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Mode :</span>
                                <span className="text-gray-700 capitalize">
                                  {rec.payment_method}
                                </span>
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleResolvePayment(group, rec, otherRec)}
                            disabled={isResolving || !otherRec}
                            className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                          >
                            {isResolving ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Régularisation...
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5 mr-1.5" />
                                Conserver ce reçu (Annuler l'autre)
                              </>
                            )}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DOSSIERS ÉLÈVES (FUSION DE PROFILS) */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/50 p-3.5 rounded-lg border border-indigo-100">
            <div className="text-xs text-indigo-900">
              <span className="font-semibold">Contrôle d'intégrité des dossiers élèves :</span>
              <p className="text-indigo-700/80 mt-0.5">
                Scanne les dossiers ayant exactement les mêmes nom et prénom. Vous pouvez fusionner deux profils pour transférer tous les paiements et notes sur un seul dossier.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleScanStudents}
              disabled={scanningStudents}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 text-xs h-8 px-3"
            >
              {scanningStudents ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Scan en cours...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Scanner les élèves
                </>
              )}
            </Button>
          </div>

          {studentMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                studentMessage.includes('Aucun dossier')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {studentMessage.includes('Aucun dossier') ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{studentMessage}</span>
            </div>
          )}

          {studentGroups.length > 0 && (
            <div className="space-y-4">
              <span className="text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 w-fit">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                {studentGroups.length} groupe{studentGroups.length > 1 ? 's' : ''} de dossiers élèves en doublon
              </span>

              {studentGroups.map((g, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-amber-50/25 border border-amber-200 rounded-lg space-y-3"
                >
                  <div className="text-xs font-bold text-gray-900">
                    {g.name}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {g.records.map((r: any) => {
                      const other = g.records.find((o: any) => o.id !== r.id)
                      const isMerging = mergingStudentId === r.id || mergingStudentId === other?.id

                      return (
                        <div
                          key={r.id}
                          className="bg-white p-3 rounded border border-gray-200 text-xs flex flex-col justify-between gap-2 shadow-2xs"
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-gray-800">
                                Classe : {r.class_name || 'Sans classe'}
                              </span>
                              <span className="text-[10px] font-mono text-gray-500">
                                Matr: {r.registration_number || 'N/A'}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Créé le : {new Date(r.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-[11px] text-indigo-700 font-medium pt-1">
                              {r.payments_count} paiement(s) • {r.grades_count} note(s) • {r.fees_count} frais
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            disabled={isMerging || !other}
                            onClick={() => handleMergeStudents(r.id, other.id)}
                            className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-7 mt-1"
                          >
                            {isMerging ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            Conserver ce profil (Fusionner l'autre)
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
