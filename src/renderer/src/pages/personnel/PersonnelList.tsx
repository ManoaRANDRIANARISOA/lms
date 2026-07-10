/**
 * PersonnelList.tsx — Liste du Personnel
 *
 * Affiche tous les employés avec recherche et filtres.
 * Permet de créer, modifier, supprimer (soft-delete) et voir le détail.
 *
 * @module pages/personnel/PersonnelList
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { useAuthStore } from '@/store/useAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, Trash2, Eye, Edit, Download, Receipt } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { POSITION_LABELS, STATUS_LABELS } from '@/lib/personnel-constants'

export default function PersonnelList(): React.JSX.Element {
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)
  const { personnel, loading, error, fetchPersonnel } = usePersonnelStore()

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('active') // 'active', 'inactive', 'all'
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().substring(0, 7))
  const [payrollSummary, setPayrollSummary] = useState<
    Record<
      string,
      {
        isPaid: boolean
        isIgnored: boolean
        grossSalary: number
        netSalary: number
        hasWorked: boolean
      }
    >
  >({})

  useEffect(() => {
    fetchPersonnel()
  }, [fetchPersonnel])

  useEffect(() => {
    const checkPaie = async () => {
      try {
        const res = await window.api.personnel.getPayrollSummary(currentMonth)
        console.log('--- checkPaie RES ---', currentMonth, res)
        if (res.success && res.summary) {
          setPayrollSummary(res.summary)
        }
      } catch (e) {
        console.error('Erreur chargement paie:', e)
      }
    }
    checkPaie()
  }, [currentMonth, personnel])

  const handleSearch = () => {
    fetchPersonnel({ search, position: positionFilter })
  }

  const filtered = personnel.filter((p) => {
    const matchSearch =
      !search ||
      p.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.contact?.includes(search)
    const matchPosition = !positionFilter || p.position === positionFilter

    let matchActive = true
    if (activeFilter === 'active') matchActive = !p.departure_date
    if (activeFilter === 'inactive') matchActive = !!p.departure_date

    return matchSearch && matchPosition && matchActive
  })

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="personnel" />

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Gestion du Personnel</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const result = await window.api.personnel.list()
              const personnel = result?.personnel || []
              await window.api.export.csv(
                personnel as unknown as Record<string, unknown>[],
                [
                  { key: 'last_name', label: 'Nom' },
                  { key: 'first_name', label: 'Prénom' },
                  { key: 'position', label: 'Poste' },
                  { key: 'salary_type', label: 'Type salaire' },
                  { key: 'monthly_salary', label: 'Salaire mensuel' },
                  { key: 'phone', label: 'Téléphone' }
                ],
                'personnel_export.csv'
              )
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          {canWrite('personnel') && (
            <>
              <Button
                onClick={() => navigate('/personnel/payroll')}
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Receipt className="w-4 h-4 mr-2" />
                Paie Globale
              </Button>
              <Button onClick={() => navigate('/personnel/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Nouveau membre
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Rechercher (nom, contact...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">Tous les postes</option>
          <option value="teacher">Enseignant</option>
          <option value="admin">Administration</option>
          <option value="direction">Direction</option>
          <option value="maintenance">Maintenance</option>
          <option value="other">Autre</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="all">Tous</option>
        </select>
        <div className="flex items-center gap-2 border rounded-md px-3 py-1 bg-white ml-auto">
          <span className="text-sm text-gray-500 whitespace-nowrap">Mois de paie :</span>
          <Input
            type="month"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="w-40 h-8 border-none shadow-none focus-visible:ring-0 p-0"
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Chargement...</p>}
      {error && <p className="text-red-600 bg-red-50 p-3 rounded">{error}</p>}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="px-4 py-3 font-medium text-gray-600">Poste</th>
                <th className="px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-600">Salaire</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Paie ({currentMonth})
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {p.last_name} {p.first_name}
                        {p.departure_date && (
                          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full border">
                            Inactif
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {POSITION_LABELS[p.position || ''] || p.position || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {STATUS_LABELS[p.status || ''] || p.status || '-'}
                    </td>
                    <td className="px-4 py-3">{p.contact || '-'}</td>
                    <td className="px-4 py-3">
                      {p.salary_type === 'monthly' && p.monthly_salary
                        ? `${p.monthly_salary.toLocaleString('fr-MG')} Ar/mois`
                        : p.salary_type === 'hourly' && p.hourly_rate
                          ? `${p.hourly_rate.toLocaleString('fr-MG')} Ar/h`
                          : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const summary = p.id ? payrollSummary[p.id] : null
                        const isPaid = summary?.isPaid || false
                        const isIgnored = summary?.isIgnored || false
                        const hasWorked = summary?.hasWorked || false
                        const grossSalary = summary?.grossSalary || 0

                        const [y, m] = currentMonth.split('-')
                        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
                        const monthStart = `${currentMonth}-01`
                        const monthEnd = `${currentMonth}-${lastDay}`

                        const isNotHiredYet = p.hire_date && p.hire_date > monthEnd
                        const hasLeftBefore = p.departure_date && p.departure_date < monthStart

                        // Si l'employé a travaillé ou a un salaire brut calculé pour ce mois, on l'affiche coûte que coûte (réalité du travail)
                        if (!hasWorked && grossSalary === 0) {
                          // Sinon, si on est en dehors de ses dates de contrat, on masque
                          if (isNotHiredYet || hasLeftBefore) {
                            return <span className="text-gray-400">-</span>
                          }
                        }

                        if (isIgnored) {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border">
                              Ignoré
                            </span>
                          )
                        } else if (isPaid) {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Payé
                            </span>
                          )
                        } else {
                          return (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Non Payé
                            </span>
                          )
                        }
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/personnel/${p.id}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canWrite('personnel') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/personnel/${p.id}/edit`)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => {
                                if (confirm(`Supprimer ${p.last_name} ${p.first_name} ?`)) {
                                  usePersonnelStore.getState().deletePerson(p.id)
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Aucun membre du personnel trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
