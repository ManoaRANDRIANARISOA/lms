import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical, FileText } from 'lucide-react'
import { defaultPrices, FinancePrices } from '@/lib/finance-settings'
import { useFinanceStore } from '@/store/useFinanceStore'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

export default function FinancePage() {
  const { prices: storedPrices, fetchPrices, savePrices, loading: storeLoading } = useFinanceStore()
  const [prices, setPrices] = useState<FinancePrices>(defaultPrices)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Global View State
  const [payments, setPayments] = useState<any[]>([])
  const [newClass, setNewClass] = useState('')
  const [newBusRoute, setNewBusRoute] = useState('')
  const [newUniformItem, setNewUniformItem] = useState('')

  const [filters, setFilters] = useState<{
    startDate: string
    endDate: string
    type: string
    search: string
  }>({
    startDate: '',
    endDate: '',
    type: 'all',
    search: ''
  })
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      await fetchPrices()
      setLoading(false)
    }
    init()
    // Initial load with empty filters (all payments)
    loadPayments()
  }, [])

  // Remove the useEffect that triggers on filters change to prevent double loading on initial mount
  // or explicit filter button click. Let the user click "Filtrer" or change type.
  // Actually, for better UX, we can reload when filters change, but we need to be careful.
  // Let's keep reload on filter change but ensure initial state is what we want.
  useEffect(() => {
    loadPayments()
  }, [filters])

  useEffect(() => {
    if (!storeLoading) {
      setPrices({
        ...storedPrices,
        busRoutes: storedPrices.busRoutes || Object.keys(storedPrices.bus || {}),
        uniformItems: storedPrices.uniformItems || Object.keys(storedPrices.uniforms || {})
      })
    }
  }, [storedPrices, storeLoading])

  const saveSettings = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await savePrices(prices)
      setMessage({ text: 'Paramètres enregistrés avec succès', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Failed to save settings', error)
      setMessage({ text: "Erreur lors de l'enregistrement", type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ... (existing code)

  const loadPayments = async () => {
    setLoadingPayments(true)
    setLoadError(null)
    try {
      console.log('Loading payments with filters:', filters)
      const result = await window.api.payment.getAll(filters)
      console.log('Payments result:', result)
      if (Array.isArray(result)) {
        setPayments(result)
      } else {
        console.error('Unexpected result format:', result)
        setLoadError('Format de données inattendu')
      }
    } catch (error: any) {
      console.error('Failed to load payments', error)
      setLoadError(error.message || 'Erreur de chargement')
    } finally {
      setLoadingPayments(false)
    }
  }

  // Handlers for Configuration
  const handleTuitionChange = (level: string, value: string) => {
    const numValue = parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      tuition: { ...prev.tuition, [level]: numValue }
    }))
  }

  const handleAddClass = () => {
    if (!newClass.trim()) return
    if (prices.classes && prices.classes.includes(newClass.trim())) {
      alert('Cette classe existe déjà.')
      return
    }

    setPrices((prev) => ({
      ...prev,
      classes: [...(prev.classes || []), newClass.trim()],
      tuition: { ...prev.tuition, [newClass.trim()]: 0 }
    }))
    setNewClass('')
  }

  const handleRemoveClass = (className: string) => {
    if (!confirm(`Supprimer la classe ${className} ?`)) return
    setPrices((prev) => {
      const newClasses = (prev.classes || []).filter((c) => c !== className)
      const newTuition = { ...prev.tuition }
      delete newTuition[className]
      return { ...prev, classes: newClasses, tuition: newTuition }
    })
  }

  const handleMoveClass = (index: number, direction: 'up' | 'down') => {
    if (!prices.classes) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === prices.classes.length - 1) return

    setPrices((prev) => {
      const newClasses = [...(prev.classes || [])]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      ;[newClasses[index], newClasses[targetIndex]] = [newClasses[targetIndex], newClasses[index]]
      return { ...prev, classes: newClasses }
    })
  }

  const handleCanteenChange = (type: 'daily' | 'monthly', value: string) => {
    const numValue = parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      canteen: { ...prev.canteen, [type]: numValue }
    }))
  }

  const handleBusChange = (zone: string, value: string) => {
    const numValue = parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      bus: { ...prev.bus, [zone]: numValue }
    }))
  }

  const handleUniformChange = (item: string, value: string) => {
    const numValue = parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      uniforms: { ...prev.uniforms, [item]: numValue }
    }))
  }

  const handleAddBusRoute = () => {
    if (!newBusRoute.trim()) return
    if (prices.busRoutes && prices.busRoutes.includes(newBusRoute.trim())) {
      alert('Cette zone existe déjà.')
      return
    }
    setPrices((prev) => ({
      ...prev,
      busRoutes: [...(prev.busRoutes || []), newBusRoute.trim()],
      bus: { ...prev.bus, [newBusRoute.trim()]: 0 }
    }))
    setNewBusRoute('')
  }

  const handleRemoveBusRoute = (route: string) => {
    if (!confirm(`Supprimer la zone ${route} ?`)) return
    setPrices((prev) => {
      const newRoutes = (prev.busRoutes || []).filter((r) => r !== route)
      const newBus = { ...prev.bus }
      delete newBus[route]
      return { ...prev, busRoutes: newRoutes, bus: newBus }
    })
  }

  const handleMoveBusRoute = (index: number, direction: 'up' | 'down') => {
    if (!prices.busRoutes) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === prices.busRoutes.length - 1) return

    setPrices((prev) => {
      const newRoutes = [...(prev.busRoutes || [])]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      ;[newRoutes[index], newRoutes[targetIndex]] = [newRoutes[targetIndex], newRoutes[index]]
      return { ...prev, busRoutes: newRoutes }
    })
  }

  const handleAddUniformItem = () => {
    if (!newUniformItem.trim()) return
    if (prices.uniformItems && prices.uniformItems.includes(newUniformItem.trim())) {
      alert('Cet article existe déjà.')
      return
    }
    setPrices((prev) => ({
      ...prev,
      uniformItems: [...(prev.uniformItems || []), newUniformItem.trim()],
      uniforms: { ...prev.uniforms, [newUniformItem.trim()]: 0 }
    }))
    setNewUniformItem('')
  }

  const handleRemoveUniformItem = (item: string) => {
    if (!confirm(`Supprimer l'article ${item} ?`)) return
    setPrices((prev) => {
      const newItems = (prev.uniformItems || []).filter((i) => i !== item)
      const newUniforms = { ...prev.uniforms }
      delete newUniforms[item]
      return { ...prev, uniformItems: newItems, uniforms: newUniforms }
    })
  }

  const handleMoveUniformItem = (index: number, direction: 'up' | 'down') => {
    if (!prices.uniformItems) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === prices.uniformItems.length - 1) return

    setPrices((prev) => {
      const newItems = [...(prev.uniformItems || [])]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      ;[newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]]
      return { ...prev, uniformItems: newItems }
    })
  }

  // Helpers
  const translateType = (type: string) => {
    const map: Record<string, string> = {
      tuition: 'Écolage',
      canteen: 'Cantine',
      bus: 'Bus',
      uniform: 'Uniforme',
      enrollment: 'Inscription',
      reenrollment: 'Réinscription',
      event: 'Événement',
      other: 'Autre'
    }
    return map[type] || type
  }

  if (loading) return <div className="p-8">Chargement...</div>

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ReadOnlyBanner resource="payments" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Module Finance</h1>
      </div>

      {message && (
        <div
          className={cn(
            'p-4 mb-6 rounded-md',
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          )}
        >
          {message.text}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="journal">Suivi Global (Journal)</TabsTrigger>
          <TabsTrigger value="settings">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* KPI Cards would go here */}
          </div>
        </TabsContent>

        <TabsContent value="journal" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex-1">
              <Label>Recherche</Label>
              <Input
                placeholder="Nom, type, description..."
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date début</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date fin</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                value={filters.type}
                onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="all">Tous</option>
                <option value="tuition">Écolage</option>
                <option value="enrollment">Inscription</option>
                <option value="reenrollment">Réinscription</option>
                <option value="canteen">Cantine</option>
                <option value="bus">Bus</option>
                <option value="uniform">Uniforme</option>
                <option value="event">Événement</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setFilters({ startDate: '', endDate: '', type: 'all', search: '' })}
              >
                Réinitialiser
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 uppercase font-medium border-b">
                  <tr>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Élève</th>
                    <th className="px-6 py-3">Classe</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3 text-right">Montant</th>
                    <th className="px-6 py-3 text-center">Reçu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingPayments ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        Chargement des paiements...
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-red-500">
                        {loadError}
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        Aucun paiement trouvé pour ces critères.
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {new Date(payment.payment_date).toLocaleDateString()}
                          <span className="block text-xs text-gray-400">
                            {new Date(payment.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {payment.last_name} {payment.first_name}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {payment.class_name || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium border
                            ${
                              payment.payment_type === 'tuition'
                                ? 'bg-blue-50 text-blue-700 border-blue-100'
                                : payment.payment_type === 'canteen'
                                  ? 'bg-orange-50 text-orange-700 border-orange-100'
                                  : payment.payment_type === 'bus'
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-100'
                                    : 'bg-gray-50 text-gray-700 border-gray-200'
                            }
                          `}
                          >
                            {translateType(payment.payment_type)}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 text-gray-600 max-w-xs truncate"
                          title={payment.description}
                        >
                          {payment.description || '-'}
                          {payment.month && (
                            <span className="ml-1 text-xs text-gray-400">({payment.month})</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-900">
                          {payment.amount?.toLocaleString()} Ar
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <FileText className="w-4 h-4 text-gray-400" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="flex justify-end mb-4">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </div>

          <div className="space-y-6">
            {/* Frais Généraux */}
            <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Frais Généraux</h3>
              <p className="text-sm text-gray-500 mb-4">
                Droits d'inscription et de réinscription.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="price-registration">Droit d'Inscription (Nouveaux)</Label>
                  <div className="relative">
                    <Input
                      id="price-registration"
                      type="number"
                      value={prices.registration || 0}
                      onChange={(e) =>
                        setPrices((prev) => ({
                          ...prev,
                          registration: parseInt(e.target.value) || 0
                        }))
                      }
                      className="pl-8"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                      Ar
                    </span>
                  </div>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="price-reenrollment">Droit de Réinscription (Anciens)</Label>
                  <div className="relative">
                    <Input
                      id="price-reenrollment"
                      type="number"
                      value={prices.reenrollment || 0}
                      onChange={(e) =>
                        setPrices((prev) => ({
                          ...prev,
                          reenrollment: parseInt(e.target.value) || 0
                        }))
                      }
                      className="pl-8"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                      Ar
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ecolage & Classes */}
            <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Classes & Écolages</h3>
                  <p className="text-sm text-gray-500">
                    Gérez la liste des classes et leurs tarifs respectifs. Utilisez les flèches pour
                    réorganiser l'ordre d'affichage.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {prices.classes &&
                  prices.classes.map((className, index) => (
                    <div
                      key={className}
                      className="flex items-center gap-4 bg-gray-50 p-2 rounded border"
                    >
                      <div className="flex flex-col gap-1 text-gray-400">
                        <button
                          onClick={() => handleMoveClass(index, 'up')}
                          disabled={index === 0}
                          className="hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveClass(index, 'down')}
                          disabled={index === (prices.classes?.length || 0) - 1}
                          className="hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="w-8 flex items-center justify-center text-gray-400">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <div className="w-1/3">
                        <div className="text-sm text-gray-500">Classe</div>
                        <div className="font-medium text-lg">{className}</div>
                      </div>

                      <div className="flex-1">
                        <Label htmlFor={`tuition-${className}`} className="text-xs">
                          Écolage Mensuel
                        </Label>
                        <div className="relative">
                          <Input
                            id={`tuition-${className}`}
                            type="number"
                            value={prices.tuition[className] || 0}
                            onChange={(e) => handleTuitionChange(className, e.target.value)}
                            className="pl-8"
                          />
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                            Ar
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveClass(className)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>

              <div className="mt-4 flex gap-2 items-end border-t pt-4">
                <div className="w-1/3">
                  <Label>Nouvelle Classe</Label>
                  <Input
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value)}
                    placeholder="Ex: Tle D"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                  />
                </div>
                <Button onClick={handleAddClass} disabled={!newClass.trim()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </div>

            {/* Cantine */}
            <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Prix Cantine</h3>
              <p className="text-sm text-gray-500 mb-4">Tarifs pour la restauration scolaire.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="canteen-daily">Prix par jour</Label>
                  <div className="relative">
                    <Input
                      id="canteen-daily"
                      type="number"
                      value={prices.canteen.daily}
                      onChange={(e) => handleCanteenChange('daily', e.target.value)}
                      className="pl-8"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                      Ar
                    </span>
                  </div>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="canteen-monthly">Prix par mois (Forfait)</Label>
                  <div className="relative">
                    <Input
                      id="canteen-monthly"
                      type="number"
                      value={prices.canteen.monthly}
                      onChange={(e) => handleCanteenChange('monthly', e.target.value)}
                      className="pl-8"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                      Ar
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bus */}
            <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Prix Transport (Bus)</h3>
                  <p className="text-sm text-gray-500">Tarifs mensuels par zone ou ligne de bus.</p>
                </div>
              </div>

              <div className="space-y-3">
                {prices.busRoutes &&
                  prices.busRoutes.map((route, index) => (
                    <div
                      key={route}
                      className="flex items-center gap-4 bg-gray-50 p-2 rounded border"
                    >
                      <div className="flex flex-col gap-1 text-gray-400">
                        <button
                          onClick={() => handleMoveBusRoute(index, 'up')}
                          disabled={index === 0}
                          className="hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveBusRoute(index, 'down')}
                          disabled={index === (prices.busRoutes?.length || 0) - 1}
                          className="hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="w-8 flex items-center justify-center text-gray-400">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <div className="w-1/3">
                        <div className="text-sm text-gray-500">Zone / Ligne</div>
                        <div className="font-medium text-lg">{route}</div>
                      </div>

                      <div className="flex-1">
                        <Label htmlFor={`bus-${route}`} className="text-xs">
                          Tarif Mensuel
                        </Label>
                        <div className="relative">
                          <Input
                            id={`bus-${route}`}
                            type="number"
                            value={prices.bus[route] || 0}
                            onChange={(e) => handleBusChange(route, e.target.value)}
                            className="pl-8"
                          />
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                            Ar
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveBusRoute(route)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>

              <div className="mt-4 flex gap-2 items-end border-t pt-4">
                <div className="w-1/3">
                  <Label>Nouvelle Zone</Label>
                  <Input
                    value={newBusRoute}
                    onChange={(e) => setNewBusRoute(e.target.value)}
                    placeholder="Ex: Zone 4, Itaosy..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBusRoute()}
                  />
                </div>
                <Button onClick={handleAddBusRoute} disabled={!newBusRoute.trim()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </div>

            {/* Uniformes */}
            <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Prix Uniformes & Divers</h3>
                  <p className="text-sm text-gray-500">
                    Prix unitaires pour les articles scolaires.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {prices.uniformItems &&
                  prices.uniformItems.map((item, index) => (
                    <div
                      key={item}
                      className="flex items-center gap-4 bg-gray-50 p-2 rounded border"
                    >
                      <div className="flex flex-col gap-1 text-gray-400">
                        <button
                          onClick={() => handleMoveUniformItem(index, 'up')}
                          disabled={index === 0}
                          className="hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMoveUniformItem(index, 'down')}
                          disabled={index === (prices.uniformItems?.length || 0) - 1}
                          className="hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="w-8 flex items-center justify-center text-gray-400">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <div className="w-1/3">
                        <div className="text-sm text-gray-500">Article</div>
                        <div className="font-medium text-lg">{item}</div>
                      </div>

                      <div className="flex-1">
                        <Label htmlFor={`uniform-${item}`} className="text-xs">
                          Prix Unitaire
                        </Label>
                        <div className="relative">
                          <Input
                            id={`uniform-${item}`}
                            type="number"
                            value={prices.uniforms[item] || 0}
                            onChange={(e) => handleUniformChange(item, e.target.value)}
                            className="pl-8"
                          />
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                            Ar
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveUniformItem(item)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>

              <div className="mt-4 flex gap-2 items-end border-t pt-4">
                <div className="w-1/3">
                  <Label>Nouvel Article</Label>
                  <Input
                    value={newUniformItem}
                    onChange={(e) => setNewUniformItem(e.target.value)}
                    placeholder="Ex: Polo, Casquette..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUniformItem()}
                  />
                </div>
                <Button onClick={handleAddUniformItem} disabled={!newUniformItem.trim()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
