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
      const schoolYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`

      // 1. Élèves
      const studentCount = (db.prepare('SELECT COUNT(*) as count FROM students WHERE deleted = 0').get() as { count: number }).count
      const newStudentsThisMonth = (db.prepare(`
        SELECT COUNT(*) as count FROM students 
        WHERE enrollment_date >= date('now', 'start of month') AND deleted = 0
      `).get() as { count: number }).count

      const studentsByClass = db.prepare(`
        SELECT class, COUNT(*) as count FROM students 
        WHERE deleted = 0 GROUP BY class ORDER BY count DESC
      `).all() as { class: string; count: number }[]

      // 2. Paiements (élèves)
      const todayPayments = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments 
        WHERE payment_date = ? AND deleted = 0
      `).get(today) as { total: number }).total

      const weekPayments = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments 
        WHERE payment_date >= date('now', '-7 days') AND deleted = 0
      `).get() as { total: number }).total

      const monthPayments = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments 
        WHERE payment_date >= date('now', 'start of month') AND deleted = 0
      `).get() as { total: number }).total

      const totalPaymentsAllTime = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments WHERE deleted = 0
      `).get() as { total: number }).total

      // 3. Impayés — approximation via student_fees vs paiements
      // Total dû = frais fixes annuels + scolarité mensuelle * mois écoulés + bus + cantine + uniformes
      const monthsElapsed = Math.max(1, new Date().getMonth() + 1) // jan=1, mai=5

      const totalDue = (db.prepare(`
        SELECT COALESCE(SUM(
          enrollment_fee + reenrollment_fee + notebook_fee + fram_fee +
          (CASE WHEN bus_subscribed = 1 THEN bus_monthly_fee * ? ELSE 0 END) +
          (CASE WHEN canteen_subscribed = 1 THEN canteen_daily_rate * canteen_days_per_week * 4 * ? ELSE 0 END) +
          (CASE WHEN uniform_tshirt_purchased = 1 THEN 15000 ELSE 0 END) +
          (CASE WHEN uniform_apron_purchased = 1 THEN 10000 ELSE 0 END) +
          (CASE WHEN uniform_shorts_purchased = 1 THEN 8000 ELSE 0 END) +
          (CASE WHEN uniform_badge_purchased = 1 THEN 3000 ELSE 0 END) +
          monthly_tuition * ?
        ), 0) as total
        FROM student_fees WHERE deleted = 0 AND school_year = ?
      `).get(monthsElapsed, monthsElapsed, monthsElapsed, schoolYear) as { total: number }).total

      const totalPaid = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM student_payments WHERE deleted = 0
      `).get() as { total: number }).total

      const balance = totalDue - totalPaid
      const unpaidCount = balance > 0 ? Math.min(studentCount, Math.ceil(balance / 50000)) : 0 // Approximation

      // 4. Personnel
      const personnelCount = (db.prepare('SELECT COUNT(*) as count FROM personnel WHERE deleted = 0').get() as { count: number }).count

      // 5. Événements à venir
      const upcomingEvents = db.prepare(`
        SELECT id, name, event_date, amount_per_parent, status
        FROM parent_events 
        WHERE event_date >= date('now') AND deleted = 0 AND status != 'completed'
        ORDER BY event_date ASC LIMIT 5
      `).all() as { id: string; name: string; event_date: string; amount_per_parent: number; status: string }[]

      // 6. Activité récente — derniers paiements
      const recentPayments = db.prepare(`
        SELECT sp.id, sp.amount, sp.payment_date, sp.payment_type, 
               s.first_name, s.last_name, s.class
        FROM student_payments sp
        JOIN students s ON sp.student_id = s.id
        WHERE sp.deleted = 0
        ORDER BY sp.created_at DESC
        LIMIT 10
      `).all() as {
        id: string; amount: number; payment_date: string; payment_type: string;
        first_name: string; last_name: string; class: string
      }[]

      // 7. Dernières inscriptions
      const recentEnrollments = db.prepare(`
        SELECT id, first_name, last_name, class, enrollment_date, created_at
        FROM students WHERE deleted = 0
        ORDER BY created_at DESC
        LIMIT 5
      `).all() as {
        id: string; first_name: string; last_name: string; class: string;
        enrollment_date: string; created_at: string
      }[]

      // 8. Tendance paiements (30 derniers jours)
      const paymentTrend = db.prepare(`
        SELECT payment_date as date, SUM(amount) as total
        FROM student_payments
        WHERE payment_date >= date('now', '-30 days') AND deleted = 0
        GROUP BY payment_date
        ORDER BY payment_date ASC
      `).all() as { date: string; total: number }[]

      return {
        success: true,
        data: {
          students: {
            total: studentCount,
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
            totalPaid,
            balance,
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
    } catch (error: any) {
      console.error('Dashboard stats error:', error)
      return { success: false, error: 'Erreur lors du chargement des statistiques' }
    }
  })
}
