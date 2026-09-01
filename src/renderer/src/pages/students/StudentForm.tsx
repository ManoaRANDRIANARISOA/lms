import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { useStudentStore, Student } from '@/store/useStudentStore'
import type { FeeRecord } from '@shared/types'
import { useState, useEffect } from 'react'
import { getStudentPhotoUrl } from '@/lib/image-utils'
import { Search, X, Plus, UserCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useFinanceStore } from '@/store/useFinanceStore'
import { usePersonnelStore } from '@/store/usePersonnelStore'
import { useAppStore } from '@/store/useAppStore'
import { useClasses } from '@/lib/useClasses'

const studentSchema = z.object({
  first_name: z.string().min(2, 'Le prénom est requis'),
  last_name: z.string().min(2, 'Le nom est requis'),
  gender: z.enum(['M', 'F']).optional(),
  date_of_birth: z.string().optional(),
  place_of_birth: z.string().optional(),
  class: z.string().optional(),
  enrollment_date: z.string().min(1, "La date d'inscription est requise"),

  email: z
    .string()
    .transform((val) => val.trim())
    .pipe(z.string().email('Email invalide').or(z.literal('')))
    .optional(),

  father_name: z.string().optional(),
  father_contact: z.string().optional(),
  father_profession: z.string().optional(),

  mother_name: z.string().optional(),
  mother_contact: z.string().optional(),
  mother_profession: z.string().optional(),

  guardian_name: z.string().optional(),
  guardian_contact: z.string().optional(),
  guardian_profession: z.string().optional(),

  address: z.string().optional(),
  previous_school: z.string().optional(),
  photo_path: z.string().optional(),

  siblings: z.array(z.string()),

  // Services & Fees
  bus_subscribed: z.boolean().optional(),
  bus_route: z.string().optional(),
  canteen_subscribed: z.boolean().optional(),
  canteen_days_per_week: z
    .number()
    .min(0)
    .max(5)
    .or(z.nan())
    .transform((val) => (isNaN(val) ? 0 : val)),
  canteen_days: z.array(z.string()).optional(),

  uniform_items_purchased: z.array(z.string()).optional(),

  fram_paid_by_parent: z.boolean().optional(),
  is_personnel_child: z.boolean().optional(),
  parent_personnel_id: z.string().nullable().optional(),

  initial_payment_amount: z.number().optional(),
  initial_payment_type: z.string().optional()
})

type StudentFormValues = z.infer<typeof studentSchema>

interface StudentFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  initialData?: Student | null
  initialFees?: FeeRecord | null
}

interface SiblingDisplay {
  id: string
  first_name: string
  last_name: string
  class: string
}

