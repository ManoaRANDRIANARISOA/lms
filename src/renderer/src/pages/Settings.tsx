import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleReset = async () => {
    if (!confirm('ATTENTION: Cela va effacer TOUTES les données locales (Élèves, Paiements, etc.). Cette action est irréversible. Êtes-vous sûr ?')) return;
    
    setLoading(true);
    try {
      if (window.electron && window.electron.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke('db:reset');
        if (result.success) {
            setMessage('Base de données réinitialisée avec succès.');
        } else {
            setMessage('Erreur: ' + result.error);
        }
      } else {
        setMessage("Action non disponible en mode Web.");
      }
    } catch (e: any) {
        setMessage('Erreur: ' + e.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Paramètres</h1>
      
      <div className="bg-white p-6 rounded shadow max-w-xl">
        <h2 className="text-lg font-semibold mb-4 text-red-600">Zone de Danger</h2>
        <p className="text-gray-600 mb-4">
            Utilisez ce bouton pour effacer toutes les données locales et repartir à zéro.
            Assurez-vous d'avoir également nettoyé Supabase si nécessaire.
        </p>
        <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading ? 'Réinitialisation...' : 'Réinitialiser la Base de Données Locale'}
        </Button>
        {message && <p className="mt-4 font-medium">{message}</p>}
      </div>
    </div>
  );
}
