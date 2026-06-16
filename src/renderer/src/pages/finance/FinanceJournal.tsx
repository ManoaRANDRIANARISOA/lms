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
import { Plus, X, Check, Download, FileText, TrendingUp, TrendingDown, Wallet, Percent, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { CashJournalEntry } from '@shared/types'

// --------------------------------------------
// Detailed Continuous Timeline Chart
// --------------------------------------------
function formatMGA(amount: number): string {
  return new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA', maximumFractionDigits: 0 }).format(amount)
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
            const compactVal = new Intl.NumberFormat('fr-MG', { notation: 'compact' }).format(item.total)
            
            return (
              <div key={i} className="flex flex-col h-full flex-1 max-w-[50px] min-w-[35px] group relative z-10 flex-shrink-0">
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
                  <span className="text-[9px] text-muted-foreground font-medium">
                    {shortDate}
                  </span>
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
  { value: 'autres', label: 'Autres' },
]

const CATEGORIES_ECOLE = [
  { value: 'salaire', label: 'Salaire' },
  { value: 'entretien', label: 'Entretien' },
  { value: 'fournitures', label: 'Fournitures' },
  { value: 'banques', label: 'Banques' },
  { value: 'autres', label: 'Autres' },
]

// Catégories provenant des paiements élèves (sync automatique)
const STUDENT_CATEGORIES = [
  { value: 'écolage', label: 'Écolage' },
  { value: 'inscription', label: 'Inscription' },
  { value: 'réinscription', label: 'Réinscription' },
  { value: 'transport', label: 'Transport (élève)' },
  { value: 'cantine', label: 'Cantine' },
  { value: 'uniforme', label: 'Uniforme' },
  { value: 'divers', label: 'Divers (élève)' },
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
  autres: 'bg-gray-50 text-gray-500 border-gray-100',
}

function translateCategory(cat: string): string {
  const all = [...STUDENT_CATEGORIES, ...CATEGORIES_BUS, ...CATEGORIES_ECOLE]
  return all.find(c => c.value === cat)?.label || cat
}

function translateDepartment(d: string): string {
  return d === 'bus' ? 'Transport' : 'École'
}

// Filtres rapides
const FILTER_PRESETS = [
  { label: 'Tous', filter: {} },
  { label: 'Élèves', filter: { category: STUDENT_CATEGORIES.map(c => c.value).join(',') } },
  { label: 'Transport', filter: { category: 'transport' } },
  { label: 'Personnel', filter: { category: 'salaire' } },
  {
    label: 'Fonctionnement',
    tooltip: 'Entretien, fournitures, carburant, papier, banque',
    filter: { category: 'entretien,fournitures,carburant,papier,banque,banques' },
  },
]

interface EnrichedEntry extends CashJournalEntry {
  first_name?: string
  last_name?: string
  student_class?: string
}

export default function FinanceJournal() {
  const {
    entries, dailyBalance, monthlyBalance, totalBalance,
    loading, fetchEntries, createEntry, deleteEntry,
    fetchDailyBalance, fetchMonthlyBalance, fetchTotalBalance
  } = useCashJournalStore()
  const { canWrite } = usePermissions()

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [presetFilter, setPresetFilter] = useState('Tous')
  const [trendData, setTrendData] = useState<{ date: string; total: number }[]>([])
  const [recoveryRate, setRecoveryRate] = useState<number | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()

  const [form, setForm] = useState({
    transaction_date: today,
    type: 'expense' as 'income' | 'expense',
    department: 'ecole' as 'bus' | 'ecole',
    category: 'entretien',
    amount: '',
    description: '',
    payment_method: 'cash',
  })

  const [filters, setFilters] = useState({ startDate: '', endDate: '', type: 'all', category: 'all', search: '' })

  // ── Data ──
  useEffect(() => { fetchEntries(filters) }, [filters])

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
            if (d.getMonth() + 1 > 12) monthsElapsed += Math.min(d.getMonth() + 1 - 12, schoolEndMonth)
          }
          const monthsFactor = Math.min(monthsElapsed, 10)
          const expected = baseExpected * monthsFactor
          setRecoveryRate(expected > 0 ? Math.min(Math.round((totalPaid / expected) * 100), 100) : 0)
        }
      } catch {
        setRecoveryRate(null)
      }
    }

    fetchDashboardStats()
    fetchRecoveryRate()
  }, [entries])

  // ── Handlers ──
  const categories = form.department === 'bus' ? CATEGORIES_BUS : CATEGORIES_ECOLE

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setMessage({ text: 'Le montant doit être supérieur à 0', type: 'error' })
      return
    }
    const result = await createEntry({
      transaction_date: form.transaction_date, type: form.type, department: form.department,
      category: form.category, amount: parseFloat(form.amount),
      description: form.description || undefined, payment_method: form.payment_method,
    })
    if (result.success) { setMessage({ text: 'Entrée créée', type: 'success' }); resetForm(); fetchEntries(filters) }
    else setMessage({ text: result.error || 'Erreur', type: 'error' })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleDelete = async (entry: CashJournalEntry) => {
    if (entry.related_student_id) {
      alert("Ceci est un paiement d'élève synchronisé. Veuillez aller sur le dossier de l'élève pour annuler ce paiement afin de garder les données à jour.")
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
    setForm({ transaction_date: today, type: 'expense', department: 'ecole', category: 'entretien', amount: '', description: '', payment_method: 'cash' })
    setShowForm(false)
  }

  // ── KPIs ──
  const income = monthlyBalance?.total_income || 0
  const expense = monthlyBalance?.total_expense || 0

  // ── Summary ──
  const enriched = entries as EnrichedEntry[]
  const summary = filters.startDate || filters.endDate
    ? {
        totalIncome: enriched.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0),
        totalExpense: enriched.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0),
      }
    : null

  // ── Render ──
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ReadOnlyBanner resource="cash_journal" />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Journal Financier</h1>
        <div className="flex gap-2">
          {canWrite('cash_journal') && !showForm && (
            <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" />Nouvelle entrée</Button>
          )}
          <Button variant="outline" onClick={async () => {
            const bal = dailyBalance || { total_income: 0, total_expense: 0, balance: 0 }
            const r = await window.api.pdf.generateDailyReport({
              date: today, total_income: bal.total_income, total_expense: bal.total_expense,
              balance: bal.balance, entries: enriched.map(e => ({ type: e.type, department: e.department, category: e.category, amount: e.amount, description: e.description })),
            })
            if (r.success && r.filePath) await window.api.pdf.openFile(r.filePath)
          }}><Download className="w-4 h-4 mr-2" />Bilan PDF</Button>
        </div>
      </div>

      {message && <div className={cn('p-4 mb-6 rounded-md', message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>{message.text}</div>}

      {/* ── KPIs ── */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Solde Total</p>
            <Wallet className="w-4 h-4 text-blue-500" />
          </div>
          <p className={cn('text-2xl font-bold', totalBalance.balance >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {totalBalance.balance.toLocaleString()} Ar
          </p>
        </div>
        
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Recettes (Mois)</p>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-700">
            {income.toLocaleString()} Ar
          </p>
        </div>
        
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-gray-500">Dépenses (Mois)</p>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-700">
            {expense.toLocaleString()} Ar
          </p>
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

      {/* ── New entry form ── */}
      {showForm && (
        <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
          <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">Nouvelle entrée</h3><Button variant="ghost" size="sm" onClick={resetForm}><X className="w-4 h-4" /></Button></div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div><Label>Date</Label><Input type="date" value={form.transaction_date} onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={form.type}
                onChange={e => { const t = e.target.value as 'income' | 'expense'; setForm(p => ({ ...p, type: t, category: t === 'income' ? 'autres' : p.category })) }}>
                <option value="expense">Dépense</option><option value="income">Recette</option>
              </select>
            </div>
            <div>
              <Label>Département</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={form.department}
                onChange={e => { const d = e.target.value as 'bus' | 'ecole'; setForm(p => ({ ...p, department: d, category: d === 'bus' ? 'carburant' : 'fournitures' })) }}>
                <option value="ecole">École</option><option value="bus">Transport</option>
              </select>
            </div>
            <div>
              <Label>Catégorie</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {categories.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
              </select>
            </div>
            <div><Label>Montant (Ar)</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" className="mt-1" /></div>
            <div>
              <Label>Paiement</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={form.payment_method}
                onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                <option value="cash">Espèces</option><option value="check">Chèque</option><option value="transfer">Virement</option><option value="mobile_money">Mobile Money</option>
              </select>
            </div>
          </div>
          <div className="mt-4"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description..." className="mt-1" /></div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSubmit} disabled={!canWrite('cash_journal')} title={!canWrite('cash_journal') ? 'Accès refusé' : undefined}><Check className="w-4 h-4 mr-2" />Enregistrer</Button>
            <Button variant="outline" onClick={resetForm}>Annuler</Button>
          </div>
        </div>
      )}

      {/* ── Quick filters ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_PRESETS.map(p => (
          <Button
            key={p.label}
            size="sm"
            variant={presetFilter === p.label ? 'default' : 'outline'}
            title={(p as { tooltip?: string }).tooltip}
            onClick={() => {
              setPresetFilter(p.label)
              const cat = String((p.filter as Record<string, string>).category || 'all')
              setFilters(prev => ({ ...prev, category: cat }))
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col md:flex-row gap-4 mb-4 bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex-1">
          <Label>Recherche</Label>
          <Input placeholder="Nom, catégorie, description..." value={filters.search || ''} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} className="mt-1" />
        </div>
        <div><Label>Début</Label><Input type="date" value={filters.startDate || ''} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} className="mt-1" /></div>
        <div><Label>Fin</Label><Input type="date" value={filters.endDate || ''} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} className="mt-1" /></div>
        <div>
          <Label>Type</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={filters.type || 'all'}
            onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
            <option value="all">Tous</option><option value="income">Recettes</option><option value="expense">Dépenses</option>
          </select>
        </div>
        <div>
          <Label>Catégorie</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" value={filters.category || 'all'}
            onChange={e => setFilters(p => ({ ...p, category: e.target.value }))}>
            <option value="all">Toutes</option>
            <optgroup label="── Élèves ──">
              {STUDENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
            <optgroup label="── École ──">
              {CATEGORIES_ECOLE.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
            <optgroup label="── Transport (Bus) ──">
              {CATEGORIES_BUS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={() => { setFilters({ startDate: '', endDate: '', type: 'all', category: 'all', search: '' }); setPresetFilter('Tous') }}>Réinitialiser</Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 uppercase font-medium border-b">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Département</th>
                <th className="px-6 py-3">Nom</th>
                <th className="px-6 py-3">Classe</th>
                <th className="px-6 py-3">Catégorie</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Montant</th>
                <th className="px-6 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Chargement...</td></tr>
              ) : enriched.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Aucune entrée trouvée.</td></tr>
              ) : (
                enriched.map((entry) => {
                  const studentName = entry.first_name ? `${entry.last_name} ${entry.first_name}` : ''
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 whitespace-nowrap">{new Date(entry.transaction_date).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2 py-1 rounded text-xs', entry.department === 'bus' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800')}>
                          {translateDepartment(entry.department)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{studentName || '—'}</td>
                      <td className="px-6 py-4">
                        {entry.student_class ? (
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">{entry.student_class}</span>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2 py-1 rounded text-xs font-medium border', CATEGORY_COLORS[entry.category] || 'bg-gray-50 text-gray-700 border-gray-200')}>
                          {translateCategory(entry.category)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-xs truncate" title={entry.description}>{entry.description || '-'}</td>
                      <td className={cn('px-6 py-4 text-right font-bold', entry.type === 'income' ? 'text-green-700' : 'text-red-700')}>
                        {entry.type === 'income' ? '+' : '-'}{entry.amount?.toLocaleString()} Ar
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Imprimer reçu"
                            onClick={async () => {
                              let studentName = ''
                              if (entry.first_name && entry.last_name) {
                                studentName = `${entry.last_name} ${entry.first_name}`
                              }

                              // Extraction du mois depuis la description "Paiement écolage (Mars) — Doe John"
                              const monthMatch = entry.description?.match(/\(([^)]+)\)/)
                              const extractedMonth = monthMatch ? monthMatch[1] : undefined

                              const r = await window.api.pdf.generateReceipt({
                                student_name: studentName || entry.description?.replace('Paiement ', '')?.replace(/ — .*/, '') || '—',
                                class_name: entry.student_class || '-', amount: entry.amount,
                                payment_type: entry.category || '', payment_date: entry.transaction_date,
                                month: extractedMonth
                              })
                              if (r.success && r.filePath) await window.api.pdf.openFile(r.filePath)
                              else alert(r.error || 'Erreur PDF')
                            }}>
                            <FileText className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                          </Button>
                          {canWrite('cash_journal') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
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
                <tr className="bg-gray-100 font-semibold border-t-2">
                  <td className="px-6 py-3" colSpan={6}>
                    <span className="text-gray-600">Total</span>
                    {filters.startDate && <span className="text-xs text-gray-400 ml-2">du {new Date(filters.startDate).toLocaleDateString('fr-FR')}</span>}
                    {filters.endDate && <span className="text-xs text-gray-400 ml-1">au {new Date(filters.endDate).toLocaleDateString('fr-FR')}</span>}
                  </td>
                  <td className={cn('px-6 py-4 text-right', summary.totalIncome - summary.totalExpense >= 0 ? 'text-green-700' : 'text-red-700')}>
                    {(summary.totalIncome - summary.totalExpense).toLocaleString()} Ar
                  </td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
