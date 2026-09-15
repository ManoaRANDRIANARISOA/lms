/**
 * FinanceJournal.tsx — Journal Financier Unifié
 *
 * Affiche toutes les transactions (cash_journal JOIN students) avec KPIs, filtres, reçus.
 *
 * @module pages/finance/FinanceJournal
 */

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCashJournalStore } from '@/store/useCashJournalStore'
import { usePermissions } from '@/lib/usePermissions'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { cn } from '@/lib/utils'
import {
  Plus,
  X,
  Check,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  Percent,
  Trash2,
  Printer,
  Eye,
  Lock,
  UserCheck,
  Receipt,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import type { CashJournalEntry } from '@shared/types'
import ReceiptDetailModal from '@/components/finance/ReceiptDetailModal'
import CashClosureModal from '@/components/finance/CashClosureModal'

// --------------------------------------------
// Detailed Continuous Timeline Chart
// --------------------------------------------
function formatMGA(amount: number): string {
  return new Intl.NumberFormat('fr-MG', {
    style: 'currency',
    currency: 'MGA',
    maximumFractionDigits: 0
  }).format(amount)
}

function DetailedFinanceChart({ data }: { data: { date: string; total: number }[] }) {
  if (!data || data.length === 0) return null

  // Remplir les jours vides pour avoir une chronologie stricte de 30 jours
  const filledData: { date: string; total: number }[] = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(today.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const existing = data.find((x) => x.date === dateStr)
    filledData.push({
      date: dateStr,
      total: existing ? existing.total : 0
    })
  }

  const minVal = Math.min(...filledData.map((d) => d.total), 0)
  const maxVal = Math.max(...filledData.map((d) => d.total), 0)
  const range = Math.max(maxVal - minVal, 1)
  const zeroPercent = (Math.abs(minVal) / range) * 100

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 flex flex-col h-[340px]">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 flex-shrink-0">
        <TrendingUp className="w-5 h-5 text-primary" />
        Évolution Journalière (30 derniers jours)
      </h3>
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <div className="flex justify-start gap-1 px-1 relative h-full min-w-full pt-6">
          <div
            className="absolute left-0 right-0 border-t border-dashed border-border z-0"
            style={{ bottom: `calc(${zeroPercent}% * 0.8 + 30px)` }}
          />

          {filledData.map((item, i) => {
            const barHeightPct = (Math.abs(item.total) / range) * 80
            const isNegative = item.total < 0
            const d = new Date(item.date)
            const shortDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
            const compactVal = new Intl.NumberFormat('fr-MG', { notation: 'compact' }).format(
              item.total
            )

            return (
              <div
                key={i}
                className="flex flex-col h-full flex-1 max-w-[50px] min-w-[35px] group relative z-10 flex-shrink-0"
              >
                <div className="flex-1 relative w-full">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-secondary text-secondary-foreground text-xs font-semibold py-1 px-2 rounded-md whitespace-nowrap z-50 pointer-events-none shadow-md">
                    {formatMGA(item.total)}
                  </div>

                  <div
                    className="absolute w-full flex flex-col items-center"
                    style={{
                      height: `${Math.max(barHeightPct, 1)}%`,
                      bottom: isNegative
                        ? `calc(${zeroPercent * 0.8}% - ${Math.max(barHeightPct, 1)}%)`
                        : `${zeroPercent * 0.8}%`
                    }}
                  >
                    {!isNegative ? (
                      <>
                        {item.total > 0 && (
                          <span className="text-[9px] text-primary/80 font-bold whitespace-nowrap absolute -top-4 hidden group-hover:block md:block">
                            {compactVal}
                          </span>
                        )}
                        <div className="bg-primary/50 group-hover:bg-primary transition-colors rounded-t-sm w-[80%] h-full cursor-pointer" />
                      </>
                    ) : (
                      <>
                        <div className="bg-destructive/50 group-hover:bg-destructive transition-colors rounded-b-sm w-[80%] h-full cursor-pointer" />
                        <span className="text-[9px] text-destructive/80 font-bold whitespace-nowrap absolute -bottom-4 hidden group-hover:block md:block">
                          {compactVal}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="h-[30px] flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] text-muted-foreground font-medium">{shortDate}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Catégories par département ───
const CATEGORIES_BUS = [
  { value: 'carburant', label: 'Carburant' },
  { value: 'entretien', label: 'Entretien (bus)' },
  { value: 'salaire', label: 'Salaire (chauffeur)' },
  { value: 'papier', label: 'Papier' },
  { value: 'banque', label: 'Banque' },
  { value: 'autres', label: 'Autres' }
]

const CATEGORIES_ECOLE = [
  { value: 'salaire', label: 'Salaire' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'fournitures', label: 'Fournitures' },
  { value: 'banques', label: 'Banques' },
  { value: 'autres', label: 'Autres' }
]

// Catégories provenant des paiements élèves (sync automatique)
const STUDENT_CATEGORIES = [
  { value: 'écolage', label: 'Écolage' },
  { value: 'inscription', label: 'Inscription' },
  { value: 'réinscription', label: 'Réinscription' },
  { value: 'transport', label: 'Transport (élève)' },
  { value: 'cantine', label: 'Cantine' },
  { value: 'uniforme', label: 'Uniforme' },
  { value: 'événement', label: 'Événement' },
  { value: 'divers', label: 'Divers (élève)' }
]

// Couleurs par catégorie
const CATEGORY_COLORS: Record<string, string> = {
  écolage: 'bg-blue-50 text-blue-700 border-blue-100',
  inscription: 'bg-purple-50 text-purple-700 border-purple-100',
  réinscription: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  transport: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  cantine: 'bg-orange-50 text-orange-700 border-orange-100',
  uniforme: 'bg-pink-50 text-pink-700 border-pink-100',
  événement: 'bg-red-50 text-red-700 border-red-100',
  divers: 'bg-gray-50 text-gray-700 border-gray-200',
  salaire: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  entretien: 'bg-lime-50 text-lime-700 border-lime-100',
  fournitures: 'bg-teal-50 text-teal-700 border-teal-100',
  carburant: 'bg-amber-50 text-amber-700 border-amber-100',
  banque: 'bg-slate-50 text-slate-700 border-slate-200',
  banques: 'bg-slate-50 text-slate-700 border-slate-200',
  papier: 'bg-stone-50 text-stone-700 border-stone-200',
  autres: 'bg-gray-50 text-gray-500 border-gray-100'
}

function translateCategory(cat: string, department?: string): string {
  let list = [...STUDENT_CATEGORIES, ...CATEGORIES_BUS, ...CATEGORIES_ECOLE]
  if (department === 'bus') list = [...STUDENT_CATEGORIES, ...CATEGORIES_BUS]
  else if (department === 'ecole') list = [...STUDENT_CATEGORIES, ...CATEGORIES_ECOLE]
  return list.find((c) => c.value === cat)?.label || cat
}

function translateDepartment(d: string): string {
  return d === 'bus' ? 'Transport' : d === 'eleve' ? 'Élève' : 'École'
}

// Filtres rapides
const FILTER_PRESETS = [
  { label: 'Tous', filter: {} },
  { label: 'Élèves', filter: { department: 'eleve' } },
  { label: 'Transport', filter: { department: 'bus' } },
  { label: 'Personnel', filter: { category: 'salaire,avance,prime' } },
  {
    label: 'Fonctionnement',
    tooltip: 'Entretien, fournitures, carburant, papier, banque',
    filter: {
      department: 'ecole',
      category: 'entretien,fournitures,carburant,papier,banque,banques,autres'
    }
  }
]

interface EnrichedEntry extends CashJournalEntry {
  first_name?: string
  last_name?: string
  student_class?: string
}

export default function FinanceJournal() {
  const {
    entries,
    dailyBalance,
    monthlyBalance,
    totalBalance,
    loading,
    cashiers,
    dailySummary,
    currentClosure,
    fetchEntries,
    createEntry,
    deleteEntry,
    fetchDailyBalance,
    fetchMonthlyBalance,
    fetchTotalBalance,
    fetchCashiers,
    fetchCashierDailySummary,
    fetchClosure
  } = useCashJournalStore()
  const { canWrite } = usePermissions()
  const { currentYear, stationCode } = useAppStore()
  const activeStation = stationCode || 'C1'

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false)
  const [presetFilter, setPresetFilter] = useState('Tous')
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<{ date: string; total: number }[]>([])
  const [recoveryRate, setRecoveryRate] = useState<number | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()

  const [selectedJournalPayment, setSelectedJournalPayment] = useState<{
    payment: any
    studentName: string
    studentNumber?: string
    className?: string
  } | null>(null)

  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([])

  const [form, setForm] = useState({
    transaction_date: today,
    type: 'expense' as 'income' | 'expense',
    department: 'eleve' as 'bus' | 'ecole' | 'eleve',
    category: 'entretien',
    amount: '',
    description: '',
    payment_method: 'cash'
  })

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    type: 'all',
    category: 'all',
    department: 'all',
    search: '',
    createdBy: 'all',
    stationCode: 'all'
  })

  // ── Data ──
  useEffect(() => {
    fetchCashiers()
  }, [])

  useEffect(() => {
    const activeFilters = {
      ...filters,
      schoolYear: currentYear,
      createdBy: filters.createdBy !== 'all' ? filters.createdBy : undefined,
      stationCode: filters.stationCode !== 'all' ? filters.stationCode : undefined
    }
    fetchEntries(activeFilters)

    const targetDate = filters.startDate || today
    fetchCashierDailySummary(
      targetDate,
      filters.createdBy !== 'all' ? filters.createdBy : undefined,
      filters.stationCode !== 'all' ? filters.stationCode : undefined
    )
    fetchClosure(
      targetDate,
      filters.createdBy !== 'all' ? filters.createdBy : undefined
    )
  }, [filters, currentYear])

  useEffect(() => {
    fetchDailyBalance(today)
    fetchMonthlyBalance(now.getFullYear(), now.getMonth() + 1)
    fetchTotalBalance()

    const fetchDashboardStats = async () => {
      try {
        const result = await window.api.dashboard.getStats()
        if (result.success && result.data?.trend) {
          setTrendData(result.data.trend as { date: string; total: number }[])
        }
      } catch (e) {
        console.error(e)
      }
    }

    const fetchRecoveryRate = async () => {
      try {
        const schoolYear = await window.api.settings.get('school_year')
        const yearStr = (schoolYear as string) || useAppStore.getState().currentYear
        const result = await window.api.report.tuition(yearStr)
        if (result.success && result.data) {
          const data = result.data as { by_class?: Record<string, { total: number }> }
          let totalPaid = 0
          if (data.by_class) {
            totalPaid = Object.values(data.by_class).reduce((s, c) => s + (c.total || 0), 0)
          }
          const expectedResult = await window.api.payment.getExpectedRevenue(yearStr)
          const baseExpected = (expectedResult.success ? expectedResult.expected : 0) || 0

          const d = new Date()
          const schoolStartMonth = 9
          const schoolEndMonth = 6
          let monthsElapsed = 0
          if (d.getMonth() + 1 >= schoolStartMonth) {
            monthsElapsed = Math.min(d.getMonth() + 1, 12) - schoolStartMonth + 1
            if (d.getMonth() + 1 > 12)
              monthsElapsed += Math.min(d.getMonth() + 1 - 12, schoolEndMonth)
          }
          const monthsFactor = Math.min(monthsElapsed, 10)
          const expected = baseExpected * monthsFactor
          setRecoveryRate(
            expected > 0 ? Math.min(Math.round((totalPaid / expected) * 100), 100) : 0
          )
        }
      } catch {
        setRecoveryRate(null)
      }
    }

    fetchDashboardStats()
    fetchRecoveryRate()
  }, [entries])

  const categories =
    form.department === 'bus'
      ? CATEGORIES_BUS
      : form.department === 'eleve'
        ? STUDENT_CATEGORIES
        : CATEGORIES_ECOLE

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setMessage({ text: 'Le montant doit être supérieur à 0', type: 'error' })
      return
    }
    const result = await createEntry({
      transaction_date: form.transaction_date,
      type: form.type,
      department: form.department,
      category: form.category,
      amount: parseFloat(form.amount),
      description: form.description || undefined,
      payment_method: form.payment_method
    })
    if (result.success) {
      setMessage({ text: 'Entrée créée', type: 'success' })
      resetForm()
      fetchEntries(filters)
    } else setMessage({ text: result.error || 'Erreur', type: 'error' })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleDelete = async (entry: CashJournalEntry) => {
    if (entry.related_student_id) {
      alert(
        "Ceci est un paiement d'élève synchronisé. Veuillez aller sur le dossier de l'élève pour annuler ce paiement afin de garder les données à jour."
      )
      return
    }

    if (!confirm('Voulez-vous vraiment annuler cette entrée manuelle ?')) return
    const result = await deleteEntry(entry.id)
    if (result.success) {
      setMessage({ text: 'Entrée annulée avec succès', type: 'success' })
      fetchEntries(filters)
      fetchDailyBalance(today)
      fetchMonthlyBalance(now.getFullYear(), now.getMonth() + 1)
      fetchTotalBalance()
    } else {
      setMessage({ text: result.error || 'Erreur', type: 'error' })
    }
    setTimeout(() => setMessage(null), 3000)
  }

  const resetForm = () => {
    setForm({
      transaction_date: today,
      type: 'expense',
      department: 'eleve',
      category: 'divers',
      amount: '',
      description: '',
      payment_method: 'cash'
    })
    setShowForm(false)
  }

  // ── KPIs ──
  const income = monthlyBalance?.total_income || 0
  const expense = monthlyBalance?.total_expense || 0

  // ── Summary ──
  const enriched = entries as EnrichedEntry[]
  const summary = {
    totalIncome: enriched.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0),
    totalExpense: enriched.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  }

  const incomeEntries = enriched.filter((e) => e.type === 'income')

  const toggleSelectEntry = (id: string) => {
    setSelectedEntryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAllEntries = () => {
    if (selectedEntryIds.length === incomeEntries.length) {
      setSelectedEntryIds([])
    } else {
      setSelectedEntryIds(incomeEntries.map((e) => e.id))
    }
  }

  const handlePrintGroupedFromJournal = async () => {
    const selected = enriched.filter((e) => selectedEntryIds.includes(e.id))
    if (selected.length === 0) return

    if (!window.api?.printer?.printReceipt) {
      toast.error('Service impression non disponible')
      return
    }

    const items = selected.map((e) => {
      const monthMatch = e.description?.match(/\(([^)]+)\)/)
      const extractedMonth = monthMatch ? monthMatch[1] : undefined
      const isItemDup = ((e as any).print_count || 0) >= 1
      return {
        label: e.description || e.category,
        amount: Number(e.amount) || 0,
        detail: e.description,
        payment_type: e.category,
        month: extractedMonth,
        receipt_number: (e as any).receipt_number
          ? (e as any).receipt_number.replace(/^REC-(\d{4})-(\d{5})$/, `REC-$1-${activeStation}-$2`)
          : undefined,
        is_duplicate: isItemDup,
        duplicate_count: isItemDup ? ((e as any).print_count || 1) : 1
      }
    })

    const totalAmt = items.reduce((sum, it) => sum + it.amount, 0)
    const primaryMethod = selected[0]?.payment_method || 'cash'
    const latestDate = selected[0]?.transaction_date || new Date().toISOString().split('T')[0]
    const firstStudent = selected.find((e) => e.first_name || e.last_name)
    const studentName = firstStudent
      ? `${firstStudent.last_name || ''} ${firstStudent.first_name || ''}`.trim()
      : selected[0]?.description?.replace('Paiement ', '') || '—'
    const studentClass = selected[0]?.student_class || '-'
    const studentNumber = (selected[0] as any)?.registration_number || ''

    const validNums = selected
      .map((e) =>
        (e as any).receipt_number
          ? (e as any).receipt_number.replace(/^REC-(\d{4})-(\d{5})$/, `REC-$1-${activeStation}-$2`)
          : ''
      )
      .filter(Boolean)

    let groupedNum = `REC-${new Date().getFullYear()}-${activeStation}-${Date.now().toString().slice(-5)}`
    if (validNums.length === 1) {
      groupedNum = validNums[0]
    } else if (validNums.length > 1) {
      const first = validNums[0]
      const last = validNums[validNums.length - 1]
      if (first === last) {
        groupedNum = first
      } else {
        const lastSeq = last.slice(-5)
        const prefix = first.slice(0, -5)
        if (last.startsWith(prefix)) {
          groupedNum = `${first} — ${lastSeq}`
        } else {
          groupedNum = `${first} — ${last}`
        }
      }
    }

    const paymentIds = selected
      .map((e) => (e as any).related_payment_id || e.id)
      .filter(Boolean)
    const allDup = selected.every((e) => ((e as any).print_count || 0) >= 1)
    const anyDup = selected.some((e) => ((e as any).print_count || 0) >= 1)
    const maxCount = Math.max(0, ...selected.map((e) => (e as any).print_count || 0))

    const toastId = toast.loading(`Impression du reçu groupé (${selected.length} paiements)...`)
    try {
      const res = await window.api.printer.printReceipt(
        {
          payment_ids: paymentIds,
          student_name: studentName,
          student_number: studentNumber,
          class_name: studentClass,
          amount: totalAmt,
          payment_date: latestDate,
          payment_method: primaryMethod,
          receipt_number: groupedNum,
          is_duplicate: allDup,
          duplicate_count: allDup ? maxCount : 1,
          items
        },
        2
      )

      if (res.success) {
        toast.success(
          allDup
            ? `Reçu groupé (Duplicata N°${maxCount}) imprimé en 2 exemplaires`
            : anyDup
              ? 'Reçu groupé imprimé (avec mentions duplicatas sur articles réimprimés)'
              : 'Reçu groupé imprimé en 2 exemplaires (Parent + Caisse)',
          { id: toastId }
        )
        setSelectedEntryIds([])
        fetchEntries({ ...filters, schoolYear: currentYear })
      } else {
        toast.error(res.error || "Échec d'impression du reçu groupé", { id: toastId })
      }
    } catch (err: unknown) {
      toast.error('Erreur: ' + (err instanceof Error ? err.message : String(err)), { id: toastId })
    }
  }

  // ── Render ──
  return (
    <div className="w-full space-y-4">
      <ReadOnlyBanner resource="cash_journal" />

      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Journal Financier</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Grand livre des encaissements, décaissements, pointage caissier & Ticket Z
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {canWrite('cash_journal') && !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle entrée
            </Button>
          )}
          <Button
            variant="outline"
            className="border-amber-600/60 text-amber-900 bg-amber-50/50 hover:bg-amber-100 hover:text-amber-950 font-medium shadow-sm flex items-center gap-1.5"
            onClick={() => setIsClosureModalOpen(true)}
            title="Clôture journalière de caisse, récolement physique du billetage et impression Ticket Z 80mm"
          >
            <Lock className="w-4 h-4 text-amber-700" />
            <span>Clôture de Caisse (Ticket Z)</span>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const bal = dailyBalance || { total_income: 0, total_expense: 0, balance: 0 }
              const targetDate = filters.startDate || today
              const r = await window.api.pdf.generateDailyReport({
                date: targetDate,
                total_income: bal.total_income,
                total_expense: bal.total_expense,
                balance: bal.balance,
                station_code: filters.stationCode !== 'all' ? filters.stationCode : activeStation,
                cashier: filters.createdBy !== 'all' ? filters.createdBy : undefined,
                entries: enriched.map((e) => ({
                  type: e.type,
                  department: e.department,
                  category: e.category,
                  amount: e.amount,
                  description: e.description,
                  receipt_number: (e as any).receipt_number,
                  beneficiary: e.last_name ? `${e.last_name} ${e.first_name || ''}`.trim() : undefined,
                  payment_method: e.payment_method,
                  created_by: (e as any).created_by,
                  time: e.created_at
                    ? new Date(e.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : undefined
                }))
              })
              if (r.success && r.filePath) await window.api.pdf.openFile(r.filePath)
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Bilan PDF
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'p-4 mb-6 rounded-md',
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          )}
        >
          {message.text}
        </div>
      )}

      {/* ── New entry form ── */}
      {showForm && (
        <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Nouvelle entrée</h3>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.transaction_date}
                onChange={(e) => setForm((p) => ({ ...p, transaction_date: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                value={form.type}
                onChange={(e) => {
                  const t = e.target.value as 'income' | 'expense'
                  setForm((p) => ({
                    ...p,
                    type: t,
                    category: t === 'income' ? 'autres' : p.category
                  }))
                }}
              >
                <option value="expense">Dépense</option>
                <option value="income">Recette</option>
              </select>
            </div>
            <div>
              <Label>Département</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                value={form.department}
                onChange={(e) => {
                  const d = e.target.value as 'bus' | 'ecole' | 'eleve'
                  setForm((p) => ({
                    ...p,
                    department: d,
                    category: d === 'bus' ? 'carburant' : d === 'eleve' ? 'divers' : 'fournitures'
                  }))
                }}
              >
                <option value="ecole">École</option>
                <option value="eleve">Élève</option>
                <option value="bus">Transport</option>
              </select>
            </div>
            <div>
              <Label>Catégorie</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Montant (Ar)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Paiement</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                value={form.payment_method}
                onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}
              >
                <option value="cash">Espèces</option>
                <option value="check">Chèque</option>
                <option value="transfer">Virement</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description..."
              className="mt-1"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!canWrite('cash_journal')}
              title={!canWrite('cash_journal') ? 'Accès refusé' : undefined}
            >
              <Check className="w-4 h-4 mr-2" />
              Enregistrer
            </Button>
            <Button variant="outline" onClick={resetForm}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Solde Total</p>
            <Wallet className="w-4 h-4 text-blue-500" />
          </div>
          <p
            className={cn(
              'text-2xl font-bold',
              totalBalance.balance >= 0 ? 'text-blue-700' : 'text-red-700'
            )}
          >
            {totalBalance.balance.toLocaleString()} Ar
          </p>
        </div>

        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Recettes (Mois)</p>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-700">{income.toLocaleString()} Ar</p>
        </div>

        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Dépenses (Mois)</p>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-700">{expense.toLocaleString()} Ar</p>
        </div>

        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Taux Recouvrement</p>
            <Percent className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-purple-700">
            {recoveryRate !== null ? `${recoveryRate}%` : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Scolarité attendue vs perçue</p>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="mb-6">
        <DetailedFinanceChart data={trendData} />
      </div>

      {/* ── Quick filters ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={presetFilter === p.label ? 'default' : 'outline'}
            title={(p as { tooltip?: string }).tooltip}
            onClick={() => {
              setPresetFilter(p.label)
              const cat = String((p.filter as Record<string, string>).category || 'all')
              const dep = String((p.filter as Record<string, string>).department || 'all')
              setFilters((prev) => ({ ...prev, category: cat, department: dep }))
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white p-5 rounded-xl shadow-sm border mb-4 flex flex-col gap-4">
        {/* Ligne 1 : Recherche et Dates */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-gray-500">Recherche</Label>
            <Input
              placeholder="Rechercher (nom, description)..."
              value={filters.search || ''}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              className="mt-1 h-9"
            />
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Période rapide</Label>
            <div className="flex bg-gray-100 p-1 rounded-md">
              <Button
                variant={activeDatePreset === 'today' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => {
                  const d = new Date()
                  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  setFilters((p) => ({ ...p, startDate: todayStr, endDate: todayStr }))
                  setActiveDatePreset('today')
                }}
              >
                Aujourd'hui
              </Button>
              <Button
                variant={activeDatePreset === 'week' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => {
                  const now = new Date()
                  const day = now.getDay()
                  // Monday as start of week: day 0 is Sunday -> shift -6, else 1 - day
                  const diffToMonday = day === 0 ? -6 : 1 - day
                  const start = new Date(now)
                  start.setDate(now.getDate() + diffToMonday)
                  const end = new Date(start)
                  end.setDate(start.getDate() + 6)
                  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
                  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
                  setFilters((p) => ({ ...p, startDate: startStr, endDate: endStr }))
                  setActiveDatePreset('week')
                }}
              >
                Semaine
              </Button>
              <Button
                variant={activeDatePreset === 'month' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => {
                  const d = new Date()
                  const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
                  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
                  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
                  setFilters((p) => ({ ...p, startDate: startStr, endDate: endStr }))
                  setActiveDatePreset('month')
                }}
              >
                Mois
              </Button>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <div>
              <Label className="text-xs text-gray-500">Du</Label>
              <Input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => {
                  setActiveDatePreset(null)
                  setFilters((p) => ({ ...p, startDate: e.target.value }))
                }}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Au</Label>
              <Input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => {
                  setActiveDatePreset(null)
                  setFilters((p) => ({ ...p, endDate: e.target.value }))
                }}
                className="mt-1 h-9"
              />
            </div>
          </div>
        </div>

        {/* Ligne 2 : Type, Catégorie, Caissier, Station, Reset */}
        <div className="flex flex-wrap gap-4 items-end pt-2 border-t border-gray-100">
          <div className="flex-1 min-w-[130px]">
            <Label className="text-xs text-gray-500">Type</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
              value={filters.type || 'all'}
              onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="all">Tous</option>
              <option value="income">Recettes</option>
              <option value="expense">Dépenses</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs text-gray-500">Catégorie</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
              value={
                filters.category === 'all' ? 'all' : `${filters.department}:${filters.category}`
              }
              onChange={(e) => {
                const val = e.target.value
                if (val === 'all') {
                  setFilters((p) => ({ ...p, category: 'all', department: 'all' }))
                } else {
                  const [dep, cat] = val.split(':')
                  setFilters((p) => ({ ...p, department: dep, category: cat }))
                }
              }}
            >
              <option value="all">Toutes</option>
              <optgroup label="── Élèves ──">
                {STUDENT_CATEGORIES.map((c) => (
                  <option key={`eleve:${c.value}`} value={`eleve:${c.value}`}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── École ──">
                {CATEGORIES_ECOLE.map((c) => (
                  <option key={`ecole:${c.value}`} value={`ecole:${c.value}`}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="── Transport (Bus) ──">
                {CATEGORIES_BUS.map((c) => (
                  <option key={`bus:${c.value}`} value={`bus:${c.value}`}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Filtre Caissier / Opérateur (Avenant N°3) */}
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs text-gray-500 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              <span>Opérateur / Caissier</span>
            </Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1 font-medium"
              value={filters.createdBy || 'all'}
              onChange={(e) => setFilters((p) => ({ ...p, createdBy: e.target.value }))}
            >
              <option value="all">Tous les caissiers</option>
              {cashiers.map((c) => (
                <option key={c} value={c}>
                  👤 {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Station de Caisse (Avenant N°3) */}
          <div className="w-[120px]">
            <Label className="text-xs text-gray-500">Station</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1"
              value={filters.stationCode || 'all'}
              onChange={(e) => setFilters((p) => ({ ...p, stationCode: e.target.value }))}
            >
              <option value="all">Toutes</option>
              <option value="C1">Station C1</option>
              <option value="C2">Station C2</option>
              <option value="C3">Station C3</option>
              <option value="C4">Station C4</option>
            </select>
          </div>

          <Button
            variant="outline"
            className="h-9 whitespace-nowrap"
            onClick={() => {
              setFilters({
                startDate: '',
                endDate: '',
                type: 'all',
                category: 'all',
                department: 'all',
                search: '',
                createdBy: 'all',
                stationCode: 'all'
              })
              setPresetFilter('Tous')
              setActiveDatePreset(null)
            }}
          >
            Réinitialiser
          </Button>
        </div>
      </div>

      {/* ── Avenant N°3 : Pointage de Caisse & Volumétrie par Opérateur ── */}
      <div className="bg-gradient-to-r from-amber-50/70 via-stone-50 to-amber-50/40 border border-amber-200/80 rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-amber-200/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100/80 text-amber-800 rounded-lg shadow-xs">
              <Receipt className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>Pointage & Journal de Caisse Opérateur</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  {filters.createdBy !== 'all' ? `Caissier : ${filters.createdBy}` : 'Tous caissiers'}
                  {filters.stationCode !== 'all' ? ` • Station : ${filters.stationCode}` : ''}
                  {` • ${filters.startDate ? `du ${new Date(filters.startDate).toLocaleDateString('fr-FR')}` : "Aujourd'hui"}`}
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Volumétrie des encaissements par mode de règlement et état de récolement comptable
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentClosure ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 shadow-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Caisse Clôturée (Ticket Z N° {currentClosure.id.slice(0, 8).toUpperCase()})
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-emerald-600 text-emerald-800 hover:bg-emerald-50 flex items-center gap-1 shadow-xs"
                  onClick={() => setIsClosureModalOpen(true)}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Détails Clôture / Réimprimer</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100/90 text-amber-900 text-xs font-semibold rounded-lg border border-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  Caisse Ouverte (Non clôturée)
                </span>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-amber-700 hover:bg-amber-800 text-white flex items-center gap-1.5 shadow-sm"
                  onClick={() => setIsClosureModalOpen(true)}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Billetage & Ticket Z</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Grille des indicateurs de pointage */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
          <div className="bg-white/90 p-3 rounded-lg border border-amber-100/80 shadow-2xs">
            <span className="text-[11px] font-medium text-gray-500 block">Tickets Traités</span>
            <span className="text-xl font-bold text-gray-900 mt-0.5 block">
              {dailySummary ? dailySummary.total_tickets : enriched.filter((e) => e.type === 'income').length}
            </span>
          </div>

          <div className="bg-white/90 p-3 rounded-lg border border-amber-100/80 shadow-2xs">
            <span className="text-[11px] font-medium text-gray-500 block">Espèces (Cash)</span>
            <span className="text-sm sm:text-base font-bold text-emerald-700 mt-0.5 block truncate" title={formatMGA(dailySummary ? dailySummary.expected_cash : 0)}>
              {formatMGA(dailySummary ? dailySummary.expected_cash : enriched.filter((e) => e.type === 'income' && e.payment_method === 'cash').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
            </span>
          </div>

          <div className="bg-white/90 p-3 rounded-lg border border-amber-100/80 shadow-2xs">
            <span className="text-[11px] font-medium text-gray-500 block">Chèques</span>
            <span className="text-sm sm:text-base font-bold text-blue-700 mt-0.5 block truncate" title={formatMGA(dailySummary ? dailySummary.expected_check : 0)}>
              {formatMGA(dailySummary ? dailySummary.expected_check : enriched.filter((e) => e.type === 'income' && e.payment_method === 'check').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
            </span>
          </div>

          <div className="bg-white/90 p-3 rounded-lg border border-amber-100/80 shadow-2xs">
            <span className="text-[11px] font-medium text-gray-500 block">MVola / Mobile</span>
            <span className="text-sm sm:text-base font-bold text-amber-700 mt-0.5 block truncate" title={formatMGA(dailySummary ? dailySummary.expected_mobile : 0)}>
              {formatMGA(dailySummary ? dailySummary.expected_mobile : enriched.filter((e) => e.type === 'income' && (e.payment_method === 'mobile_money' || e.payment_method === 'mvola')).reduce((s, e) => s + (Number(e.amount) || 0), 0))}
            </span>
          </div>

          <div className="bg-white/90 p-3 rounded-lg border border-amber-100/80 shadow-2xs">
            <span className="text-[11px] font-medium text-gray-500 block">Virements</span>
            <span className="text-sm sm:text-base font-bold text-indigo-700 mt-0.5 block truncate" title={formatMGA(dailySummary ? dailySummary.expected_transfer : 0)}>
              {formatMGA(dailySummary ? dailySummary.expected_transfer : enriched.filter((e) => e.type === 'income' && e.payment_method === 'transfer').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
            </span>
          </div>

          <div className="bg-white/90 p-3 rounded-lg border border-amber-200 shadow-2xs bg-amber-50/50">
            <span className="text-[11px] font-semibold text-amber-900 block">Total Encaissé</span>
            <span className="text-sm sm:text-base font-bold text-primary mt-0.5 block truncate" title={formatMGA(dailySummary ? dailySummary.expected_total : summary.totalIncome)}>
              {formatMGA(dailySummary ? dailySummary.expected_total : summary.totalIncome)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Multi-selection toolbar ── */}
      {selectedEntryIds.length > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2 animate-in fade-in mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground bg-white px-2.5 py-1 rounded border border-primary/20 shadow-sm">
              {selectedEntryIds.length} paiement{selectedEntryIds.length > 1 ? 's' : ''} sélectionné{selectedEntryIds.length > 1 ? 's' : ''} • Total:{' '}
              {enriched
                .filter((e) => selectedEntryIds.includes(e.id))
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
                .toLocaleString()}{' '}
              Ar
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrintGroupedFromJournal}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 flex items-center gap-1.5 shadow-sm"
              title="Imprimer un seul reçu thermique 80mm regroupant les encaissements cochés"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer Reçu Groupé ({selectedEntryIds.length})</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedEntryIds([])}
              className="text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              Désélectionner
            </Button>
          </div>
        </div>
      )}

      {/* ── Table Responsive 6 Colonnes (Descente de ligne & 0 Scroll Horizontal) ── */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 uppercase font-semibold border-b text-[11px] tracking-wider">
              <tr>
                <th className="px-2 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      incomeEntries.length > 0 && selectedEntryIds.length === incomeEntries.length
                    }
                    onChange={toggleSelectAllEntries}
                    className="rounded border-gray-300 text-primary focus:ring-primary cursor-pointer w-3.5 h-3.5 accent-[#AD8B73]"
                    title="Tout sélectionner (recettes)"
                  />
                </th>
                <th className="px-3 py-3 w-28 whitespace-nowrap">Date / Dép.</th>
                <th className="px-3 py-3 min-w-[160px] max-w-[240px]">Élève / Classe</th>
                <th className="px-3 py-3 min-w-[180px]">Catégorie & Détails</th>
                <th className="px-3 py-3 w-36 text-right whitespace-nowrap">Montant / Reçu</th>
                <th className="px-3 py-3 w-36 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              ) : enriched.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Aucune entrée trouvée.
                  </td>
                </tr>
              ) : (
                enriched.map((entry) => {
                  const studentName = entry.first_name
                    ? `${entry.last_name} ${entry.first_name}`
                    : ''
                  const pCount = (entry as any).print_count || 0
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        'group hover:bg-gray-50/70 transition-colors',
                        selectedEntryIds.includes(entry.id) && 'bg-primary/5'
                      )}
                    >
                      {/* Col 1: Checkbox */}
                      <td className="px-2 py-3 text-center align-middle">
                        {entry.type === 'income' ? (
                          <input
                            type="checkbox"
                            checked={selectedEntryIds.includes(entry.id)}
                            onChange={() => toggleSelectEntry(entry.id)}
                            className="rounded border-gray-300 text-primary focus:ring-primary cursor-pointer w-3.5 h-3.5 accent-[#AD8B73]"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Col 2: Date + Département (empilés) */}
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="font-medium text-xs text-gray-900">
                          {new Date(entry.transaction_date).toLocaleDateString('fr-FR')}
                        </div>
                        <div className="mt-1">
                          <span
                            className={cn(
                              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide',
                              entry.department === 'bus'
                                ? 'bg-amber-100 text-amber-800'
                                : entry.department === 'ecole'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                            )}
                          >
                            {translateDepartment(entry.department)}
                          </span>
                        </div>
                      </td>

                      {/* Col 3: Nom élève / Tiers + Classe (empilés) */}
                      <td className="px-3 py-3 align-top min-w-[160px] max-w-[240px]">
                        <div
                          className="font-semibold text-xs text-gray-900 truncate"
                          title={studentName || entry.description || '—'}
                        >
                          {studentName ||
                            (entry.description?.startsWith('Paiement Salaire')
                              ? entry.description.split(' - ')[1]
                              : entry.description || '—')}
                        </div>
                        <div className="mt-1">
                          {entry.student_class ? (
                            entry.student_class.startsWith('Ancien') ? (
                              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px] font-medium">
                                {entry.student_class}
                              </span>
                            ) : entry.student_class.startsWith('Pré-inscrit') ? (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-medium">
                                {entry.student_class}
                              </span>
                            ) : entry.student_class.startsWith('Quitté') ? (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-[10px] font-medium">
                                {entry.student_class}
                              </span>
                            ) : entry.student_class === 'Non inscrit' ? (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">
                                {entry.student_class}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-medium">
                                {entry.student_class}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400 text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      {/* Col 4: Catégorie + Description (empilés avec descente de ligne) */}
                      <td className="px-3 py-3 align-top min-w-[180px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border',
                              CATEGORY_COLORS[entry.category] ||
                                'bg-gray-50 text-gray-700 border-gray-200'
                            )}
                          >
                            {translateCategory(entry.category, entry.department)}
                          </span>
                          {entry.payment_method && (
                            <span className="text-[10px] text-gray-400 capitalize">
                              • {entry.payment_method === 'cash' ? 'espèces' : entry.payment_method}
                            </span>
                          )}
                          {entry.created_by && (
                            <span
                              className="text-[10px] bg-slate-100 text-slate-700 font-medium px-1.5 py-0.2 rounded border border-slate-200"
                              title={`Encaissé / Saisi par l'opérateur ${entry.created_by}`}
                            >
                              👤 {entry.created_by}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed"
                          title={entry.description}
                        >
                          {entry.description || '—'}
                        </div>
                      </td>

                      {/* Col 5: Montant + Statut Reçu (empilés) */}
                      <td className="px-3 py-3 align-top text-right whitespace-nowrap">
                        <div
                          className={cn(
                            'font-bold text-xs sm:text-sm',
                            entry.type === 'income' ? 'text-green-700' : 'text-red-700'
                          )}
                        >
                          {entry.type === 'income' ? '+' : '-'} {entry.amount?.toLocaleString()} Ar
                        </div>
                        <div className="mt-1 flex justify-end">
                          {entry.type === 'income' ? (
                            pCount === 0 ? (
                              <span
                                className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-medium"
                                title="Ce reçu n'a pas encore été imprimé"
                              >
                                Non imprimé
                              </span>
                            ) : pCount === 1 ? (
                              <span
                                className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-medium"
                                title="Reçu original déjà délivré (1er tirage)"
                              >
                                Original émis
                              </span>
                            ) : (
                              <span
                                className="text-[10px] bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-medium"
                                title={`Ce reçu a été réimprimé ${pCount - 1} fois (Duplicata N°${pCount - 1})`}
                              >
                                Duplicata ({pCount - 1})
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Décaissement</span>
                          )}
                        </div>
                      </td>

                      {/* Col 6: Actions rapides */}
                      <td className="px-3 py-3 align-middle text-center whitespace-nowrap">
                        <div className="flex justify-center items-center gap-1">
                          {entry.type === 'income' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-accent/20"
                                title="Voir les détails, traçabilité et duplicata du reçu"
                                onClick={() => {
                                  const monthMatch = entry.description?.match(/\(([^)]+)\)/)
                                  const extractedMonth = monthMatch ? monthMatch[1] : undefined
                                  const rNum = (entry as any).receipt_number
                                    ? (entry as any).receipt_number.replace(
                                        /^REC-(\d{4})-(\d{5})$/,
                                        `REC-$1-${activeStation}-$2`
                                      )
                                    : `REC-${currentYear ? currentYear.slice(0, 4) : new Date().getFullYear()}-${activeStation}-${(entry.id || Date.now().toString()).slice(-5).toUpperCase()}`
                                  const pCount = (entry as any).print_count || 0
                                  const pData = {
                                    id: (entry as any).related_payment_id || entry.id,
                                    student_id: entry.related_student_id || '',
                                    payment_date: entry.transaction_date,
                                    amount: entry.amount,
                                    payment_type: (entry.category as any) || 'other',
                                    month: extractedMonth,
                                    description: entry.description,
                                    payment_method: (entry.payment_method as any) || 'cash',
                                    receipt_number: rNum,
                                    school_year: currentYear || '2026-2027',
                                    print_count: pCount,
                                    created_by: (entry as any).created_by || 'Administrateur',
                                    last_printed_at: (entry as any).last_printed_at,
                                    last_printed_by: (entry as any).last_printed_by
                                  }
                                  setSelectedJournalPayment({
                                    payment: pData,
                                    studentName:
                                      entry.first_name && entry.last_name
                                        ? `${entry.last_name} ${entry.first_name}`
                                        : entry.description || '—',
                                    studentNumber: (entry as any).registration_number || '',
                                    className: entry.student_class || ''
                                  })
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-accent/20"
                                title="Imprimer le ticket de caisse (Thermique 80mm - Double exemplaire)"
                                onClick={async () => {
                                  if (!window.api?.printer?.printReceipt) {
                                    toast.error('Service impression non disponible')
                                    return
                                  }
                                  let studentName = ''
                                  if (entry.first_name && entry.last_name) {
                                    studentName = `${entry.last_name} ${entry.first_name}`
                                  }

                                  const monthMatch = entry.description?.match(/\(([^)]+)\)/)
                                  const extractedMonth = monthMatch ? monthMatch[1] : undefined
                                  const rNum = (entry as any).receipt_number
                                    ? (entry as any).receipt_number.replace(
                                        /^REC-(\d{4})-(\d{5})$/,
                                        `REC-$1-${activeStation}-$2`
                                      )
                                    : `REC-${currentYear ? currentYear.slice(0, 4) : new Date().getFullYear()}-${activeStation}-${(entry.id || Date.now().toString()).slice(-5).toUpperCase()}`
                                  const pCount = (entry as any).print_count || 0
                                  const isDup = pCount >= 1
                                  const paymentId = (entry as any).related_payment_id || entry.id

                                  const toastId = toast.loading('Impression du ticket de caisse...')
                                  try {
                                    const r = await window.api.printer.printReceipt(
                                      {
                                        payment_ids: paymentId ? [paymentId] : undefined,
                                        student_name:
                                          studentName ||
                                          entry.description
                                            ?.replace('Paiement ', '')
                                            ?.replace(/ — .*/, '') ||
                                          '—',
                                        student_number: (entry as any).registration_number || '',
                                        class_name: entry.student_class || '-',
                                        amount: entry.amount,
                                        payment_type: entry.category || 'other',
                                        payment_date: entry.transaction_date,
                                        month: extractedMonth,
                                        payment_method: entry.payment_method || 'cash',
                                        description: entry.description,
                                        receipt_number: rNum,
                                        cashier_name: (entry as any).created_by || 'Administrateur',
                                        is_duplicate: isDup,
                                        duplicate_count: isDup ? pCount : 1
                                      },
                                      2
                                    )
                                    if (r.success) {
                                      toast.success(
                                        isDup
                                          ? `Duplicata N°${pCount} imprimé en 2 exemplaires (Parent + Caisse)`
                                          : 'Ticket imprimé en 2 exemplaires (Parent + Caisse)',
                                        { id: toastId }
                                      )
                                      fetchEntries({ ...filters, schoolYear: currentYear })
                                    } else {
                                      toast.error(r.error || "Échec d'impression", { id: toastId })
                                    }
                                  } catch (e: unknown) {
                                    toast.error(
                                      'Erreur: ' + (e instanceof Error ? e.message : String(e)),
                                      { id: toastId }
                                    )
                                  }
                                }}
                              >
                                <Printer className="w-4 h-4 text-primary" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Télécharger le reçu PDF (A5)"
                            onClick={async () => {
                              let studentName = ''
                              if (entry.first_name && entry.last_name) {
                                studentName = `${entry.last_name} ${entry.first_name}`
                              }

                              const monthMatch = entry.description?.match(/\(([^)]+)\)/)
                              const extractedMonth = monthMatch ? monthMatch[1] : undefined

                              const r = await window.api.pdf.generateReceipt({
                                student_name:
                                  studentName ||
                                  entry.description
                                    ?.replace('Paiement ', '')
                                    ?.replace(/ — .*/, '') ||
                                  '—',
                                class_name: entry.student_class || '-',
                                amount: entry.amount,
                                payment_type: entry.category || '',
                                payment_date: entry.transaction_date,
                                month: extractedMonth,
                                department: entry.department
                              })
                              if (r.success && r.filePath) await window.api.pdf.openFile(r.filePath)
                              else alert(r.error || 'Erreur PDF')
                            }}
                          >
                            <FileText className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                          </Button>
                          {canWrite('cash_journal') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(entry)}
                              title="Annuler cette entrée"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}

              {/* ── Summary footer ── */}
              {summary && enriched.length > 0 && (
                <tr className="bg-gray-50/90 border-t-2 font-semibold text-xs">
                  <td className="px-3 py-3" colSpan={3}>
                    <div className="flex items-center text-gray-700 flex-wrap gap-1">
                      <span className="uppercase text-xs tracking-wider font-bold">
                        Total sur la sélection
                      </span>
                      {filters.startDate && (
                        <span className="text-xs text-gray-500 font-normal">
                          du {new Date(filters.startDate).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      {filters.endDate && (
                        <span className="text-xs text-gray-500 font-normal">
                          au {new Date(filters.endDate).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col text-xs font-normal text-gray-500 gap-0.5">
                      <div className="flex justify-between gap-2">
                        <span>Entrées :</span>
                        <span className="text-green-600 font-medium">
                          {summary.totalIncome.toLocaleString()} Ar
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>Sorties :</span>
                        <span className="text-red-600 font-medium">
                          {summary.totalExpense.toLocaleString()} Ar
                        </span>
                      </div>
                    </div>
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right align-middle text-sm font-bold whitespace-nowrap',
                      summary.totalIncome - summary.totalExpense >= 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                    )}
                  >
                    {(summary.totalIncome - summary.totalExpense).toLocaleString()} Ar
                  </td>
                  <td className="px-3 py-3"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Detail & Audit Modal */}
      <ReceiptDetailModal
        isOpen={Boolean(selectedJournalPayment)}
        onClose={() => setSelectedJournalPayment(null)}
        payment={selectedJournalPayment ? selectedJournalPayment.payment : null}
        studentName={selectedJournalPayment ? selectedJournalPayment.studentName : '—'}
        studentNumber={selectedJournalPayment ? selectedJournalPayment.studentNumber : ''}
        className={selectedJournalPayment ? selectedJournalPayment.className : ''}
        onPrintSuccess={() => {
          fetchEntries({
            ...filters,
            schoolYear: currentYear,
            createdBy: filters.createdBy !== 'all' ? filters.createdBy : undefined,
            stationCode: filters.stationCode !== 'all' ? filters.stationCode : undefined
          })
        }}
      />

      {/* Module de Billetage & Ticket Z (Avenant N°3) */}
      <CashClosureModal
        isOpen={isClosureModalOpen}
        onClose={() => setIsClosureModalOpen(false)}
        selectedDate={filters.startDate || today}
        selectedCashier={filters.createdBy !== 'all' ? filters.createdBy : undefined}
        stationCode={filters.stationCode !== 'all' ? filters.stationCode : activeStation}
        onClosureSuccess={() => {
          const activeFilters = {
            ...filters,
            schoolYear: currentYear,
            createdBy: filters.createdBy !== 'all' ? filters.createdBy : undefined,
            stationCode: filters.stationCode !== 'all' ? filters.stationCode : undefined
          }
          fetchEntries(activeFilters)
          const targetDate = filters.startDate || today
          fetchCashierDailySummary(
            targetDate,
            filters.createdBy !== 'all' ? filters.createdBy : undefined,
            filters.stationCode !== 'all' ? filters.stationCode : undefined
          )
          fetchClosure(
            targetDate,
            filters.createdBy !== 'all' ? filters.createdBy : undefined
          )
        }}
      />
    </div>
  )
}
