/**
 * SubjectManager.tsx — Gestion des matières
 *
 * @module pages/grades/SubjectManager
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGradeStore } from '@/store/useGradeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2, Edit, Save, Settings } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

export default function SubjectManager(): React.JSX.Element {
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)
  const { subjects, fetchSubjects, createSubject, updateSubject, deleteSubject, loading, error } = useGradeStore()

  const [newName, setNewName] = useState('')
  const [newCoef, setNewCoef] = useState('1')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCoef, setEditCoef] = useState('1')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchSubjects()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) {
      setMsg('Le nom de la matière est requis.')
      return
    }
    const coef = parseFloat(newCoef) || 1
    const ok = await createSubject({ name: newName.trim(), default_coefficient: coef })
    if (ok) {
      setNewName('')
      setNewCoef('1')
      setMsg('Matière ajoutée.')
    } else {
      setMsg('Erreur lors de la création.')
    }
  }

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditName(s.name)
    setEditCoef(String(s.default_coefficient ?? 1))
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return
    const ok = await updateSubject(id, { name: editName.trim(), default_coefficient: parseFloat(editCoef) || 1 })
    if (ok) {
      setEditingId(null)
      setMsg('Matière mise à jour.')
    } else {
      setMsg('Erreur lors de la mise à jour.')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer la matière "${name}" ?\n\nAttention : les notes associées ne seront plus visibles.`)) return
    const ok = await deleteSubject(id)
    if (ok) {
      setMsg('Matière supprimée.')
    } else {
      setMsg('Erreur lors de la suppression.')
    }
  }

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="grades" />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/grades')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Gestion des matières
        </h1>
      </div>

      {error && <p className="text-red-600 bg-red-50 p-3 rounded">{error}</p>}
      {msg && <p className={`p-3 rounded ${msg.includes('Erreur') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>{msg}</p>}

      {/* Formulaire nouvelle matière */}
      {canWrite('grades') && (
        <div className="bg-white rounded-xl border shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <Label>Nom de la matière</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ex: Mathématiques"
            />
          </div>
          <div>
            <Label>Coefficient par défaut</Label>
            <Input
              type="number"
              step="0.5"
              min={0.5}
              value={newCoef}
              onChange={(e) => setNewCoef(e.target.value)}
              placeholder="1"
            />
          </div>
          <div>
            <Button onClick={handleCreate} disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Matière</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Coef. défaut</th>
              {canWrite('grades') && <th className="px-4 py-3 text-right font-medium text-gray-600 w-32">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {subjects.length === 0 && (
              <tr>
                <td colSpan={canWrite('grades') ? 3 : 2} className="px-4 py-8 text-center text-muted-foreground">
                  Aucune matière enregistrée.
                  {canWrite('grades') && ' Utilisez le formulaire ci-dessus pour en ajouter.'}
                </td>
              </tr>
            )}
            {subjects.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {editingId === s.id ? (
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full" />
                  ) : (
                    <span className="font-medium">{s.name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {editingId === s.id ? (
                    <Input
                      type="number"
                      step="0.5"
                      min={0.5}
                      value={editCoef}
                      onChange={(e) => setEditCoef(e.target.value)}
                      className="w-20 mx-auto"
                    />
                  ) : (
                    <span className="text-muted-foreground">{s.default_coefficient ?? 1}</span>
                  )}
                </td>
                {canWrite('grades') && (
                  <td className="px-4 py-3 text-right">
                    {editingId === s.id ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Annuler</Button>
                        <Button size="sm" onClick={() => handleUpdate(s.id)}>
                          <Save className="w-4 h-4 mr-1" />
                          Enregistrer
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(s.id, s.name)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
