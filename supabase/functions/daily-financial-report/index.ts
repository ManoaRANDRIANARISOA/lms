/**
 * Supabase Edge Function: daily-financial-report
 * 
 * Ce script Serverless peut être déployé sur Supabase et déclenché par pg_cron (ex: 18h00 UTC+3).
 * Il s'exécute directement dans le Cloud Supabase de façon 100% indépendante :
 * même si TOUS les ordinateurs du lycée sont éteints ou débranchés !
 *
 * Déploiement :
 *   npx supabase functions deploy daily-financial-report
 *
 * Variables d'environnement requises dans Supabase (Settings > Edge Functions) :
 *   - BREVO_API_KEY : votre clé d'API Brevo v3 (xkeysib-...)
 *   - SENDER_EMAIL : l'email expéditeur validé sur Brevo
 *   - RECIPIENT_EMAIL : l'email du destinataire (christineanjarasoa36@gmail.com)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? ""
    const senderEmail = Deno.env.get("SENDER_EMAIL") ?? "mmanjarysoa@gmail.com"
    const recipientEmail = Deno.env.get("RECIPIENT_EMAIL") ?? "christineanjarasoa36@gmail.com"

    if (!brevoApiKey) {
      return new Response(JSON.stringify({ error: "BREVO_API_KEY non configurée" }), { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Date cible (par défaut aujourd'hui UTC+3 Madagascar)
    const url = new URL(req.url)
    const targetDate = url.searchParams.get("date") || new Date().toISOString().split("T")[0]

    // 1. Vérifier si le rapport du jour a déjà été envoyé
    const { data: existingReport } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("action", "daily_report_sent")
      .eq("record_id", targetDate)
      .limit(1)
      .maybeSingle()

    if (existingReport && !url.searchParams.get("force")) {
      return new Response(JSON.stringify({ success: true, message: `Rapport du ${targetDate} déjà envoyé.` }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    // 2. Extraire les mouvements de caisse consolidés pour la date cible
    const { data: entries, error: errEntries } = await supabase
      .from("cash_journal")
      .select("*")
      .eq("transaction_date", targetDate)
      .eq("deleted", false)
      .order("created_at", { ascending: true })

    if (errEntries) {
      throw errEntries
    }

    const allEntries = entries || []
    let totalIncome = 0
    let totalExpense = 0

    for (const e of allEntries) {
      const amt = Number(e.amount) || 0
      if (e.type === "income") totalIncome += amt
      else totalExpense += amt
    }
    const balance = totalIncome - totalExpense

    const formatAr = (n: number) => Math.round(n).toLocaleString("fr-FR") + " Ar"

    // 3. Construire le contenu HTML du mail
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Lycée Manjary Soa — Bilan Journalier Cloud</h2>
        <p><strong>Date :</strong> ${targetDate}</p>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <div style="flex: 1; background: #f0fdf4; padding: 10px; border-radius: 6px; text-align: center;">
            <div style="color: #166534; font-size: 11px; font-weight: bold;">RECETTES</div>
            <div style="font-size: 14px; font-weight: bold; color: #15803d;">+ ${formatAr(totalIncome)}</div>
          </div>
          <div style="flex: 1; background: #fef2f2; padding: 10px; border-radius: 6px; text-align: center;">
            <div style="color: #991b1b; font-size: 11px; font-weight: bold;">DÉPENSES</div>
            <div style="font-size: 14px; font-weight: bold; color: #b91c1c;">- ${formatAr(totalExpense)}</div>
          </div>
          <div style="flex: 1; background: #eff6ff; padding: 10px; border-radius: 6px; text-align: center;">
            <div style="color: #1e40af; font-size: 11px; font-weight: bold;">SOLDE DU JOUR</div>
            <div style="font-size: 14px; font-weight: bold; color: #1d4ed8;">${balance >= 0 ? '+' : ''} ${formatAr(balance)}</div>
          </div>
        </div>
        <p>Total opérations enregistrées au cloud : <strong>${allEntries.length}</strong>.</p>
        <p style="font-size: 11px; color: #64748b;">Généré automatiquement par Supabase Edge Functions & Brevo API.</p>
      </div>
    `

    // 4. Envoyer via Brevo REST API sur port 443
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { name: "Lycée Manjary Soa", email: senderEmail },
        to: [{ email: recipientEmail }],
        subject: `[Bilan Cloud Automatique] Caisse du ${targetDate}`,
        htmlContent
      })
    })

    if (!brevoRes.ok) {
      const err = await brevoRes.text()
      return new Response(JSON.stringify({ error: `Erreur Brevo: ${err}` }), { status: 500 })
    }

    // 5. Inscrire le cloud lock dans audit_logs
    await supabase.from("audit_logs").insert({
      action: "daily_report_sent",
      table_name: "email",
      record_id: targetDate,
      new_value: JSON.stringify({
        sent_by: "supabase_edge_cron",
        recipient: recipientEmail,
        date: targetDate,
        income: totalIncome,
        expense: totalExpense,
        movements_count: allEntries.length,
        timestamp: new Date().toISOString()
      })
    })

    return new Response(JSON.stringify({ success: true, targetDate, totalIncome, totalExpense }), {
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
