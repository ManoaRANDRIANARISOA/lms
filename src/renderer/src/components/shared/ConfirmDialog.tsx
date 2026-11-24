import React, { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export interface ConfirmDialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
}

interface PendingConfirm {
  options: ConfirmDialogOptions
  resolve: (value: boolean) => void
}

type Listener = (pending: PendingConfirm | null) => void

let currentPending: PendingConfirm | null = null
const queue: PendingConfirm[] = []
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of listeners) {
    listener(currentPending)
  }
}

function flushNext(): void {
  if (!currentPending && queue.length > 0) {
    currentPending = queue.shift() || null
    notify()
  }
}

/**
 * Ouvre une boîte de dialogue de confirmation non-bloquante (remplace window.confirm).
 * Évite le gel du focus clavier Chromium sous Electron Windows.
 */
export function confirmDialog(options: ConfirmDialogOptions | string): Promise<boolean> {
  const normalized: ConfirmDialogOptions =
    typeof options === 'string' ? { message: options } : options

  return new Promise<boolean>((resolve) => {
    queue.push({ options: normalized, resolve })
    flushNext()
  })
}

export const GlobalConfirmDialog: React.FC = () => {
  const [pending, setPending] = useState<PendingConfirm | null>(currentPending)

  useEffect(() => {
    const handler: Listener = (next) => setPending(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  const handleClose = (result: boolean): void => {
    if (!pending) return
    const resolver = pending.resolve
    currentPending = null
    setPending(null)
    resolver(result)
    setTimeout(flushNext, 0)
  }

  if (!pending) return null

  const {
    title = 'Confirmation',
    message,
    confirmText = 'Confirmer',
    cancelText = 'Annuler',
    variant = 'default'
  } = pending.options

  return (
    <Dialog
      isOpen={true}
      onClose={() => handleClose(false)}
      title={title}
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={() => handleClose(false)}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            className={
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
            onClick={() => handleClose(true)}
            autoFocus
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3 py-2">
        {variant === 'danger' && (
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        )}
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{message}</p>
      </div>
    </Dialog>
  )
}
