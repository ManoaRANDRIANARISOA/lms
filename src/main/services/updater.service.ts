import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { LoggerService } from './logger.service'

export interface UpdateInfoPayload {
  version: string
  releaseDate?: string
  releaseNotes?: string | Array<{ version: string; note: string | null }> | null
}

export class UpdaterService {
  private static mainWindow: BrowserWindow | null = null
  private static initialized = false
  private static downloadedUpdateInfo: UpdateInfoPayload | null = null

  static init(window: BrowserWindow) {
    this.mainWindow = window
    if (this.initialized) return
    this.initialized = true

    // Configure autoUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      LoggerService.log('info', 'updater', 'Vérification des mises à jour distantes (GitHub Releases)...')
      this.sendToRenderer('updater:checking', {})
    })

    autoUpdater.on('update-available', (info) => {
      LoggerService.log('info', 'updater', `Mise à jour disponible : v${info.version}`, info)
      this.sendToRenderer('updater:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      LoggerService.log('info', 'updater', `Application à jour (v${info.version})`)
      this.sendToRenderer('updater:update-not-available', {
        version: info.version
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      this.sendToRenderer('updater:download-progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      LoggerService.log('info', 'updater', `Mise à jour v${info.version} téléchargée avec succès`)
      this.downloadedUpdateInfo = {
        version: info.version,
        releaseNotes: info.releaseNotes
      }
      this.sendToRenderer('updater:update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('error', (err) => {
      LoggerService.log('warn', 'updater', `Info mise à jour : ${err.message}`)
      this.sendToRenderer('updater:error', { error: err.message })
    })

    // Check on startup if packaged
    if (app.isPackaged) {
      setTimeout(() => {
        this.checkForUpdates()
      }, 5000)

      // Periodic check every 2 hours
      setInterval(() => {
        this.checkForUpdates()
      }, 2 * 60 * 60 * 1000)
    }
  }

  static async checkForUpdates(): Promise<{ success: boolean; error?: string; isDev?: boolean }> {
    try {
      if (!app.isPackaged) {
        return { success: true, isDev: true }
      }
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  static getDownloadedUpdateInfo(): UpdateInfoPayload | null {
    return this.downloadedUpdateInfo
  }

  static quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  private static sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}
