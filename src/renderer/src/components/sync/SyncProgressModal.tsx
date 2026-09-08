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
  Wrench,
  FileText,
  Archive
} from 'lucide-react'

export const SyncProgressModal: React.FC = () => {
  const {
    isModalOpen,
    closeModal,
    isSyncing,
    isOnline,
    latencyMs,
    pendingCount,
    errorCount,
    quarantinedCount,
    lastSyncTime,
    healthError,
    progress,
    errors,
    startSync,
    retryErrors,
    quarantineAndUnblock
  } = useSyncStore()

  const [isUnblocking, setIsUnblocking] = React.useState(false)

  const handleQuarantineAndUnblock = async () => {
    setIsUnblocking(true)
    try {
      await quarantineAndUnblock()
    } finally {
      setIsUnblocking(false)
    }
  }

  const handleExportErrors = () => {
    const lines = [
      `============================================================`,
      `          RAPPORT DE DIAGNOSTIC DE SYNCHRONISATION          `,
      `============================================================`,
      `Date & Heure : ${new Date().toLocaleString('fr-FR')}`,
      `État Réseau  : ${isOnline ? 'En ligne' : 'Hors ligne'} (Latence: ${latencyMs ?? 'N/A'} ms)`,
      `File Locale  : ${pendingCount} modification(s) en attente`,
      `Blocages     : ${errorCount} erreur(s)`,
      `Quarantaine  : ${quarantinedCount} enregistrement(s) isolé(s)`,
      `Dernière syn : ${lastSyncTime ? new Date(lastSyncTime).toLocaleString('fr-FR') : 'Jamais'}`,
      ``,
      `--- DÉTAIL DES ANOMALIES & ERREURS ---`,
      ``
    ]

    if (errors.length === 0) {
      lines.push('Aucune anomalie active enregistrée dans la file.')
    } else {
      errors.forEach((err, idx) => {
        lines.push(
          `#${idx + 1} [Table: ${err.table_name}] [Action: ${err.action}] [Statut: ${err.status}]`,
          `    ID Enregistrement : ${err.record_id}`,
          `    Date Mise à Jour  : ${new Date(err.updated_at).toLocaleString('fr-FR')}`,
          `    Message d'erreur  : ${err.error_message || 'Non spécifié'}`,
          ``
        )
      })
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapport_synchro_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const humanizeError = (msg?: string) => {
    if (!msg) return 'Erreur de contrainte cloud indéterminée'
    if (msg.includes('duplicate key value violates unique constraint')) {
      return 'Doublon sur le serveur : cet enregistrement existe déjà dans la base cloud.'
    }
    if (msg.includes('violates foreign key constraint')) {
      return 'Dépendance manquante : la fiche parente (ex: élève) doit d’abord être synchronisée.'
    }
    if (msg.includes('Failed to fetch') || msg.includes('timeout') || msg.includes('délai')) {
      return 'Rupture temporaire de connexion internet pendant l’envoi.'
    }
    return msg
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
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Contrôle Qualité & Intégrité de la File
            </h4>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-7 text-gray-700 hover:bg-gray-100"
                onClick={handleExportErrors}
                title="Télécharge le rapport technique complet au format texte"
              >
                <FileText className="w-3.5 h-3.5 mr-1 text-gray-500" />
                Exporter (.txt)
              </Button>
              {errors.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-7 text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={retryErrors}
                  disabled={isSyncing || isUnblocking}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Réessayer ({errors.length})
                </Button>
              )}
              {(errors.length > 0 || (pendingCount > 0 && errors.length > 0)) && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-[11px] h-7 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs"
                  onClick={handleQuarantineAndUnblock}
                  disabled={isSyncing || isUnblocking}
                  title="Isole les erreurs bloquantes en quarantaine et envoie le reste de la file immédiatement"
                >
                  <Wrench className={`w-3 h-3 mr-1 ${isUnblocking ? 'animate-spin' : ''}`} />
                  {isUnblocking ? 'Déblocage...' : 'Réparer & forcer le déblocage'}
                </Button>
              )}
            </div>
          </div>

          {/* Quarantined items notification */}
          {quarantinedCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <Archive className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>{quarantinedCount} élément(s) sécurisé(s) en quarantaine</span>
                  <button
                    onClick={retryErrors}
                    disabled={isSyncing}
                    className="text-[11px] text-amber-700 underline hover:text-amber-900 ml-2"
                  >
                    Tenter de réintégrer
                  </button>
                </div>
                <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                  Ces modifications ont été isolées pour ne plus bloquer l'envoi de vos autres écritures saines. Elles restent conservées sur votre poste et sont signalées dans la télémétrie cloud.
                </p>
              </div>
            </div>
          )}

          {errors.length === 0 ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Aucune anomalie bloquante. Vos données sont synchronisées ou en file d'attente saine.
              </span>
            </div>
          ) : (
            <div className="border border-red-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-red-100 bg-red-50/40">
              {errors.map((err) => (
                <div key={err.id} className="p-2.5 text-xs text-red-900 space-y-1">
                  <div className="flex justify-between items-center font-medium">
                    <span className="bg-red-200 text-red-800 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">
                      {err.table_name} • {err.action}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(err.updated_at).toLocaleTimeString('fr-FR')}
                    </span>
                  </div>
                  <div className="font-medium text-red-800 text-[11px]">
                    {humanizeError(err.error_message)}
                  </div>
                  {err.error_message && (
                    <div className="text-gray-500 text-[10px] font-mono truncate" title={err.error_message}>
                      Détail technique : {err.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Note Réconciliation & Doublons */}
        <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>Gestion des doublons (élèves & paiements multi-postes)</span>
          </span>
          <span className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
            Disponible dans Paramètres
          </span>
        </div>
      </div>
    </Dialog>
  )
}
