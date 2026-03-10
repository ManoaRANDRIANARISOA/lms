import { ipcMain } from 'electron';
import { StudentRepository } from '../database/repositories/student.repository';
import { syncWithCloud } from '../services/sync.service';

export function registerStudentHandlers() {
    // CREATE STUDENT
    ipcMain.handle('student:create', async (_, studentData) => {
        // Force sync before creation to ensure we have the latest registration number sequence
        console.log('Forcing sync before student creation...');
        try {
            await syncWithCloud();
        } catch (e) {
            console.warn('Sync failed before creation, proceeding anyway:', e);
        }
        
        return StudentRepository.create(studentData);
    });

    // LIST STUDENTS (with filters, pagination)
    ipcMain.handle('student:list', async (_, filters = {}) => {
        return StudentRepository.list(filters);
    });

    // GET STUDENT BY ID
    ipcMain.handle('student:get', async (_, id) => {
        const result = StudentRepository.getById(id);
        if (!result) return { success: false, error: 'Student not found' };
        return { success: true, ...result };
    });

    // UPDATE STUDENT
    ipcMain.handle('student:update', async (_, id, updates) => {
        return StudentRepository.update(id, updates);
    });

    // DELETE (SOFT DELETE)
    ipcMain.handle('student:delete', async (_, id) => {
        return StudentRepository.delete(id);
    });

    // RE-ENROLL STUDENT
    ipcMain.handle('student:reEnroll', async (_, id, newClass, targetYear) => {
        return StudentRepository.reEnroll(id, newClass, targetYear);
    });

    // SERVICE STATS
    ipcMain.handle('student:serviceStats', async () => {
        return StudentRepository.getServiceStats();
    });

    // RESET DATABASE (Dev only)
    ipcMain.handle('db:reset', async (_) => {
        return StudentRepository.resetDatabase();
    });
}
