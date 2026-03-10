import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { useStudentStore, Student } from "@/store/useStudentStore"
import { useState, useEffect } from "react"
import { getStudentPhotoUrl } from "@/lib/image-utils"
import { Search, X, Plus } from "lucide-react"

const studentSchema = z.object({
  first_name: z.string().min(2, "Le prénom est requis"),
  last_name: z.string().min(2, "Le nom est requis"),
  date_of_birth: z.string().optional(),
  place_of_birth: z.string().optional(),
  class: z.string().optional(),
  enrollment_date: z.string().min(1, "La date d'inscription est requise"),
  
  email: z.string().transform(val => val.trim()).pipe(
    z.string().email("Email invalide").or(z.literal(""))
  ).optional(),
  
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
  canteen_days_per_week: z.number().min(0).max(5).or(z.nan()).transform(val => isNaN(val) ? 0 : val),
  
  uniform_tshirt_purchased: z.boolean().optional(),
  uniform_apron_purchased: z.boolean().optional(),
  uniform_shorts_purchased: z.boolean().optional(),
  uniform_badge_purchased: z.boolean().optional(),
  
  fram_paid_by_parent: z.boolean().optional(),
})

type StudentFormValues = z.infer<typeof studentSchema>

interface StudentFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  initialData?: Student | null
  initialFees?: any | null
}

interface SiblingDisplay {
    id: string;
    first_name: string;
    last_name: string;
    class: string;
}

