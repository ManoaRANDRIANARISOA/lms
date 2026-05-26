/**
 * DashboardPage.tsx — Tableau de bord principal
 *
 * Affiche les KPIs clés de l'école :
 *   - Élèves, paiements, finances, personnel
 *   - Tendance des paiements (30 jours)
 *   - Prochains événements
 *   - Activité récente
 *
 * @module pages/DashboardPage
 */

import React, { useEffect, useState } from 'react'
import {
  Users, Wallet, AlertTriangle, TrendingUp, CalendarDays,
  School, CreditCard, UserPlus
} from 'lucide-react'

// Types locaux (seront déplacés dans shared/types.ts si réutilisés)
interface DashboardStats {
  students: {
    total: number
    newThisMonth: number
    byClass: { class: string; count: number }[]
  }
  payments: {
    today: number
    thisWeek: number
    thisMonth: number
    allTime: number
  }
  finances: {
    totalDue: number
    totalPaid: number
    balance: number
    unpaidCount: number
  }
  personnel: {
    total: number
  }
  events: {
    id: string
    name: string
    event_date: string
    amount_per_parent: number
    status: string
  }[]
  activity: {
    recentPayments: {
      id: string
      amount: number
      payment_date: string
      payment_type: string
      first_name: string
      last_name: string
      class: string
    }[]
    recentEnrollments: {
      id: string
      first_name: string
      last_name: string
      class: string
      enrollment_date: string
      created_at: string
    }[]
  }
  trend: { date: string; total: number }[]
}

// Format monétaire MGA (Ariary)
function formatMGA(amount: number): string {
  return new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// --------------------------------------------
// KPI Card Component
// --------------------------------------------
function KpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  colorClass = 'bg-primary'
}: {
  icon: React.ElementType
  label: string
  value: string
  subValue?: string
  colorClass?: string
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 flex items-start gap-4">
      <div className={`${colorClass} text-white p-3 rounded-lg`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subValue && <p className="text-xs text-green-600 mt-1">{subValue}</p>}
      </div>
    </div>
  )
}

// --------------------------------------------
// Payment Trend Chart (simple SVG bars)
// --------------------------------------------
function PaymentTrendChart({ data }: { data: { date: string; total: number }[] }) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data.map((d) => d.total), 1)
  const height = 120
  const barWidth = Math.max(4, 280 / data.length)

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        Tendance des paiements (30 jours)
      </h3>
      <div className="flex items-end gap-1 h-[140px] overflow-x-auto no-scrollbar">
        {data.map((item, i) => {
          const barHeight = (item.total / max) * height
          return (
            <div key={i} className="flex flex-col items-center gap-1" style={{ minWidth: barWidth }}>
              <div
                className="bg-primary/80 rounded-t-sm w-full"
                style={{ height: `${barHeight}px` }}
                title={`${formatDate(item.date)} : ${formatMGA(item.total)}`}
              />
              <span className="text-[10px] text-muted-foreground rotate-45 origin-left translate-y-2">
                {formatDate(item.date)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --------------------------------------------
// Main Dashboard Page
// --------------------------------------------
export default function DashboardPage(): React.JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadStats() {
      try {
        const result = await window.api.dashboard.getStats()
        if (result.success && result.data) {
          setStats(result.data as unknown as DashboardStats)
        } else {
          setError(result.error || 'Erreur de chargement')
        }
      } catch (e: any) {
        setError(e.message || 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-destructive mb-2">Erreur de chargement</h2>
          <p className="text-muted-foreground">{error || 'Impossible de charger les statistiques'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">
          Vue d'ensemble de l'établissement — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Élèves inscrits"
          value={stats.students.total.toString()}
          subValue={`+${stats.students.newThisMonth} ce mois`}
          colorClass="bg-blue-600"
        />
        <KpiCard
          icon={Wallet}
          label="Paiements aujourd'hui"
          value={formatMGA(stats.payments.today)}
          subValue={`Semaine : ${formatMGA(stats.payments.thisWeek)}`}
          colorClass="bg-emerald-600"
        />
        <KpiCard
          icon={CreditCard}
          label="Paiements ce mois"
          value={formatMGA(stats.payments.thisMonth)}
          colorClass="bg-emerald-500"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Impayés"
          value={formatMGA(stats.finances.balance)}
          subValue={`${stats.finances.unpaidCount} élèves concernés`}
          colorClass="bg-amber-600"
        />
        <KpiCard
          icon={School}
          label="Personnel actif"
          value={stats.personnel.total.toString()}
          colorClass="bg-indigo-600"
        />
        <KpiCard
          icon={TrendingUp}
          label="Total perçu (tout temps)"
          value={formatMGA(stats.payments.allTime)}
          colorClass="bg-sky-600"
        />
      </div>

      {/* Middle Section: Chart + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PaymentTrendChart data={stats.trend} />
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Prochains événements
          </h3>
          {stats.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun événement à venir</p>
          ) : (
            <ul className="space-y-3">
              {stats.events.map((evt) => (
                <li key={evt.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{evt.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(evt.event_date)}</p>
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    {evt.amount_per_parent > 0 ? formatMGA(evt.amount_per_parent) : 'Gratuit'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom Section: Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Payments */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Derniers paiements
          </h3>
          {stats.activity.recentPayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun paiement récent</p>
          ) : (
            <ul className="space-y-3">
              {stats.activity.recentPayments.map((p) => (
                <li key={p.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{p.last_name} {p.first_name}</p>
                    <p className="text-xs text-muted-foreground">{p.class} — {formatDate(p.payment_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-emerald-700">{formatMGA(p.amount)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{p.payment_type}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Enrollments */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Dernières inscriptions
          </h3>
          {stats.activity.recentEnrollments.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune inscription récente</p>
          ) : (
            <ul className="space-y-3">
              {stats.activity.recentEnrollments.map((s) => (
                <li key={s.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{s.last_name} {s.first_name}</p>
                    <p className="text-xs text-muted-foreground">{s.class}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(s.enrollment_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
