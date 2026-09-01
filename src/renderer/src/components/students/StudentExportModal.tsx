import { useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  Code,
  Download,
  Check,
  X,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
  Settings2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export interface StudentExportFilterProps {
  search?: string
  className?: string
  status?: string
  schoolYear: string
  currentStudentsCount: number
}

interface StudentExportModalProps {
  isOpen: boolean
  onClose: () => void
  filters: StudentExportFilterProps
}

type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'json'
type ExportScope = 'active_filters' | 'current_year' | 'all'

interface ColumnDef {
  key: string
  label: string
  category: 'id' | 'school' | 'parents' | 'other'
}

const AVAILABLE_COLUMNS: ColumnDef[] = [
  // Identification
  { key: 'registration_number', label: 'Matricule', category: 'id' },
  { key: 'last_name', label: 'Nom', category: 'id' },
  { key: 'first_name', label: 'Prénoms', category: 'id' },
  { key: 'gender', label: 'Genre (Sexe)', category: 'id' },
  { key: 'date_of_birth', label: 'Date de naissance', category: 'id' },
  { key: 'place_of_birth', label: 'Lieu de naissance', category: 'id' },

  // Scolarité
  { key: 'class', label: 'Classe', category: 'school' },
  { key: 'student_status', label: 'Statut scolaire', category: 'school' },
  { key: 'enrollment_date', label: "Date d'inscription", category: 'school' },
  { key: 'previous_school', label: "Établissement d'origine", category: 'school' },

  // Parents & Coordonnées
  { key: 'father_name', label: 'Nom du père', category: 'parents' },
  { key: 'father_contact', label: 'Contact père', category: 'parents' },
  { key: 'father_profession', label: 'Profession père', category: 'parents' },
  { key: 'mother_name', label: 'Nom de la mère', category: 'parents' },
  { key: 'mother_contact', label: 'Contact mère', category: 'parents' },
  { key: 'mother_profession', label: 'Profession mère', category: 'parents' },
  { key: 'guardian_name', label: 'Nom du tuteur', category: 'parents' },
  { key: 'guardian_contact', label: 'Contact tuteur', category: 'parents' },
  { key: 'guardian_profession', label: 'Profession tuteur', category: 'parents' },
  { key: 'address', label: 'Adresse domicile', category: 'parents' },
  { key: 'email', label: 'Email', category: 'parents' },

  // Autres
  { key: 'is_personnel_child', label: 'Enfant du personnel', category: 'other' }
]

// Preset column configurations
const PRESETS: Record<string, { name: string; icon: string; keys: string[] }> = {
  standard: {
    name: 'Pédagogique / Standard',
    icon: '🎓',
    keys: ['registration_number', 'last_name', 'first_name', 'gender', 'class', 'date_of_birth', 'student_status']
  },
  full: {
    name: 'Complet (Toutes les colonnes)',
    icon: '📋',
    keys: AVAILABLE_COLUMNS.map((c) => c.key)
  },
  contacts: {
    name: 'Coordonnées & Parents',
    icon: '📞',
    keys: [
      'registration_number',
      'last_name',
      'first_name',
      'class',
      'guardian_name',
      'guardian_contact',
      'father_name',
      'father_contact',
      'mother_name',
      'mother_contact',
      'address',
      'email'
    ]
  },
  admin: {
    name: 'Administratif & Inscriptions',
    icon: '🏛️',
    keys: [
      'registration_number',
      'last_name',
      'first_name',
      'gender',
      'class',
      'enrollment_date',
      'previous_school',
      'student_status',
      'is_personnel_child'
    ]
  }
}

export default function StudentExportModal({
  isOpen,
  onClose,
  filters
}: StudentExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [scope, setScope] = useState<ExportScope>('active_filters')
  const [selectedKeys, setSelectedKeys] = useState<string[]>(PRESETS.standard.keys)
  const [csvDelimiter, setCsvDelimiter] = useState<';' | ','>(';')
  const [customTitle, setCustomTitle] = useState('')
  const [columnSearch, setColumnSearch] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  if (!isOpen) return null

  // Toggle single column
  const toggleColumn = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  // Select / Deselect all
  const selectAll = () => setSelectedKeys(AVAILABLE_COLUMNS.map((c) => c.key))
  const deselectAll = () => setSelectedKeys(['registration_number', 'last_name', 'first_name'])

  // Apply preset
  const applyPreset = (presetKey: string) => {
    if (PRESETS[presetKey]) {
      setSelectedKeys(PRESETS[presetKey].keys)
      toast.info(`Préréglage appliqué : ${PRESETS[presetKey].name}`)
    }
  }

  // Filter columns list for search
  const filteredColumns = AVAILABLE_COLUMNS.filter((c) =>
    c.label.toLowerCase().includes(columnSearch.toLowerCase()) ||
    c.key.toLowerCase().includes(columnSearch.toLowerCase())
  )

  // Active filters summary
  const getFilterSummary = () => {
    const parts: string[] = []
    if (filters.className) parts.push(`Classe : ${filters.className}`)
    if (filters.status && filters.status !== 'Tous') parts.push(`Statut : ${filters.status}`)
    if (filters.search) parts.push(`Recherche : "${filters.search}"`)
    if (parts.length === 0) return 'Aucun filtre particulier (Tous les statuts actifs)'
    return parts.join(' • ')
  }

  // Handle Export Action
  const handleExport = async () => {
    if (selectedKeys.length === 0) {
      toast.error('Veuillez sélectionner au moins une colonne à exporter.')
      return
    }

    setIsExporting(true)
    const toastId = toast.loading('Préparation et extraction des données...')

    try {
      // 1. Fetch data based on selected scope
      let listParams: Record<string, unknown> = {
        limit: 20000,
        schoolYear: filters.schoolYear
      }

      if (scope === 'active_filters') {
        listParams = {
          limit: 20000,
          schoolYear: filters.schoolYear,
          class: filters.className || undefined,
          status: filters.status || undefined,
          search: filters.search || undefined
        }
      } else if (scope === 'current_year') {
        listParams = {
          limit: 20000,
          schoolYear: filters.schoolYear
        }
      } else if (scope === 'all') {
        listParams = {
          limit: 20000
        }
      }

      const result = await window.api.student.list(listParams)
      const students = result?.students || []

      if (students.length === 0) {
        toast.dismiss(toastId)
        toast.warning('Aucun élève ne correspond aux critères sélectionnés.')
        setIsExporting(false)
        return
      }

      // 2. Prepare columns
      const exportColumns = AVAILABLE_COLUMNS.filter((c) => selectedKeys.includes(c.key)).map(
        (c) => ({
          key: c.key,
          label: c.label
        })
      )

      // 3. Build descriptive title and filename
      const scopeLabel =
        scope === 'active_filters' && filters.className
          ? `_${filters.className.replace(/\s+/g, '_')}`
          : scope === 'current_year'
            ? `_${filters.schoolYear}`
            : '_Global'

      const defaultFilename = `Export_Eleves${scopeLabel}_${new Date().toISOString().split('T')[0]}`
      const docTitle = customTitle.trim() || `LISTE DES ÉLÈVES`
      const subtitle =
        scope === 'active_filters'
          ? getFilterSummary()
          : scope === 'current_year'
            ? `Année scolaire : ${filters.schoolYear}`
            : 'Base globale des élèves'

      // 4. Trigger Export through backend service
      const exportResult = await window.api.export.file({
        format,
        data: students as unknown as Record<string, unknown>[],
        columns: exportColumns,
        defaultFilename,
        title: docTitle,
        subtitle,
        schoolYear: filters.schoolYear,
        csvDelimiter
      })

      toast.dismiss(toastId)

      if (exportResult.success) {
        toast.success(`Export réussi (${students.length} élèves)`, {
          description: exportResult.filePath
            ? `Fichier enregistré : ${exportResult.filePath}`
            : 'Le fichier a été généré avec succès.',
          duration: 6000
        })
        onClose()
      } else if (exportResult.error !== 'Export annulé par l’utilisateur') {
        toast.error(`Erreur d'export : ${exportResult.error || 'Erreur inconnue'}`)
      }
    } catch (err: unknown) {
      toast.dismiss(toastId)
      const msg = err instanceof Error ? err.message : 'Erreur inattendue lors de l’export'
      toast.error(msg)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card text-card-foreground rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden border border-border">
        {/* Header with Project Warm Signature Palette */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-gradient-to-r from-[#3D2E24] via-[#5C4535] to-[#8C6B55] text-[#FFFBE9]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shadow-inner">
              <Download className="w-6 h-6 text-[#E3CAA5]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#FFFBE9]">Exporter la liste des élèves</h2>
              <p className="text-xs text-[#E3CAA5]">
                Génération de fichiers aux normes professionnelles (Excel, CSV, PDF, JSON)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-background/50">
          {/* SECTION 1: Choix du format */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 block">
              1. Format de fichier aux normes
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Excel */}
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  format === 'xlsx'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
                }`}
              >
                {format === 'xlsx' && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm block">Excel</span>
                    <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold uppercase bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                      .xlsx / .xls
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Tableau formaté avec en-têtes stylisés, colonnes auto-ajustées
                </p>
              </button>

              {/* CSV */}
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  format === 'csv'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
                }`}
              >
                {format === 'csv' && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm block">CSV</span>
                    <span className="text-[10px] text-amber-900 dark:text-amber-200 font-semibold uppercase bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                      UTF-8 BOM
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Compatible Excel FR, séparateur point-virgule ou virgule
                </p>
              </button>

              {/* PDF */}
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  format === 'pdf'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
                }`}
              >
                {format === 'pdf' && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm block">PDF</span>
                    <span className="text-[10px] text-rose-800 dark:text-rose-300 font-semibold uppercase bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded">
                      Paysage A4
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Prêt à imprimer avec en-tête d'établissement et numérotation
                </p>
              </button>

              {/* JSON */}
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  format === 'json'
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
                }`}
              >
                {format === 'json' && (
                  <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300 rounded-lg">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm block">JSON</span>
                    <span className="text-[10px] text-stone-800 dark:text-stone-300 font-semibold uppercase bg-stone-50 dark:bg-stone-900/60 px-1.5 py-0.5 rounded">
                      Données
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Export structuré brut pour archivage technique ou intégration
                </p>
              </button>
            </div>
          </div>

          {/* SECTION 2: Périmètre des données */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-primary" />
              2. Périmètre des données à exporter
            </label>
            <div className="space-y-2">
              {/* Option A: Active Filters */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  scope === 'active_filters'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:bg-accent/40 text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="active_filters"
                  checked={scope === 'active_filters'}
                  onChange={() => setScope('active_filters')}
                  className="mt-1 text-primary focus:ring-primary accent-[#AD8B73]"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      Vue active / Filtres actuellement appliqués
                    </span>
                    <span className="text-xs font-bold bg-primary/20 text-primary-foreground bg-[#AD8B73] px-2 py-0.5 rounded-full">
                      {filters.currentStudentsCount} élève(s)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getFilterSummary()}
                  </p>
                </div>
              </label>

              {/* Option B: Current Year */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  scope === 'current_year'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:bg-accent/40 text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="current_year"
                  checked={scope === 'current_year'}
                  onChange={() => setScope('current_year')}
                  className="mt-1 text-primary focus:ring-primary accent-[#AD8B73]"
                />
                <div className="flex-1">
                  <span className="font-semibold text-sm">
                    Tous les élèves de l'année scolaire en cours ({filters.schoolYear})
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ignore le filtre de classe et de recherche pour extraire l'effectif complet de l'année.
                  </p>
                </div>
              </label>

              {/* Option C: All */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  scope === 'all'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:bg-accent/40 text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                  className="mt-1 text-primary focus:ring-primary accent-[#AD8B73]"
                />
                <div className="flex-1">
                  <span className="font-semibold text-sm">Base complète des élèves (Global)</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tous les élèves enregistrés dans le système (actifs, anciens, pré-inscrits).
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 3: Sélection des Colonnes */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                3. Colonnes à exporter ({selectedKeys.length} sélectionnée(s))
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Tout cocher
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
                >
                  <Square className="w-3.5 h-3.5" /> Réinitialiser
                </button>
              </div>
            </div>

            {/* Presets buttons */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(PRESETS).map(([k, p]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => applyPreset(k)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-primary/10 hover:border-primary/50 text-foreground font-medium transition-colors flex items-center gap-1"
                >
                  <span>{p.icon}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>

            {/* Column search filter */}
            <div className="mb-3">
              <Input
                placeholder="Filtrer les colonnes..."
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>

            {/* Checkbox columns grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 border border-border/60 rounded-lg bg-background/50">
              {filteredColumns.map((col) => {
                const isChecked = selectedKeys.includes(col.key)
                return (
                  <label
                    key={col.key}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer select-none transition-colors ${
                      isChecked
                        ? 'border-primary bg-primary/15 text-foreground font-medium'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded text-primary focus:ring-primary accent-[#AD8B73] w-3.5 h-3.5"
                    />
                    <span className="truncate">{col.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* SECTION 4: Options Avancées */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Settings2 className="w-4 h-4 text-primary" />
              4. Options avancées
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Titre personnalisé du document
                </label>
                <Input
                  placeholder="Ex : Liste Officielle des Élèves"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {format === 'csv' && (
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Séparateur CSV
                  </label>
                  <select
                    value={csvDelimiter}
                    onChange={(e) => setCsvDelimiter(e.target.value as ';' | ',')}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value=";">Point-virgule ( ; ) — Standard Excel Français</option>
                    <option value=",">Virgule ( , ) — Standard International</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-accent/20 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Format sélectionné : <strong className="uppercase text-foreground font-bold">{format}</strong> •{' '}
            {selectedKeys.length} colonne(s)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isExporting}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isExporting || selectedKeys.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[150px] shadow-sm font-semibold"
            >
              {isExporting ? (
                'Génération...'
              ) : (
                <>
                  <Download className="w-4 h-4 mr-1.5" />
                  Exporter le fichier
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
