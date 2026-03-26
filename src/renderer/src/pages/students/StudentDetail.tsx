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
  Phone,
  MapPin,
  School,
  Users,
  Bus,
  Utensils,
  Shirt,
  History,
  Calendar,
  CheckCircle2,
  RefreshCw
} from 'lucide-react'
import { getStudentPhotoUrl } from '@/lib/image-utils'
import { useNavigate } from 'react-router-dom'
import { useFinanceStore } from '@/store/useFinanceStore'

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

    return days.map((d: any) => labels[d] || d).join(', ')
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
    loading,
    error,
    deleteStudent
  } = useStudentStore()
  const [imageError, setImageError] = useState(false)
  const [isReEnrollOpen, setIsReEnrollOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string>('')

  const { prices: financePrices, fetchPrices } = useFinanceStore()

  useEffect(() => {
    fetchPrices()
  }, [])

  useEffect(() => {
    if (studentId) {
      getStudent(studentId)
      setImageError(false) // Reset error state on new student
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

  const handleReEnrollSuccess = () => {
    getStudent(studentId) // Refresh data
  }

  const handleRefresh = () => {
    getStudent(studentId)
  }

  const getDisplayClass = (fee: any) => {
    // Priority 1: Class name stored in the fee record (History)
    if (fee?.class_name && fee.class_name !== 'Classe non spécifiée') {
      return fee.class_name
    }

    // Priority 2: If we are looking at the current student's active year/context
    // We check if the fee record corresponds to the current enrollment
    // or if we have no fee record (default view)
    const isCurrentContext =
      !fee ||
      (currentFees && fee.id === currentFees.id) ||
      fee.school_year === currentFees?.school_year

    if (isCurrentContext && currentStudent?.class) {
      return currentStudent.class
    }

    return 'Classe non spécifiée'
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
            <Button variant="outline" size="sm" onClick={() => setIsReEnrollOpen(true)}>
              <History className="w-4 h-4 mr-2" />
              {!currentStudent?.class || currentStudent.class === 'Classe non spécifiée'
                ? 'Inscrire'
                : 'Réinscrire'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/certificate/${studentId}`)}
            >
              <FileText className="w-4 h-4 mr-2" />
              Certificat
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Modifier
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </Button>
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
                  <h1 className="text-2xl font-bold">
                    {currentStudent.last_name} {currentStudent.first_name}
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
            <FinanceTab
              studentId={studentId}
              schoolYear={selectedYear || '2025-2026'}
              feeRecord={displayedFees}
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
                      <h4 className="font-medium text-sm mb-2 flex items-center">
                        <Bus className="w-4 h-4 mr-2" />
                        Transport & Restauration
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Bus:</span>
                          <div className="text-right">
                            <span
                              className={
                                displayedFees.bus_subscribed
                                  ? 'text-green-600 font-medium block'
                                  : 'text-gray-400 block'
                              }
                            >
                              {displayedFees.bus_subscribed
                                ? `Oui (${displayedFees.bus_route || 'Zone ?'})`
                                : 'Non'}
                            </span>
                            {displayedFees.bus_subscribed &&
                              financePrices?.bus?.[displayedFees.bus_route] && (
                                <span className="text-xs text-gray-500">
                                  {financePrices.bus[displayedFees.bus_route].toLocaleString()}{' '}
                                  Ar/mois
                                </span>
                              )}
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 flex items-center">
                            <Utensils className="w-3 h-3 mr-1" />
                            Cantine:
                          </span>
                          <div className="text-right">
                            <span
                              className={
                                displayedFees.canteen_subscribed
                                  ? 'text-green-600 font-medium block'
                                  : 'text-gray-400 block'
                              }
                            >
                              {displayedFees.canteen_subscribed
                                ? `Oui (${formatCanteenDays(displayedFees.canteen_days, displayedFees.canteen_days_per_week)})`
                                : 'Non'}
                            </span>
                            {displayedFees.canteen_subscribed && (
                              <span className="text-xs text-gray-500">
                                {(() => {
                                  let days = displayedFees.canteen_days_per_week || 0
                                  if (
                                    Array.isArray(displayedFees.canteen_days) &&
                                    displayedFees.canteen_days.length > 0
                                  ) {
                                    days = displayedFees.canteen_days.length
                                  }
                                  const effectiveDays = days === 0 ? 5 : days

                                  if (effectiveDays >= 5) {
                                    return financePrices?.canteen?.monthly
                                      ? `${financePrices.canteen.monthly.toLocaleString()} Ar/mois`
                                      : '-'
                                  } else {
                                    const daily = financePrices?.canteen?.daily || 0
                                    const monthly = daily * effectiveDays * 4
                                    return `${monthly.toLocaleString()} Ar/mois (${effectiveDays}j/sem)`
                                  }
                                })()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center">
                        <Shirt className="w-4 h-4 mr-2" />
                        Tenues & Accessoires
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {!!displayedFees.uniform_tshirt_purchased && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-gray-900">T-shirt Sport</span>
                            </div>
                            {financePrices?.uniforms?.['T-shirt'] && (
                              <span className="text-xs text-gray-400 ml-4">
                                {financePrices.uniforms['T-shirt'].toLocaleString()} Ar
                              </span>
                            )}
                          </div>
                        )}

                        {!!displayedFees.uniform_apron_purchased && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-gray-900">Tablier</span>
                            </div>
                            {financePrices?.uniforms?.['Tablier'] && (
                              <span className="text-xs text-gray-400 ml-4">
                                {financePrices.uniforms['Tablier'].toLocaleString()} Ar
                              </span>
                            )}
                          </div>
                        )}

                        {!!displayedFees.uniform_shorts_purchased && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-gray-900">Short</span>
                            </div>
                            {financePrices?.uniforms?.['Short'] && (
                              <span className="text-xs text-gray-400 ml-4">
                                {financePrices.uniforms['Short'].toLocaleString()} Ar
                              </span>
                            )}
                          </div>
                        )}

                        {!!displayedFees.uniform_badge_purchased && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-gray-900">Écusson</span>
                            </div>
                            {financePrices?.uniforms?.['Ecusson'] && (
                              <span className="text-xs text-gray-400 ml-4">
                                {financePrices.uniforms['Ecusson'].toLocaleString()} Ar
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="md:col-span-2 border-t pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">Cotisation FRAM</span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${displayedFees.fram_paid_by_parent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {displayedFees.fram_paid_by_parent
                            ? 'Payé par les parents'
                            : 'Inclus / Non spécifié'}
                        </span>
                      </div>
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
