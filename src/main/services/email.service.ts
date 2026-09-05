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
import { CashJournalRepository } from '../database/repositories/cashjournal.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { PdfService } from './pdf.service'

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
    const parsed = JSON.parse(row.value) as EmailConfig
    const recipient =
      parsed.recipient_email && parsed.recipient_email !== 'mmanjarysoa@gmail.com'
        ? parsed.recipient_email
        : 'christineanjarasoa36@gmail.com'
    return {
      ...parsed,
      recipient_email: recipient
    }
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

  static async sendDailyReport(
    targetDate?: string,
    customPdfPath?: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    const config = getConfig()
    if (!config?.recipient_email) {
      return { success: false, error: 'Email destinataire non configuré' }
    }

    const dateStr = targetDate || new Date().toISOString().split('T')[0]
    const dateObj = new Date(dateStr)
    const formattedDate = dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    // 1. Gather financial data
    const dailyBalance = CashJournalRepository.getDailyBalance(dateStr) || {
      total_income: 0,
      total_expense: 0,
      balance: 0
    }

    // Initial opening balance before dateStr
    const initialRow = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as initial_balance
         FROM cash_journal
         WHERE transaction_date < ? AND deleted = 0`
      )
      .get(dateStr) as { initial_balance: number } | undefined
    const openingBalance = initialRow?.initial_balance || 0
    const closingBalance = openingBalance + dailyBalance.balance

    // Entries for that day
    const entries = CashJournalRepository.list({
      startDate: dateStr,
      endDate: dateStr
    }) as any[]

    // Categories breakdown
    const incomeByCategory: Record<string, number> = {}
    const expenseByCategory: Record<string, number> = {}

    for (const e of entries) {
      const cat = e.category || 'divers'
      const amt = Number(e.amount) || 0
      if (e.type === 'income') {
        incomeByCategory[cat] = (incomeByCategory[cat] || 0) + amt
      } else {
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt
      }
    }

    // 2. Generate or verify attached PDF
    let pdfFilePath = customPdfPath
    if (!pdfFilePath) {
      try {
        const pdfRes = PdfService.generateDailyReport({
          date: dateStr,
          total_income: dailyBalance.total_income,
          total_expense: dailyBalance.total_expense,
          balance: dailyBalance.balance,
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          entries: entries.map((e) => ({
            type: e.type,
            department: e.department,
            category: e.category,
            amount: e.amount,
            description: e.description,
            receipt_number: (e as any).receipt_number,
            beneficiary: e.last_name ? `${e.last_name} ${e.first_name || ''}`.trim() : undefined,
            payment_method: e.payment_method,
            created_by: (e as any).created_by,
            time: e.created_at
              ? new Date(e.created_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : undefined
          }))
        })
        if (pdfRes.success && pdfRes.filePath) {
          pdfFilePath = pdfRes.filePath
        }
      } catch (pdfErr) {
        console.warn('PDF daily report generation warning:', pdfErr)
      }
    }

    // 3. Build executive HTML email body
    const formatAr = (val: number) => Math.round(val).toLocaleString('fr-FR') + ' Ar'
    const schoolName = (SettingsRepository.get('school_name') as string) || 'Lycée Privé Manjary Soa'

    const incomeCatKeys = Object.keys(incomeByCategory)
    const expenseCatKeys = Object.keys(expenseByCategory)

    let categoriesHtml = ''
    if (incomeCatKeys.length > 0 || expenseCatKeys.length > 0) {
      categoriesHtml = `
        <div style="margin-top: 20px; padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
            Ventilation par Poste
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            ${
              incomeCatKeys.length > 0
                ? `
              <tr style="background: #f1f5f9;"><td colspan="2" style="padding: 5px 8px; font-weight: bold; color: #166534;">Recettes (+)</td></tr>
              ${incomeCatKeys
                .map(
                  (k) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 8px; color: #334155;">${k.charAt(0).toUpperCase() + k.slice(1)}</td>
                  <td style="padding: 5px 8px; text-align: right; font-weight: bold; color: #15803d;">+ ${formatAr(incomeByCategory[k])}</td>
                </tr>
              `
                )
                .join('')}
            `
                : ''
            }
            ${
              expenseCatKeys.length > 0
                ? `
              <tr style="background: #f1f5f9;"><td colspan="2" style="padding: 5px 8px; font-weight: bold; color: #991b1b; margin-top: 6px;">Dépenses (-)</td></tr>
              ${expenseCatKeys
                .map(
                  (k) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 8px; color: #334155;">${k.charAt(0).toUpperCase() + k.slice(1)}</td>
                  <td style="padding: 5px 8px; text-align: right; font-weight: bold; color: #b91c1c;">- ${formatAr(expenseByCategory[k])}</td>
                </tr>
              `
                )
                .join('')}
            `
                : ''
            }
          </table>
        </div>
      `
    }

    let movementsHtml = ''
    if (entries.length === 0) {
      movementsHtml = `
        <tr>
          <td colspan="5" style="padding: 16px; text-align: center; color: #64748b; font-style: italic; font-size: 12px;">
            Aucun mouvement de caisse enregistré pour cette journée.
          </td>
        </tr>
      `
    } else {
      movementsHtml = entries
        .slice(0, 50)
        .map((e, idx) => {
          const isInc = e.type === 'income'
          const ref =
            (e as any).receipt_number ||
            (e.created_at
              ? new Date(e.created_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : `OP-${idx + 1}`)
          const ben = e.last_name
            ? `${e.last_name} ${e.first_name || ''}`.trim()
            : e.description || e.category
          const cat = e.category || 'divers'
          const meth = e.payment_method === 'cash' ? 'Espèces' : e.payment_method || 'Espèces'
          const amt = Number(e.amount) || 0
          const bgColor = idx % 2 === 1 ? '#f8fafc' : '#ffffff'

          return `
          <tr style="background-color: ${bgColor}; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
            <td style="padding: 7px 8px; font-family: monospace; color: #475569;">${ref}</td>
            <td style="padding: 7px 8px; color: #0f172a; font-weight: 500;">${ben}</td>
            <td style="padding: 7px 8px; color: #475569;">${cat}</td>
            <td style="padding: 7px 8px; color: #64748b;">${meth}</td>
            <td style="padding: 7px 8px; text-align: right; font-weight: bold; color: ${isInc ? '#166534' : '#b91c1c'};">
              ${isInc ? '+' : '-'} ${formatAr(amt)}
            </td>
          </tr>
        `
        })
        .join('')

      if (entries.length > 50) {
        movementsHtml += `
          <tr>
            <td colspan="5" style="padding: 10px; text-align: center; background-color: #f1f5f9; font-size: 11px; color: #475569;">
              ... et ${entries.length - 50} autre(s) mouvement(s) détaillé(s) dans le rapport PDF joint.
            </td>
          </tr>
        `
      }
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px 10px; background-color: #f1f5f9;">
        <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 22px; text-align: center;">
            <h1 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.5px;">${schoolName.toUpperCase()}</h1>
            <p style="margin: 4px 0 12px 0; font-size: 12px; opacity: 0.85;">Lot H 81 Miadana Alasora, Antananarivo — Système de Gestion Scolaire</p>
            <div style="display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;">
              📊 RAPPORT FINANCIER DU ${formattedDate.toUpperCase()}
            </div>
          </div>

          <!-- KPI Summary Cards -->
          <div style="padding: 16px 16px 8px 16px;">
            <table style="width: 100%; border-collapse: separate; border-spacing: 6px 0;">
              <tr>
                <td style="width: 25%; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 6px; text-align: center;">
                  <div style="font-size: 9px; font-weight: bold; color: #166534; text-transform: uppercase;">Recettes</div>
                  <div style="font-size: 13px; font-weight: bold; color: #15803d; margin-top: 3px;">+ ${formatAr(dailyBalance.total_income)}</div>
                </td>
                <td style="width: 25%; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 6px; text-align: center;">
                  <div style="font-size: 9px; font-weight: bold; color: #991b1b; text-transform: uppercase;">Dépenses</div>
                  <div style="font-size: 13px; font-weight: bold; color: #b91c1c; margin-top: 3px;">- ${formatAr(dailyBalance.total_expense)}</div>
                </td>
                <td style="width: 25%; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 6px; text-align: center;">
                  <div style="font-size: 9px; font-weight: bold; color: #1e40af; text-transform: uppercase;">Solde Net Jour</div>
                  <div style="font-size: 13px; font-weight: bold; color: #1d4ed8; margin-top: 3px;">${dailyBalance.balance >= 0 ? '+' : ''} ${formatAr(dailyBalance.balance)}</div>
                </td>
                <td style="width: 25%; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 6px; text-align: center;">
                  <div style="font-size: 9px; font-weight: bold; color: #334155; text-transform: uppercase;">Solde Caisse</div>
                  <div style="font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 3px;">${formatAr(closingBalance)}</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Content Padding -->
          <div style="padding: 10px 16px 20px 16px;">
            
            ${categoriesHtml}

            <!-- Itemized Movements Table -->
            <div style="margin-top: 20px;">
              <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
                Mouvements de Caisse (${entries.length} opération${entries.length > 1 ? 's' : ''})
              </h3>
              <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background: #f1f5f9; text-align: left; font-size: 10px; color: #475569; text-transform: uppercase;">
                    <th style="padding: 7px 8px;">Réf / Heure</th>
                    <th style="padding: 7px 8px;">Élève / Bénéficiaire</th>
                    <th style="padding: 7px 8px;">Nature</th>
                    <th style="padding: 7px 8px;">Mode</th>
                    <th style="padding: 7px 8px; text-align: right;">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  ${movementsHtml}
                </tbody>
              </table>
            </div>

            <!-- PDF Attachment Callout -->
            <div style="margin-top: 20px; padding: 12px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px;">
              <div style="font-size: 12px; color: #065f46;">
                📎 <strong>Rapport PDF officiel joint :</strong> Le bilan journalier complet avec émargements est annexé à cet email (<code>bilan_${dateStr}.pdf</code>).
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 16px; text-align: center; font-size: 11px; color: #64748b;">
            <p style="margin: 0 0 3px 0;">Ce courriel a été généré automatiquement par le Système de Gestion Scolaire du ${schoolName}.</p>
            <p style="margin: 0;">Destinataire officiel : <strong>${config.recipient_email}</strong></p>
          </div>

        </div>
      </body>
      </html>
    `

    const subject = `[Rapport Financier] Bilan Caisse du ${formattedDate} — ${schoolName}`
    const attachments = pdfFilePath ? [pdfFilePath] : undefined

    return EmailService.sendEmail(config.recipient_email, subject, htmlBody, attachments)
  }

  static startScheduler(): void {
    if (schedulerInterval) return
    schedulerInterval = setInterval(() => {
      const config = getConfig()
      if (!config?.enabled || !config?.auto_send_daily) return
      const now = new Date()
      // Working days check: Monday (1) to Saturday (6). Sunday (0) is excluded.
      const isWorkingDay = now.getDay() >= 1 && now.getDay() <= 6
      if (now.getHours() >= 18 && isWorkingDay) {
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
          EmailService.sendDailyReport(today)
            .then((res) => {
              if (res.success) {
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
              }
            })
            .catch((err) => {
              console.error('Auto daily report email failed:', err)
            })
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
