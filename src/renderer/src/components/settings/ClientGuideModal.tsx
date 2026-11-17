import React from 'react'
import { Dialog } from '@/components/ui/dialog'
import guideHtml from '../../../../../docs/guide-client.html?raw'

interface ClientGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ClientGuideModal: React.FC<ClientGuideModalProps> = ({ isOpen, onClose }) => (
  <Dialog
    isOpen={isOpen}
    onClose={onClose}
    title="Guide client — LMS École (lecture seule)"
    maxWidth="max-w-5xl"
  >
    <iframe
      title="Guide client LMS École"
      srcDoc={guideHtml}
      sandbox=""
      className="w-full h-[72vh] border-0 rounded-lg bg-white"
    />
  </Dialog>
)