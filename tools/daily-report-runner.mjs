#!/usr/bin/env node
/**
 * Daily Financial Report Runner — Automated Cloud Consolidation & Email Dispatch
 * 
 * Exécuté de manière autonome par GitHub Actions chaque jour à 18h00 UTC+3 (Madagascar).
 * 100% indépendant des ordinateurs de l'école : s'exécute même si tous les PC sont éteints !
 * Calcule le bilan officiel sur la base Cloud Supabase unifiée (postes C1, C2, C3, C4, C5).
 */

import nodemailer from 'nodemailer'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://onxnctfgxxgxipehmfqb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ueG5jdGZneHhneGlwZWhtZnFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODg3NjUsImV4cCI6MjA4NjM2NDc2NX0.WuVMhj07pbkuuWFfG-AsOrVJM-LrWmvts0vhvfwVWdc'

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
}

async function fetchFromSupabase(endpoint, maxRetries = 3) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Supabase GET ${endpoint} error (${res.status}): ${text}`)
      }
      return await res.json()
    } catch (err) {
      if (attempt === maxRetries) throw err
      console.warn(`[RETRY] Tentative ${attempt}/${maxRetries} échouée sur ${endpoint} (${err.message}). Nouvelle tentative dans 1s...`)
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}

async function postToSupabase(endpoint, data, maxRetries = 3) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(data)
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Supabase POST ${endpoint} error (${res.status}): ${text}`)
      }
      return
    } catch (err) {
      if (attempt === maxRetries) throw err
      console.warn(`[RETRY] Tentative ${attempt}/${maxRetries} échouée sur POST ${endpoint} (${err.message})...`)
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}

function getMadagascarDate(d = new Date()) {
  // Madagascar timezone is UTC+3 with no daylight saving time
  const utc = d.getTime() + d.getTimezoneOffset() * 60000
  const mada = new Date(utc + 3 * 3600000)
  return mada.toISOString().split('T')[0]
}

function formatAr(amount) {
  return `${Math.round(Number(amount) || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} Ar`
}

