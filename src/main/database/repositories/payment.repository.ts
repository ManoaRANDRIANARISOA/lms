import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import { addToSyncQueue } from '../../services/sync.service';

export interface Payment {
  id: string;
  student_id: string;
  payment_date: string;
  amount: number;
  payment_type: 'tuition' | 'bus' | 'canteen' | 'enrollment' | 'uniform' | 'event' | 'other';
  month?: string; // "2025-09"
  description?: string;
  payment_method?: 'cash' | 'check' | 'transfer' | 'mobile_money';
  receipt_number?: string;
  created_at?: string;
  updated_at?: string;
}

export class PaymentRepository {
  static create(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>) {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO student_payments (
        id, student_id, payment_date, amount, payment_type, month, 
        description, payment_method, receipt_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      stmt.run(
        id,
        payment.student_id,
        payment.payment_date,
        payment.amount,
        payment.payment_type,
        payment.month || null,
        payment.description || null,
        payment.payment_method || 'cash',
        payment.receipt_number || null
      );

      addToSyncQueue('student_payments', id, 'create', { ...payment, id });
    });

    try {
      transaction();
      return { success: true, id };
    } catch (error: any) {
      console.error('Create payment error:', error);
      return { success: false, error: error.message };
    }
  }

  static getByStudent(studentId: string) {
    return db.prepare(`
      SELECT * FROM student_payments 
      WHERE student_id = ? 
      ORDER BY payment_date DESC
    `).all(studentId);
  }

  static getAll(filters: { startDate?: string, endDate?: string, type?: string } = {}) {
    let query = `
      SELECT sp.*, s.first_name, s.last_name, s.class_name 
      FROM student_payments sp 
      LEFT JOIN students s ON sp.student_id = s.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.startDate) {
      conditions.push('sp.payment_date >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('sp.payment_date <= ?');
      params.push(filters.endDate);
    }
    if (filters.type && filters.type !== 'all') {
      conditions.push('sp.payment_type = ?');
      params.push(filters.type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY sp.payment_date DESC, sp.created_at DESC';

    return db.prepare(query).all(...params);
  }

  static getTuitionStatus(studentId: string, schoolYear: string) {
    console.log(`Getting tuition status for student ${studentId} and year ${schoolYear}`);
    // 1. Get Fee Structure
    const feeRecord = db.prepare(`
      SELECT * FROM student_fees 
      WHERE student_id = ? AND school_year = ?
    `).get(studentId, schoolYear) as any;

    if (!feeRecord) {
        console.log('No fee record found for year:', schoolYear);
        // Try with quotes if not found (legacy fallback)
        const feeRecordQuoted = db.prepare(`
            SELECT * FROM student_fees 
            WHERE student_id = ? AND school_year = ?
        `).get(studentId, `"${schoolYear}"`) as any;
        
        if (!feeRecordQuoted) {
            return { success: false, error: 'No fee record found for this year' };
        }
        // Found with quotes, use it
        console.log('Found fee record with quotes');
    }

    // 2. Get Tuition Payments
    const payments = db.prepare(`
      SELECT * FROM student_payments 
      WHERE student_id = ? AND payment_type = 'tuition'
    `).all(studentId);
    
    console.log(`Found ${payments.length} tuition payments`);

    // 3. Calculate Status for each month (Sept - June)
    // Assuming school year starts in Sept and ends in June/July
    // We need to parse school_year "2025-2026"
    const [startYearStr, endYearStr] = schoolYear.replace(/"/g, '').split('-');
    const startYear = parseInt(startYearStr);
    const endYear = parseInt(endYearStr);

    const months = [
      { name: 'Septembre', key: `${startYear}-09` },
      { name: 'Octobre', key: `${startYear}-10` },
      { name: 'Novembre', key: `${startYear}-11` },
      { name: 'Décembre', key: `${startYear}-12` },
      { name: 'Janvier', key: `${endYear}-01` },
      { name: 'Février', key: `${endYear}-02` },
      { name: 'Mars', key: `${endYear}-03` },
      { name: 'Avril', key: `${endYear}-04` },
      { name: 'Mai', key: `${endYear}-05` },
      { name: 'Juin', key: `${endYear}-06` },
      { name: 'Juillet', key: `${endYear}-07` },
    ];

    const monthlyTuition = feeRecord.monthly_tuition || 0;

    const status = months.map(m => {
      const paidForMonth = payments
        .filter((p: any) => p.month === m.key)
        .reduce((sum: number, p: any) => sum + p.amount, 0);

      let status = 'unpaid';
      if (paidForMonth >= monthlyTuition) status = 'paid';
      else if (paidForMonth > 0) status = 'partial';

      return {
        month: m.name,
        key: m.key,
        expected: monthlyTuition,
        paid: paidForMonth,
        status,
        balance: monthlyTuition - paidForMonth
      };
    });

    return {
      success: true,
      feeRecord,
      status
    };
  }
}
