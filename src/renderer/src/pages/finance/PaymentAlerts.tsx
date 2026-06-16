import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useClasses } from '@/lib/useClasses'
import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import { useAppStore } from '@/store/useAppStore'
interface UnpaidStudent {
  student_id: string
  first_name: string
  last_name: string
  class_name: string
  unpaid_items: Array<{ type: string; description: string; amount: number }>
  total_due: number
}

export default function PaymentAlerts() {
  const { classes } = useClasses()
  const [alerts, setAlerts] = useState<UnpaidStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState('all')
  const [minMonths, setMinMonths] = useState(1)

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const schoolYear = await window.api.settings.get('school_year')
      const year = (schoolYear as string) || useAppStore.getState().currentYear

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

  const filtered = alerts.filter(
    (a) => (selectedClass === 'all' || a.class_name === selectedClass) && a.unpaid_items?.length >= minMonths
  )

  const totalUnpaid = filtered.reduce((sum, a) => sum + a.total_due, 0)
  const totalStudents = filtered.length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ReadOnlyBanner resource="payments" />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Alertes Impayés</h1>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <p className="text-sm text-gray-500">Élèves en retard</p>
          <p className="text-2xl font-bold text-red-600">{totalStudents}</p>
        </div>
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <p className="text-sm text-gray-500">Montant total dû</p>
          <p className="text-2xl font-bold text-red-600">{totalUnpaid.toLocaleString()} Ar</p>
        </div>
        <div className="p-4 bg-white rounded-lg border shadow-sm">
          <p className="text-sm text-gray-500">Mois minimum de retard</p>
          <div className="flex gap-2 mt-2">
            {[1, 2, 3].map((n) => (
              <Button
                key={n}
                variant={minMonths === n ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMinMonths(n)}
              >
                {n}+
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div>
          <Label>Classe</Label>
          <select
            className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="all">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 uppercase font-medium border-b">
              <tr>
                <th className="px-6 py-3">Élève</th>
                <th className="px-6 py-3">Classe</th>
                <th className="px-6 py-3 text-center">Mois impayés</th>
                <th className="px-6 py-3 text-right">Montant dû</th>
                <th className="px-6 py-3">Mois concernés</th>
                <th className="px-6 py-3 text-center">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-green-600">
                    Aucun impayé trouvé pour ces critères.
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr key={student.student_id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {student.last_name} {student.first_name}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {student.class_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium',
                        student.unpaid_items?.length >= 3
                          ? 'bg-red-100 text-red-800'
                          : student.unpaid_items?.length >= 2
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-yellow-100 text-yellow-800'
                      )}>
                        {student.unpaid_items?.length || 0} impayés
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-red-700">
                      {student.total_due.toLocaleString()} Ar
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      <ul className="space-y-1 list-disc list-inside">
                        {student.unpaid_items?.map((item, idx) => (
                          <li key={idx}>
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <a
                        href={`#/students/${student.student_id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Voir
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
