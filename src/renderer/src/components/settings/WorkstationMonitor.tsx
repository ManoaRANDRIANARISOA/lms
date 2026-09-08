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
  Database
} from 'lucide-react'
import { toast } from 'sonner'

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

export const WorkstationMonitor: React.FC = () => {
  const [reports, setReports] = useState<TelemetryReportItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedStation, setSelectedStation] = useState<string>('ALL')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [isSendingTest, setIsSendingTest] = useState(false)

  const fetchTelemetry = async () => {
    if (!window.api?.telemetry?.fetchStationErrors) return
    setLoading(true)
    try {
      const res = await window.api.telemetry.fetchStationErrors(100)
      if (res.success && res.reports) {
        setReports(res.reports)
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

  useEffect(() => {
    fetchTelemetry()
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
        `    Détails     : ${r.error_details ? r.error_details : 'Aucun détail technique'}`,
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
            onClick={fetchTelemetry}
            disabled={loading}
            className="text-xs bg-slate-900 hover:bg-slate-800 text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Chargement...' : 'Actualiser'}
          </Button>
        </div>
      </div>

      {/* Workstation Filters / Pills */}
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
