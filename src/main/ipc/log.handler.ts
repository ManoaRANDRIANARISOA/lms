import { ipcMain } from 'electron'
import { LoggerService } from '../services/logger.service'

export function registerLogHandlers(): void {
  ipcMain.handle('logs:get', async (_, limit = 100, offset = 0) => {
    return LoggerService.getLogs(limit, offset)
  })

  ipcMain.handle('logs:clear', async () => {
    return LoggerService.clearLogs()
  })
}
