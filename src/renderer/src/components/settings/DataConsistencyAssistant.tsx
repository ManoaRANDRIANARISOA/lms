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

  const findings = result?.findings || []
  const autos = findings.filter((f) => f.classification === 'auto')
  const decisions = findings.filter((f) => f.classification === 'decision')

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

      {/* --- Cas à décider --- */}
      {decisions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-1.5 mb-2">
            <ShieldAlert className="w-4 h-4" /> Cas à décider — avis du logiciel
          </h3>
          <div className="space-y-2">
            {decisions.map((f) => {
              const candidates = (f.evidence?.candidates || []) as StudentOption[]
              const target = orphanTarget[f.id] || ''
              const results = orphanResults[f.id] || []
              const reason = archiveReason[f.id] || ''
              return (
                <div key={f.id} className="p-3 border border-rose-200 bg-rose-50/30 rounded-lg space-y-2">
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
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}