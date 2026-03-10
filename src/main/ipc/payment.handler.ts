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

  // GET ALL PAYMENTS (Global View)
  ipcMain.handle('payment:getAll', async (_, filters) => {
    return PaymentRepository.getAll(filters);
  });

  // GET TUITION STATUS
  ipcMain.handle('payment:getTuitionStatus', async (_, studentId, schoolYear) => {
    return PaymentRepository.getTuitionStatus(studentId, schoolYear);
  });
}
