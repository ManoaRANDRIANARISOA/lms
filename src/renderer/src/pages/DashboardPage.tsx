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
  Users,
  Wallet,
  AlertTriangle,
  TrendingUp,
  CalendarDays,
  School,
  CreditCard,
  UserPlus
} from 'lucide-react'

// Types locaux (seront déplacés dans shared/types.ts si réutilisés)
interface DashboardStats {
  schoolYear: string
  students: {
    totalRegistered: number
    totalEnrolled: number
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
  return new Intl.NumberFormat('fr-MG', {
    style: 'currency',
    currency: 'MGA',
    maximumFractionDigits: 0
  }).format(amount)
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
  subValue?: React.ReactNode
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
        {subValue && <div className="text-xs mt-1">{subValue}</div>}
      </div>
    </div>
  )
}

// --------------------------------------------
// Payment Trend Chart (simple SVG bars)
// --------------------------------------------
function PaymentTrendChart({ data }: { data: { date: string; total: number }[] }) {
  if (!data || data.length === 0) return null

  const minVal = Math.min(...data.map((d) => d.total), 0)
  const maxVal = Math.max(...data.map((d) => d.total), 0)
  const range = Math.max(maxVal - minVal, 1)

  // Position du zéro (en pourcentage réel du graphique)
  const zeroPercent = (Math.abs(minVal) / range) * 100

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 flex flex-col h-[280px]">
      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 flex-shrink-0">
        <TrendingUp className="w-5 h-5 text-primary" />
        Tendance financière (30 jours)
      </h3>
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <div className="flex justify-start gap-8 px-1 relative h-full min-w-full pt-2">
          {/* Zero Line Dynamique */}
          <div className="absolute left-0 right-0 top-2 bottom-[30px] pointer-events-none z-0">
            {/* L'espace de 20px en haut et en bas correspond au py-[20px] de la zone graphique */}
            <div className="absolute top-[20px] bottom-[20px] left-0 right-0">
              <div
                className="absolute left-0 right-0 border-t border-dashed border-border"
                style={{ bottom: `${zeroPercent}%` }}
              />
            </div>
          </div>

          {data.map((item, i) => {
            const barHeightPct = (Math.abs(item.total) / range) * 100
            const isNegative = item.total < 0
            const d = new Date(item.date)
            const shortDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
            const compactVal = new Intl.NumberFormat('fr-MG', { notation: 'compact' }).format(
              item.total
            )

            return (
              <div
                key={i}
                className="flex flex-col h-full flex-1 max-w-[50px] min-w-[30px] group relative z-10 flex-shrink-0"
              >
                {/* Zone Graphique avec padding pour laisser la place aux labels */}
                <div className="flex-1 relative w-full py-[20px]">
                  <div className="relative w-full h-full">
                    {/* Tooltip au hover */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-secondary text-secondary-foreground text-xs font-semibold py-1 px-2 rounded-md whitespace-nowrap z-50 pointer-events-none shadow-md">
                      {formatMGA(item.total)}
                    </div>

                    <div
                      className="absolute w-full flex flex-col items-center"
                      style={{
                        height: `${Math.max(barHeightPct, 1)}%`,
                        bottom: isNegative
                          ? `calc(${zeroPercent}% - ${Math.max(barHeightPct, 1)}%)`
                          : `${zeroPercent}%`
                      }}
                    >
                      {!isNegative ? (
                        <>
                          {item.total > 0 && (
                            <span className="text-[10px] text-primary/80 font-bold whitespace-nowrap absolute -top-5">
                              {compactVal}
                            </span>
                          )}
                          <div className="bg-primary/50 group-hover:bg-primary transition-colors rounded-t-sm w-full h-full cursor-pointer" />
                        </>
                      ) : (
                        <>
                          <div className="bg-destructive/50 group-hover:bg-destructive transition-colors rounded-b-sm w-full h-full cursor-pointer" />
                          <span className="text-[10px] text-destructive/80 font-bold whitespace-nowrap absolute -bottom-5">
                            {compactVal}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Zone Date */}
                <div className="h-[30px] flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground font-medium">{shortDate}</span>
                </div>
              </div>
            )
          })}
        </div>
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
          <p className="text-muted-foreground">
            {error || 'Impossible de charger les statistiques'}
          </p>
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
          Vue d'ensemble de l'établissement —{' '}
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label={`Élèves inscrits (${stats.schoolYear})`}
          value={stats.students.totalEnrolled.toString()}
          subValue={
            <div className="flex flex-col gap-0.5 mt-0.5">
              <span className="text-blue-600 font-medium">
                {stats.students.totalRegistered} enregistrés au total
              </span>
              <span className="text-green-600">
                +{stats.students.newThisMonth} inscrits ce mois
              </span>
            </div>
          }
          colorClass="bg-blue-600"
        />
        <KpiCard
          icon={Wallet}
          label="Paiements aujourd'hui"
          value={formatMGA(stats.payments.today)}
          subValue={
            <span className="text-green-600">Semaine : {formatMGA(stats.payments.thisWeek)}</span>
          }
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
          subValue={
            <span className="text-amber-700">{stats.finances.unpaidCount} élèves concernés</span>
          }
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
                <li
                  key={evt.id}
                  className="flex justify-between items-center border-b pb-2 last:border-0"
                >
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
                <li
                  key={p.id}
                  className="flex justify-between items-center border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {p.last_name} {p.first_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.class} — {formatDate(p.payment_date)}
                    </p>
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
                <li
                  key={s.id}
                  className="flex justify-between items-center border-b pb-2 last:border-0"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {s.last_name} {s.first_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.class}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(s.enrollment_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
