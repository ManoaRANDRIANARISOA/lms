/**
 * CashClosureModal.tsx — Module de Rapprochement, Billetage & Ticket Z (Avenant N°3)
 *
 * Permet aux caissiers et à la Direction de réaliser le récolement physique du tiroir,
 * de calculer automatiquement les écarts (théorique vs réel constaté), d'enregistrer
 * la clôture comptable scellée et d'imprimer le Ticket Z officiel 80 mm ESC/POS.
 *
 * @module components/finance/CashClosureModal
 */

import { useState, useEffect, useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useCashJournalStore } from '@/store/useCashJournalStore'
import { useAuthStore } from '@/store/useAuthStore'
import type { CashBilletageBreakdown, CashierDailySummary, CashClosure, TicketZData } from '@shared/types'
import {
  Printer,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Receipt,
  Banknote,
  Coins,
  History,
  RotateCcw
} from 'lucide-react'

interface CashClosureModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: string
  selectedCashier?: string
  stationCode?: string
  onClosureSuccess?: () => void
}

function formatMGA(val: number): string {
  return `${Number(val || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} Ar`
}

export default function CashClosureModal({
  isOpen,
  onClose,
  selectedDate,
  selectedCashier,
  stationCode = 'C1',
  onClosureSuccess
}: CashClosureModalProps) {
  const { user } = useAuthStore()
  const {
    fetchCashierDailySummary,
    createClosure,
    fetchClosure,
    printTicketZ
  } = useCashJournalStore()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [summary, setSummary] = useState<CashierDailySummary | null>(null)
  const [existingClosure, setExistingClosure] = useState<CashClosure | null>(null)

  // Saisie du Billetage
  const [b20000, setB20000] = useState<number>(0)
  const [b10000, setB10000] = useState<number>(0)
  const [b5000, setB5000] = useState<number>(0)
  const [b2000, setB2000] = useState<number>(0)
  const [b1000, setB1000] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')

  const activeCashier = useMemo(() => {
    if (selectedCashier && selectedCashier !== 'all') return selectedCashier
    return user?.username || 'Administrateur'
  }, [selectedCashier, user])

  // Chargement des données à l'ouverture
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setLoading(true)

    Promise.all([
      fetchCashierDailySummary(selectedDate, activeCashier, stationCode),
      fetchClosure(selectedDate, activeCashier)
    ]).then(([sum, closure]) => {
      if (!isMounted) return
      setSummary(sum)
      setExistingClosure(closure)

      if (closure && closure.counted_breakdown) {
        try {
          const bd: CashBilletageBreakdown = JSON.parse(closure.counted_breakdown)
          setB20000(bd.b20000 || 0)
          setB10000(bd.b10000 || 0)
          setB5000(bd.b5000 || 0)
          setB2000(bd.b2000 || 0)
          setB1000(bd.b1000 || 0)
        } catch {}
        setNotes(closure.notes || '')
      } else {
        // Reset inputs
        setB20000(0)
        setB10000(0)
        setB5000(0)
        setB2000(0)
        setB1000(0)
        setNotes('')
      }
      setLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [isOpen, selectedDate, activeCashier, stationCode, fetchCashierDailySummary, fetchClosure])

  // Total physique espèces calculé
  const totalCountedCash = useMemo(() => {
    return (
      (Number(b20000) || 0) * 20000 +
      (Number(b10000) || 0) * 10000 +
      (Number(b5000) || 0) * 5000 +
      (Number(b2000) || 0) * 2000 +
      (Number(b1000) || 0) * 1000
    )
  }, [b20000, b10000, b5000, b2000, b1000])

  // Écart calculé (Constaté - Théorique)
  const cashDifference = useMemo(() => {
    const expected = summary?.expected_cash || 0
    return totalCountedCash - expected
  }, [totalCountedCash, summary])

  // Billetage breakdown object
  const breakdown: CashBilletageBreakdown = useMemo(
    () => ({
      b20000: Number(b20000) || 0,
      b10000: Number(b10000) || 0,
      b5000: Number(b5000) || 0,
      b2000: Number(b2000) || 0,
      b1000: Number(b1000) || 0
    }),
    [b20000, b10000, b5000, b2000, b1000]
  )

  const isLocked = Boolean(existingClosure?.is_locked)

  // Validation & Enregistrement
  const handleConfirmClosure = async () => {
    if (!summary) return
    setSubmitting(true)

    const input = {
      closure_date: selectedDate,
      cashier_username: activeCashier,
      station_code: stationCode,
      total_tickets: summary.total_tickets,
      expected_cash: summary.expected_cash,
      expected_check: summary.expected_check,
      expected_mobile: summary.expected_mobile,
      expected_transfer: summary.expected_transfer,
      expected_total: summary.expected_total,
      counted_cash: totalCountedCash,
      counted_breakdown: breakdown,
      cash_difference: cashDifference,
      notes: notes.trim() || undefined
    }

    const res = await createClosure(input)
    if (!res.success) {
      toast.error('Échec de la clôture', { description: res.error })
      setSubmitting(false)
      return
    }

    toast.success('Clôture enregistrée avec succès')

    // Impression automatique du Ticket Z
    await handlePrintTicketZ()

    setSubmitting(false)
    if (onClosureSuccess) onClosureSuccess()
  }

  // Impression Ticket Z
  const handlePrintTicketZ = async () => {
    if (!summary) return
    setPrinting(true)

    const zData: TicketZData = {
      closure_date: selectedDate,
      cashier: activeCashier,
      station_code: stationCode,
      total_tickets: summary.total_tickets,
      first_receipt: summary.first_receipt,
      last_receipt: summary.last_receipt,
      expected_cash: summary.expected_cash,
      expected_check: summary.expected_check,
      expected_mobile: summary.expected_mobile,
      expected_transfer: summary.expected_transfer,
      expected_total: summary.expected_total,
      counted_cash: existingClosure ? existingClosure.counted_cash : totalCountedCash,
      breakdown: breakdown,
      cash_difference: existingClosure ? existingClosure.cash_difference : cashDifference,
      notes: notes || existingClosure?.notes
    }

    const res = await printTicketZ(zData, 1)
    if (res.success) {
      toast.success('Ticket Z imprimé avec succès sur imprimante 80 mm')
    } else {
      toast.error("Erreur lors de l'impression du Ticket Z", { description: res.error })
    }
    setPrinting(false)
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Clôture de Caisse & Rapprochement (Ticket Z)"
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" onClick={onClose} disabled={submitting || printing}>
            Fermer
          </Button>

          <div className="flex items-center gap-2">
            {isLocked ? (
              <Button
                variant="default"
                onClick={handlePrintTicketZ}
                disabled={printing}
                className="bg-primary text-white hover:bg-primary/90 flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                {printing ? 'Impression en cours...' : 'Réimprimer Ticket Z (80 mm)'}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={handleConfirmClosure}
                disabled={submitting || printing || loading}
                className="bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2 font-semibold shadow-md"
              >
                <Lock className="w-4 h-4" />
                {submitting ? 'Validation...' : 'Valider Clôture & Imprimer Ticket Z'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6 text-sm">
        {/* En-tête / Badge Statut */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Paramètres de Clôture
            </div>
            <div className="text-base font-bold text-gray-900 mt-0.5">
              Journée du {selectedDate} — Opérateur :{' '}
              <span className="text-primary font-extrabold">{activeCashier}</span>
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              Station : <span className="font-semibold">{stationCode}</span>
              {summary?.first_receipt && summary?.last_receipt && (
                <span className="ml-2 text-gray-500">
                  (Reçus : {summary.first_receipt} à {summary.last_receipt})
                </span>
              )}
            </div>
          </div>

          {isLocked ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-xs border border-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              JOURNÉE CLÔTURÉE
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full font-bold text-xs border border-amber-300">
              <History className="w-4 h-4 text-amber-600" />
              EN COURS DE POINTAGE
            </div>
          )}
        </div>

        {/* SECTION 1: THÉORIQUE LOGICIEL */}
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-primary" />
            1. Données Comptables Théoriques (Logiciel)
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-xs text-gray-500 font-medium">Nombre de Tickets</div>
              <div className="text-xl font-bold text-gray-900 mt-1">
                {summary?.total_tickets || 0}
              </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-emerald-200 bg-emerald-50/30 shadow-sm">
              <div className="text-xs text-emerald-800 font-medium">Espèces Théoriques</div>
              <div className="text-base font-bold text-emerald-700 mt-1">
                {formatMGA(summary?.expected_cash || 0)}
              </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-blue-200 bg-blue-50/30 shadow-sm">
              <div className="text-xs text-blue-800 font-medium">Chèques Reçus</div>
              <div className="text-base font-bold text-blue-700 mt-1">
                {formatMGA(summary?.expected_check || 0)}
              </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-purple-200 bg-purple-50/30 shadow-sm">
              <div className="text-xs text-purple-800 font-medium">Mobile Money</div>
              <div className="text-base font-bold text-purple-700 mt-1">
                {formatMGA(summary?.expected_mobile || 0)}
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between px-3.5 py-2 bg-gray-100 rounded-lg border border-gray-200 text-xs">
            <span className="font-semibold text-gray-700">Total Général Théorique Encaissé :</span>
            <span className="font-extrabold text-sm text-gray-900">
              {formatMGA(summary?.expected_total || 0)}
            </span>
          </div>
        </div>

        {/* SECTION 2: BILLETAGE PHYSIQUE */}
        <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200">
          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-amber-700" />
              2. Saisie du Billetage Physique (Contenu du Tiroir)
            </span>
            <span className="text-xs font-semibold text-amber-800">
              Coupures en Ariary (Ar)
            </span>
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <Label className="text-[11px] font-bold text-gray-700">20 000 Ar</Label>
              <Input
                type="number"
                min="0"
                value={b20000 || ''}
                onChange={(e) => setB20000(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isLocked}
                placeholder="0"
                className="mt-1 h-9 font-bold text-center bg-white"
              />
              <div className="text-[10px] text-gray-500 text-center mt-0.5">
                = {formatMGA(b20000 * 20000)}
              </div>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-gray-700">10 000 Ar</Label>
              <Input
                type="number"
                min="0"
                value={b10000 || ''}
                onChange={(e) => setB10000(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isLocked}
                placeholder="0"
                className="mt-1 h-9 font-bold text-center bg-white"
              />
              <div className="text-[10px] text-gray-500 text-center mt-0.5">
                = {formatMGA(b10000 * 10000)}
              </div>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-gray-700">5 000 Ar</Label>
              <Input
                type="number"
                min="0"
                value={b5000 || ''}
                onChange={(e) => setB5000(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isLocked}
                placeholder="0"
                className="mt-1 h-9 font-bold text-center bg-white"
              />
              <div className="text-[10px] text-gray-500 text-center mt-0.5">
                = {formatMGA(b5000 * 5000)}
              </div>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-gray-700">2 000 Ar</Label>
              <Input
                type="number"
                min="0"
                value={b2000 || ''}
                onChange={(e) => setB2000(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isLocked}
                placeholder="0"
                className="mt-1 h-9 font-bold text-center bg-white"
              />
              <div className="text-[10px] text-gray-500 text-center mt-0.5">
                = {formatMGA(b2000 * 2000)}
              </div>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-gray-700">1 000 Ar</Label>
              <Input
                type="number"
                min="0"
                value={b1000 || ''}
                onChange={(e) => setB1000(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isLocked}
                placeholder="0"
                className="mt-1 h-9 font-bold text-center bg-white"
              />
              <div className="text-[10px] text-gray-500 text-center mt-0.5">
                = {formatMGA(b1000 * 1000)}
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-amber-200/80 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" />
              Total Espèces Constaté en Tiroir :
            </span>
            <span className="text-base font-extrabold text-amber-950">
              {formatMGA(isLocked ? existingClosure?.counted_cash || 0 : totalCountedCash)}
            </span>
          </div>
        </div>

        {/* SECTION 3: RAPPROCHEMENT & ÉCART AUTOMATIQUE */}
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-primary" />
            3. Rapprochement Automatique & Détection des Écarts
          </h4>

          {cashDifference === 0 ? (
            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <div className="font-extrabold text-emerald-900 text-sm">
                  Caisse Exacte — Zéro Écart (0 Ar)
                </div>
                <div className="text-xs text-emerald-700 mt-0.5">
                  Le contenu physique du tiroir correspond parfaitement aux reçus émis dans le logiciel.
                </div>
              </div>
            </div>
          ) : cashDifference < 0 ? (
            <div className="p-3.5 bg-rose-50 border-2 border-rose-400 rounded-xl flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
              <div>
                <div className="font-extrabold text-rose-900 text-sm">
                  Manquant de Caisse Détecté : {formatMGA(Math.abs(cashDifference))}
                </div>
                <div className="text-xs text-rose-700 mt-0.5">
                  Attention : Il manque des espèces dans le tiroir par rapport aux paiements enregistrés.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-sky-50 border-2 border-sky-400 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-sky-600 shrink-0" />
              <div>
                <div className="font-extrabold text-sky-900 text-sm">
                  Surplus de Caisse Détecté : +{formatMGA(cashDifference)}
                </div>
                <div className="text-xs text-sky-700 mt-0.5">
                  Le tiroir contient plus d'espèces que le montant théorique enregistré.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: OBSERVATION / JUSTIFICATIF */}
        <div>
          <Label className="text-xs font-semibold text-gray-700">
            Observations / Justificatifs de Clôture (Optionnel)
          </Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isLocked}
            placeholder="Ex : Écart justifié par rendu de monnaie en attente..."
            className="mt-1 h-9 text-xs"
          />
        </div>
      </div>
    </Dialog>
  )
}
