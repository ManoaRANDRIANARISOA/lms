import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'
import { getStudentPhotoUrl } from '../lib/image-utils'
import { useAuthStore } from '@/store/useAuthStore'

export default function Settings() {
  const canRead = useAuthStore((s) => s.canRead)
  const canWrite = useAuthStore((s) => s.canWrite)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [wipeCloud, setWipeCloud] = useState(false)

  const [schoolName, setSchoolName] = useState('')
  const [currentYear, setCurrentYear] = useState('2025-2026')
  const [schoolLogo, setSchoolLogo] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isLoadingImage, setIsLoadingImage] = useState(false)

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
          const year = await window.api.settings.get('current_year')
          const logo = await window.api.settings.get('school_logo')

          if (name) setSchoolName(name as string)
          if (year) setCurrentYear(year as string)
          if (logo) {
            setSchoolLogo(logo as string)
            setLogoPreview(logo as string | null)
          }
        } catch (e) {
          console.error('Failed to load settings', e)
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
        await window.api.settings.set('current_year', currentYear)
        await window.api.settings.set('school_logo', schoolLogo)
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
      console.error('Failed to open file dialog', err)
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

  const handleRepair = async () => {
    setLoading(true)
    try {
      const result = await window.api.student.repair('2025-2026')
      if (result.success) {
        setMessage(`Réparation terminée. ${result.fixedCount} inscriptions créées.`)
      } else {
        setMessage('Erreur: ' + result.error)
      }
    } catch (e: any) {
      setMessage('Erreur: ' + e.message)
    } finally {
      setLoading(false)
    }
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
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow max-w-xl">
          <h2 className="text-lg font-semibold mb-4 text-blue-600">Maintenance des Données</h2>
          <p className="text-gray-600 mb-4">
            Utilisez cette option si vous voyez des élèves avec une classe mais sans inscription
            validée (pas de bande verte).
          </p>
          <Button
            onClick={handleRepair}
            disabled={loading}
            variant="outline"
            className="border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            {loading ? 'Traitement...' : 'Réparer les Inscriptions Manquantes'}
          </Button>
        </div>

        <div className="bg-white p-6 rounded shadow max-w-xl border-red-100 border">
          <h2 className="text-lg font-semibold mb-4 text-red-600">Zone de Danger</h2>
          <p className="text-gray-600 mb-4">
            Utilisez ce bouton pour effacer toutes les données locales et repartir à zéro.
          </p>

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
