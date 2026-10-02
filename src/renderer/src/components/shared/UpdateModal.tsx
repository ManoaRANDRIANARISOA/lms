/**
 * UpdateModal.tsx — Remote Auto-Updater Modal (Industry Standard)
 *
 * Displays download progress, release notes, and install prompt
 * when a new release is published to GitHub Releases.
 */

import React, { useState, useEffect } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Sparkles, Download, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string | Array<{ version: string; note: string }>
}

export interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export const UpdateModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!window.api?.updater) return

    // Check if an update was already downloaded before window load
    window.api.updater.getDownloadedInfo().then((info) => {
      if (info) {
        setUpdateInfo(info)
        setIsDownloaded(true)
        setIsOpen(true)
      }
    })

    const unsubAvailable = window.api.updater.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setErrorMsg(null)
      setIsOpen(true)
      toast.info(`Nouvelle mise à jour disponible : v${info.version}`)
    })

    const unsubProgress = window.api.updater.onDownloadProgress((prog) => {
      setProgress(prog)
    })

    const unsubDownloaded = window.api.updater.onUpdateDownloaded((info) => {
      setUpdateInfo(info)
      setIsDownloaded(true)
      setProgress(null)
      setIsOpen(true)
      toast.success(`Mise à jour v${info.version} prête à être installée !`)
    })

    const unsubNotAvailable = window.api.updater.onUpdateNotAvailable((info) => {
      toast.success(`Votre logiciel LMS est déjà à jour (v${info.version}).`)
    })

    const unsubError = window.api.updater.onError((err) => {
      // Only show error if modal is already open
      if (isOpen) {
        setErrorMsg(err.error)
      }
    })

    return () => {
      unsubAvailable()
      unsubNotAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [isOpen])

  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      await window.api.updater.install()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur d'installation : ${msg}`)
      setIsInstalling(false)
    }
  }

  if (!isOpen || !updateInfo) return null

  // Format bytes to MB
  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)
  const formatSpeed = (bytesPerSec: number) => {
    const kb = bytesPerSec / 1024
    if (kb > 1024) return `${(kb / 1024).toFixed(1)} Mo/s`
    return `${kb.toFixed(0)} Ko/s`
  }

  // Parse release notes
  const renderReleaseNotes = () => {
    if (!updateInfo.releaseNotes) {
      return (
        <p className="text-gray-500 italic text-xs">
          Améliorations de performance, convergence multi-postes et correctifs de sécurité.
        </p>
      )
    }

    if (Array.isArray(updateInfo.releaseNotes)) {
      return (
        <div className="space-y-2">
          {updateInfo.releaseNotes.map((item, idx) => (
            <div key={idx} className="text-xs">
              <span className="font-semibold text-gray-800">Version {item.version} :</span>
              <div
                className="text-gray-600 prose prose-xs mt-0.5"
                dangerouslySetInnerHTML={{ __html: item.note }}
              />
            </div>
          ))}
        </div>
      )
    }

    return (
      <div
        className="text-xs text-gray-700 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto bg-gray-50 p-3 rounded-lg border border-gray-100"
        dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }}
      />
    )
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Mise à Jour de l'Application Disponible"
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-xs text-gray-500">
            {isDownloaded ? 'Plus tard (à la fermeture)' : 'Ignorer'}
          </Button>
          {isDownloaded ? (
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={isInstalling}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isInstalling ? 'Redémarrage...' : 'Redémarrer & Installer'}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              Téléchargement en arrière-plan...
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header Hero */}
        <div className="flex items-start gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-gray-900">
                Version {updateInfo.version}
              </span>
              {updateInfo.releaseDate && (
                <span className="text-[11px] text-gray-500">
                  {new Date(updateInfo.releaseDate).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Une nouvelle version est disponible et apporte des améliorations importantes.
            </p>
          </div>
        </div>

        {/* Progress or Downloaded Banner */}
        {progress && (
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
            <div className="flex justify-between items-center text-xs font-medium text-blue-900">
              <span className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 animate-bounce text-blue-600" />
                Téléchargement du fichier exécutable...
              </span>
              <span className="font-mono font-bold text-blue-700">{progress.percent}%</span>
            </div>

            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-gray-500 font-mono">
              <span>{formatSpeed(progress.bytesPerSecond)}</span>
              <span>
                {formatMB(progress.transferred)} Mo / {formatMB(progress.total)} Mo
              </span>
            </div>
          </div>
        )}

        {isDownloaded && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-900">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-emerald-950">Téléchargement terminé !</div>
              <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                Le nouveau fichier d'installation est prêt. L'application redémarrera en quelques secondes pour appliquer la mise à jour sans perdre vos données.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>Erreur de téléchargement : {errorMsg}</span>
          </div>
        )}

        {/* Changelog / Notes */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Nouveautés & Changements (Notes de Version)
          </div>
          {renderReleaseNotes()}
        </div>
      </div>
    </Dialog>
  )
}
