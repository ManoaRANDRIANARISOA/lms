import { useEffect, useState } from 'react'
import { useStudentStore } from '@/store/useStudentStore'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReEnrollModal } from '@/components/students/ReEnrollModal'
import { FinanceTab } from '@/components/students/FinanceTab'
import {
  ArrowLeft,
  Trash2,
  Edit,
  FileText,
  User,
  Users,
  Phone,
  MapPin,
  School,
  CheckCircle2,
  History,
  XCircle,
  Calendar,
  Bus,
  Utensils,
  Shirt,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Download
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getStudentPhotoUrl } from '@/lib/image-utils'
import { useNavigate } from 'react-router-dom'
import { useFinanceStore } from '@/store/useFinanceStore'
import { usePermissions } from '@/lib/usePermissions'
import type { FeeRecord } from '@shared/types'

interface StudentDetailProps {
  studentId: string
  onBack: () => void
  onEdit: () => void
}

const formatCanteenDays = (daysJson: string | string[] | undefined, daysPerWeek: number) => {
  if (!daysJson) return `${daysPerWeek} j/sem`
  try {
    const days = Array.isArray(daysJson) ? daysJson : JSON.parse(daysJson)
    if (!Array.isArray(days) || days.length === 0) return `${daysPerWeek} j/sem`

    const labels: Record<string, string> = {
      Monday: 'Lun',
      Tuesday: 'Mar',
      Wednesday: 'Mer',
      Thursday: 'Jeu',
      Friday: 'Ven'
    }

    return days.map((d: string) => labels[d] || d).join(', ')
  } catch {
    return `${daysPerWeek} j/sem`
  }
}

