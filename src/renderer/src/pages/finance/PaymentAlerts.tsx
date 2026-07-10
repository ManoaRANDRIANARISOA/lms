import { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useClasses } from '@/lib/useClasses'
import { cn } from '@/lib/utils'
import { ExternalLink, Search, Filter, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { useAppStore } from '@/store/useAppStore'

interface UnpaidItem {
  type: string
  description: string
  amount: number
}

interface UnpaidStudent {
  student_id: string
  first_name: string
  last_name: string
  class_name: string
  unpaid_items: UnpaidItem[]
  total_due: number
}

// Composant pour l'affichage groupé des impayés d'un élève
function UnpaidItemsGrouped({ items }: { items: UnpaidItem[] }) {
  const [expanded, setExpanded] = useState(false)

  // Grouper par type
  const grouped = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const type = item.type
        if (!acc[type]) acc[type] = []
        acc[type].push(item)
        return acc
      },
      {} as Record<string, UnpaidItem[]>
    )
  }, [items])

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      tuition: 'Écolage',
      bus: 'Transport',
      canteen: 'Cantine',
      event: 'Événement'
    }
    return labels[type] || type
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      tuition: 'bg-rose-50 text-rose-700 border-rose-200',
      bus: 'bg-amber-50 text-amber-700 border-amber-200',
      canteen: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      event: 'bg-purple-50 text-purple-700 border-purple-200'
    }
    return colors[type] || 'bg-gray-50 text-gray-700 border-gray-200'
  }

  // Si moins de 3 types différents, on affiche tout par défaut
  const entries = Object.entries(grouped)
  const isLarge = items.length > 3

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {entries.map(([type, typeItems]) => (
          <div
            key={type}
            className={cn(
              'px-2.5 py-1.5 border rounded-md text-xs flex flex-col gap-1 shadow-sm',
              getTypeColor(type)
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold uppercase tracking-wider text-[10px] opacity-80">
                {getTypeLabel(type)} ({typeItems.length})
              </span>
            </div>

            {expanded || !isLarge ? (
              <div className="flex flex-wrap gap-1 mt-1 max-w-[200px]">
                {typeItems.map((item, idx) => {
                  // Nettoyer la description (ex: "Écolage (2026-01)" -> "2026-01")
                  const match = item.description.match(/\((.*?)\)/)
                  let displayStr = match ? match[1] : item.description

                  // Formater la date si c'est au format YYYY-MM
                  if (/^\d{4}-\d{2}$/.test(displayStr)) {
                    const [year, month] = displayStr.split('-')
                    const date = new Date(parseInt(year), parseInt(month) - 1)
                    displayStr = date.toLocaleDateString('fr-FR', {
                      month: 'long',
                      year: 'numeric'
                    })
                    // Mettre la première lettre en majuscule (ex: "février 2026" -> "Février 2026")
                    displayStr = displayStr.charAt(0).toUpperCase() + displayStr.slice(1)
                  }

                  return (
                    <span
                      key={idx}
                      className="bg-white/60 px-1.5 rounded text-[10px] font-medium whitespace-nowrap"
                    >
                      {displayStr}
                    </span>
                  )
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {isLarge && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-gray-500 hover:text-gray-800 flex items-center gap-1 w-fit transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Masquer les détails
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Afficher tout ({items.length} mois)
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default function PaymentAlerts() {
  const { classes } = useClasses()
  const [alerts, setAlerts] = useState<UnpaidStudent[]>([])
  const [loading, setLoading] = useState(true)

  // Filtres
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [minMonths, setMinMonths] = useState(1)

  const { currentYear } = useAppStore()
  const [targetYear, setTargetYear] = useState<string>(currentYear)

  const availableYears = useMemo(() => {
    const baseYear = parseInt(currentYear.split('-')[0]) || new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => {
      const start = baseYear - 2 + i
      return `${start}-${start + 1}`
    })
  }, [currentYear])

  useEffect(() => {
    loadAlerts(targetYear)
  }, [targetYear])

  const loadAlerts = async (year: string) => {
    setLoading(true)
    try {
      const result = await window.api.payment.getUnpaidAlerts(year)
      if (result.success && Array.isArray(result.alerts)) {
        setAlerts(result.alerts)
      } else {
        if (import.meta.env.DEV) console.error('Failed to load payment alerts:', result.error)
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load payment alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  // Application de tous les filtres
  const filtered = useMemo(() => {
    return alerts
      .filter((a) => {
        // 1. Filtre par classe
        if (selectedClass !== 'all' && a.class_name !== selectedClass) return false

        // 2. Filtre par mois minimum
        if (a.unpaid_items?.length < minMonths) return false

        // 3. Filtre de recherche textuelle
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase()
          const fullName = `${a.first_name} ${a.last_name}`.toLowerCase()
          if (!fullName.includes(searchLower)) return false
        }

        // 4. Filtre par type d'impayé (écolage, cantine, etc.)
        if (selectedType !== 'all') {
          const hasType = a.unpaid_items.some((item) => item.type === selectedType)
          if (!hasType) return false
        }

        return true
      })
      .sort((a, b) => b.total_due - a.total_due) // Trier par le montant le plus élevé d'abord
  }, [alerts, selectedClass, minMonths, searchTerm, selectedType])

  const totalUnpaid = filtered.reduce((sum, a) => sum + a.total_due, 0)
  const totalStudents = filtered.length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <ReadOnlyBanner resource="payments" />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-rose-600" />
            Alertes Impayés
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi des retards de paiement par année scolaire
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-gray-600 whitespace-nowrap">
              Année scolaire :
            </Label>
            <select
              className="flex h-9 w-32 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => loadAlerts(targetYear)} variant="outline" className="gap-2">
            Actualiser
          </Button>
        </div>
      </div>

      {/* Cartes statistiques (Kpis) avec un design plus premium */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <AlertCircle className="w-16 h-16 text-rose-600" />
          </div>
          <p className="text-sm font-medium text-gray-500">Élèves en retard</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
            <span className="text-sm text-gray-500">élèves</span>
          </div>
        </div>

        <div className="p-5 bg-rose-50 rounded-xl border border-rose-100 shadow-sm relative overflow-hidden">
          <p className="text-sm font-medium text-rose-800">Montant total à recouvrer</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-rose-700">{totalUnpaid.toLocaleString()}</p>
            <span className="text-sm font-medium text-rose-600">Ar</span>
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Filter className="w-16 h-16 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-500">Factures impayées</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">
              {filtered.reduce((sum, a) => sum + (a.unpaid_items?.length || 0), 0)}
            </p>
            <span className="text-sm text-gray-500">impayés</span>
          </div>
        </div>
      </div>

      {/* Barre de Filtres Moderne */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Rechercher</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Nom de l'élève..."
              className="pl-9 bg-gray-50/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Classe</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="all">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Type d'impayé</Label>
          <div className="relative">
            <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-ring appearance-none"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all">Tous les types</option>
              <option value="tuition">Écolage</option>
              <option value="canteen">Cantine</option>
              <option value="bus">Transport</option>
              <option value="event">Événements</option>
            </select>
          </div>
        </div>

        <div className="w-full space-y-1">
          <Label className="text-gray-500 text-xs uppercase tracking-wider">Mois minimum</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-gray-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-ring"
            value={minMonths}
            onChange={(e) => setMinMonths(Number(e.target.value))}
          >
            <option value="1">1+ mois de retard</option>
            <option value="2">2+ mois de retard</option>
            <option value="3">3+ mois de retard</option>
            <option value="6">6+ mois de retard</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50/80 text-gray-500 uppercase text-xs font-semibold border-b border-gray-100">
              <tr>
                <th className="px-6 py-4">Élève</th>
                <th className="px-6 py-4 text-center">Statut global</th>
                <th className="px-6 py-4">Détails des impayés</th>
                <th className="px-6 py-4 text-right">Montant dû</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin"></div>
                      <p>Chargement des données...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600 mb-2">
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-gray-900">Aucun impayé trouvé</p>
                      <p className="text-gray-500 text-sm">
                        Tous les élèves sont en règle pour ces critères.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr
                    key={student.student_id}
                    className="hover:bg-gray-50/40 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{student.last_name}</span>
                        <span className="text-gray-500">{student.first_name}</span>
                        <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 w-fit">
                          {student.class_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center align-top pt-5">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5',
                            student.unpaid_items?.length >= 3
                              ? 'bg-rose-100 text-rose-700'
                              : student.unpaid_items?.length >= 2
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-orange-50 text-orange-700'
                          )}
                        >
                          <div
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              student.unpaid_items?.length >= 3 ? 'bg-rose-500' : 'bg-amber-500'
                            )}
                          />
                          {student.unpaid_items?.length || 0} impayés
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <UnpaidItemsGrouped items={student.unpaid_items} />
                    </td>
                    <td className="px-6 py-4 text-right align-top pt-5">
                      <span className="font-bold text-rose-600 tabular-nums text-base">
                        {student.total_due.toLocaleString()}
                      </span>
                      <span className="text-rose-500 text-xs ml-1 font-medium">Ar</span>
                    </td>
                    <td className="px-6 py-4 text-center align-top pt-5">
                      <a
                        href={`#/students/${student.student_id}`}
                        className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm transition-all"
                        title="Voir le dossier de l'élève"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
