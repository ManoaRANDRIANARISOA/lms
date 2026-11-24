/**
 * remediation.service.ts — Assistant de remédiation interactif par poste
 *
 * Scanne en LECTURE SEULE les incohérences entre la base SQLite locale et le
 * Cloud Supabase, puis classe chaque constat en deux groupes :
 *   - 'auto'     : cas évident, remédiation déterministe et prouvée (fusion au
 *                  jumeau actif unique, réalignement tarifaire, convergence).
 *   - 'decision' : cas ambigu (suppression manuelle possible, homonymes, mois
 *                  décalé/antidaté) → regroupé pour décision humaine AVEC conseil.
 *
 * Aucune application n'est destructive : tout passe par soft-delete + sync_queue,
 * est tracé dans settings_history et propagé par syncWithCloud (AGENTS.md §1-4).
 * Les numéros de reçu existants ne sont JAMAIS renumérotés.
 */

import db from '../database/db'
import {
  supabase,
  mergeStudentRecordsSafe,
  addToSyncQueue,
  syncWithCloud,
  runDeepConvergence
} from './sync.service'
import { StudentRepository } from '../database/repositories/student.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { CashJournalRepository } from '../database/repositories/cashjournal.repository'
import { PaymentRepository } from '../database/repositories/payment.repository'
import { getCurrentUser } from '../auth/auth.service'

export interface RemediationFinding {
  id: string
  category: string
  classification: 'auto' | 'decision'
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  recommendation: string
  action: string
  params: Record<string, unknown>
  affectedCount: number
  amountImpact?: number
  evidence?: Record<string, unknown>
}

export interface RemediationScanResult {
  success: boolean
  stationCode: string
  schoolYear: string
  scannedAt: string
  cloudAvailable: boolean
  findings: RemediationFinding[]
  autoCount: number
  decisionCount: number
  error?: string
}

