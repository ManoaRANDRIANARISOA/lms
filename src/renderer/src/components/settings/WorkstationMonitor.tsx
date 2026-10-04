import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Server,
  RefreshCw,
  CheckCircle2,
  Laptop,
  Radio,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Trash2,
  Activity,
  Check,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { useSyncStore } from '@/store/useSyncStore'

export interface TelemetryReportItem {
  id: number
  station: string
  hostname: string
  context: string
  message: string
  table_name?: string
  record_id?: string
  pending_count?: number
  error_details?: string
  timestamp: string
}

export interface StationHeartbeat {
  station: string
  hostname: string
  platform: string
  app_version: string
  last_seen: string
  last_sync?: string
  counts: Record<string, number>
  queue_pending?: number
  queue_failed?: number
  queue_quarantined?: number
  queue?: { pending: number; errors: number; failed: number; quarantined: number }
  blocked_summary?: Array<{
    table_name: string
    record_id: string
    status: string
    error_message?: string
    created_at?: string
  }>
  station_error_count?: number
}

export const WorkstationMonitor: React.FC = () => {
  const { openReconciliation } = useSyncStore()
  const [reports, setReports] = useState<TelemetryReportItem[]>([])
  const [loading, setLoading] = useState(false)
  const [heartbeats, setHeartbeats] = useState<StationHeartbeat[]>([])
  const [cloudCounts, setCloudCounts] = useState<Record<string, number>>({})
  const [loadingHeartbeats, setLoadingHeartbeats] = useState(false)
  const [selectedStation, setSelectedStation] = useState<string>('ALL')
  const [limit, setLimit] = useState<number>(250)
  const [totalCloudCount, setTotalCloudCount] = useState<number>(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [isClearingCloud, setIsClearingCloud] = useState(false)
  const [quarantineCount, setQuarantineCount] = useState<number>(0)

  const fetchQuarantineCount = async () => {
    try {
      if (window.api?.sync?.getReconciliationItems) {
        const res = await window.api.sync.getReconciliationItems()
        if (res && res.items) {
          setQuarantineCount(res.items.length)
        }
      }
    } catch {
      // ignore
    }
  }

  const fetchHeartbeats = async () => {
    if (!window.api?.telemetry?.fetchWorkstationHeartbeats) return
    setLoadingHeartbeats(true)
    try {
      fetchQuarantineCount()
      const res = await window.api.telemetry.fetchWorkstationHeartbeats()
      if (res.success) {
        if (res.stations) setHeartbeats(res.stations)
        if (res.cloudCounts) setCloudCounts(res.cloudCounts)
      }
    } catch (err) {
      console.error('Failed to fetch heartbeats:', err)
    } finally {
      setLoadingHeartbeats(false)
    }
  }

  const fetchTelemetry = async (customLimit?: number) => {
    if (!window.api?.telemetry?.fetchStationErrors) return
    const fetchLimit = customLimit ?? limit
    setLoading(true)
    try {
      const res = await window.api.telemetry.fetchStationErrors(fetchLimit)
      if (res.success && res.reports) {
        setReports(res.reports)
        setTotalCloudCount((res as any).totalCount ?? res.reports.length)
      } else if (res.error) {
        toast.error(`Erreur télémétrie : ${res.error}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to fetch telemetry:', err)
      toast.error(`Échec de récupération télémétrie : ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClearCloudTelemetry = async () => {
    if (
      !confirm(
        'Purger la télémétrie Cloud Supabase :\n\n' +
        'Cette action va effacer définitivement toutes les alertes et journaux d\'incidents synchronisés sur Supabase pour tous les postes.\n\n' +
        'Voulez-vous continuer ?'
      )
    ) {
      return
    }

    setIsClearingCloud(true)
    try {
      if (window.api?.telemetry?.clearStationErrors) {
        const res = await window.api.telemetry.clearStationErrors()
        if (res.success) {
          toast.success('Télémétrie Cloud purgée avec succès.')
          await fetchTelemetry()
        } else {
          toast.error(`Échec de purge cloud : ${res.error || 'Erreur inconnue'}`)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setIsClearingCloud(false)
    }
  }

  useEffect(() => {
    fetchTelemetry()
    fetchHeartbeats()
  }, [])

  const handleSendTestSignal = async () => {
    if (!window.api?.telemetry?.reportError) return
    setIsSendingTest(true)
    try {
      const success = await window.api.telemetry.reportError(
        'admin_probe',
        'Sonde de test télémétrique émise depuis la console Paramètres',
        { test: true, triggered_at: new Date().toISOString() }
      )
      if (success) {
        toast.success('Signal de télémétrie transmis avec succès à Supabase !')
        await fetchTelemetry()
      } else {
        toast.error("Impossible d'expédier le signal de test (vérifiez la connexion)")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setIsSendingTest(false)
    }
  }

  const handleExportTelemetry = () => {
    const lines = [
      `======================================================================`,
      `       JOURNAL DE TÉLÉMÉTRIE MULTI-POSTES (INCIDENTS ET BLOCAGES)     `,
      `======================================================================`,
      `Exporté le : ${new Date().toLocaleString('fr-FR')}`,
      `Filtre     : ${selectedStation === 'ALL' ? 'Tous les postes' : `Poste ${selectedStation}`}`,
      `Total logs : ${filteredReports.length}`,
      ``
    ]

    filteredReports.forEach((r, idx) => {
      lines.push(
        `#${idx + 1} [POSTE: ${r.station}] [HÔTE: ${r.hostname || 'N/A'}] [TYPE: ${r.context}]`,
        `    Date        : ${new Date(r.timestamp).toLocaleString('fr-FR')}`,
        `    Table       : ${r.table_name || 'N/A'} (ID: ${r.record_id || 'N/A'})`,
        `    En attente  : ${r.pending_count ?? 'N/A'}`,
        `    Message     : ${r.message}`,
        `    Détails     : ${
          r.error_details
            ? typeof r.error_details === 'string'
              ? r.error_details
              : JSON.stringify(r.error_details, null, 2)
            : 'Aucun détail technique'
        }`,
        `----------------------------------------------------------------------`
      )
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `telemetrie_postes_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Group stations
  const stationsList = Array.from(new Set(reports.map((r) => r.station))).filter(Boolean)

  const filteredReports =
    selectedStation === 'ALL'
      ? reports
      : reports.filter((r) => r.station === selectedStation)

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm w-full border border-slate-200 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Moniteur des Postes & Télémétrie Cloud
                <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                  Mouchard Supabase
                </span>
              </h2>
              <p className="text-xs text-gray-500">
                Surveillance centralisée des blocages de synchronisation et anomalies rencontrées sur chaque machine (PC1, PC2...)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!confirm('Voulez-vous vider le journal des erreurs locales sur cette machine ?')) return
              if (window.api?.logs?.clear) {
                await window.api.logs.clear()
                toast.success('Journal local vidé avec succès.')
              }
            }}
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            title="Vider l'historique d'erreurs stocké localement sur ce PC"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
            Vider logs locaux
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearCloudTelemetry}
            disabled={isClearingCloud || reports.length === 0}
            className="text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200"
            title="Purger définitivement toutes les alertes d'erreurs stockées sur Supabase"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />
            {isClearingCloud ? 'Purge...' : 'Purger alertes cloud'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTelemetry}
            disabled={filteredReports.length === 0}
            className="text-xs text-slate-700"
          >
            <FileText className="w-3.5 h-3.5 mr-1 text-slate-500" />
            Exporter journal (.txt)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestSignal}
            disabled={isSendingTest}
            className="text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
          >
            <Radio className={`w-3.5 h-3.5 mr-1 ${isSendingTest ? 'animate-pulse text-indigo-500' : ''}`} />
            {isSendingTest ? 'Envoi...' : 'Tester alerte poste'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              fetchTelemetry()
              fetchHeartbeats()
            }}
            disabled={loading || loadingHeartbeats}
            className="text-xs bg-slate-900 hover:bg-slate-800 text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading || loadingHeartbeats ? 'animate-spin' : ''}`} />
            {loading || loadingHeartbeats ? 'Chargement...' : 'Actualiser'}
          </Button>
        </div>
      </div>

      {/* SECTION CONVERGENCE : MATRICE COMPARATIVE DES BASES DE DONNÉES (POSTES VS CLOUD) */}
      <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">
              Matrice de Convergence & État des Bases (C1, C2, C3 vs Cloud)
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Button
              size="sm"
              variant={quarantineCount > 0 ? 'destructive' : 'outline'}
              onClick={openReconciliation}
              className={`h-7 text-xs gap-1.5 font-medium ${
                quarantineCount > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                  : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900'
              }`}
              title="Ouvrir le centre visuel de réconciliation des écritures orphelines et quarantaine"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Quarantaine & Incohérences</span>
              {quarantineCount > 0 && (
                <span className="bg-white text-rose-700 text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow-xs">
                  {quarantineCount}
                </span>
              )}
            </Button>
            {loadingHeartbeats ? (
              <span className="flex items-center gap-1.5 text-indigo-600">
                <RefreshCw className="w-3 h-3 animate-spin" /> Bilan des postes...
              </span>
            ) : (
              <span>Dernier contrôle : {new Date().toLocaleTimeString('fr-FR')}</span>
            )}
          </div>
        </div>

        {/* Cloud Reference Banner */}
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-indigo-950 text-white rounded-lg text-xs shadow-xs">
          <div className="flex items-center gap-1.5 font-bold mr-2 text-indigo-200">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Référence Supabase Cloud :</span>
          </div>
          <span className="bg-indigo-900/80 px-2 py-0.5 rounded text-[11px] border border-indigo-700/50">
            Élèves : <strong className="text-white">{cloudCounts.students ?? '-'}</strong>
          </span>
          <span className="bg-indigo-900/80 px-2 py-0.5 rounded text-[11px] border border-indigo-700/50">
            Paiements : <strong className="text-white">{cloudCounts.student_payments ?? '-'}</strong>
          </span>
          <span className="bg-indigo-900/80 px-2 py-0.5 rounded text-[11px] border border-indigo-700/50">
            Caisse : <strong className="text-white">{cloudCounts.cash_journal ?? '-'}</strong>
          </span>
          <span className="bg-indigo-900/80 px-2 py-0.5 rounded text-[11px] border border-indigo-700/50">
            Comptes : <strong className="text-white">{cloudCounts.users ?? '-'}</strong>
          </span>
        </div>

        {/* Stations Comparative Table */}
        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100/90 border-b border-gray-200 text-gray-700 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Poste</th>
                <th className="py-2.5 px-3">Hôte / Version</th>
                <th className="py-2.5 px-3">État Connexion</th>
                <th className="py-2.5 px-3 text-center">Élèves</th>
                <th className="py-2.5 px-3 text-center">Paiements</th>
                <th className="py-2.5 px-3 text-center">Caisse</th>
                <th className="py-2.5 px-3 text-center">File Locale</th>
                <th className="py-2.5 px-3 text-center">Statut Convergence</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {heartbeats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-gray-400">
                    Aucun bilan reçu. Lancez une synchronisation sur chaque poste pour faire remonter leur état.
                  </td>
                </tr>
              ) : (
                heartbeats.map((hb) => {
                  const sCount = hb.counts?.students ?? 0
                  const pCount = hb.counts?.student_payments ?? 0
                  const cCount = hb.counts?.cash_journal ?? 0

                  const sMatch = !cloudCounts.students || sCount === cloudCounts.students
                  const pMatch = !cloudCounts.student_payments || pCount === cloudCounts.student_payments
                  const cMatch = !cloudCounts.cash_journal || cCount === cloudCounts.cash_journal

                  const pending = hb.queue?.pending ?? hb.queue_pending ?? 0
                  const failed = (hb.queue?.failed ?? 0) + (hb.queue?.errors ?? 0) + (hb.queue_failed ?? 0)
                  const quarantined = hb.queue?.quarantined ?? hb.queue_quarantined ?? 0

                  const isFullySynced = sMatch && pMatch && cMatch && pending === 0 && failed === 0 && quarantined === 0

                  // Calculate online state
                  const lastSeenTime = hb.last_seen || hb.last_sync
                  let isOnline = false
                  let statusLabel = 'Inconnu'
                  let statusSub = 'Aucun signal'
                  if (lastSeenTime) {
                    const diffMin = Math.round((Date.now() - new Date(lastSeenTime).getTime()) / (60 * 1000))
                    if (diffMin <= 10) {
                      isOnline = true
                      statusLabel = 'Connecté (En ligne)'
                      statusSub = 'Actif maintenant'
                    } else if (diffMin < 60) {
                      statusLabel = `Vu il y a ${diffMin} min`
                      statusSub = new Date(lastSeenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    } else if (diffMin < 24 * 60) {
                      const hours = Math.floor(diffMin / 60)
                      statusLabel = `Vu il y a ${hours}h`
                      statusSub = new Date(lastSeenTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    } else {
                      statusLabel = 'Hors-ligne'
                      statusSub = new Date(lastSeenTime).toLocaleDateString('fr-FR')
                    }
                  }

                  const errorCount = (hb as any).station_error_count || 0
                  const blockedItems = hb.blocked_summary || []

                  return (
                    <tr key={hb.station} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-gray-900 flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Poste {hb.station}</span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        <div className="font-medium text-gray-800">{hb.hostname || 'N/A'}</div>
                        <div className="text-[10px] text-gray-400">v{hb.app_version || '1.2.1'} ({hb.platform})</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isOnline ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                          )}
                          <span className={`font-semibold text-xs ${isOnline ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 pl-4">{statusSub}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                            sMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800 font-bold'
                          }`}
                        >
                          {sCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                            pMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800 font-bold'
                          }`}
                        >
                          {pCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                            cMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800 font-bold'
                          }`}
                        >
                          {cCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-col items-center justify-center gap-0.5 text-[11px]">
                          <div className="flex items-center justify-center gap-1">
                            {pending > 0 && (
                              <span className="text-amber-700 bg-amber-50 px-1 rounded font-medium" title="En attente">
                                {pending} attente
                              </span>
                            )}
                            {failed > 0 && (
                              <span className="text-rose-700 bg-rose-100 px-1 rounded font-bold animate-pulse" title="Bloqués">
                                {failed} bloqués
                              </span>
                            )}
                            {quarantined > 0 && (
                              <span className="text-purple-700 bg-purple-50 px-1 rounded font-medium" title="Quarantaine">
                                {quarantined} isolés
                              </span>
                            )}
                            {pending === 0 && failed === 0 && quarantined === 0 && (
                              <span className="text-emerald-600 font-medium">0</span>
                            )}
                          </div>
                          {blockedItems.length > 0 && (
                            <span
                              className="text-[9px] text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 cursor-help"
                              title={blockedItems
                                .map((b) => `• ${b.table_name} [${b.record_id}]: ${b.error_message || b.status}`)
                                .join('\n')}
                            >
                              ⚠️ {blockedItems.length} bloqué{blockedItems.length > 1 ? 's' : ''} ({blockedItems[0].table_name})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isFullySynced ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3 text-emerald-600" /> Aligné 100%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Écarts Détectés
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedStation(hb.station)
                            const el = document.getElementById('incidents-log-section')
                            if (el) el.scrollIntoView({ behavior: 'smooth' })
                            toast.info(`Filtre activé sur le Poste ${hb.station}`)
                          }}
                          className={`text-[11px] h-6 px-2 ${
                            errorCount > 0
                              ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>Incidents</span>
                          {errorCount > 0 ? (
                            <span className="ml-1 px-1 py-0.2 rounded-full bg-rose-600 text-white font-bold text-[9px]">
                              {errorCount}
                            </span>
                          ) : (
                            <span className="ml-1 text-[9px] text-gray-400">0</span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workstation Filters & Limit Controls */}
      <div id="incidents-log-section" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1 flex items-center gap-1">
            <Laptop className="w-3.5 h-3.5" /> Filtrer par poste :
          </span>
          <button
            onClick={() => setSelectedStation('ALL')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              selectedStation === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tous ({reports.length})
          </button>
          {stationsList.map((st) => {
            const count = reports.filter((r) => r.station === st).length
            const hb = heartbeats.find((h) => h.station === st)
            const lastTime = hb?.last_seen || hb?.last_sync
            const isStOnline = lastTime && (Date.now() - new Date(lastTime).getTime() <= 10 * 60 * 1000)

            return (
              <button
                key={st}
                onClick={() => setSelectedStation(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  selectedStation === st
                    ? 'bg-indigo-700 text-white'
                    : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-100'
                }`}
              >
                {isStOnline ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="En ligne actuellement" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" title="Hors-ligne" />
                )}
                <span>Poste {st}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedStation === st ? 'bg-indigo-900 text-indigo-100' : 'bg-indigo-200 text-indigo-900'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 font-medium">Limite :</span>
          <select
            value={limit}
            onChange={(e) => {
              const newLimit = Number(e.target.value)
              setLimit(newLimit)
              fetchTelemetry(newLimit)
            }}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value={50}>50 incidents</option>
            <option value={100}>100 incidents</option>
            <option value={250}>250 incidents</option>
            <option value={500}>500 incidents</option>
            <option value={1000}>1 000 incidents</option>
            <option value={5000}>Tout (jusqu'à 5000)</option>
          </select>

          {totalCloudCount > 0 && (
            <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredReports.length} affiché(s) sur {totalCloudCount} au total
            </span>
          )}
        </div>
      </div>

      {/* Reports Feed */}
      {loading && reports.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
          <span>Interrogation du journal de télémétrie Supabase...</span>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <div className="font-semibold text-emerald-900">Aucun blocage ou incident signalé</div>
            <p className="text-emerald-700 mt-0.5">
              Les postes connectés à Supabase n'ont transmis aucun blocage critique récemment.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredReports.map((item) => {
            const isBlockage =
              item.context === 'sync_blockage' ||
              item.message.toLowerCase().includes('blocage') ||
              item.message.toLowerCase().includes('erreur')
            const isExpanded = expandedId === item.id

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-lg border text-xs transition-all ${
                  isBlockage ? 'bg-red-50/40 border-red-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold px-2 py-0.5 rounded text-[11px] bg-slate-900 text-white">
                      {item.station}
                    </span>
                    {item.hostname && (
                      <span className="text-[11px] text-gray-500 font-mono">
                        ({item.hostname})
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        isBlockage ? 'bg-red-200 text-red-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {item.context}
                    </span>
                    {item.table_name && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px] flex items-center gap-1 font-mono">
                        <Database className="w-2.5 h-2.5" />
                        {item.table_name}
                      </span>
                    )}
                    {item.pending_count !== undefined && item.pending_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                        {item.pending_count} en attente
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-gray-500 text-[11px] shrink-0">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span>{new Date(item.timestamp).toLocaleString('fr-FR')}</span>
                  </div>
                </div>

                <div className="mt-2 text-gray-900 font-medium leading-relaxed">
                  {item.message}
                </div>

                {item.error_details && (
                  <div className="mt-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3 h-3" /> Masquer les détails techniques
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" /> Voir les détails techniques
                        </>
                      )}
                    </button>

                    {isExpanded && (
                      <pre className="mt-2 p-2.5 bg-gray-900 text-gray-100 text-[11px] font-mono rounded overflow-x-auto whitespace-pre-wrap max-h-48">
                        {typeof item.error_details === 'string'
                          ? item.error_details
                          : JSON.stringify(item.error_details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