export default function StudentForm({
  onSuccess,
  onCancel,
  initialData,
  initialFees
}: StudentFormProps) {
  const { createStudent, updateStudent, error } = useStudentStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('identity')

  // Sibling Search State
  const [siblingQuery, setSiblingQuery] = useState('')
  const [siblingResults, setSiblingResults] = useState<SiblingDisplay[]>([])
  const [selectedSiblings, setSelectedSiblings] = useState<SiblingDisplay[]>([])
  const [isSearchingSiblings, setIsSearchingSiblings] = useState(false)
  const { prices, fetchPrices } = useFinanceStore()
  const { classes: availableClasses } = useClasses()

  const [enrollmentType, setEnrollmentType] = useState<'enrollment' | 'reenrollment'>(
    initialFees?.is_reenrollment
      ? 'reenrollment'
      : initialData?.student_status === 'Ancien'
        ? 'reenrollment'
        : 'enrollment'
  )

  useEffect(() => {
    if (initialData) {
      setEnrollmentType(
        initialFees?.is_reenrollment
          ? 'reenrollment'
          : initialData.student_status === 'Ancien'
            ? 'reenrollment'
            : 'enrollment'
      )
    }
  }, [initialData, initialFees])

  const availableBusRoutes =
    prices.busRoutes && prices.busRoutes.length > 0
      ? prices.busRoutes
      : Object.keys(prices.bus || {})

  const { personnel, fetchPersonnel } = usePersonnelStore()

  useEffect(() => {
    fetchPrices()
    fetchPersonnel()
  }, [])

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(
      initialData 
        ? studentSchema.extend({ class: z.string().min(1, 'La classe est requise') }) 
        : studentSchema
    ),
    defaultValues: {
      first_name: '',
      last_name: '',
      class: '',
      enrollment_date: new Date().toISOString().split('T')[0],
      email: '',

      father_name: '',
      father_contact: '',
      father_profession: '',

      mother_name: '',
      mother_contact: '',
      mother_profession: '',

      guardian_name: '',
      guardian_contact: '',
      guardian_profession: '',

      gender: undefined,
      date_of_birth: '',
      place_of_birth: '',
      address: '',
      previous_school: '',
      photo_path: '',
      siblings: [],

      bus_subscribed: false,
      bus_route: '',
      canteen_subscribed: false,
      canteen_days_per_week: 0,
      uniform_items_purchased: [],
      fram_paid_by_parent: false,
      is_personnel_child: false,
      parent_personnel_id: null,
      initial_payment_amount: 0,
      initial_payment_type: 'enrollment'
    }
  })

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoadingImage, setIsLoadingImage] = useState(false)

  // Load initial data
  useEffect(() => {
    if (initialData) {
      setPreviewUrl(initialData.photo_path || null)

      const formData: StudentFormValues = {
        first_name: initialData.first_name,
        last_name: initialData.last_name,
        class: initialData.class,
        enrollment_date: initialData.enrollment_date,
        email: (initialData as unknown as { email?: string }).email || '',

        father_name: initialData.father_name || '',
        father_contact: initialData.father_contact || '',
        father_profession: initialData.father_profession || '',

        mother_name: initialData.mother_name || '',
        mother_contact: initialData.mother_contact || '',
        mother_profession: initialData.mother_profession || '',

        guardian_name: initialData.guardian_name || '',
        guardian_contact: initialData.guardian_contact || '',
        guardian_profession: initialData.guardian_profession || '',

        gender: initialData.gender,
        date_of_birth: initialData.date_of_birth || '',
        place_of_birth: initialData.place_of_birth || '',
        address: initialData.address || '',
        previous_school: initialData.previous_school || '',
        photo_path: initialData.photo_path || '',
        siblings: initialData.siblings || [],

        bus_subscribed: false,
        bus_route: '',
        canteen_subscribed: false,
        canteen_days_per_week: 0,
        canteen_days: [],
        uniform_items_purchased: [],
        fram_paid_by_parent: false,
        is_personnel_child: Boolean(initialData.is_personnel_child),
        parent_personnel_id: initialData.parent_personnel_id || null,
        initial_payment_amount: 0,
        initial_payment_type: 'enrollment'
      }

      // Load Fees if available
      if (initialFees) {
        formData.bus_subscribed = Boolean(initialFees.bus_subscribed)
        formData.bus_route = initialFees.bus_route || ''
        formData.canteen_subscribed = Boolean(initialFees.canteen_subscribed)
        formData.canteen_days_per_week = initialFees.canteen_days_per_week || 0
        formData.canteen_days = Array.isArray(initialFees.canteen_days)
          ? initialFees.canteen_days
          : initialFees.canteen_days
            ? JSON.parse(initialFees.canteen_days)
            : []

        formData.uniform_items_purchased = initialFees.uniform_items_purchased || []

        formData.fram_paid_by_parent = Boolean(initialFees.fram_paid_by_parent)
      }

      form.reset(formData)

      // Fetch sibling details if any
      if (initialData.siblings && initialData.siblings.length > 0) {
        loadSiblings(initialData.siblings)
      }
    }
  }, [initialData, initialFees, form])

  const loadSiblings = async (siblingIds: string[]) => {
    if (!window.api) return

    try {
      const siblings: SiblingDisplay[] = []
      for (const id of siblingIds) {
        const result = await window.api.student.get(id)
        if (result.success && result.student) {
          siblings.push({
            id: result.student.id,
            first_name: result.student.first_name,
            last_name: result.student.last_name,
            class: result.student.class
          })
        }
      }
      setSelectedSiblings(siblings)
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load siblings', err)
    }
  }

  // Search siblings effect
  useEffect(() => {
    if (siblingQuery.length < 2) {
      setSiblingResults([])
      return
    }

    const timer = setTimeout(async () => {
      if (!window.api) return
      setIsSearchingSiblings(true)
      try {
        const result = await window.api.student.list({
          search: siblingQuery,
          limit: 5
        })
        // Filter out current student (if editing) and already selected siblings
        const filtered = result.students.filter(
          (s: Student) =>
            s.id !== initialData?.id && !selectedSiblings.some((sel) => sel.id === s.id)
        )
        setSiblingResults(filtered)
      } catch (err) {
        if (import.meta.env.DEV) console.error('Search failed', err)
      } finally {
        setIsSearchingSiblings(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [siblingQuery, initialData, selectedSiblings])

  const addSibling = (student: SiblingDisplay) => {
    const newSiblings = [...selectedSiblings, student]
    setSelectedSiblings(newSiblings)
    form.setValue(
      'siblings',
      newSiblings.map((s) => s.id)
    )
    setSiblingQuery('')
    setSiblingResults([])
  }

  const removeSibling = (id: string) => {
    const newSiblings = selectedSiblings.filter((s) => s.id !== id)
    setSelectedSiblings(newSiblings)
    form.setValue(
      'siblings',
      newSiblings.map((s) => s.id)
    )
  }

  const onSubmit = async (data: StudentFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = { ...data }
      payload.siblings = selectedSiblings.map((s) => s.id)

      let success = false
      if (initialData) {
        success = await updateStudent(initialData.id, payload)

        // Rectify enrollment type if changed by user
        const initialType = initialFees?.is_reenrollment
          ? 'reenrollment'
          : initialData.student_status === 'Ancien'
            ? 'reenrollment'
            : 'enrollment'

        if (enrollmentType !== initialType && window.api?.student?.rectifyEnrollmentType) {
          const targetYear = initialFees?.school_year || useAppStore.getState().currentYear
          await window.api.student.rectifyEnrollmentType(initialData.id, targetYear, enrollmentType)
        }

        if (success) toast.success("Dossier élève mis à jour avec succès")
      } else {
        success = await createStudent(payload)
        if (success) toast.success("Dossier élève créé avec succès")
      }

      if (success && onSuccess) {
        onSuccess()
      } else if (!success) {
        toast.error("Erreur lors de l'enregistrement", { 
          description: useStudentStore.getState().error || "Vérifiez les données saisies." 
        })
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error submitting form:', err)
      toast.error("Erreur inattendue")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">
        {initialData ? "Modifier l'Élève" : 'Nouvel Élève'}
      </h2>


      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

      <form 
        onSubmit={form.handleSubmit(onSubmit, (errors) => {
          // Identify which tab has the first error
          const identityFields = ['first_name', 'last_name', 'gender', 'date_of_birth', 'place_of_birth', 'class', 'enrollment_date', 'email', 'previous_school', 'photo_path']
          const familyFields = ['father_name', 'father_contact', 'father_profession', 'mother_name', 'mother_contact', 'mother_profession', 'guardian_name', 'guardian_contact', 'guardian_profession', 'address', 'siblings']
          
          let targetTab: string | null = null
          let firstErrorField: string | null = null

          for (const field of Object.keys(errors)) {
            if (!targetTab) {
              if (identityFields.includes(field)) targetTab = 'identity'
              else if (familyFields.includes(field)) targetTab = 'family'
              else targetTab = 'services'
              
              firstErrorField = field
            }
          }

          if (targetTab && targetTab !== activeTab) {
             setActiveTab(targetTab)
          }

          // Wait for tab to render before focusing
          setTimeout(() => {
             if (firstErrorField) {
                const el = document.getElementById(firstErrorField)
                if (el) {
                   el.focus()
                   // This will show a native tooltip if the browser supports it
                   if (typeof (el as HTMLInputElement).reportValidity === 'function') {
                      (el as HTMLInputElement).reportValidity()
                   }
                }
             }
          }, 100)

          toast.error("Formulaire incomplet", {
            description: "Veuillez vérifier les champs indiqués en rouge."
          })
        })} 
        className="space-y-4"
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${initialData ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="identity">Identité</TabsTrigger>
            <TabsTrigger value="family">Famille</TabsTrigger>
            {initialData && <TabsTrigger value="services">Services & Frais</TabsTrigger>}
          </TabsList>

          <TabsContent value="identity" className="space-y-4 pt-4">
            {/* Photo Field */}
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mb-4">
              <label htmlFor="photo_path" className="block text-sm font-medium mb-2">
                Photo de l'élève
              </label>
              <div className="flex gap-4 items-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm relative">
                  {isLoadingImage && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  {previewUrl ? (
                    <img
                      src={getStudentPhotoUrl(previewUrl) || ''}
                      alt="Aperçu"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        if (previewUrl && !previewUrl.startsWith('data:')) {
                          e.currentTarget.style.opacity = '0.5'
                        }
                      }}
                    />
                  ) : (
                    <span className="text-gray-400 text-xs">Aucune</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex gap-2">
                    <Input
                      id="photo_path"
                      {...form.register('photo_path')}
                      placeholder="URL de l'image ou chemin local..."
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isLoadingImage}
                      onClick={async () => {
                        if (window.api) {
                          setIsLoadingImage(true)
                          try {
                            const result = await window.api.dialog.openFile()
                            if (result) {
                              if (typeof result === 'object' && result.filePath) {
                                form.setValue('photo_path', result.filePath)
                                if (result.preview) {
                                  setPreviewUrl(result.preview)
                                } else {
                                  setPreviewUrl(result.filePath)
                                }
                              } else if (typeof result === 'string') {
                                form.setValue('photo_path', result)
                                setPreviewUrl(result)
                              }
                            }
                          } catch (err) {
                            if (import.meta.env.DEV)
                              console.error('Failed to open file dialog', err)
                          } finally {
                            setIsLoadingImage(false)
                          }
                        } else {
                          alert(
                            "Le sélecteur de fichiers n'est disponible que sur l'application Desktop."
                          )
                        }
                      }}
                    >
                      {isLoadingImage ? 'Chargement...' : 'Parcourir...'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="last_name" className="text-sm font-medium">
                  Nom *
                </label>
                <Input
                  id="last_name"
                  {...form.register('last_name')}
                  placeholder="Nom de famille"
                />
                {form.formState.errors.last_name && (
                  <p className="text-sm text-red-500">{form.formState.errors.last_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="first_name" className="text-sm font-medium">
                  Prénom *
                </label>
                <Input id="first_name" {...form.register('first_name')} placeholder="Prénoms" />
                {form.formState.errors.first_name && (
                  <p className="text-sm text-red-500">{form.formState.errors.first_name.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Sexe</label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="M"
                      {...form.register('gender')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Garçon</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="F"
                      {...form.register('gender')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Fille</span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="date_of_birth" className="text-sm font-medium">
                  Date de naissance
                </label>
                <Input id="date_of_birth" type="date" {...form.register('date_of_birth')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="place_of_birth" className="text-sm font-medium">
                  Lieu de naissance
                </label>
                <Input
                  id="place_of_birth"
                  {...form.register('place_of_birth')}
                  placeholder="Ville/Commune"
                />
              </div>
            </div>

            {initialData ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="class" className="text-sm font-medium">
                    Classe Actuelle *
                  </label>
                  <select
                    id="class"
                    required
                    {...form.register('class')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Sélectionner une classe</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                    {initialData?.class && !availableClasses.includes(initialData.class) && (
                      <option value={initialData.class}>{initialData.class}</option>
                    )}
                  </select>
                  {form.formState.errors.class && (
                    <p className="text-sm text-red-500">{form.formState.errors.class.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="enrollment_date" className="text-sm font-medium">
                    Date d'inscription *
                  </label>
                  <Input id="enrollment_date" type="date" {...form.register('enrollment_date')} />
                  {form.formState.errors.enrollment_date && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.enrollment_date.message}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-4 flex gap-3 text-sm">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Dossier Élève</p>
                    <p>
                      La création de ce dossier permet d'enregistrer les informations de base de l'élève.
                      L'affectation à une classe et le calcul des frais se feront lors de l'étape 
                      d'inscription.
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="enrollment_date" className="text-sm font-medium">
                      Date de création du dossier *
                    </label>
                    <Input id="enrollment_date" type="date" {...form.register('enrollment_date')} />
                    {form.formState.errors.enrollment_date && (
                      <p className="text-sm text-red-500">
                        {form.formState.errors.enrollment_date.message}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email (Optionnel)
              </label>
              <Input
                id="email"
                {...form.register('email')}
                placeholder="email@exemple.com"
                type="email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="previous_school" className="text-sm font-medium">
                École d'origine (Optionnel)
              </label>
              <Input
                id="previous_school"
                {...form.register('previous_school')}
                placeholder="Établissement précédent"
              />
            </div>
          </TabsContent>

          <TabsContent value="family" className="space-y-4 pt-4">
            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Informations Familiales</h3>

              {/* Father */}
              <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                <div className="space-y-2">
                  <label htmlFor="father_name" className="text-sm font-medium">
                    Nom du Père
                  </label>
                  <Input
                    id="father_name"
                    {...form.register('father_name')}
                    placeholder="Nom complet"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="father_profession" className="text-sm font-medium">
                    Profession
                  </label>
                  <Input
                    id="father_profession"
                    {...form.register('father_profession')}
                    placeholder="Profession"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="father_contact" className="text-sm font-medium">
                    Contact
                  </label>
                  <Input
                    id="father_contact"
                    {...form.register('father_contact')}
                    placeholder="03x xx xxx xx"
                  />
                </div>
              </div>

              {/* Mother */}
              <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                <div className="space-y-2">
                  <label htmlFor="mother_name" className="text-sm font-medium">
                    Nom de la Mère
                  </label>
                  <Input
                    id="mother_name"
                    {...form.register('mother_name')}
                    placeholder="Nom complet"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="mother_profession" className="text-sm font-medium">
                    Profession
                  </label>
                  <Input
                    id="mother_profession"
                    {...form.register('mother_profession')}
                    placeholder="Profession"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="mother_contact" className="text-sm font-medium">
                    Contact
                  </label>
                  <Input
                    id="mother_contact"
                    {...form.register('mother_contact')}
                    placeholder="03x xx xxx xx"
                  />
                </div>
              </div>

              {/* Guardian */}
              <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                <div className="space-y-2">
                  <label htmlFor="guardian_name" className="text-sm font-medium">
                    Nom du Tuteur (Optionnel)
                  </label>
                  <Input
                    id="guardian_name"
                    {...form.register('guardian_name')}
                    placeholder="Nom complet"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="guardian_profession" className="text-sm font-medium">
                    Profession
                  </label>
                  <Input
                    id="guardian_profession"
                    {...form.register('guardian_profession')}
                    placeholder="Profession"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="guardian_contact" className="text-sm font-medium">
                    Contact (Optionnel)
                  </label>
                  <Input
                    id="guardian_contact"
                    {...form.register('guardian_contact')}
                    placeholder="03x xx xxx xx"
                  />
                  {form.formState.errors.guardian_contact && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.guardian_contact.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <label htmlFor="address" className="text-sm font-medium">
                  Adresse
                </label>
                <Input id="address" {...form.register('address')} placeholder="Lot..." />
              </div>

              {/* Personnel Parent Section */}
              <div className="border p-4 rounded-md mt-6 bg-blue-50/50">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-800">
                  <UserCircle className="w-5 h-5" /> Parent membre du personnel
                </h3>
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox
                    id="is_personnel_child"
                    checked={form.watch('is_personnel_child')}
                    onCheckedChange={(checked) => {
                      form.setValue('is_personnel_child', checked as boolean)
                      if (!checked) form.setValue('parent_personnel_id', null)
                    }}
                  />
                  <label htmlFor="is_personnel_child" className="text-sm font-medium">
                    Cet élève est l'enfant d'un membre du personnel de l'établissement
                  </label>
                </div>

                {form.watch('is_personnel_child') && (
                  <div className="space-y-2 mt-3">
                    <label
                      htmlFor="parent_personnel_id"
                      className="text-sm font-medium text-gray-700"
                    >
                      Sélectionner le membre du personnel
                    </label>
                    <select
                      id="parent_personnel_id"
                      {...form.register('parent_personnel_id')}
                      value={form.watch('parent_personnel_id') || ''}
                      className="flex h-10 w-full md:w-1/2 rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="">Sélectionner...</option>
                      {personnel.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.last_name} {p.first_name} ({p.position})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-blue-600 mt-1">
                      Note : Les enfants du personnel sont exonérés d'écolage mensuel.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Siblings Section */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Fratrie (Frères et Sœurs)</h3>
              <div className="space-y-4">
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      {isSearchingSiblings ? (
                        <div className="absolute left-2.5 top-2.5 h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                      )}
                      <Input
                        placeholder="Rechercher un frère ou une sœur existant..."
                        className="pl-9"
                        value={siblingQuery}
                        onChange={(e) => setSiblingQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Search Results Dropdown */}
                  {siblingResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-60 overflow-auto">
                      {siblingResults.map((student) => (
                        <div
                          key={student.id}
                          className="p-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                          onClick={() => addSibling(student)}
                        >
                          <div>
                            <div className="font-medium">
                              {student.last_name} {student.first_name}
                            </div>
                            <div className="text-xs text-gray-500">{student.class}</div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Siblings List */}
                {selectedSiblings.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedSiblings.map((sibling) => (
                      <div
                        key={sibling.id}
                        className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full flex items-center gap-2 text-sm border border-blue-100"
                      >
                        <span>
                          {sibling.last_name} {sibling.first_name} ({sibling.class})
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSibling(sibling.id)}
                          className="hover:text-blue-900 focus:outline-none"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">Aucun frère/sœur sélectionné.</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="services" className="space-y-4 pt-4">
            {initialData && (
              <>
                {/* Rectification Inscription / Réinscription */}
                <div className="border border-amber-200 bg-amber-50/50 p-4 rounded-md">
                  <h3 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
                    <span>Statut Scolarité & Droits</span>
                  </h3>
                  <p className="text-xs text-amber-700 mb-3">
                    Permet de corriger si l'élève a été enregistré par erreur en Inscription (Nouveau) ou Réinscription (Ancien).
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                        enrollmentType === 'enrollment'
                          ? 'border-blue-600 bg-blue-50/80 font-medium text-blue-900 shadow-sm'
                          : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="enrollmentType"
                        value="enrollment"
                        checked={enrollmentType === 'enrollment'}
                        onChange={() => setEnrollmentType('enrollment')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-semibold">Nouvel Élève (Inscription)</div>
                        <div className="text-xs text-gray-500">
                          Droit d'inscription : {(prices?.registration || 145000).toLocaleString()} Ar
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                        enrollmentType === 'reenrollment'
                          ? 'border-blue-600 bg-blue-50/80 font-medium text-blue-900 shadow-sm'
                          : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="enrollmentType"
                        value="reenrollment"
                        checked={enrollmentType === 'reenrollment'}
                        onChange={() => setEnrollmentType('reenrollment')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-semibold">Ancien Élève (Réinscription)</div>
                        <div className="text-xs text-gray-500">
                          Droit de réinscription : {(prices?.reenrollment || 115000).toLocaleString()} Ar
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Bus */}
                <div className="border p-4 rounded-md mt-4">
                  <h3 className="font-semibold mb-3">Transport Scolaire (Bus)</h3>
                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="bus_subscribed"
                      checked={form.watch('bus_subscribed')}
                      onCheckedChange={(checked) =>
                        form.setValue('bus_subscribed', checked as boolean)
                      }
                    />
                    <label htmlFor="bus_subscribed" className="text-sm font-medium">
                      Inscription au Bus
                    </label>
                  </div>

                  {form.watch('bus_subscribed') && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Ligne de Bus</label>
                      <select
                        {...form.register('bus_route')}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Sélectionner une zone</option>
                        {availableBusRoutes.map((route) => (
                          <option key={route} value={route}>
                            {route} ({prices.bus[route]?.toLocaleString()} Ar)
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500">
                        Note: Sélectionnez la zone correspondant à l'arrêt de l'élève.
                      </p>
                    </div>
                  )}
                </div>

                {/* Canteen */}
                <div className="border p-4 rounded-md mt-4">
                  <h3 className="font-semibold mb-3">Cantine</h3>
                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="canteen_subscribed"
                      checked={form.watch('canteen_subscribed')}
                      onCheckedChange={(checked) =>
                        form.setValue('canteen_subscribed', checked as boolean)
                      }
                    />
                    <label htmlFor="canteen_subscribed" className="text-sm font-medium">
                      Inscription à la Cantine
                    </label>
                  </div>

                  {form.watch('canteen_subscribed') && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Jours de cantine</label>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { id: 'Monday', label: 'Lun' },
                          { id: 'Tuesday', label: 'Mar' },
                          { id: 'Wednesday', label: 'Mer' },
                          { id: 'Thursday', label: 'Jeu' },
                          { id: 'Friday', label: 'Ven' }
                        ].map((day) => {
                          const currentDays = form.watch('canteen_days') || []
                          const isSelected = currentDays.includes(day.id)
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => {
                                const newDays = isSelected
                                  ? currentDays.filter((d) => d !== day.id)
                                  : [...currentDays, day.id]
                                form.setValue('canteen_days', newDays)
                                form.setValue('canteen_days_per_week', newDays.length)
                              }}
                              className={`px-3 py-2 rounded text-sm font-medium transition-colors border ${
                                isSelected
                                  ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              {day.label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-xs text-gray-500">
                        {form.watch('canteen_days_per_week')} jour(s) par semaine
                      </p>
                      <input type="hidden" {...form.register('canteen_days_per_week')} />
                    </div>
                  )}
                </div>

                {/* Uniforms */}
                <div className="border p-4 rounded-md mt-4">
                  <h3 className="font-semibold mb-3">Tenues & Accessoires</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.keys(prices?.uniforms || {}).map((item) => {
                      const itemsPurchased = form.watch('uniform_items_purchased') || []
                      const isChecked = itemsPurchased.includes(item)
                      return (
                        <div key={item} className="flex items-center space-x-2">
                          <Checkbox
                            id={`uniform_${item}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                form.setValue('uniform_items_purchased', [...itemsPurchased, item])
                              } else {
                                form.setValue(
                                  'uniform_items_purchased',
                                  itemsPurchased.filter((i) => i !== item)
                                )
                              }
                            }}
                          />
                          <label htmlFor={`uniform_${item}`} className="text-sm">
                            {item}
                          </label>
                        </div>
                      )
                    })}
                    {Object.keys(prices?.uniforms || {}).length === 0 && (
                      <p className="text-sm text-gray-500 italic">Aucun article configuré</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Submit Buttons */}
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement...' : initialData ? 'Mettre à jour' : "Créer l'élève"}
          </Button>
        </div>
      </form>
    </div>
  )
}
