/**
 * AttendanceCalendar.tsx — Calendrier de pointage journalier
 *
 * Affiche un mois en grille avec les statuts de présence.
 * Permet la saisie/modification par jour via un modal.
 * Affiche une barre de progression du quota pour les employés mensuels.
 *
 * @module components/personnel/AttendanceCalendar
 */

import React, { useState, useMemo } from 'react'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle, Coffee, Briefcase } from 'lucide-react'

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  present: { label: 'Présent', color: 'bg-green-100 text-green-700 border-green-300', icon: <CheckCircle className="w-3 h-3" /> },
  absent: { label: 'Absent', color: 'bg-red-100 text-red-700 border-red-300', icon: <XCircle className="w-3 h-3" /> },
  late: { label: 'En retard', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: <AlertCircle className="w-3 h-3" /> },
  half_day: { label: 'Demi-journée', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: <Coffee className="w-3 h-3" /> },
  excused: { label: 'Abs. justifiée', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: <AlertCircle className="w-3 h-3" /> },
  paid_leave: { label: 'Congé payé', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: <Briefcase className="w-3 h-3" /> },
}

interface AttendanceCalendarProps {
  personnelId: string
  salaryType: 'monthly' | 'hourly' | undefined
  expectedMonthlyHours?: number
  dailyHours?: number
  workPattern?: string
  workDays?: string[]
  canWrite: boolean
}

