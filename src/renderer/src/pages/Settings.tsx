import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'
import { getStudentPhotoUrl } from '../lib/image-utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useClasses } from '@/lib/useClasses'
import { Trash2, Plus } from 'lucide-react'
import EmailSettings from '@/pages/settings/EmailSettings'
import AssessmentSettings from '@/pages/settings/AssessmentSettings'

export default function Settings() {
  const canRead = useAuthStore((s) => s.canRead)
  const canWrite = useAuthStore((s) => s.canWrite)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [wipeCloud, setWipeCloud] = useState(false)

  const [schoolName, setSchoolName] = useState('')
  const [currentYear, setCurrentYear] = useState(useAppStore.getState().currentYear)
  const [schoolLogo, setSchoolLogo] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isLoadingImage, setIsLoadingImage] = useState(false)

  const { sections, addClass, removeClass, renameClass, moveClass } = useClasses()
  const [newClassName, setNewClassName] = useState('')
  const [editingClass, setEditingClass] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [draggedClass, setDraggedClass] = useState<string | null>(null)
  const [targetSectionKey, setTargetSectionKey] = useState<string | null>(null)

  // If user cannot read settings at all, show access denied
  if (!canRead('settings')) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">Accès refusé</h2>
          <p className="text-muted-foreground">
            Vous n'avez pas les permissions nécessaires pour accéder aux paramètres.
          </p>
        </div>
      </div>
    )
  }

  useEffect(() => {
    const loadSettings = async () => {
      if (window.api) {
        try {
          const name = await window.api.settings.get('school_name')
          const year = await window.api.settings.get('school_year')
          const logo = await window.api.settings.get('school_logo')

          if (name) setSchoolName(name as string)
          if (year) setCurrentYear(year as string)
          if (logo) {
            setSchoolLogo(logo as string)
            setLogoPreview(logo as string | null)
          }
        } catch (e) {
          if (import.meta.env.DEV) console.error('Failed to load settings', e)
        }
      }
    }
    loadSettings()
  }, [])

  const handleSaveConfig = async () => {
    setLoading(true)
    setMessage('')
    try {
      if (window.api) {
        await window.api.settings.set('school_name', schoolName)
        await window.api.settings.set('school_year', currentYear)
        await window.api.settings.set('school_logo', schoolLogo)

        // Mettre à jour le store global instantanément pour éviter de devoir redémarrer
        await useAppStore.getState().fetchSettings()

        setMessage('Configuration enregistrée avec succès.')
      }
    } catch (e: any) {
      setMessage('Erreur sauvegarde: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogoSelect = async () => {
    if (!window.api) {
      alert("Le sélecteur de fichiers n'est disponible que sur l'application Desktop.")
      return
    }

    setIsLoadingImage(true)
    try {
      const result = await window.api.dialog.openFile()
      if (result) {
        if (typeof result === 'object' && result.filePath) {
          setSchoolLogo(result.filePath)
          if (result.preview) {
            setLogoPreview(result.preview)
          } else {
            setLogoPreview(result.filePath)
          }
        } else if (typeof result === 'string') {
          setSchoolLogo(result)
          setLogoPreview(result)
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to open file dialog', err)
    } finally {
      setIsLoadingImage(false)
    }
  }

  const handleReset = async () => {
    const confirmMsg = wipeCloud
      ? "ATTENTION: Cela va effacer TOUTES les données LOCALES et CLOUD (Supabase). C'est IRRÉVERSIBLE. Êtes-vous VRAIMENT sûr ?"
      : 'ATTENTION: Cela va effacer TOUTES les données locales (Élèves, Paiements, etc.). Cette action est irréversible. Êtes-vous sûr ?'

    if (!confirm(confirmMsg)) return

    setLoading(true)
    try {
      const result = await window.api.student.resetDatabase(wipeCloud)
      if (result.success) {
        setMessage('Base de données réinitialisée avec succès.')
      } else {
        setMessage('Erreur: ' + result.error)
      }
    } catch (e: any) {
      setMessage('Erreur: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddClass = async () => {
    if (!newClassName.trim()) return
    const ok = await addClass(newClassName.trim())
    if (ok) {
      setNewClassName('')
      setMessage('Classe ajoutée.')
    } else {
      setMessage('Cette classe existe déjà.')
    }
  }

  const handleRemoveClass = async (name: string) => {
    if (
      !confirm(
        `Supprimer la classe "${name}" ?\n\nLes élèves dans cette classe ne seront pas supprimés, mais il faudra les réassigner.`
      )
    )
      return
    await removeClass(name)
    setMessage('Classe supprimée.')
  }

  const handleStartRename = (cls: string) => {
    setEditingClass(cls)
    setEditValue(cls)
  }

  const handleConfirmRename = async () => {
    if (!editingClass || !editValue.trim()) return
    const ok = await renameClass(editingClass, editValue.trim())
    if (ok) {
      setMessage(`Classe renommée en "${editValue.trim()}".`)
    } else {
      setMessage('Erreur: ce nom existe déjà ou est invalide.')
    }
    setEditingClass(null)
    setEditValue('')
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Paramètres</h1>

      <div className="space-y-6">
        {/* School Configuration */}
        <div className="bg-white p-6 rounded shadow max-w-xl border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Configuration de l'École</h2>
          <div className="space-y-4">
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="schoolName">Nom de l'établissement</Label>
              <Input
                type="text"
                id="schoolName"
                placeholder="Ex: École Privée Les Élites"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </div>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="schoolLogo">Logo de l'établissement</Label>
              <div className="flex gap-4 items-center">
                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border border-gray-200">
                  {isLoadingImage && (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  )}
                  {!isLoadingImage && logoPreview ? (
                    <img
                      src={getStudentPhotoUrl(logoPreview) || ''}
                      alt="Logo"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    !isLoadingImage && (
                      <span className="text-gray-400 text-xs text-center p-1">Aucun logo</span>
                    )
                  )}
                </div>
                <div className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLogoSelect}
                    disabled={isLoadingImage}
                  >
                    {isLoadingImage ? 'Chargement...' : 'Choisir un logo...'}
                  </Button>
                  {schoolLogo && (
                    <p
                      className="text-xs text-gray-500 mt-2 truncate max-w-[200px]"
                      title={schoolLogo}
                    >
                      {schoolLogo}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="currentYear">Année Scolaire Courante</Label>
              <Input
                type="text"
                id="currentYear"
                placeholder="Ex: 2025-2026"
                value={currentYear}
                onChange={(e) => setCurrentYear(e.target.value)}
              />
            </div>
            <Button
              onClick={handleSaveConfig}
              disabled={loading || !canWrite('settings')}
              className="w-full"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer la Configuration'}
            </Button>
            {message && message.includes('Configuration') && (
              <p className="mt-2 text-sm font-medium text-green-600 p-2 bg-green-50 rounded border border-green-100">
                {message}
              </p>
            )}
            {message && message.includes('Erreur sauvegarde') && (
              <p className="mt-2 text-sm font-medium text-red-600 p-2 bg-red-50 rounded border border-red-100">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Class Management */}
        <div className="bg-white p-6 rounded shadow max-w-4xl border border-gray-100 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">
            Gestion des Classes par Section
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Glissez-déposez les classes d'une section à l'autre pour les organiser. Ces catégories
            seront utilisées dans toute l'application (Filtres, Notes, etc.).
          </p>

          {canWrite('settings') && (
            <div className="flex gap-2 mb-6 max-w-md">
              <Input
                placeholder="Nouvelle classe (ex: CP1)"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
              />
              <Button onClick={handleAddClass} disabled={!newClassName.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                Ajouter
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {Object.entries(sections).map(([sectionKey, classList]) => (
              <div
                key={sectionKey}
                className={`bg-gray-50 rounded-lg p-3 border-2 transition-colors ${
                  targetSectionKey === sectionKey
                    ? 'border-indigo-400 bg-indigo-50/50'
                    : 'border-dashed border-gray-200'
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (draggedClass) setTargetSectionKey(sectionKey)
                }}
                onDragLeave={() => setTargetSectionKey(null)}
                onDrop={async (e) => {
                  e.preventDefault()
                  setTargetSectionKey(null)
                  if (draggedClass && canWrite('settings')) {
                    await moveClass(draggedClass, sectionKey)
                    setDraggedClass(null)
                  }
                }}
              >
                <h3 className="font-semibold text-gray-700 text-sm mb-3 px-1 flex items-center justify-between">
                  {sectionKey}
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    {classList.length}
                  </span>
                </h3>

                <div className="space-y-2 min-h-[100px]">
                  {classList.map((cls) => (
                    <div
                      key={cls}
                      draggable={canWrite('settings')}
                      onDragStart={() => setDraggedClass(cls)}
                      onDragEnd={() => setDraggedClass(null)}
                      className={`flex flex-col gap-2 p-2 bg-white rounded border shadow-sm cursor-grab active:cursor-grabbing transition-opacity ${
                        draggedClass === cls ? 'opacity-50' : 'opacity-100 hover:border-indigo-300'
                      }`}
                    >
                      {editingClass === cls ? (
                        <div className="flex flex-col gap-1 w-full">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
                            className="h-7 text-xs px-2"
                            autoFocus
                          />
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-green-600"
                              onClick={handleConfirmRename}
                            >
                              OK
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => setEditingClass(null)}
                            >
                              Annul
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium text-sm text-gray-800 break-all">{cls}</span>
                          {canWrite('settings') && (
                            <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:text-indigo-600"
                                onClick={() => handleStartRename(cls)}
                                title="Renommer"
                              >
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                </svg>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                onClick={() => handleRemoveClass(cls)}
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {classList.length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-4 italic border-2 border-dashed border-transparent rounded">
                      Glisser ici
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">📧 Service Email</h2>
          <EmailSettings />
        </div>

        <AssessmentSettings />

        <div className="bg-white p-6 rounded shadow max-w-xl border-red-100 border">
          <h2 className="text-lg font-semibold mb-4 text-red-600">Zone de Danger</h2>
          <p className="text-gray-600 mb-4">
            Utilisez ces outils pour réparer la synchronisation avec le cloud ou pour réinitialiser
            la base de données.
          </p>

          <div className="mb-8 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h3 className="font-semibold text-orange-800 mb-2">Réparation de la Synchronisation</h3>
            <p className="text-sm text-orange-700 mb-4">
              Si des données manquent par rapport à Supabase ou si des erreurs bloquent l'envoi, ce
              bouton va réinitialiser l'état de la synchronisation pour tout forcer à se télécharger
              et s'envoyer correctement (AUCUNE donnée ne sera perdue).
            </p>
            <Button
              variant="outline"
              className="bg-white hover:bg-orange-100 border-orange-300 text-orange-700"
              onClick={async () => {
                if (
                  !confirm(
                    "Êtes-vous sûr de vouloir réparer la synchronisation ? L'application va recompter et re-vérifier toutes les données avec le serveur."
                  )
                )
                  return
                setLoading(true)
                try {
                  const res = await window.api.student.repairSync()
                  if (res.success) {
                    setMessage(
                      'Synchronisation réparée. Les données manquantes vont se télécharger dans les prochaines minutes.'
                    )
                  } else {
                    setMessage('Erreur de réparation: ' + res.error)
                  }
                } catch (e: any) {
                  setMessage('Erreur: ' + e.message)
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading}
            >
              Forcer la Réparation de la Synchronisation
            </Button>
          </div>

          <h3 className="font-semibold text-red-600 mb-2">Réinitialisation Complète</h3>

          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="wipeCloud"
              checked={wipeCloud}
              onChange={(e) => setWipeCloud(e.target.checked)}
              className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
            />
            <label htmlFor="wipeCloud" className="text-sm font-medium text-gray-700">
              Effacer également les données sur le Cloud (Supabase)
            </label>
          </div>

          <Button variant="destructive" onClick={handleReset} disabled={loading}>
            {loading
              ? 'Réinitialisation...'
              : wipeCloud
                ? 'TOUT EFFACER (Local + Cloud)'
                : 'Réinitialiser Localement'}
          </Button>
          {message && <p className="mt-4 font-medium p-3 bg-gray-50 rounded border">{message}</p>}
        </div>
      </div>
    </div>
  )
}
