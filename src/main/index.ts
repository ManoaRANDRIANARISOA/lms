import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import path, { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import './database/db' // Initialize DB
import { registerStudentHandlers } from './ipc/student.handler'
import { registerDialogHandlers } from './ipc/dialog.handler'
import { registerSettingsHandlers } from './ipc/settings.handler'
import { registerPaymentHandlers } from './ipc/payment.handler'
import { registerAttendanceHandlers } from './ipc/attendance.handler'
import { registerEventHandlers } from './ipc/event.handler'
import { startPeriodicSync } from './services/sync.service'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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
  ipcMain.on('ping', () => console.log('pong'))
  
  // Register Handlers
  registerStudentHandlers();
  registerDialogHandlers();
  registerSettingsHandlers();
  registerPaymentHandlers();
  registerAttendanceHandlers();
  registerEventHandlers();
  
  // Register custom protocol for local resources
  protocol.handle('local-resource', async (req) => {
      // Decode the URL first
      const decodedUrl = decodeURIComponent(req.url.replace('local-resource://', ''));
      
      let filePath = decodedUrl;
      
      // Handle Windows drive letters (e.g., /C:/Users... -> C:/Users...)
      // If it starts with a slash followed by a drive letter, remove the slash.
      if (process.platform === 'win32' && filePath.match(/^\/[a-zA-Z]:/)) {
         filePath = filePath.slice(1);
      }
      
      // Normalize the path (handles slashes/backslashes correctly for the OS)
      filePath = path.normalize(filePath);

      try {
          // Check if file exists
          if (!fs.existsSync(filePath)) {
               console.error('Local Resource - File not found:', filePath);
               return new Response('File not found', { status: 404 });
          }
          
          const data = await fs.promises.readFile(filePath);
          const ext = path.extname(filePath).toLowerCase();
          let mimeType = 'application/octet-stream';
          if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
          else if (ext === '.png') mimeType = 'image/png';
          else if (ext === '.webp') mimeType = 'image/webp';
          else if (ext === '.gif') mimeType = 'image/gif';
          
          return new Response(data, {
              headers: { 'content-type': mimeType }
          });
      } catch (error) {
          console.error('Failed to fetch local resource:', filePath, error);
          return new Response('Internal Server Error', { status: 500 });
      }
  });
  
  // Start Sync
  startPeriodicSync();

  // DIAGNOSTIC LOGGING
   (async () => {
     try {
       const { default: db } = await import('./database/db');
       
       const schoolYearSetting = db.prepare("SELECT value FROM settings WHERE key = 'school_year'").get() as { value: string } | undefined;
       const fees = db.prepare("SELECT * FROM student_fees LIMIT 5").all();
       
       const logContent = `
--- DIAGNOSTICS START ---
Time: ${new Date().toISOString()}
DIAG: School Year Setting: ${schoolYearSetting?.value}
DIAG: Sample Fees: ${JSON.stringify(fees, null, 2)}
--- DIAGNOSTICS END ---
       `;
       
       const fs = await import('fs');
       fs.writeFileSync('C:/rep/School/lms/diag_log.txt', logContent);
       console.log('Diagnostic log written to C:/rep/School/lms/diag_log.txt');

     } catch (e) {
       console.error('Diagnostic error:', e);
     }
   })();

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
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
