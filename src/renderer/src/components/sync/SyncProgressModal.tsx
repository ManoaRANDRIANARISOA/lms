import React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSyncStore } from '@/store/useSyncStore'
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RotateCcw,
  Wifi,
  WifiOff,
  DownloadCloud,
  Users,
  Check
} from 'lucide-react'

export const SyncProgressModal: React.FC = () => {
  const {
    isModalOpen,
    closeModal,
    isSyncing,
    isOnline,
    latencyMs,
    pendingCount,
    lastSyncTime,
    healthError,
    progress,
    errors,
    startSync,
    retryErrors
  } = useSyncStore()

  const [duplicateGroups, setDuplicateGroups] = React.useState<any[]>([])
  const [scanningDuplicates, setScanningDuplicates] = React.useState(false)
  const [duplicateMessage, setDuplicateMessage] = React.useState<string | null>(null)

  const handleScanDuplicates = async () => {
    setScanningDuplicates(true)
    setDuplicateMessage(null)
    try {
      if (window.api.duplicates?.scan) {
        const res = await window.api.duplicates.scan()
        if (res.success) {
          setDuplicateGroups(res.groups || [])
          if (res.groups?.length === 0) {
            setDuplicateMessage('Aucun doublon détecté. Vos données élèves sont saines.')
          }
        }
      }
    } catch (e: any) {
      setDuplicateMessage('Erreur: ' + (e?.message || ''))
    } finally {
      setScanningDuplicates(false)
    }
  }

  const handleMerge = async (keepId: string, removeId: string) => {
    try {
      if (window.api.duplicates?.merge) {
        const res = await window.api.duplicates.merge(keepId, removeId)
        if (res.success) {
          await handleScanDuplicates()
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  const formattedLastSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : 'Jamais'

  return (
    <Dialog
      isOpen={isModalOpen}
      onClose={closeModal}
      title="Centre de Contrôle de Synchronisation Cloud"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
          <div className="text-xs text-gray-500">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                <Wifi className="w-3.5 h-3.5" /> Connecté au Cloud {latencyMs ? `(${latencyMs} ms)` : ''}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                <WifiOff className="w-3.5 h-3.5" /> Hors ligne (Mode local sécurisé)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!isOnline || isSyncing}
              onClick={() => startSync(true)}
              className="flex items-center gap-1.5 text-xs text-blue-800 border-blue-200 bg-blue-50/70 hover:bg-blue-100 hover:text-blue-900"
              title="Télécharge l'intégralité des données Supabase depuis le début sans filtre de date"
            >
              <DownloadCloud className={`w-3.5 h-3.5 text-blue-600 ${isSyncing ? 'animate-bounce' : ''}`} />
              Forcer la récupération complète
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!isOnline || isSyncing}
              onClick={() => startSync(false)}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              title="Envoie les modifications locales ET récupère les nouveautés du Cloud"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Synchronisation...' : 'Tout synchroniser'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-gray-700">
        {/* Connection Status Card */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 bg-gray-50 border rounded-lg">
            <span className="text-[11px] font-medium text-gray-500 block">État Réseau</span>
            <div className="mt-1 flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-xs text-emerald-700">Connecté</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold text-xs text-amber-700">Hors ligne</span>
                </>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 border rounded-lg">
            <span className="text-[11px] font-medium text-gray-500 block">En attente d'envoi</span>
            <div className="mt-1 flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold text-xs text-gray-900">
                {pendingCount} modification{pendingCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="p-3 bg-gray-50 border rounded-lg">
            <span className="text-[11px] font-medium text-gray-500 block">Dernière synchro</span>
            <div className="mt-1 flex items-center gap-1.5" title={formattedLastSync}>
              <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="font-medium text-[11px] text-gray-700 truncate">
                {formattedLastSync}
              </span>
            </div>
          </div>
        </div>

        {/* Explication Synchro Bidirectionnelle & Récupération */}
        <div className="p-3 bg-blue-50/50 border border-blue-200/80 rounded-lg text-xs text-slate-700 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-blue-900">
              Comment s'assurer d'être à 100% à jour ?
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              • <strong>« Tout synchroniser »</strong> envoie vos écritures locales et télécharge automatiquement les nouveaux paiements, élèves et notes saisis par vos collègues.<br />
              • <strong>« Forcer la récupération complète »</strong> télécharge l'intégralité de la base Supabase depuis l'origine, garantissant que 100% des données sont présentes sur votre poste.
            </p>
          </div>
        </div>

        {healthError && !isOnline && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Mode Hors-ligne Actif :</strong> {healthError}. Toutes les données (inscriptions,
              notes, paiements) sont enregistrées localement sur votre ordinateur sans aucun risque de
              perte.
            </div>
          </div>
        )}

        {/* Live Progress Bar Section */}
        <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-blue-900 flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncing ? 'animate-spin' : ''}`} />
              {progress.message || (isSyncing ? 'Synchronisation en cours...' : 'Prêt')}
            </span>
            <span className="font-mono font-bold text-blue-700">{progress.percent}%</span>
          </div>

          <div className="w-full bg-blue-200/80 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-300 ${
                isSyncing ? 'bg-blue-600' : progress.phase === 'error' ? 'bg-red-500' : 'bg-emerald-600'
              }`}
              style={{ width: `${Math.max(5, progress.percent)}%` }}
            />
          </div>

          {progress.tableName && (
            <div className="text-[11px] text-blue-700 flex justify-between">
              <span>Table en cours : <strong>{progress.tableName}</strong></span>
              {progress.total > 0 && (
                <span>
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Errors & Quality Assurance Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Contrôle Qualité & Intégrité des Données
            </h4>
            {errors.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 text-blue-700 border-blue-300 hover:bg-blue-50"
                onClick={retryErrors}
                disabled={isSyncing}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Réessayer tous les blocages ({errors.length})
              </Button>
            )}
          </div>

          {errors.length === 0 ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Aucune anomalie détectée. Vos données sont synchronisées ou en file d'attente saine.
              </span>
            </div>
          ) : (
            <div className="border border-red-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-red-100 bg-red-50/40">
              {errors.map((err) => (
                <div key={err.id} className="p-2.5 text-xs text-red-900 space-y-0.5">
                  <div className="flex justify-between items-center font-medium">
                    <span className="bg-red-200 text-red-800 px-1.5 py-0.2 rounded text-[10px]">
                      {err.table_name}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(err.updated_at).toLocaleTimeString('fr-FR')}
                    </span>
                  </div>
                  <div className="text-red-700 break-words text-[11px]">
                    {err.error_message || 'Erreur inconnue de contrainte cloud'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Duplicate Students Health Check */}
        <div className="space-y-2 pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              Nettoyage des Doublons Élèves
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
              onClick={handleScanDuplicates}
              disabled={scanningDuplicates}
            >
              {scanningDuplicates ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5 mr-1" />
              )}
              {scanningDuplicates ? 'Scan en cours...' : 'Scanner les doublons'}
            </Button>
          </div>

          {duplicateMessage && (
            <div className="p-2.5 text-xs rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800">
              {duplicateMessage}
            </div>
          )}

          {duplicateGroups.length > 0 && (
            <div className="space-y-2 border border-amber-200 rounded-lg p-2.5 bg-amber-50/50 max-h-48 overflow-y-auto">
              <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {duplicateGroups.length} groupe{duplicateGroups.length > 1 ? 's' : ''} de doublons détecté{duplicateGroups.length > 1 ? 's' : ''} :
              </div>
              {duplicateGroups.map((g, idx) => (
                <div key={idx} className="bg-white p-2 rounded border border-amber-200 text-xs space-y-1.5">
                  <div className="font-semibold text-gray-900">{g.name}</div>
                  <div className="space-y-1">
                    {g.records.map((r: any, rIdx: number) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 p-1.5 rounded bg-gray-50 text-[11px]">
                        <div>
                          <span className="font-medium text-gray-800">Matr: {r.registration_number || 'Sans matricule'}</span>
                          <span className="text-gray-500 ml-2">Classe: {r.class_name || '-'}</span>
                          <span className="text-gray-500 ml-2">({r.payments_count} paiement{r.payments_count > 1 ? 's' : ''})</span>
                        </div>
                        {rIdx > 0 && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleMerge(g.records[0].id, r.id)}
                          >
                            Fusionner vers le 1er
                          </Button>
                        )}
                        {rIdx === 0 && (
                          <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Principal
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
