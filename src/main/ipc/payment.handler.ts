import { ipcMain } from 'electron';
import { PaymentRepository } from '../database/repositories/payment.repository';

export function registerPaymentHandlers() {
  // CREATE PAYMENT
  ipcMain.handle('payment:create', async (_, payment) => {
    return PaymentRepository.create(payment);
  });

  // GET PAYMENTS BY STUDENT
  ipcMain.handle('payment:getByStudent', async (_, studentId) => {
    return PaymentRepository.getByStudent(studentId);
  });

  // GET TUITION STATUS
  ipcMain.handle('payment:getTuitionStatus', async (_, studentId, schoolYear) => {
    return PaymentRepository.getTuitionStatus(studentId, schoolYear);
  });
}
