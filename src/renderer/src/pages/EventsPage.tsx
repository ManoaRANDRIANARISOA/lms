import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Plus, Users, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Event {
  id: string;
  name: string;
  event_date: string;
  amount_per_parent: number;
  description: string;
  status: 'planned' | 'ongoing' | 'completed';
}

interface Participation {
  id: string; // event_payment id
  student_id: string;
  first_name: string;
  last_name: string;
  class: string;
  amount_due: number;
  amount_paid: number;
  paid: boolean;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [participation, setParticipation] = useState<Participation[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddParticipantsOpen, setIsAddParticipantsOpen] = useState(false);
  
  // Create Form State
  const [newEvent, setNewEvent] = useState({
    name: '',
    event_date: format(new Date(), 'yyyy-MM-dd'),
    amount_per_parent: 0,
    description: ''
  });

  // Add Participants State
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [classList, setClassList] = useState<string[]>([]); // To be populated

  useEffect(() => {
    loadEvents();
    // Fetch unique classes for filter
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadParticipation(selectedEvent.id);
    }
  }, [selectedEvent]);

  const loadEvents = async () => {
    try {
      const result = await (window as any).api.event.list();
      if (result.success) {
        setEvents(result.events);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadParticipation = async (eventId: string) => {
    try {
      const result = await (window as any).api.event.getById(eventId);
      if (result.success) {
        setParticipation(result.participation);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchClasses = async () => {
    // Hack: get all students and extract classes
    // In a real app, we should have a class list API
    const result = await (window as any).api.student.list({ limit: 1000 });
    if (result.students) {
      const classes = Array.from(new Set(result.students.map((s: any) => s.class))).sort() as string[];
      setClassList(classes);
    }
  };

  const handleCreateEvent = async () => {
    const result = await (window as any).api.event.create(newEvent);
    if (result.success) {
      setIsCreateOpen(false);
      loadEvents();
      setNewEvent({
        name: '',
        event_date: format(new Date(), 'yyyy-MM-dd'),
        amount_per_parent: 0,
        description: ''
      });
    }
  };

  const handleAddParticipants = async () => {
    // 1. Get students for selected class (or all)
    const filters: any = { limit: 1000 };
    if (selectedClass !== 'all') filters.class = selectedClass;
    
    const result = await (window as any).api.student.list(filters);
    const studentIds = result.students.map((s: any) => s.id);
    
    if (studentIds.length > 0 && selectedEvent) {
       await (window as any).api.event.addParticipants(selectedEvent.id, studentIds, selectedEvent.amount_per_parent);
       loadParticipation(selectedEvent.id);
       setIsAddParticipantsOpen(false);
    }
  };

  const handlePayment = async (p: Participation) => {
    if (!selectedEvent) return;
    
    if (confirm(`Confirmer le paiement de ${selectedEvent.amount_per_parent} Ar pour ${p.first_name} ${p.last_name} ?`)) {
      await (window as any).api.event.recordPayment(selectedEvent.id, p.student_id, selectedEvent.amount_per_parent, 'cash');
      loadParticipation(selectedEvent.id);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Événements Parents</h1>
          <p className="text-gray-500">Gestion des événements et participations</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvel Événement
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-h-0">
        {/* Events List */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-gray-50 font-medium">
            Événements
          </div>
          <div className="overflow-auto flex-1 p-2 space-y-2">
            {events.map(event => (
              <div 
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`
                  p-3 rounded-md cursor-pointer border transition-colors
                  ${selectedEvent?.id === event.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'hover:bg-gray-50 border-transparent hover:border-gray-200'}
                `}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-gray-900">{event.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    event.status === 'completed' ? 'bg-green-100 text-green-700' :
                    event.status === 'ongoing' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {event.status === 'planned' ? 'Prévu' : event.status === 'ongoing' ? 'En cours' : 'Terminé'}
                  </span>
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-2 mb-1">
                  <CalendarIcon className="w-3 h-3" />
                  {format(new Date(event.event_date), 'dd MMMM yyyy', { locale: fr })}
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {event.amount_per_parent.toLocaleString()} Ar / parent
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center p-8 text-gray-400 text-sm">
                Aucun événement créé
              </div>
            )}
          </div>
        </div>

        {/* Event Details & Participation */}
        <div className="md:col-span-2 bg-white rounded-lg border shadow-sm flex flex-col h-full overflow-hidden">
          {selectedEvent ? (
            <>
              <div className="p-6 border-b flex justify-between items-start bg-gray-50/50">
                <div>
                  <h2 className="text-xl font-bold mb-1">{selectedEvent.name}</h2>
                  <p className="text-gray-500 text-sm mb-4">{selectedEvent.description || 'Aucune description'}</p>
                  
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{participation.length} participants</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <span>{participation.filter(p => p.paid).length} payés</span>
                    </div>
                  </div>
                </div>
                
                <Button variant="outline" size="sm" onClick={() => setIsAddParticipantsOpen(true)}>
                  <Users className="w-4 h-4 mr-2" />
                  Gérer Participants
                </Button>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Élève</th>
                      <th className="px-4 py-3">Classe</th>
                      <th className="px-4 py-3 text-right">À Payer</th>
                      <th className="px-4 py-3 text-right">Statut</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {participation.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium">
                          {p.last_name} {p.first_name}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{p.class}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {p.amount_due.toLocaleString()} Ar
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.paid ? (
                            <span className="inline-flex items-center text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Payé
                            </span>
                          ) : (
                             <span className="inline-flex items-center text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-medium">
                              <XCircle className="w-3 h-3 mr-1" /> Non Payé
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!p.paid && (
                            <Button size="sm" variant="ghost" className="h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => handlePayment(p)}>
                              Encaisser
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {participation.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400">
                          Aucun participant ajouté à cet événement.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
              <Users className="w-16 h-16 mb-4 opacity-20" />
              <p>Sélectionnez un événement pour voir les détails</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Event Dialog */}
      <Dialog 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)}
        title="Nouvel Événement"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreateEvent}>Créer</Button>
          </>
        }
      >
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom de l'événement</label>
              <Input 
                value={newEvent.name} 
                onChange={e => setNewEvent({...newEvent, name: e.target.value})}
                placeholder="Ex: Sortie Zoo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input 
                  type="date"
                  value={newEvent.event_date} 
                  onChange={e => setNewEvent({...newEvent, event_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Montant / Parent (Ar)</label>
                <Input 
                  type="number"
                  value={newEvent.amount_per_parent} 
                  onChange={e => setNewEvent({...newEvent, amount_per_parent: parseFloat(e.target.value)})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input 
                value={newEvent.description} 
                onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                placeholder="Détails optionnels..."
              />
            </div>
          </div>
      </Dialog>

      {/* Add Participants Dialog */}
      <Dialog 
        isOpen={isAddParticipantsOpen} 
        onClose={() => setIsAddParticipantsOpen(false)}
        title="Ajouter des Participants"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddParticipantsOpen(false)}>Annuler</Button>
            <Button onClick={handleAddParticipants}>
              Ajouter Participants
            </Button>
          </>
        }
      >
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-500">
              Sélectionnez une classe ou ajoutez tous les élèves de l'école à cet événement.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Groupe Cible</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="all">Toute l'école</option>
                {classList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
      </Dialog>
    </div>
  );
}