export default function StudentForm({ onSuccess, onCancel, initialData, initialFees }: StudentFormProps) {
  const { createStudent, updateStudent, error } = useStudentStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Sibling Search State
  const [siblingQuery, setSiblingQuery] = useState("");
  const [siblingResults, setSiblingResults] = useState<SiblingDisplay[]>([]);
  const [selectedSiblings, setSelectedSiblings] = useState<SiblingDisplay[]>([]);
  const [isSearchingSiblings, setIsSearchingSiblings] = useState(false);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      class: "",
      enrollment_date: new Date().toISOString().split('T')[0],
      email: "",
      
      father_name: "",
      father_contact: "",
      father_profession: "",
      
      mother_name: "",
      mother_contact: "",
      mother_profession: "",
      
      guardian_name: "",
      guardian_contact: "",
      guardian_profession: "",
      
      date_of_birth: "",
      place_of_birth: "",
      address: "",
      previous_school: "",
      photo_path: "",
      siblings: [],

      bus_subscribed: false,
      bus_route: "",
      canteen_subscribed: false,
      canteen_days_per_week: 0,
      uniform_tshirt_purchased: false,
      uniform_apron_purchased: false,
      uniform_shorts_purchased: false,
      uniform_badge_purchased: false,
      fram_paid_by_parent: false
    },
  })

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Load initial data
  useEffect(() => {
    if (initialData) {
      setPreviewUrl(initialData.photo_path || null);
      
      const formData: any = {
        first_name: initialData.first_name,
        last_name: initialData.last_name,
        class: initialData.class,
        enrollment_date: initialData.enrollment_date,
        email: (initialData as any).email || "",
        
        father_name: initialData.father_name || "",
        father_contact: initialData.father_contact || "",
        father_profession: initialData.father_profession || "",
        
        mother_name: initialData.mother_name || "",
        mother_contact: initialData.mother_contact || "",
        mother_profession: initialData.mother_profession || "",
        
        guardian_name: initialData.guardian_name || "",
        guardian_contact: initialData.guardian_contact || "",
        guardian_profession: initialData.guardian_profession || "",
        
        date_of_birth: initialData.date_of_birth || "",
        place_of_birth: initialData.place_of_birth || "",
        address: initialData.address || "",
        previous_school: initialData.previous_school || "",
        photo_path: initialData.photo_path || "",
        siblings: initialData.siblings || []
      };

      // Load Fees if available
      if (initialFees) {
          formData.bus_subscribed = Boolean(initialFees.bus_subscribed);
          formData.bus_route = initialFees.bus_route || "";
          formData.canteen_subscribed = Boolean(initialFees.canteen_subscribed);
          formData.canteen_days_per_week = initialFees.canteen_days_per_week || 0;
          
          formData.uniform_tshirt_purchased = Boolean(initialFees.uniform_tshirt_purchased);
          formData.uniform_apron_purchased = Boolean(initialFees.uniform_apron_purchased);
          formData.uniform_shorts_purchased = Boolean(initialFees.uniform_shorts_purchased);
          formData.uniform_badge_purchased = Boolean(initialFees.uniform_badge_purchased);
          
          formData.fram_paid_by_parent = Boolean(initialFees.fram_paid_by_parent);
      }

      form.reset(formData);

      // Fetch sibling details if any
      if (initialData.siblings && initialData.siblings.length > 0) {
          loadSiblings(initialData.siblings);
      }
    }
  }, [initialData, initialFees, form]);

  const loadSiblings = async (siblingIds: string[]) => {
      if (!window.electron || !window.electron.ipcRenderer) return;
      
      try {
          const siblings: SiblingDisplay[] = [];
          for (const id of siblingIds) {
              const result = await window.electron.ipcRenderer.invoke('student:get', id);
              if (result.success && result.student) {
                  siblings.push({
                      id: result.student.id,
                      first_name: result.student.first_name,
                      last_name: result.student.last_name,
                      class: result.student.class
                  });
              }
          }
          setSelectedSiblings(siblings);
      } catch (err) {
          console.error("Failed to load siblings", err);
      }
  };

  // Search siblings effect
  useEffect(() => {
      if (siblingQuery.length < 2) {
          setSiblingResults([]);
          return;
      }

      const timer = setTimeout(async () => {
          if (!window.electron || !window.electron.ipcRenderer) return;
          setIsSearchingSiblings(true);
          try {
              const result = await window.electron.ipcRenderer.invoke('student:list', { search: siblingQuery, limit: 5 });
              // Filter out current student (if editing) and already selected siblings
              const filtered = result.students.filter((s: any) => 
                  s.id !== initialData?.id && 
                  !selectedSiblings.some(sel => sel.id === s.id)
              );
              setSiblingResults(filtered);
          } catch (err) {
              console.error("Search failed", err);
          } finally {
              setIsSearchingSiblings(false);
          }
      }, 300);

      return () => clearTimeout(timer);
  }, [siblingQuery, initialData, selectedSiblings]);

  const addSibling = (student: SiblingDisplay) => {
      const newSiblings = [...selectedSiblings, student];
      setSelectedSiblings(newSiblings);
      form.setValue('siblings', newSiblings.map(s => s.id));
      setSiblingQuery("");
      setSiblingResults([]);
  };

  const removeSibling = (id: string) => {
      const newSiblings = selectedSiblings.filter(s => s.id !== id);
      setSelectedSiblings(newSiblings);
      form.setValue('siblings', newSiblings.map(s => s.id));
  };

  const onSubmit = async (data: StudentFormValues) => {
    console.log("Submitting form data:", data);
    setIsSubmitting(true)
    try {
      // Prepare payload
      const payload = { ...data };
      
      // Handle siblings
      payload.siblings = selectedSiblings.map(s => s.id);

      if (initialData) {
        console.log("Updating student:", initialData.id, payload);
        await updateStudent(initialData.id, payload)
      } else {
        console.log("Creating student:", payload);
        await createStudent(payload)
      }
      
      if (onSuccess) onSuccess()
    } catch (err) {
      console.error("Error submitting form:", err);
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">
        {initialData ? "Modifier l'Élève" : "Nouvel Élève"}
      </h2>
      
      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
      
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Tabs defaultValue="identity" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="identity">Identité</TabsTrigger>
                <TabsTrigger value="family">Famille</TabsTrigger>
                <TabsTrigger value="services">Services & Frais</TabsTrigger>
            </TabsList>

            <TabsContent value="identity" className="space-y-4 pt-4">
                {/* Photo Field */}
                <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mb-4">
                    <label className="block text-sm font-medium mb-2">Photo de l'élève</label>
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
                                            e.currentTarget.style.opacity = '0.5';
                                        }
                                    }}
                                />
                            ) : (
                                <span className="text-gray-400 text-xs">Aucune</span>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex gap-2">
                                <Input {...form.register("photo_path")} placeholder="URL de l'image ou chemin local..." />
                                <Button 
                                    type="button" 
                                    variant="secondary" 
                                    disabled={isLoadingImage}
                                    onClick={async () => {
                                        if (window.electron && window.electron.ipcRenderer) {
                                            setIsLoadingImage(true);
                                            try {
                                                const result = await window.electron.ipcRenderer.invoke('dialog:openFile');
                                                if (result) {
                                                    if (typeof result === 'object' && result.filePath) {
                                                        form.setValue("photo_path", result.filePath);
                                                        if (result.preview) {
                                                            setPreviewUrl(result.preview);
                                                        } else {
                                                            setPreviewUrl(result.filePath);
                                                        }
                                                    } else if (typeof result === 'string') {
                                                        form.setValue("photo_path", result);
                                                        setPreviewUrl(result);
                                                    }
                                                }
                                            } catch (err) {
                                                console.error("Failed to open file dialog", err);
                                            } finally {
                                                setIsLoadingImage(false);
                                            }
                                        } else {
                                            alert("Le sélecteur de fichiers n'est disponible que sur l'application Desktop.");
                                        }
                                    }}
                                >
                                    {isLoadingImage ? "Chargement..." : "Parcourir..."}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nom *</label>
                    <Input {...form.register("last_name")} placeholder="Nom de famille" />
                    {form.formState.errors.last_name && (
                      <p className="text-sm text-red-500">{form.formState.errors.last_name.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prénom *</label>
                    <Input {...form.register("first_name")} placeholder="Prénoms" />
                    {form.formState.errors.first_name && (
                      <p className="text-sm text-red-500">{form.formState.errors.first_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date de naissance</label>
                    <Input type="date" {...form.register("date_of_birth")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Lieu de naissance</label>
                    <Input {...form.register("place_of_birth")} placeholder="Ville/Commune" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {initialData && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Classe</label>
                      <Input {...form.register("class")} placeholder="ex: 6ème A" />
                      {form.formState.errors.class && (
                        <p className="text-sm text-red-500">{form.formState.errors.class.message}</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date d'inscription *</label>
                    <Input type="date" {...form.register("enrollment_date")} />
                    {form.formState.errors.enrollment_date && (
                      <p className="text-sm text-red-500">{form.formState.errors.enrollment_date.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Email (Optionnel)</label>
                    <Input {...form.register("email")} placeholder="email@exemple.com" type="email" />
                    {form.formState.errors.email && (
                      <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">École d'origine (Optionnel)</label>
                    <Input {...form.register("previous_school")} placeholder="Établissement précédent" />
                </div>
            </TabsContent>

            <TabsContent value="family" className="space-y-4 pt-4">
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-3">Informations Familiales</h3>
                  
                  {/* Father */}
                  <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nom du Père</label>
                      <Input {...form.register("father_name")} placeholder="Nom complet" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Profession</label>
                      <Input {...form.register("father_profession")} placeholder="Profession" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Contact</label>
                      <Input {...form.register("father_contact")} placeholder="03x xx xxx xx" />
                    </div>
                  </div>

                  {/* Mother */}
                  <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nom de la Mère</label>
                      <Input {...form.register("mother_name")} placeholder="Nom complet" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Profession</label>
                      <Input {...form.register("mother_profession")} placeholder="Profession" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Contact</label>
                      <Input {...form.register("mother_contact")} placeholder="03x xx xxx xx" />
                    </div>
                  </div>

                  {/* Guardian */}
                  <div className="grid grid-cols-3 gap-4 mb-4 items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nom du Tuteur (Optionnel)</label>
                      <Input {...form.register("guardian_name")} placeholder="Nom complet" />
                    </div>
                     <div className="space-y-2">
                      <label className="text-sm font-medium">Profession</label>
                      <Input {...form.register("guardian_profession")} placeholder="Profession" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Contact (Optionnel)</label>
                      <Input {...form.register("guardian_contact")} placeholder="03x xx xxx xx" />
                      {form.formState.errors.guardian_contact && (
                        <p className="text-sm text-red-500">{form.formState.errors.guardian_contact.message}</p>
                      )}
                    </div>
                  </div>
                  
                   <div className="space-y-2 mt-4">
                    <label className="text-sm font-medium">Adresse</label>
                    <Input {...form.register("address")} placeholder="Lot..." />
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
                                                <div className="font-medium">{student.last_name} {student.first_name}</div>
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
                                    <div key={sibling.id} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full flex items-center gap-2 text-sm border border-blue-100">
                                        <span>{sibling.last_name} {sibling.first_name} ({sibling.class})</span>
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
                {/* Bus */}
                <div className="border p-4 rounded-md">
                    <h3 className="font-semibold mb-3">Transport Scolaire (Bus)</h3>
                    <div className="flex items-center space-x-2 mb-4">
                        <Checkbox 
                            id="bus_subscribed" 
                            checked={form.watch("bus_subscribed")}
                            onCheckedChange={(checked) => form.setValue("bus_subscribed", checked as boolean)}
                        />
                        <label htmlFor="bus_subscribed" className="text-sm font-medium">Inscription au Bus</label>
                    </div>
                    
                    {form.watch("bus_subscribed") && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Ligne de Bus</label>
                            <Input {...form.register("bus_route")} placeholder="Ex: Itaosy, Ambohibao..." />
                        </div>
                    )}
                </div>

                {/* Canteen */}
                <div className="border p-4 rounded-md mt-4">
                    <h3 className="font-semibold mb-3">Cantine</h3>
                    <div className="flex items-center space-x-2 mb-4">
                        <Checkbox 
                            id="canteen_subscribed" 
                            checked={form.watch("canteen_subscribed")}
                            onCheckedChange={(checked) => form.setValue("canteen_subscribed", checked as boolean)}
                        />
                        <label htmlFor="canteen_subscribed" className="text-sm font-medium">Inscription à la Cantine</label>
                    </div>
                    
                    {form.watch("canteen_subscribed") && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Jours par semaine</label>
                            <Input 
                                type="number" 
                                min={1} 
                                max={5}
                                {...form.register("canteen_days_per_week", { valueAsNumber: true })} 
                            />
                        </div>
                    )}
                </div>

                {/* Uniforms */}
                <div className="border p-4 rounded-md mt-4">
                    <h3 className="font-semibold mb-3">Tenues & Accessoires</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="uniform_tshirt" 
                                checked={form.watch("uniform_tshirt_purchased")}
                                onCheckedChange={(checked) => form.setValue("uniform_tshirt_purchased", checked as boolean)}
                            />
                            <label htmlFor="uniform_tshirt" className="text-sm">T-shirt Sport</label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="uniform_apron" 
                                checked={form.watch("uniform_apron_purchased")}
                                onCheckedChange={(checked) => form.setValue("uniform_apron_purchased", checked as boolean)}
                            />
                            <label htmlFor="uniform_apron" className="text-sm">Tablier</label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="uniform_shorts" 
                                checked={form.watch("uniform_shorts_purchased")}
                                onCheckedChange={(checked) => form.setValue("uniform_shorts_purchased", checked as boolean)}
                            />
                            <label htmlFor="uniform_shorts" className="text-sm">Short Sport</label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="uniform_badge" 
                                checked={form.watch("uniform_badge_purchased")}
                                onCheckedChange={(checked) => form.setValue("uniform_badge_purchased", checked as boolean)}
                            />
                            <label htmlFor="uniform_badge" className="text-sm">Écusson</label>
                        </div>
                    </div>
                </div>

                {/* FRAM */}
                <div className="border p-4 rounded-md mt-4">
                    <h3 className="font-semibold mb-3">Cotisation FRAM</h3>
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="fram_paid" 
                            checked={form.watch("fram_paid_by_parent")}
                            onCheckedChange={(checked) => form.setValue("fram_paid_by_parent", checked as boolean)}
                        />
                        <label htmlFor="fram_paid" className="text-sm">Payé par les parents (Décocher si inclus dans la fratrie)</label>
                    </div>
                </div>
            </TabsContent>
        </Tabs>

        {/* Submit Buttons */}
        <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Enregistrement..." : (initialData ? "Mettre à jour" : "Créer l'élève")}
            </Button>
        </div>
      </form>
    </div>
  )
}
