import { app, shell, BrowserWindow, protocol } from 'electron'
import path, { join } from 'path'
import fs from 'fs'

process.on('uncaughtException', (err) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'crash.log'), err.stack || err.message)
})

import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import './database/db' // Initialize DB
import { registerStudentHandlers } from './ipc/student.handler'
import { registerDialogHandlers } from './ipc/dialog.handler'
import { registerSettingsHandlers } from './ipc/settings.handler'
import { registerPaymentHandlers } from './ipc/payment.handler'
import { registerAttendanceHandlers } from './ipc/attendance.handler'
import { registerEventHandlers } from './ipc/event.handler'
import { registerAuthHandlers } from './ipc/auth.handler'
import { registerDashboardHandlers } from './ipc/dashboard.handler'
import { registerPersonnelHandlers } from './ipc/personnel.handler'
import { registerGradeHandlers } from './ipc/grade.handler'
import { registerCashJournalHandlers } from './ipc/cashjournal.handler'
import { registerPdfHandlers } from './ipc/pdf.handler'
import { registerAssessmentHandlers } from './ipc/assessment.handler'
import { registerEmailHandlers } from './ipc/email.handler'
import { registerReportHandlers } from './ipc/report.handler'
import { startPeriodicSync } from './services/sync.service'
import { startSessionMonitor, stopSessionMonitor } from './auth/session.service'
import { EmailService } from './services/email.service'

// Auth handlers are now registered via registerAuthHandlers() below

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'LMS - Lycée Manjary Soa',
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.lycee.manjary')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test

  // Register Auth & RBAC Handlers
  registerAuthHandlers()

  // Register other IPC Handlers
  registerStudentHandlers()
  registerDialogHandlers()
  registerSettingsHandlers()
  registerPaymentHandlers()
  registerAttendanceHandlers()
  registerEventHandlers()
  registerDashboardHandlers()
  registerPersonnelHandlers()
  registerGradeHandlers()
  registerCashJournalHandlers()
  registerAssessmentHandlers()
  registerPdfHandlers()
  registerEmailHandlers()
  registerReportHandlers()

  // Register custom protocol for local resources
  protocol.handle('local-resource', async (req) => {
    // Decode the URL first
    const decodedUrl = decodeURIComponent(req.url.replace('local-resource://', ''))

    let filePath = decodedUrl

    // Handle Windows drive letters (e.g., /C:/Users... -> C:/Users...)
    // If it starts with a slash followed by a drive letter, remove the slash.
    if (process.platform === 'win32' && filePath.match(/^\/[a-zA-Z]:/)) {
      filePath = filePath.slice(1)
    }

    // Normalize the path (handles slashes/backslashes correctly for the OS)
    filePath = path.normalize(filePath)

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error('Local Resource - File not found:', filePath)
        return new Response('File not found', { status: 404 })
      }

      const data = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      let mimeType = 'application/octet-stream'
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
      else if (ext === '.png') mimeType = 'image/png'
      else if (ext === '.webp') mimeType = 'image/webp'
      else if (ext === '.gif') mimeType = 'image/gif'

      return new Response(data, {
        headers: { 'content-type': mimeType }
      })
    } catch (error) {
      console.error('Failed to fetch local resource:', filePath, error)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  // Start Sync
  startPeriodicSync()

  // Start Session Monitor (timeout + cleanup)
  startSessionMonitor()

  // Start Email Scheduler (daily report at 18h)
  EmailService.startScheduler()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopSessionMonitor()
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
