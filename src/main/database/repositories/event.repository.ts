import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import { addToSyncQueue } from '../../services/sync.service';

export interface ParentEvent {
  id: string;
  name: string;
  event_date: string;
  amount_per_parent: number;
  description?: string;
  status: 'planned' | 'ongoing' | 'completed';
}

export interface EventPayment {
  id: string;
  event_id: string;
  student_id: string;
  parent_id?: string;
  amount_due: number;
  amount_paid: number;
  paid: boolean;
  payment_date?: string;
}

export class EventRepository {
  
  static create(event: Omit<ParentEvent, 'id'>) {
    const id = uuidv4();
    
    try {
      db.prepare(`
        INSERT INTO parent_events (id, name, event_date, amount_per_parent, description, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id, event.name, event.event_date, event.amount_per_parent, 
        event.description || null, event.status || 'planned'
      );

      addToSyncQueue('parent_events', id, 'create', { id, ...event });
      
      return { success: true, id };
    } catch (error: any) {
      console.error('Error creating event:', error);
      return { success: false, error: error.message };
    }
  }

  static list() {
    try {
      const events = db.prepare('SELECT * FROM parent_events WHERE deleted = 0 ORDER BY event_date DESC').all();
      return { success: true, events };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static getById(id: string) {
    try {
      const event = db.prepare('SELECT * FROM parent_events WHERE id = ?').get(id);
      if (!event) return { success: false, error: 'Event not found' };
      
      // Get participation stats
      const participation = db.prepare(`
        SELECT 
          ep.*, 
          s.first_name, s.last_name, s.class
        FROM event_payments ep
        JOIN students s ON ep.student_id = s.id
        WHERE ep.event_id = ?
      `).all(id);
      
      return { success: true, event, participation };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static update(id: string, updates: Partial<ParentEvent>) {
    try {
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      
      db.prepare(`
        UPDATE parent_events 
        SET ${fields}, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `).run(...values, id);

      addToSyncQueue('parent_events', id, 'update', updates);
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static delete(id: string) {
    try {
      db.prepare(`
        UPDATE parent_events 
        SET deleted = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' 
        WHERE id = ?
      `).run(id);
      
      addToSyncQueue('parent_events', id, 'delete', { deleted: true });
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Initialize participants for an event (e.g. all students or specific class)
  static addParticipants(eventId: string, studentIds: string[], amountDue: number) {
    const transaction = db.transaction(() => {
      for (const studentId of studentIds) {
        // Check if already exists
        const exists = db.prepare('SELECT id FROM event_payments WHERE event_id = ? AND student_id = ?').get(eventId, studentId);
        
        if (!exists) {
          const id = uuidv4();
          db.prepare(`
            INSERT INTO event_payments (id, event_id, student_id, amount_due, amount_paid, paid)
            VALUES (?, ?, ?, ?, 0, 0)
          `).run(id, eventId, studentId, amountDue);
          
          addToSyncQueue('event_payments', id, 'create', { 
            id, event_id: eventId, student_id: studentId, amount_due: amountDue, amount_paid: 0, paid: false 
          });
        }
      }
    });

    try {
      transaction();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static recordPayment(eventId: string, studentId: string, amount: number, paymentMethod: string = 'cash') {
    const transaction = db.transaction(() => {
      // 1. Get or Create Event Payment Record
      let paymentRecord = db.prepare('SELECT * FROM event_payments WHERE event_id = ? AND student_id = ?').get(eventId, studentId) as any;
      
      if (!paymentRecord) {
        // Create if not exists (adhoc participation)
        const event = db.prepare('SELECT amount_per_parent FROM parent_events WHERE id = ?').get(eventId) as any;
        const amountDue = event ? event.amount_per_parent : amount;
        
        const id = uuidv4();
        db.prepare(`
          INSERT INTO event_payments (id, event_id, student_id, amount_due, amount_paid, paid)
          VALUES (?, ?, ?, ?, 0, 0)
        `).run(id, eventId, studentId, amountDue);
        
        paymentRecord = { id, amount_paid: 0, amount_due: amountDue };
        
        addToSyncQueue('event_payments', id, 'create', { 
          id, event_id: eventId, student_id: studentId, amount_due: amountDue, amount_paid: 0, paid: false 
        });
      }

      // 2. Update Event Payment Record
      const newAmountPaid = paymentRecord.amount_paid + amount;
      const isPaid = newAmountPaid >= paymentRecord.amount_due;
      const paymentDate = new Date().toISOString().split('T')[0];

      db.prepare(`
        UPDATE event_payments 
        SET amount_paid = ?, paid = ?, payment_date = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `).run(newAmountPaid, isPaid ? 1 : 0, paymentDate, paymentRecord.id);

      addToSyncQueue('event_payments', paymentRecord.id, 'update', { 
        amount_paid: newAmountPaid, paid: isPaid, payment_date: paymentDate 
      });

      // 3. Record in General Ledger (Student Payments)
      const ledgerId = uuidv4();
      db.prepare(`
        INSERT INTO student_payments (
            id, student_id, payment_date, amount, payment_type, description, payment_method
        ) VALUES (?, ?, ?, ?, 'event', ?, ?)
      `).run(ledgerId, studentId, paymentDate, amount, `Paiement événement: ${eventId}`, paymentMethod);

      addToSyncQueue('student_payments', ledgerId, 'create', {
        id: ledgerId, student_id: studentId, payment_date: paymentDate, 
        amount, payment_type: 'event', description: `Paiement événement: ${eventId}`, payment_method: paymentMethod
      });
    });

    try {
      transaction();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
