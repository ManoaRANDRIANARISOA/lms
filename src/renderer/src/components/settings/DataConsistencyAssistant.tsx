/**
 * DataConsistencyAssistant.tsx — Assistant de remédiation interactif par poste
 *
 * Scanne les incohérences local ↔ Supabase et présente deux groupes :
 *   - Cas évidents : correction automatique déterministe (un clic).
 *   - Cas à décider : regroupés pour décision humaine, avec conseil du logiciel.
 *
 * Toutes les applications sont non destructives, tracées (settings_history) et
 * propagées par la synchronisation. Réservé à la Direction / Admin.
 */

import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/useAuthStore'
import { SyncQueuePanel } from '@/components/sync/SyncQueuePanel'
import { toast } from 'sonner'
import {
  ScanSearch,
  RefreshCw,
  CheckCircle,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CloudOff,
  UserCheck,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  Search,
  Info,
  ExternalLink
} from 'lucide-react'

interface Finding {
  id: string
  category: string
  classification: 'auto' | 'decision'
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  recommendation: string
  action: string
  params: Record<string, any>
  affectedCount: number
  amountImpact?: number
  evidence?: Record<string, any>
}

interface ScanResult {
  success: boolean
  stationCode?: string
  schoolYear?: string
  scannedAt?: string
  cloudAvailable?: boolean
  autoCount?: number
  decisionCount?: number
  findings?: Finding[]
  error?: string
}

interface StudentOption {
  id: string
  first_name: string
  last_name: string
  class?: string
  class_name?: string
  registration_number?: string
}

const severityStyle: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700'
}

const categoryMeta: Record<string, { label: string; guidance: string; order: number }> = {
  cloud_parity: { label: 'Parité Cloud', guidance: 'Captifs / manquants / tombstones. Convergence non destructive.', order: 0 },
  orphan_payment: { label: 'Paiements orphelins', guidance: "Écritures rattachées à un élève supprimé. Rattacher au bon élève ou archiver si la suppression était volontaire.", order: 1 },
  reverse_tombstone: { label: 'Suppressions non propagées', guidance: "Une suppression locale n'est pas remontée au Cloud. Pousser la suppression ou rapatrier la version cloud.", order: 2 },
  receipt_collision: { label: 'Collisions de numéro de reçu', guidance: "Deux paiements RÉELS partagent le même n° de reçu. Ne jamais fusionner. Conserver les deux (documents légaux) ou renuméroter le plus récent s'il n'a jamais été imprimé.", order: 3 },
  duplicate_candidate: { label: 'Candidats doublons', guidance: "Écritures identiques (élève, type, montant, date). ATTENTION : plusieurs articles d'uniforme au même prix le même jour sont légitimes. Vérifier les preuves avant de garder l'ancien.", order: 4 },
  orphan_journal: { label: 'Journal orphelin', guidance: 'Écriture de caisse sans paiement rattaché. Rattacher ou archiver avec motif.', order: 5 },
  duplicate_fee: { label: 'Fiches de frais dupliquées', guidance: 'Plusieurs fiches pour un même élève/année. Garder la plus ancienne (ou la plus complète).', order: 6 },
  fee_misalignment: { label: 'Écarts tarifaires', guidance: 'Fiche vs grille centralisée. Conserver si tarif négocié, sinon appliquer la grille. Décision par élève.', order: 7 },
  receipt_compliance: { label: 'Conformité des reçus', guidance: 'Reçus manquants, hors norme ou année incohérente. Examiner au cas par cas ; un reçu remis est un document légal.', order: 8 },
  abnormal_amount: { label: 'Montants anormaux', guidance: 'Montants négatifs ou nuls hors remise. Contrôler dans la Traçabilité.', order: 9 },
  orphan_fee: { label: 'Fiches de frais orphelines', guidance: 'Fiches rattachées à un élève supprimé. Examiner avant toute action.', order: 10 },
  subscription_incoherence: { label: 'Souscriptions incohérentes', guidance: 'Abonnés bus/cantine sans axe ou tarif. Vérifier la fiche de frais.', order: 11 },
  creator_identity: { label: 'Identités créateur dupliquées', guidance: 'Comptes désignant la même personne (cause racine des collisions). Normalisation via migration tracée, hors assistant.', order: 12 },
  duplicate_closure: { label: 'Clôtures dupliquées', guidance: 'Plusieurs clôtures même poste/jour/compte. Examiner dans le module Caisse.', order: 13 },
  missing_closure: { label: 'Journées sans clôture', guidance: 'Paiements sans clôture de caisse. Vérifier le processus journalier.', order: 14 },
  audit_signal: { label: "Signaux d'audit", guidance: 'Mois décalé ou antidaté. Contrôler dans la Traçabilité.', order: 15 }
}
const catOrder = (c: string): number => categoryMeta[c]?.order ?? 99

