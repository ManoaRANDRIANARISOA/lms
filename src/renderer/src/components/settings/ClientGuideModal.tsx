import React, { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import guideHtml from '../../../../../docs/guide-client.html?raw'

interface ClientGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ClientGuideModal: React.FC<ClientGuideModalProps> = ({ isOpen, onClose }) => {
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  const handleCheckUpdate = async () => {
    if (!window.api?.updater?.check) return
    setCheckingUpdate(true)
    const toastId = toast.loading('Recherche de mise à jour...')
    try {
      const res = await window.api.updater.check()
      if (res.isDev) {
        toast.info('Mode développement (pas de mise à jour distante).', { id: toastId })
      } else if (!res.success) {
        toast.error(`Vérification impossible : ${res.error || 'Connexion réseau requise'}`, { id: toastId })
      } else {
        setTimeout(() => {
          toast.dismiss(toastId)
        }, 1500)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`, { id: toastId })
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Guide client — LMS École (lecture seule)"
      maxWidth="max-w-5xl"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-gray-500">
          Consultez ce guide à tout moment. Les mises à jour de l'application se vérifient ici.
        </p>
        <button
          onClick={handleCheckUpdate}
          disabled={checkingUpdate}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-full transition-all active:scale-95 disabled:opacity-50"
          title="Rechercher et installer les nouvelles mises à jour"
        >
          <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${checkingUpdate ? 'animate-spin' : ''}`} />
          <span>{checkingUpdate ? 'Vérification...' : 'Mettre à jour'}</span>
        </button>
      </div>
      <iframe
        title="Guide client LMS École"
        srcDoc={guideHtml}
        sandbox=""
        className="w-full h-[72vh] border-0 rounded-lg bg-white"
      />
    </Dialog>
  )
}