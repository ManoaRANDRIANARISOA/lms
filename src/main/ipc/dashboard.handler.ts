/**
 * dashboard.handler.ts — IPC Handlers for Dashboard KPIs
 *
 * Fournit des agrégations SQL pour le tableau de bord :
 *   - Statistiques élèves (total, nouveaux ce mois)
 *   - Statistiques paiements (jour, semaine, mois)
 *   - Impayés (solde global, élèves en retard)
 *   - Personnel actif
 *   - Prochains événements
 *   - Activité récente
 *
 * @module DashboardHandler
 */

import { ipcMain } from 'electron'
import db from '../database/db'
import { canRead } from '../auth/rbac.service'
import { PaymentRepository } from '../database/repositories/payment.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'

export function registerDashboardHandlers(): void {
  // --------------------------------------------
  // GET DASHBOARD STATS
  // --------------------------------------------
  ipcMain.handle('dashboard:getStats', async () => {
    if (!canRead('students')) {
      return { success: false, error: 'Accès refusé' }
    }

    try {
      const today = new Date().toISOString().split('T')[0]
      const schoolYearSetting = SettingsRepository.get('school_year') as string
      const targetYear =
        schoolYearSetting?.replace(/['"]/g, '').trim() ||
        `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`

      // 1. Élèves
      const totalRegistered = (
        db.prepare('SELECT COUNT(*) as count FROM students WHERE deleted = 0').get() as {
          count: number
        }
      ).count

      const totalEnrolled = (
        db
          .prepare(
            `
        SELECT COUNT(DISTINCT s.id) as count 
        FROM students s
        LEFT JOIN student_fees sf ON sf.student_id = s.id 
          AND REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? 
          AND sf.deleted = 0
        WHERE s.deleted = 0 
          AND (
            (sf.class_name IS NOT NULL AND sf.class_name != '' AND sf.class_name != 'Non inscrit' AND sf.class_name != 'Classe non spécifiée')
            OR (s.class IS NOT NULL AND s.class != '' AND s.class != 'Non inscrit' AND s.class != 'Classe non spécifiée')
          )
      `
          )
          .get(targetYear) as { count: number }
      ).count

      const newStudentsThisMonth = (
        db
          .prepare(
            `
        SELECT COUNT(DISTINCT s.id) as count 
        FROM students s
        LEFT JOIN student_fees sf ON sf.student_id = s.id 
          AND REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? 
          AND sf.deleted = 0
        WHERE s.deleted = 0 
          AND (
            sf.created_at >= date('now', 'start of month')
            OR s.created_at >= date('now', 'start of month')
            OR s.enrollment_date >= date('now', 'start of month')
          )
          AND (
            (sf.class_name IS NOT NULL AND sf.class_name != '' AND sf.class_name != 'Non inscrit' AND sf.class_name != 'Classe non spécifiée')
            OR (s.class IS NOT NULL AND s.class != '' AND s.class != 'Non inscrit' AND s.class != 'Classe non spécifiée')
          )
      `
          )
          .get(targetYear) as { count: number }
      ).count

      const studentsByClass = db
        .prepare(
          `
        SELECT 
          COALESCE(NULLIF(sf.class_name, ''), s.class) as class, 
          COUNT(DISTINCT s.id) as count 
        FROM students s
        LEFT JOIN student_fees sf ON sf.student_id = s.id 
          AND REPLACE(REPLACE(sf.school_year, '"', ''), '''', '') = ? 
          AND sf.deleted = 0
        WHERE s.deleted = 0 
          AND (
            (sf.class_name IS NOT NULL AND sf.class_name != '' AND sf.class_name != 'Non inscrit' AND sf.class_name != 'Classe non spécifiée')
            OR (s.class IS NOT NULL AND s.class != '' AND s.class != 'Non inscrit' AND s.class != 'Classe non spécifiée')
          )
        GROUP BY class ORDER BY count DESC
      `
        )
        .all(targetYear) as { class: string; count: number }[]

      // 2. Paiements (élèves)
      const todayPayments = (
        db
          .prepare(
            `
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments 
        WHERE payment_date = ? AND deleted = 0
      `
          )
          .get(today) as { total: number }
      ).total

      const weekPayments = (
        db
          .prepare(
            `
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments 
        WHERE payment_date >= date('now', '-7 days') AND deleted = 0
      `
          )
          .get() as { total: number }
      ).total

      const monthPayments = (
        db
          .prepare(
            `
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments 
        WHERE payment_date >= date('now', 'start of month') AND deleted = 0
      `
          )
          .get() as { total: number }
      ).total

      const totalPaymentsAllTime = (
        db
          .prepare(
            `
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments WHERE deleted = 0
      `
          )
          .get() as { total: number }
      ).total

      // 3. Impayés — depuis la source centralisée PaymentRepository.getUnpaidAlerts
      const unpaidResult = PaymentRepository.getUnpaidAlerts(targetYear)
      const unpaidAlerts = (
        unpaidResult.success && unpaidResult.alerts ? unpaidResult.alerts : []
      ) as Array<{ total_due: number }>
      const totalUnpaid = unpaidAlerts.reduce((sum: number, a) => sum + (a.total_due || 0), 0)
      const unpaidCount = unpaidAlerts.length
      const expectedResult = PaymentRepository.getExpectedRevenue(targetYear)
      const totalDue = (expectedResult.success ? expectedResult.expected : 0) || 0

      // 4. Personnel
      const personnelCount = (
        db.prepare('SELECT COUNT(*) as count FROM personnel WHERE deleted = 0').get() as {
          count: number
        }
      ).count

      // 5. Événements à venir
      const upcomingEvents = db
        .prepare(
          `
        SELECT id, name, event_date, amount_per_parent, status
        FROM parent_events 
        WHERE event_date >= date('now') AND deleted = 0 AND status != 'completed' AND school_year = ?
        ORDER BY event_date ASC LIMIT 5
      `
        )
        .all(targetYear) as {
        id: string
        name: string
        event_date: string
        amount_per_parent: number
        status: string
      }[]

      // 6. Activité récente — derniers paiements
      const recentPayments = db
        .prepare(
          `
        SELECT sp.id, sp.amount, sp.payment_date, sp.payment_type, 
               s.first_name, s.last_name, s.class
        FROM student_payments sp
        JOIN students s ON sp.student_id = s.id
        WHERE sp.deleted = 0
        ORDER BY sp.created_at DESC
        LIMIT 10
      `
        )
        .all() as {
        id: string
        amount: number
        payment_date: string
        payment_type: string
        first_name: string
        last_name: string
        class: string
      }[]

      // 7. Dernières inscriptions
      const recentEnrollments = db
        .prepare(
          `
        SELECT id, first_name, last_name, class, enrollment_date, created_at
        FROM students WHERE deleted = 0
        ORDER BY created_at DESC
        LIMIT 5
      `
        )
        .all() as {
        id: string
        first_name: string
        last_name: string
        class: string
        enrollment_date: string
        created_at: string
      }[]

      // 8. Tendance financière (30 derniers jours)
      const paymentTrend = db
        .prepare(
          `
        SELECT transaction_date as date, 
               COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as total
        FROM cash_journal
        WHERE transaction_date >= date('now', '-30 days') AND deleted = 0
        GROUP BY transaction_date
        ORDER BY transaction_date ASC
      `
        )
        .all() as { date: string; total: number }[]

      return {
        success: true,
        data: {
          schoolYear: targetYear,
          students: {
            totalRegistered,
            totalEnrolled,
            newThisMonth: newStudentsThisMonth,
            byClass: studentsByClass
          },
          payments: {
            today: todayPayments,
            thisWeek: weekPayments,
            thisMonth: monthPayments,
            allTime: totalPaymentsAllTime
          },
          finances: {
            totalDue,
            totalPaid: totalPaymentsAllTime,
            balance: totalUnpaid,
            unpaidCount
          },
          personnel: {
            total: personnelCount
          },
          events: upcomingEvents,
          activity: {
            recentPayments,
            recentEnrollments
          },
          trend: paymentTrend
        }
      }
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error('Dashboard stats error:', error)
      return { success: false, error: 'Erreur lors du chargement des statistiques' }
    }
  })
}
