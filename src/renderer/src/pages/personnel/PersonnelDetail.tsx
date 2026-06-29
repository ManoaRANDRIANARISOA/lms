/**
 * PersonnelDetail.tsx — Détail d'un membre du personnel
 *
 * Onglets : Informations, Heures, Absences, Salaire
 *
 * @module pages/personnel/PersonnelDetail
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { useAuthStore } from '@/store/useAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Edit,
  Trash2,
  Save,
  Download,
  User,
  Briefcase,
  CreditCard,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  DollarSign,
  Info,
  Check
} from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import AttendanceCalendar from '@/components/personnel/AttendanceCalendar'
import { POSITION_LABELS, STATUS_LABELS, LEVEL_LABELS } from '@/lib/personnel-constants'

const TABS = ['Informations', 'Pointage', 'Salaire']

export default function PersonnelDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)

  const {
    currentPerson,
    timeTracking,
    advances,
    deductions,
    salaryCalculation,
    loading,
    getPerson,
    calculateSalary,
    createAdvance,
    createDeduction,
    deleteDeduction,
    markAdvanceRepaid,
    createSalaryExpense
  } = usePersonnelStore()

  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'salaire') return 'Salaire'
    if (tabParam === 'pointage') return 'Pointage'
    return 'Informations'
  })
  const [currentMonth, setCurrentMonth] = useState(() => {
    const monthParam = searchParams.get('month')
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) return monthParam

    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Formulaire Ajustements sur salaire (Avances & Déductions)
  const [adjustmentType, setAdjustmentType] = useState<'advance' | 'deduction'>('advance')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [adjustmentMonth, setAdjustmentMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

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
        <p className="text-muted-foreground">
          {loading ? 'Chargement...' : 'Personnel introuvable'}
        </p>
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
          <h1 className="text-2xl font-bold tracking-tight">
            {p.last_name} {p.first_name}
          </h1>
        </div>
        {canWrite('personnel') && (
          <div className="flex gap-2">
            {p.departure_date ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (confirm(`Marquer ${p.first_name} comme Actif ?`)) {
                    await usePersonnelStore.getState().updatePerson(p.id!, { departure_date: null as any })
                  }
                }}
              >
                Marquer Actif
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (confirm(`Marquer ${p.first_name} comme Inactif (départ aujourd'hui) ?`)) {
                    await usePersonnelStore.getState().updatePerson(p.id!, { departure_date: new Date().toISOString().split('T')[0] })
                  }
                }}
              >
                Marquer Inactif
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate(`/personnel/${id}/edit`)}>
              <Edit className="w-4 h-4 mr-1" /> Modifier
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Supprimer ${p.last_name} ${p.first_name} ?`)) {
                  usePersonnelStore.getState().deletePerson(p.id!)
                  navigate('/personnel')
                }
              }}
            >
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50/50 rounded-xl p-5 border border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Identité</h3>
              </div>
              <div className="space-y-3 text-sm">
                <p className="flex justify-between">
                  <span className="text-blue-700/70">Nom</span>{' '}
                  <span className="font-medium text-blue-950">{p.last_name}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-blue-700/70">Prénom</span>{' '}
                  <span className="font-medium text-blue-950">{p.first_name}</span>
                </p>
                <p className="flex items-center gap-2 text-blue-950 mt-4">
                  <Phone className="w-4 h-4 text-blue-500" /> {p.contact || '-'}
                </p>
                <p className="flex items-center gap-2 text-blue-950">
                  <Mail className="w-4 h-4 text-blue-500" /> {p.email || '-'}
                </p>
                <p className="flex items-center gap-2 text-blue-950">
                  <MapPin className="w-4 h-4 text-blue-500" /> {p.address || '-'}
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 rounded-xl p-5 border border-amber-100">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-amber-900">Professionnel</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mb-2">
                  {STATUS_LABELS[p.status || ''] || p.status || '-'}
                </div>
                <p className="flex justify-between">
                  <span className="text-amber-700/70">Poste</span>{' '}
                  <span className="font-medium text-amber-950">
                    {POSITION_LABELS[p.position || ''] || p.position || '-'}
                  </span>
                </p>
                <p className="flex justify-between items-center">
                  <span className="text-amber-700/70">Date d'embauche</span>{' '}
                  <span className="flex items-center gap-1 font-medium text-amber-950">
                    <CalendarDays className="w-3 h-3" /> {p.hire_date || '-'}
                  </span>
                </p>
                {p.departure_date && (
                  <p className="flex justify-between items-center">
                    <span className="text-amber-700/70">Date de départ</span>{' '}
                    <span className="flex items-center gap-1 font-medium text-red-600">
                      <CalendarDays className="w-3 h-3" /> {p.departure_date}
                    </span>
                  </p>
                )}
                {p.teacher_level && (
                  <p className="flex justify-between">
                    <span className="text-amber-700/70">Niveau</span>{' '}
                    <span className="font-medium text-amber-950">
                      {LEVEL_LABELS[p.teacher_level] || p.teacher_level}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="bg-emerald-50/50 rounded-xl p-5 border border-emerald-100">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-emerald-900">Rémunération</h3>
              </div>
              <div className="space-y-3 text-sm">
                <p className="flex justify-between">
                  <span className="text-emerald-700/70">Type</span>{' '}
                  <span className="font-medium text-emerald-950">
                    {p.salary_type === 'monthly'
                      ? 'Mensuel'
                      : p.salary_type === 'hourly'
                        ? 'Horaire'
                        : '-'}
                  </span>
                </p>

                {p.monthly_salary && (
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 my-2">
                    <p className="text-xs text-emerald-600 mb-1">Salaire de base</p>
                    <p className="font-bold text-lg text-emerald-950 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" /> {p.monthly_salary.toLocaleString('fr-MG')}{' '}
                      Ar
                    </p>
                  </div>
                )}
                {p.hourly_rate && (
                  <div className="p-3 bg-white rounded-lg border border-emerald-100 my-2">
                    <p className="text-xs text-emerald-600 mb-1">Taux horaire</p>
                    <p className="font-bold text-lg text-emerald-950 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" /> {p.hourly_rate.toLocaleString('fr-MG')}{' '}
                      Ar/h
                    </p>
                  </div>
                )}

                <p className="flex justify-between">
                  <span className="text-emerald-700/70">CNAPS</span>{' '}
                  <span className="font-medium text-emerald-950">
                    {p.cnaps_amount
                      ? p.cnaps_amount.toLocaleString('fr-MG') + ' Ar'
                      : (p.cnaps_rate || 0) * 100 + '%'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-emerald-700/70">IRSA</span>{' '}
                  <span className="font-medium text-emerald-950">
                    {p.irsa_amount
                      ? p.irsa_amount.toLocaleString('fr-MG') + ' Ar'
                      : (p.irsa_rate || 0) * 100 + '%'}
                  </span>
                </p>
                {p.has_droit && (
                  <p className="flex justify-between">
                    <span className="text-emerald-700/70">Droit divers</span>{' '}
                    <span className="font-medium text-emerald-950">
                      {(p.droit_amount || 0).toLocaleString('fr-MG')} Ar
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Pointage' && (
          <div className="space-y-6">
            {/* Infos sur la logique de pointage */}
            {p.salary_type === 'monthly' ? (
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg flex gap-3 text-sm">
                <Info className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Pointage par exception</p>
                  <p>
                    L'employé est payé à temps plein par défaut. Utilisez le calendrier uniquement
                    pour enregistrer les <b>absences</b> et <b>retards</b>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg flex gap-3 text-sm">
                <Info className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Pointage Hybride</p>
                  <p>
                    Vous pouvez enregistrer les heures jour par jour dans le calendrier, <b>ou</b>{' '}
                    saisir directement le total mensuel manuellement ci-dessous.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Calendrier de pointage</h3>
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

            {/* Section Forçage Horaire (seulement pour les employés horaires) */}
            {p.salary_type === 'hourly' && canWrite('personnel') && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Total mensuel manuel (Optionnel)
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Si vous n'utilisez pas le calendrier, vous pouvez forcer le total d'heures
                  effectuées pour le mois en cours. Cette valeur écrase le total du calendrier.
                </p>
                <div className="flex items-end gap-4">
                  <div>
                    <Label className="text-xs">Heures totales du mois</Label>
                    <Input
                      type="number"
                      placeholder="Ex: 45"
                      id="manualHoursInput"
                      className="w-32 bg-white"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={salaryCalculation?.isPaid}
                    onClick={async () => {
                      if (salaryCalculation?.isPaid) {
                        return alert("Ce mois est déjà payé, vous ne pouvez plus modifier le pointage.")
                      }
                      const inputEl = document.getElementById(
                        'manualHoursInput'
                      ) as HTMLInputElement
                      const val = inputEl?.value
                      if (!val) return
                      const success = await window.api.personnel.setTimeTracking({
                        personnel_id: id!,
                        month: currentMonth,
                        hours_worked: Number(val),
                        manually_edited: true,
                        edit_reason: 'Saisie manuelle'
                      })
                      if (success) {
                        alert('Total enregistré avec succès.')
                        if (inputEl) inputEl.value = ''
                        await getPerson(id!)
                      } else {
                        alert("Erreur lors de l'enregistrement.")
                      }
                    }}
                  >
                    <Save className="w-4 h-4 mr-1" /> Enregistrer le total
                  </Button>
                </div>
                {/* Historique time_tracking */}
                {timeTracking.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="text-xs font-semibold mb-2 text-gray-600">
                      Historique des saisies manuelles
                    </h4>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {timeTracking
                        .filter((t) => t.manually_edited)
                        .map((t) => (
                          <li key={t.id} className="flex justify-between max-w-sm">
                            <span>Mois : {t.month}</span>
                            <span className="font-semibold">{t.hours_worked}h</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Salaire' && (
          <div className="space-y-6">
            {/* Header and Month Selector */}
            <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
              <h3 className="text-xl font-bold tracking-tight text-gray-800">
                Fiche de Paie & Calcul
              </h3>
              <div className="flex items-center gap-3">
                <Label className="font-medium text-gray-700">Mois de paie :</Label>
                <Input
                  type="month"
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(e.target.value)}
                  className="w-48 bg-gray-50 border-gray-300 focus:bg-white"
                />
              </div>
            </div>

            {/* Main Calculation & Explication */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Calculation Details */}
              <div className="lg:col-span-2 space-y-6">
                {salaryCalculation ? (
                  <div className="bg-white rounded-xl border shadow-sm p-6">
                    <h4 className="text-lg font-semibold mb-4 border-b pb-2">Détails du Calcul</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-gray-600">
                          <span>Salaire brut de base</span>
                          <span className="font-medium">
                            {salaryCalculation.details.baseSalary.toLocaleString('fr-MG')} Ar
                          </span>
                        </div>
                        {salaryCalculation.details.hoursWorked && (
                          <div className="flex justify-between items-center text-sm text-gray-500">
                            <span>
                              Heures travaillées ({salaryCalculation.details.hoursWorked}h)
                            </span>
                            <span>
                              {salaryCalculation.details.hourlyRate?.toLocaleString('fr-MG')} Ar/h
                            </span>
                          </div>
                        )}
                        {salaryCalculation.details.absencesDeduction &&
                        salaryCalculation.details.absencesDeduction > 0 ? (
                          <div className="flex justify-between items-center text-red-600">
                            <span>Déduction absences</span>
                            <span>
                              -{salaryCalculation.details.absencesDeduction.toLocaleString('fr-MG')}{' '}
                              Ar
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between items-center font-semibold text-lg pt-3 border-t">
                          <span>Salaire brut</span>
                          <span>{salaryCalculation.grossSalary.toLocaleString('fr-MG')} Ar</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-red-600">
                          <span>CNAPS ({((p.cnaps_rate || 0.01) * 100).toFixed(0)}%)</span>
                          <span>
                            -{salaryCalculation.cnapsDeduction.toLocaleString('fr-MG')} Ar
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-red-600">
                          <span>IRSA ({((p.irsa_rate || 0.01) * 100).toFixed(0)}%)</span>
                          <span>-{salaryCalculation.irsaDeduction.toLocaleString('fr-MG')} Ar</span>
                        </div>
                        {salaryCalculation.droitDeduction > 0 && (
                          <div className="flex justify-between items-center text-red-600">
                            <span>Droit</span>
                            <span>
                              -{salaryCalculation.droitDeduction.toLocaleString('fr-MG')} Ar
                            </span>
                          </div>
                        )}
                        {salaryCalculation.advancesTotal > 0 && (
                          <div className="flex justify-between items-center text-amber-600">
                            <span>Avances non remboursées</span>
                            <span>
                              -{salaryCalculation.advancesTotal.toLocaleString('fr-MG')} Ar
                            </span>
                          </div>
                        )}
                        {salaryCalculation.customDeductionsTotal > 0 && (
                          <div className="flex justify-between items-center text-amber-600">
                            <span>Déductions personnalisées</span>
                            <span>
                              -{salaryCalculation.customDeductionsTotal.toLocaleString('fr-MG')} Ar
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center font-bold text-2xl text-green-700 pt-3 border-t-2 border-green-200">
                          <span>Salaire net</span>
                          <span>{salaryCalculation.netSalary.toLocaleString('fr-MG')} Ar</span>
                        </div>
                      </div>
                    </div>

                    {/* Validation paiement → Finance */}
                    {canWrite('personnel') && (
                      <div className="mt-8 pt-6 border-t flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50 p-4 rounded-lg">
                        <div className="text-sm">
                          <p className="font-semibold text-gray-800">Validation & Paie</p>
                          <p className="text-gray-500">
                            Génère le PDF et enregistre la dépense en Finance.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 justify-end">
                        {(() => {
                          const [y, m] = currentMonth.split('-')
                          const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate()
                          const monthStart = `${currentMonth}-01`
                          const monthEnd = `${currentMonth}-${lastDay}`
                          
                          const isNotHiredYet = p.hire_date && p.hire_date > monthEnd
                          const hasLeftBefore = p.departure_date && p.departure_date < monthStart
                          const hasWorked = salaryCalculation.details.hoursWorked !== undefined && salaryCalculation.details.hoursWorked > 0
                          const grossSalary = salaryCalculation.grossSalary

                          const isOutOfContract = (!hasWorked && grossSalary === 0) && (isNotHiredYet || hasLeftBefore)

                          if (salaryCalculation.isIgnored) {
                            return (
                              <div className="flex items-center gap-3">
                                <span className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md font-medium text-sm">
                                  Mois ignoré
                                </span>
                                <Button
                                  variant="outline"
                                  onClick={async () => {
                                    await window.api.personnel.unignoreMonth(p.id!, currentMonth)
                                    calculateSalary(p.id!, currentMonth)
                                  }}
                                >
                                  Réactiver
                                </Button>
                              </div>
                            )
                          }

                          if (isOutOfContract) {
                            return (
                              <span className="px-4 py-2 bg-gray-100 text-gray-500 rounded-md font-medium text-sm border">
                                Hors dates de contrat (Aucune saisie)
                              </span>
                            )
                          }

                          return (
                            <>
                              <Button
                                variant="outline"
                                className="border-gray-300 text-gray-600 hover:bg-gray-100"
                                onClick={async () => {
                                  if (confirm(`Ignorer la paie de ${p.first_name} pour ${currentMonth} ?`)) {
                                    await window.api.personnel.ignoreMonth(p.id!, currentMonth)
                                    calculateSalary(p.id!, currentMonth)
                                  }
                                }}
                              >
                                Ignorer
                              </Button>

                              <Button
                                variant="outline"
                                onClick={async () => {
                                  const result = await window.api.pdf.generatePayslip(
                                    {
                                      first_name: p.first_name,
                                      last_name: p.last_name,
                                      position: p.position || '',
                                      month: currentMonth
                                    },
                                    {
                                      gross_salary: salaryCalculation.grossSalary,
                                      cnaps: salaryCalculation.cnapsDeduction,
                                      ostie: 0,
                                      irsa: salaryCalculation.irsaDeduction,
                                      total_deductions:
                                        salaryCalculation.grossSalary - salaryCalculation.netSalary,
                                      net_salary: salaryCalculation.netSalary
                                    }
                                  )
                                  if (result.success && result.filePath) {
                                    await window.api.pdf.openFile(result.filePath)
                                  } else {
                                    alert(result.error || 'Erreur génération PDF')
                                  }
                                }}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Fiche PDF
                              </Button>

                              {salaryCalculation.isPaid ? (
                            <div className="flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-md font-medium text-sm border border-green-200">
                              <Check className="w-4 h-4 mr-2" />
                              Payé pour ce mois
                            </div>
                          ) : (
                            <Button
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Valider le paiement de ${salaryCalculation.netSalary.toLocaleString('fr-MG')} Ar pour ${currentMonth} ?\n\nUne dépense sera créée dans le Journal de Caisse.`
                                  )
                                )
                                  return
                                const success = await createSalaryExpense(
                                  id!,
                                  currentMonth,
                                  salaryCalculation.netSalary,
                                  `Paiement Salaire (${currentMonth}) - ${p.first_name} ${p.last_name}`
                                )
                                if (success) {
                                  alert('Paiement enregistré avec succès dans la finance.')
                                  calculateSalary(id!, currentMonth) // Rafraîchir pour afficher 'Déjà payé'
                                } else {
                                  alert("Erreur lors de l'enregistrement du paiement.")
                                }
                              }}
                            >
                              <Save className="w-4 h-4 mr-2" />
                                Valider le paiement
                              </Button>
                            )}
                          </>
                        )
                      })()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
                    Sélectionnez un mois valide pour voir le calcul du salaire.
                  </div>
                )}
              </div>

              {/* Right Column: Explications */}
              <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-6 text-sm text-blue-900 shadow-sm h-fit">
                <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-800">
                    i
                  </div>
                  Règles de calcul
                </h4>
                {p.salary_type === 'monthly' && p.monthly_salary ? (
                  <div className="space-y-3">
                    <p>
                      <strong>Type mensuel (Hybride)</strong>
                      <br />
                      Basé sur un quota de {p.expected_monthly_hours || '...'}h/mois.
                    </p>
                    <ul className="space-y-2 bg-white/60 p-3 rounded-lg border border-blue-100">
                      <li className="flex justify-between">
                        <span>Taux équivalent</span>{' '}
                        <span className="font-medium">
                          {salaryCalculation?.details.hourlyEquivalentRate?.toLocaleString(
                            'fr-MG'
                          ) || '...'}{' '}
                          Ar/h
                        </span>
                      </li>
                      <li className="flex justify-between">
                        <span>Heures faites</span>{' '}
                        <span className="font-medium">
                          {salaryCalculation?.details.hoursWorked || 0}h
                        </span>
                      </li>
                      <li className="flex justify-between">
                        <span>Heures attendues</span>{' '}
                        <span className="font-medium">
                          {salaryCalculation?.details.expectedHours ||
                            p.expected_monthly_hours ||
                            '...'}
                          h
                        </span>
                      </li>
                    </ul>
                    <p className="text-xs opacity-80 mt-2">
                      Les jours "Absents" non justifiés déduisent des heures du quota de base.
                    </p>
                  </div>
                ) : p.salary_type === 'hourly' && p.hourly_rate ? (
                  <div className="space-y-3">
                    <p>
                      <strong>Type horaire</strong>
                      <br />
                      Salaire = Heures travaillées × Taux ({p.hourly_rate.toLocaleString(
                        'fr-MG'
                      )}{' '}
                      Ar/h).
                    </p>
                    <p className="text-xs opacity-80">
                      Les heures sont issues du pointage journalier.
                    </p>
                  </div>
                ) : (
                  <p>Type de salaire non défini.</p>
                )}
              </div>
            </div>

            {/* Bottom section: Ajustements sur Salaire */}
            <div className="bg-white rounded-xl border shadow-sm mt-6 overflow-hidden flex flex-col">
              <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-indigo-900">Ajustements sur Salaire</h3>
                  <p className="text-xs text-indigo-700">
                    Avances sur salaire et déductions personnalisées (cantine, dommages, etc.)
                  </p>
                </div>
              </div>
              <div className="p-4 space-y-6">
                {canWrite('personnel') && (
                  <div className="bg-gray-50 rounded-lg p-4 border grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-2">
                      <Label className="text-xs text-gray-500">Type</Label>
                      <select
                        value={adjustmentType}
                        onChange={(e) =>
                          setAdjustmentType(e.target.value as 'advance' | 'deduction')
                        }
                        className="w-full h-9 border rounded-md px-3 text-sm"
                      >
                        <option value="advance">Avance</option>
                        <option value="deduction">Déduction</option>
                      </select>
                    </div>
                    {adjustmentType === 'advance' ? (
                      <div className="md:col-span-2">
                        <Label className="text-xs text-gray-500">Date</Label>
                        <Input
                          type="date"
                          value={adjustmentDate}
                          onChange={(e) => setAdjustmentDate(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    ) : (
                      <div className="md:col-span-2">
                        <Label className="text-xs text-gray-500">Mois d'impact</Label>
                        <Input
                          type="month"
                          value={adjustmentMonth}
                          onChange={(e) => setAdjustmentMonth(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                    <div className="md:col-span-3">
                      <Label className="text-xs text-gray-500">Motif / Libellé</Label>
                      <Input
                        value={adjustmentReason}
                        onChange={(e) => setAdjustmentReason(e.target.value)}
                        placeholder={
                          adjustmentType === 'advance' ? 'Raison...' : 'Cantine, dommage...'
                        }
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs text-gray-500">Montant (Ar)</Label>
                      <Input
                        type="number"
                        value={adjustmentAmount}
                        onChange={(e) => setAdjustmentAmount(e.target.value)}
                        placeholder="Montant..."
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Button
                        size="sm"
                        className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={async () => {
                          if (!adjustmentAmount || parseFloat(adjustmentAmount) <= 0)
                            return alert('Erreur : montant invalide')
                          if (adjustmentType === 'advance') {
                            const success = await createAdvance({
                              personnel_id: id!,
                              amount: parseFloat(adjustmentAmount),
                              advance_date: adjustmentDate!,
                              reason: adjustmentReason || undefined
                            })
                            if (success) {
                              setAdjustmentAmount('')
                              setAdjustmentReason('')
                            }
                          } else {
                            if (!adjustmentReason)
                              return alert('Erreur : libellé requis pour une déduction')
                            if (adjustmentMonth === currentMonth && salaryCalculation?.isPaid) {
                              return alert("Erreur : La fiche de paie de ce mois est déjà validée, vous ne pouvez plus y ajouter de déductions.")
                            }
                            const success = await createDeduction({
                              personnel_id: id!,
                              month: adjustmentMonth!,
                              label: adjustmentReason!,
                              amount: parseFloat(adjustmentAmount)
                            })
                            if (success) {
                              setAdjustmentAmount('')
                              setAdjustmentReason('')
                            }
                          }
                        }}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Ajouter
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Liste Avances */}
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2 flex items-center justify-between">
                      <span>Avances non remboursées</span>
                      <span className="text-sm bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        {advances.reduce((acc, a) => acc + a.amount, 0).toLocaleString('fr-MG')} Ar
                      </span>
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Date</th>
                            <th className="px-3 py-2 font-medium">Motif</th>
                            <th className="px-3 py-2 font-medium">Montant</th>
                            <th className="px-3 py-2 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {advances.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                                Aucune avance en cours.
                              </td>
                            </tr>
                          ) : (
                            advances.map((a) => (
                              <tr key={a.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{a.advance_date}</td>
                                <td className="px-3 py-2 text-gray-600">{a.reason || '-'}</td>
                                <td className="px-3 py-2 font-semibold text-amber-700">
                                  {a.amount.toLocaleString('fr-MG')}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {canWrite('personnel') && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-green-600 hover:text-green-700"
                                      onClick={async () => {
                                        if (
                                          confirm(
                                            `Marquer l'avance de ${a.amount} Ar comme remboursée ?`
                                          )
                                        )
                                          await markAdvanceRepaid(
                                            a.id,
                                            new Date().toISOString().split('T')[0]
                                          )
                                      }}
                                    >
                                      Rembourser
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Liste Déductions */}
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2 flex items-center justify-between">
                      <span>Déductions personnalisées ({currentMonth})</span>
                      <span className="text-sm bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                        {deductions.reduce((acc, d) => acc + d.amount, 0).toLocaleString('fr-MG')}{' '}
                        Ar
                      </span>
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Libellé</th>
                            <th className="px-3 py-2 font-medium text-right">Montant</th>
                            <th className="px-3 py-2 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {deductions.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                                Aucune déduction ce mois.
                              </td>
                            </tr>
                          ) : (
                            deductions.map((d) => (
                              <tr key={d.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-600">{d.label}</td>
                                <td className="px-3 py-2 font-semibold text-red-600 text-right">
                                  {d.amount.toLocaleString('fr-MG')}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {canWrite('personnel') && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                      onClick={async () => {
                                        if (confirm('Supprimer cette déduction ?'))
                                          await deleteDeduction(d.id)
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
