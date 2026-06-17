/**
 * report.service.ts — Report Generation Service
 *
 * Aggregates data for financial, payroll, tuition, and unpaid reports.
 *
 * @module ReportService
 */

import db from '../database/db'

export class ReportService {
  static generateMonthlyFinanceReport(year: number, month: number) {
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`

      const income = db
        .prepare(
          `
        SELECT department, category, COUNT(*) as count, SUM(amount) as total
        FROM cash_journal
        WHERE type = 'income' AND transaction_date LIKE ? AND deleted = 0
        GROUP BY department, category
        ORDER BY total DESC
      `
        )
        .all(`${monthStr}%`) as Array<{
        department: string
        category: string
        count: number
        total: number
      }>

      const expense = db
        .prepare(
          `
        SELECT department, category, COUNT(*) as count, SUM(amount) as total
        FROM cash_journal
        WHERE type = 'expense' AND transaction_date LIKE ? AND deleted = 0
        GROUP BY department, category
        ORDER BY total DESC
      `
        )
        .all(`${monthStr}%`) as Array<{
        department: string
        category: string
        count: number
        total: number
      }>

      const totalIncome = income.reduce((s, r) => s + r.total, 0)
      const totalExpense = expense.reduce((s, r) => s + r.total, 0)

      return {
        year,
        month,
        total_income: totalIncome,
        total_expense: totalExpense,
        balance: totalIncome - totalExpense,
        income_by_category: income,
        expense_by_category: expense
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Erreur lors de la génération du rapport financier : ${message}`)
    }
  }

  static generateUnpaidReport(schoolYear: string) {
    try {
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      const fees = db
        .prepare(
          `
        SELECT sf.class_name, sf.student_id, sf.monthly_tuition,
               s.first_name, s.last_name
        FROM student_fees sf
        JOIN students s ON sf.student_id = s.id
        WHERE sf.school_year = ? AND sf.deleted = 0 AND sf.monthly_tuition > 0
      `
        )
        .all(targetYear) as Array<{
        class_name: string
        student_id: string
        monthly_tuition: number
        first_name: string
        last_name: string
      }>

      const [startYear] = targetYear.split('-').map(Number)
      const months: string[] = []
      for (let m = 9; m <= 12; m++) months.push(`${startYear}-${String(m).padStart(2, '0')}`)
      for (let m = 1; m <= 6; m++) months.push(`${startYear + 1}-${String(m).padStart(2, '0')}`)
      months.push(`${startYear + 1}-07`)

      const placeholders = months.map(() => '?').join(', ')
      const payments = db
        .prepare(
          `
        SELECT student_id, month FROM student_payments
        WHERE payment_type = 'tuition' AND deleted = 0 AND month IN (${placeholders})
      `
        )
        .all(...months) as Array<{ student_id: string; month: string }>

      const byClass: Record<
        string,
        Array<{ student: string; unpaid: number; total_due: number }>
      > = {}

      fees.forEach((fee) => {
        const paidMonths = payments
          .filter((p) => p.student_id === fee.student_id)
          .map((p) => p.month)
        const unpaid = months.filter((m) => !paidMonths.includes(m))
        if (unpaid.length > 0) {
          if (!byClass[fee.class_name]) byClass[fee.class_name] = []
          byClass[fee.class_name].push({
            student: `${fee.last_name} ${fee.first_name}`,
            unpaid: unpaid.length,
            total_due: unpaid.length * fee.monthly_tuition
          })
        }
      })

      return { school_year: targetYear, by_class: byClass }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Erreur lors de la génération du rapport impayés : ${message}`)
    }
  }

  static generatePayrollReport(year: number, month: number) {
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`

      const expenses = db
        .prepare(
          `
        SELECT description, amount, transaction_date
        FROM cash_journal
        WHERE type = 'expense' AND category = 'salaire' AND transaction_date LIKE ? AND deleted = 0
        ORDER BY transaction_date
      `
        )
        .all(`${monthStr}%`) as Array<{
        description: string
        amount: number
        transaction_date: string
      }>

      const totalPayroll = expenses.reduce((s, r) => s + r.amount, 0)

      return {
        year,
        month,
        total_payroll: totalPayroll,
        entries: expenses
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Erreur lors de la génération du rapport salaire : ${message}`)
    }
  }

  static generateTuitionReport(schoolYear: string) {
    try {
      const targetYear = schoolYear.replace(/['"]/g, '').trim()
      const [startYearStr, endYearStr] = targetYear.split('-')
      const startYear = parseInt(startYearStr)
      const endYear = parseInt(endYearStr)

      const months = [
        `${startYear}-09`,
        `${startYear}-10`,
        `${startYear}-11`,
        `${startYear}-12`,
        `${endYear}-01`,
        `${endYear}-02`,
        `${endYear}-03`,
        `${endYear}-04`,
        `${endYear}-05`,
        `${endYear}-06`,
        `${endYear}-07`
      ]

      const placeholders = months.map(() => '?').join(', ')
      const payments = db
        .prepare(
          `
        SELECT sp.student_id, sp.month, sp.amount,
               s.first_name, s.last_name, s.class as class_name
        FROM student_payments sp
        JOIN students s ON sp.student_id = s.id
        WHERE sp.payment_type = 'tuition' 
          AND sp.deleted = 0 
          AND sp.month IN (${placeholders})
        ORDER BY s.class, s.last_name, sp.month
      `
        )
        .all(...months) as Array<{
        student_id: string
        month: string
        amount: number
        first_name: string
        last_name: string
        class_name: string
      }>

      const byClass: Record<string, { total: number; count: number }> = {}
      payments.forEach((p) => {
        const className = p.class_name || 'Non inscrit'
        if (!byClass[className]) byClass[className] = { total: 0, count: 0 }
        byClass[className].total += p.amount
        byClass[className].count++
      })

      return { school_year: targetYear, by_class: byClass, total_payments: payments.length }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Erreur lors de la génération du rapport écolage : ${message}`)
    }
  }
}
