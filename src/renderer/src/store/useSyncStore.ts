import { create } from 'zustand'
import { toast } from 'sonner'

export interface SyncProgressData {
  phase: 'idle' | 'checking' | 'pushing' | 'pulling' | 'success' | 'error'
  current: number
  total: number
  percent: number
  message: string
  tableName?: string
  lastSync?: string
  pendingCount?: number
  errorCount?: number
}

export interface SyncErrorItem {
  id: number
  table_name: string
  record_id: string
  action: string
  status: string
  error_message?: string
  created_at: string
  updated_at: string
}

interface SyncState {
  isSyncing: boolean
  isOnline: boolean
  latencyMs?: number
  pendingCount: number
  errorCount: number
  lastSyncTime: string | null
  healthError?: string
  progress: SyncProgressData
  errors: SyncErrorItem[]
  isModalOpen: boolean
  appVersion: string

  // Actions
  fetchStatus: () => Promise<void>
  startSync: (forceFull?: boolean) => Promise<boolean>
  fetchErrors: () => Promise<void>
  retryErrors: () => Promise<boolean>
  openModal: () => void
  closeModal: () => void
  init: () => () => void
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  isOnline: navigator.onLine,
  latencyMs: undefined,
  pendingCount: 0,
  errorCount: 0,
  lastSyncTime: null,
  healthError: undefined,
  appVersion: '1.1.7',
  progress: {
    phase: 'idle',
    current: 0,
    total: 0,
    percent: 0,
    message: 'Prêt'
  },
  errors: [],
  isModalOpen: false,

  openModal: () => {
    set({ isModalOpen: true })
    get().fetchErrors()
    get().fetchStatus()
  },

  closeModal: () => {
    set({ isModalOpen: false })
  },

  fetchStatus: async () => {
    try {
      if (!window.api?.sync?.getStatus) return
      const status = await window.api.sync.getStatus()
      if (status.success) {
        set({
          isSyncing: status.isSyncing,
          isOnline: status.isOnline,
          latencyMs: status.latencyMs,
          pendingCount: status.pendingCount,
          errorCount: status.errorCount,
          lastSyncTime: status.lastSyncTime,
          healthError: undefined
        })
      } else {
        set({
          isOnline: false,
          healthError: status.error
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ isOnline: false, healthError: msg })
    }
  },

  startSync: async (forceFull = false) => {
    if (get().isSyncing) return false
    set({
      isSyncing: true,
      progress: {
        phase: 'checking',
        current: 0,
        total: 100,
        percent: 5,
        message: 'Initialisation de la synchronisation...'
      }
    })

    try {
      const result = await window.api.sync.start(forceFull)
      await get().fetchStatus()
      await get().fetchErrors()
      if (result && result.success) {
        window.dispatchEvent(new CustomEvent('app:sync-completed'))
        toast.success(
          forceFull
            ? 'Récupération complète effectuée avec succès !'
            : 'Synchronisation cloud terminée avec succès !'
        )
      } else {
        toast.error(
          `Échec de synchronisation : ${result?.error || 'Erreur inconnue'}`
        )
      }
      return Boolean(result?.success)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Manual sync failed:', err)
      toast.error(`Erreur de synchronisation : ${msg}`)
      await get().fetchStatus()
      return false
    } finally {
      set({ isSyncing: false })
    }
  },

  fetchErrors: async () => {
    try {
      if (!window.api?.sync?.getErrors) return
      const res = await window.api.sync.getErrors()
      if (res.success && res.errors) {
        set({ errors: res.errors })
      }
    } catch (err) {
      console.error('Failed to fetch sync errors:', err)
    }
  },

  retryErrors: async () => {
    try {
      if (!window.api?.sync?.retryErrors) return false
      const res = await window.api.sync.retryErrors()
      if (res.success) {
        await get().fetchStatus()
        await get().fetchErrors()
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to retry sync errors:', err)
      return false
    }
  },

  init: () => {
    // 1. Fetch dynamic app version
    if (window.api?.app?.getVersion) {
      window.api.app.getVersion().then((v) => {
        if (v) set({ appVersion: v })
      })
    }

    // 2. Fetch initial status
    get().fetchStatus()

    // 3. Listen to live sync progress from main process
    let removeProgressListener = () => {}
    if (window.api?.sync?.onProgress) {
      removeProgressListener = window.api.sync.onProgress((data) => {
        if (data.phase === 'success') {
          window.dispatchEvent(new CustomEvent('app:sync-completed'))
        }
        set((state) => ({
          isSyncing: data.phase === 'checking' || data.phase === 'pushing' || data.phase === 'pulling',
          progress: {
            ...state.progress,
            ...data
          },
          pendingCount: data.pendingCount !== undefined ? data.pendingCount : state.pendingCount,
          errorCount: data.errorCount !== undefined ? data.errorCount : state.errorCount,
          lastSyncTime: data.lastSync || state.lastSyncTime
        }))
      })
    }

    // 4. Listen to browser network changes with 3-second debounce on reconnection
    const handleOnline = () => {
      set({ isOnline: true })
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        // Safe reconnection check: probe connection stability before auto-push
        await get().fetchStatus()
        if (get().isOnline && get().pendingCount > 0) {
          get().startSync(false)
        }
      }, 3000)
    }

    const handleOffline = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      set({ isOnline: false })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // 5. Periodic status poll every 20 seconds
    const interval = setInterval(() => {
      get().fetchStatus()
    }, 20000)

    return () => {
      removeProgressListener()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }
}))
