import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calculator, ArrowRight, AlertTriangle } from 'lucide-react'
import type { SalaryCalculation, Personnel } from '@shared/types'

interface UnpaidRow {
  person: Personnel
  month: string
  calc: SalaryCalculation
}

export default function PersonnelPayroll(): React.JSX.Element {
  const { personnel, fetchPersonnel } = usePersonnelStore()
  const navigate = useNavigate()

  const [filterType, setFilterType] = useState<'all' | 'specific'>('all')
  const [specificMonth, setSpecificMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [unpaidData, setUnpaidData] = useState<UnpaidRow[]>([])
  const [missingHireDate, setMissingHireDate] = useState<Personnel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPersonnel()
  }, [])

  useEffect(() => {
    async function computeAll() {
      setLoading(true)
      const data: UnpaidRow[] = []
      const missing: Personnel[] = []

      const d = new Date()
      const realCurrentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

      for (const p of personnel) {
        if (p.status === 'parttime' || p.status === 'fulltime') {
          if (!p.hire_date) {
            missing.push(p)
            continue
          }

          const hireDate = new Date(p.hire_date)
          const hireMonthStr = `${hireDate.getFullYear()}-${String(hireDate.getMonth() + 1).padStart(2, '0')}`

          let effectiveStartMonth = hireMonthStr
          if (p.payroll_start_date) {
            effectiveStartMonth =
              p.payroll_start_date > hireMonthStr ? p.payroll_start_date : hireMonthStr
          }

          if (filterType === 'specific') {
            if (specificMonth >= effectiveStartMonth) {
              const res = await window.api.personnel.calculateSalary(p.id, specificMonth)
              if (
                res.success &&
                res.calculation &&
                !res.calculation.isPaid &&
                res.calculation.netSalary > 0
              ) {
                data.push({ person: p, month: specificMonth, calc: res.calculation })
              }
            }
          } else {
            // Tous les impayés (remonter jusqu'à 12 mois maximum ou depuis hire_date)
            const monthsToCheck: string[] = []

            const endDate = new Date() // current

            const limitDate = new Date()
            limitDate.setMonth(limitDate.getMonth() - 12)
            limitDate.setDate(1)

            const actualStart = limitDate

            const curr = new Date(actualStart)

            while (curr <= endDate) {
              const monthStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`
              if (monthStr >= effectiveStartMonth) {
                monthsToCheck.push(monthStr)
              }
              curr.setMonth(curr.getMonth() + 1)
            }
            // always include current month just in case
            if (
              !monthsToCheck.includes(realCurrentMonth) &&
              realCurrentMonth >= effectiveStartMonth
            ) {
              monthsToCheck.push(realCurrentMonth)
            }

            for (const m of monthsToCheck) {
              const res = await window.api.personnel.calculateSalary(p.id, m)
              if (
                res.success &&
                res.calculation &&
                !res.calculation.isPaid &&
                res.calculation.netSalary > 0
              ) {
                data.push({ person: p, month: m, calc: res.calculation })
              }
            }
          }
        }
      }

      // Sort by month desc, then name
      data.sort((a, b) => {
        if (a.month !== b.month) return b.month.localeCompare(a.month)
        return a.person.last_name.localeCompare(b.person.last_name)
      })

      setUnpaidData(data)
      setMissingHireDate(missing)
      setLoading(false)
    }

    if (personnel.length > 0) {
      computeAll()
    }
  }, [personnel, filterType, specificMonth])

  const totalNet = unpaidData.reduce((sum, item) => sum + (item.calc.netSalary || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-red-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Alertes Impayés Salaires
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Liste des salaires en attente de paiement (Reste à Payer).
          </p>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border">
          <Label className="font-medium text-gray-700 ml-2">Filtre :</Label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | 'specific')}
            className="flex h-10 w-[180px] items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="all">Tous les impayés</option>
            <option value="specific">Mois spécifique</option>
          </select>

          {filterType === 'specific' && (
            <Input
              type="month"
              value={specificMonth}
              onChange={(e) => setSpecificMonth(e.target.value)}
              className="w-40 bg-white"
            />
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
        {missingHireDate.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800">
                Action requise : Dates d'embauche manquantes
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                <span className="font-bold">{missingHireDate.length} employé(s)</span> n'ont pas de
                date d'embauche définie dans leur dossier. Afin de garantir l'exactitude des
                calculs, ils sont temporairement masqués de la liste des salaires à payer. Veuillez
                aller dans la "Liste du personnel" et mettre à jour leur dossier.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center">
            <Calculator className="w-8 h-8 animate-spin text-red-400 mb-2" />
            Recherche des salaires impayés en cours...
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-red-50 text-red-800 border-b border-red-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Mois</th>
                    <th className="px-4 py-3 font-semibold">Employé</th>
                    <th className="px-4 py-3 font-semibold">Poste / Type</th>
                    <th className="px-4 py-3 font-semibold text-right">Salaire Brut Base</th>
                    <th className="px-4 py-3 font-semibold text-right">Déductions</th>
                    <th className="px-4 py-3 font-semibold text-right text-base">Net à Payer</th>
                    <th className="px-4 py-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unpaidData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                          <AlertTriangle className="w-12 h-12 text-green-300 mb-3" />
                          <span className="text-lg font-medium text-gray-700">
                            Aucun salaire impayé.
                          </span>
                          <span className="text-sm">
                            Tout le personnel est à jour pour la période sélectionnée !
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    unpaidData.map((row, idx) => {
                      const p = row.person
                      const c = row.calc

                      const totalDeductions =
                        (c.details.absencesDeduction || 0) +
                        c.cnapsDeduction +
                        c.irsaDeduction +
                        c.advancesTotal +
                        c.customDeductionsTotal

                      // Format YYYY-MM to Month YYYY
                      const [yyyy, mm] = row.month.split('-')
                      const monthName = new Date(parseInt(yyyy), parseInt(mm) - 1).toLocaleString(
                        'fr-FR',
                        { month: 'long', year: 'numeric' }
                      )

                      return (
                        <tr
                          key={`${p.id}-${row.month}-${idx}`}
                          className="hover:bg-red-50/30 transition"
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium text-red-700 capitalize">{monthName}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{p.last_name}</div>
                            <div className="text-xs text-gray-500">{p.first_name}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div>{p.position || '-'}</div>
                            <div className="text-xs text-gray-500 bg-gray-100 inline-block px-2 py-0.5 rounded-full mt-1">
                              {p.salary_type === 'monthly' ? 'Mensuel' : 'Horaire'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {c.details.baseSalary.toLocaleString('fr-MG')} Ar
                          </td>
                          <td className="px-4 py-3 text-right text-red-600">
                            -{totalDeductions.toLocaleString('fr-MG')} Ar
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-base text-red-700">
                            {c.netSalary.toLocaleString('fr-MG')} Ar
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              size="sm"
                              className="bg-red-500 hover:bg-red-600 text-white"
                              onClick={() =>
                                navigate(`/personnel/${p.id}?tab=salaire&month=${row.month}`)
                              }
                            >
                              Régler <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {unpaidData.length > 0 && (
                  <tfoot className="bg-red-50 font-bold border-t-2 border-red-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-right text-red-900 text-lg">
                        TOTAL RESTE À PAYER :
                      </td>
                      <td className="px-4 py-4 text-right text-red-700 text-xl whitespace-nowrap">
                        {totalNet.toLocaleString('fr-MG')} Ar
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