export const DataConsistencyAssistant: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin' || user?.role === 'direction'

  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)

  // Decision sub-state per finding
  const [orphanTarget, setOrphanTarget] = useState<Record<string, string>>({})
  const [orphanSearch, setOrphanSearch] = useState<Record<string, string>>({})
  const [orphanResults, setOrphanResults] = useState<Record<string, StudentOption[]>>({})
  const [archiveReason, setArchiveReason] = useState<Record<string, string>>({})
  const [dupChoice, setDupChoice] = useState<Record<string, string>>({})
  const [showHelp, setShowHelp] = useState(false)
  const [filter, setFilter] = useState('')
  const [unifyRunning, setUnifyRunning] = useState(false)

  const runScan = useCallback(async () => {
    if (!window.api?.sync?.scanInconsistencies) return
    setScanning(true)
    try {
      const res = (await window.api.sync.scanInconsistencies()) as ScanResult
      if (!res.success) {
        toast.error(res.error || 'Échec du scan')
        setResult(null)
      } else {
        setResult(res)
        if (!res.cloudAvailable) {
          toast.info('Cloud injoignable : seules les incohérences locales sont affichées.')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur de scan : ${msg}`)
    } finally {
      setScanning(false)
    }
  }, [])

  const apply = useCallback(
    async (finding: Finding, action: string, params: Record<string, any>, successFallback: string) => {
      if (!window.api?.sync?.applyRemediation) return
      setProcessingId(finding.id)
      try {
        const res = await window.api.sync.applyRemediation(action, params)
        if (res.success) {
          toast.success(res.message || successFallback)
          await runScan()
        } else {
          toast.error(res.error || 'Échec de la remédiation')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Erreur : ${msg}`)
      } finally {
        setProcessingId(null)
      }
    },
    [runScan]
  )

  const runAutoBatch = useCallback(async () => {
    const autos = (result?.findings || []).filter((f) => f.classification === 'auto')
    if (autos.length === 0) return
    if (!confirm(`Appliquer automatiquement les ${autos.length} correction(s) évidente(s) ? Aucune donnée ne sera perdue.`)) return
    setBatchRunning(true)
    let ok = 0
    for (const f of autos) {
      try {
        const res = await window.api.sync.applyRemediation(f.action, f.params)
        if (res.success) ok++
        else toast.error(`${f.title} : ${res.error || 'échec'}`)
      } catch {
        toast.error(`${f.title} : erreur`)
      }
    }
    setBatchRunning(false)
    toast.success(`${ok}/${autos.length} correction(s) automatique(s) appliquée(s).`)
    await runScan()
  }, [result, runScan])

  const runUnifyCertain = useCallback(async () => {
    const certains = (result?.findings || []).filter(
      (f) =>
        f.classification === 'decision' &&
        f.category === 'duplicate_candidate' &&
        f.evidence?.certain === true
    )
    if (certains.length === 0) return
    const totalAmount = certains.reduce((s, f) => s + (f.amountImpact || 0), 0)
    if (
      !confirm(
        `Unifier ${certains.length} groupe(s) de doublons CERTAINS ?\n\n` +
          `Le plus récent de chaque groupe sera archivé (soft-delete réversible) ; l'écriture la plus ancienne et son reçu d'origine sont conservés. Aucun reçu papier imprimé n'est concerné. Journée non scellée (Ticket Z).\n\n` +
          `Montant total dédupliqué : ${totalAmount.toLocaleString('fr-FR')} Ar. Chaque décision est tracée et propagée aux autres postes.\n\nContinuer ?`
      )
    )
      return
    setUnifyRunning(true)
    let ok = 0
    for (const f of certains) {
      try {
        const res = await window.api.sync.applyRemediation('resolve_duplicate_candidate', {
          decision: 'keep_old',
          keepId: f.params.keepId,
          studentId: f.params.studentId
        })
        if (res.success) ok++
        else toast.error(`${f.title} : ${res.error || 'échec'}`)
      } catch {
        toast.error(`${f.title} : erreur`)
      }
    }
    setUnifyRunning(false)
    toast.success(`${ok}/${certains.length} groupe(s) de doublons certains unifié(s).`)
    await runScan()
  }, [result, runScan])

  const searchStudents = useCallback(async (findingId: string, term: string) => {
    setOrphanSearch((p) => ({ ...p, [findingId]: term }))
    if (!term.trim() || !window.api?.student?.list) {
      setOrphanResults((p) => ({ ...p, [findingId]: [] }))
      return
    }
    try {
      const res = await window.api.student.list({ search: term.trim() })
      const list = (res?.students || []) as StudentOption[]
      setOrphanResults((p) => ({ ...p, [findingId]: list.slice(0, 8) }))
    } catch {
      setOrphanResults((p) => ({ ...p, [findingId]: [] }))
    }
  }, [])

  if (!isAdmin) return null

  const term = filter.trim().toLowerCase()
  const matchesFilter = (f: Finding): boolean =>
    !term ||
    f.title.toLowerCase().includes(term) ||
    f.category.toLowerCase().includes(term) ||
    (f.detail || '').toLowerCase().includes(term) ||
    (categoryMeta[f.category]?.label || '').toLowerCase().includes(term)
  const findings = (result?.findings || []).filter(matchesFilter)
  const autos = findings.filter((f) => f.classification === 'auto')
  const decisions = findings
    .filter((f) => f.classification === 'decision')
    .sort((a, b) => catOrder(a.category) - catOrder(b.category))
  const certainDups = decisions.filter(
    (f) => f.category === 'duplicate_candidate' && f.evidence?.certain === true
  )

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm w-full border border-indigo-100">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <ScanSearch className="w-5 h-5 text-indigo-600" />
          Assistant de cohérence des données
        </h2>
        <Button
          onClick={runScan}
          disabled={scanning}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
        >
          {scanning ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <ScanSearch className="w-4 h-4 mr-1.5" />}
          {scanning ? 'Scan en cours...' : 'Scanner ce poste'}
        </Button>
      </div>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Compare la base locale de ce poste au Cloud Supabase, regroupe les incohérences et propose
        une correction. Les cas évidents sont corrigés automatiquement ; les cas ambigus (suppression
        volontaire possible, homonymes) restent à votre décision, avec l'avis du logiciel. Toute
        action est tracée et propagée aux autres postes.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowHelp((v) => !v)}
          className="text-xs h-7 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
        >
          <Info className="w-3.5 h-3.5 mr-1" /> {showHelp ? 'Masquer le guide' : "Guide d'utilisation"}
        </Button>
        {result && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
            <Input
              placeholder="Filtrer les constats (élève, reçu, famille...)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 text-xs h-8 bg-white"
            />
          </div>
        )}
      </div>

      {showHelp && (
        <div className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-gray-700 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-indigo-900 text-xs">Comment utiliser l'assistant</p>
          <p><b>1. Scanner ce poste</b> : compare votre base locale au Cloud et liste les anomalies, regroupées par famille (en-têtes gris).</p>
          <p><b>2. Cas évidents (vert)</b> : correction automatique non destructive, en un clic ou « Tout corriger ».</p>
          <p><b>3. Cas à décider (rouge)</b> : AUCUNE action automatique sur l'argent. Lisez les preuves (reçus, caissier, heures, impressions) puis choisissez. Le bouton vert « Garder les deux / conserver » est le choix sûr par défaut.</p>
          <p><b>Confiance</b> : « forte » = type unique par période + même caissier + mêmes secondes (doublon probable). « Ambigu » = plusieurs articles au même prix le même jour possibles → ne pas fusionner sans vérification.</p>
          <p><b>Reçus papier</b> : un reçu déjà imprimé est un document légal détenu par le parent. Il n'est jamais renuméroté sans votre confirmation explicite ; le numéro d'origine est toujours conservé en référence.</p>
          <p><b>Journée scellée (Ticket Z)</b> : toute modification est refusée tant que la caisse du jour est verrouillée. Déverrouillage Direction requis.</p>
          <p><b>Traçabilité</b> : chaque décision est enregistrée et propagée aux autres postes. Rien n'est supprimé définitivement (archivage = soft-delete réversible).</p>
        </div>
      )}

      {result && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
            Poste : {result.stationCode || 'non configuré'}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            Année : {result.schoolYear}
          </span>
          {result.cloudAvailable ? (
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Cloud joint</span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
              <CloudOff className="w-3 h-3" /> Cloud injoignable
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
            {result.autoCount || 0} évident(s)
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800">
            {result.decisionCount || 0} à décider
          </span>
          {result.scannedAt && (
            <span className="text-gray-400">
              {new Date(result.scannedAt).toLocaleString('fr-FR')}
            </span>
          )}
        </div>
      )}

      {!result && !scanning && (
        <div className="py-10 text-center text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-xl">
          Lancez un scan pour détecter les incohérences de ce poste.
        </div>
      )}

      {result && findings.length === 0 && (
        <div className="py-10 text-center text-xs flex flex-col items-center gap-2 bg-emerald-50 rounded-xl border border-emerald-200">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
          <span className="font-semibold text-gray-800 text-sm">Aucune incohérence détectée</span>
          <span className="text-gray-500">Ce poste est aligné avec le Cloud.</span>
        </div>
      )}

      {/* --- Cas évidents --- */}
      {autos.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Cas évidents — correction automatique
            </h3>
            <Button
              size="sm"
              onClick={runAutoBatch}
              disabled={batchRunning || processingId !== null}
              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {batchRunning ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
              Tout corriger ({autos.length})
            </Button>
          </div>
          <div className="space-y-2">
            {autos.map((f) => (
              <div key={f.id} className="p-3 border border-emerald-200 bg-emerald-50/40 rounded-lg">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${severityStyle[f.severity]}`}>
                        {f.affectedCount}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{f.title}</span>
                      {f.amountImpact ? (
                        <span className="text-[11px] text-gray-500">
                          {f.amountImpact.toLocaleString('fr-FR')} Ar
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-gray-600 leading-relaxed">{f.detail}</p>
                    <p className="text-[11px] text-emerald-800 mt-1 flex items-start gap-1">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" /> {f.recommendation}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => apply(f, f.action, f.params, 'Correction appliquée.')}
                    disabled={processingId === f.id || batchRunning}
                    className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  >
                    {processingId === f.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Appliquer'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Doublons certains : unification automatique (batch 1 clic) --- */}
      {certainDups.length > 0 && (
        <div className="mb-5 p-3 border border-emerald-300 bg-emerald-50/50 rounded-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-emerald-900">
                Doublons certains — unification automatique
              </h3>
              <span className="text-[11px] text-emerald-700">({certainDups.length} groupe(s))</span>
            </div>
            <Button
              size="sm"
              onClick={runUnifyCertain}
              disabled={unifyRunning || processingId !== null}
              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {unifyRunning ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
              )}
              Unifier les certains ({certainDups.length})
            </Button>
          </div>
          <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
            Écritures identiques (élève, type, montant, date, mois), même caissier, créées à quelques
            secondes, même mode et libellé, <b>aucun reçu papier imprimé</b> sur les plus récentes,
            journée non scellée. Le plus récent est archivé (réversible) ; l'ancien et son reçu
            d'origine sont conservés. Chaque décision est tracée et propagée.
          </p>
        </div>
      )}

      {/* --- Cas à décider --- */}
      {decisions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-1.5 mb-2">
            <ShieldAlert className="w-4 h-4" /> Cas à décider — avis du logiciel
          </h3>
          <div className="space-y-3">
            {decisions.map((f, idx) => {
              const candidates = (f.evidence?.candidates || []) as StudentOption[]
              const target = orphanTarget[f.id] || ''
              const results = orphanResults[f.id] || []
              const reason = archiveReason[f.id] || ''
              const showHeader = idx === 0 || decisions[idx - 1].category !== f.category
              const meta = categoryMeta[f.category]
              const familyCount = decisions.filter((d) => d.category === f.category).length
              return (
                <React.Fragment key={f.id}>
                {showHeader && meta && (
                  <div className="pt-2 pb-1 border-b border-gray-200">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                      {meta.label} <span className="text-gray-400 normal-case">({familyCount})</span>
                    </h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{meta.guidance}</p>
                  </div>
                )}
                <div className="p-3 border border-rose-200 bg-rose-50/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${severityStyle[f.severity]}`}>
                      {f.affectedCount}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{f.title}</span>
                    {f.amountImpact ? (
                      <span className="text-[11px] text-gray-500">{f.amountImpact.toLocaleString('fr-FR')} Ar</span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{f.detail}</p>
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {f.recommendation}
                  </p>

                  {f.action === 'resolve_duplicate_candidate' && f.evidence?.certain === true && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      <ShieldCheck className="w-3 h-3" /> Doublon certain — unifiable en 1 clic
                    </span>
                  )}

                  {((f.action === 'resolve_duplicate_candidate' && f.evidence?.confidence !== 'high') ||
                    (f.action === 'resolve_receipt_collision' && f.params.laterPrinted)) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      <ShieldCheck className="w-3 h-3" /> Conseil sûr : conserver les deux
                    </span>
                  )}

                  {['resolve_duplicate_candidate', 'resolve_receipt_collision', 'resolve_orphan_journal', 'resolve_duplicate_fee'].includes(f.action) && (
                    <button
                      onClick={() => navigate('/finance/tracabilite')}
                      className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1 w-fit"
                    >
                      <ExternalLink className="w-3 h-3" /> Vérifier dans la Traçabilité
                    </button>
                  )}

                  {/* Orphan group: reassign or archive */}
                  {f.action === 'review_orphan' && (
                    <div className="space-y-2 pt-1">
                      {candidates.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {candidates.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setOrphanTarget((p) => ({ ...p, [f.id]: c.id }))}
                              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                                target === c.id
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'
                              }`}
                            >
                              {c.last_name} {c.first_name} {c.registration_number ? `(${c.registration_number})` : ''}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                        <Input
                          placeholder="Rechercher un élève cible (nom, prénom, matricule)..."
                          value={orphanSearch[f.id] || ''}
                          onChange={(e) => searchStudents(f.id, e.target.value)}
                          className="pl-8 text-xs h-8 bg-white"
                        />
                      </div>
                      {results.length > 0 && (
                        <div className="border border-blue-200 rounded-md bg-white max-h-32 overflow-y-auto divide-y divide-blue-50">
                          {results.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setOrphanTarget((p) => ({ ...p, [f.id]: s.id }))}
                              className={`w-full text-left p-2 text-xs flex justify-between items-center ${
                                target === s.id ? 'bg-blue-100 font-semibold text-blue-900' : 'hover:bg-blue-50/50 text-gray-700'
                              }`}
                            >
                              <span>{s.last_name} {s.first_name} {s.class || s.class_name ? `(${s.class || s.class_name})` : ''}</span>
                              <span className="text-[10px] text-gray-400 font-mono">{s.registration_number || s.id.slice(0, 8)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!target || processingId === f.id}
                          onClick={() =>
                            apply(f, 'reassign_orphan_group', { studentId: f.params.studentId, targetStudentId: target }, 'Écritures rattachées.')
                          }
                          className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <UserCheck className="w-3.5 h-3.5 mr-1" /> Rattacher à l'élève choisi
                        </Button>
                        <Input
                          placeholder="Motif d'archivage (si suppression volontaire)..."
                          value={reason}
                          onChange={(e) => setArchiveReason((p) => ({ ...p, [f.id]: e.target.value }))}
                          className="text-xs h-7 bg-white flex-1 min-w-[180px]"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!reason.trim() || processingId === f.id}
                          onClick={() => {
                            if (!confirm('Archiver ces paiements orphelins ? Ils seront marqués supprimés et propagés.')) return
                            apply(f, 'archive_orphan_group', { studentId: f.params.studentId, reason: reason.trim() }, 'Paiements archivés.')
                          }}
                          className="text-xs h-7 text-rose-600 border-rose-300 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Archiver
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Reverse tombstone: push or resurrect */}
                  {f.action === 'resolve_reverse_tombstone' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={processingId === f.id}
                        onClick={() => {
                          if (!confirm('Confirmer la suppression dans le Cloud (pousser la tombstone locale) ?')) return
                          apply(f, 'resolve_reverse_tombstone', { ...f.params, decision: 'push_tombstone' }, 'Tombstone poussée.')
                        }}
                        className="text-xs h-7 bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        <ArrowUpToLine className="w-3.5 h-3.5 mr-1" /> Pousser la suppression
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processingId === f.id}
                        onClick={() =>
                          apply(f, 'resolve_reverse_tombstone', { ...f.params, decision: 'resurrect_local' }, 'Version cloud rapatriée.')
                        }
                        className="text-xs h-7 text-blue-700 border-blue-300 hover:bg-blue-50"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 mr-1" /> Rapatrier du Cloud
                      </Button>
                    </div>
                  )}

                  {/* Audit signals: review only */}
                  {f.action === 'review_only' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/finance/tracabilite')}
                        className="text-xs h-7 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Ouvrir la Traçabilité
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={processingId === f.id}
                        onClick={() => apply(f, 'review_only', {}, 'Constat marqué consulté.')}
                        className="text-xs h-7 text-gray-600"
                      >
                        Marquer consulté
                      </Button>
                    </div>
                  )}

                  {/* Fee misalignment: apply grid or keep negotiated tariff (per student) */}
                  {f.action === 'realign_fee_single' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={processingId === f.id}
                        onClick={() => {
                          if (!confirm('Appliquer la grille centralisée à cette fiche ? Le tarif enregistré sera remplacé et propagé au Cloud.')) return
                          apply(f, 'realign_fee_single', { ...f.params, decision: 'apply_grid' }, 'Tarif appliqué selon la grille.')
                        }}
                        className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Appliquer la grille
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processingId === f.id}
                        onClick={() => apply(f, 'realign_fee_single', { ...f.params, decision: 'keep' }, 'Tarif actuel conservé.')}
                        className="text-xs h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Conserver le tarif actuel
                      </Button>
                    </div>
                  )}

                  {/* Candidat doublon (classe B) : preuves + choix humain, jamais auto */}
                  {f.action === 'resolve_duplicate_candidate' && (() => {
                    const lines = (f.evidence?.lines || []) as Array<Record<string, any>>
                    const confidence = f.evidence?.confidence
                    const chosen = dupChoice[f.id] || (f.params.keepId as string)
                    const anyPrinted = lines.some((l) => (l.printCount || 0) > 0)
                    return (
                      <div className="space-y-2 pt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${confidence === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                          {confidence === 'high' ? 'Confiance forte — confirmer' : 'Ambigu — vérifier avant de décider'}
                        </span>
                        <div className="border border-gray-200 rounded bg-white divide-y divide-gray-100 max-h-40 overflow-y-auto">
                          {lines.map((l) => (
                            <button
                              key={l.id}
                              onClick={() => setDupChoice((p) => ({ ...p, [f.id]: l.id }))}
                              className={`w-full text-left p-2 text-[11px] flex flex-wrap justify-between gap-1 ${chosen === l.id ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}`}
                            >
                              <span className="font-mono">{l.receipt || 'sans reçu'}</span>
                              <span>{l.createdBy} · {l.createdAt ? new Date(l.createdAt).toLocaleString('fr-FR') : ''}</span>
                              <span className={(l.printCount || 0) > 0 ? 'text-rose-600' : 'text-gray-400'}>
                                {(l.printCount || 0) > 0 ? `imprimé ×${l.printCount}` : 'non imprimé'}
                              </span>
                              <span className="text-[10px] text-blue-700">{chosen === l.id ? '✓ à conserver' : ''}</span>
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={processingId === f.id}
                            onClick={() => {
                              const keepId = chosen
                              const msg = anyPrinted
                                ? "ATTENTION : au moins un reçu a déjà été imprimé (document légal). Archiver le(s) doublon(s) en conservant la sélection ? Confirmez-vous que les reçus papier archivés ne font pas foi ?"
                                : "Archiver le(s) doublon(s) et conserver l'écriture sélectionnée ? Le reçu d'origine est préservé."
                              if (!confirm(msg)) return
                              apply(
                                f,
                                'resolve_duplicate_candidate',
                                { ...f.params, decision: keepId === f.params.keepId ? 'keep_old' : 'keep_chosen', keepId, chosenId: keepId, confirmPrinted: true },
                                'Doublon(s) archivé(s), écriture conservée.'
                              )
                            }}
                            className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Garder la sélection
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={processingId === f.id}
                            onClick={() => apply(f, 'resolve_duplicate_candidate', { ...f.params, decision: 'keep_both' }, 'Les deux écritures conservées.')}
                            className="text-xs h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Garder les deux
                          </Button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Collision de reçu (classe A) : conserver ou renuméroter le plus récent */}
                  {f.action === 'resolve_receipt_collision' && (() => {
                    const lines = (f.evidence?.lines || []) as Array<Record<string, any>>
                    const laterPrinted = !!f.params.laterPrinted
                    return (
                      <div className="space-y-2 pt-1">
                        <div className="border border-gray-200 rounded bg-white divide-y divide-gray-100 max-h-40 overflow-y-auto">
                          {lines.map((l) => (
                            <div key={l.id} className="p-2 text-[11px] flex flex-wrap justify-between gap-1">
                              <span className="font-semibold text-gray-800">{l.student}</span>
                              <span>{(l.amount || 0).toLocaleString('fr-FR')} Ar · {l.type} · {l.date}</span>
                              <span>{l.createdBy} · {l.createdAt ? new Date(l.createdAt).toLocaleString('fr-FR') : ''}</span>
                              <span className={(l.printCount || 0) > 0 ? 'text-rose-600' : 'text-gray-400'}>
                                {(l.printCount || 0) > 0 ? `imprimé ×${l.printCount}` : 'non imprimé'}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={processingId === f.id}
                            onClick={() => apply(f, 'resolve_receipt_collision', { ...f.params, decision: 'keep_both' }, 'Collision conservée (documents légaux préservés).')}
                            className="text-xs h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Conserver les deux
                          </Button>
                          <Button
                            size="sm"
                            disabled={processingId === f.id}
                            onClick={() => {
                              const msg = laterPrinted
                                ? "ATTENTION : le reçu le plus récent a DÉJÀ été imprimé et est détenu par le parent. Le renuméroter créera un écart papier↔système (la référence d'origine sera conservée). Confirmer explicitement ?"
                                : "Renuméroter le paiement le plus récent (jamais imprimé) pour lever la collision ? La référence d'origine sera conservée et propagée."
                              if (!confirm(msg)) return
                              apply(f, 'resolve_receipt_collision', { ...f.params, decision: 'renumber_later', confirmPrinted: true }, 'Reçu renuméroté, référence d\'origine préservée.')
                            }}
                            className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            <ArrowUpToLine className="w-3.5 h-3.5 mr-1" /> Renuméroter le plus récent
                          </Button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Journal orphelin (classe D) : archiver avec motif ou consulter */}
                  {f.action === 'resolve_orphan_journal' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Input
                        placeholder="Motif d'archivage (audit)..."
                        value={archiveReason[f.id] || ''}
                        onChange={(e) => setArchiveReason((p) => ({ ...p, [f.id]: e.target.value }))}
                        className="text-xs h-7 bg-white flex-1 min-w-[180px]"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!(archiveReason[f.id] || '').trim() || processingId === f.id}
                        onClick={() => {
                          if (!confirm('Archiver cette écriture de caisse orpheline ? Soft-delete tracé et propagé.')) return
                          apply(f, 'resolve_orphan_journal', { ...f.params, decision: 'archive', reason: (archiveReason[f.id] || '').trim() }, 'Écriture archivée.')
                        }}
                        className="text-xs h-7 text-rose-600 border-rose-300 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Archiver
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={processingId === f.id}
                        onClick={() => apply(f, 'resolve_orphan_journal', { ...f.params, decision: 'review' }, 'Constat marqué consulté.')}
                        className="text-xs h-7 text-gray-600"
                      >
                        Marquer consulté
                      </Button>
                    </div>
                  )}

                  {/* Fiches de frais dupliquées (classe G) : garder l'ancienne ou les deux */}
                  {f.action === 'resolve_duplicate_fee' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={processingId === f.id}
                        onClick={() => {
                          if (!confirm('Archiver les fiches dupliquées et conserver la plus ancienne ?')) return
                          apply(f, 'resolve_duplicate_fee', { ...f.params, decision: 'keep_old' }, 'Fiche(s) dupliquée(s) archivée(s).')
                        }}
                        className="text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Garder l'ancienne
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processingId === f.id}
                        onClick={() => apply(f, 'resolve_duplicate_fee', { ...f.params, decision: 'keep_both' }, 'Fiches conservées.')}
                        className="text-xs h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Garder les deux
                      </Button>
                    </div>
                  )}
                </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}

      {/* --- File de synchronisation bloquée (écritures orphelines / quarantaine) --- */}
      <div className="mt-6 pt-5 border-t border-gray-200">
        <SyncQueuePanel />
      </div>
    </div>
  )
}