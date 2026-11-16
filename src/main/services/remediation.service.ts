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
function sealedClosureLabel(studentId: string): string | null {
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
        const sealed = sealedClosureLabel(oldId)
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
        const sealed = sealedClosureLabel(oldId)
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
        const sealed = sealedClosureLabel(oldId)
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