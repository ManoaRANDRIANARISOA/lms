import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface FinancePrices {
  tuition: Record<string, number>;
  canteen: {
    daily: number;
    monthly: number;
  };
  bus: Record<string, number>;
  uniforms: Record<string, number>;
}

const defaultPrices: FinancePrices = {
  tuition: {
    "PS": 50000, "MS": 50000, "GS": 50000, "CP": 60000, 
    "CE": 60000, "CM": 60000, "6ème": 70000, "5ème": 70000,
    "4ème": 80000, "3ème": 80000, "Seconde": 90000, "Première": 90000, "Terminale": 100000
  },
  canteen: {
    daily: 2000,
    monthly: 40000
  },
  bus: {
    "Zone 1": 30000,
    "Zone 2": 40000,
    "Zone 3": 50000
  },
  uniforms: {
    "Tablier": 15000,
    "T-shirt": 10000,
    "Survêtement": 25000,
    "Badge": 5000
  }
};

export default function FinancePage() {
  // Configuration State
  const [prices, setPrices] = useState<FinancePrices>(defaultPrices);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Global View State
  const [payments, setPayments] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'all'
  });
  const [loadingPayments, setLoadingPayments] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // @ts-ignore
      const savedPrices = await window.electron.ipcRenderer.invoke('settings:get', 'finance_prices');
      if (savedPrices) {
        setPrices(prev => ({
          ...prev,
          ...savedPrices,
          tuition: { ...prev.tuition, ...(savedPrices.tuition || {}) },
          canteen: { ...prev.canteen, ...(savedPrices.canteen || {}) },
          bus: { ...prev.bus, ...(savedPrices.bus || {}) },
          uniforms: { ...prev.uniforms, ...(savedPrices.uniforms || {}) }
        }));
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // @ts-ignore
      await window.electron.ipcRenderer.invoke('settings:set', 'finance_prices', prices);
      setMessage({ text: "Paramètres enregistrés avec succès", type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save settings", error);
      setMessage({ text: "Erreur lors de l'enregistrement", type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const loadPayments = async () => {
    setLoadingPayments(true);
    try {
      // @ts-ignore
      const result = await window.electron.ipcRenderer.invoke('payment:getAll', filters);
      setPayments(result);
    } catch (error) {
      console.error("Failed to load payments", error);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Handlers for Configuration
  const handleTuitionChange = (level: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setPrices(prev => ({
      ...prev,
      tuition: { ...prev.tuition, [level]: numValue }
    }));
  };

  const handleCanteenChange = (type: 'daily' | 'monthly', value: string) => {
    const numValue = parseInt(value) || 0;
    setPrices(prev => ({
      ...prev,
      canteen: { ...prev.canteen, [type]: numValue }
    }));
  };

  const handleBusChange = (zone: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setPrices(prev => ({
      ...prev,
      bus: { ...prev.bus, [zone]: numValue }
    }));
  };

  const handleUniformChange = (item: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setPrices(prev => ({
      ...prev,
      uniforms: { ...prev.uniforms, [item]: numValue }
    }));
  };

  // Helpers
  const translateType = (type: string) => {
    const map: Record<string, string> = {
        tuition: 'Écolage', canteen: 'Cantine', bus: 'Bus', 
        uniform: 'Uniforme', enrollment: 'Inscription', event: 'Événement', other: 'Autre'
    };
    return map[type] || type;
  };

  const translateMethod = (method: string) => {
     const map: Record<string, string> = {
        cash: 'Espèces', check: 'Chèque', transfer: 'Virement', mobile_money: 'Mobile Money'
    };
    return map[method] || method;
  };

  const renderPriceSection = (
    title: string, 
    data: Record<string, number>, 
    onChange: (key: string, value: string) => void,
    description: string
  ) => (
    <div className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex flex-col space-y-1.5">
            <Label htmlFor={`price-${key}`}>{key}</Label>
            <div className="relative">
              <Input
                id={`price-${key}`}
                type="number"
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                className="pl-8"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">Ar</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) return <div className="p-8">Chargement...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Module Finance</h1>
      </div>

      {message && (
        <div className={cn(
          "p-4 mb-6 rounded-md",
          message.type === 'success' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
        )}>
          {message.text}
        </div>
      )}

      <Tabs defaultValue="configuration" className="w-full" onValueChange={(val) => val === 'global' && loadPayments()}>
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="configuration" className="px-8">Configuration des Tarifs</TabsTrigger>
          <TabsTrigger value="global" className="px-8">Suivi Global (Journal)</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration">
          <div className="flex justify-end mb-4">
             <Button onClick={saveSettings} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </div>

          <div className="space-y-6">
            {/* Ecolage */}
            {renderPriceSection(
              "Prix Écolage (Mensuel)", 
              prices.tuition, 
              handleTuitionChange,
              "Définissez le montant de l'écolage mensuel pour chaque niveau."
            )}

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
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">Ar</span>
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
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">Ar</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bus */}
            {renderPriceSection(
              "Prix Transport (Bus)", 
              prices.bus, 
              handleBusChange,
              "Tarifs mensuels par zone ou ligne de bus."
            )}

            {/* Uniformes */}
            {renderPriceSection(
              "Prix Uniformes & Divers", 
              prices.uniforms, 
              handleUniformChange,
              "Prix unitaires pour les articles scolaires."
            )}
          </div>
        </TabsContent>

        <TabsContent value="global">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded shadow-sm">
              <div className="flex flex-col space-y-1.5">
                <Label>Du</Label>
                <Input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label>Au</Label>
                <Input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
              </div>
              <div className="flex flex-col space-y-1.5 min-w-[200px]">
                <Label>Type de paiement</Label>
                <select 
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={filters.type} 
                  onChange={e => setFilters({...filters, type: e.target.value})}
                >
                  <option value="all">Tous</option>
                  <option value="tuition">Écolage</option>
                  <option value="canteen">Cantine</option>
                  <option value="bus">Bus</option>
                  <option value="uniform">Uniforme</option>
                  <option value="enrollment">Inscription</option>
                  <option value="event">Événement</option>
                  <option value="other">Autre</option>
                </select>
              </div>
              <Button onClick={loadPayments} disabled={loadingPayments}>
                {loadingPayments ? 'Chargement...' : 'Filtrer'}
              </Button>
            </div>

            <div className="bg-white rounded-md shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Élève</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Classe</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Détails</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Méthode</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        {loadingPayments ? 'Chargement des données...' : 'Aucun paiement trouvé pour cette période.'}
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.payment_date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary">
                          {p.first_name} {p.last_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.class_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-semibold",
                            p.payment_type === 'tuition' ? "bg-blue-100 text-blue-800" :
                            p.payment_type === 'canteen' ? "bg-green-100 text-green-800" :
                            p.payment_type === 'bus' ? "bg-yellow-100 text-yellow-800" :
                            "bg-gray-100 text-gray-800"
                          )}>
                            {translateType(p.payment_type)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {p.month ? `Mois: ${p.month}` : p.description || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{p.amount.toLocaleString()} Ar</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{translateMethod(p.payment_method)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {payments.length > 0 && (
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td colSpan={5} className="px-6 py-3 text-right font-bold text-gray-700">Total Période</td>
                      <td className="px-6 py-3 font-bold text-primary text-lg">
                        {payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()} Ar
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