export default function StudentDetail({ studentId, onBack, onEdit }: StudentDetailProps) {
  const navigate = useNavigate()
  const {
    currentStudent,
    currentFees,
    currentFeesHistory,
    getStudent,
    updateStudent,
    loading,
    error,
    deleteStudent
  } = useStudentStore()
  const [imageError, setImageError] = useState(false)
  const [isReEnrollOpen, setIsReEnrollOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [events, setEvents] = useState<any[]>([])

  const { prices: financePrices, fetchPrices } = useFinanceStore()
  const { canWrite } = usePermissions()

  useEffect(() => {
    fetchPrices()
  }, [])

  useEffect(() => {
    if (studentId) {
      getStudent(studentId)
      setImageError(false) // Reset error state on new student
      
      // Fetch events
      if (window.api?.event?.getByStudent) {
        window.api.event.getByStudent(studentId).then(res => {
          if (res.success && res.events) {
            setEvents(res.events)
          }
        }).catch(err => console.error("Failed to fetch events", err))
      }
    }
  }, [studentId, getStudent])

  // Set default selected year to the latest enrollment or current fees year
  useEffect(() => {
    if (currentFeesHistory && currentFeesHistory.length > 0) {
      // Assuming history is sorted DESC by year (from repository)
      setSelectedYear(currentFeesHistory[0].school_year)
    } else if (currentFees?.school_year) {
      setSelectedYear(currentFees.school_year)
    } else {
      setSelectedYear('2025-2026') // Fallback
    }
  }, [currentFees, currentFeesHistory])

  const handleDelete = async () => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet élève ?')) {
      await deleteStudent(studentId)
      onBack()
    }
  }

  const handleToggleBus = async () => {
    if (!displayedFees) return
    const newValue = !displayedFees.bus_subscribed
    await updateStudent(studentId, {
      bus_subscribed: newValue,
      bus_route: newValue ? displayedFees.bus_route || '' : ''
    })
  }

  const handleToggleCanteen = async () => {
    if (!displayedFees) return
    const newValue = !displayedFees.canteen_subscribed
    await updateStudent(studentId, {
      canteen_subscribed: newValue,
      canteen_days: newValue ? (displayedFees.canteen_days || ['Monday','Tuesday','Wednesday','Thursday','Friday']) : [],
      canteen_days_per_week: newValue ? 5 : 0
    })
  }

  const handleReEnrollSuccess = () => {
    getStudent(studentId)
  }

  const handleRefresh = () => {
    getStudent(studentId)
  }

  const getDisplayClass = (fee: FeeRecord | null | undefined) => {
    // Priority 1: Class name stored in the fee record (History)
    if (fee?.class_name && fee.class_name !== 'Classe non spécifiée' && fee.class_name !== 'Non inscrit') {
      return fee.class_name
    }

    // Priority 2: Current student's active class (if valid)
    if (currentStudent?.class && currentStudent.class !== 'Classe non spécifiée' && currentStudent.class !== 'Non inscrit') {
      return currentStudent.class
    }

    return 'Non inscrit'
  }

  const displayedFees =
    currentFeesHistory?.find((f) => f.school_year === selectedYear) || currentFees

  if (loading) return <div className="p-6">Chargement...</div>
  if (error) return <div className="p-6 text-red-500">Erreur: {error}</div>
  if (!currentStudent) return <div className="p-6">Élève non trouvé</div>

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-gray-50/50">
      {/* Fixed Header Section */}
      <div className="p-6 pb-0 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <Button
            variant="ghost"
            onClick={onBack}
            className="pl-0 hover:bg-transparent hover:text-primary"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à la liste
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              title="Rafraîchir les données"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            {canWrite('students') && (
              <Button variant="outline" size="sm" onClick={() => setIsReEnrollOpen(true)}>
                <History className="w-4 h-4 mr-2" />
                {!currentFees
                  ? 'Inscrire'
                  : 'Réinscrire'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/certificate/${studentId}`)}
            >
              <FileText className="w-4 h-4 mr-2" />
              Certificat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!currentStudent) return
                const result = await window.api.pdf.generateCertificate({
                  first_name: currentStudent.first_name,
                  last_name: currentStudent.last_name,
                  date_of_birth: currentStudent.date_of_birth,
                  place_of_birth: currentStudent.place_of_birth,
                  class_name: currentStudent.class || currentFees?.class_name || '',
                  school_year: currentFees?.school_year || '',
                  registration_number: currentStudent.registration_number
                })
                if (result.success && result.filePath) {
                  await window.api.pdf.openFile(result.filePath)
                } else {
                  alert(result.error || 'Erreur génération PDF')
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
            {canWrite('students') && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Modifier
              </Button>
            )}
            {canWrite('students') && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            )}
          </div>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden mb-6 border border-gray-100">
          <div className="bg-primary px-6 py-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-4">
                {!imageError && currentStudent.photo_path ? (
                  <img
                    src={getStudentPhotoUrl(currentStudent.photo_path) || ''}
                    alt="Student"
                    className="w-16 h-16 rounded-full object-cover border-2 border-white bg-white"
                    onError={(e) => {
                      console.warn('Image load failed in Detail:', e.currentTarget.src)
                      setImageError(true)
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold border-2 border-white">
                    {currentStudent.first_name?.charAt(0) || 'E'}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    {currentStudent.last_name} {currentStudent.first_name}
                    {currentStudent.gender && (
                      <span className="text-sm font-normal opacity-75 bg-white/20 px-2 py-0.5 rounded-full">
                        {currentStudent.gender === 'M' ? 'Garçon' : 'Fille'}
                      </span>
                    )}
                  </h1>
                  <p className="text-primary-foreground/80 mt-1">
                    Classe: {getDisplayClass(displayedFees)}
                    <span className="text-xs opacity-75 ml-2">({selectedYear})</span>
                  </p>
                </div>
              </div>
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                {currentStudent.registration_number}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        <Tabs defaultValue="dossier" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="dossier">Dossier Actuel</TabsTrigger>
            <TabsTrigger value="historique">Parcours Scolaire</TabsTrigger>
            <TabsTrigger value="finance">Finance & Paiements</TabsTrigger>
          </TabsList>

          <TabsContent value="finance">
            <div className="mb-4 flex items-center justify-end">
              <label className="mr-2 text-sm font-medium text-gray-700">Année Scolaire:</label>
              <select
                className="border rounded p-1 text-sm bg-white"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {currentFeesHistory?.map((fee) => (
                  <option key={fee.id} value={fee.school_year}>
                    {fee.school_year}
                  </option>
                ))}
                {!currentFeesHistory?.length && <option value="2025-2026">2025-2026</option>}
              </select>
            </div>
            {events.length > 0 && (
              <div className="bg-white shadow rounded-lg overflow-hidden mb-6 border border-gray-100">
                <div className="px-6 py-4 border-b bg-blue-50/50">
                  <h3 className="text-lg font-semibold flex items-center text-blue-900">
                    <Calendar className="w-5 h-5 mr-2" />
                    Événements & Participations
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {events.map((ev) => (
                      <div key={ev.id} className="border rounded-lg p-4 bg-white relative overflow-hidden border-blue-100">
                        {ev.family_payment_status?.is_paid && (
                          <div className="absolute -right-6 -top-6 w-16 h-16 bg-green-100 rounded-full flex items-end justify-center pb-2 pl-2 shadow-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          </div>
                        )}
                        <h4 className="font-semibold text-lg pr-6 text-gray-800">{ev.event_name}</h4>
                        <p className="text-sm text-gray-500 mb-3 capitalize">{format(new Date(ev.event_date), 'dd MMMM yyyy', { locale: fr })}</p>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center bg-gray-50 p-2 rounded">
                            <span className="text-gray-600">Frais (par parent):</span>
                            <span className="font-semibold">{ev.amount_per_parent.toLocaleString()} Ar</span>
                          </div>
                          <div className="flex justify-between items-center bg-gray-50 p-2 rounded">
                            <span className="text-gray-600">Total payé (fratrie):</span>
                            <span className={`font-semibold ${ev.family_payment_status?.is_paid ? 'text-green-600' : 'text-orange-600'}`}>
                              {ev.family_payment_status?.total_paid?.toLocaleString() || 0} Ar
                            </span>
                          </div>
                          
                          {ev.family_payment_status?.is_paid ? (
                            <div className="mt-3 flex items-center text-green-700 text-sm font-medium bg-green-50 p-2 rounded justify-center border border-green-100">
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Participation réglée
                            </div>
                          ) : (
                            <div className="mt-3 flex items-center text-orange-700 text-sm font-medium bg-orange-50 p-2 rounded justify-center border border-orange-100">
                              Reste à payer: {(ev.amount_per_parent - (ev.family_payment_status?.total_paid || 0)).toLocaleString()} Ar
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-4 italic">
                    Note: Les événements sont gérés par famille (parent). Si un membre de la fratrie a payé, la participation est validée pour tous les autres membres inscrits à l'événement.
                  </p>
                </div>
              </div>
            )}
            
            <FinanceTab
              studentId={studentId}
              schoolYear={selectedYear || '2025-2026'}
              feeRecord={displayedFees ?? undefined}
            />
          </TabsContent>

          <TabsContent value="dossier">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Informations Personnelles
                  </h3>
                  <dl className="space-y-3">
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm">Date de naissance</dt>
                      <dd className="col-span-2 text-sm">{currentStudent.date_of_birth || '-'}</dd>
                    </div>
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm">Lieu de naissance</dt>
                      <dd className="col-span-2 text-sm">{currentStudent.place_of_birth || '-'}</dd>
                    </div>
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm flex items-center">
                        <MapPin className="w-3 h-3 mr-1" />
                        Adresse
                      </dt>
                      <dd className="col-span-2 text-sm">{currentStudent.address || '-'}</dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Informations Familiales
                  </h3>
                  <dl className="space-y-3">
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm">Père</dt>
                      <dd className="col-span-2 text-sm">{currentStudent.father_name || '-'}</dd>
                    </div>
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm">Mère</dt>
                      <dd className="col-span-2 text-sm">{currentStudent.mother_name || '-'}</dd>
                    </div>
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm">Tuteur</dt>
                      <dd className="col-span-2 text-sm">{currentStudent.guardian_name || '-'}</dd>
                    </div>
                    <div className="grid grid-cols-3">
                      <dt className="text-gray-500 text-sm font-medium flex items-center">
                        <Phone className="w-3 h-3 mr-1" />
                        Contact
                      </dt>
                      <dd className="col-span-2 text-sm font-medium">
                        {currentStudent.guardian_contact}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                  <School className="w-4 h-4 mr-2" />
                  Scolarité
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-500 text-xs">Date d'inscription</span>
                    <p>{currentStudent.enrollment_date}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">École précédente</span>
                    <p>{currentStudent.previous_school || '-'}</p>
                  </div>
                </div>

                {/* Departure date */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  {currentStudent.departure_date ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 font-medium">Élève parti(e)</span>
                        <span className="text-sm font-semibold text-red-700">
                          {new Date(currentStudent.departure_date).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      {canWrite('students') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            if (confirm('Réintégrer cet élève ? Sa date de départ sera effacée.')) {
                              updateStudent(studentId, { departure_date: undefined })
                            }
                          }}
                        >
                          Réintégrer
                        </Button>
                      )}
                    </div>
                  ) : (
                    canWrite('students') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          const date = prompt('Date de départ (AAAA-MM-JJ) :', new Date().toISOString().split('T')[0])
                          if (date && confirm(`Confirmer le départ de cet élève au ${new Date(date).toLocaleDateString('fr-FR')} ?\n\nLes impayés après cette date ne seront plus comptabilisés.`)) {
                            updateStudent(studentId, { departure_date: date })
                          }
                        }}
                      >
                        Marquer comme ayant quitté
                      </Button>
                    )
                  )}
                </div>
              </div>

              {/* Services & Fees Section - Now Dynamic based on Selected Year */}
              {displayedFees && (
                <div className="px-6 py-4 border-t">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      Services & Frais ({displayedFees.school_year})
                    </h3>
                    {/* Year Selector for Dossier View as well */}
                    <select
                      className="border rounded p-1 text-xs bg-white"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                    >
                      {currentFeesHistory?.map((fee) => (
                        <option key={fee.id} value={fee.school_year}>
                          {fee.school_year}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tuition / Scolarité */}
                  <div className="mb-4 bg-blue-50 p-3 rounded-md border border-blue-100">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-blue-900 flex items-center">
                        <School className="w-4 h-4 mr-2" />
                        Écolage Mensuel ({getDisplayClass(displayedFees)})
                      </span>
                      <span className="font-bold text-blue-700">
                        {financePrices?.tuition?.[displayedFees?.tuition_level]
                          ? `${financePrices.tuition[displayedFees.tuition_level].toLocaleString()} Ar`
                          : displayedFees?.monthly_tuition
                            ? `${displayedFees.monthly_tuition.toLocaleString()} Ar`
                            : '-'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center justify-between">
                        <span className="flex items-center">
                          <Bus className="w-4 h-4 mr-2" />
                          Transport & Restauration
                        </span>
                        {canWrite('students') && (
                          <span className="text-xs text-gray-400">Cliquez pour activer/désactiver</span>
                        )}
                      </h4>
                      <div className="space-y-3">
                        {/* Bus Toggle */}
                        <button
                          onClick={handleToggleBus}
                          disabled={!canWrite('students')}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                            displayedFees.bus_subscribed
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          } ${!canWrite('students') ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Bus className={`w-5 h-5 ${displayedFees.bus_subscribed ? 'text-yellow-600' : 'text-gray-400'}`} />
                            <div>
                              <p className="text-sm font-medium">Bus Scolaire</p>
                              <p className="text-xs text-gray-500">
                                {displayedFees.bus_subscribed
                                  ? (displayedFees.bus_route || 'Zone non définie')
                                  : 'Non inscrit'}
                              </p>
                            </div>
                          </div>
                          {displayedFees.bus_subscribed ? (
                            <ToggleRight className="w-6 h-6 text-yellow-600" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-400" />
                          )}
                        </button>

                        {/* Canteen Toggle */}
                        <button
                          onClick={handleToggleCanteen}
                          disabled={!canWrite('students')}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                            displayedFees.canteen_subscribed
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          } ${!canWrite('students') ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Utensils className={`w-5 h-5 ${displayedFees.canteen_subscribed ? 'text-orange-600' : 'text-gray-400'}`} />
                            <div>
                              <p className="text-sm font-medium">Cantine</p>
                              <p className="text-xs text-gray-500">
                                {displayedFees.canteen_subscribed
                                  ? formatCanteenDays(displayedFees.canteen_days, displayedFees.canteen_days_per_week)
                                  : 'Non inscrit'}
                              </p>
                            </div>
                          </div>
                          {displayedFees.canteen_subscribed ? (
                            <ToggleRight className="w-6 h-6 text-orange-600" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center">
                        <Shirt className="w-4 h-4 mr-2" />
                        Uniformes & Accessoires
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className={`flex items-center ${displayedFees.uniform_tshirt_purchased ? 'text-green-600' : 'text-gray-400'}`}>
                          {displayedFees.uniform_tshirt_purchased ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2 opacity-50" />} 
                          <span className={!displayedFees.uniform_tshirt_purchased ? 'line-through opacity-70' : ''}>T-shirt</span>
                        </li>
                        <li className={`flex items-center ${displayedFees.uniform_apron_purchased ? 'text-green-600' : 'text-gray-400'}`}>
                          {displayedFees.uniform_apron_purchased ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2 opacity-50" />} 
                          <span className={!displayedFees.uniform_apron_purchased ? 'line-through opacity-70' : ''}>Tablier</span>
                        </li>
                        <li className={`flex items-center ${displayedFees.uniform_shorts_purchased ? 'text-green-600' : 'text-gray-400'}`}>
                          {displayedFees.uniform_shorts_purchased ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2 opacity-50" />} 
                          <span className={!displayedFees.uniform_shorts_purchased ? 'line-through opacity-70' : ''}>Short</span>
                        </li>
                        <li className={`flex items-center ${displayedFees.uniform_badge_purchased ? 'text-green-600' : 'text-gray-400'}`}>
                          {displayedFees.uniform_badge_purchased ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2 opacity-50" />} 
                          <span className={!displayedFees.uniform_badge_purchased ? 'line-through opacity-70' : ''}>Badge</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                </div>
              )}
            </div>


          </TabsContent>

          <TabsContent value="historique">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  Historique des Inscriptions
                </h3>
              </div>
              {currentFeesHistory && currentFeesHistory.length > 0 ? (
                <div className="divide-y">
                  {currentFeesHistory.map((fee) => {
                    const displayClass = getDisplayClass(fee)

                    return (
                      <div key={fee.id} className="p-6 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <h4 className="text-xl font-bold text-primary">{fee.school_year}</h4>
                              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                {displayClass}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              Niveau: {fee.tuition_level}
                            </p>
                          </div>
                          <div className="flex items-center text-green-600">
                            <CheckCircle2 className="w-5 h-5 mr-1" />
                            <span className="text-sm font-medium">Inscrit</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-gray-50/50 p-4 rounded-lg">
                          <div>
                            <span className="text-gray-500 block mb-1">Services Souscrits</span>
                            <ul className="space-y-1">
                              {fee.bus_subscribed && (
                                <li className="flex items-center">
                                  <Bus className="w-3 h-3 mr-2" /> Bus ({fee.bus_route})
                                </li>
                              )}
                              {fee.canteen_subscribed && (
                                <li className="flex items-center">
                                  <Utensils className="w-3 h-3 mr-2" /> Cantine (
                                  {formatCanteenDays(fee.canteen_days, fee.canteen_days_per_week)})
                                </li>
                              )}
                              {!fee.bus_subscribed && !fee.canteen_subscribed && (
                                <li className="text-gray-400 italic">Aucun service</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <span className="text-gray-500 block mb-1">Uniformes</span>
                            <div className="flex flex-wrap gap-2">
                              {!!Number(fee.uniform_tshirt_purchased) && (
                                <span className="px-2 py-0.5 bg-white border rounded text-xs">
                                  T-shirt
                                </span>
                              )}
                              {!!Number(fee.uniform_apron_purchased) && (
                                <span className="px-2 py-0.5 bg-white border rounded text-xs">
                                  Tablier
                                </span>
                              )}
                              {!!Number(fee.uniform_shorts_purchased) && (
                                <span className="px-2 py-0.5 bg-white border rounded text-xs">
                                  Short
                                </span>
                              )}
                              {!!Number(fee.uniform_badge_purchased) && (
                                <span className="px-2 py-0.5 bg-white border rounded text-xs">
                                  Écusson
                                </span>
                              )}
                              {!Number(fee.uniform_tshirt_purchased) &&
                                !Number(fee.uniform_apron_purchased) &&
                                !Number(fee.uniform_shorts_purchased) &&
                                !Number(fee.uniform_badge_purchased) && (
                                  <span className="text-gray-400 italic">Aucun achat</span>
                                )}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500 block mb-1">Scolarité Mensuelle</span>
                            <div className="flex flex-col">
                              {financePrices?.tuition?.[fee.tuition_level] ? (
                                <>
                                  <p className="font-semibold">
                                    {financePrices.tuition[fee.tuition_level].toLocaleString()} Ar
                                  </p>
                                  {financePrices.tuition[fee.tuition_level] !==
                                    fee.monthly_tuition && (
                                    <span className="text-xs text-gray-400 line-through">
                                      {fee.monthly_tuition?.toLocaleString()} Ar (Ancien)
                                    </span>
                                  )}
                                </>
                              ) : (
                                <p className="font-semibold">
                                  {fee.monthly_tuition?.toLocaleString()} Ar
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Aucun historique disponible pour cet élève.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <ReEnrollModal
          isOpen={isReEnrollOpen}
          onClose={() => setIsReEnrollOpen(false)}
          student={currentStudent}
          currentYear={displayedFees?.school_year || currentFees?.school_year || '2025-2026'}
          onSuccess={handleReEnrollSuccess}
        />
      </div>
    </div>
  )
}
