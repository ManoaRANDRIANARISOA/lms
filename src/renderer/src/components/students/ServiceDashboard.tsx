import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Bus, Utensils, Users } from 'lucide-react';

interface ServiceStats {
    canteenStats: Record<string, number>;
    busStats: Record<string, number>;
    totalStudents: number;
}

interface ServiceDashboardProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ServiceDashboard: React.FC<ServiceDashboardProps> = ({ isOpen, onClose }) => {
    const [stats, setStats] = useState<ServiceStats | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadStats();
        }
    }, [isOpen]);

    const loadStats = async () => {
        if (!(window as any).api) return;
        setLoading(true);
        try {
            const result = await (window as any).api.student.getServiceStats();
            setStats(result);
        } catch (error) {
            console.error('Failed to load stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const dayLabels: Record<string, string> = {
        'Monday': 'Lundi',
        'Tuesday': 'Mardi',
        'Wednesday': 'Mercredi',
        'Thursday': 'Jeudi',
        'Friday': 'Vendredi'
    };

    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    return (
        <Dialog 
            isOpen={isOpen} 
            onClose={onClose}
            title="Tableau de Bord des Services"
            footer={<Button onClick={onClose}>Fermer</Button>}
        >
            {loading ? (
                <div className="p-8 text-center text-gray-500">Chargement des statistiques...</div>
            ) : stats ? (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="bg-blue-50 p-4 rounded-lg flex items-center justify-between border border-blue-100">
                        <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-full mr-3">
                                <Users className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-blue-800 font-medium">Total Élèves (Année en cours)</p>
                                <p className="text-2xl font-bold text-blue-900">{stats.totalStudents}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Canteen Stats */}
                        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold flex items-center mb-4 text-gray-800">
                                <Utensils className="w-5 h-5 mr-2 text-orange-500" />
                                Cantine (Par jour)
                            </h3>
                            <div className="space-y-3">
                                {dayOrder.map(day => (
                                    <div key={day} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded transition-colors">
                                        <span className="text-gray-600 font-medium">{dayLabels[day]}</span>
                                        <div className="flex items-center">
                                            <span className="font-bold text-gray-900 mr-2">{stats.canteenStats[day] || 0}</span>
                                            <span className="text-xs text-gray-400">élèves</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="mt-4 pt-3 border-t text-sm text-gray-500 text-center">
                                    Total des repas / semaine: {Object.values(stats.canteenStats).reduce((a, b) => a + b, 0)}
                                </div>
                            </div>
                        </div>

                        {/* Bus Stats */}
                        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold flex items-center mb-4 text-gray-800">
                                <Bus className="w-5 h-5 mr-2 text-green-600" />
                                Transport (Par ligne)
                            </h3>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                {Object.keys(stats.busStats).length > 0 ? (
                                    Object.entries(stats.busStats)
                                        .sort(([,a], [,b]) => b - a)
                                        .map(([route, count]) => (
                                            <div key={route} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded transition-colors border-b border-gray-50 last:border-0">
                                                <span className="text-gray-700 truncate max-w-[150px]" title={route}>
                                                    {route}
                                                </span>
                                                <span className="bg-green-100 text-green-800 py-1 px-2 rounded-full text-xs font-bold">
                                                    {count}
                                                </span>
                                            </div>
                                        ))
                                ) : (
                                    <div className="text-center py-8 text-gray-400 italic">
                                        Aucun élève inscrit au bus
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center text-red-500">Erreur lors du chargement des données.</div>
            )}
        </Dialog>
    );
};
