import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, AlertCircle, Plus, Calendar, DollarSign, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface FinanceTabProps {
  studentId: string;
  schoolYear: string;
}

export function FinanceTab({ studentId, schoolYear }: FinanceTabProps) {
  const [status, setStatus] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    payment_type: 'tuition',
    month: '',
    description: '',
    payment_method: 'cash'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch status
      const statusRes = await (window as any).api.payment.getTuitionStatus(studentId, schoolYear);
      // Fetch payments
      const paymentsRes = await (window as any).api.payment.getByStudent(studentId);
      
      if (statusRes.success) {
        setStatus(statusRes);
      }
      setPayments(paymentsRes || []);
    } catch (error) {
      console.error('Failed to load finance data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [studentId, schoolYear]);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const paymentData = {
        student_id: studentId,
        payment_date: new Date().toISOString().split('T')[0],
        amount: parseFloat(formData.amount),
        payment_type: formData.payment_type,
        month: formData.payment_type === 'tuition' ? formData.month : undefined,
        description: formData.description,
        payment_method: formData.payment_method
      };

      const result = await (window as any).api.payment.create(paymentData);
      if (result.success) {
        setIsAddPaymentOpen(false);
        setFormData({
            amount: '',
            payment_type: 'tuition',
            month: '',
            description: '',
            payment_method: 'cash'
        });
        loadData(); // Reload data
      } else {
        alert('Erreur lors du paiement: ' + result.error);
      }
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  if (loading) return <div className="p-4 text-center">Chargement des données financières...</div>;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex flex-col justify-center min-h-[100px] overflow-hidden">
          <div className="flex items-center text-gray-500 mb-2">
            <DollarSign className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="text-sm font-medium truncate">Écolage Mensuel</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 truncate" title={`${(status?.feeRecord?.monthly_tuition || 0).toLocaleString()} Ar`}>
            {(status?.feeRecord?.monthly_tuition || 0).toLocaleString()} Ar
          </p>
          <p className="text-xs text-gray-500 truncate">Niveau: {status?.feeRecord?.tuition_level}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex flex-col justify-center min-h-[100px] overflow-hidden">
          <div className="flex items-center text-gray-500 mb-2">
            <Wallet className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="text-sm font-medium truncate">Total Payé (Année)</span>
          </div>
          <p className="text-2xl font-bold text-green-600 truncate" title={`${(status?.status?.reduce((acc: number, curr: any) => acc + curr.paid, 0) || 0).toLocaleString()} Ar`}>
            {(status?.status?.reduce((acc: number, curr: any) => acc + curr.paid, 0) || 0).toLocaleString()} Ar
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-100 flex items-center justify-center min-h-[100px]">
            <Button className="w-full h-full text-lg" onClick={() => setIsAddPaymentOpen(true)}>
                <Plus className="w-5 h-5 mr-2" />
                Nouveau Paiement
            </Button>
            <Dialog 
                isOpen={isAddPaymentOpen} 
                onClose={() => setIsAddPaymentOpen(false)}
                title="Enregistrer un paiement"
                footer={
                    <Button type="submit" form="payment-form">Enregistrer le paiement</Button>
                }
            >
                    <form id="payment-form" onSubmit={handlePaymentSubmit} className="space-y-4 mt-4">
                        <div className="grid gap-2">
                            <Label htmlFor="type">Type de paiement</Label>
                            <select 
                                id="type" 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={formData.payment_type}
                                onChange={(e) => setFormData({...formData, payment_type: e.target.value})}
                            >
                                <option value="tuition">Écolage (Tuition)</option>
                                <option value="enrollment">Frais d'inscription</option>
                                <option value="reenrollment">Frais de réinscription</option>
                                <option value="bus">Transport</option>
                                <option value="canteen">Cantine</option>
                                <option value="uniform">Uniforme</option>
                                <option value="event">Événement</option>
                                <option value="other">Autre</option>
                            </select>
                        </div>

                        {formData.payment_type === 'tuition' && (
                            <div className="grid gap-2">
                                <Label htmlFor="month">Mois concerné</Label>
                                <select 
                                    id="month" 
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={formData.month}
                                    onChange={(e) => setFormData({...formData, month: e.target.value})}
                                    required
                                >
                                    <option value="">Sélectionner un mois</option>
                                    {status?.status?.map((m: any) => (
                                        <option key={m.key} value={m.key}>
                                            {m.month} ({m.status === 'paid' ? 'Payé' : m.status === 'partial' ? 'Partiel' : 'Non payé'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="grid gap-2">
                            <Label htmlFor="amount">Montant (Ar)</Label>
                            <Input 
                                id="amount" 
                                type="number" 
                                value={formData.amount} 
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                required
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="method">Mode de paiement</Label>
                            <select 
                                id="method" 
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={formData.payment_method}
                                onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                            >
                                <option value="cash">Espèces</option>
                                <option value="check">Chèque</option>
                                <option value="transfer">Virement</option>
                                <option value="mobile_money">Mobile Money</option>
                            </select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="desc">Description / Note</Label>
                            <Input 
                                id="desc" 
                                value={formData.description} 
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                            />
                        </div>
                    </form>
            </Dialog>
        </div>
      </div>

      {/* Monthly Tracking Grid */}
      <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            Suivi des Mensualités ({schoolYear})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {status?.status?.map((month: any) => (
                <div key={month.key} className={`
                    relative p-4 rounded-lg border-2 flex flex-col items-center justify-center text-center min-h-[120px]
                    ${month.status === 'paid' ? 'border-green-100 bg-green-50' : 
                      month.status === 'partial' ? 'border-yellow-100 bg-yellow-50' : 
                      'border-red-100 bg-red-50'}
                `}>
                    <span className="text-sm font-medium text-gray-700 mb-1">{month.month}</span>
                    <div className="mb-1">
                        {month.status === 'paid' && <CheckCircle2 className="w-8 h-8 text-green-500" />}
                        {month.status === 'partial' && <AlertCircle className="w-8 h-8 text-yellow-500" />}
                        {month.status === 'unpaid' && <XCircle className="w-8 h-8 text-red-400" />}
                    </div>
                    <span className={`text-xs font-bold ${
                        month.status === 'paid' ? 'text-green-700' : 
                        month.status === 'partial' ? 'text-yellow-700' : 
                        'text-red-700'
                    }`}>
                        {month.status === 'paid' ? 'PAYÉ' : 
                         month.status === 'partial' ? `Reste: ${month.balance} Ar` : 
                         'NON PAYÉ'}
                    </span>
                    {month.paid > 0 && month.status !== 'paid' && (
                        <span className="text-[10px] text-gray-500 mt-1">Payé: {month.paid} Ar</span>
                    )}
                </div>
            ))}
        </div>
      </div>

      {/* Payment History List */}
      <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">Historique des Paiements</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Mois / Détail</th>
                        <th className="px-6 py-3 text-right">Montant</th>
                        <th className="px-6 py-3">Mode</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {payments.length > 0 ? (
                        payments.map((payment) => (
                            <tr key={payment.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    {format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: fr })}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded capitalize">
                                        {payment.payment_type === 'tuition' ? 'Écolage' : payment.payment_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">
                                    {payment.month ? (
                                        <span className="font-medium text-gray-900">{payment.month}</span>
                                    ) : (
                                        payment.description || '-'
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-gray-900">
                                    {payment.amount.toLocaleString()} Ar
                                </td>
                                <td className="px-6 py-4 text-gray-500 capitalize">
                                    {payment.payment_method === 'mobile_money' ? 'Mobile Money' : 
                                     payment.payment_method === 'transfer' ? 'Virement' : 
                                     payment.payment_method === 'check' ? 'Chèque' : 'Espèces'}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                Aucun paiement enregistré pour le moment.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
