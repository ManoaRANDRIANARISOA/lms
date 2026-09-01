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

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'json'

export interface ExportColumnDef {
  key: string
  label: string
  category?: string
}

export interface ExportPresetDef {
  name: string
  icon?: string
  keys: string[]
}

export interface ExportScopeDef {
  id: string
  label: string
  description?: string
  count?: number
}

export interface DataExportModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  defaultFilename: string
  subtitle?: string
  schoolYear?: string
  columns: ExportColumnDef[]
  presets?: Record<string, ExportPresetDef>
  defaultSelectedKeys?: string[]
  data?: Record<string, unknown>[]
  fetchData?: (scopeId?: string) => Promise<Record<string, unknown>[]>
  scopes?: ExportScopeDef[]
  defaultScope?: string
}

export default function DataExportModal({
  isOpen,
  onClose,
  title,
  defaultFilename,
  subtitle,
  schoolYear,
  columns,
  presets,
  defaultSelectedKeys,
  data,
  fetchData,
  scopes,
  defaultScope
}: DataExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [selectedScope, setSelectedScope] = useState<string>(
    defaultScope || (scopes && scopes.length > 0 ? scopes[0].id : '')
  )
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    defaultSelectedKeys || columns.map((c) => c.key)
  )
  const [csvDelimiter, setCsvDelimiter] = useState<';' | ','>(';')
  const [customTitle, setCustomTitle] = useState('')
  const [columnSearch, setColumnSearch] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  if (!isOpen) return null

  const toggleColumn = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const selectAll = () => setSelectedKeys(columns.map((c) => c.key))
  const deselectAll = () => {
    if (columns.length > 0) {
      setSelectedKeys([columns[0].key])
    }
  }

  const applyPreset = (preset: ExportPresetDef) => {
    setSelectedKeys(preset.keys)
    toast.info(`Préréglage appliqué : ${preset.name}`)
  }

  const filteredColumns = columns.filter(
    (c) =>
      c.label.toLowerCase().includes(columnSearch.toLowerCase()) ||
      c.key.toLowerCase().includes(columnSearch.toLowerCase())
  )

  const handleExport = async () => {
    if (selectedKeys.length === 0) {
      toast.error('Veuillez sélectionner au moins une colonne à exporter.')
      return
    }

    setIsExporting(true)
    const toastId = toast.loading('Préparation et extraction des données...')

    try {
      let exportRows: Record<string, unknown>[] = []

      if (fetchData) {
        exportRows = await fetchData(selectedScope)
      } else if (data) {
        exportRows = data
      }

      if (!exportRows || exportRows.length === 0) {
        toast.dismiss(toastId)
        toast.warning('Aucune donnée ne correspond aux critères sélectionnés.')
        setIsExporting(false)
        return
      }

      const activeColumns = columns
        .filter((c) => selectedKeys.includes(c.key))
        .map((c) => ({
          key: c.key,
          label: c.label
        }))

      const cleanFilename = `${defaultFilename}_${new Date().toISOString().split('T')[0]}`

      const exportResult = await window.api.export.file({
        format,
        data: exportRows,
        columns: activeColumns,
        defaultFilename: cleanFilename,
        title: customTitle.trim() || title,
        subtitle: subtitle || (schoolYear ? `Année scolaire : ${schoolYear}` : undefined),
        schoolYear,
        csvDelimiter
      })

      toast.dismiss(toastId)

      if (exportResult.success) {
        toast.success(`Export réussi (${exportRows.length} enregistrements)`, {
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
        {/* Header with Project Signature Theme */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-gradient-to-r from-[#3D2E24] via-[#5C4535] to-[#8C6B55] text-[#FFFBE9]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 shadow-inner">
              <Download className="w-6 h-6 text-[#E3CAA5]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#FFFBE9]">{title}</h2>
              <p className="text-xs text-[#E3CAA5]">
                {subtitle || 'Génération de fichiers aux normes professionnelles (Excel, CSV, PDF, JSON)'}
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
                  Tableau formaté avec en-têtes stylisés et colonnes ajustées
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

          {/* SECTION 2: Périmètre des données (si scopes fournis) */}
          {scopes && scopes.length > 0 && (
            <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-primary" />
                2. Périmètre des données à exporter
              </label>
              <div className="space-y-2">
                {scopes.map((scope) => (
                  <label
                    key={scope.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedScope === scope.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:bg-accent/40 text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export_scope"
                      value={scope.id}
                      checked={selectedScope === scope.id}
                      onChange={() => setSelectedScope(scope.id)}
                      className="mt-1 text-primary focus:ring-primary accent-[#AD8B73]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{scope.label}</span>
                        {typeof scope.count === 'number' && (
                          <span className="text-xs font-bold bg-[#AD8B73] text-white px-2 py-0.5 rounded-full">
                            {scope.count} enregistrement(s)
                          </span>
                        )}
                      </div>
                      {scope.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {scope.description}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: Sélection des Colonnes */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                {scopes && scopes.length > 0 ? '3.' : '2.'} Colonnes à exporter ({selectedKeys.length} sélectionnée(s))
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
            {presets && Object.keys(presets).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.entries(presets).map(([k, p]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-primary/10 hover:border-primary/50 text-foreground font-medium transition-colors flex items-center gap-1"
                  >
                    {p.icon && <span>{p.icon}</span>}
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Column search filter */}
            {columns.length > 6 && (
              <div className="mb-3">
                <Input
                  placeholder="Filtrer les colonnes..."
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            )}

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
              {scopes && scopes.length > 0 ? '4.' : '3.'} Options avancées
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Titre personnalisé du document
                </label>
                <Input
                  placeholder={`Ex : ${title}`}
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
