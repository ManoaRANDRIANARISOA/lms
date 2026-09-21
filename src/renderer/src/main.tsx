import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Override window.confirm to use Electron's native dialog via IPC
// This fixes the known Windows Electron bug where native confirm/alert breaks webview keyboard focus
window.confirm = (message?: string) => {
  if (window.api && window.api.dialog && window.api.dialog.confirmSync) {
    return window.api.dialog.confirmSync(message || 'Êtes-vous sûr ?')
  }
  return true
}

// Global telemetry error reporting for unhandled renderer errors
window.addEventListener('error', (event) => {
  try {
    window.api?.telemetry?.reportError(
      'Renderer window.onerror',
      event.message || 'Unknown window error',
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      }
    )
  } catch {
    // Ignore telemetry failure
  }
})

window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event.reason
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    window.api?.telemetry?.reportError('Renderer unhandledrejection', msg, { stack })
  } catch {
    // Ignore telemetry failure
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
