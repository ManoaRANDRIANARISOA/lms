/**
 * PersonnelDetail.tsx — Détail d'un membre du personnel
 *
 * Onglets : Informations, Heures, Absences, Salaire
 *
 * @module pages/personnel/PersonnelDetail
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { useAuthStore } from '@/store/useAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Edit, Trash2, Save } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import AttendanceCalendar from '@/components/personnel/AttendanceCalendar'

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

const LEVEL_LABELS: Record<string, string> = {
  preschool: 'Préscolaire',
  primary: 'Primaire',
  middle: 'Collège',
  high: 'Lycée',
  multi: 'Multi-niveaux'
}

const TABS = ['Informations', 'Pointage', 'Absences', 'Salaire']

export default function PersonnelDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)

  const {
    currentPerson, timeTracking, absences, advances, deductions,
    salaryCalculation, loading, getPerson, calculateSalary,
    createAbsence, createAdvance, createDeduction, markAdvanceRepaid, createSalaryExpense
  } = usePersonnelStore()

  const [activeTab, setActiveTab] = useState('Informations')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Formulaire avances
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().split('T')[0])
  const [advanceReason, setAdvanceReason] = useState('')
  const [advanceMsg, setAdvanceMsg] = useState('')

  // Formulaire déductions personnalisées
  const [deductionMonth, setDeductionMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [deductionLabel, setDeductionLabel] = useState('')
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionMsg, setDeductionMsg] = useState('')

  // Formulaire absences
  const [absenceStart, setAbsenceStart] = useState('')
  const [absenceEnd, setAbsenceEnd] = useState('')
  const [absenceReason, setAbsenceReason] = useState('leave')
  const [absenceJustified, setAbsenceJustified] = useState(true)
  const [absenceMsg, setAbsenceMsg] = useState('')

  useEffect(() => {
    if (id) getPerson(id)
  }, [id])

  useEffect(() => {
    if (id && activeTab === 'Salaire') {
      calculateSalary(id, currentMonth)
    }
  }, [id, activeTab, currentMonth])

  if (!currentPerson) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{loading ? 'Chargement...' : 'Personnel introuvable'}</p>
      </div>
    )
  }

  const p = currentPerson

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="personnel" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/personnel')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{p.last_name} {p.first_name}</h1>
        </div>
        {canWrite('personnel') && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/personnel/${id}/edit`)}>
              <Edit className="w-4 h-4 mr-1" /> Modifier
            </Button>
            <Button variant="destructive" size="sm" onClick={() => {
              if (confirm(`Supprimer ${p.last_name} ${p.first_name} ?`)) {
                usePersonnelStore.getState().deletePerson(p.id)
                navigate('/personnel')
              }
            }}>
              <Trash2 className="w-4 h-4 mr-1" /> Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Contenu onglet */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        {activeTab === 'Informations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Identité</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Nom :</span> {p.last_name}</p>
                <p><span className="font-medium">Prénom :</span> {p.first_name}</p>
                <p><span className="font-medium">Téléphone :</span> {p.contact || '-'}</p>
                <p><span className="font-medium">Email :</span> {p.email || '-'}</p>
                <p><span className="font-medium">Adresse :</span> {p.address || '-'}</p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Professionnel</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Poste :</span> {POSITION_LABELS[p.position || ''] || p.position || '-'}</p>
                <p><span className="font-medium">Statut :</span> {STATUS_LABELS[p.status || ''] || p.status || '-'}</p>
                <p><span className="font-medium">Date d'embauche :</span> {p.hire_date || '-'}</p>
                {p.departure_date && <p><span className="font-medium">Date de départ :</span> {p.departure_date}</p>}
                {p.teacher_level && <p><span className="font-medium">Niveau :</span> {LEVEL_LABELS[p.teacher_level] || p.teacher_level}</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Rémunération</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Type :</span> {p.salary_type === 'monthly' ? 'Mensuel' : p.salary_type === 'hourly' ? 'Horaire' : '-'}</p>
                {p.monthly_salary && <p><span className="font-medium">Salaire mensuel :</span> {p.monthly_salary.toLocaleString('fr-MG')} Ar</p>}
                {p.hourly_rate && <p><span className="font-medium">Taux horaire :</span> {p.hourly_rate.toLocaleString('fr-MG')} Ar</p>}
                <p><span className="font-medium">CNAPS :</span> {(p.cnaps_rate || 0) * 100}%</p>
                <p><span className="font-medium">IRSA :</span> {(p.irsa_rate || 0) * 100}%</p>
                {p.has_droit && <p><span className="font-medium">Droit :</span> {(p.droit_amount || 0).toLocaleString('fr-MG')} Ar</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Pointage' && (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Pointage journalier</h3>
              <p className="text-xs text-gray-500 mb-4">
                Cliquez sur un jour pour marquer la présence ou l'absence. Le calcul du salaire se base sur les heures réellement pointées.
                {currentPerson?.salary_type === 'monthly' && ' Pour les mensuels, le salaire est calculé sur un quota d\'heures : les heures manquantes sont déduites, les heures supplémentaires sont payées.'}
              </p>
              <AttendanceCalendar
                personnelId={id!}
                salaryType={currentPerson?.salary_type}
                expectedMonthlyHours={currentPerson?.expected_monthly_hours}
                dailyHours={currentPerson?.daily_hours}
                workPattern={currentPerson?.work_pattern}
                workDays={currentPerson?.work_days}
                canWrite={canWrite('personnel')}
              />
            </div>

            {/* Historique time_tracking (legacy display for reference) */}
            {timeTracking.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Ancien historique mensuel (time tracking)</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Mois</th>
                      <th className="px-4 py-2 text-left">Heures travaillées</th>
                      <th className="px-4 py-2 text-left">Commentaire</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {timeTracking.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-2">{t.month}</td>
                        <td className="px-4 py-2">{t.hours_worked}h</td>
                        <td className="px-4 py-2">{t.edit_reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Absences' && (
          <div className="space-y-6">
            {/* Formulaire nouvelle absence */}
            {canWrite('personnel') && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Nouvelle absence</h3>
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                  <p className="font-medium">Impact sur le salaire :</p>
                  {currentPerson?.salary_type === 'monthly' && currentPerson?.monthly_salary ? (
                    <p>Chaque jour d'absence sera automatiquement déduit du salaire mensuel ({(currentPerson.monthly_salary / 30).toLocaleString('fr-MG')} Ar/jour estimé).</p>
                  ) : currentPerson?.salary_type === 'hourly' && currentPerson?.hourly_rate ? (
                    <p>Pour les employés horaires, réduisez le nombre d'heures saisies dans l'onglet "Heures" pour refléter l'absence (estimation : {currentPerson.hourly_rate * 8} Ar/jour).</p>
                  ) : (
                    <p>Cette absence impactera automatiquement le calcul du salaire.</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Date de début *</Label>
                    <Input type="date" value={absenceStart} onChange={(e) => setAbsenceStart(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Date de fin *</Label>
                    <Input type="date" value={absenceEnd} onChange={(e) => setAbsenceEnd(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Motif</Label>
                    <select
                      value={absenceReason}
                      onChange={(e) => setAbsenceReason(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="leave">Congé</option>
                      <option value="sick">Maladie</option>
                      <option value="unjustified">Non justifiée</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      id="justified"
                      type="checkbox"
                      checked={absenceJustified}
                      onChange={(e) => setAbsenceJustified(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="justified" className="text-xs mb-0">Justifiée</Label>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={async () => {
                    if (!absenceStart || !absenceEnd) {
                      setAbsenceMsg('Dates requises.')
                      return
                    }
                    if (new Date(absenceEnd) < new Date(absenceStart)) {
                      setAbsenceMsg('La date de fin doit être après la date de début.')
                      return
                    }
                    const success = await createAbsence({
                      personnel_id: id,
                      start_date: absenceStart,
                      end_date: absenceEnd,
                      reason: absenceReason,
                      justified: absenceJustified
                    })
                    if (success) {
                      setAbsenceMsg('Absence enregistrée.')
                      setAbsenceStart('')
                      setAbsenceEnd('')
                    } else {
                      setAbsenceMsg('Erreur.')
                    }
                  }}>
                    <Save className="w-4 h-4 mr-1" />
                    Enregistrer
                  </Button>
                  {absenceMsg && <span className={`text-sm ${absenceMsg.includes('enregistrée') ? 'text-green-600' : 'text-red-600'}`}>{absenceMsg}</span>}
                </div>
              </div>
            )}

            {/* Historique des absences */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Historique des absences</h3>
              {absences.length === 0 ? (
                <p className="text-muted-foreground">Aucune absence enregistrée.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Début</th>
                      <th className="px-4 py-2 text-left">Fin</th>
                      <th className="px-4 py-2 text-left">Motif</th>
                      <th className="px-4 py-2 text-left">Justifiée</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {absences.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2">{a.start_date}</td>
                        <td className="px-4 py-2">{a.end_date}</td>
                        <td className="px-4 py-2">{a.reason || '-'}</td>
                        <td className="px-4 py-2">{a.justified ? 'Oui' : 'Non'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Salaire' && (
          <div className="space-y-6">
            {/* Calcul du salaire */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">Calcul du salaire</h3>
                <div className="flex items-center gap-2">
                  <Label>Mois :</Label>
                  <Input
                    type="month"
                    value={currentMonth}
                    onChange={(e) => setCurrentMonth(e.target.value)}
                    className="w-40"
                  />
                </div>
              </div>

              {salaryCalculation ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between border-b pb-2">
                      <span>Salaire brut de base</span>
                      <span className="font-medium">{salaryCalculation.details.baseSalary.toLocaleString('fr-MG')} Ar</span>
                    </div>
                    {salaryCalculation.details.hoursWorked && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Heures travaillées</span>
                        <span>{salaryCalculation.details.hoursWorked}h × {salaryCalculation.details.hourlyRate?.toLocaleString('fr-MG')} Ar</span>
                      </div>
                    )}
                    {salaryCalculation.details.absencesDeduction && salaryCalculation.details.absencesDeduction > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Déduction absences</span>
                        <span>-{salaryCalculation.details.absencesDeduction.toLocaleString('fr-MG')} Ar</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg pt-2">
                      <span>Salaire brut</span>
                      <span>{salaryCalculation.grossSalary.toLocaleString('fr-MG')} Ar</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-red-600">
                      <span>CNAPS ({((p.cnaps_rate || 0.01) * 100).toFixed(0)}%)</span>
                      <span>-{salaryCalculation.cnapsDeduction.toLocaleString('fr-MG')} Ar</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>IRSA ({((p.irsa_rate || 0.01) * 100).toFixed(0)}%)</span>
                      <span>-{salaryCalculation.irsaDeduction.toLocaleString('fr-MG')} Ar</span>
                    </div>
                    {salaryCalculation.droitDeduction > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Droit</span>
                        <span>-{salaryCalculation.droitDeduction.toLocaleString('fr-MG')} Ar</span>
                      </div>
                    )}
                    {salaryCalculation.advancesTotal > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Avances non remboursées</span>
                        <span>-{salaryCalculation.advancesTotal.toLocaleString('fr-MG')} Ar</span>
                      </div>
                    )}
                    {salaryCalculation.customDeductionsTotal > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Déductions personnalisées</span>
                        <span>-{salaryCalculation.customDeductionsTotal.toLocaleString('fr-MG')} Ar</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-xl text-green-700 pt-2 border-t">
                      <span>Salaire net</span>
                      <span>{salaryCalculation.netSalary.toLocaleString('fr-MG')} Ar</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Sélectionnez un mois pour voir le calcul.</p>
              )}
            </div>

            {/* Explications déductions auto */}
            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">Comment est calculé le salaire :</p>
              {p.salary_type === 'monthly' && p.monthly_salary ? (
                <div className="space-y-2">
                  <p><strong>Type mensuel (calcul hybride)</strong> : le salaire est basé sur un <strong>quota d'heures</strong> fixé sur le profil ({p.expected_monthly_hours || 'non défini'}h/mois).</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Taux horaire équivalent = {salaryCalculation?.details.hourlyEquivalentRate ? salaryCalculation.details.hourlyEquivalentRate.toLocaleString('fr-MG') : '...'} Ar/h</li>
                    <li>Heures faites ce mois = {salaryCalculation?.details.hoursWorked || 0}h</li>
                    <li>Heures attendues = {salaryCalculation?.details.expectedHours || p.expected_monthly_hours || '...'}h</li>
                    {salaryCalculation && salaryCalculation.details.absencesDeduction ? (
                      <li><strong>Déduction (sous-quota)</strong> : -{salaryCalculation.details.absencesDeduction.toLocaleString('fr-MG')} Ar</li>
                    ) : salaryCalculation && salaryCalculation.details.overtimePay ? (
                      <li><strong>Heures supplémentaires</strong> : +{salaryCalculation.details.overtimePay.toLocaleString('fr-MG')} Ar</li>
                    ) : (
                      <li>Pas de déduction ni d'heures supplémentaires.</li>
                    )}
                  </ul>
                  <p className="text-xs text-blue-700">Les heures sont comptabilisées depuis le <strong>pointage journalier</strong> (onglet Pointage). Chaque jour pointé comme "Présent", "En retard" ou "Demi-journée" compte ses heures. Les jours "Absents" ou non pointés comptent 0h.</p>
                </div>
              ) : p.salary_type === 'hourly' && p.hourly_rate ? (
                <div className="space-y-2">
                  <p><strong>Type horaire</strong> : salaire = heures travaillées × taux horaire ({p.hourly_rate.toLocaleString('fr-MG')} Ar/h).</p>
                  <p className="text-xs text-blue-700">Les heures sont comptabilisées depuis le <strong>pointage journalier</strong> (onglet Pointage). Si aucun pointage n'existe pour un mois, l'ancien total mensuel (time tracking) est utilisé comme fallback.</p>
                </div>
              ) : (
                <p>Type de salaire non défini.</p>
              )}
              <p className="mt-2 font-semibold">Déductions automatiques : CNAPS ({((p.cnaps_rate || 0.01) * 100).toFixed(0)}%), IRSA ({((p.irsa_rate || 0.01) * 100).toFixed(0)}%) {p.has_droit ? ', Droit' : ''}</p>
            </div>

            {/* Validation paiement → Finance */}
            {salaryCalculation && canWrite('personnel') && (
              <div className="bg-green-50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-green-800">Validation du paiement</h3>
                <p className="text-xs text-green-700">En validant, une entrée sera créée automatiquement dans le <strong>Journal de Caisse</strong> (module Finance) comme une dépense "Salaire". Vous pourrez l'éditer ensuite dans Finance.</p>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!confirm(`Valider le paiement de ${salaryCalculation.netSalary.toLocaleString('fr-MG')} Ar pour ${currentMonth} ?\n\nUne dépense sera créée dans le Journal de Caisse.`)) return
                    await createSalaryExpense(id!, currentMonth, salaryCalculation.netSalary, `Salaire ${p.first_name} ${p.last_name} - ${currentMonth}`)
                  }}
                >
                  <Save className="w-4 h-4 mr-1" />
                  Valider et payer
                </Button>
              </div>
            )}

            {/* Section Avances */}
            {canWrite('personnel') && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Nouvelle avance sur salaire</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Montant (Ar)</Label>
                    <Input type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="50000" />
                  </div>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Motif</Label>
                    <Input value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)} placeholder="Urgence médicale..." />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={async () => {
                    if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
                      setAdvanceMsg('Montant invalide.')
                      return
                    }
                    const success = await createAdvance({
                      personnel_id: id,
                      amount: parseFloat(advanceAmount),
                      advance_date: advanceDate,
                      reason: advanceReason || null
                    })
                    if (success) {
                      setAdvanceMsg('Avance enregistrée.')
                      setAdvanceAmount('')
                      setAdvanceReason('')
                    } else {
                      setAdvanceMsg('Erreur.')
                    }
                  }}>
                    <Save className="w-4 h-4 mr-1" />
                    Enregistrer avance
                  </Button>
                  {advanceMsg && <span className={`text-sm ${advanceMsg.includes('succès') || advanceMsg.includes('enregistrée') ? 'text-green-600' : 'text-red-600'}`}>{advanceMsg}</span>}
                </div>
              </div>
            )}

            {/* Liste avances non remboursées */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Avances non remboursées</h3>
              {advances.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune avance en cours.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Montant</th>
                      <th className="px-3 py-2 text-left">Motif</th>
                      {canWrite('personnel') && <th className="px-3 py-2 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {advances.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">{a.advance_date}</td>
                        <td className="px-3 py-2 font-medium">{a.amount.toLocaleString('fr-MG')} Ar</td>
                        <td className="px-3 py-2">{a.reason || '-'}</td>
                        {canWrite('personnel') && (
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" onClick={async () => {
                              if (confirm(`Marquer l'avance de ${a.amount.toLocaleString('fr-MG')} Ar comme remboursée ?`)) {
                                await markAdvanceRepaid(a.id, new Date().toISOString().split('T')[0])
                              }
                            }}>
                              Rembourser
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Section Déductions personnalisées */}
            {canWrite('personnel') && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Nouvelle déduction personnalisée</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Mois</Label>
                    <Input type="month" value={deductionMonth} onChange={(e) => setDeductionMonth(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Libellé</Label>
                    <Input value={deductionLabel} onChange={(e) => setDeductionLabel(e.target.value)} placeholder="Retard, dommage..." />
                  </div>
                  <div>
                    <Label className="text-xs">Montant (Ar)</Label>
                    <Input type="number" value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} placeholder="10000" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={async () => {
                    if (!deductionLabel || !deductionAmount || parseFloat(deductionAmount) <= 0) {
                      setDeductionMsg('Libellé et montant requis.')
                      return
                    }
                    const success = await createDeduction({
                      personnel_id: id,
                      month: deductionMonth,
                      label: deductionLabel,
                      amount: parseFloat(deductionAmount)
                    })
                    if (success) {
                      setDeductionMsg('Déduction enregistrée.')
                      setDeductionLabel('')
                      setDeductionAmount('')
                    } else {
                      setDeductionMsg('Erreur.')
                    }
                  }}>
                    <Save className="w-4 h-4 mr-1" />
                    Enregistrer déduction
                  </Button>
                  {deductionMsg && <span className={`text-sm ${deductionMsg.includes('enregistrée') ? 'text-green-600' : 'text-red-600'}`}>{deductionMsg}</span>}
                </div>
              </div>
            )}

            {/* Liste déductions */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Déductions personnalisées enregistrées</h3>
              {deductions.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune déduction.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Mois</th>
                      <th className="px-3 py-2 text-left">Libellé</th>
                      <th className="px-3 py-2 text-left">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {deductions.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">{d.month}</td>
                        <td className="px-3 py-2">{d.label}</td>
                        <td className="px-3 py-2 font-medium text-red-600">-{d.amount.toLocaleString('fr-MG')} Ar</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
