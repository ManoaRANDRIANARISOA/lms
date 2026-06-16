import { ipcMain } from 'electron'
import { AssessmentRepository } from '../database/repositories/assessment.repository'

export function registerAssessmentHandlers(): void {
  ipcMain.handle('assessment:create', async (_, data) => {
    try {
      const result = AssessmentRepository.create(data)
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('assessment:list', async (_, schoolYear, className) => {
    return AssessmentRepository.list(schoolYear, className)
  })

  ipcMain.handle('assessment:update', async (_, id, updates) => {
    try {
      const result = AssessmentRepository.update(id, updates)
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('assessment:delete', async (_, id) => {
    try {
      const result = AssessmentRepository.delete(id)
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
