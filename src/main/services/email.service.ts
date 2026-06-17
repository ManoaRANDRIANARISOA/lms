/**
 * email.service.ts — Email Automation Service
 *
 * Sends emails via Gmail SMTP (App Password).
 * Stores config in the 'settings' table (keys: 'email_config').
 * Schedules daily reports at 18:00.
 *
 * @module EmailService
 */

import nodemailer from 'nodemailer'
import db from '../database/db'

interface EmailConfig {
  enabled: boolean
  gmail_address: string
  gmail_app_password: string
  recipient_email: string
  auto_send_daily: boolean
}

interface EmailLog {
  sent_at: string
  recipient: string
  subject: string
  success: boolean
  error?: string
}

let transporter: nodemailer.Transporter | null = null
let schedulerInterval: ReturnType<typeof setInterval> | null = null

function getConfig(): EmailConfig | null {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'email_config'").get() as
      | { value: string }
      | undefined
    if (!row) return null
    return JSON.parse(row.value) as EmailConfig
  } catch {
    return null
  }
}

function saveConfig(config: EmailConfig): void {
  const existing = db.prepare("SELECT key FROM settings WHERE key = 'email_config'").get()
  if (existing) {
    db.prepare(
      "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE key = 'email_config'"
    ).run(JSON.stringify(config))
  } else {
    db.prepare("INSERT INTO settings (key, value, sync_status) VALUES (?, ?, 'pending')").run(
      'email_config',
      JSON.stringify(config)
    )
  }
}

function initTransporter(config: EmailConfig): boolean {
  if (!config.gmail_address || !config.gmail_app_password) return false
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmail_address,
      pass: config.gmail_app_password
    }
  })
  return true
}

function addEmailLog(log: EmailLog): void {
  try {
    const existing = db.prepare("SELECT value FROM settings WHERE key = 'email_logs'").get() as
      | { value: string }
      | undefined
    const logs: EmailLog[] = existing ? JSON.parse(existing.value) : []
    logs.unshift(log)
    if (logs.length > 50) logs.length = 50
    const row = db.prepare("SELECT key FROM settings WHERE key = 'email_logs'").get()
    if (row) {
      db.prepare(
        "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'email_logs'"
      ).run(JSON.stringify(logs))
    } else {
      db.prepare("INSERT INTO settings (key, value, sync_status) VALUES (?, ?, 'synced')").run(
        'email_logs',
        JSON.stringify(logs)
      )
    }
  } catch {
    // Silent fail for logging
  }
}

export class EmailService {
  static configure(config: EmailConfig): { success: boolean; error?: string } {
    try {
      saveConfig(config)
      if (config.enabled && config.gmail_address && config.gmail_app_password) {
        initTransporter(config)
      } else {
        transporter = null
      }
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de configuration'
      return { success: false, error: message }
    }
  }

  static getStatus(): { configured: boolean; enabled: boolean; auto_send: boolean } {
    const config = getConfig()
    return {
      configured: !!(config?.gmail_address && config?.gmail_app_password),
      enabled: config?.enabled || false,
      auto_send: config?.auto_send_daily || false
    }
  }

  static getLogs(): EmailLog[] {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'email_logs'").get() as
        | { value: string }
        | undefined
      return row ? JSON.parse(row.value) : []
    } catch {
      return []
    }
  }

  static async testConnection(): Promise<{ success: boolean; error?: string }> {
    const config = getConfig()
    if (!config?.gmail_address || !config?.gmail_app_password) {
      return { success: false, error: 'Configuration email manquante' }
    }
    try {
      const testTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.gmail_address, pass: config.gmail_app_password }
      })
      await testTransporter.verify()
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connexion échouée'
      return { success: false, error: message }
    }
  }

  static async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const config = getConfig()
    if (!config?.enabled) {
      return { success: false, error: 'Service email désactivé' }
    }
    if (!transporter) {
      if (!config || !initTransporter(config)) {
        return { success: false, error: 'Configuration email invalide' }
      }
    }
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: config!.gmail_address,
        to,
        subject,
        html: body
      }
      if (attachments && attachments.length > 0) {
        mailOptions.attachments = attachments.map((path) => ({ path }))
      }
      await transporter!.sendMail(mailOptions)
      addEmailLog({ sent_at: new Date().toISOString(), recipient: to, subject, success: true })
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Envoi échoué'
      addEmailLog({
        sent_at: new Date().toISOString(),
        recipient: to,
        subject,
        success: false,
        error: message
      })
      return { success: false, error: message }
    }
  }

  static async sendDailyReport(pdfPath?: string): Promise<{ success: boolean; error?: string }> {
    const config = getConfig()
    if (!config?.recipient_email) {
      return { success: false, error: 'Email destinataire non configuré' }
    }
    const today = new Date().toLocaleDateString('fr-FR')
    const subject = `Bilan journalier — ${today}`
    const body = `<h2>Bilan journalier du ${today}</h2><p>Veuillez trouver ci-joint le bilan journalier de caisse.</p>`
    const attachments = pdfPath ? [pdfPath] : undefined
    return EmailService.sendEmail(config.recipient_email, subject, body, attachments)
  }

  static startScheduler(): void {
    if (schedulerInterval) return
    schedulerInterval = setInterval(() => {
      const config = getConfig()
      if (!config?.enabled || !config?.auto_send_daily) return
      const now = new Date()
      if (now.getHours() >= 18) {
        const today = now.toISOString().split('T')[0]
        let lastSent = ''
        try {
          const row = db
            .prepare("SELECT value FROM settings WHERE key = 'email_last_sent_date'")
            .get() as { value: string } | undefined
          if (row) lastSent = JSON.parse(row.value)
        } catch {
          /* ignore */
        }

        if (lastSent !== today) {
          EmailService.sendDailyReport()
            .then(() => {
              try {
                const exists = db
                  .prepare("SELECT key FROM settings WHERE key = 'email_last_sent_date'")
                  .get()
                if (exists) {
                  db.prepare(
                    "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'email_last_sent_date'"
                  ).run(JSON.stringify(today))
                } else {
                  db.prepare(
                    "INSERT INTO settings (key, value, sync_status) VALUES (?, ?, 'synced')"
                  ).run('email_last_sent_date', JSON.stringify(today))
                }
              } catch {
                /* silent */
              }
            })
            .catch(() => {})
        }
      }
    }, 60 * 1000)
  }

  static stopScheduler(): void {
    if (schedulerInterval) {
      clearInterval(schedulerInterval)
      schedulerInterval = null
    }
  }
}