export default function AttendanceCalendar({
  personnelId,
  salaryType,
  expectedMonthlyHours,
  dailyHours,
  workPattern,
  workDays,
  canWrite
}: AttendanceCalendarProps): React.JSX.Element {
  const { dailyAttendance, fetchMonthlyAttendance, setAttendance, deleteAttendance } = usePersonnelStore()

  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1)
  const [modalDate, setModalDate] = useState<string | null>(null)
  const [modalStatus, setModalStatus] = useState('present')
  const [modalHours, setModalHours] = useState('')
  const [modalNotes, setModalNotes] = useState('')

  React.useEffect(() => {
    fetchMonthlyAttendance(personnelId, currentYear, currentMonth)
  }, [personnelId, currentYear, currentMonth])

  const attendanceMap = useMemo(() => {
    const map: Record<string, any> = {}
    for (const a of dailyAttendance) {
      map[a.attendance_date] = a
    }
    return map
  }, [dailyAttendance])

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay()

  const totalHoursWorked = useMemo(() => {
    return dailyAttendance.reduce((sum, a) => {
      if (a.status === 'paid_leave') return sum + (a.expected_hours || dailyHours || 8)
      return sum + (a.hours_worked || 0)
    }, 0)
  }, [dailyAttendance, dailyHours])

  const expectedHoursForMonth = useMemo(() => {
    if (salaryType === 'monthly' && expectedMonthlyHours) return expectedMonthlyHours
    if (workPattern === 'monthly' || workPattern === 'custom') return expectedMonthlyHours || 160

    const wd = (workDays && workDays.length > 0) ? workDays : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const dh = dailyHours || 8
    let count = 0
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(currentYear, currentMonth - 1, day)
      if (wd.includes(FULL_DAY_NAMES[d.getDay()])) count++
    }
    return count * dh
  }, [salaryType, expectedMonthlyHours, workPattern, workDays, dailyHours, daysInMonth, currentYear, currentMonth])

  const progressPct = expectedHoursForMonth > 0 ? Math.min(100, Math.round((totalHoursWorked / expectedHoursForMonth) * 100)) : 0

  const openModal = (day: number) => {
    if (!canWrite) return
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const existing = attendanceMap[dateStr]
    setModalDate(dateStr)
    setModalStatus(existing?.status || 'present')
    setModalHours(existing?.hours_worked ? String(existing.hours_worked) : '')
    setModalNotes(existing?.notes || '')
  }

  const closeModal = () => setModalDate(null)

  const saveModal = async () => {
    if (!modalDate) return
    const dh = dailyHours || 8
    let hours = parseFloat(modalHours) || 0
    if (modalStatus === 'present' && !hours) hours = dh
    if (modalStatus === 'half_day' && !hours) hours = dh / 2
    if (modalStatus === 'absent') hours = 0
    if (modalStatus === 'paid_leave') hours = dh

    await setAttendance({
      personnel_id: personnelId,
      attendance_date: modalDate,
      status: modalStatus,
      hours_worked: hours,
      expected_hours: dh,
      notes: modalNotes || null
    })
    closeModal()
  }

  const handleDelete = async () => {
    if (!modalDate) return
    const existing = attendanceMap[modalDate]
    if (existing?.id) {
      await deleteAttendance(existing.id)
    }
    closeModal()
  }

  const prevMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const monthLabel = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      {/* Header mois + navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="font-semibold capitalize min-w-[140px] text-center">{monthLabel}</span>
          <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="text-sm text-gray-500 flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {totalHoursWorked.toFixed(1)}h / {expectedHoursForMonth.toFixed(1)}h
        </div>
      </div>

      {/* Barre de progression (mensuels uniquement) */}
      {salaryType === 'monthly' && (
        <div className="bg-blue-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between mb-1">
            <span className="font-medium text-blue-800">Progression du quota mensuel</span>
            <span className="text-blue-800">{progressPct}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-blue-700 mt-1">
            {totalHoursWorked < expectedHoursForMonth
              ? `Il manque ${(expectedHoursForMonth - totalHoursWorked).toFixed(1)}h pour atteindre le quota. Cette différence sera déduite du salaire.`
              : totalHoursWorked > expectedHoursForMonth
              ? `Surplus de ${(totalHoursWorked - expectedHoursForMonth).toFixed(1)}h. Ces heures supplémentaires seront payées.`
              : 'Quota atteint. Pas de déduction ni d\'heures supplémentaires.'}
          </p>
        </div>
      )}

      {/* Légende */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className={`flex items-center gap-1 px-2 py-1 rounded border ${cfg.color}`}>
            {cfg.icon}
            <span>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Grille calendrier */}
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {DAY_NAMES.map(d => (
          <div key={d} className="font-semibold text-gray-500 py-1">{d}</div>
        ))}
        {Array.from({ length: firstDayOfWeek }, (_, i) => (
          <div key={`empty-${i}`} className="h-20" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const attendance = attendanceMap[dateStr]
          const status = attendance?.status
          const cfg = status ? STATUS_CONFIG[status] : null
          const isToday = dateStr === new Date().toISOString().split('T')[0]

          return (
            <button
              key={day}
              onClick={() => openModal(day)}
              disabled={!canWrite}
              className={`h-20 border rounded-md flex flex-col items-center justify-center gap-1 transition hover:shadow-sm
                ${cfg ? cfg.color : 'bg-white text-gray-700 border-gray-200'}
                ${isToday ? 'ring-2 ring-blue-500' : ''}
                ${!canWrite ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              <span className="font-semibold">{day}</span>
              {cfg && <span className="scale-90">{cfg.icon}</span>}
              {attendance && (
                <span className="text-[10px] leading-tight">{attendance.hours_worked}h</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Modal pointage */}
      {modalDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">Pointage du {new Date(modalDate).toLocaleDateString('fr-FR')}</h3>

            <div>
              <Label>Statut</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setModalStatus(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition
                      ${modalStatus === key ? cfg.color + ' ring-2 ring-offset-1' : 'bg-white border-gray-200 hover:bg-gray-50'}
                    `}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="modalHours">Heures effectuées</Label>
              <Input
                id="modalHours"
                type="number"
                step="0.5"
                value={modalHours}
                onChange={(e) => setModalHours(e.target.value)}
                placeholder={`ex: ${dailyHours || 8}`}
              />
              <p className="text-xs text-gray-500 mt-1">
                Pré-rempli selon le statut. Vous pouvez l'ajuster (ex: demi-journée = {((dailyHours || 8) / 2).toFixed(1)}h).
              </p>
            </div>

            <div>
              <Label htmlFor="modalNotes">Notes</Label>
              <Input id="modalNotes" value={modalNotes} onChange={(e) => setModalNotes(e.target.value)} placeholder="Observation..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {attendanceMap[modalDate] && (
                <Button variant="destructive" onClick={handleDelete}>
                  Supprimer
                </Button>
              )}
              <Button variant="outline" onClick={closeModal}>Annuler</Button>
              <Button onClick={saveModal}>
                <CheckCircle className="w-4 h-4 mr-1" />
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
