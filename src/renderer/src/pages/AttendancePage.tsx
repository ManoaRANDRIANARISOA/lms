import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Bus, Utensils, CheckCircle2, XCircle, Calendar, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';

interface StudentAttendance {
  id: string;
  first_name: string;
  last_name: string;
  class: string;
  registration_number: string;
  bus_route?: string;
  present: boolean;
}

import { ServiceDashboard } from '@/components/students/ServiceDashboard';

export default function AttendancePage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [busStudents, setBusStudents] = useState<StudentAttendance[]>([]);
  const [canteenStudents, setCanteenStudents] = useState<StudentAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('bus');
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [isServiceDashboardOpen, setIsServiceDashboardOpen] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
        try {
            const year = await (window as any).api.settings.get('school_year');
            if (year) setSchoolYear(year.replace(/"/g, ''));
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (schoolYear) {
        loadData();
    }
  }, [date, schoolYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Get Subscribers
      const [busSubs, canteenSubs] = await Promise.all([
        (window as any).api.attendance.getBusSubscribers(schoolYear),
        (window as any).api.attendance.getCanteenSubscribers(schoolYear)
      ]);

      // 2. Get Today's Attendance
      const [busAtt, canteenAtt] = await Promise.all([
        (window as any).api.attendance.getBusAttendance(date),
        (window as any).api.attendance.getCanteenAttendance(date)
      ]);

      // 3. Merge Data (Default to PRESENT if no record exists for the day)
      // This assumes if you are subscribed, you are expected to be there.
      // If we want to start with all unchecked, we'd default to false.
      // Usually for "Pointage", we mark who is ABSENT. So default TRUE is better.
      // But let's check if record exists.
      
      const mapStudents = (subs: any[], records: any[]) => {
        return subs.map((s: any) => {
            const record = records.find((a: any) => a.student_id === s.id);
            return {
                ...s,
                present: record ? (record.present === 1) : true // Default Present
            };
        });
      };

      setBusStudents(mapStudents(busSubs || [], busAtt || []));
      setCanteenStudents(mapStudents(canteenSubs || [], canteenAtt || []));

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string, listType: 'bus' | 'canteen') => {
    if (listType === 'bus') {
      setBusStudents(prev => prev.map(s => s.id === id ? { ...s, present: !s.present } : s));
    } else {
      setCanteenStudents(prev => prev.map(s => s.id === id ? { ...s, present: !s.present } : s));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'bus') {
        const records = busStudents.map(s => ({ studentId: s.id, present: s.present }));
        await (window as any).api.attendance.recordBus(date, records);
      } else {
        const records = canteenStudents.map(s => ({ studentId: s.id, present: s.present }));
        await (window as any).api.attendance.recordCanteen(date, records);
      }
      // Simple feedback
      alert('Pointage enregistré avec succès !');
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const stats = activeTab === 'bus' ? {
      total: busStudents.length,
      present: busStudents.filter(s => s.present).length,
      absent: busStudents.filter(s => !s.present).length
  } : {
      total: canteenStudents.length,
      present: canteenStudents.filter(s => s.present).length,
      absent: canteenStudents.filter(s => !s.present).length
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-bold flex items-center">
                <Calendar className="w-6 h-6 mr-2" />
                Pointage Journalier
            </h1>
            <p className="text-gray-500 text-sm mt-1">
                Année scolaire: {schoolYear}
            </p>
        </div>
        
        <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setIsServiceDashboardOpen(true)}>
                Tableau de Bord Services
            </Button>
            <div className="flex items-center gap-4 bg-white p-2 rounded-lg shadow-sm border">
                <Label htmlFor="date" className="font-medium">Date du pointage:</Label>
                <Input 
                    id="date" 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)}
                    className="w-40"
                />
            </div>
        </div>
      </div>

      <ServiceDashboard 
        isOpen={isServiceDashboardOpen} 
        onClose={() => setIsServiceDashboardOpen(false)} 
      />

      <Tabs defaultValue="bus" className="w-full flex-1 flex flex-col" onValueChange={setActiveTab}>
        <div className="flex justify-between items-center mb-4">
            <TabsList>
                <TabsTrigger value="bus" className="flex items-center">
                    <Bus className="w-4 h-4 mr-2" />
                    Transport ({busStudents.length})
                </TabsTrigger>
                <TabsTrigger value="canteen" className="flex items-center">
                    <Utensils className="w-4 h-4 mr-2" />
                    Cantine ({canteenStudents.length})
                </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 text-sm mr-4">
                    <span className="flex items-center text-green-600 font-medium">
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Présents: {stats.present}
                    </span>
                    <span className="flex items-center text-red-500 font-medium">
                        <XCircle className="w-4 h-4 mr-1" />
                        Absents: {stats.absent}
                    </span>
                </div>
                <Button onClick={handleSave} disabled={saving || loading}>
                    {saving ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Enregistrer
                </Button>
            </div>
        </div>

        {loading ? (
            <div className="flex-1 flex items-center justify-center">Chargement...</div>
        ) : (
            <>
                <TabsContent value="bus" className="flex-1 bg-white rounded-lg shadow border overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 border-b grid grid-cols-12 gap-4 font-medium text-sm text-gray-500 uppercase">
                        <div className="col-span-1 text-center">Présence</div>
                        <div className="col-span-2">Matricule</div>
                        <div className="col-span-4">Nom & Prénoms</div>
                        <div className="col-span-2">Classe</div>
                        <div className="col-span-3">Trajet</div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {busStudents.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">Aucun élève inscrit au bus.</div>
                        ) : (
                            busStudents.map(student => (
                                <div 
                                    key={student.id} 
                                    className={`
                                        grid grid-cols-12 gap-4 items-center p-3 rounded-md transition-colors cursor-pointer border
                                        ${student.present ? 'bg-white border-gray-100 hover:bg-gray-50' : 'bg-red-50 border-red-100'}
                                    `}
                                    onClick={() => handleToggle(student.id, 'bus')}
                                >
                                    <div className="col-span-1 flex justify-center">
                                        <Checkbox 
                                            checked={student.present} 
                                            onCheckedChange={() => handleToggle(student.id, 'bus')}
                                            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                        />
                                    </div>
                                    <div className="col-span-2 font-mono text-sm">{student.registration_number}</div>
                                    <div className="col-span-4 font-medium">{student.last_name} {student.first_name}</div>
                                    <div className="col-span-2 text-sm text-gray-500">{student.class}</div>
                                    <div className="col-span-3 text-sm text-gray-500 truncate">{student.bus_route || '-'}</div>
                                </div>
                            ))
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="canteen" className="flex-1 bg-white rounded-lg shadow border overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 border-b grid grid-cols-12 gap-4 font-medium text-sm text-gray-500 uppercase">
                        <div className="col-span-1 text-center">Présence</div>
                        <div className="col-span-2">Matricule</div>
                        <div className="col-span-5">Nom & Prénoms</div>
                        <div className="col-span-4">Classe</div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {canteenStudents.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">Aucun élève inscrit à la cantine.</div>
                        ) : (
                            canteenStudents.map(student => (
                                <div 
                                    key={student.id} 
                                    className={`
                                        grid grid-cols-12 gap-4 items-center p-3 rounded-md transition-colors cursor-pointer border
                                        ${student.present ? 'bg-white border-gray-100 hover:bg-gray-50' : 'bg-red-50 border-red-100'}
                                    `}
                                    onClick={() => handleToggle(student.id, 'canteen')}
                                >
                                    <div className="col-span-1 flex justify-center">
                                        <Checkbox 
                                            checked={student.present} 
                                            onCheckedChange={() => handleToggle(student.id, 'canteen')}
                                            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                        />
                                    </div>
                                    <div className="col-span-2 font-mono text-sm">{student.registration_number}</div>
                                    <div className="col-span-5 font-medium">{student.last_name} {student.first_name}</div>
                                    <div className="col-span-4 text-sm text-gray-500">{student.class}</div>
                                </div>
                            ))
                        )}
                    </div>
                </TabsContent>
            </>
        )}
      </Tabs>
    </div>
  );
}
