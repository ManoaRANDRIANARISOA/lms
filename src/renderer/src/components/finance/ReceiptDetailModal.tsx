import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Payment } from '@shared/types'
import {
  Printer,
  FileText,
  CheckCircle2,
  AlertCircle,
  Copy,
  Clock,
  User,
  ShieldCheck,
  X
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'

interface ReceiptDetailModalProps {
  isOpen: boolean
  onClose: () => void
  payment: Payment | null
  studentName?: string
  studentNumber?: string
  className?: string
  onPrintSuccess?: () => void
}

export default function ReceiptDetailModal({
  isOpen,
  onClose,
  payment,
  studentName = '—',
  studentNumber = '',
  className = '',
  onPrintSuccess
}: ReceiptDetailModalProps) {
  const [printing, setPrinting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  if (!isOpen || !payment) return null

  const printCount = payment.print_count || 0
  const isDuplicate = printCount >= 1
  const receiptNum = payment.receipt_number || `REC-${(payment.id || '').slice(-6).toUpperCase()}`

  const copyReceiptNumber = () => {
    navigator.clipboard.writeText(receiptNum)
    toast.success('Numéro de reçu copié !')
  }

  const handlePrintThermal = async () => {
    if (!window.api?.printer?.printReceipt) {
      toast.error('Service impression non disponible')
      return
    }

    setPrinting(true)
    const toastId = toast.loading(
      isDuplicate ? 'Impression du duplicata de reçu...' : 'Impression du reçu original...'
    )

    try {
      const res = await window.api.printer.printReceipt(
        {
          payment_ids: [payment.id],
          student_name: studentName,
          student_number: studentNumber,
          class_name: className,
          amount: Number(payment.amount) || 0,
          payment_type: payment.payment_type,
          payment_date: payment.payment_date,
          month: payment.month || undefined,
          payment_method: payment.payment_method,
          description: payment.description || undefined,
          receipt_number: receiptNum,
          is_duplicate: isDuplicate,
          duplicate_count: isDuplicate ? printCount + 1 : 1
        },
        2
      )

      if (res.success) {
        toast.success(
          isDuplicate
            ? `Duplicata N°${printCount + 1} imprimé en 2 exemplaires (Parent + Caisse)`
            : 'Reçu original imprimé en 2 exemplaires (Parent + Caisse)',
          { id: toastId }
        )
        if (onPrintSuccess) onPrintSuccess()
      } else {
        toast.error(res.error || "Échec d'impression du reçu", { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setPrinting(false)
    }
  }

  const handleGeneratePdf = async () => {
    if (!window.api?.pdf?.generateReceipt) {
      toast.error('Génération PDF non disponible')
      return
    }

    setGeneratingPdf(true)
    const toastId = toast.loading('Génération du reçu PDF...')

    try {
      const res = await window.api.pdf.generateReceipt({
        student_name: studentName,
        class_name: className || '-',
        amount: payment.amount,
        payment_type: payment.payment_type,
        payment_date: payment.payment_date,
        month: payment.month,
        receipt_number: receiptNum,
        payment_method: payment.payment_method,
        is_duplicate: isDuplicate,
        duplicate_count: isDuplicate ? printCount + 1 : 1
      })

      if (res.success && res.filePath) {
        toast.success('Reçu PDF généré avec succès', { id: toastId })
        await window.api.pdf.openFile(res.filePath)
      } else {
        toast.error(res.error || 'Erreur génération PDF', { id: toastId })
      }
    } catch (e: unknown) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : String(e)), { id: toastId })
    } finally {
      setGeneratingPdf(false)
    }
  }

  const formatPaymentTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      tuition: 'Écolage',
      enrollment: "Droit d'inscription",
      reenrollment: 'Droit de réinscription',
      bus: 'Transport scolaire (Bus)',
      canteen: 'Cantine scolaire',
      uniform: 'Uniforme & Fournitures',
      fram: 'Cotisation FRAM',
      event: 'Événement / Sortie',
      other: 'Autre versement'
    }
    return map[type] || type
  }

  const formatMethodLabel = (method?: string) => {
    const map: Record<string, string> = {
      cash: 'Espèces',
      check: 'Chèque',
      transfer: 'Virement bancaire',
      mobile_money: 'Mobile Money',
      discount: 'Remise gracieuse'
    }
    return (method && map[method]) || 'Espèces'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto flex flex-col max-h-[90vh] overflow-hidden border border-border/80">
        {/* Header */}
        <div className="bg-primary/10 border-b border-border/60 p-5 flex items-start justify-between">
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Traçabilité & Détails Comptables
              </span>
              {/* Print Status Badge */}
              {printCount === 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-300 px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  Non imprimé
                </span>
              ) : printCount === 1 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Original délivré
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Duplicata ({printCount} tirages)
                </span>
              )}
            </div>

            <div className="text-xl font-bold text-foreground flex items-center gap-2 pt-1">
              <span className="font-mono text-primary bg-white px-2.5 py-0.5 rounded border border-primary/20 shadow-sm">
                {receiptNum}
              </span>
              <button
                type="button"
                onClick={copyReceiptNumber}
                className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                title="Copier le numéro"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-black/5 p-1.5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Main Transaction Card */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-border/60 space-y-3">
            <div className="flex justify-between items-start border-b border-border/40 pb-3">
              <div>
                <p className="text-xs text-muted-foreground">Élève bénéficiaire</p>
                <p className="font-bold text-base text-foreground">{studentName}</p>
                {(studentNumber || className) && (
                  <p className="text-xs text-muted-foreground">
                    {studentNumber ? `Matricule: ${studentNumber}` : ''}
                    {studentNumber && className ? ' • ' : ''}
                    {className ? `Classe: ${className}` : ''}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Montant Encaissé</p>
                <p className="text-xl font-extrabold text-primary">
                  {(Number(payment.amount) || 0).toLocaleString()} Ar
                </p>
              </div>
            </div>

            {/* Breakdown details */}
            <div className="grid grid-cols-2 gap-3 text-sm pt-1">
              <div>
                <span className="text-xs text-muted-foreground block">Motif de versement</span>
                <span className="font-semibold text-foreground">
                  {formatPaymentTypeLabel(payment.payment_type)}
                </span>
                {payment.month && (
                  <span className="text-xs text-muted-foreground block">Mois : {payment.month}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Mode de paiement</span>
                <span className="font-medium text-foreground capitalize">
                  {formatMethodLabel(payment.payment_method)}
                </span>
              </div>

              <div>
                <span className="text-xs text-muted-foreground block">Date d'encaissement</span>
                <span className="text-foreground">
                  {payment.payment_date
                    ? format(new Date(payment.payment_date), 'dd MMMM yyyy', { locale: fr })
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Année scolaire</span>
                <span className="text-foreground">{payment.school_year || '2026-2027'}</span>
              </div>
            </div>

            {payment.description && (
              <div className="border-t border-border/40 pt-2 text-xs">
                <span className="text-muted-foreground">Observation / Détail : </span>
                <span className="text-foreground font-medium">{payment.description}</span>
              </div>
            )}
          </div>

          {/* Audit & Duplicate Traceability Info */}
          <div className="bg-white rounded-xl p-4 border border-border/60 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/40 pb-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Contrôle & Historique des Tirages</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encaissé par (Compte Caisse) :</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-primary" />
                  {(payment as any).created_by || 'Administrateur'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre total d'impressions :</span>
                <span className="font-semibold text-foreground">
                  {printCount} tirage{printCount > 1 ? 's' : ''}
                </span>
              </div>

              {payment.last_printed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dernière impression papier :</span>
                  <span className="font-medium text-foreground">
                    {format(new Date(payment.last_printed_at), "dd/MM/yyyy 'à' HH:mm", {
                      locale: fr
                    })}
                  </span>
                </div>
              )}

              {payment.last_printed_by && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dernier tirage imprimé par :</span>
                  <span className="font-medium text-foreground flex items-center gap-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    {payment.last_printed_by}
                  </span>
                </div>
              )}

              {isDuplicate && (
                <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-amber-900 text-[11px] leading-relaxed">
                  <strong>Notice Légale :</strong> Ce reçu a déjà été émis. Toute nouvelle impression portera la mention officielle <strong>*** DUPLICATA N° {printCount + 1} ***</strong> avec cartouche d'audit certifié pour empêcher toute falsification.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-border/60 p-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            Fermer
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              className="text-xs flex items-center gap-1.5 border-border hover:bg-accent/20"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>{generatingPdf ? 'Génération...' : 'Reçu PDF (A5)'}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handlePrintThermal}
              disabled={printing}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {printing
                  ? 'Impression...'
                  : isDuplicate
                    ? `Imprimer Duplicata N°${printCount + 1}`
                    : 'Imprimer Ticket Original'}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
