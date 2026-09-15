import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, Send, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/lib/usePermissions'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

interface EmailConfigState {
  enabled: boolean
  gmail_address: string
  gmail_app_password: string
  recipient_email: string
  auto_send_daily: boolean
}

interface EmailLogEntry {
  sent_at: string
  recipient: string
  subject: string
  success: boolean
  error?: string
}

export default function EmailSettings() {
  const { canWrite } = usePermissions()
  const [config, setConfig] = useState<EmailConfigState>({
    enabled: true,
    gmail_address: 'mmanjarysoa@gmail.com',
    gmail_app_password: '',
    recipient_email: 'christineanjarasoa36@gmail.com',
    auto_send_daily: true
  })
  const [showPassword, setShowPassword] = useState(false)
  const [logs, setLogs] = useState<EmailLogEntry[]>([])
  const [status, setStatus] = useState({ configured: false, enabled: false, auto_send: false })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [sendingReport, setSendingReport] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadConfig()
    loadLogs()
    loadStatus()
  }, [])

  const loadConfig = async () => {
    try {
      const raw = await window.api.settings.get('email_config')
      if (raw) {
        const loaded = raw as EmailConfigState
        const recipient =
          loaded.recipient_email && loaded.recipient_email !== 'mmanjarysoa@gmail.com'
            ? loaded.recipient_email
            : 'christineanjarasoa36@gmail.com'
        setConfig({
          enabled: loaded.enabled !== undefined ? loaded.enabled : true,
          gmail_address: loaded.gmail_address || 'mmanjarysoa@gmail.com',
          gmail_app_password: loaded.gmail_app_password || '',
          recipient_email: recipient,
          auto_send_daily: loaded.auto_send_daily !== undefined ? loaded.auto_send_daily : true
        })
      }
    } catch {
      // Default config
    }
  }

  const loadLogs = async () => {
    try {
      const result = await window.api.email.getLogs()
      if (result.success) setLogs(result.logs || [])
    } catch {
      // Empty logs
    }
  }

  const loadStatus = async () => {
    try {
      const result = await window.api.email.getStatus()
      if (result.success) {
        setStatus({
          configured: result.configured || false,
          enabled: result.enabled || false,
          auto_send: result.auto_send || false
        })
      }
    } catch {
      // Default status
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    setMessage(null)
    const toastId = toast.loading('Enregistrement de la configuration email...')
    try {
      const result = await window.api.email.configure(config)
      if (result.success) {
        toast.success('Configuration email enregistrée avec succès !', { id: toastId, duration: 4000 })
        setMessage({ text: 'Configuration enregistrée avec succès', type: 'success' })
        loadStatus()
      } else {
        toast.error(`Erreur d'enregistrement : ${result.error || 'Erreur'}`, { id: toastId, duration: 6000 })
        setMessage({ text: result.error || 'Erreur d\'enregistrement', type: 'error' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de sauvegarde'
      toast.error(`Erreur : ${msg}`, { id: toastId, duration: 6000 })
      setMessage({ text: 'Erreur de sauvegarde', type: 'error' })
    } finally {
      setSaving(false)
    }
    setTimeout(() => setMessage(null), 5000)
  }

  const testConnection = async () => {
    setTesting(true)
    setMessage(null)
    const toastId = toast.loading('Vérification de la liaison SMTP avec Google...')
    try {
      const result = await window.api.email.testConnection({
        gmail_address: config.gmail_address,
        gmail_app_password: config.gmail_app_password
      })
      if (result.success) {
        toast.success('Connexion SMTP Google réussie ! Vos identifiants sont 100% opérationnels.', { id: toastId, duration: 6000 })
        setMessage({ text: 'Connexion SMTP Google réussie avec succès', type: 'success' })
      } else {
        toast.error(`Échec du test : ${result.error || 'Connexion échouée'}`, { id: toastId, duration: 10000 })
        setMessage({ text: result.error || 'Connexion échouée', type: 'error' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de test'
      toast.error(`Erreur inattendue : ${msg}`, { id: toastId, duration: 8000 })
      setMessage({ text: 'Erreur de test', type: 'error' })
    } finally {
      setTesting(false)
    }
    setTimeout(() => setMessage(null), 10000)
  }

  const sendDailyReportNow = async () => {
    setSendingReport(true)
    setMessage(null)
    const toastId = toast.loading('Génération du bilan officiel et envoi par email...')
    try {
      const result = await window.api.email.sendDailyReport()
      if (result.success) {
        toast.success(`Rapport journalier avec PDF officiel envoyé à ${config.recipient_email} !`, { id: toastId, duration: 6000 })
        setMessage({
          text: `Rapport journalier complet avec PDF envoyé avec succès à ${config.recipient_email}`,
          type: 'success'
        })
        loadLogs()
      } else {
        toast.error(`Échec de l'envoi : ${result.error || "Échec de l'envoi du rapport"}`, { id: toastId, duration: 9000 })
        setMessage({
          text: result.error || "Échec de l'envoi du rapport",
          type: 'error'
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue'
      toast.error(`Erreur : ${msg}`, { id: toastId, duration: 8000 })
      setMessage({ text: msg, type: 'error' })
    } finally {
      setSendingReport(false)
    }
    setTimeout(() => setMessage(null), 8000)
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner resource="settings" />

      {/* Status */}
      <div className="p-4 bg-white rounded-lg border shadow-sm">
        <h3 className="text-lg font-semibold mb-2">État du service</h3>
        <div className="flex gap-4 text-sm">
          <span
            className={cn(
              'px-2 py-1 rounded',
              status.configured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            )}
          >
            {status.configured ? 'Configuré' : 'Non configuré'}
          </span>
          <span
            className={cn(
              'px-2 py-1 rounded',
              status.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            )}
          >
            {status.enabled ? 'Activé' : 'Désactivé'}
          </span>
          <span
            className={cn(
              'px-2 py-1 rounded',
              status.auto_send ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}
          >
            {status.auto_send ? 'Envoi auto 18h' : 'Envoi manuel'}
          </span>
        </div>
      </div>

      {/* Config form */}
      <div className="p-4 bg-white rounded-lg border shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Configuration SMTP Gmail</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="email-enabled"
              checked={config.enabled}
              onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="email-enabled">Activer le service email</Label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Adresse Gmail</Label>
              <Input
                type="email"
                value={config.gmail_address}
                onChange={(e) => setConfig((p) => ({ ...p, gmail_address: e.target.value }))}
                placeholder="exemple@gmail.com"
                className="mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Mot de passe d'application Google (16 lettres)</Label>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium underline"
                  title="Ouvrir la page de création Google"
                >
                  <ExternalLink className="w-3 h-3" />
                  Générer sur Google
                </a>
              </div>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={config.gmail_app_password}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      gmail_app_password: e.target.value.replace(/\s+/g, '')
                    }))
                  }
                  placeholder="ex: abcd efgh ijkl mnop"
                  className="pr-10 font-mono tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Généré dans Compte Google → Sécurité → Validation en 2 étapes → Mots de passe d'application. Les espaces sont retirés automatiquement.
              </p>
            </div>
          </div>
          <div>
            <Label>Email du destinataire (Directeur)</Label>
            <Input
              type="email"
              value={config.recipient_email}
              onChange={(e) => setConfig((p) => ({ ...p, recipient_email: e.target.value }))}
              placeholder="directeur@ecole.mg"
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="auto-send"
              checked={config.auto_send_daily}
              onChange={(e) => setConfig((p) => ({ ...p, auto_send_daily: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="auto-send">
              Envoi automatique du bilan journalier à 18h (Jours ouvrables : Lundi au Samedi)
            </Label>
          </div>

          {message && (
            <div
              className={cn(
                'p-3.5 rounded-lg text-sm font-medium flex items-start gap-2.5 shadow-sm transition-all',
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              )}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{message.text}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {canWrite('settings') && (
              <>
                <Button onClick={saveConfig} disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button
                  variant="outline"
                  onClick={testConnection}
                  disabled={testing || !config.gmail_address}
                >
                  {testing ? 'Test en cours...' : 'Tester la connexion'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={sendDailyReportNow}
                  disabled={sendingReport || !config.enabled}
                  className="flex items-center gap-1.5"
                  title="Génère et transmet immédiatement le bilan du jour avec PDF"
                >
                  {sendingReport ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Envoi du bilan en cours...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Envoyer le rapport du jour maintenant
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="p-4 bg-white rounded-lg border shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Historique des envois</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun envoi enregistré.</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {logs.map((log, i) => (
              <div key={i} className="p-3 bg-gray-50 border rounded-lg text-sm flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {log.success ? (
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">{log.subject}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.sent_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}{' '}
                    {new Date(log.sent_at).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>Destinataire : <strong className="text-foreground">{log.recipient}</strong></span>
                </div>
                {log.error && (
                  <div className="mt-1 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 break-words leading-relaxed font-normal">
                    {log.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
