/**
 * useAuthStore.ts — Zustand Auth State Management
 *
 * Manages the authentication state on the frontend:
 *   - Current user and session token
 *   - Permissions matrix (from RBAC service)
 *   - Accessible resources (for sidebar filtering)
 *   - Login / Logout actions
 *   - Session activity pinging
 *
 * @module useAuthStore
 */

import { create } from 'zustand'
import type { User, Resource, AccessLevel } from '@shared/types'

// --------------------------------------------
// Types
// --------------------------------------------

interface AuthStore {
  /** Currently authenticated user */
  user: User | null
  /** Session token (stored in localStorage for persistence) */
  token: string | null
  /** Permission matrix for current user's role */
  permissions: Record<Resource, AccessLevel> | null
  /** Resources accessible by current user */
  accessibleResources: Resource[]
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Loading state for auth operations */
  loading: boolean
  /** Error message from last auth operation */
  error: string | null

  // Actions
  /** Attempt to log in with username and password */
  login: (username: string, password: string) => Promise<boolean>
  /** Log out the current user */
  logout: () => Promise<void>
  /** Check for existing session on app startup */
  checkExistingSession: () => Promise<void>
  /** Fetch current user's permissions from backend */
  fetchPermissions: () => Promise<void>
  /** Check if user can read a resource */
  canRead: (resource: Resource) => boolean
  /** Check if user can write to a resource */
  canWrite: (resource: Resource) => boolean
  /** Clear error state */
  clearError: () => void
}

// --------------------------------------------
// Store
// --------------------------------------------

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: localStorage.getItem('session_token'),
  permissions: null,
  accessibleResources: [],
  isAuthenticated: false,
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.auth.login(username, password)

      if (result.ok && result.user && result.token) {
        localStorage.setItem('session_token', result.token)
        set({
          user: result.user,
          token: result.token,
          isAuthenticated: true,
          loading: false,
          error: null
        })

        // Fetch permissions after login
        await get().fetchPermissions()
        return true
      } else {
        set({
          loading: false,
          error: result.error || 'Identifiants incorrects'
        })
        return false
      }
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || 'Erreur de connexion'
      })
      return false
    }
  },

  logout: async () => {
    try {
      const token = get().token
      await window.api.auth.logout(token || undefined)
    } catch (e) {
      // Ignore logout errors
    }
    localStorage.removeItem('session_token')
    set({
      user: null,
      token: null,
      permissions: null,
      accessibleResources: [],
      isAuthenticated: false,
      error: null
    })
  },

  checkExistingSession: async () => {
    const token = get().token
    if (!token) {
      set({ isAuthenticated: false })
      return
    }

    set({ loading: true })
    try {
      // First try to validate the session token
      const user = await window.api.auth.checkSession(token)

      if (user) {
        set({
          user,
          isAuthenticated: true,
          loading: false
        })
        await get().fetchPermissions()
      } else {
        // Session invalid, try getCurrentUser as fallback
        const currentUser = await window.api.auth.getCurrentUser()
        if (currentUser) {
          set({
            user: currentUser,
            isAuthenticated: true,
            loading: false
          })
          await get().fetchPermissions()
        } else {
          localStorage.removeItem('session_token')
          set({
            token: null,
            isAuthenticated: false,
            loading: false
          })
        }
      }
    } catch (error) {
      localStorage.removeItem('session_token')
      set({
        token: null,
        isAuthenticated: false,
        loading: false
      })
    }
  },

  fetchPermissions: async () => {
    try {
      const result = await window.api.auth.getPermissions()
      if (result.success) {
        set({
          permissions: result.permissions || null,
          accessibleResources: result.accessibleResources || []
        })
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    }
  },

  canRead: (resource: Resource) => {
    const { permissions } = get()
    if (!permissions) return false
    const level = permissions[resource]
    return level === 'full' || level === 'read'
  },

  canWrite: (resource: Resource) => {
    const { permissions } = get()
    if (!permissions) return false
    return permissions[resource] === 'full'
  },

  clearError: () => set({ error: null })
}))
