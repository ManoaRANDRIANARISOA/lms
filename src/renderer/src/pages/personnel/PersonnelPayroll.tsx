import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calculator, ArrowRight, Receipt } from 'lucide-react'
import type { SalaryCalculation, Personnel } from '@shared/types'

export default function PersonnelPayroll(): React.JSX.Element {
  const { personnel, fetchPersonnel } = usePersonnelStore()
  const navigate = useNavigate()

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [payrollData, setPayrollData] = useState<{person: any, calc: SalaryCalculation | null}[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPersonnel()
  }, [])

  useEffect(() => {
    async function computeAll() {
      setLoading(true)
      const data: { person: Personnel; calc: SalaryCalculation }[] = []
      for (const p of personnel) {
        if (p.status === 'parttime' || p.status === 'fulltime') {
          const res = await window.api.personnel.calculateSalary(p.id, currentMonth)
          if (res.success && res.calculation) {
            data.push({ person: p, calc: res.calculation })
          }
        }
      }
      setPayrollData(data)
      setLoading(false)
    }
    if (personnel.length > 0) {
      computeAll()
    }
  }, [personnel, currentMonth])

  const totalNet = payrollData.reduce((sum, item) => sum + (item.calc?.netSalary || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-indigo-600" />
            Paie Globale & Règlements
          </h1>
          <p className="text-sm text-gray-500 mt-1">Générez et validez la paie de tout le personnel pour un mois donné.</p>
        </div>
        <div className="flex items-center gap-3">
          <Label className="font-medium text-gray-700">Mois :</Label>
          <Input 
            type="month" 
            value={currentMonth} 
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center">
            <Calculator className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            Calcul des salaires en cours...
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employé</th>
                    <th className="px-4 py-3 font-medium">Poste / Type</th>
                    <th className="px-4 py-3 font-medium text-right">Salaire Brut Base</th>
                    <th className="px-4 py-3 font-medium text-right">Heures (Mensuels)</th>
                    <th className="px-4 py-3 font-medium text-right text-red-600">Déductions (Abs/Av/CNAPS)</th>
                    <th className="px-4 py-3 font-medium text-right text-green-700 text-base">Net à Payer</th>
                    <th className="px-4 py-3 font-medium text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payrollData.length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-gray-500">Aucun personnel éligible.</td></tr>
                  ) : payrollData.map((row) => {
                    const p = row.person
                    const c = row.calc
                    if (!c) return null
                    
                    const totalDeductions = (c.details.absencesDeduction || 0) + c.cnapsDeduction + c.irsaDeduction + c.advancesTotal + c.customDeductionsTotal

                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{p.last_name}</div>
                          <div className="text-xs text-gray-500">{p.first_name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{p.position || '-'}</div>
                          <div className="text-xs text-indigo-600 bg-indigo-50 inline-block px-2 py-0.5 rounded-full mt-1">
                            {p.salary_type === 'monthly' ? 'Mensuel' : 'Horaire'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {c.details.baseSalary.toLocaleString('fr-MG')} Ar
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.salary_type === 'monthly' ? (
                            <span className={c.details.hoursWorked && c.details.hoursWorked < (p.expected_monthly_hours || 160) ? 'text-red-600' : 'text-green-600'}>
                              {c.details.hoursWorked}h / {p.expected_monthly_hours || 160}h
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">
                          -{totalDeductions.toLocaleString('fr-MG')} Ar
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-base text-green-700">
                          {c.netSalary.toLocaleString('fr-MG')} Ar
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="outline" className="text-indigo-600 hover:text-indigo-700" onClick={() => navigate(`/personnel/${p.id}`)}>
                            Détails <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-indigo-50/50 font-bold border-t-2 border-indigo-100">
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-right text-indigo-900 text-lg">
                      TOTAL NET À PAYER ({currentMonth}) :
                    </td>
                    <td className="px-4 py-4 text-right text-green-700 text-xl whitespace-nowrap">
                      {totalNet.toLocaleString('fr-MG')} Ar
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
