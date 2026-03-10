import { ipcMain } from 'electron';
import { AttendanceRepository } from '../database/repositories/attendance.repository';

export function registerAttendanceHandlers() {
  ipcMain.handle('attendance:getBusSubscribers', async (_, schoolYear) => {
    return AttendanceRepository.getBusSubscribers(schoolYear);
  });
  
  ipcMain.handle('attendance:getCanteenSubscribers', async (_, schoolYear) => {
    return AttendanceRepository.getCanteenSubscribers(schoolYear);
  });

  ipcMain.handle('attendance:getBusAttendance', async (_, date) => {
    return AttendanceRepository.getBusAttendance(date);
  });

  ipcMain.handle('attendance:getCanteenAttendance', async (_, date) => {
    return AttendanceRepository.getCanteenAttendance(date);
  });

  ipcMain.handle('attendance:recordBus', async (_, date, records) => {
    return AttendanceRepository.recordBusAttendance(date, records);
  });

  ipcMain.handle('attendance:recordCanteen', async (_, date, records) => {
    return AttendanceRepository.recordCanteenAttendance(date, records);
  });
}
