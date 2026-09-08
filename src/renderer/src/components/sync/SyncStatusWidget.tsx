import React, { useEffect } from 'react'
import { useSyncStore } from '@/store/useSyncStore'
import { useAuthStore } from '@/store/useAuthStore'
import {
  CloudOff,
  RefreshCw,
  CheckCircle,
  UploadCloud,
  LogOut
} from 'lucide-react'

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  direction: 'Direction',
  accounting: 'Comptabilité',
  secretariat: 'Secrétariat'
}

export const SyncStatusWidget: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const {
    isSyncing,
    isOnline,
    pendingCount,
    errorCount,
    progress,
    startSync,
    openModal,
    init
  } = useSyncStore()

  useEffect(() => {
    const cleanup = init()
    return cleanup
  }, [init])

  const tooltipText = !isOnline
    ? 'Connexion Internet indisponible. Vos modifications sont enregistrées localement en toute sécurité.'
    : isSyncing
      ? progress.message || 'Synchronisation en cours...'
      : pendingCount > 0
        ? `${pendingCount} modification(s) prête(s) à être envoyée(s) sur le Cloud.`
        : 'Toutes les données sont synchronisées avec le Cloud.'

  const initial = (user?.full_name || user?.username || 'U').charAt(0).toUpperCase()

  return (
    <div
      className="mx-2 mb-2 p-2 rounded-xl bg-primary-foreground/10 border border-primary-foreground/15 text-primary-foreground select-none space-y-2 transition-all duration-200 shadow-sm"
      title={tooltipText}
    >
      {/* Rangée Supérieure (Tier 1) : Bouton Unifié de Synchronisation & État (Pleine Largeur) */}
      <div className="flex items-center gap-1.5">
        {/* Bouton Principal : Ouvre le Centre de Contrôle / Modal */}
        <button
          onClick={openModal}
          className="flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-primary-foreground/15 hover:bg-primary-foreground/25 active:scale-[0.98] transition-all text-xs font-medium min-w-0"
          title="Cliquer pour afficher les détails et contrôler la synchronisation"
        >
          {isSyncing ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-300 animate-spin shrink-0" />
          ) : isOnline ? (
            pendingCount > 0 ? (
              <UploadCloud className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )
          ) : (
            <CloudOff className="w-3.5 h-3.5 text-rose-300 shrink-0" />
          )}

          <div className="flex-1 text-left min-w-0 truncate">
            <span className="truncate block font-semibold text-[11px] leading-tight">
              {isSyncing
                ? `Synchro en cours (${progress.percent}%)`
                : !isOnline
                  ? 'Mode Hors-ligne'
                  : pendingCount > 0
                    ? `${pendingCount} en attente`
                    : 'Cloud à jour'}
            </span>
          </div>

          {errorCount > 0 && (
            <span
              className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"
              title={`${errorCount} erreur(s) de synchronisation`}
            />
          )}
        </button>

        {/* Déclencheur direct de synchronisation instantanée */}
        <button
          onClick={() => startSync(false)}
          disabled={!isOnline || isSyncing}
          className={`p-1.5 rounded-lg transition-all shrink-0 ${
            !isOnline
              ? 'bg-white/5 text-primary-foreground/30 cursor-not-allowed'
              : isSyncing
                ? 'bg-blue-500/30 text-blue-200 cursor-wait'
                : 'bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground active:scale-95'
          }`}
          title={!isOnline ? 'Internet requis' : 'Lancer la synchronisation maintenant'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Mini barre de progression si synchronisation en cours */}
      {isSyncing && (
        <div className="space-y-0.5 px-0.5">
          <div className="w-full bg-black/30 rounded-full h-1 overflow-hidden">
            <div
              className="bg-blue-400 h-1 rounded-full transition-all duration-200"
              style={{ width: `${Math.max(10, progress.percent)}%` }}
            />
          </div>
          {progress.message && (
            <div className="text-[9px] text-primary-foreground/75 truncate font-mono text-center">
              {progress.message}
            </div>
          )}
        </div>
      )}

      {/* Rangée Inférieure (Tier 2) : Utilisateur Connecté & Déconnexion (Pleine Largeur) */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-primary-foreground/15">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center font-bold text-xs shrink-0 text-primary-foreground shadow-xs">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate leading-tight">
              {user?.full_name || user?.username || 'Utilisateur'}
            </div>
            <div className="text-[10px] text-primary-foreground/70 leading-tight truncate font-medium">
              {user ? roleLabels[user.role] || user.role : 'Connecté'}
            </div>
          </div>
        </div>

        {/* Bouton Déconnexion */}
        <button
          onClick={logout}
          className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-red-500/20 hover:text-red-200 text-primary-foreground/80 active:scale-95 transition-all shrink-0"
          title="Fermer la session (Déconnexion)"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
