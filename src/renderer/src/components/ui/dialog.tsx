import React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-md'
}) => {
  if (!isOpen) return null

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} mx-auto flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 border border-gray-200 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0 bg-white">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-700"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 bg-white custom-scrollbar">{children}</div>

        {footer && (
          <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

