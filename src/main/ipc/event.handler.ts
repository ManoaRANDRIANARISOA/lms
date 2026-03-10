import { ipcMain } from 'electron';
import { EventRepository } from '../database/repositories/event.repository';

export function registerEventHandlers() {
  ipcMain.handle('event:create', async (_, event) => {
    return EventRepository.create(event);
  });

  ipcMain.handle('event:list', async () => {
    return EventRepository.list();
  });

  ipcMain.handle('event:getById', async (_, id) => {
    return EventRepository.getById(id);
  });

  ipcMain.handle('event:update', async (_, id, updates) => {
    return EventRepository.update(id, updates);
  });

  ipcMain.handle('event:delete', async (_, id) => {
    return EventRepository.delete(id);
  });

  ipcMain.handle('event:addParticipants', async (_, eventId, studentIds, amountDue) => {
    return EventRepository.addParticipants(eventId, studentIds, amountDue);
  });
  
  // Provide a generic payment record handler for events
  ipcMain.handle('event:recordPayment', async (_, eventId, studentId, amount, paymentMethod) => {
    return EventRepository.recordPayment(eventId, studentId, amount, paymentMethod);
  });
}