async function main() {
  console.log('=== DÉMARRAGE BILAN QUOTIDIEN CONSOLIDÉ GITHUB ACTIONS ===')
  
  const targetDate = process.env.TARGET_DATE || getMadagascarDate()
  const forceSend = process.env.FORCE_SEND === 'true'
  console.log(`Date cible : ${targetDate} (Force : ${forceSend})`)

  // 1. Vérifier si le rapport a déjà été envoyé aujourd'hui
  if (!forceSend) {
    const sentLogs = await fetchFromSupabase(
      `audit_logs?action=eq.daily_report_sent&record_id=eq.${targetDate}&select=id,timestamp`
    )
    if (sentLogs && sentLogs.length > 0) {
      console.log(`[INFO] Le bilan du ${targetDate} a déjà été transmis le ${sentLogs[0].timestamp}. Fin de traitement.`)
      return
    }
  }

  // 2. Extraire la configuration email depuis les paramètres Supabase
  const configRows = await fetchFromSupabase('settings?key=eq.email_config&select=value')
  let emailConfig = {
    enabled: true,
    smtp_host: 'smtp-relay.brevo.com',
    smtp_port: 587,
    smtp_user: 'a0f1bf001@smtp-brevo.com',
    smtp_key: '',
    sender_name: 'Lycée Manjary Soa',
    sender_email: 'zerodevy@gmail.com',
    recipient_email: 'christineanjarasoa36@gmail.com'
  }

  if (configRows && configRows.length > 0 && configRows[0].value) {
    try {
      const parsed = typeof configRows[0].value === 'string' ? JSON.parse(configRows[0].value) : configRows[0].value
      emailConfig = { ...emailConfig, ...parsed }
    } catch (e) {
      console.warn('Note parsing config:', e)
    }
  }

  // Overrides depuis l'environnement GitHub Secrets si présents
  if (process.env.BREVO_SMTP_KEY) emailConfig.smtp_key = process.env.BREVO_SMTP_KEY
  if (process.env.RECIPIENT_EMAIL) emailConfig.recipient_email = process.env.RECIPIENT_EMAIL
  if (process.env.SENDER_EMAIL) emailConfig.sender_email = process.env.SENDER_EMAIL

  if (!emailConfig.smtp_key) {
    throw new Error("Clé SMTP Brevo non configurée (ni dans Supabase settings ni dans GitHub Secrets BREVO_SMTP_KEY)")
  }

  // 3. Extraire les mouvements de caisse consolidés pour la journée cible
  console.log(`Extraction des mouvements de caisse pour le ${targetDate}...`)
  const entries = await fetchFromSupabase(
    `cash_journal?transaction_date=eq.${targetDate}&deleted=eq.false&order=created_at.asc`
  )

  let totalIncome = 0
  let totalExpense = 0
  const incomeByCategory = {}
  const expenseByCategory = {}
  const stationBreakdown = {}

  for (const e of entries) {
    const amt = Number(e.amount) || 0
    const cat = (e.category || 'divers').toLowerCase()
    const rn = e.receipt_number || ''
    
    let st = 'Général / Sans reçu'
    if (rn.includes('-C1-')) st = 'Poste C1'
    else if (rn.includes('-C2-')) st = 'Poste C2'
    else if (rn.includes('-C3-')) st = 'Poste C3'
    else if (rn.includes('-C4-')) st = 'Poste C4'
    else if (rn.includes('-C5-')) st = 'Poste C5'

    if (e.type === 'income') {
      totalIncome += amt
      incomeByCategory[cat] = (incomeByCategory[cat] || 0) + amt
      stationBreakdown[st] = (stationBreakdown[st] || 0) + amt
    } else {
      totalExpense += amt
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt
    }
  }

  const netBalance = totalIncome - totalExpense

  // 4. Calculer le solde de clôture cumulé historique
  const historicalRows = await fetchFromSupabase(
    `cash_journal?transaction_date=lte.${targetDate}&deleted=eq.false&select=type,amount`
  )
  let cumulativeBalance = 0
  for (const r of historicalRows) {
    const amt = Number(r.amount) || 0
    if (r.type === 'income') cumulativeBalance += amt
    else cumulativeBalance -= amt
  }

  console.log(`Consolidation terminée : Recettes = ${formatAr(totalIncome)}, Dépenses = ${formatAr(totalExpense)}, Solde = ${formatAr(netBalance)}, Cumul = ${formatAr(cumulativeBalance)} (${entries.length} mouvements)`)

  // 5. Générer le corps HTML du rapport
  const dateObj = new Date(targetDate + 'T12:00:00Z')
  const dateFr = dateObj.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const incomeCatRows = Object.entries(incomeByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 6px 10px; color: #334155;">${k.charAt(0).toUpperCase() + k.slice(1)}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: bold; color: #166534;">+ ${formatAr(v)}</td>
      </tr>
    `).join('')

  const expenseCatRows = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 6px 10px; color: #334155;">${k.charAt(0).toUpperCase() + k.slice(1)}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: bold; color: #991b1b;">- ${formatAr(v)}</td>
      </tr>
    `).join('')

  const stationRows = Object.entries(stationBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 6px 10px; color: #334155; font-weight: 500;">${k}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: bold; color: #1e40af;">${formatAr(v)}</td>
      </tr>
    `).join('')

  const recentMovementsRows = entries.slice(0, 40).map((e, idx) => {
    const isInc = e.type === 'income'
    const ref = e.receipt_number || `OP-${idx + 1}`
    const desc = e.description || e.category || 'Mouvement de caisse'
    const meth = e.payment_method === 'cash' ? 'Espèces' : e.payment_method || 'Espèces'
    const amt = Number(e.amount) || 0
    const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff'
    return `
      <tr style="background: ${bg}; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
        <td style="padding: 6px 8px; font-family: monospace; color: #475569;">${ref}</td>
        <td style="padding: 6px 8px; color: #0f172a;">${desc}</td>
        <td style="padding: 6px 8px; color: #64748b;">${meth}</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: bold; color: ${isInc ? '#166534' : '#991b1b'};">
          ${isInc ? '+' : '-'} ${formatAr(amt)}
        </td>
      </tr>
    `
  }).join('')

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px 10px; background-color: #f1f5f9;">
      <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">LYCÉE PRIVÉ MANJARY SOA</h1>
          <p style="margin: 4px 0 14px 0; font-size: 12px; opacity: 0.85;">Lot H 81 Miadana Alasora, Antananarivo — Système de Gestion Scolaire</p>
          <div style="display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;">
            📊 BILAN FINANCIER CONSOLIDÉ DU ${dateFr.toUpperCase()}
          </div>
        </div>

        <div style="padding: 24px;">
          <!-- 3 KPI Cards -->
          <div style="display: flex; gap: 12px; margin-bottom: 24px;">
            <div style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="color: #166534; font-size: 11px; font-weight: 700; text-transform: uppercase;">Recettes du Jour</div>
              <div style="font-size: 18px; font-weight: 800; color: #15803d; margin-top: 4px;">+ ${formatAr(totalIncome)}</div>
            </div>
            <div style="flex: 1; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="color: #991b1b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Dépenses du Jour</div>
              <div style="font-size: 18px; font-weight: 800; color: #b91c1c; margin-top: 4px;">- ${formatAr(totalExpense)}</div>
            </div>
            <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; text-align: center;">
              <div style="color: #1e40af; font-size: 11px; font-weight: 700; text-transform: uppercase;">Solde Net Journalier</div>
              <div style="font-size: 18px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">${netBalance >= 0 ? '+' : ''} ${formatAr(netBalance)}</div>
            </div>
          </div>

          <!-- Cumulative Balance Banner -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; font-weight: 600; color: #475569;">Solde Cumulé en Caisse (Clôture) :</span>
            <span style="font-size: 16px; font-weight: 800; color: #0f172a;">${formatAr(cumulativeBalance)}</span>
          </div>

          <!-- Ventilation Postes de caisse -->
          ${stationRows ? `
            <div style="margin-bottom: 24px;">
              <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Encaissements par Poste de Caisse</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                ${stationRows}
              </table>
            </div>
          ` : ''}

          <!-- Ventilation Catégories -->
          ${incomeCatRows || expenseCatRows ? `
            <div style="margin-bottom: 24px;">
              <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Ventilation par Catégorie</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                ${incomeCatRows ? `<tr style="background: #f8fafc;"><td colspan="2" style="padding: 6px 10px; font-weight: 700; color: #166534;">Recettes (+)</td></tr>${incomeCatRows}` : ''}
                ${expenseCatRows ? `<tr style="background: #f8fafc;"><td colspan="2" style="padding: 6px 10px; font-weight: 700; color: #991b1b;">Dépenses (-)</td></tr>${expenseCatRows}` : ''}
              </table>
            </div>
          ` : ''}

          <!-- Liste des Opérations -->
          <div>
            <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Détail des Opérations (${entries.length})</h3>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 8px; text-align: left;">Reçu</th>
                  <th style="padding: 8px; text-align: left;">Description</th>
                  <th style="padding: 8px; text-align: left;">Mode</th>
                  <th style="padding: 8px; text-align: right;">Montant</th>
                </tr>
              </thead>
              <tbody>
                ${recentMovementsRows || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">Aucun mouvement enregistré pour cette journée.</td></tr>'}
              </tbody>
            </table>
            ${entries.length > 40 ? `<p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 8px;">... et ${entries.length - 40} autre(s) mouvement(s) consolidé(s) dans la base.</p>` : ''}
          </div>

        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 20px; font-size: 11px; color: #64748b; text-align: center;">
          Ce rapport est consolidé automatiquement à 18h00 par GitHub Actions depuis la base Cloud unifiée Supabase.<br>
          Garantit l'intégrité financière multi-postes (C1, C2, C3, C4, C5) sans dépendre de l'allumage des ordinateurs locaux.
        </div>

      </div>
    </body>
    </html>
  `

  // 6. Envoi de l'email via Brevo SMTP (rapide, sans blocage de port en cloud)
  console.log(`Envoi de l'email à ${emailConfig.recipient_email} via ${emailConfig.smtp_host}:${emailConfig.smtp_port}...`)
  const transporter = nodemailer.createTransport({
    host: emailConfig.smtp_host || 'smtp-relay.brevo.com',
    port: Number(emailConfig.smtp_port) || 587,
    secure: false,
    auth: {
      user: emailConfig.smtp_user,
      pass: emailConfig.smtp_key
    }
  })

  await transporter.sendMail({
    from: `"${emailConfig.sender_name || 'Lycée Manjary Soa'}" <${emailConfig.sender_email || 'zerodevy@gmail.com'}>`,
    replyTo: `"Direction Lycée Manjary Soa" <${emailConfig.recipient_email}>`,
    to: emailConfig.recipient_email,
    subject: `[Bilan Cloud Automatique] Caisse du ${dateFr} — Lycée Manjary Soa`,
    html: htmlBody
  })

  console.log('Email transmis avec succès !')

  // 7. Enregistrer le verrou Cloud dans audit_logs
  await postToSupabase('audit_logs', {
    action: 'daily_report_sent',
    table_name: 'email',
    record_id: targetDate,
    new_value: JSON.stringify({
      sent_by: 'github_actions',
      recipient: emailConfig.recipient_email,
      date: targetDate,
      income: totalIncome,
      expense: totalExpense,
      closing_balance: cumulativeBalance,
      movements_count: entries.length,
      timestamp: new Date().toISOString()
    })
  })

  console.log(`Verrou cloud audit_logs enregistré pour ${targetDate}.`)
  console.log('=== BILAN QUOTIDIEN TERMINÉ AVEC SUCCÈS ===')
}

main().catch((err) => {
  console.error('[FATAL ERROR Bilan Quotidien]:', err)
  process.exit(1)
})
