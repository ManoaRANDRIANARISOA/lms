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
    ? 'Connexion Internet indisponible. Vos modifications sont enregistrées localement en toute sécurité et seront synchronisées au rétablissement du réseau.'
    : isSyncing
      ? progress.message || 'Synchronisation en cours...'
      : pendingCount > 0
        ? `${pendingCount} modification(s) prête(s) à être envoyée(s) sur le Cloud.`
        : 'Toutes les données sont synchronisées avec le Cloud.'

  const initial = (user?.full_name || user?.username || 'U').charAt(0).toUpperCase()

  return (
    <div
      className="mx-2 mb-1.5 p-2 rounded-lg bg-primary-foreground/10 border border-primary-foreground/15 text-primary-foreground select-none transition-all duration-200"
      title={tooltipText}
    >
      {/* 2 Colonnes Équilibrées : Gauche (Utilisateur & Déconnexion) | Droite (Cloud & Synchroniser) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Colonne Gauche : Utilisateur sur Déconnexion */}
        <div className="flex flex-col justify-between space-y-1.5 min-w-0 pr-1.5 border-r border-primary-foreground/15">
          {/* Haut : Profil */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded-full bg-primary-foreground/20 flex items-center justify-center font-bold text-[11px] shrink-0 text-primary-foreground">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate leading-tight">
                {user?.full_name || user?.username || 'Utilisateur'}
              </div>
              <div className="text-[10px] text-primary-foreground/60 leading-tight truncate">
                {user ? roleLabels[user.role] || user.role : ''}
              </div>
            </div>
          </div>

          {/* Bas : Bouton Déconnexion Explicite avec Texte */}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded bg-primary-foreground/10 hover:bg-red-500/20 hover:text-red-200 text-primary-foreground/80 active:scale-95 transition-all text-[11px] font-medium"
            title="Fermer la session actuelle"
          >
            <LogOut className="w-3 h-3 shrink-0" />
            <span className="truncate">Déconnexion</span>
          </button>
        </div>

        {/* Colonne Droite : Statut Cloud sur Synchroniser */}
        <div className="flex flex-col justify-between space-y-1.5 min-w-0 pl-0.5">
          {/* Haut : Badge Cloud cliquable */}
          <button
            onClick={openModal}
            className="w-full flex items-center justify-center gap-1 py-0.5 px-1.5 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 active:scale-95 transition-all text-[10px] font-medium"
            title="Cliquer pour ouvrir le Centre de Contrôle de Synchronisation"
          >
            {isSyncing ? (
              <RefreshCw className="w-3 h-3 text-blue-300 animate-spin shrink-0" />
            ) : isOnline ? (
              pendingCount > 0 ? (
                <UploadCloud className="w-3 h-3 text-amber-300 shrink-0" />
              ) : (
                <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
              )
            ) : (
              <CloudOff className="w-3 h-3 text-gray-400 shrink-0" />
            )}
            <span className="truncate">
              {isSyncing
                ? `${progress.percent}%`
                : !isOnline
                  ? 'Hors-ligne'
                  : pendingCount > 0
                    ? `${pendingCount} att.`
                    : 'À jour'}
            </span>
            {errorCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            )}
          </button>

          {/* Bas : Bouton Synchroniser Explicite avec Texte */}
          <button
            onClick={() => startSync(false)}
            disabled={!isOnline || isSyncing}
            className={`w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-medium transition-all ${
              !isOnline
                ? 'bg-white/5 text-primary-foreground/40 cursor-not-allowed'
                : isSyncing
                  ? 'bg-blue-500/30 text-blue-200 cursor-wait'
                  : 'bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground active:scale-95'
            }`}
            title={!isOnline ? 'Internet requis pour synchroniser' : 'Synchroniser maintenant (Envoi & Récupération)'}
          >
            <RefreshCw className={`w-3 h-3 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="truncate">{isSyncing ? 'En cours' : 'Synchroniser'}</span>
          </button>
        </div>
      </div>

      {/* Mini barre de progression si synchronisation en cours */}
      {isSyncing && (
        <div className="mt-2 space-y-0.5 pt-1.5 border-t border-primary-foreground/10">
          <div className="w-full bg-black/30 rounded-full h-1 overflow-hidden">
            <div
              className="bg-blue-400 h-1 rounded-full transition-all duration-200"
              style={{ width: `${Math.max(10, progress.percent)}%` }}
            />
          </div>
          <div className="text-[9px] text-primary-foreground/75 truncate font-mono text-center">
            {progress.message}
          </div>
        </div>
      )}
    </div>
  )
}
