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
  // Fallback (should not be reached in normal app execution, but exists just in case)
  // We use standard confirm but it might break focus.

  return true
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
