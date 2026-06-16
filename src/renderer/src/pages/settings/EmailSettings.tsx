import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle } from 'lucide-react'
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
    enabled: false,
    gmail_address: '',
    gmail_app_password: '',
    recipient_email: '',
    auto_send_daily: false
  })
  const [logs, setLogs] = useState<EmailLogEntry[]>([])
  const [status, setStatus] = useState({ configured: false, enabled: false, auto_send: false })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadConfig()
    loadLogs()
    loadStatus()
  }, [])

  const loadConfig = async () => {
    try {
      const raw = await window.api.settings.get('email_config')
      if (raw) setConfig(raw as EmailConfigState)
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
    try {
      const result = await window.api.email.configure(config)
      if (result.success) {
        setMessage({ text: 'Configuration enregistrée', type: 'success' })
        loadStatus()
      } else {
        setMessage({ text: result.error || 'Erreur', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Erreur de sauvegarde', type: 'error' })
    } finally {
      setSaving(false)
    }
    setTimeout(() => setMessage(null), 3000)
  }

  const testConnection = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const result = await window.api.email.testConnection()
      if (result.success) {
        setMessage({ text: 'Connexion SMTP réussie', type: 'success' })
      } else {
        setMessage({ text: result.error || 'Connexion échouée', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Erreur de test', type: 'error' })
    } finally {
      setTesting(false)
    }
    setTimeout(() => setMessage(null), 5000)
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner resource="settings" />

      {message && (
        <div
          className={cn(
            'p-4 rounded-md',
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          )}
        >
          {message.text}
        </div>
      )}

      {/* Status */}
      <div className="p-4 bg-white rounded-lg border shadow-sm">
        <h3 className="text-lg font-semibold mb-2">État du service</h3>
        <div className="flex gap-4 text-sm">
          <span className={cn('px-2 py-1 rounded', status.configured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>
            {status.configured ? 'Configuré' : 'Non configuré'}
          </span>
          <span className={cn('px-2 py-1 rounded', status.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>
            {status.enabled ? 'Activé' : 'Désactivé'}
          </span>
          <span className={cn('px-2 py-1 rounded', status.auto_send ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600')}>
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
              <Label>Mot de passe d'application</Label>
              <Input
                type="password"
                value={config.gmail_app_password}
                onChange={(e) => setConfig((p) => ({ ...p, gmail_app_password: e.target.value }))}
                placeholder="xxxx xxxx xxxx xxxx"
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">
                Généré dans Google → Sécurité → Validation en 2 étapes → Mots de passe d'application
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
            <Label htmlFor="auto-send">Envoi automatique du bilan journalier à 18h</Label>
          </div>
          <div className="flex gap-2">
            {canWrite('settings') && (
              <>
                <Button onClick={saveConfig} disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button variant="outline" onClick={testConnection} disabled={testing || !config.gmail_address}>
                  {testing ? 'Test en cours...' : 'Tester la connexion'}
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
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 text-sm p-2 bg-gray-50 rounded">
                {log.success ? (
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                <span className="text-gray-500 text-xs">
                  {new Date(log.sent_at).toLocaleDateString('fr-FR')} {new Date(log.sent_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex-1 truncate">{log.subject}</span>
                <span className="text-gray-400 text-xs">{log.recipient}</span>
                {log.error && <span className="text-red-500 text-xs">{log.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
