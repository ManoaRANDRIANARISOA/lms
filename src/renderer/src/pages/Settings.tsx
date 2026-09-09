import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'
import { getStudentPhotoUrl } from '../lib/image-utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useClasses } from '@/lib/useClasses'
import { Trash2, Plus, AlertTriangle, Printer, CheckCircle2, RefreshCw, Wrench, Loader2, Ban, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import defaultSchoolLogo from '@/assets/logo.png'
import EmailSettings from '@/pages/settings/EmailSettings'
import AssessmentSettings from '@/pages/settings/AssessmentSettings'
import { DuplicateManager } from '@/components/settings/DuplicateManager'
import { WorkstationMonitor } from '@/components/settings/WorkstationMonitor'

function normalizeStationCode(raw?: string | null): string {
  if (!raw) return 'C1'
  const trimmed = String(raw).trim().toUpperCase()
  const numMatch = trimmed.match(/^(?:CAISSE\s*|POSTE\s*|C)?\s*(\d+)$/i)
  if (numMatch) {
    return `C${numMatch[1]}`
  }
  const clean = trimmed.replace(/[^A-Z0-9]/g, '')
  return clean || 'C1'
}

export default function Settings() {
  const canRead = useAuthStore((s) => s.canRead)
  const canWrite = useAuthStore((s) => s.canWrite)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [wipeCloud, setWipeCloud] = useState(false)

  const [schoolName, setSchoolName] = useState('')
  const [currentYear, setCurrentYear] = useState(useAppStore.getState().currentYear)
  const [schoolLogo, setSchoolLogo] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isLoadingImage, setIsLoadingImage] = useState(false)

  // Printer State
  const [printerName, setPrinterName] = useState('POS-80')
  const [printerCopies, setPrinterCopies] = useState('2')
  const [stationCode, setStationCode] = useState('C1')
  const [availablePrinters, setAvailablePrinters] = useState<Array<{ name: string; isDefault: boolean }>>([])
  const [availableUsbPorts, setAvailableUsbPorts] = useState<string[]>(['USB001', 'USB002', 'USB003'])
  const [switchingPort, setSwitchingPort] = useState<string | null>(null)
  const [testingPrinter, setTestingPrinter] = useState(false)
  const [printerMessage, setPrinterMessage] = useState('')

  // Printer Driver Setup State (Admin Only)
  const [printerSetupStatus, setPrinterSetupStatus] = useState<{
    isInstalled: boolean
    name?: string
    portName?: string
    driverName?: string
    status?: string
    availablePorts?: string[]
    error?: string
  } | null>(null)
  const [checkingPrinterStatus, setCheckingPrinterStatus] = useState(false)
  const [installingPrinter, setInstallingPrinter] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installSuccess, setInstallSuccess] = useState<string | null>(null)

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
          const pName = await window.api.settings.get('printer_name')
          const pCopies = await window.api.settings.get('printer_copies')
          const pStation = await window.api.settings.get('pos_station_code')

          if (name) setSchoolName(name as string)
          if (year) setCurrentYear(year as string)
          if (logo) {
            setSchoolLogo(logo as string)
            setLogoPreview(logo as string | null)
          }
          if (pName) setPrinterName(pName as string)
          if (pCopies) setPrinterCopies(String(pCopies))
          if (pStation) setStationCode(normalizeStationCode(pStation as string))

          if (window.api.printer?.getPrinters) {
            const plist = await window.api.printer.getPrinters()
            setAvailablePrinters(plist || [])
          }

          if (window.api.printer?.checkStatus) {
            setCheckingPrinterStatus(true)
            window.api.printer
              .checkStatus()
              .then((st) => {
                setPrinterSetupStatus(st)
                if (st?.availablePorts && st.availablePorts.length > 0) {
                  setAvailableUsbPorts(st.availablePorts)
                }
              })
              .catch((err) => console.error('Erreur statut imprimante:', err))
              .finally(() => setCheckingPrinterStatus(false))
          }
        } catch (e) {
          if (import.meta.env.DEV) console.error('Failed to load settings', e)
        }
      }
    }
    loadSettings()
  }, [])

  const checkPrinterInstallation = async () => {
    if (window.api?.printer?.checkStatus) {
      setCheckingPrinterStatus(true)
      try {
        const res = await window.api.printer.checkStatus()
        setPrinterSetupStatus(res)
        if (res?.availablePorts && res.availablePorts.length > 0) {
          setAvailableUsbPorts(res.availablePorts)
        }
      } catch (err) {
        console.error('Erreur vérification imprimante', err)
      } finally {
        setCheckingPrinterStatus(false)
      }
    }
  }

  const handleInstallDriver = async () => {
    if (!isAdmin) return
    setInstallError(null)
    setInstallSuccess(null)

    if (printerSetupStatus?.isInstalled) {
      const confirmRepair = window.confirm(
        "L'imprimante POS-80 est déjà enregistrée dans Windows.\n\nSouhaitez-vous relancer la détection automatique et la réaffectation du port USB (utile si le câble de l'imprimante a été changé de prise USB) ?"
      )
      if (!confirmRepair) return
    }

    setInstallingPrinter(true)
    try {
      const res = await window.api.printer.installDriver()
      if (res.success) {
        setInstallSuccess(res.message || 'Imprimante POS-80 configurée avec succès !')
        await checkPrinterInstallation()
        if (window.api.printer?.getPrinters) {
          const plist = await window.api.printer.getPrinters()
          setAvailablePrinters(plist || [])
          setPrinterName('POS-80')
        }
      } else {
        setInstallError(res.error || "Échec lors de l'initialisation de l'imprimante.")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue'
      setInstallError(msg)
    } finally {
      setInstallingPrinter(false)
    }
  }

  const [detectingPort, setDetectingPort] = useState(false)
  const handleAutoDetectPort = async () => {
    setDetectingPort(true)
    setInstallError(null)
    setInstallSuccess(null)
    try {
      if (window.api.printer?.autoDetectPort) {
        const res = await window.api.printer.autoDetectPort()
        if (res.success) {
          setInstallSuccess(res.message || 'Port USB détecté et réassigné avec succès !')
          toast.success(res.message || 'Port USB réassigné avec succès !')
          await checkPrinterInstallation()
        } else {
          setInstallError(res.error || 'Impossible de réassigner le port USB.')
          toast.error(res.error || 'Impossible de réassigner le port USB.')
        }
      }
    } catch (e: any) {
      setInstallError(e?.message || 'Erreur auto-détection')
    } finally {
      setDetectingPort(false)
    }
  }

  const handleSetUsbPort = async (port: string) => {
    setSwitchingPort(port)
    setInstallError(null)
    setInstallSuccess(null)
    try {
      if (window.api?.printer?.setPort) {
        const res = await window.api.printer.setPort(port, printerName)
        if (res.success) {
          setInstallSuccess(res.message || `Port basculé sur ${port} avec succès`)
          toast.success(`Port basculé sur ${port}`)
          await checkPrinterInstallation()
        } else {
          setInstallError(res.error || `Erreur affectation port ${port}`)
          toast.error(res.error || `Erreur affectation port ${port}`)
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors du changement de port'
      setInstallError(msg)
      toast.error(msg)
    } finally {
      setSwitchingPort(null)
    }
  }

  const handleStationChange = async (val: string) => {
    const norm = normalizeStationCode(val)
    setStationCode(norm)
    useAppStore.getState().setStationCode(norm)
    try {
      if (window.api) {
        const res = await window.api.settings.set('pos_station_code', norm)
        if (res && res.success === false) {
          toast.error(res.error || 'Erreur enregistrement caisse')
          return
        }
        await useAppStore.getState().fetchSettings()
        toast.success(`Poste de caisse configuré sur ${norm} (Ce réglage est actif immédiatement et restera permanent sur ce PC)`)
      }
    } catch (e: any) {
      toast.error('Erreur enregistrement caisse: ' + (e?.message || String(e)))
    }
  }

  const handleSaveConfig = async () => {
    setLoading(true)
    setMessage('')
    try {
      if (window.api) {
        await window.api.settings.set('school_name', schoolName)
        await window.api.settings.set('school_year', currentYear)
        await window.api.settings.set('school_logo', schoolLogo)
        await window.api.settings.set('printer_name', printerName)
        await window.api.settings.set('printer_copies', parseInt(printerCopies) || 2)
        await window.api.settings.set('pos_station_code', normalizeStationCode(stationCode))

        useAppStore.getState().setStationCode(stationCode)
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

  const handleTestPrint = async () => {
    if (!window.api?.printer?.testPrint) return
    setTestingPrinter(true)
    setPrinterMessage('')
    try {
      const res = await window.api.printer.testPrint(printerName)
      if (res.success) {
        setPrinterMessage('Test envoyé avec succès ! Vérifiez la sortie papier.')
      } else {
        setPrinterMessage('Échec : ' + (res.error || 'Erreur inconnue'))
      }
    } catch (e: any) {
      setPrinterMessage('Erreur : ' + e.message)
    } finally {
      setTestingPrinter(false)
    }
  }

  const [clearingQueue, setClearingQueue] = useState(false)
  const handleClearPrinterQueue = async () => {
    if (!window.api?.printer?.clearQueue) return
    if (
      !confirm(
        "Arrêt d'urgence de l'impression :\n\nVoulez-vous forcer l'annulation immédiate de toutes les impressions en cours et vider la file d'attente Windows de l'imprimante thermique ?"
      )
    ) {
      return
    }
    setClearingQueue(true)
    setPrinterMessage('')
    try {
      const res = await window.api.printer.clearQueue(printerName)
      if (res.success) {
        setPrinterMessage((res as any).message || "File d'attente de l'imprimante vidée avec succès. Impression arrêtée.")
        toast.success("File d'attente vidée avec succès !")
      } else {
        setPrinterMessage('Erreur purge : ' + (res.error || 'Erreur inconnue'))
      }
    } catch (e: any) {
      setPrinterMessage('Erreur : ' + e.message)
    } finally {
      setClearingQueue(false)
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

  const handleResetLogo = async () => {
    setSchoolLogo('')
    setLogoPreview(null)
    try {
      if (window.api) {
        await window.api.settings.set('school_logo', '')
        await useAppStore.getState().fetchSettings()
        toast.success('Logo réinitialisé au blason officiel de l\'établissement')
      }
    } catch (err: any) {
      toast.error('Erreur réinitialisation logo: ' + err.message)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Paramètres du Système</h1>
          <p className="text-sm text-gray-500">
            Configuration générale de l'établissement, caisse locale, imprimante thermique et synchronisation
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1 : Configuration de l'Établissement & Logo */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-gray-800">Configuration de l'Établissement</h2>
            </div>
            <span className="text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-full">
              Informations Générales
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Colonne Gauche : Nom et Année Scolaire */}
            <div className="space-y-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="schoolName">Nom de l'établissement</Label>
                <Input
                  type="text"
                  id="schoolName"
                  placeholder="Ex: Lycée Privé Manjary Soa"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                />
              </div>

              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="currentYear">Année Scolaire Courante</Label>
                <Input
                  type="text"
                  id="currentYear"
                  placeholder="Ex: 2026-2027"
                  value={currentYear}
                  onChange={(e) => setCurrentYear(e.target.value)}
                />
              </div>

              <Button
                onClick={handleSaveConfig}
                disabled={loading || !canWrite('settings')}
                className="w-full mt-2"
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

            {/* Colonne Droite : Logo de l'établissement */}
            <div className="p-4 bg-gray-50/70 rounded-xl border border-gray-200/60 space-y-3">
              <Label htmlFor="schoolLogo" className="font-semibold text-gray-700">Logo de l'établissement</Label>
              <div className="flex gap-4 items-center">
                <div className="w-24 h-24 bg-white rounded-xl flex items-center justify-center overflow-hidden border-2 border-primary/20 p-1.5 shadow-sm shrink-0">
                  {isLoadingImage ? (
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  ) : logoPreview ? (
                    <img
                      src={getStudentPhotoUrl(logoPreview) || ''}
                      alt="Logo personnalisé"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={defaultSchoolLogo}
                      alt="Logo officiel actif"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLogoSelect}
                      disabled={isLoadingImage}
                      className="text-xs"
                    >
                      {isLoadingImage ? 'Chargement...' : 'Changer le logo...'}
                    </Button>
                    {schoolLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleResetLogo}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Rétablir officiel
                      </Button>
                    )}
                  </div>
                  <div>
                    {schoolLogo ? (
                      <p className="text-xs text-emerald-700 font-medium truncate" title={schoolLogo}>
                        ✓ Logo personnalisé actif ({schoolLogo})
                      </p>
                    ) : (
                      <p className="text-xs text-blue-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Blason officiel actif (Lycée Privé Manjary Soa)</span>
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Ce logo s'affiche automatiquement en tête des tickets de caisse 80 mm et des bilans.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2 : Imprimante Thermique (Tickets 80mm) — Disposée en dessous */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-800">
                Imprimante Thermique (Tickets 80mm)
              </h2>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              ESC/POS Direct
            </span>
          </div>

          <p className="text-xs text-gray-500">
            Impression directe des reçus de caisse 80 mm avec logo, code-barres et double exemplaire (Parent + Caisse).
          </p>

          <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="printerName" className="text-xs font-semibold text-gray-700">Imprimante Windows</Label>
                  {availablePrinters.length > 0 ? (
                    <select
                      id="printerName"
                      value={printerName}
                      onChange={(e) => setPrinterName(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {availablePrinters.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} {p.name === 'POS-80' ? '(Recommandé)' : ''}
                        </option>
                      ))}
                      {!availablePrinters.some((p) => p.name === printerName) && (
                        <option value={printerName}>{printerName}</option>
                      )}
                    </select>
                  ) : (
                    <Input
                      type="text"
                      id="printerName"
                      placeholder="Ex: POS-80"
                      value={printerName}
                      onChange={(e) => setPrinterName(e.target.value)}
                    />
                  )}
                  <p className="text-[11px] text-gray-500">
                    Nom du périphérique Windows (défaut : <code>POS-80</code>).
                  </p>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="printerCopies" className="text-xs font-semibold text-gray-700">Nombre d'exemplaires</Label>
                  <select
                    id="printerCopies"
                    value={printerCopies}
                    onChange={(e) => setPrinterCopies(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="2">2 exemplaires (Parent + Caisse)</option>
                    <option value="1">1 exemplaire (Parent uniquement)</option>
                  </select>
                  <p className="text-[11px] text-gray-500">
                    Découpe automatique du papier entre chaque reçu.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="stationCode" className="text-xs font-semibold text-gray-800">
                    Identifiant du Poste de Caisse (Multi-Postes)
                  </Label>
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-mono font-medium">
                    Anti-conflit Hors-Ligne
                  </span>
                </div>
                <select
                  id="stationCode"
                  value={stationCode}
                  onChange={(e) => handleStationChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="C1">Caisse C1 (Direction / Caisse Principale) — ex: REC-2026-C1-00062</option>
                  <option value="C2">Caisse C2 (Secrétariat / Caisse 2) — ex: REC-2026-C2-00001</option>
                  <option value="C3">Caisse C3 (Comptabilité / Bureau 3) — ex: REC-2026-C3-00001</option>
                  <option value="C4">Caisse C4 (Guichet 4) — ex: REC-2026-C4-00001</option>
                  <option value="C5">Caisse C5 (Guichet 5) — ex: REC-2026-C5-00001</option>
                </select>
                <p className="text-[11px] text-gray-500">
                  Ce numéro garantit la continuité séquentielle sans collision entre postes en mode hors-ligne. Propre à ce PC physique.
                </p>
              </div>

              {/* Assistant Matériel : Pilote POS-80 & Sélecteur USB (Visible Admin) */}
              {isAdmin && (
                <div className="p-3.5 rounded-lg border border-blue-200/80 bg-blue-50/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-gray-800">
                        Configuration Matérielle & Plug & Play
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Admin
                    </span>
                  </div>

                  {/* Statut de l'imprimante */}
                  {checkingPrinterStatus ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span>Vérification du matériel et détection USB...</span>
                    </div>
                  ) : printerSetupStatus?.isInstalled ? (
                    <div
                      className={`p-2.5 rounded border shadow-2xs space-y-1 ${
                        (printerSetupStatus as any).isConnected !== false
                          ? 'bg-white border-emerald-200'
                          : 'bg-amber-50/70 border-amber-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium text-xs">
                        {(printerSetupStatus as any).isConnected !== false ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-emerald-700 font-semibold">
                              Imprimante POS-80 connectée et prête (En ligne)
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-amber-800 font-semibold">
                              Imprimante installée mais débranchée ou hors-tension
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-600 font-mono pl-5 space-y-0.5">
                        <div>
                          Port physique actif :{' '}
                          <span className="font-semibold text-gray-800">
                            {printerSetupStatus.portName || 'USB001'}
                          </span>{' '}
                          {(printerSetupStatus as any).isConnected !== false ? (
                            <span className="text-emerald-600 font-sans font-medium text-[10px] bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 ml-1">
                              Connecté
                            </span>
                          ) : (
                            <span className="text-amber-600 font-sans font-medium text-[10px] bg-amber-100 px-1 py-0.2 rounded border border-amber-300 ml-1">
                              En attente
                            </span>
                          )}
                        </div>
                        <div>
                          Pilote :{' '}
                          <span className="font-semibold text-gray-800">
                            {printerSetupStatus.driverName || 'Generic / Text Only'}
                          </span>{' '}
                          (Statut : {printerSetupStatus.status || 'Normal'})
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 p-2.5 rounded border border-amber-200 text-xs text-amber-800 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Imprimante POS-80 non configurée sur ce PC</span>
                      </div>
                      <p className="text-[11px] text-amber-700">
                        Ce poste n'a pas encore l'imprimante ticket enregistrée. Branchez la Xprinter en USB et cliquez sur initialiser.
                      </p>
                    </div>
                  )}

                  {/* Sélecteur direct 1-clic de Port USB */}
                  <div className="bg-white/80 p-2.5 rounded border border-blue-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-700">Sélection directe du Port USB :</span>
                      <span className="text-[10px] text-gray-500">
                        Port actif : <strong className="text-blue-900">{printerSetupStatus?.portName || 'USB001'}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(availableUsbPorts.length > 0 ? availableUsbPorts : ['USB001', 'USB002', 'USB003']).map((port) => {
                        const isActive = printerSetupStatus?.portName === port
                        return (
                          <Button
                            key={port}
                            type="button"
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            disabled={switchingPort !== null || checkingPrinterStatus}
                            onClick={() => handleSetUsbPort(port)}
                            className={`h-7 px-3 text-xs font-mono transition-all ${
                              isActive
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm border-emerald-700'
                                : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300'
                            }`}
                            title={`Basculer immédiatement l'imprimante Windows sur le port ${port}`}
                          >
                            {switchingPort === port ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                            {port} {isActive ? '✓ (Actif)' : ''}
                          </Button>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Si l'imprimante a été branchée sur une autre prise USB, cliquez sur le port correspondant (ex: USB002) ou cliquez sur la détection automatique.
                    </p>
                  </div>

                  {/* Boutons d'action Plug & Play */}
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAutoDetectPort}
                      disabled={detectingPort || installingPrinter}
                      className="text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      title="Détecte automatiquement le port USB actif (USB001, USB002...) et répare le statut hors-ligne si besoin"
                    >
                      {detectingPort ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Détection du port...
                        </>
                      ) : (
                        <>
                          <Wrench className="w-3.5 h-3.5 mr-1.5" />
                          Détecter & Calibrer port USB (Plug & Play)
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant={printerSetupStatus?.isInstalled ? 'outline' : 'default'}
                      size="sm"
                      onClick={handleInstallDriver}
                      disabled={installingPrinter || checkingPrinterStatus}
                      className={
                        printerSetupStatus?.isInstalled
                          ? 'text-xs border-blue-300 text-blue-700 hover:bg-blue-100/60'
                          : 'text-xs bg-blue-600 hover:bg-blue-700 text-white'
                      }
                    >
                      {installingPrinter ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Configuration...
                        </>
                      ) : printerSetupStatus?.isInstalled ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Réinstaller POS-80
                        </>
                      ) : (
                        <>
                          <Wrench className="w-3.5 h-3.5 mr-1.5" />
                          Initialiser POS-80
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={checkPrinterInstallation}
                      disabled={checkingPrinterStatus || installingPrinter}
                      title="Actualiser la vérification"
                      className="text-xs text-gray-500 hover:text-gray-700 h-8 px-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingPrinterStatus ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>

                  {installSuccess && (
                    <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded">
                      {installSuccess}
                    </p>
                  )}

                  {installError && (
                    <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded">
                      {installError}
                    </p>
                  )}
                </div>
              )}

              {/* 3 Boutons de test, arrêt d'urgence et sauvegarde — Flex responsive aéré */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestPrint}
                    disabled={testingPrinter}
                    className="border-primary/30 text-primary hover:bg-accent/20 text-xs h-9 px-3.5 font-medium"
                  >
                    <Printer className="w-4 h-4 mr-1.5 text-primary" />
                    {testingPrinter ? 'Impression...' : 'Ticket Test'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearPrinterQueue}
                    disabled={clearingQueue}
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-400 text-xs h-9 px-3.5 font-medium"
                    title="Force l'annulation immédiate de toutes les impressions bloquées et vide la file d'attente Windows"
                  >
                    {clearingQueue ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-rose-600" />
                        Purge...
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4 mr-1.5 text-rose-600" />
                        Arrêt d'Urgence (Purge)
                      </>
                    )}
                  </Button>
                </div>

                <Button
                  onClick={handleSaveConfig}
                  disabled={loading || !canWrite('settings')}
                  className="text-xs h-9 px-5 shrink-0 font-medium"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer les Réglages'}
                </Button>
              </div>

              {printerMessage && (
                <p
                  className={`text-xs font-medium p-2.5 rounded border ${
                    printerMessage.includes('succès')
                      ? 'text-green-700 bg-green-50 border-green-200'
                      : 'text-red-700 bg-red-50 border-red-200'
                  }`}
                >
                  {printerMessage}
                </p>
              )}
            </div>
          </div>

        {/* Class Management */}
        <div className="bg-white p-6 rounded-xl shadow-sm w-full border border-gray-100 mb-6">
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

        <div className="w-full">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">📧 Service Email</h2>
          <EmailSettings />
        </div>

        <AssessmentSettings />
        <DuplicateManager />
        <WorkstationMonitor />

        <div className="bg-white p-6 rounded-xl shadow-sm w-full border-red-100 border">
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
