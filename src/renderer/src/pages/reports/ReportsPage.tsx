import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart3, FileText, Users, CreditCard } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

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
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const defaultSchoolYear = (() => {
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
    return `${y}-${y + 1}`
  })()
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear)
  const [financeReport, setFinanceReport] = useState<FinanceReport | null>(null)
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null)
  const [tuitionReport, setTuitionReport] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

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

  const exportStudentsCSV = async () => {
    setLoading('export-students')
    try {
      const result = await window.api.student.list({ limit: 10000 })
      const students = result?.students || []
      await window.api.export.csv(
        students as unknown as Record<string, unknown>[],
        [
          { key: 'registration_number', label: 'Matricule' },
          { key: 'last_name', label: 'Nom' },
          { key: 'first_name', label: 'Prénom' },
          { key: 'class', label: 'Classe' },
          { key: 'enrollment_date', label: "Date d'inscription" }
        ],
        'eleves_export.csv'
      )
    } catch {
      /* empty */
    }
    setLoading(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ReadOnlyBanner resource="reports" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Rapports & Exports</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          Ce module vous permet de générer des rapports globaux sur la santé financière et administrative de l'établissement.
          Sélectionnez la période (Mois/Année) et cliquez sur l'une des cartes pour afficher le rapport correspondant.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex gap-4 mb-6 bg-white p-4 rounded-lg border shadow-sm">
        <div>
          <Label>Année</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || 2025)}
            className="mt-1 w-28"
          />
        </div>
        <div>
          <Label>Mois</Label>
          <Input
            type="number"
            value={month}
            min={1}
            max={12}
            onChange={(e) => setMonth(parseInt(e.target.value) || 1)}
            className="mt-1 w-20"
          />
        </div>
        <div>
          <Label>Année scolaire</Label>
          <Input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="mt-1 w-40"
          />
        </div>
      </div>

      {/* Report cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <button
          onClick={loadFinanceReport}
          disabled={loading === 'finance'}
          className="p-4 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <BarChart3 className="w-8 h-8 text-blue-500 mb-2" />
          <h3 className="font-semibold">Rapport Financier</h3>
          <p className="text-sm text-gray-500">Recettes/Dépenses du mois</p>
        </button>
        <button
          onClick={loadPayrollReport}
          disabled={loading === 'payroll'}
          className="p-4 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <Users className="w-8 h-8 text-green-500 mb-2" />
          <h3 className="font-semibold">Masse Salariale</h3>
          <p className="text-sm text-gray-500">Salaires du mois</p>
        </button>
        <button
          onClick={exportStudentsCSV}
          disabled={loading === 'export-students'}
          className="p-4 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <FileText className="w-8 h-8 text-purple-500 mb-2" />
          <h3 className="font-semibold">Export Élèves</h3>
          <p className="text-sm text-gray-500">Export CSV de la liste</p>
        </button>
        <button
          onClick={loadTuitionReport}
          disabled={loading === 'tuition'}
          className="p-4 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow text-left"
        >
          <CreditCard className="w-8 h-8 text-orange-500 mb-2" />
          <h3 className="font-semibold">État Écolage</h3>
          <p className="text-sm text-gray-500">Paiements par classe</p>
        </button>
      </div>

      {/* Messages d'erreur ou d'état vide */}
      {financeReport && financeReport.total_income === 0 && financeReport.total_expense === 0 && (
        <div className="mb-6 p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
          Aucune transaction financière n'a été trouvée pour ce mois ({financeReport.month}/{financeReport.year}).
        </div>
      )}

      {payrollReport && payrollReport.total_payroll === 0 && (
        <div className="mb-6 p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
          Aucun salaire n'a été enregistré ou payé pour ce mois ({payrollReport.month}/{payrollReport.year}).
        </div>
      )}

      {/* Finance Report */}
      {financeReport && (financeReport.total_income > 0 || financeReport.total_expense > 0) && (
        <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
          <h3 className="text-lg font-semibold mb-4">
            Rapport Financier — {financeReport.month}/{financeReport.year}
          </h3>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <div className="p-3 bg-green-50 rounded">
              <p className="text-sm text-gray-600">Recettes</p>
              <p className="text-xl font-bold text-green-700">
                {financeReport.total_income.toLocaleString()} Ar
              </p>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <p className="text-sm text-gray-600">Dépenses</p>
              <p className="text-xl font-bold text-red-700">
                {financeReport.total_expense.toLocaleString()} Ar
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-sm text-gray-600">Solde</p>
              <p className="text-xl font-bold text-blue-700">
                {financeReport.balance.toLocaleString()} Ar
              </p>
            </div>
          </div>
          {financeReport.income_by_category.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium mb-2">Recettes par catégorie</h4>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Dép.</th>
                    <th className="p-2 text-left">Catégorie</th>
                    <th className="p-2 text-right">Nb</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {financeReport.income_by_category.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.department}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2 text-right">{r.count}</td>
                      <td className="p-2 text-right">{r.total.toLocaleString()} Ar</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {financeReport.expense_by_category.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Dépenses par catégorie</h4>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Dép.</th>
                    <th className="p-2 text-left">Catégorie</th>
                    <th className="p-2 text-right">Nb</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {financeReport.expense_by_category.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.department}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2 text-right">{r.count}</td>
                      <td className="p-2 text-right">{r.total.toLocaleString()} Ar</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payroll Report */}
      {payrollReport && payrollReport.total_payroll > 0 && (
        <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
          <h3 className="text-lg font-semibold mb-4">
            Masse Salariale — {payrollReport.month}/{payrollReport.year}
          </h3>
          <div className="p-3 bg-green-50 rounded mb-4">
            <p className="text-sm text-gray-600">Total salaires</p>
            <p className="text-xl font-bold text-green-700">
              {payrollReport.total_payroll.toLocaleString()} Ar
            </p>
          </div>
          {payrollReport.entries.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {payrollReport.entries.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">
                      {new Date(e.transaction_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="p-2">{e.description || '-'}</td>
                    <td className="p-2 text-right">{e.amount.toLocaleString()} Ar</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tuition Report */}
      {tuitionReport && (
        <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
          <h3 className="text-lg font-semibold mb-4">État Écolage — {schoolYear}</h3>
          <div className="p-3 bg-orange-50 rounded mb-4">
            <p className="text-sm text-gray-600">Total paiements écolage</p>
            <p className="text-xl font-bold text-orange-700">
              {(tuitionReport.total_payments as number) || 0} paiements
            </p>
          </div>
          {Boolean(tuitionReport.by_class) &&
            Object.keys(tuitionReport.by_class as Record<string, { total: number; count: number }>)
              .length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Classe</th>
                    <th className="p-2 text-right">Nb paiements</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    tuitionReport.by_class as Record<string, { total: number; count: number }>
                  ).map(([cls, data], i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{cls}</td>
                      <td className="p-2 text-right">{data.count}</td>
                      <td className="p-2 text-right">{data.total.toLocaleString()} Ar</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  )
}
