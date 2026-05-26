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
import { Search, Plus, Trash2, Eye, Edit } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

const POSITION_LABELS: Record<string, string> = {
  teacher: 'Enseignant',
  admin: 'Administration',
  direction: 'Direction',
  maintenance: 'Maintenance',
  other: 'Autre'
}

const STATUS_LABELS: Record<string, string> = {
  fulltime: 'Temps plein',
  parttime: 'Temps partiel'
}

export default function PersonnelList(): React.JSX.Element {
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)
  const { personnel, loading, error, fetchPersonnel } = usePersonnelStore()

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')

  useEffect(() => {
    fetchPersonnel()
  }, [fetchPersonnel])

  const handleSearch = () => {
    fetchPersonnel({ search, position: positionFilter })
  }

  const filtered = personnel.filter((p) => {
    const matchSearch = !search || (
      p.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.contact?.includes(search)
    )
    const matchPosition = !positionFilter || p.position === positionFilter
    return matchSearch && matchPosition
  })

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="personnel" />

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Gestion du Personnel</h1>
        {canWrite('personnel') && (
          <Button onClick={() => navigate('/personnel/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nouveau membre
          </Button>
        )}
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
        <Button variant="outline" onClick={handleSearch}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Chargement...</p>}
      {error && <p className="text-red-600 bg-red-50 p-3 rounded">{error}</p>}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nom</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Poste</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Salaire</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.last_name} {p.first_name}</div>
                </td>
                <td className="px-4 py-3">{POSITION_LABELS[p.position || ''] || p.position || '-'}</td>
                <td className="px-4 py-3">{STATUS_LABELS[p.status || ''] || p.status || '-'}</td>
                <td className="px-4 py-3">{p.contact || '-'}</td>
                <td className="px-4 py-3">
                  {p.salary_type === 'monthly' && p.monthly_salary
                    ? `${p.monthly_salary.toLocaleString('fr-MG')} Ar/mois`
                    : p.salary_type === 'hourly' && p.hourly_rate
                      ? `${p.hourly_rate.toLocaleString('fr-MG')} Ar/h`
                      : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/personnel/${p.id}`)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canWrite('personnel') && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/personnel/${p.id}/edit`)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                          if (confirm(`Supprimer ${p.last_name} ${p.first_name} ?`)) {
                            usePersonnelStore.getState().deletePerson(p.id)
                          }
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun membre du personnel trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
