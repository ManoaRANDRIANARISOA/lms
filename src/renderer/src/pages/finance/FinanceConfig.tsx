import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical, Pencil, Check, X } from 'lucide-react'
import { defaultPrices, FinancePrices, resolveClassPrice } from '@/lib/finance-settings'
import { useFinanceStore } from '@/store/useFinanceStore'
import { useClasses } from '@/lib/useClasses'
import { usePermissions } from '@/lib/usePermissions'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

export default function FinanceConfig() {
  const { prices: storedPrices, fetchPrices, savePrices, loading: storeLoading } = useFinanceStore()
  const { classes: settingsClasses } = useClasses()
  const { canWrite } = usePermissions()
  const [prices, setPrices] = useState<FinancePrices>(defaultPrices)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [newBusRoute, setNewBusRoute] = useState('')
  const [newUniformItem, setNewUniformItem] = useState('')
  const [editingBusRoute, setEditingBusRoute] = useState<{ oldName: string; newName: string } | null>(null)
  const [editingUniformItem, setEditingUniformItem] = useState<{ oldName: string; newName: string } | null>(null)

  useEffect(() => {
    const init = async () => {
      await fetchPrices()
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!storeLoading) {
      // Auto-populate any missing class alias prices with their canonical equivalent
      const updatedTuition = { ...(storedPrices.tuition || {}) }
      if (settingsClasses && settingsClasses.length > 0) {
        settingsClasses.forEach((cls) => {
          if (!updatedTuition[cls] || updatedTuition[cls] <= 0) {
            updatedTuition[cls] = resolveClassPrice(storedPrices.tuition, cls)
          }
        })
      }

      setPrices({
        ...storedPrices,
        tuition: updatedTuition,
        busRoutes: storedPrices.busRoutes || Object.keys(storedPrices.bus || {}),
        uniformItems: storedPrices.uniformItems || Object.keys(storedPrices.uniforms || {})
      })
    }
  }, [storedPrices, storeLoading, settingsClasses])

  const saveSettings = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await savePrices(prices)
      setMessage({ text: 'Paramètres enregistrés avec succès', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to save settings', error)
      setMessage({ text: "Erreur lors de l'enregistrement", type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleTuitionChange = (level: string, value: string) => {
    const numValue = value === '' ? ('' as unknown as number) : parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      tuition: { ...prev.tuition, [level]: numValue }
    }))
  }

  const handleCanteenChange = (type: 'daily' | 'monthly', value: string) => {
    const numValue = value === '' ? ('' as unknown as number) : parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      canteen: { ...prev.canteen, [type]: numValue }
    }))
  }

  const handleBusChange = (zone: string, value: string) => {
    const numValue = value === '' ? ('' as unknown as number) : parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      bus: { ...prev.bus, [zone]: numValue }
    }))
  }

  const handleUniformChange = (item: string, value: string) => {
    const numValue = value === '' ? ('' as unknown as number) : parseInt(value) || 0
    setPrices((prev) => ({
      ...prev,
      uniforms: { ...prev.uniforms, [item]: numValue }
    }))
  }

  const handleAddBusRoute = () => {
    if (!newBusRoute.trim()) return
    const trimmed = newBusRoute.trim()
    if (prices.busRoutes && prices.busRoutes.includes(trimmed)) {
      alert('Cette zone existe déjà.')
      return
    }
    setPrices((prev) => ({
      ...prev,
      busRoutes: [...(prev.busRoutes || []), trimmed],
      bus: { ...prev.bus, [trimmed]: 0 },
      deletedBusRoutes: (prev.deletedBusRoutes || []).filter((r) => r !== trimmed)
    }))
    setNewBusRoute('')
  }

  const handleSaveRenameBusRoute = async (oldRoute: string, newRouteName: string) => {
    const trimmed = newRouteName.trim()
    if (!trimmed) return
    if (trimmed === oldRoute) {
      setEditingBusRoute(null)
      return
    }
    if (prices.busRoutes?.includes(trimmed)) {
      alert(`La zone "${trimmed}" existe déjà.`)
      return
    }

    // Cascade rename to student_fees if possible
    try {
      if (window.api?.settings?.renameBusRoute) {
        const res = await window.api.settings.renameBusRoute(oldRoute, trimmed)
        if (res?.affectedStudentsCount && res.affectedStudentsCount > 0) {
          setMessage({
            text: `Zone renommée : ${res.affectedStudentsCount} élève(s) ont été mis à jour automatiquement sur "${trimmed}".`,
            type: 'success'
          })
        }
      }
    } catch (e) {
      console.warn('Could not cascade bus route rename to students:', e)
    }

    setPrices((prev) => {
      const newRoutes = (prev.busRoutes || []).map((r) => (r === oldRoute ? trimmed : r))
      const newBus = { ...prev.bus }
      newBus[trimmed] = newBus[oldRoute] || 0
      delete newBus[oldRoute]
      const newDeleted = Array.from(new Set([...(prev.deletedBusRoutes || []), oldRoute])).filter(
        (r) => r !== trimmed
      )
      return { ...prev, busRoutes: newRoutes, bus: newBus, deletedBusRoutes: newDeleted }
    })
    setEditingBusRoute(null)
  }

  const handleRemoveBusRoute = (route: string) => {
    if (
      !confirm(
        `Supprimer définitivement la zone "${route}" ?\nAttention : cette suppression sera synchronisée sur tous les postes.`
      )
    )
      return
    setPrices((prev) => {
      const newRoutes = (prev.busRoutes || []).filter((r) => r !== route)
      const newBus = { ...prev.bus }
      delete newBus[route]
      const newDeleted = Array.from(new Set([...(prev.deletedBusRoutes || []), route]))
      return { ...prev, busRoutes: newRoutes, bus: newBus, deletedBusRoutes: newDeleted }
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
    const trimmed = newUniformItem.trim()
    if (prices.uniformItems && prices.uniformItems.includes(trimmed)) {
      alert('Cet article existe déjà.')
      return
    }
    setPrices((prev) => ({
      ...prev,
      uniformItems: [...(prev.uniformItems || []), trimmed],
      uniforms: { ...prev.uniforms, [trimmed]: 0 },
      deletedUniformItems: (prev.deletedUniformItems || []).filter((i) => i !== trimmed)
    }))
    setNewUniformItem('')
  }

  const handleSaveRenameUniformItem = (oldItem: string, newItemName: string) => {
    const trimmed = newItemName.trim()
    if (!trimmed) return
    if (trimmed === oldItem) {
      setEditingUniformItem(null)
      return
    }
    if (prices.uniformItems?.includes(trimmed)) {
      alert(`L'article "${trimmed}" existe déjà.`)
      return
    }
    setPrices((prev) => {
      const newItems = (prev.uniformItems || []).map((i) => (i === oldItem ? trimmed : i))
      const newUniforms = { ...prev.uniforms }
      newUniforms[trimmed] = newUniforms[oldItem] || 0
      delete newUniforms[oldItem]
      const newDeleted = Array.from(new Set([...(prev.deletedUniformItems || []), oldItem])).filter(
        (i) => i !== trimmed
      )
      return { ...prev, uniformItems: newItems, uniforms: newUniforms, deletedUniformItems: newDeleted }
    })
    setEditingUniformItem(null)
  }

  const handleRemoveUniformItem = (item: string) => {
    if (
      !confirm(
        `Supprimer définitivement l'article "${item}" ?\nAttention : cette suppression sera synchronisée sur tous les postes.`
      )
    )
      return
    setPrices((prev) => {
      const newItems = (prev.uniformItems || []).filter((i) => i !== item)
      const newUniforms = { ...prev.uniforms }
      delete newUniforms[item]
      const newDeleted = Array.from(new Set([...(prev.deletedUniformItems || []), item]))
      return { ...prev, uniformItems: newItems, uniforms: newUniforms, deletedUniformItems: newDeleted }
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

  const canEditFinance = canWrite('settings')

  if (loading) return <div className="p-4">Chargement...</div>

  return (
    <div className="space-y-6">
      {!canEditFinance && <ReadOnlyBanner resource="settings" />}

      {message && (
        <div
          className={cn(
            'p-4 rounded-md',
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          )}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        {canEditFinance && (
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </Button>
        )}
      </div>

      {/* Frais Généraux */}
      <div className="p-4 border rounded-lg bg-white shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Frais Généraux</h3>
        <p className="text-sm text-gray-500 mb-4">Droits d'inscription et de réinscription.</p>
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
                    registration:
                      e.target.value === ''
                        ? ('' as unknown as number)
                        : parseInt(e.target.value) || 0
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
                    reenrollment:
                      e.target.value === ''
                        ? ('' as unknown as number)
                        : parseInt(e.target.value) || 0
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="price-fram">Frais FRAM (Association des Parents)</Label>
            <div className="relative">
              <Input
                id="price-fram"
                type="number"
                value={prices.fram || 0}
                onChange={(e) =>
                  setPrices((prev) => ({
                    ...prev,
                    fram:
                      e.target.value === ''
                        ? ('' as unknown as number)
                        : parseInt(e.target.value) || 0
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
      <div className="p-4 border rounded-lg bg-white shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Classes & Écolages</h3>
            <p className="text-sm text-gray-500">
              Configurez les tarifs d'écolage par classe. Pour ajouter ou supprimer des classes,
              allez dans <strong>Paramètres → Gestion des Classes</strong>.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {settingsClasses.map((className) => (
            <div key={className} className="flex items-center gap-4 bg-gray-50 p-2 rounded border">
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
                    value={
                      prices.tuition[className] !== undefined && Number(prices.tuition[className]) > 0
                        ? prices.tuition[className]
                        : resolveClassPrice(prices.tuition, className)
                    }
                    onChange={(e) => handleTuitionChange(className, e.target.value)}
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                    Ar
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cantine */}
      <div className="p-4 border rounded-lg bg-white shadow-sm">
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
      <div className="p-4 border rounded-lg bg-white shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Prix Transport (Bus)</h3>
            <p className="text-sm text-gray-500">Tarifs mensuels par zone ou ligne de bus.</p>
          </div>
        </div>
        <div className="space-y-3">
          {prices.busRoutes &&
            prices.busRoutes.map((route, index) => (
              <div key={route} className="flex items-center gap-4 bg-gray-50 p-2 rounded border">
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
                  {editingBusRoute?.oldName === route ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editingBusRoute.newName}
                        onChange={(e) =>
                          setEditingBusRoute({ ...editingBusRoute, newName: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRenameBusRoute(route, editingBusRoute.newName)
                          if (e.key === 'Escape') setEditingBusRoute(null)
                        }}
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-green-600 hover:bg-green-50"
                        onClick={() => handleSaveRenameBusRoute(route, editingBusRoute.newName)}
                        title="Valider le renommage"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-500 hover:bg-gray-100"
                        onClick={() => setEditingBusRoute(null)}
                        title="Annuler"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-lg">{route}</div>
                      {canEditFinance && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-gray-400 hover:text-blue-600"
                          onClick={() => setEditingBusRoute({ oldName: route, newName: route })}
                          title="Renommer cette zone"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
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
      <div className="p-4 border rounded-lg bg-white shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Prix Uniformes & Divers</h3>
            <p className="text-sm text-gray-500">Prix unitaires pour les articles scolaires.</p>
          </div>
        </div>
        <div className="space-y-3">
          {prices.uniformItems &&
            prices.uniformItems.map((item, index) => (
              <div key={item} className="flex items-center gap-4 bg-gray-50 p-2 rounded border">
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
                  {editingUniformItem?.oldName === item ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editingUniformItem.newName}
                        onChange={(e) =>
                          setEditingUniformItem({ ...editingUniformItem, newName: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            handleSaveRenameUniformItem(item, editingUniformItem.newName)
                          if (e.key === 'Escape') setEditingUniformItem(null)
                        }}
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-green-600 hover:bg-green-50"
                        onClick={() =>
                          handleSaveRenameUniformItem(item, editingUniformItem.newName)
                        }
                        title="Valider le renommage"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-gray-500 hover:bg-gray-100"
                        onClick={() => setEditingUniformItem(null)}
                        title="Annuler"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-lg">{item}</div>
                      {canEditFinance && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-gray-400 hover:text-blue-600"
                          onClick={() => setEditingUniformItem({ oldName: item, newName: item })}
                          title="Renommer cet article"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
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
  )
}