// --------------------------------------------
// Helpers
// --------------------------------------------
function normalizeName(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function currentSchoolYear(): string {
  const raw = SettingsRepository.get('school_year')
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/['"]/g, '').trim()
  }
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

function stationCode(): string {
  const raw = SettingsRepository.get('pos_station_code')
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

function trace(key: string, oldVal: unknown, newVal: unknown, changedBy: string): void {
  try {
    db.prepare(
      `INSERT INTO settings_history (key, old_value, new_value, changed_by, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(
      key,
      typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal ?? null),
      typeof newVal === 'string' ? newVal : JSON.stringify(newVal ?? null),
      changedBy
    )
  } catch (e) {
    console.warn('[Remediation] trace failed:', e)
  }
}

function actingUser(): string {
  const u = getCurrentUser()
  return u?.username || u?.id || 'remediation_assistant'
}

/** Fetch paginated cloud id/deleted/updated_at set for a table (read-only). */
async function fetchCloudIdSet(
  table: string
): Promise<Map<string, { deleted: boolean; updated_at: string }>> {
  const map = new Map<string, { deleted: boolean; updated_at: string }>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id, deleted, updated_at')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data || []) as Array<{ id: string; deleted: boolean; updated_at: string }>
    for (const r of rows) {
      map.set(r.id, { deleted: !!r.deleted, updated_at: r.updated_at || '' })
    }
    if (rows.length < pageSize) break
    from += pageSize
    if (from > 200000) break // garde-fou
  }
  return map
}

/** Fetch cloud active event participations keyed by `event_id|student_id` (read-only). */
async function fetchCloudEventPaymentsActive(): Promise<
  Map<string, { id: string; amount_paid: number; amount_due: number; paid: boolean }>
> {
  const map = new Map<string, { id: string; amount_paid: number; amount_due: number; paid: boolean }>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('event_payments')
      .select('id, event_id, student_id, amount_paid, amount_due, paid')
      .eq('deleted', false)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`event_payments: ${error.message}`)
    const rows = (data || []) as Array<{
      id: string
      event_id: string
      student_id: string
      amount_paid: number
      amount_due: number
      paid: boolean
    }>
    for (const r of rows) {
      map.set(`${r.event_id}|${r.student_id}`, {
        id: r.id,
        amount_paid: Number(r.amount_paid || 0),
        amount_due: Number(r.amount_due || 0),
        paid: !!r.paid
      })
    }
    if (rows.length < pageSize) break
    from += pageSize
    if (from > 200000) break
  }
  return map
}

/** Lignes de la file de sync bloquées sur event_payments (collision de participation active). */
function blockedEventPaymentRows(): Array<{
  queueId: number
  recordId: string
  eventId: string
  studentId: string
  localPaid: number
  localDue: number
  studentName: string
  eventName: string
  errorMessage: string
}> {
  const items = db
    .prepare(
      `SELECT id, record_id, error_message FROM sync_queue
       WHERE table_name = 'event_payments'
         AND status IN ('error', 'failed', 'quarantined')
         AND (error_message LIKE '%23505%' OR error_message LIKE '%uq_event_payments%' OR error_message LIKE '%duplicate key%')`
    )
    .all() as Array<{ id: number; record_id: string; error_message: string }>
  const out: Array<{
    queueId: number
    recordId: string
    eventId: string
    studentId: string
    localPaid: number
    localDue: number
    studentName: string
    eventName: string
    errorMessage: string
  }> = []
  for (const it of items) {
    const ep = db
      .prepare('SELECT event_id, student_id, amount_paid, amount_due FROM event_payments WHERE id = ?')
      .get(it.record_id) as
      | { event_id: string; student_id: string; amount_paid: number; amount_due: number }
      | undefined
    if (!ep) continue
    const st = db
      .prepare('SELECT first_name, last_name FROM students WHERE id = ?')
      .get(ep.student_id) as { first_name: string; last_name: string } | undefined
    const ev = db.prepare('SELECT name FROM parent_events WHERE id = ?').get(ep.event_id) as
      | { name: string }
      | undefined
    out.push({
      queueId: it.id,
      recordId: it.record_id,
      eventId: ep.event_id,
      studentId: ep.student_id,
      localPaid: Number(ep.amount_paid || 0),
      localDue: Number(ep.amount_due || 0),
      studentName: st ? `${st.last_name} ${st.first_name}`.trim() : `Élève ${ep.student_id.slice(0, 8)}`,
      eventName: ev?.name || `Événement ${ep.event_id.slice(0, 8)}`,
      errorMessage: it.error_message || ''
    })
  }
  return out
}

/**
 * Aligne une participation locale sur la ligne cloud canonique (UUID différent inter-postes).
 * Non destructif : si la ligne canonique existe déjà en local, la ligne locale est tombstonée
 * (réversible) ; sinon son UUID est renommé vers celui du Cloud. Les éléments de file bloqués
 * sont marqués 'synced' car le Cloud a bien reçu la participation canonique (pas de purge cosmétique).
 */
function adoptCloudEventPayment(localId: string, cloudId: string, nowIso: string): void {
  db.transaction(() => {
    const existing = db.prepare('SELECT id FROM event_payments WHERE id = ?').get(cloudId)
    if (existing) {
      db.prepare(
        "UPDATE event_payments SET deleted = 1, sync_status = 'synced', updated_at = ? WHERE id = ?"
      ).run(nowIso, localId)
      db.prepare(
        "UPDATE sync_queue SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL WHERE table_name = 'event_payments' AND record_id = ? AND status IN ('error','failed','quarantined','pending')"
      ).run(localId)
    } else {
      db.prepare(
        "UPDATE event_payments SET id = ?, sync_status = 'synced', updated_at = ? WHERE id = ?"
      ).run(cloudId, nowIso, localId)
      db.prepare(
        "UPDATE sync_queue SET record_id = ? WHERE table_name = 'event_payments' AND record_id = ?"
      ).run(cloudId, localId)
      db.prepare(
        "UPDATE sync_queue SET status = 'synced', synced_at = CURRENT_TIMESTAMP, error_message = NULL WHERE table_name = 'event_payments' AND record_id = ? AND status IN ('error','failed','quarantined','pending')"
      ).run(cloudId)
    }
  })()
}

// --------------------------------------------
// Scanner (LECTURE SEULE)
// --------------------------------------------
export async function scanStationInconsistencies(): Promise<RemediationScanResult> {
  const scannedAt = new Date().toISOString()
  const year = currentSchoolYear()
  const station = stationCode()
  const findings: RemediationFinding[] = []

  // --- A. Paiements orphelins sur élève supprimé / introuvable ---
  try {
    const orphanGroups = db
      .prepare(
        `SELECT sp.student_id AS student_id,
                COUNT(*) AS c,
                SUM(sp.amount) AS total,
                s.first_name AS first_name,
                s.last_name AS last_name,
                s.registration_number AS registration_number,
                s.class AS class,
                s.deleted AS student_deleted
         FROM student_payments sp
         LEFT JOIN students s ON s.id = sp.student_id
         WHERE sp.deleted = 0 AND (s.id IS NULL OR s.deleted = 1)
         GROUP BY sp.student_id`
      )
      .all() as Array<{
      student_id: string
      c: number
      total: number
      first_name: string | null
      last_name: string | null
      registration_number: string | null
      class: string | null
      student_deleted: number | null
    }>

    const activeStudents = db
      .prepare(
        'SELECT id, first_name, last_name, class, registration_number FROM students WHERE deleted = 0'
      )
      .all() as Array<{
      id: string
      first_name: string
      last_name: string
      class: string
      registration_number: string
    }>

    for (const g of orphanGroups) {
      const fullName = `${g.first_name || ''} ${g.last_name || ''}`.trim()
      const normTarget = normalizeName(`${g.first_name || ''} ${g.last_name || ''}`)
      const candidates = activeStudents.filter((st) => {
        const sameMatricule =
          g.registration_number &&
          st.registration_number &&
          st.registration_number === g.registration_number
        const sameName = normTarget.length >= 4 && normalizeName(`${st.first_name} ${st.last_name}`) === normTarget
        return sameMatricule || sameName
      })

      const label = fullName || `Élève ${g.student_id.slice(0, 8)}`
      const baseEvidence = {
        studentId: g.student_id,
        studentName: label,
        registrationNumber: g.registration_number || '',
        studentDeleted: g.student_deleted === 1,
        paymentCount: g.c,
        amount: g.total || 0,
        candidates: candidates.map((c) => ({
          id: c.id,
          name: `${c.last_name} ${c.first_name}`.trim(),
          class: c.class,
          registration_number: c.registration_number
        }))
      }

      if (candidates.length === 1) {
        const twin = candidates[0]
        findings.push({
          id: `orphan:${g.student_id}`,
          category: 'orphan_payment',
          classification: 'auto',
          severity: 'high',
          title: `Paiements orphelins — ${label}`,
          detail: `${g.c} paiement(s) actif(s) (${(g.total || 0).toLocaleString('fr-FR')} Ar) rattachés à un élève supprimé. Un jumeau actif unique existe : ${twin.last_name} ${twin.first_name} (${twin.registration_number || twin.id.slice(0, 8)}).`,
          recommendation: `Réattribuer automatiquement ces écritures au jumeau actif via fusion sécurisée (aucun double comptage, reçu d'origine préservé).`,
          action: 'merge_to_twin',
          params: { oldStudentId: g.student_id, newStudentId: twin.id },
          affectedCount: g.c,
          amountImpact: g.total || 0,
          evidence: { ...baseEvidence, twinId: twin.id }
        })
      } else {
        findings.push({
          id: `orphan:${g.student_id}`,
          category: 'orphan_payment',
          classification: 'decision',
          severity: 'high',
          title: `Paiements orphelins — ${label}`,
          detail:
            candidates.length === 0
              ? `${g.c} paiement(s) actif(s) (${(g.total || 0).toLocaleString('fr-FR')} Ar) sur un élève supprimé, sans jumeau actif identifiable.`
              : `${g.c} paiement(s) actif(s) (${(g.total || 0).toLocaleString('fr-FR')} Ar) sur un élève supprimé, avec ${candidates.length} homologues actifs possibles (ambigu).`,
          recommendation:
            candidates.length === 0
              ? `Examiner la traçabilité : rattacher à un élève existant, créer la fiche, convertir en caisse générale ou archiver si suppression volontaire.`
              : `Choisir le bon élève parmi les homologues avant réattribution, ou archiver si la suppression était volontaire.`,
          action: 'review_orphan',
          params: { studentId: g.student_id },
          affectedCount: g.c,
          amountImpact: g.total || 0,
          evidence: baseEvidence
        })
      }
    }
  } catch (e) {
    console.warn('[Remediation] orphan scan failed:', e)
  }

  // --- B. Fiches de frais désalignées de la configuration centralisée ---
  try {
    const fees = db
      .prepare(
        `SELECT f.id AS fee_id, f.student_id, f.monthly_tuition, f.class_name, f.tuition_level,
                s.class AS student_class, s.is_personnel_child, s.departure_date,
                s.first_name, s.last_name
         FROM student_fees f
         JOIN students s ON s.id = f.student_id
         WHERE f.deleted = 0 AND s.deleted = 0
           AND REPLACE(REPLACE(f.school_year, '"', ''), '''', '') = ?`
      )
      .all(year) as Array<{
      fee_id: string
      student_id: string
      monthly_tuition: number
      class_name: string
      tuition_level: string
      student_class: string
      is_personnel_child: unknown
      departure_date: string | null
      first_name: string
      last_name: string
    }>

    const stale: Array<{ feeId: string; name: string; oldPrice: number; newPrice: number; oldClass: string; newClass: string }> = []
    for (const f of fees) {
      const activeClass =
        f.student_class && f.student_class !== 'Non inscrit' && f.student_class !== 'Classe non spécifiée'
          ? f.student_class
          : null
      if (!activeClass || f.departure_date) continue
      const rawPC = f.is_personnel_child
      const isPC = rawPC == 1 || rawPC === '1' || rawPC === '1.0' || rawPC === true || rawPC === 'true'
      if (isPC) continue
      const cfg = StudentRepository.resolveTuitionConfig(activeClass)
      if (cfg.price <= 0) continue
      const level = StudentRepository.determineTuitionLevel(activeClass)
      const stalePrice = Number(f.monthly_tuition) !== cfg.price
      const staleClass = (f.class_name || '') !== activeClass
      const staleLevel = (f.tuition_level || '') !== level
      if (stalePrice || staleClass || staleLevel) {
        stale.push({
          feeId: f.fee_id,
          name: `${f.last_name} ${f.first_name}`.trim(),
          oldPrice: Number(f.monthly_tuition) || 0,
          newPrice: cfg.price,
          oldClass: f.class_name || '',
          newClass: activeClass
        })
      }
    }

    for (const f of stale) {
      findings.push({
        id: `fee_misalignment:${f.feeId}`,
        category: 'fee_misalignment',
        classification: 'decision',
        severity: 'medium',
        title: `Fiche de frais à confirmer — ${f.name}`,
        detail: `Fiche actuelle : ${f.oldPrice.toLocaleString('fr-FR')} Ar${f.oldClass ? ` (${f.oldClass})` : ''}. Grille centralisée de la classe réelle « ${f.newClass} » : ${f.newPrice.toLocaleString('fr-FR')} Ar.`,
        recommendation: `Si ${f.oldPrice.toLocaleString('fr-FR')} Ar est un tarif négocié/personnalisé, CONSERVER. Sinon appliquer la grille (${f.newPrice.toLocaleString('fr-FR')} Ar). Décision par élève, aucun écrasement automatique.`,
        action: 'realign_fee_single',
        params: { feeId: f.feeId },
        affectedCount: 1,
        amountImpact: Math.abs(f.newPrice - f.oldPrice),
        evidence: { name: f.name, oldPrice: f.oldPrice, newPrice: f.newPrice, oldClass: f.oldClass, newClass: f.newClass }
      })
    }
  } catch (e) {
    console.warn('[Remediation] fee scan failed:', e)
  }

  // --- C. Signaux d'audit (mois décalé / antidaté) — informationnel ---
  try {
    const shifted = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_payments
         WHERE deleted = 0 AND payment_type = 'tuition'
           AND month IS NOT NULL AND month != ''
           AND substr(month, 1, 7) != substr(payment_date, 1, 7)`
      )
      .get() as { c: number }
    const backdated = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_payments
         WHERE deleted = 0 AND substr(payment_date, 1, 10) < substr(created_at, 1, 10)`
      )
      .get() as { c: number }
    if ((shifted?.c || 0) > 0 || (backdated?.c || 0) > 0) {
      findings.push({
        id: 'audit_signals',
        category: 'audit_signal',
        classification: 'decision',
        severity: 'low',
        title: `Signaux d'audit : ${shifted?.c || 0} mois décalé(s), ${backdated?.c || 0} antidaté(s)`,
        detail: `Des paiements ont un mois comptable différent du mois de la date de paiement, ou une date de paiement antérieure à la date de création.`,
        recommendation: `Contrôler dans l'onglet Traçabilité (Finance) pour distinguer erreur de manipulation et comportement logiciel. Aucune correction automatique : décision au cas par cas.`,
        action: 'review_only',
        params: {},
        affectedCount: (shifted?.c || 0) + (backdated?.c || 0),
        evidence: { shifted: shifted?.c || 0, backdated: backdated?.c || 0 }
      })
    }
  } catch (e) {
    console.warn('[Remediation] audit signal scan failed:', e)
  }

  // --- D. Parité Cloud ↔ local (captifs, manquants, tombstones inversées) ---
  let cloudAvailable = false
  try {
    const tables = ['students', 'student_payments', 'cash_journal', 'student_fees'] as const
    const cloudSets: Record<string, Map<string, { deleted: boolean; updated_at: string }>> = {}
    for (const t of tables) {
      cloudSets[t] = await fetchCloudIdSet(t)
    }
    cloudAvailable = true

    let captiveCount = 0
    let missingCount = 0
    let cloudDeletedLocalActive = 0
    const reverseTombstones: Array<{ table: string; id: string }> = []

    for (const t of tables) {
      const cloud = cloudSets[t]
      const localRows = db
        .prepare(`SELECT id, deleted, sync_status FROM ${t}`)
        .all() as Array<{ id: string; deleted: number; sync_status: string }>
      const localIds = new Set(localRows.map((r) => r.id))

      for (const r of localRows) {
        const remote = cloud.get(r.id)
        if (!remote) {
          // Présent en local, absent du Cloud
          if (r.deleted === 0 && r.sync_status === 'synced') captiveCount++
        } else {
          if (remote.deleted && r.deleted === 0) cloudDeletedLocalActive++
          if (!remote.deleted && r.deleted === 1 && r.sync_status === 'synced') {
            reverseTombstones.push({ table: t, id: r.id })
          }
        }
      }
      for (const [id, remote] of cloud) {
        if (!remote.deleted && !localIds.has(id)) missingCount++
      }
    }

    if (captiveCount > 0 || missingCount > 0 || cloudDeletedLocalActive > 0) {
      findings.push({
        id: 'cloud_parity',
        category: 'cloud_parity',
        classification: 'auto',
        severity: 'medium',
        title: `Parité Cloud : ${captiveCount} captif(s), ${missingCount} manquant(s), ${cloudDeletedLocalActive} tombstone(s) à aligner`,
        detail: `Des enregistrements locaux marqués 'synced' n'existent pas dans le Cloud (captifs), des lignes cloud actives sont absentes en local (manquantes), ou le Cloud a supprimé des lignes encore actives en local.`,
        recommendation: `Lancer la convergence profonde (non destructive) : pousse les captifs, rapatrie les manquants et aligne les tombstones cloud. Les suppressions locales volontaires ne sont pas écrasées.`,
        action: 'run_convergence',
        params: {},
        affectedCount: captiveCount + missingCount + cloudDeletedLocalActive,
        evidence: { captiveCount, missingCount, cloudDeletedLocalActive }
      })
    }

    for (const rt of reverseTombstones) {
      findings.push({
        id: `reverse_tombstone:${rt.table}:${rt.id}`,
        category: 'reverse_tombstone',
        classification: 'decision',
        severity: 'high',
        title: `Suppression locale non propagée — ${rt.table}`,
        detail: `L'enregistrement ${rt.id.slice(0, 12)}… est supprimé en local (sync_status 'synced') mais toujours ACTIF dans le Cloud. La tombstone n'a jamais été poussée.`,
        recommendation: `Si la suppression locale était volontaire : pousser la tombstone vers le Cloud. Sinon : rapatrier la version cloud active. Vérifier la traçabilité avant de décider.`,
        action: 'resolve_reverse_tombstone',
        params: { table: rt.table, recordId: rt.id },
        affectedCount: 1,
        evidence: { table: rt.table, recordId: rt.id }
      })
    }
  } catch (e) {
    console.warn('[Remediation] cloud parity scan skipped:', e)
  }

  // --- E. Collisions de numéro de reçu entre paiements DISTINCTS (classe A) ---
  // Deux vrais encaissements partageant le même n° de reçu : NE JAMAIS fusionner.
  // On présente la collision ; la renumérotation du plus récent est une décision
  // humaine, avec préservation de la référence d'origine (document légal).
  try {
    const collisions = db
      .prepare(
        `SELECT receipt_number, COUNT(*) AS c, COUNT(DISTINCT student_id) AS distinct_students, SUM(amount) AS total
         FROM student_payments
         WHERE deleted = 0 AND receipt_number IS NOT NULL AND receipt_number != ''
         GROUP BY receipt_number
         HAVING COUNT(*) > 1 AND COUNT(DISTINCT student_id) > 1`
      )
      .all() as Array<{ receipt_number: string; c: number; distinct_students: number; total: number }>

    for (const col of collisions) {
      const lines = db
        .prepare(
          `SELECT sp.id, sp.student_id, sp.amount, sp.payment_type, sp.payment_date, sp.created_at,
                  sp.created_by, sp.print_count, sp.school_year, s.first_name, s.last_name
           FROM student_payments sp LEFT JOIN students s ON s.id = sp.student_id
           WHERE sp.deleted = 0 AND sp.receipt_number = ?
           ORDER BY sp.created_at ASC, sp.id ASC`
        )
        .all(col.receipt_number) as Array<{
        id: string
        student_id: string
        amount: number
        payment_type: string
        payment_date: string
        created_at: string
        created_by: string | null
        print_count: number | null
        school_year: string | null
        first_name: string | null
        last_name: string | null
      }>
      if (lines.length < 2) continue
      const later = lines[lines.length - 1]
      const laterPrinted = (later.print_count || 0) > 0
      findings.push({
        id: `receipt_collision:${col.receipt_number}`,
        category: 'receipt_collision',
        classification: 'decision',
        severity: 'high',
        title: `Collision de reçu ${col.receipt_number} — ${col.distinct_students} élèves distincts`,
        detail: `${col.c} paiements réels (${(col.total || 0).toLocaleString('fr-FR')} Ar au total) partagent le même numéro de reçu. Ce sont des encaissements DISTINCTS : aucune fusion ne doit être faite. Le plus récent est ${col.receipt_number} (${later.last_name || ''} ${later.first_name || ''}, ${later.payment_date}).`,
        recommendation: laterPrinted
          ? `Le reçu le plus récent a DÉJÀ été imprimé (document légal détenu par le parent). Par défaut : CONSERVER les deux tel quel. Une renumérotation n'est possible qu'avec validation explicite et préservation de la référence d'origine.`
          : `Le reçu le plus récent n'a jamais été imprimé (aucun document papier émis). Vous pouvez le renuméroter proprement (référence d'origine conservée) pour lever la collision, ou conserver les deux.`,
        action: 'resolve_receipt_collision',
        params: {
          receiptNumber: col.receipt_number,
          laterPaymentId: later.id,
          laterPrinted,
          schoolYear: later.school_year || year
        },
        affectedCount: col.c,
        amountImpact: col.total || 0,
        evidence: {
          receiptNumber: col.receipt_number,
          laterPrinted,
          lines: lines.map((l) => ({
            id: l.id,
            student: `${l.last_name || ''} ${l.first_name || ''}`.trim(),
            studentId: l.student_id,
            amount: l.amount,
            type: l.payment_type,
            date: l.payment_date,
            createdAt: l.created_at,
            createdBy: l.created_by || '',
            printCount: l.print_count || 0
          }))
        }
      })
    }
  } catch (e) {
    console.warn('[Remediation] receipt collision scan failed:', e)
  }

  // --- F. Candidats doublons (classe B) — JAMAIS de fusion automatique ---
  // Même élève + type + mois + montant + date. Le critère sur-capture les achats
  // multiples légitimes (ex. 2 articles d'uniforme au même prix le même jour).
  // Chaque candidat est présenté avec un niveau de confiance ; l'humain décide.
  try {
    const dupGroups = db
      .prepare(
        `SELECT student_id, payment_type, month, amount, payment_date, COUNT(*) AS c
         FROM student_payments
         WHERE deleted = 0
         GROUP BY student_id, payment_type, month, amount, payment_date
         HAVING COUNT(*) > 1`
      )
      .all() as Array<{
      student_id: string
      payment_type: string
      month: string | null
      amount: number
      payment_date: string
      c: number
    }>

    const onceTypes = new Set(['enrollment', 'reenrollment', 'fram', 'tuition'])
    for (const g of dupGroups) {
      const lines = db
        .prepare(
          `SELECT sp.id, sp.receipt_number, sp.created_at, sp.created_by, sp.print_count, sp.payment_method,
                  sp.description, s.first_name, s.last_name
           FROM student_payments sp LEFT JOIN students s ON s.id = sp.student_id
           WHERE sp.deleted = 0 AND sp.student_id = ? AND sp.payment_type = ?
             AND sp.amount = ? AND sp.payment_date = ?
             AND (sp.month IS ? OR sp.month = ?)
           ORDER BY sp.created_at ASC, sp.id ASC`
        )
        .all(g.student_id, g.payment_type, g.amount, g.payment_date, g.month, g.month) as Array<{
        id: string
        receipt_number: string | null
        created_at: string
        created_by: string | null
        print_count: number | null
        payment_method: string | null
        description: string | null
        first_name: string | null
        last_name: string | null
      }>
      if (lines.length < 2) continue
      const oldest = lines[0]
      const newer = lines.slice(1)
      const creators = new Set(lines.map((l) => (l.created_by || '').trim()))
      const times = lines.map((l) => Date.parse(l.created_at)).filter((t) => Number.isFinite(t))
      const spreadSec = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 1000 : Infinity
      const sameCreator = creators.size === 1
      const highConfidence = onceTypes.has(g.payment_type) && sameCreator && spreadSec <= 120
      // « Certain à 100% » : sous-ensemble strict de highConfidence, unifiable sans risque.
      // Aucun reçu papier distinct imprimé sur les plus récents + même mode + même description
      // + journée non scellée (Ticket Z). Soft-delete réversible, reçu d'origine préservé.
      const allNewerUnprinted = newer.every((l) => (l.print_count || 0) === 0)
      const methods = new Set(lines.map((l) => (l.payment_method || '').trim()))
      const descs = new Set(lines.map((l) => (l.description || '').trim().toLowerCase()))
      const dayLock = CashJournalRepository.closureLockForDate(g.payment_date)
      const certain =
        highConfidence && allNewerUnprinted && methods.size === 1 && descs.size === 1 && !dayLock.locked
      const name = `${oldest.last_name || ''} ${oldest.first_name || ''}`.trim() || `Élève ${g.student_id.slice(0, 8)}`
      findings.push({
        id: `duplicate_candidate:${g.student_id}:${g.payment_type}:${g.payment_date}:${g.amount}:${g.month || 'null'}`,
        category: 'duplicate_candidate',
        classification: 'decision',
        severity: 'high',
        title: `Candidat doublon — ${name} (${g.payment_type}, ${g.amount.toLocaleString('fr-FR')} Ar, ${g.payment_date})`,
        detail: `${g.c} écritures identiques (élève, type, montant, date${g.month ? `, mois ${g.month}` : ''}). Reçus : ${lines.map((l) => l.receipt_number || 'sans').join(', ')}. Créateurs : ${[...creators].join(', ') || 'inconnu'}. Écart de création : ${Number.isFinite(spreadSec) ? Math.round(spreadSec) + ' s' : 'inconnu'}.`,
        recommendation: certain
          ? `DOUBLON CERTAIN : type unique par période, même caissier, mêmes secondes, même mode et libellé, et aucun reçu papier imprimé sur les plus récents. Unification automatique possible (soft-delete réversible du plus récent, reçu d'origine préservé, tracé). Journée non scellée.`
          : highConfidence
            ? `Fort indice de doublon : type unique par période, même caissier, créations à quelques secondes. Confirmer « garder l'ancien » (le plus récent sera archivé, reçu d'origine préservé). Vérifiez qu'aucun reçu papier distinct n'a été remis.`
            : `AMBIGU — ne pas fusionner par défaut. Plusieurs articles d'uniforme au même prix le même jour, ou créateurs/heures différents, peuvent être légitimes. Examinez les articles et les heures avant de décider « garder l'ancien » ou « garder les deux ».`,
        action: 'resolve_duplicate_candidate',
        params: {
          studentId: g.student_id,
          keepId: oldest.id,
          duplicateIds: newer.map((l) => l.id),
          confidence: highConfidence ? 'high' : 'low',
          certain
        },
        affectedCount: g.c,
        amountImpact: g.amount * (g.c - 1),
        evidence: {
          confidence: highConfidence ? 'high' : 'low',
          certain,
          paymentType: g.payment_type,
          month: g.month,
          amount: g.amount,
          date: g.payment_date,
          lines: lines.map((l) => ({
            id: l.id,
            receipt: l.receipt_number || '',
            createdAt: l.created_at,
            createdBy: l.created_by || '',
            printCount: l.print_count || 0,
            method: l.payment_method || ''
          }))
        }
      })
    }
  } catch (e) {
    console.warn('[Remediation] duplicate candidate scan failed:', e)
  }

  // --- G. Reçus manquants / non conformes / année incohérente (classe C) ---
  try {
    const missing = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_payments WHERE deleted = 0 AND (receipt_number IS NULL OR receipt_number = '')`
      )
      .get() as { c: number }
    const nonconf = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_payments
         WHERE deleted = 0 AND receipt_number IS NOT NULL AND receipt_number != ''
           AND receipt_number NOT GLOB 'REC-[0-9][0-9][0-9][0-9]-C*-[0-9][0-9][0-9][0-9][0-9]'`
      )
      .get() as { c: number }
    const yearmis = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_payments
         WHERE deleted = 0 AND receipt_number GLOB 'REC-[0-9][0-9][0-9][0-9]-*'
           AND substr(receipt_number, 5, 4) != substr(payment_date, 1, 4)`
      )
      .get() as { c: number }
    const total = (missing?.c || 0) + (nonconf?.c || 0) + (yearmis?.c || 0)
    if (total > 0) {
      const samples = db
        .prepare(
          `SELECT id, receipt_number, payment_date FROM student_payments
           WHERE deleted = 0 AND (
             receipt_number IS NULL OR receipt_number = ''
             OR receipt_number NOT GLOB 'REC-[0-9][0-9][0-9][0-9]-C*-[0-9][0-9][0-9][0-9][0-9]'
             OR (receipt_number GLOB 'REC-[0-9][0-9][0-9][0-9]-*' AND substr(receipt_number, 5, 4) != substr(payment_date, 1, 4))
           ) LIMIT 8`
        )
        .all() as Array<{ id: string; receipt_number: string | null; payment_date: string }>
      findings.push({
        id: 'receipt_compliance',
        category: 'receipt_compliance',
        classification: 'decision',
        severity: 'medium',
        title: `Conformité des reçus : ${missing?.c || 0} manquant(s), ${nonconf?.c || 0} non conforme(s), ${yearmis?.c || 0} année incohérente(s)`,
        detail: `Des paiements actifs ont un reçu absent, un format hors norme (legacy sans poste), ou une année de reçu différente de l'année de la date de paiement.`,
        recommendation: `Examiner dans la Traçabilité (Finance) au cas par cas. La norme est REC-AAAA-C<poste>-XXXXX. Aucune renumérotation automatique : un reçu déjà remis est un document légal. Décision humaine par écriture.`,
        action: 'review_only',
        params: {},
        affectedCount: total,
        evidence: { missing: missing?.c || 0, nonconforming: nonconf?.c || 0, yearMismatch: yearmis?.c || 0, samples }
      })
    }
  } catch (e) {
    console.warn('[Remediation] receipt compliance scan failed:', e)
  }

  // --- H. Journal orphelin (classe D) — reçu sans paiement rattaché ---
  try {
    const orphanJournals = db
      .prepare(
        `SELECT cj.id, cj.receipt_number, cj.amount, cj.transaction_date, cj.related_payment_id,
                cj.related_student_id, cj.created_by, cj.description
         FROM cash_journal cj
         LEFT JOIN student_payments sp ON sp.id = cj.related_payment_id AND sp.deleted = 0
         WHERE cj.deleted = 0 AND cj.related_payment_id IS NOT NULL AND cj.related_payment_id != ''
           AND sp.id IS NULL`
      )
      .all() as Array<{
      id: string
      receipt_number: string | null
      amount: number
      transaction_date: string
      related_payment_id: string
      related_student_id: string | null
      created_by: string | null
      description: string | null
    }>
    for (const j of orphanJournals) {
      findings.push({
        id: `orphan_journal:${j.id}`,
        category: 'orphan_journal',
        classification: 'decision',
        severity: 'medium',
        title: `Journal orphelin — ${j.receipt_number || j.id.slice(0, 8)} (${(j.amount || 0).toLocaleString('fr-FR')} Ar)`,
        detail: `L'écriture de caisse du ${j.transaction_date} référence un paiement inexistant ou supprimé (${j.related_payment_id.slice(0, 12)}…). Créateur : ${j.created_by || 'inconnu'}.`,
        recommendation: `Vérifier la traçabilité : rattacher à un paiement existant, ou archiver l'écriture si elle est résiduelle. Aucune suppression automatique. Archiver = soft-delete tracé et propagé.`,
        action: 'resolve_orphan_journal',
        params: { journalId: j.id },
        affectedCount: 1,
        amountImpact: j.amount || 0,
        evidence: {
          journalId: j.id,
          receipt: j.receipt_number || '',
          amount: j.amount,
          date: j.transaction_date,
          relatedPaymentId: j.related_payment_id,
          relatedStudentId: j.related_student_id || '',
          createdBy: j.created_by || '',
          description: j.description || ''
        }
      })
    }
  } catch (e) {
    console.warn('[Remediation] orphan journal scan failed:', e)
  }

  // --- I. Montants anormaux (classe E) — informationnel ---
  try {
    const neg = db
      .prepare(`SELECT COUNT(*) AS c FROM student_payments WHERE deleted = 0 AND amount < 0`)
      .get() as { c: number }
    const zero = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_payments
         WHERE deleted = 0 AND amount = 0 AND (payment_method IS NULL OR payment_method != 'discount')`
      )
      .get() as { c: number }
    if ((neg?.c || 0) + (zero?.c || 0) > 0) {
      findings.push({
        id: 'abnormal_amounts',
        category: 'abnormal_amount',
        classification: 'decision',
        severity: 'medium',
        title: `Montants anormaux : ${neg?.c || 0} négatif(s), ${zero?.c || 0} nul(s) hors remise`,
        detail: `Des paiements actifs ont un montant négatif, ou nul sans méthode 'discount'. Une remise légitime peut être à 0 Ar ; les autres cas méritent contrôle.`,
        recommendation: `Contrôler dans la Traçabilité au cas par cas (erreur de saisie, remboursement, remise). Aucune correction automatique.`,
        action: 'review_only',
        params: {},
        affectedCount: (neg?.c || 0) + (zero?.c || 0),
        evidence: { negative: neg?.c || 0, zeroNonDiscount: zero?.c || 0 }
      })
    }
  } catch (e) {
    console.warn('[Remediation] abnormal amount scan failed:', e)
  }

  // --- J. Fiches de frais dupliquées / orphelines (classe G) ---
  try {
    const dupFees = db
      .prepare(
        `SELECT student_id, REPLACE(REPLACE(school_year, '"', ''), '''', '') AS sy, COUNT(*) AS c
         FROM student_fees WHERE deleted = 0
         GROUP BY student_id, sy HAVING COUNT(*) > 1`
      )
      .all() as Array<{ student_id: string; sy: string; c: number }>
    for (const g of dupFees) {
      const rows = db
        .prepare(
          `SELECT f.id, f.created_at, f.monthly_tuition, f.class_name, s.first_name, s.last_name
           FROM student_fees f LEFT JOIN students s ON s.id = f.student_id
           WHERE f.deleted = 0 AND f.student_id = ?
             AND REPLACE(REPLACE(f.school_year, '"', ''), '''', '') = ?
           ORDER BY f.created_at ASC, f.id ASC`
        )
        .all(g.student_id, g.sy) as Array<{
        id: string
        created_at: string
        monthly_tuition: number
        class_name: string | null
        first_name: string | null
        last_name: string | null
      }>
      if (rows.length < 2) continue
      const name = `${rows[0].last_name || ''} ${rows[0].first_name || ''}`.trim() || `Élève ${g.student_id.slice(0, 8)}`
      findings.push({
        id: `duplicate_fee:${g.student_id}:${g.sy}`,
        category: 'duplicate_fee',
        classification: 'decision',
        severity: 'medium',
        title: `Fiches de frais dupliquées — ${name} (${g.sy})`,
        detail: `${g.c} fiches actives pour le même élève et la même année scolaire (la norme est une fiche unique par élève/année). Tarifs : ${rows.map((r) => (r.monthly_tuition || 0).toLocaleString('fr-FR')).join(' / ')} Ar.`,
        recommendation: `Conserver la fiche la plus ancienne (ou la plus complète) et archiver les autres. Vérifiez les tarifs négociés avant d'archiver. Décision humaine.`,
        action: 'resolve_duplicate_fee',
        params: { studentId: g.student_id, keepId: rows[0].id, duplicateIds: rows.slice(1).map((r) => r.id) },
        affectedCount: g.c,
        evidence: {
          studentId: g.student_id,
          schoolYear: g.sy,
          lines: rows.map((r) => ({ id: r.id, createdAt: r.created_at, tuition: r.monthly_tuition, class: r.class_name || '' }))
        }
      })
    }
    const orphanFees = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_fees f
         LEFT JOIN students s ON s.id = f.student_id
         WHERE f.deleted = 0 AND (s.id IS NULL OR s.deleted = 1)`
      )
      .get() as { c: number }
    if ((orphanFees?.c || 0) > 0) {
      findings.push({
        id: 'orphan_fees',
        category: 'orphan_fee',
        classification: 'decision',
        severity: 'low',
        title: `Fiches de frais orphelines : ${orphanFees.c}`,
        detail: `${orphanFees.c} fiche(s) de frais active(s) rattachée(s) à un élève supprimé ou introuvable.`,
        recommendation: `Examiner dans la Traçabilité : rattacher à un élève existant ou archiver si la suppression était volontaire. Aucune action automatique.`,
        action: 'review_only',
        params: {},
        affectedCount: orphanFees.c,
        evidence: { count: orphanFees.c }
      })
    }
  } catch (e) {
    console.warn('[Remediation] fee duplicate scan failed:', e)
  }

  // --- K. Souscriptions bus/cantine incohérentes (classe H) — informationnel ---
  try {
    const bus = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_fees f
         JOIN students s ON s.id = f.student_id AND s.deleted = 0
         WHERE f.deleted = 0 AND f.bus_subscribed = 1
           AND (f.bus_route IS NULL OR f.bus_route = '' OR f.bus_monthly_fee <= 0)`
      )
      .get() as { c: number }
    const cant = db
      .prepare(
        `SELECT COUNT(*) AS c FROM student_fees f
         JOIN students s ON s.id = f.student_id AND s.deleted = 0
         WHERE f.deleted = 0 AND f.canteen_subscribed = 1 AND f.canteen_daily_rate <= 0`
      )
      .get() as { c: number }
    if ((bus?.c || 0) + (cant?.c || 0) > 0) {
      findings.push({
        id: 'subscription_incoherence',
        category: 'subscription_incoherence',
        classification: 'decision',
        severity: 'low',
        title: `Souscriptions incohérentes : ${bus?.c || 0} bus, ${cant?.c || 0} cantine`,
        detail: `Des élèves sont marqués abonnés bus sans axe/tarif renseigné, ou abonnés cantine sans tarif journalier. Cela peut fausser les alertes d'impayés.`,
        recommendation: `Vérifier la fiche de frais de chaque élève (axe de transport, tarif). Respecter les axes personnalisés et les tombstones existants. Aucune modification automatique.`,
        action: 'review_only',
        params: {},
        affectedCount: (bus?.c || 0) + (cant?.c || 0),
        evidence: { bus: bus?.c || 0, canteen: cant?.c || 0 }
      })
    }
  } catch (e) {
    console.warn('[Remediation] subscription scan failed:', e)
  }

  // --- L. Comptes créateurs dupliqués (classe I) — cause racine des collisions ---
  try {
    const activeUsers = db
      .prepare(`SELECT id, username, role, full_name FROM users WHERE deleted = 0 AND active = 1`)
      .all() as Array<{ id: string; username: string; role: string; full_name: string | null }>
    const byNorm = new Map<string, typeof activeUsers>()
    for (const u of activeUsers) {
      const key = normalizeName(u.username)
      if (!key) continue
      const arr = byNorm.get(key) || []
      arr.push(u)
      byNorm.set(key, arr)
    }
    for (const [key, group] of byNorm) {
      if (group.length < 2) continue
      findings.push({
        id: `creator_identity:${key}`,
        category: 'creator_identity',
        classification: 'decision',
        severity: 'medium',
        title: `Identités créateur dupliquées : ${group.map((u) => u.username).join(', ')}`,
        detail: `${group.length} comptes actifs désignent probablement la même personne (${group.map((u) => `${u.username}/${u.role}`).join(', ')}). Ces identités concurrentes sont une cause racine des collisions de numéros de reçu.`,
        recommendation: `Normaliser les identités via une migration tracée (cf. 043) après validation Direction : réattribuer l'activité puis désactiver les doublons. AUCUNE fusion automatique depuis l'assistant (impact financier/audit).`,
        action: 'review_only',
        params: {},
        affectedCount: group.length,
        evidence: { users: group.map((u) => ({ id: u.id, username: u.username, role: u.role, fullName: u.full_name || '' })) }
      })
    }
  } catch (e) {
    console.warn('[Remediation] creator identity scan failed:', e)
  }

  // --- M. Clôtures dupliquées / jours sans clôture (classe J) — informationnel ---
  try {
    const dupClosures = db
      .prepare(
        `SELECT station_code, date(closure_date) AS d, cashier_username, COUNT(*) AS c
         FROM cash_closures
         GROUP BY station_code, d, cashier_username HAVING COUNT(*) > 1`
      )
      .all() as Array<{ station_code: string; d: string; cashier_username: string | null; c: number }>
    for (const dc of dupClosures) {
      findings.push({
        id: `duplicate_closure:${dc.station_code}:${dc.d}:${dc.cashier_username || ''}`,
        category: 'duplicate_closure',
        classification: 'decision',
        severity: 'medium',
        title: `Clôtures dupliquées — ${dc.station_code} ${dc.d} (${dc.cashier_username || 'compte inconnu'})`,
        detail: `${dc.c} clôtures pour le même poste, la même journée et le même compte. La norme est une clôture journalière par poste ET par compte.`,
        recommendation: `Examiner laquelle fait foi (verrou Z, totaux) et archiver les résiduelles via le module Caisse. Aucune suppression automatique depuis l'assistant.`,
        action: 'review_only',
        params: {},
        affectedCount: dc.c,
        evidence: { station: dc.station_code, date: dc.d, cashier: dc.cashier_username || '', count: dc.c }
      })
    }
    const missingClosure = db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
           SELECT DISTINCT substr(payment_date, 1, 10) AS d FROM student_payments WHERE deleted = 0
         ) p
         WHERE NOT EXISTS (SELECT 1 FROM cash_closures cc WHERE date(cc.closure_date) = p.d)`
      )
      .get() as { c: number }
    if ((missingClosure?.c || 0) > 0) {
      findings.push({
        id: 'missing_closures',
        category: 'missing_closure',
        classification: 'decision',
        severity: 'low',
        title: `Journées avec paiements sans clôture : ${missingClosure.c}`,
        detail: `${missingClosure.c} journée(s) comportent des paiements actifs mais aucune clôture de caisse (tous postes confondus).`,
        recommendation: `Vérifier le processus de clôture journalière par poste/compte dans le module Caisse. Informationnel : aucune action automatique.`,
        action: 'review_only',
        params: {},
        affectedCount: missingClosure.c,
        evidence: { count: missingClosure.c }
      })
    }
  } catch (e) {
    console.warn('[Remediation] closure scan failed:', e)
  }

  // --- N. Participations événement bloquées en file de sync (collision uq_event_payments_active) ---
  // Le Cloud détient déjà la participation canonique (UUID différent inter-postes). Le montant
  // réel est porté indépendamment par student_payments + cash_journal ; event_payments n'est qu'un
  // agrégat cumulé. Cas sûr : cumul cloud >= local → adoption d'UUID sans perte ni double compte.
  // Cas ambigu : cumul local > cloud (branche divergente) ou absence de ligne cloud → revue humaine.
  if (cloudAvailable) {
    try {
      const blocked = blockedEventPaymentRows()
      if (blocked.length > 0) {
        const cloudMap = await fetchCloudEventPaymentsActive()
        const safeLines: Array<Record<string, unknown>> = []
        const reviewRows: Array<{ row: (typeof blocked)[number]; cloudId: string | null; cloudPaid: number; cloudDue: number; reason: string }> = []
        for (const b of blocked) {
          const cloud = cloudMap.get(`${b.eventId}|${b.studentId}`)
          if (cloud && cloud.amount_paid >= b.localPaid) {
            safeLines.push({
              id: b.recordId,
              student: b.studentName,
              event: b.eventName,
              localPaid: b.localPaid,
              cloudPaid: cloud.amount_paid,
              localDue: b.localDue,
              cloudDue: cloud.amount_due,
              verdict: 'safe',
              reason: 'Le Cloud couvre déjà ce cumul : adoption de la participation canonique.'
            })
          } else if (cloud) {
            reviewRows.push({
              row: b,
              cloudId: cloud.id,
              cloudPaid: cloud.amount_paid,
              cloudDue: cloud.amount_due,
              reason: `Cumul local (${b.localPaid.toLocaleString('fr-FR')} Ar) supérieur au Cloud (${cloud.amount_paid.toLocaleString('fr-FR')} Ar) : branche divergente possible.`
            })
          } else {
            reviewRows.push({
              row: b,
              cloudId: null,
              cloudPaid: 0,
              cloudDue: 0,
              reason: "Aucune participation active côté Cloud : vérifier si la suppression cloud était volontaire avant de repousser."
            })
          }
        }

        if (safeLines.length > 0) {
          findings.push({
            id: 'event_payment_blocked:safe',
            category: 'event_payment_blocked',
            classification: 'auto',
            severity: 'medium',
            title: `Participations événement bloquées — ${safeLines.length} cas sûr(s)`,
            detail: `${safeLines.length} participation(s) en file de sync bloquée(s) par une collision d'UUID inter-postes : le Cloud détient déjà la ligne canonique dont le cumul couvre celui du poste. Le montant réel est porté par les écritures de caisse (indépendantes).`,
            recommendation: `Prévisualiser (dry-run) puis exécuter : adoption de l'UUID cloud canonique, sans perte ni double compte. Les cas ambigus restent en revue.`,
            action: 'reconcile_blocked_event_payments',
            params: { mode: 'safe' },
            affectedCount: safeLines.length,
            evidence: { safeCount: safeLines.length, reviewCount: reviewRows.length, lines: safeLines }
          })
        }

        for (const r of reviewRows) {
          findings.push({
            id: `event_payment_blocked:review:${r.row.recordId}`,
            category: 'event_payment_blocked',
            classification: 'decision',
            severity: 'high',
            title: `Participation événement à arbitrer — ${r.row.studentName}`,
            detail: `${r.row.eventName} : ${r.reason} Le montant encaissé reste tracé dans les écritures de caisse quel que soit le choix.`,
            recommendation: r.cloudId
              ? `Comparer les cumuls. « Pousser le cumul local » aligne le Cloud sur le total le plus élevé du poste ; « Garder le Cloud » conserve l'agrégat cloud (l'argent reste dans la caisse). En cas de doute, consulter la Traçabilité.`
              : `Vérifier dans la Traçabilité si la participation cloud a été supprimée volontairement. Repousser uniquement si la suppression n'était pas voulue.`,
            action: 'resolve_event_payment_aggregate',
            params: {
              recordId: r.row.recordId,
              cloudId: r.cloudId,
              localPaid: r.row.localPaid,
              cloudPaid: r.cloudPaid,
              hasCloud: !!r.cloudId
            },
            affectedCount: 1,
            evidence: {
              lines: [
                {
                  id: r.row.recordId,
                  student: r.row.studentName,
                  event: r.row.eventName,
                  localPaid: r.row.localPaid,
                  cloudPaid: r.cloudPaid,
                  localDue: r.row.localDue,
                  cloudDue: r.cloudDue,
                  verdict: 'review',
                  reason: r.reason
                }
              ]
            }
          })
        }
      }
    } catch (e) {
      console.warn('[Remediation] blocked event_payments scan skipped:', e)
    }
  }

  // --- O. Paiements enregistrés sur une mauvaise année scolaire ou mois décalé ---
  // Ex. Élodie Maria : paiements d'octobre 2026 saisis sous '2027-2028' / '2027-09'
  // (apparaissent non cochés dans la grille de l'année active '2026-2027').
  try {
    const [yearStart, yearEnd] = year.split('-')
    const ignoredRows = db
      .prepare("SELECT key FROM settings_history WHERE key LIKE 'remediation:wrong_school_year_keep:%'")
      .all() as Array<{ key: string }>
    const ignoredPayments = new Set(
      ignoredRows.map((r) => r.key.replace('remediation:wrong_school_year_keep:', ''))
    )

    const allActivePayments = db
      .prepare(
        `SELECT sp.id, sp.student_id, sp.payment_type, sp.school_year, sp.month, sp.amount,
                sp.payment_date, sp.receipt_number, s.first_name, s.last_name, s.class, s.registration_number
         FROM student_payments sp
         JOIN students s ON s.id = sp.student_id AND s.deleted = 0
         WHERE sp.deleted = 0`
      )
      .all() as Array<{
      id: string
      student_id: string
      payment_type: string
      school_year: string | null
      month: string | null
      amount: number
      payment_date: string
      receipt_number: string | null
      first_name: string
      last_name: string
      class: string | null
      registration_number: string | null
    }>

    const byStudentWrongYear = new Map<
      string,
      {
        studentName: string
        className: string
        registrationNumber: string
        items: Array<{
          id: string
          paymentType: string
          currentYear: string
          currentMonth: string | null
          proposedYear: string
          proposedMonth: string | null
          amount: number
          paymentDate: string
          receiptNumber: string
          reason: string
        }>
      }
    >()

    const monthPattern = /^\d{4}-\d{2}$/
    for (const p of allActivePayments) {
      if (ignoredPayments.has(p.id)) continue
      const cleanSy = String(p.school_year || '').replace(/['"]/g, '').trim()
      const pDate = String(p.payment_date || '').slice(0, 10)
      let issueReason: string | null = null

      if (yearStart && yearEnd) {
        if (cleanSy && cleanSy > year) {
          issueReason = `Année scolaire future (${cleanSy} au lieu de ${year})`
        } else if (cleanSy && cleanSy < year && pDate >= `${yearStart}-07-01`) {
          issueReason = `Année scolaire antérieure (${cleanSy}) pour un encaissement du ${pDate}`
        } else if (!cleanSy) {
          issueReason = 'Année scolaire manquante'
        } else if (p.payment_type === 'tuition') {
          if (!p.month || !monthPattern.test(p.month)) {
            issueReason = `Mois d'écolage invalide (${p.month || 'vide'})`
          } else if (!p.month.startsWith(`${yearStart}-`) && !p.month.startsWith(`${yearEnd}-`)) {
            issueReason = `Mois (${p.month}) hors de l'année scolaire ${year}`
          }
        }
      }

      if (!issueReason) continue

      let proposedMonth: string | null = p.month
      if (p.month && monthPattern.test(p.month) && yearStart && yearEnd) {
        const mm = p.month.slice(5, 7)
        const mmNum = parseInt(mm, 10)
        if (mmNum >= 8 && mmNum <= 12) {
          proposedMonth = `${yearStart}-${mm}`
        } else if (mmNum >= 1 && mmNum <= 7) {
          proposedMonth = `${yearEnd}-${mm}`
        }
      }

      let group = byStudentWrongYear.get(p.student_id)
      if (!group) {
        group = {
          studentName: `${p.last_name || ''} ${p.first_name || ''}`.trim(),
          className: p.class || '',
          registrationNumber: p.registration_number || '',
          items: []
        }
        byStudentWrongYear.set(p.student_id, group)
      }
      group.items.push({
        id: p.id,
        paymentType: p.payment_type,
        currentYear: cleanSy || 'vide',
        currentMonth: p.month,
        proposedYear: year,
        proposedMonth,
        amount: Number(p.amount || 0),
        paymentDate: pDate,
        receiptNumber: p.receipt_number || '',
        reason: issueReason
      })
    }

    for (const [studentId, grp] of byStudentWrongYear) {
      const totalAmt = grp.items.reduce((s, it) => s + it.amount, 0)
      findings.push({
        id: `wrong_school_year:${studentId}`,
        category: 'wrong_school_year',
        classification: 'decision',
        severity: 'high',
        title: `Année scolaire / mois décalé — ${grp.studentName} (${grp.className || 'Sans classe'})`,
        detail: `${grp.items.length} paiement(s) (${totalAmt.toLocaleString('fr-FR')} Ar) sont enregistrés sur une autre année scolaire que ${year} (ex. ${grp.items[0].currentYear}${grp.items[0].currentMonth ? ` / ${grp.items[0].currentMonth}` : ''}). Cela empêche les mois d'apparaître cochés dans la fiche élève.`,
        recommendation: `Vérifier les dates d'encaissement et choisir « Réaligner sur ${year} » pour corriger l'année scolaire et le mois, ou « Conserver tel quel » s'il s'agit d'une archive / avance volontaire.`,
        action: 'realign_payment_school_year',
        params: {
          studentId,
          targetSchoolYear: year,
          paymentIds: grp.items.map((it) => it.id),
          adjustments: grp.items.map((it) => ({
            id: it.id,
            newSchoolYear: it.proposedYear,
            newMonth: it.proposedMonth
          }))
        },
        affectedCount: grp.items.length,
        amountImpact: totalAmt,
        evidence: {
          studentName: grp.studentName,
          className: grp.className,
          registrationNumber: grp.registrationNumber,
          lines: grp.items
        }
      })
    }
  } catch (e) {
    console.warn('[Remediation] wrong school year scan failed:', e)
  }

  // --- P. Doublons de fiches élèves actifs (noms identiques ou même DOB + nom proche) ---
  try {
    const ignoredDupRows = db
      .prepare("SELECT key FROM settings_history WHERE key LIKE 'remediation:student_dup_keep_both:%'")
      .all() as Array<{ key: string }>
    const ignoredDupKeys = new Set(
      ignoredDupRows.map((r) => r.key.replace('remediation:student_dup_keep_both:', ''))
    )

    const activeStudents = db
      .prepare(
        `SELECT id, registration_number, last_name, first_name, class, date_of_birth, created_at
         FROM students
         WHERE deleted = 0 AND (departure_date IS NULL OR TRIM(departure_date) = '')`
      )
      .all() as Array<{
      id: string
      registration_number: string | null
      last_name: string | null
      first_name: string | null
      class: string | null
      date_of_birth: string | null
      created_at: string | null
    }>

    const payStatsRows = db
      .prepare(
        `SELECT student_id, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS tot
         FROM student_payments WHERE deleted = 0 GROUP BY student_id`
      )
      .all() as Array<{ student_id: string; cnt: number; tot: number }>
    const payStatsMap = new Map<string, { cnt: number; tot: number }>()
    for (const r of payStatsRows) {
      payStatsMap.set(r.student_id, { cnt: Number(r.cnt || 0), tot: Number(r.tot || 0) })
    }

    const tokenKey = (s: (typeof activeStudents)[number]): string => {
      const tokens = normalizeName(`${s.last_name || ''} ${s.first_name || ''}`)
        .split(' ')
        .filter(Boolean)
        .sort()
      return tokens.join(' ')
    }

    const byTokenKey = new Map<string, typeof activeStudents>()
    const byDob = new Map<string, typeof activeStudents>()

    for (const s of activeStudents) {
      const tk = tokenKey(s)
      if (tk) {
        const arr = byTokenKey.get(tk) || []
        arr.push(s)
        byTokenKey.set(tk, arr)
      }
      const dob = String(s.date_of_birth || '').trim()
      if (dob && dob.length >= 8) {
        const dArr = byDob.get(dob) || []
        dArr.push(s)
        byDob.set(dob, dArr)
      }
    }

    // Build candidate clusters without duplicating pairs
    const seenPairKeys = new Set<string>()
    const candidateGroups: Array<{ reason: string; members: typeof activeStudents }> = []

    for (const [, grp] of byTokenKey) {
      if (grp.length < 2) continue
      const pairKey = grp.map((g) => g.id).sort().join('|')
      if (seenPairKeys.has(pairKey)) continue
      seenPairKeys.add(pairKey)
      candidateGroups.push({ reason: 'Nom et prénoms identiques', members: grp })
    }

    for (const [dob, grp] of byDob) {
      if (grp.length < 2) continue
      for (let i = 0; i < grp.length; i++) {
        for (let j = i + 1; j < grp.length; j++) {
          const a = grp[i]
          const b = grp[j]
          const normClA = (a.class || '').trim().toLowerCase()
          const normClB = (b.class || '').trim().toLowerCase()
          if (normClA && normClB && normClA !== normClB) continue // classes différentes = probables jumeaux
          const tokA = new Set(normalizeName(`${a.last_name || ''} ${a.first_name || ''}`).split(' ').filter(Boolean))
          const tokB = new Set(normalizeName(`${b.last_name || ''} ${b.first_name || ''}`).split(' ').filter(Boolean))
          let common = 0
          for (const t of tokA) if (tokB.has(t)) common++
          const minLen = Math.min(tokA.size, tokB.size)
          if (minLen >= 2 && common >= minLen - 1) {
            const pairKey = [a.id, b.id].sort().join('|')
            if (seenPairKeys.has(pairKey)) continue
            seenPairKeys.add(pairKey)
            candidateGroups.push({
              reason: `Même date de naissance (${dob}) et même classe (${a.class || b.class || '-'})`,
              members: [a, b]
            })
          }
        }
      }
    }

    for (const cg of candidateGroups) {
      const sortedIds = cg.members.map((m) => m.id).sort()
      const pairKey = sortedIds.join('|')
      if (ignoredDupKeys.has(pairKey)) continue

      // Sort members by payment count DESC, then oldest created_at ASC
      const enriched = cg.members
        .map((m) => {
          const st = payStatsMap.get(m.id) || { cnt: 0, tot: 0 }
          return {
            id: m.id,
            registrationNumber: m.registration_number || '',
            fullName: `${m.last_name || ''} ${m.first_name || ''}`.trim(),
            className: m.class || '',
            dob: m.date_of_birth || '',
            createdAt: m.created_at || '',
            paymentCount: st.cnt,
            paymentTotal: st.tot
          }
        })
        .sort((x, y) => {
          if (y.paymentCount !== x.paymentCount) return y.paymentCount - x.paymentCount
          return (x.createdAt || '').localeCompare(y.createdAt || '')
        })

      const suggestedKeepId = enriched[0].id
      const sameDobAndClass =
        new Set(enriched.map((e) => e.dob).filter(Boolean)).size <= 1 &&
        new Set(enriched.map((e) => e.className.toLowerCase()).filter(Boolean)).size <= 1

      findings.push({
        id: `student_duplicate:${pairKey}`,
        category: 'student_duplicate_candidate',
        classification: 'decision',
        severity: 'high',
        title: `Doublon d'élève potentiel — ${enriched[0].fullName} (${enriched.length} fiches)`,
        detail: `${cg.reason}. Fiches : ${enriched.map((e) => `${e.registrationNumber || e.id.slice(0, 8)} (${e.className || '?'}, ${e.paymentCount} pmt / ${e.paymentTotal.toLocaleString('fr-FR')} Ar)`).join(' vs ')}.`,
        recommendation: sameDobAndClass
          ? `Même nom et mêmes informations (classe/naissance) : probable vrai doublon. Sélectionnez la fiche principale et cliquez sur « Fusionner » pour réunir tous les paiements sans double comptage.`
          : `Classes ou dates de naissance différentes : vérifiez s'il s'agit de frères/sœurs ou homonymes avant de décider. Cliquez sur « Laisser séparés » si ce sont bien 2 élèves distincts.`,
        action: 'resolve_student_duplicate',
        params: {
          studentIds: enriched.map((e) => e.id),
          suggestedKeepId,
          pairKey
        },
        affectedCount: enriched.length,
        evidence: {
          sameDobAndClass,
          lines: enriched
        }
      })
    }
  } catch (e) {
    console.warn('[Remediation] student duplicate scan failed:', e)
  }

  const autoCount = findings.filter((f) => f.classification === 'auto').length
  const decisionCount = findings.filter((f) => f.classification === 'decision').length

  return {
    success: true,
    stationCode: station,
    schoolYear: year,
    scannedAt,
    cloudAvailable,
    findings,
    autoCount,
    decisionCount
  }
}

// --------------------------------------------
// Application contrôlée (idempotente, tracée, propagée)
// --------------------------------------------

/**
 * Garde verrou Z : retourne le label du Ticket Z si une écriture active de
 * l'élève (ou son miroir caisse) appartient à une journée scellée. Toute
 * remédiation doit alors être refusée sans déverrouillage formel.
 */
function sealedClosureLabel(studentId: string, bypass = false): string | null {
  // Outre passe Ticket Z réservée à l'Assistant (Direction), explicitement demandée et tracée.
  if (bypass) return null
  const payments = db
    .prepare(
      'SELECT id, payment_date, receipt_number FROM student_payments WHERE student_id = ? AND deleted = 0'
    )
    .all(studentId) as Array<{ id: string; payment_date?: string; receipt_number?: string }>
  for (const p of payments) {
    const lock = CashJournalRepository.closureLockForDate(p.payment_date || '', p.receipt_number)
    if (lock.locked) return lock.label || 'Z'
    const mirrors = db
      .prepare(
        'SELECT transaction_date, receipt_number FROM cash_journal WHERE related_payment_id = ? AND deleted = 0'
      )
      .all(p.id) as Array<{ transaction_date?: string; receipt_number?: string }>
    for (const m of mirrors) {
      const ml = CashJournalRepository.closureLockForDate(m.transaction_date || '', m.receipt_number)
      if (ml.locked) return ml.label || 'Z'
    }
  }
  return null
}

export async function applyRemediation(
  action: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; message?: string; error?: string; details?: Record<string, unknown> }> {
  const user = actingUser()
  const nowIso = new Date().toISOString()
  // Outre passe Ticket Z : uniquement si l'Assistant le demande explicitement (Direction).
  // Toute utilisation est tracée pour l'audit ; les remédiations restent non destructives.
  const bypassZ = params.bypassTicketZ === true
  if (bypassZ) {
    trace(
      `remediation:ticketZ_bypass:${action}`,
      { action },
      { bypassedAt: nowIso, reason: String(params.bypassReason || 'Assistant de cohérence (Direction)') },
      user
    )
  }

  try {
    switch (action) {
      // --- Fusion sécurisée vers le jumeau actif (auto ou choix manuel) ---
      case 'merge_to_twin': {
        const oldId = String(params.oldStudentId || '')
        const newId = String(params.newStudentId || '')
        if (!oldId || !newId || oldId === newId) {
          return { success: false, error: 'Identifiants élève invalides pour la fusion.' }
        }
        const target = db
          .prepare('SELECT id FROM students WHERE id = ? AND deleted = 0')
          .get(newId) as { id: string } | undefined
        if (!target) {
          return { success: false, error: "L'élève cible doit être actif." }
        }
        const sealed = sealedClosureLabel(oldId, bypassZ)
        if (sealed) {
          return { success: false, error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis avant toute remédiation.` }
        }
        const before = db
          .prepare('SELECT COUNT(*) AS c FROM student_payments WHERE student_id = ? AND deleted = 0')
          .get(oldId) as { c: number }
        db.transaction(() => {
          mergeStudentRecordsSafe(oldId, newId)
        })()
        trace(
          `remediation:merge:${oldId}`,
          { oldStudentId: oldId, activePayments: before.c },
          { newStudentId: newId, mergedAt: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after merge:', e))
        return {
          success: true,
          message: `${before.c} écriture(s) réattribuée(s) au jumeau actif par fusion sécurisée.`,
          details: { movedPayments: before.c }
        }
      }

      // --- Réattribution manuelle d'un groupe orphelin vers un élève choisi ---
      case 'reassign_orphan_group': {
        const oldId = String(params.studentId || '')
        const newId = String(params.targetStudentId || '')
        if (!oldId || !newId || oldId === newId) {
          return { success: false, error: 'Sélectionnez un élève cible actif distinct.' }
        }
        const target = db
          .prepare('SELECT id FROM students WHERE id = ? AND deleted = 0')
          .get(newId) as { id: string } | undefined
        if (!target) return { success: false, error: "L'élève cible doit être actif." }
        const sealed = sealedClosureLabel(oldId, bypassZ)
        if (sealed) {
          return { success: false, error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis avant toute remédiation.` }
        }
        const before = db
          .prepare('SELECT COUNT(*) AS c FROM student_payments WHERE student_id = ? AND deleted = 0')
          .get(oldId) as { c: number }
        db.transaction(() => {
          mergeStudentRecordsSafe(oldId, newId)
        })()
        trace(
          `remediation:reassign:${oldId}`,
          { oldStudentId: oldId, activePayments: before.c },
          { targetStudentId: newId, reassignedAt: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after reassign:', e))
        return { success: true, message: `${before.c} écriture(s) rattachée(s) à l'élève choisi.` }
      }

      // --- Archivage (soft-delete) d'un groupe orphelin volontairement supprimé ---
      case 'archive_orphan_group': {
        const oldId = String(params.studentId || '')
        const reason = String(params.reason || '').trim()
        if (!oldId) return { success: false, error: 'Élève introuvable.' }
        if (!reason) return { success: false, error: "Un motif d'archivage est requis pour l'audit." }
        const sealed = sealedClosureLabel(oldId, bypassZ)
        if (sealed) {
          return { success: false, error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis avant tout archivage.` }
        }
        const payments = db
          .prepare('SELECT id FROM student_payments WHERE student_id = ? AND deleted = 0')
          .all(oldId) as Array<{ id: string }>
        db.transaction(() => {
          for (const p of payments) {
            db.prepare(
              "UPDATE student_payments SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?"
            ).run(nowIso, p.id)
            addToSyncQueue('student_payments', p.id, 'delete', { id: p.id, deleted: true, updated_at: nowIso })
            const mirrors = db
              .prepare('SELECT id FROM cash_journal WHERE related_payment_id = ? AND deleted = 0')
              .all(p.id) as Array<{ id: string }>
            for (const m of mirrors) {
              db.prepare(
                "UPDATE cash_journal SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?"
              ).run(nowIso, m.id)
              addToSyncQueue('cash_journal', m.id, 'delete', { id: m.id, deleted: true, updated_at: nowIso })
            }
          }
        })()
        trace(
          `remediation:archive:${oldId}`,
          { archivedPayments: payments.map((p) => p.id) },
          { reason, archivedAt: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after archive:', e))
        return { success: true, message: `${payments.length} paiement(s) archivé(s) avec traçabilité.` }
      }

      // --- Restauration d'une fiche élève supprimée (paiements conservés rattachés) ---
      // Non destructif : réactive la fiche (deleted=0) et sa fiche de frais, sans toucher aux
      // encaissements. Refusé si un jumeau ACTIF porte déjà le même matricule (→ fusionner plutôt).
      case 'restore_student': {
        const studentId = String(params.studentId || '')
        if (!studentId) return { success: false, error: 'Élève introuvable.' }
        if (!params.confirm) {
          return { success: false, error: 'Confirmation explicite requise (confirm) pour restaurer une fiche supprimée.' }
        }
        const st = db
          .prepare('SELECT id, registration_number, first_name, last_name, deleted FROM students WHERE id = ?')
          .get(studentId) as
          | { id: string; registration_number: string | null; first_name: string; last_name: string; deleted: number }
          | undefined
        if (!st) return { success: false, error: 'Fiche élève introuvable.' }
        if (st.deleted === 0) return { success: true, message: 'Cette fiche est déjà active.' }
        if (st.registration_number) {
          const twin = db
            .prepare('SELECT id FROM students WHERE registration_number = ? AND deleted = 0 AND id != ?')
            .get(st.registration_number, studentId) as { id: string } | undefined
          if (twin) {
            return { success: false, error: `Un jumeau actif porte déjà le matricule ${st.registration_number}. Réattribuez les écritures au jumeau (fusion sécurisée) plutôt que restaurer cette fiche.` }
          }
        }
        const sealed = sealedClosureLabel(studentId, bypassZ)
        if (sealed) {
          return { success: false, error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis avant toute remédiation.` }
        }
        const payCount = db
          .prepare('SELECT COUNT(*) AS c FROM student_payments WHERE student_id = ? AND deleted = 0')
          .get(studentId) as { c: number }
        let feesRestored = 0
        db.transaction(() => {
          db.prepare("UPDATE students SET deleted = 0, sync_status = 'pending', updated_at = ? WHERE id = ?").run(nowIso, studentId)
          addToSyncQueue('students', studentId, 'update', db.prepare('SELECT * FROM students WHERE id = ?').get(studentId))
          const fees = db
            .prepare('SELECT id, school_year FROM student_fees WHERE student_id = ? AND deleted = 1')
            .all(studentId) as Array<{ id: string; school_year: string }>
          for (const f of fees) {
            const activeTwin = db
              .prepare('SELECT id FROM student_fees WHERE student_id = ? AND school_year = ? AND deleted = 0 AND id != ?')
              .get(studentId, f.school_year, f.id)
            if (activeTwin) continue
            db.prepare("UPDATE student_fees SET deleted = 0, sync_status = 'pending', updated_at = ? WHERE id = ?").run(nowIso, f.id)
            addToSyncQueue('student_fees', f.id, 'update', db.prepare('SELECT * FROM student_fees WHERE id = ?').get(f.id))
            feesRestored++
          }
        })()
        trace(
          `remediation:restore_student:${studentId}`,
          { deleted: 1 },
          { deleted: 0, activePayments: payCount.c, feesRestored, restoredAt: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after restore:', e))
        return {
          success: true,
          message: `Fiche restaurée : ${st.last_name} ${st.first_name}. ${payCount.c} paiement(s) actif(s) rattaché(s)${feesRestored ? `, ${feesRestored} fiche(s) de frais réactivée(s)` : ''}. Propagation en cours.`,
          details: { restoredPayments: payCount.c, feesRestored }
        }
      }

      // --- Décision tarifaire par élève : appliquer la grille ou conserver le tarif négocié ---
      case 'realign_fee_single': {
        const feeId = String(params.feeId || '')
        const decision = String(params.decision || '')
        if (!feeId) return { success: false, error: 'Fiche de frais introuvable.' }
        const fee = db
          .prepare('SELECT id, student_id, monthly_tuition FROM student_fees WHERE id = ? AND deleted = 0')
          .get(feeId) as { id: string; student_id: string; monthly_tuition: number } | undefined
        if (!fee) return { success: false, error: 'Fiche de frais introuvable ou supprimée.' }

        if (decision === 'keep') {
          trace(`remediation:fee_keep:${feeId}`, { monthly_tuition: fee.monthly_tuition }, { keptAt: nowIso }, user)
          return { success: true, message: 'Tarif actuel conservé (décision tracée).' }
        }

        const student = db
          .prepare('SELECT class, departure_date FROM students WHERE id = ? AND deleted = 0')
          .get(fee.student_id) as { class?: string; departure_date?: string | null } | undefined
        const activeClass =
          student?.class && student.class !== 'Non inscrit' && student.class !== 'Classe non spécifiée'
            ? student.class
            : null
        if (!activeClass || student?.departure_date) {
          return { success: false, error: "Élève sans classe active : réalignement impossible." }
        }
        const cfg = StudentRepository.resolveTuitionConfig(activeClass)
        if (cfg.price <= 0) return { success: false, error: 'Aucun tarif grille pour cette classe.' }
        const level = StudentRepository.determineTuitionLevel(activeClass)
        db.prepare(
          `UPDATE student_fees SET class_name = ?, tuition_level = ?, monthly_tuition = ?,
           updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ?`
        ).run(activeClass, level, cfg.price, feeId)
        const updated = db.prepare('SELECT * FROM student_fees WHERE id = ?').get(feeId)
        addToSyncQueue('student_fees', feeId, 'update', updated)
        trace(
          `remediation:fee_grid:${feeId}`,
          { monthly_tuition: fee.monthly_tuition },
          { monthly_tuition: cfg.price, class: activeClass, at: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after fee realign:', e))
        return { success: true, message: `Tarif appliqué selon la grille : ${cfg.price} Ar.` }
      }

      // --- Convergence profonde (captifs / manquants / tombstones cloud) ---
      case 'run_convergence': {
        const res = await runDeepConvergence()
        trace('remediation:convergence', null, res.aligned, user)
        if (!res.success) return { success: false, error: res.error || 'Échec de la convergence.' }
        return { success: true, message: 'Convergence profonde appliquée.', details: res.aligned }
      }

      // --- Tombstone inversée : pousser la suppression OU rapatrier la version cloud ---
      case 'resolve_reverse_tombstone': {
        const table = String(params.table || '')
        const recordId = String(params.recordId || '')
        const decision = String(params.decision || '')
        const allowed = ['students', 'student_payments', 'cash_journal', 'student_fees']
        if (!allowed.includes(table) || !recordId) {
          return { success: false, error: 'Table ou enregistrement invalide.' }
        }
        if (decision === 'push_tombstone') {
          db.prepare(
            "UPDATE " + table + " SET sync_status = 'pending', updated_at = ? WHERE id = ?"
          ).run(nowIso, recordId)
          addToSyncQueue(table, recordId, 'delete', { id: recordId, deleted: true, updated_at: nowIso })
          trace(`remediation:push_tombstone:${table}:${recordId}`, null, { pushedAt: nowIso }, user)
          syncWithCloud().catch((e) => console.error('[Remediation] sync after push tombstone:', e))
          return { success: true, message: 'Tombstone poussée vers le Cloud (suppression confirmée).' }
        }
        if (decision === 'resurrect_local') {
          const { data, error } = await supabase.from(table).select('*').eq('id', recordId).maybeSingle()
          if (error || !data) return { success: false, error: 'Version cloud introuvable.' }
          const localCols = new Set(
            (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
          )
          const cols = Object.keys(data).filter((k) => k !== 'search_text' && localCols.has(k))
          const record: Record<string, unknown> = {}
          for (const k of cols) {
            const v = (data as Record<string, unknown>)[k]
            record[k] = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'object' && v !== null ? JSON.stringify(v) : v
          }
          record.deleted = 0
          record.sync_status = 'synced'
          const placeholders = cols.map(() => '?').join(', ')
          db.prepare(
            `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
          ).run(...cols.map((k) => record[k]))
          trace(`remediation:resurrect:${table}:${recordId}`, null, { resurrectedAt: nowIso }, user)
          return { success: true, message: 'Version cloud active rapatriée en local.' }
        }
        return { success: false, error: 'Décision attendue : push_tombstone ou resurrect_local.' }
      }

      // --- Collision de reçu (classe A) : conserver OU renuméroter le plus récent ---
      // Jamais de fusion : ce sont des encaissements distincts. La renumérotation
      // préserve la référence d'origine (original_receipt_number) et est refusée
      // si la journée est scellée Z ou si le reçu imprimé n'est pas explicitement confirmé.
      case 'resolve_receipt_collision': {
        const decision = String(params.decision || '')
        const paymentId = String(params.laterPaymentId || '')
        if (!paymentId) return { success: false, error: 'Paiement cible introuvable.' }
        const p = db
          .prepare('SELECT * FROM student_payments WHERE id = ? AND deleted = 0')
          .get(paymentId) as Record<string, any> | undefined
        if (!p) return { success: false, error: 'Paiement introuvable ou supprimé.' }

        if (decision === 'keep_both') {
          trace(`remediation:collision_keep:${p.receipt_number}`, { receipt_number: p.receipt_number }, { keptBothAt: nowIso }, user)
          return { success: true, message: 'Collision conservée telle quel : les deux reçus (documents légaux) sont préservés.' }
        }
        if (decision !== 'renumber_later') {
          return { success: false, error: 'Décision attendue : renumber_later ou keep_both.' }
        }
        const lock = CashJournalRepository.closureLockForDate(p.payment_date, p.receipt_number)
        if (!bypassZ && lock.locked) {
          return { success: false, error: `Journée scellée par Ticket Z (${lock.label || 'Z'}). Déverrouillage formel requis.` }
        }
        const sealed = sealedClosureLabel(p.student_id, bypassZ)
        if (sealed) {
          return { success: false, error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis.` }
        }
        if ((p.print_count || 0) > 0 && !params.confirmPrinted) {
          return { success: false, error: "Ce reçu a déjà été imprimé (document légal détenu par le parent). Une renumérotation exige une confirmation explicite (confirmPrinted) et préserve la référence d'origine." }
        }
        const oldReceipt = String(p.receipt_number || '')
        const stationMatch = oldReceipt.match(/^REC-\d{4}-([A-Z0-9]+)-/)
        const station = stationMatch ? stationMatch[1] : undefined
        const newReceipt = PaymentRepository.generateReceiptNumber(p.school_year || undefined, station)
        if (!newReceipt || newReceipt === oldReceipt) {
          return { success: false, error: 'Impossible de générer un nouveau numéro de reçu distinct.' }
        }
        db.transaction(() => {
          db.prepare(
            `UPDATE student_payments
             SET original_receipt_number = COALESCE(original_receipt_number, ?),
                 receipt_number = ?, sync_status = 'pending', updated_at = ?, version = version + 1
             WHERE id = ?`
          ).run(oldReceipt, newReceipt, nowIso, paymentId)
          const updated = db.prepare('SELECT * FROM student_payments WHERE id = ?').get(paymentId)
          addToSyncQueue('student_payments', paymentId, 'update', updated)
          const mirrors = db
            .prepare('SELECT id FROM cash_journal WHERE related_payment_id = ? AND deleted = 0')
            .all(paymentId) as Array<{ id: string }>
          for (const m of mirrors) {
            db.prepare(
              `UPDATE cash_journal
               SET original_receipt_number = COALESCE(original_receipt_number, ?),
                   receipt_number = ?, sync_status = 'pending', updated_at = ?
               WHERE id = ?`
            ).run(oldReceipt, newReceipt, nowIso, m.id)
            const mu = db.prepare('SELECT * FROM cash_journal WHERE id = ?').get(m.id)
            addToSyncQueue('cash_journal', m.id, 'update', mu)
          }
        })()
        trace(
          `remediation:renumber:${paymentId}`,
          { receipt_number: oldReceipt },
          { receipt_number: newReceipt, original_receipt_number: oldReceipt, at: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after renumber:', e))
        return {
          success: true,
          message: `Reçu renuméroté ${oldReceipt} → ${newReceipt}. Référence d'origine préservée et propagée.`,
          details: { oldReceipt, newReceipt }
        }
      }

      // --- Réalignement année scolaire / mois d'un paiement ---
      case 'realign_payment_school_year': {
        const decision = String(params.decision || '')
        const studentId = String(params.studentId || '')
        const paymentIds = Array.isArray(params.paymentIds) ? params.paymentIds.map(String) : []
        const adjustments = Array.isArray(params.adjustments)
          ? (params.adjustments as Array<{ id: string; newSchoolYear: string; newMonth: string | null }>)
          : []

        if (decision === 'keep') {
          for (const pid of paymentIds) {
            trace(`remediation:wrong_school_year_keep:${pid}`, null, { keptAt: nowIso }, user)
          }
          return {
            success: true,
            message: `${paymentIds.length} paiement(s) conservé(s) tel quel (décision tracée).`
          }
        }

        if (decision !== 'realign') {
          return { success: false, error: 'Décision attendue : realign ou keep.' }
        }
        if (!studentId || adjustments.length === 0) {
          return { success: false, error: 'Aucun ajustement à appliquer.' }
        }
        const sealed = sealedClosureLabel(studentId, bypassZ)
        if (sealed) {
          return {
            success: false,
            error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis.`
          }
        }

        const before: Array<Record<string, unknown>> = []
        db.transaction(() => {
          for (const adj of adjustments) {
            const existing = db
              .prepare('SELECT id, school_year, month FROM student_payments WHERE id = ? AND deleted = 0')
              .get(adj.id) as { id: string; school_year: string | null; month: string | null } | undefined
            if (!existing) continue
            before.push(existing)
            db.prepare(
              "UPDATE student_payments SET school_year = ?, month = ?, sync_status = 'pending', updated_at = ? WHERE id = ?"
            ).run(adj.newSchoolYear, adj.newMonth, nowIso, adj.id)
            addToSyncQueue('student_payments', adj.id, 'update', {
              id: adj.id,
              school_year: adj.newSchoolYear,
              month: adj.newMonth,
              updated_at: nowIso
            })
          }
        })()

        trace(
          `remediation:wrong_school_year_realign:${studentId}`,
          before,
          { adjustments, at: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after year realign:', e))
        return {
          success: true,
          message: `${before.length} paiement(s) réaligné(s) sur l'année scolaire active et propagé(s).`
        }
      }

      // --- Résolution d'un doublon d'élève actif ---
      case 'resolve_student_duplicate': {
        const decision = String(params.decision || '')
        const pairKey = String(params.pairKey || '')
        const keepId = String(params.keepId || '')
        const studentIds = Array.isArray(params.studentIds) ? params.studentIds.map(String) : []

        if (decision === 'keep_both') {
          if (pairKey) {
            trace(`remediation:student_dup_keep_both:${pairKey}`, null, { keptBothAt: nowIso }, user)
          }
          return {
            success: true,
            message: 'Les fiches restent séparées (décision mémorisée).'
          }
        }

        if (decision !== 'merge') {
          return { success: false, error: 'Décision attendue : merge ou keep_both.' }
        }
        if (!keepId || studentIds.length < 2) {
          return { success: false, error: 'Sélectionnez la fiche principale à conserver.' }
        }
        const removeIds = studentIds.filter((sid) => sid !== keepId)
        for (const rid of removeIds) {
          const sealed = sealedClosureLabel(rid, bypassZ)
          if (sealed) {
            return {
              success: false,
              error: `Journée scellée par Ticket Z (${sealed}) sur la fiche doublon. Déverrouillage formel requis.`
            }
          }
        }

        db.transaction(() => {
          for (const rid of removeIds) {
            mergeStudentRecordsSafe(rid, keepId, { tombstoneSource: true })
          }
        })()

        trace(
          `remediation:student_dup_merge:${keepId}`,
          { mergedFrom: removeIds },
          { keepId, at: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after student merge:', e))
        return {
          success: true,
          message: `${removeIds.length} fiche(s) doublon(s) fusionnée(s) vers la fiche sélectionnée et propagée(s) au Cloud.`
        }
      }

      // --- Candidat doublon (classe B) : garder l'ancien / le choisi, ou les deux ---
      // Aucune fusion automatique : l'humain a validé. Soft-delete des autres
      // écritures du groupe exact (même élève/type/montant/date/mois), reçu conservé.
      case 'resolve_duplicate_candidate': {
        const decision = String(params.decision || '')
        const keepId = String(params.keepId || params.chosenId || '')
        if (decision === 'keep_both') {
          trace(`remediation:duplicate_keep_both:${keepId}`, null, { keptBothAt: nowIso }, user)
          return { success: true, message: 'Les écritures sont conservées (décision tracée, aucune donnée modifiée).' }
        }
        if (decision !== 'keep_old' && decision !== 'keep_chosen') {
          return { success: false, error: 'Décision attendue : keep_old, keep_chosen ou keep_both.' }
        }
        if (!keepId) return { success: false, error: "Sélectionnez l'écriture à conserver." }
        const keep = db
          .prepare('SELECT * FROM student_payments WHERE id = ? AND deleted = 0')
          .get(keepId) as Record<string, any> | undefined
        if (!keep) return { success: false, error: "L'écriture à conserver est introuvable ou supprimée." }
        const sealed = sealedClosureLabel(keep.student_id, bypassZ)
        if (sealed) {
          return { success: false, error: `Journée scellée par Ticket Z (${sealed}). Déverrouillage formel requis avant toute remédiation.` }
        }
        const targets = db
          .prepare(
            `SELECT id, receipt_number, print_count FROM student_payments
             WHERE deleted = 0 AND student_id = ? AND payment_type = ? AND amount = ? AND payment_date = ?
               AND (month IS ? OR month = ?) AND id != ?`
          )
          .all(keep.student_id, keep.payment_type, keep.amount, keep.payment_date, keep.month, keep.month, keepId) as Array<{
          id: string
          receipt_number: string | null
          print_count: number | null
        }>
        if (targets.length === 0) {
          return { success: false, error: 'Aucun doublon actif restant dans ce groupe (déjà traité ?).' }
        }
        if (targets.some((t) => (t.print_count || 0) > 0) && !params.confirmPrinted) {
          return { success: false, error: "Au moins un doublon a déjà été imprimé (document légal). Archivage soumis à confirmation explicite (confirmPrinted)." }
        }
        db.transaction(() => {
          for (const t of targets) {
            db.prepare(
              "UPDATE student_payments SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?"
            ).run(nowIso, t.id)
            addToSyncQueue('student_payments', t.id, 'delete', { id: t.id, deleted: true, updated_at: nowIso })
            const mirrors = db
              .prepare('SELECT id FROM cash_journal WHERE related_payment_id = ? AND deleted = 0')
              .all(t.id) as Array<{ id: string }>
            for (const m of mirrors) {
              db.prepare(
                "UPDATE cash_journal SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?"
              ).run(nowIso, m.id)
              addToSyncQueue('cash_journal', m.id, 'delete', { id: m.id, deleted: true, updated_at: nowIso })
            }
          }
        })()
        trace(
          `remediation:duplicate_keep:${keepId}`,
          { archived: targets.map((t) => ({ id: t.id, receipt: t.receipt_number })) },
          { keptId: keepId, keptReceipt: keep.receipt_number, decision, at: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after duplicate keep:', e))
        return {
          success: true,
          message: `${targets.length} doublon(s) archivé(s). Écriture ${keep.receipt_number || keepId.slice(0, 8)} conservée (reçu d'origine préservé).`
        }
      }

      // --- Journal orphelin (classe D) : archiver (soft-delete) ou consulter ---
      case 'resolve_orphan_journal': {
        const decision = String(params.decision || '')
        const journalId = String(params.journalId || '')
        if (!journalId) return { success: false, error: 'Écriture de caisse introuvable.' }
        if (decision === 'review') {
          trace(`remediation:orphan_journal_review:${journalId}`, null, { reviewedAt: nowIso }, user)
          return { success: true, message: 'Constat marqué comme consulté (aucune donnée modifiée).' }
        }
        if (decision !== 'archive') return { success: false, error: 'Décision attendue : archive ou review.' }
        const reason = String(params.reason || '').trim()
        if (!reason) return { success: false, error: "Un motif d'archivage est requis pour l'audit." }
        const j = db
          .prepare('SELECT * FROM cash_journal WHERE id = ? AND deleted = 0')
          .get(journalId) as Record<string, any> | undefined
        if (!j) return { success: false, error: 'Écriture de caisse introuvable ou supprimée.' }
        const lock = CashJournalRepository.closureLockForDate(j.transaction_date, j.receipt_number)
        if (!bypassZ && lock.locked) {
          return { success: false, error: `Journée scellée par Ticket Z (${lock.label || 'Z'}). Déverrouillage formel requis.` }
        }
        db.transaction(() => {
          db.prepare(
            "UPDATE cash_journal SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?"
          ).run(nowIso, journalId)
          addToSyncQueue('cash_journal', journalId, 'delete', { id: journalId, deleted: true, updated_at: nowIso })
        })()
        trace(
          `remediation:orphan_journal_archive:${journalId}`,
          { receipt: j.receipt_number, amount: j.amount },
          { reason, archivedAt: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after journal archive:', e))
        return { success: true, message: 'Écriture de caisse orpheline archivée avec traçabilité.' }
      }

      // --- Fiches de frais dupliquées (classe G) : garder l'ancienne ou les deux ---
      case 'resolve_duplicate_fee': {
        const decision = String(params.decision || '')
        const keepId = String(params.keepId || '')
        if (decision === 'keep_both') {
          trace(`remediation:fee_duplicate_keep_both:${keepId}`, null, { keptBothAt: nowIso }, user)
          return { success: true, message: 'Les fiches sont conservées (décision tracée).' }
        }
        if (decision !== 'keep_old') return { success: false, error: 'Décision attendue : keep_old ou keep_both.' }
        if (!keepId) return { success: false, error: 'Sélectionnez la fiche à conserver.' }
        const keep = db
          .prepare('SELECT id, student_id, school_year FROM student_fees WHERE id = ? AND deleted = 0')
          .get(keepId) as { id: string; student_id: string; school_year: string } | undefined
        if (!keep) return { success: false, error: 'Fiche à conserver introuvable ou supprimée.' }
        const targets = db
          .prepare(
            `SELECT id FROM student_fees
             WHERE deleted = 0 AND student_id = ? AND id != ?
               AND REPLACE(REPLACE(school_year, '"', ''), '''', '') = REPLACE(REPLACE(?, '"', ''), '''', '')`
          )
          .all(keep.student_id, keepId, keep.school_year) as Array<{ id: string }>
        if (targets.length === 0) {
          return { success: false, error: 'Aucune fiche dupliquée active restante (déjà traitée ?).' }
        }
        db.transaction(() => {
          for (const t of targets) {
            db.prepare(
              "UPDATE student_fees SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?"
            ).run(nowIso, t.id)
            addToSyncQueue('student_fees', t.id, 'delete', { id: t.id, deleted: true, updated_at: nowIso })
          }
        })()
        trace(
          `remediation:fee_duplicate_keep:${keepId}`,
          { archived: targets.map((t) => t.id) },
          { keptId: keepId, at: nowIso },
          user
        )
        syncWithCloud().catch((e) => console.error('[Remediation] sync after fee dedupe:', e))
        return { success: true, message: `${targets.length} fiche(s) dupliquée(s) archivée(s). Fiche d'origine conservée.` }
      }

      // --- Réconciliation des participations événement bloquées (dry-run puis exécution validée) ---
      // dryRun=true (défaut) : AUCUNE mutation, renvoie le détail des lignes + classification.
      // dryRun=false : applique UNIQUEMENT les cas sûrs (cumul cloud >= local) par adoption d'UUID.
      case 'reconcile_blocked_event_payments': {
        const dryRun = params.dryRun !== false
        const blocked = blockedEventPaymentRows()
        if (blocked.length === 0) {
          return { success: true, message: 'Aucune participation événement bloquée en file de sync.', details: { safeCount: 0, reviewCount: 0, applied: 0, rows: [] } }
        }
        const cloudMap = await fetchCloudEventPaymentsActive()
        const safe: Array<{ b: (typeof blocked)[number]; cloudId: string; cloudPaid: number }> = []
        const rows: Array<Record<string, unknown>> = []
        let reviewCount = 0
        for (const b of blocked) {
          const cloud = cloudMap.get(`${b.eventId}|${b.studentId}`)
          const verdict = cloud && cloud.amount_paid >= b.localPaid ? 'safe' : 'review'
          if (verdict === 'safe' && cloud) {
            safe.push({ b, cloudId: cloud.id, cloudPaid: cloud.amount_paid })
          } else {
            reviewCount++
          }
          rows.push({
            id: b.recordId,
            student: b.studentName,
            event: b.eventName,
            localPaid: b.localPaid,
            cloudPaid: cloud ? cloud.amount_paid : null,
            localDue: b.localDue,
            cloudDue: cloud ? cloud.amount_due : null,
            verdict,
            reason:
              verdict === 'safe'
                ? 'Le Cloud couvre déjà ce cumul : adoption sans perte.'
                : cloud
                  ? 'Cumul local supérieur au Cloud : arbitrage humain requis.'
                  : 'Aucune participation active côté Cloud : vérifier avant de repousser.'
          })
        }

        if (dryRun) {
          trace('remediation:event_payments_dryrun', null, { safeCount: safe.length, reviewCount, at: nowIso }, user)
          return {
            success: true,
            message: `Prévisualisation : ${safe.length} cas sûr(s) adoptables, ${reviewCount} cas à arbitrer. Aucune donnée modifiée.`,
            details: { safeCount: safe.length, reviewCount, applied: 0, rows }
          }
        }

        let applied = 0
        for (const s of safe) {
          // Re-vérification fraîche avant mutation (le Cloud a pu changer depuis le scan).
          const localEp = db
            .prepare('SELECT amount_paid FROM event_payments WHERE id = ?')
            .get(s.b.recordId) as { amount_paid: number } | undefined
          if (!localEp) continue
          const { data: cloudEp } = await supabase
            .from('event_payments')
            .select('id, amount_paid')
            .eq('event_id', s.b.eventId)
            .eq('student_id', s.b.studentId)
            .eq('deleted', false)
            .maybeSingle()
          if (!cloudEp?.id || Number(cloudEp.amount_paid || 0) < Number(localEp.amount_paid || 0)) continue
          adoptCloudEventPayment(s.b.recordId, cloudEp.id, nowIso)
          trace(
            `remediation:event_payment_adopt:${s.b.recordId}`,
            { localPaid: localEp.amount_paid },
            { cloudId: cloudEp.id, cloudPaid: cloudEp.amount_paid, at: nowIso },
            user
          )
          applied++
        }
        syncWithCloud().catch((e) => console.error('[Remediation] sync after event reconciliation:', e))
        return {
          success: true,
          message: `${applied} participation(s) alignée(s) sur le Cloud (cas sûrs). ${reviewCount} cas restent à arbitrer.`,
          details: { safeCount: safe.length, reviewCount, applied, rows }
        }
      }

      // --- Arbitrage humain d'une participation événement divergente (cumul local > cloud) ---
      case 'resolve_event_payment_aggregate': {
        const recordId = String(params.recordId || '')
        const decision = String(params.decision || '')
        if (!recordId) return { success: false, error: 'Participation introuvable.' }
        const ep = db
          .prepare('SELECT id, event_id, student_id, amount_paid, amount_due FROM event_payments WHERE id = ?')
          .get(recordId) as
          | { id: string; event_id: string; student_id: string; amount_paid: number; amount_due: number }
          | undefined
        if (!ep) return { success: false, error: 'Participation introuvable ou déjà traitée.' }

        if (decision === 'review') {
          trace(`remediation:event_payment_review:${recordId}`, null, { reviewedAt: nowIso }, user)
          return { success: true, message: 'Constat marqué comme consulté (aucune donnée modifiée).' }
        }

        const { data: cloudEp } = await supabase
          .from('event_payments')
          .select('id, amount_paid, amount_due')
          .eq('event_id', ep.event_id)
          .eq('student_id', ep.student_id)
          .eq('deleted', false)
          .maybeSingle()

        if (decision === 'keep_cloud') {
          if (!cloudEp?.id) return { success: false, error: 'Aucune participation cloud active à conserver.' }
          adoptCloudEventPayment(recordId, cloudEp.id, nowIso)
          trace(
            `remediation:event_payment_keep_cloud:${recordId}`,
            { localPaid: ep.amount_paid },
            { cloudId: cloudEp.id, cloudPaid: cloudEp.amount_paid, at: nowIso },
            user
          )
          syncWithCloud().catch((e) => console.error('[Remediation] sync after keep_cloud:', e))
          return { success: true, message: "Agrégat cloud conservé ; participation alignée. L'argent encaissé reste tracé dans la caisse." }
        }

        if (decision === 'push_local') {
          if (!params.confirm) {
            return { success: false, error: 'Confirmation explicite requise (confirm) pour pousser le cumul local vers le Cloud.' }
          }
          if (!cloudEp?.id) {
            // Pas de ligne cloud active : repousser réellement la participation (retry, pas de purge).
            db.prepare(
              "UPDATE sync_queue SET status = 'pending', error_message = NULL, retry_count = 0, updated_at = CURRENT_TIMESTAMP WHERE table_name = 'event_payments' AND record_id = ? AND status IN ('error','failed','quarantined')"
            ).run(recordId)
            trace(`remediation:event_payment_repush:${recordId}`, null, { repushedAt: nowIso }, user)
            syncWithCloud().catch((e) => console.error('[Remediation] sync after repush:', e))
            return { success: true, message: 'Participation remise en file pour envoi réel vers le Cloud.' }
          }
          const localPaid = Number(ep.amount_paid || 0)
          const dueMax = Math.max(Number(ep.amount_due || 0), Number(cloudEp.amount_due || 0))
          const paidFlag = localPaid >= dueMax
          const { error: updErr } = await supabase
            .from('event_payments')
            .update({ amount_paid: localPaid, amount_due: dueMax, paid: paidFlag, updated_at: nowIso })
            .eq('id', cloudEp.id)
          if (updErr) return { success: false, error: `Mise à jour cloud échouée : ${updErr.message}` }
          adoptCloudEventPayment(recordId, cloudEp.id, nowIso)
          trace(
            `remediation:event_payment_push_local:${recordId}`,
            { cloudPaid: cloudEp.amount_paid },
            { cloudId: cloudEp.id, newCloudPaid: localPaid, at: nowIso },
            user
          )
          syncWithCloud().catch((e) => console.error('[Remediation] sync after push_local:', e))
          return { success: true, message: `Cumul local (${localPaid.toLocaleString('fr-FR')} Ar) poussé vers le Cloud ; participation alignée.` }
        }

        return { success: false, error: 'Décision attendue : push_local, keep_cloud ou review.' }
      }

      // --- Simple marquage consulté (aucune modification de donnée) ---
      case 'review_only': {
        trace('remediation:reviewed', null, { reviewedAt: nowIso, params }, user)
        return { success: true, message: 'Constat marqué comme consulté (aucune donnée modifiée).' }
      }

      default:
        return { success: false, error: `Action de remédiation inconnue : ${action}` }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Remediation] apply error:', err)
    return { success: false, error: msg }
  }
}