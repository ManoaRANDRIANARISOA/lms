import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { BarChart3, FileText, Users, CreditCard, Download } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { useAppStore } from '@/store/useAppStore'
import StudentExportModal from '@/components/students/StudentExportModal'
import DataExportModal, { ExportColumnDef, ExportPresetDef } from '@/components/shared/DataExportModal'

interface FinanceReport {
  year: number
  month: number
  total_income: number
  total_expense: number
  balance: number
  income_by_category: Array<{ department: string; category: string; count: number; total: number }>
  expense_by_category: Array<{ department: string; category: string; count: number; total: number }>
}

interface PayrollReport {
  year: number
  month: number
  total_payroll: number
  entries: Array<{ description: string; amount: number; transaction_date: string }>
}

export default function ReportsPage() {
  const now = new Date()
  const globalSchoolYear = useAppStore((s) => s.currentYear)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [schoolYear, setSchoolYear] = useState(globalSchoolYear || '2026-2027')
  const [financeReport, setFinanceReport] = useState<FinanceReport | null>(null)
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null)
  const [tuitionReport, setTuitionReport] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  // Export Modals States
  const [isStudentExportOpen, setIsStudentExportOpen] = useState(false)
  const [isFinanceExportOpen, setIsFinanceExportOpen] = useState(false)
  const [isPayrollExportOpen, setIsPayrollExportOpen] = useState(false)
  const [isTuitionExportOpen, setIsTuitionExportOpen] = useState(false)

  const loadFinanceReport = async () => {
    setLoading('finance')
    try {
      const result = await window.api.report.monthlyFinance(year, month)
      if (result.success) setFinanceReport(result.data as unknown as FinanceReport)
    } catch {
      /* empty */
    }
    setLoading(null)
  }

  const loadPayrollReport = async () => {
    setLoading('payroll')
    try {
      const result = await window.api.report.payroll(year, month)
      if (result.success) setPayrollReport(result.data as unknown as PayrollReport)
    } catch {
      /* empty */
    }
    setLoading(null)
  }

  const loadTuitionReport = async () => {
    setLoading('tuition')
    try {
      const result = await window.api.report.tuition(schoolYear)
      if (result.success) setTuitionReport(result.data as Record<string, unknown>)
    } catch {
      /* empty */
    }
    setLoading(null)
  }

  // Flatten financial report data for export
  const getFinanceExportData = () => {
    if (!financeReport) return []
    const rows: Record<string, unknown>[] = []
    financeReport.income_by_category.forEach((inc) => {
      rows.push({
        type: 'Recette',
        department: inc.department,
        category: inc.category,
        count: inc.count,
        total: inc.total
      })
    })
    financeReport.expense_by_category.forEach((exp) => {
      rows.push({
        type: 'Dépense',
        department: exp.department,
        category: exp.category,
        count: exp.count,
        total: exp.total
      })
    })
    return rows
  }

  const financeColumns: ExportColumnDef[] = [
    { key: 'type', label: 'Type (Recette / Dépense)' },
    { key: 'department', label: 'Département' },
    { key: 'category', label: 'Catégorie' },
    { key: 'count', label: 'Nombre de transactions' },
    { key: 'total', label: 'Montant Total (Ar)' }
  ]

  // Payroll export data & columns
  const payrollColumns: ExportColumnDef[] = [
    { key: 'transaction_date', label: 'Date de paiement' },
    { key: 'description', label: 'Description / Bénéficiaire' },
    { key: 'amount', label: 'Montant versé (Ar)' }
  ]

  // Tuition export data & columns
  const getTuitionExportData = () => {
    if (!tuitionReport?.by_class) return []
    const byClass = tuitionReport.by_class as Record<string, { total: number; count: number }>
    return Object.entries(byClass).map(([className, item]) => ({
      class: className,
      count: item.count,
      total: item.total
    }))
  }

  const tuitionColumns: ExportColumnDef[] = [
    { key: 'class', label: 'Classe' },
    { key: 'count', label: 'Nombre de paiements' },
    { key: 'total', label: 'Total perçu (Ar)' }
  ]

  const tuitionPresets: Record<string, ExportPresetDef> = {
    standard: {
      name: 'Synthèse Écolage',
      icon: '📊',
      keys: ['class', 'count', 'total']
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <ReadOnlyBanner resource="reports" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Rapports & Exports Modulaires</h1>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1">
            Génération et extraction de rapports conformes aux normes professionnelles (Excel, CSV UTF-8, PDF, JSON).
          </p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase">Année</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || now.getFullYear())}
            className="mt-1 w-28 h-9 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase">Mois</Label>
          <Input
            type="number"
            value={month}
            min={1}
            max={12}
            onChange={(e) => setMonth(parseInt(e.target.value) || 1)}
            className="mt-1 w-24 h-9 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase">Année scolaire</Label>
          <Input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="mt-1 w-36 h-9 text-sm"
          />
        </div>
      </div>

      {/* Report Action Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Rapport Financier */}
        <button
          type="button"
          onClick={loadFinanceReport}
          disabled={loading === 'finance'}
          className="p-5 bg-card hover:bg-accent/40 rounded-xl border border-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group cursor-pointer"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-foreground text-base">Rapport Financier</h3>
            <p className="text-xs text-muted-foreground mt-1">Recettes & Dépenses du mois {month}/{year}</p>
          </div>
          <span className="text-xs font-semibold text-primary mt-4 flex items-center gap-1">
            {loading === 'finance' ? 'Chargement...' : 'Afficher le rapport →'}
          </span>
        </button>

        {/* Card 2: Masse Salariale */}
        <button
          type="button"
          onClick={loadPayrollReport}
          disabled={loading === 'payroll'}
          className="p-5 bg-card hover:bg-accent/40 rounded-xl border border-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group cursor-pointer"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-foreground text-base">Masse Salariale</h3>
            <p className="text-xs text-muted-foreground mt-1">Salaires et émoluments du mois {month}/{year}</p>
          </div>
          <span className="text-xs font-semibold text-primary mt-4 flex items-center gap-1">
            {loading === 'payroll' ? 'Chargement...' : 'Afficher le rapport →'}
          </span>
        </button>

        {/* Card 3: Export Élèves Modulaire */}
        <button
          type="button"
          onClick={() => setIsStudentExportOpen(true)}
          className="p-5 bg-card hover:bg-accent/40 rounded-xl border border-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group cursor-pointer"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-[#AD8B73]/20 text-[#5C4535] dark:text-[#E3CAA5] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-foreground text-base">Export Élèves</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Export multi-formats (Excel, CSV, PDF, JSON) avec filtres
            </p>
          </div>
          <span className="text-xs font-semibold text-primary mt-4 flex items-center gap-1">
            Ouvrir l'exportation →
          </span>
        </button>

        {/* Card 4: État Écolage */}
        <button
          type="button"
          onClick={loadTuitionReport}
          disabled={loading === 'tuition'}
          className="p-5 bg-card hover:bg-accent/40 rounded-xl border border-border shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group cursor-pointer"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-foreground text-base">État Écolage</h3>
            <p className="text-xs text-muted-foreground mt-1">Paiements et recouvrement par classe ({schoolYear})</p>
          </div>
          <span className="text-xs font-semibold text-primary mt-4 flex items-center gap-1">
            {loading === 'tuition' ? 'Chargement...' : 'Afficher le rapport →'}
          </span>
        </button>
      </div>

      {/* Messages d'état vide */}
      {financeReport && financeReport.total_income === 0 && financeReport.total_expense === 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 rounded-xl border border-amber-200 dark:border-amber-800/60 text-sm">
          Aucune transaction financière n'a été trouvée pour le mois de {financeReport.month}/{financeReport.year}.
        </div>
      )}

      {payrollReport && payrollReport.total_payroll === 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 rounded-xl border border-amber-200 dark:border-amber-800/60 text-sm">
          Aucun salaire n'a été enregistré ou payé pour le mois de {payrollReport.month}/{payrollReport.year}.
        </div>
      )}

      {/* Finance Report Display */}
      {financeReport && (financeReport.total_income > 0 || financeReport.total_expense > 0) && (
        <div className="p-6 bg-card rounded-2xl border border-border shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Rapport Financier Mensuel — {financeReport.month}/{financeReport.year}
              </h3>
              <p className="text-xs text-muted-foreground">Synthèse des encaissements et décaissements</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFinanceExportOpen(true)}
              className="hover:bg-primary/10 hover:text-primary hover:border-primary/50 self-start sm:self-auto"
            >
              <Download className="w-4 h-4 mr-2 text-primary" />
              Exporter ce rapport
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">Recettes Totales</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                {financeReport.total_income.toLocaleString()} Ar
              </p>
            </div>
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/50">
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase">Dépenses Totales</p>
              <p className="text-2xl font-black text-rose-700 dark:text-rose-400 mt-1">
                {financeReport.total_expense.toLocaleString()} Ar
              </p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800/50">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">Solde Net</p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-1">
                {financeReport.balance.toLocaleString()} Ar
              </p>
            </div>
          </div>

          {financeReport.income_by_category.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-foreground mb-2">Recettes par catégorie</h4>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="p-3">Département</th>
                      <th className="p-3">Catégorie</th>
                      <th className="p-3 text-right">Transactions</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {financeReport.income_by_category.map((r, i) => (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="p-3 font-medium">{r.department}</td>
                        <td className="p-3">{r.category}</td>
                        <td className="p-3 text-right text-muted-foreground">{r.count}</td>
                        <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {r.total.toLocaleString()} Ar
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {financeReport.expense_by_category.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-foreground mb-2">Dépenses par catégorie</h4>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="p-3">Département</th>
                      <th className="p-3">Catégorie</th>
                      <th className="p-3 text-right">Transactions</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {financeReport.expense_by_category.map((r, i) => (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="p-3 font-medium">{r.department}</td>
                        <td className="p-3">{r.category}</td>
                        <td className="p-3 text-right text-muted-foreground">{r.count}</td>
                        <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400">
                          {r.total.toLocaleString()} Ar
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payroll Report Display */}
      {payrollReport && payrollReport.total_payroll > 0 && (
        <div className="p-6 bg-card rounded-2xl border border-border shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Masse Salariale — {payrollReport.month}/{payrollReport.year}
              </h3>
              <p className="text-xs text-muted-foreground">Total des salaires et paiements effectués</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPayrollExportOpen(true)}
              className="hover:bg-primary/10 hover:text-primary hover:border-primary/50 self-start sm:self-auto"
            >
              <Download className="w-4 h-4 mr-2 text-primary" />
              Exporter ce rapport
            </Button>
          </div>

          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">Masse Salariale Totale</p>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
              {payrollReport.total_payroll.toLocaleString()} Ar
            </p>
          </div>

          {payrollReport.entries.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Description / Bénéficiaire</th>
                    <th className="p-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payrollReport.entries.map((e, i) => (
                    <tr key={i} className="hover:bg-accent/30">
                      <td className="p-3 font-medium">
                        {new Date(e.transaction_date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="p-3">{e.description || '-'}</td>
                      <td className="p-3 text-right font-bold text-foreground">
                        {e.amount.toLocaleString()} Ar
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tuition Report Display */}
      {tuitionReport && (
        <div className="p-6 bg-card rounded-2xl border border-border shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h3 className="text-lg font-bold text-foreground">État Écolage — {schoolYear}</h3>
              <p className="text-xs text-muted-foreground">Recouvrement des frais par classe</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsTuitionExportOpen(true)}
              className="hover:bg-primary/10 hover:text-primary hover:border-primary/50 self-start sm:self-auto"
            >
              <Download className="w-4 h-4 mr-2 text-primary" />
              Exporter ce rapport
            </Button>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-950/40 rounded-xl border border-orange-200 dark:border-orange-800/50">
            <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 uppercase">Total Paiements Enregistrés</p>
            <p className="text-2xl font-black text-orange-700 dark:text-orange-400 mt-1">
              {(tuitionReport.total_payments as number) || 0} paiements
            </p>
          </div>

          {Boolean(tuitionReport.by_class) &&
            Object.keys(tuitionReport.by_class as Record<string, { total: number; count: number }>).length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="p-3">Classe</th>
                      <th className="p-3 text-right">Nb Paiements</th>
                      <th className="p-3 text-right">Total Perçu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(
                      tuitionReport.by_class as Record<string, { total: number; count: number }>
                    ).map(([cls, data], i) => (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="p-3 font-semibold text-foreground">{cls}</td>
                        <td className="p-3 text-right text-muted-foreground">{data.count}</td>
                        <td className="p-3 text-right font-bold text-orange-600 dark:text-orange-400">
                          {data.total.toLocaleString()} Ar
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* Student Export Modal */}
      <StudentExportModal
        isOpen={isStudentExportOpen}
        onClose={() => setIsStudentExportOpen(false)}
        filters={{
          schoolYear,
          currentStudentsCount: 0
        }}
      />

      {/* Finance Data Export Modal */}
      <DataExportModal
        isOpen={isFinanceExportOpen}
        onClose={() => setIsFinanceExportOpen(false)}
        title={`Rapport Financier — ${month}/${year}`}
        defaultFilename={`Rapport_Financier_${month}_${year}`}
        subtitle={`Recettes & Dépenses du mois ${month}/${year}`}
        columns={financeColumns}
        data={getFinanceExportData()}
      />

      {/* Payroll Data Export Modal */}
      <DataExportModal
        isOpen={isPayrollExportOpen}
        onClose={() => setIsPayrollExportOpen(false)}
        title={`Masse Salariale — ${month}/${year}`}
        defaultFilename={`Masse_Salariale_${month}_${year}`}
        subtitle={`Paiements des salaires du mois ${month}/${year}`}
        columns={payrollColumns}
        data={payrollReport?.entries as unknown as Record<string, unknown>[] || []}
      />

      {/* Tuition Data Export Modal */}
      <DataExportModal
        isOpen={isTuitionExportOpen}
        onClose={() => setIsTuitionExportOpen(false)}
        title={`État Écolage — Année ${schoolYear}`}
        defaultFilename={`Etat_Ecolage_${schoolYear.replace(/\s+/g, '_')}`}
        subtitle={`Récapitulatif des paiements d'écolage par classe (${schoolYear})`}
        columns={tuitionColumns}
        presets={tuitionPresets}
        data={getTuitionExportData()}
        schoolYear={schoolYear}
      />
    </div>
  )
}
