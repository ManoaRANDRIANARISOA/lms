import React, { useState } from 'react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2 } from 'lucide-react';

interface ReEnrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    class: string;
  };
  currentYear: string;
  onSuccess: () => void;
}

const getNextClass = (currentClass: string): string => {
  // Simple heuristic for next class
  if (!currentClass) return '';
  const c = currentClass.toLowerCase();
  
  if (c.includes('ps')) return 'MS';
  if (c.includes('ms')) return 'GS';
  if (c.includes('gs')) return 'CP';
  if (c.includes('cp')) return 'CE1';
  if (c.includes('ce1')) return 'CE2';
  if (c.includes('ce2')) return 'CM1';
  if (c.includes('cm1')) return 'CM2';
  if (c.includes('cm2')) return '6ème';
  if (c.includes('6ème')) return '5ème';
  if (c.includes('5ème')) return '4ème';
  if (c.includes('4ème')) return '3ème';
  if (c.includes('3ème')) return '2nde';
  if (c.includes('2nde')) return '1ère';
  if (c.includes('1ère')) return 'Terminale';
  
  return currentClass; // Fallback
};

const getNextYear = (currentYear: string): string => {
  if (!currentYear) return '2026-2027';
  const parts = currentYear.split('-');
  if (parts.length === 2) {
    const start = parseInt(parts[0]);
    return `${start + 1}-${start + 2}`;
  }
  return currentYear;
};

export const ReEnrollModal: React.FC<ReEnrollModalProps> = ({ 
  isOpen, onClose, student, currentYear, onSuccess 
}) => {
  const isNewStudent = !student.class || student.class === 'Classe non spécifiée';
  // If student has no class, it's an Inscription. If they have a class, it's a Réinscription.
  const title = isNewStudent ? "Inscription" : "Réinscription";
  
  const [targetYear, setTargetYear] = useState(isNewStudent ? currentYear : getNextYear(currentYear));
  const [newClass, setNewClass] = useState(getNextClass(student.class));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReEnroll = async () => {
    if (!(window as any).api) {
      setError('Erreur système: API non disponible');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // Use the exposed API
      const result = await (window as any).api.student.reEnroll(student.id, newClass, targetYear);
      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || 'Échec de l\'opération');
      }
    } catch (err: any) {
      console.error('Re-enroll error:', err);
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`${title} : ${student.first_name} ${student.last_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleReEnroll} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmer {title}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700">
          Cette action inscrira l'élève dans la nouvelle classe pour l'année scolaire {targetYear}.
          {isNewStudent ? " Il s'agit d'une première inscription." : " L'historique de l'année précédente sera conservé."}
        </div>

        {error && (
          <div className="bg-red-50 p-3 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Année Scolaire Cible
          </label>
          <Input 
            value={targetYear} 
            onChange={(e) => setTargetYear(e.target.value)}
            placeholder="Ex: 2026-2027"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nouvelle Classe
          </label>
          <Input 
            value={newClass} 
            onChange={(e) => setNewClass(e.target.value)}
            placeholder="Ex: 6ème A"
          />
        </div>
      </div>
    </Dialog>
  );
};
