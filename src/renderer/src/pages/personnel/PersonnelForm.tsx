/**
 * PersonnelForm.tsx — Formulaire d'ajout / modification de personnel
 *
 * @module pages/personnel/PersonnelForm
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save } from 'lucide-react'

export default function PersonnelForm(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id

  const { currentPerson, loading, error, createPerson, updatePerson, getPerson } = usePersonnelStore()

  const [formData, setFormData] = useState<Record<string, any>>({
    first_name: '',
    last_name: '',
    contact: '',
    email: '',
    address: '',
    status: 'fulltime',
    position: 'teacher',
    hire_date: new Date().toISOString().split('T')[0],
    departure_date: '',
    teacher_level: '',
    teacher_subjects: '[]',
    salary_type: 'monthly',
    monthly_salary: '',
    hourly_rate: '',
    has_droit: false,
    droit_amount: '',
    cnaps_rate: 0.01,
    cnaps_amount: '',
    irsa_rate: 0.01,
    irsa_amount: '',
    expected_monthly_hours: '',
    work_pattern: 'daily',
    work_days: '["Monday","Tuesday","Wednesday","Thursday","Friday"]',
    daily_hours: ''
  })

  // UI state for toggles
  const [cnapsType, setCnapsType] = useState<'rate' | 'amount'>('rate')
  const [irsaType, setIrsaType] = useState<'rate' | 'amount'>('rate')

  useEffect(() => {
    if (isEdit && id) {
      getPerson(id)
    }
  }, [isEdit, id])

  useEffect(() => {
    if (isEdit && currentPerson) {
      setFormData({
        ...currentPerson,
        teacher_subjects: JSON.stringify(currentPerson.teacher_subjects || []),
        monthly_salary: currentPerson.monthly_salary || '',
        hourly_rate: currentPerson.hourly_rate || '',
        droit_amount: currentPerson.droit_amount || '',
        has_droit: currentPerson.has_droit ? true : false,
        cnaps_amount: currentPerson.cnaps_amount || '',
        irsa_amount: currentPerson.irsa_amount || '',
        expected_monthly_hours: currentPerson.expected_monthly_hours || '',
        work_pattern: currentPerson.work_pattern || 'daily',
        work_days: JSON.stringify(currentPerson.work_days || ["Monday","Tuesday","Wednesday","Thursday","Friday"]),
        daily_hours: currentPerson.daily_hours || ''
      })
      if (currentPerson.cnaps_amount !== undefined && currentPerson.cnaps_amount !== null) setCnapsType('amount')
      if (currentPerson.irsa_amount !== undefined && currentPerson.irsa_amount !== null) setIrsaType('amount')
    }
  }, [isEdit, currentPerson])

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = { ...formData }
    // Parse JSON
    if (payload.teacher_subjects && typeof payload.teacher_subjects === 'string') {
      try {
        payload.teacher_subjects = JSON.parse(payload.teacher_subjects)
      } catch {
        payload.teacher_subjects = []
      }
    }
    // Convert numbers — empty strings become null (not NaN)
    payload.monthly_salary = payload.monthly_salary ? parseFloat(payload.monthly_salary) : null
    payload.hourly_rate = payload.hourly_rate ? parseFloat(payload.hourly_rate) : null
    payload.droit_amount = payload.droit_amount ? parseFloat(payload.droit_amount) : null
    
    // CNAPS
    if (cnapsType === 'rate') {
      payload.cnaps_rate = payload.cnaps_rate ? parseFloat(payload.cnaps_rate) : 0.01
      payload.cnaps_amount = null
    } else {
      payload.cnaps_amount = payload.cnaps_amount ? parseFloat(payload.cnaps_amount) : 0
      payload.cnaps_rate = null
    }

    // IRSA
    if (irsaType === 'rate') {
      payload.irsa_rate = payload.irsa_rate ? parseFloat(payload.irsa_rate) : 0.01
      payload.irsa_amount = null
    } else {
      payload.irsa_amount = payload.irsa_amount ? parseFloat(payload.irsa_amount) : 0
      payload.irsa_rate = null
    }

    payload.has_droit = payload.has_droit ? true : false
    payload.expected_monthly_hours = payload.expected_monthly_hours ? parseFloat(payload.expected_monthly_hours) : null
    payload.daily_hours = payload.daily_hours ? parseFloat(payload.daily_hours) : null
    if (payload.work_days && typeof payload.work_days === 'string') {
      try {
        payload.work_days = JSON.parse(payload.work_days)
      } catch {
        payload.work_days = ["Monday","Tuesday","Wednesday","Thursday","Friday"]
      }
    }

    let success = false
    if (isEdit && id) {
      success = await updatePerson(id, payload)
    } else {
      success = await createPerson(payload)
    }
    if (success) {
      navigate('/personnel')
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/personnel')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? 'Modifier le membre' : 'Nouveau membre'}
        </h1>
      </div>

      {error && <p className="text-red-600 bg-red-50 p-3 rounded">{error}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
        {/* Informations personnelles */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Informations personnelles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="last_name">Nom *</Label>
              <Input id="last_name" value={formData.last_name} onChange={(e) => handleChange('last_name', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="first_name">Prénom *</Label>
              <Input id="first_name" value={formData.first_name} onChange={(e) => handleChange('first_name', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="contact">Téléphone</Label>
              <Input id="contact" value={formData.contact} onChange={(e) => handleChange('contact', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Professionnel */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Informations professionnelles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="position">Poste *</Label>
              <select
                id="position"
                value={formData.position}
                onChange={(e) => handleChange('position', e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="teacher">Enseignant</option>
                <option value="admin">Administration</option>
                <option value="direction">Direction</option>
                <option value="maintenance">Maintenance</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div>
              <Label htmlFor="status">Statut</Label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="fulltime">Temps plein</option>
                <option value="parttime">Temps partiel</option>
              </select>
            </div>
            <div>
              <Label htmlFor="hire_date">Date d'embauche *</Label>
              <Input id="hire_date" type="date" value={formData.hire_date} onChange={(e) => handleChange('hire_date', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="departure_date">Date de départ</Label>
              <Input id="departure_date" type="date" value={formData.departure_date} onChange={(e) => handleChange('departure_date', e.target.value)} />
            </div>
            {formData.position === 'teacher' && (
              <>
                <div>
                  <Label htmlFor="teacher_level">Niveau d'enseignement</Label>
                  <select
                    id="teacher_level"
                    value={formData.teacher_level}
                    onChange={(e) => handleChange('teacher_level', e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    <option value="preschool">Préscolaire</option>
                    <option value="primary">Primaire</option>
                    <option value="middle">Collège</option>
                    <option value="high">Lycée</option>
                    <option value="multi">Multi-niveaux</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="teacher_subjects">Matières (JSON array)</Label>
                  <Input id="teacher_subjects" value={formData.teacher_subjects} onChange={(e) => handleChange('teacher_subjects', e.target.value)} placeholder='["Mathématiques", "Français"]' />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Rémunération */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Rémunération</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salary_type">Type de salaire</Label>
              <select
                id="salary_type"
                value={formData.salary_type}
                onChange={(e) => handleChange('salary_type', e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="monthly">Mensuel</option>
                <option value="hourly">Horaire</option>
              </select>
            </div>
            {formData.salary_type === 'monthly' ? (
              <div>
                <Label htmlFor="monthly_salary">Salaire mensuel (Ar)</Label>
                <Input id="monthly_salary" type="number" value={formData.monthly_salary} onChange={(e) => handleChange('monthly_salary', e.target.value)} />
              </div>
            ) : (
              <div>
                <Label htmlFor="hourly_rate">Taux horaire (Ar)</Label>
                <Input id="hourly_rate" type="number" value={formData.hourly_rate} onChange={(e) => handleChange('hourly_rate', e.target.value)} />
              </div>
            )}

            {/* Planning de travail */}
            <div className="md:col-span-2 bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Planning de travail</h3>
              <p className="text-xs text-gray-500">Ces informations servent au calcul du salaire et au pointage. Le type "mensuel" utilise un quota d'heures ; le type "horaire" se base sur les heures réellement pointées.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="work_pattern">Fréquence de présence</Label>
                  <select
                    id="work_pattern"
                    value={formData.work_pattern}
                    onChange={(e) => handleChange('work_pattern', e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="daily">Tous les jours (quotidien)</option>
                    <option value="weekly">Certains jours de la semaine</option>
                    <option value="monthly">Quota mensuel uniquement</option>
                    <option value="custom">Personnalisé (saisie manuelle)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="daily_hours">Heures par jour de travail</Label>
                  <Input id="daily_hours" type="number" step="0.5" value={formData.daily_hours} onChange={(e) => handleChange('daily_hours', e.target.value)} placeholder="ex: 8" />
                </div>
                <div>
                  <Label htmlFor="expected_monthly_hours">Quota mensuel d'heures</Label>
                  <Input id="expected_monthly_hours" type="number" step="0.5" value={formData.expected_monthly_hours} onChange={(e) => handleChange('expected_monthly_hours', e.target.value)} placeholder="ex: 160" />
                  <p className="text-xs text-gray-500 mt-1">Pour les mensuels : salaire ÷ quota = taux horaire équivalent. Les heures manquantes sont déduites, les heures supplémentaires sont payées.</p>
                </div>
                {formData.work_pattern === 'weekly' && (
                  <div className="md:col-span-2">
                    <Label className="mb-2 block">Jours de travail</Label>
                    <div className="flex flex-wrap gap-3">
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day) => (
                        <label key={day} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={(() => {
                              try { return JSON.parse(formData.work_days || '[]').includes(day) } catch { return false }
                            })()}
                            onChange={(e) => {
                              const current = (() => { try { return JSON.parse(formData.work_days || '[]') } catch { return [] } })()
                              const next = e.target.checked ? [...current, day] : current.filter((d: string) => d !== day)
                              handleChange('work_days', JSON.stringify(next))
                            }}
                            className="h-4 w-4"
                          />
                          {day === 'Monday' ? 'Lun' : day === 'Tuesday' ? 'Mar' : day === 'Wednesday' ? 'Mer' : day === 'Thursday' ? 'Jeu' : day === 'Friday' ? 'Ven' : day === 'Saturday' ? 'Sam' : 'Dim'}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label htmlFor="cnaps_rate">Déduction CNaPS</Label>
                <select 
                  className="text-xs border rounded p-1"
                  value={cnapsType}
                  onChange={(e) => setCnapsType(e.target.value as 'rate' | 'amount')}
                >
                  <option value="rate">Pourcentage (%)</option>
                  <option value="amount">Montant Fixe (Ar)</option>
                </select>
              </div>
              {cnapsType === 'rate' ? (
                <Input id="cnaps_rate" type="number" step="0.01" value={formData.cnaps_rate} onChange={(e) => handleChange('cnaps_rate', e.target.value)} placeholder="ex: 0.01 pour 1%" />
              ) : (
                <Input id="cnaps_amount" type="number" value={formData.cnaps_amount} onChange={(e) => handleChange('cnaps_amount', e.target.value)} placeholder="Montant en Ar" />
              )}
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label htmlFor="irsa_rate">Déduction IRSA</Label>
                <select 
                  className="text-xs border rounded p-1"
                  value={irsaType}
                  onChange={(e) => setIrsaType(e.target.value as 'rate' | 'amount')}
                >
                  <option value="rate">Pourcentage (%)</option>
                  <option value="amount">Montant Fixe (Ar)</option>
                </select>
              </div>
              {irsaType === 'rate' ? (
                <Input id="irsa_rate" type="number" step="0.01" value={formData.irsa_rate} onChange={(e) => handleChange('irsa_rate', e.target.value)} placeholder="ex: 0.01 pour 1%" />
              ) : (
                <Input id="irsa_amount" type="number" value={formData.irsa_amount} onChange={(e) => handleChange('irsa_amount', e.target.value)} placeholder="Montant en Ar" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="has_droit"
                type="checkbox"
                checked={formData.has_droit}
                onChange={(e) => handleChange('has_droit', e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="has_droit" className="mb-0">A droit de logement / autres</Label>
            </div>
            {formData.has_droit && (
              <div>
                <Label htmlFor="droit_amount">Montant du droit (Ar)</Label>
                <Input id="droit_amount" type="number" value={formData.droit_amount} onChange={(e) => handleChange('droit_amount', e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" type="button" onClick={() => navigate('/personnel')}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </div>
  )
}
