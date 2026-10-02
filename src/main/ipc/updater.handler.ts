import { ipcMain } from 'electron'
import { UpdaterService } from '../services/updater.service'

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    return UpdaterService.checkForUpdates()
  })

  ipcMain.handle('updater:install', async () => {
    UpdaterService.quitAndInstall()
  })

  ipcMain.handle('updater:getDownloadedInfo', async () => {
    return UpdaterService.getDownloadedUpdateInfo()
  })
}
