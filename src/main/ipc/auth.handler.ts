/**
 * auth.handler.ts — IPC Handlers for Authentication & User Management
 *
 * Registers all IPC channels related to:
 *   - Login / Logout / Session checking
 *   - User CRUD operations (admin only)
 *   - Password management
 *   - Audit log queries
 *
 * All user management channels are protected by RBAC checks.
 * Login/logout channels are public (no prior auth needed).
 *
 * @module AuthHandler
 */

import { ipcMain } from 'electron'
import {
  loginWithPassword,
  logout as authLogout,
  getCurrentUser as authGetCurrentUser,
  checkSession,
  changePassword as authChangePassword,
  resetPassword as authResetPassword
} from '../auth/auth.service'
import { UserRepository, type UserRole } from '../database/repositories/user.repository'
import {
  canWrite,
  canRead,
  getCurrentUser,
  getCurrentUserPermissions,
  getAccessibleResources
} from '../auth/rbac.service'
import { destroyAllUserSessions, renewSessionActivity } from '../auth/session.service'
import {
  logLogin,
  logLogout,
  logAction,
  getAuditLogs,
  getAuditLogCount
} from '../auth/audit.service'

/**
 * Register all auth-related IPC handlers.
 * Called once from index.ts on app startup.
 */
export function registerAuthHandlers(): void {
  // ========================================
  // PUBLIC CHANNELS (no auth required)
  // ========================================

  /**
   * Login with username and password.
   * Returns user data and session token on success.
   */
  ipcMain.handle('auth:login', async (_, username: string, password: string) => {
    try {
      const result = await loginWithPassword(username, password)

      // Log the login attempt
      if (result.ok && result.user) {
        logLogin(result.user.id, true)
      } else {
        logLogin(null, false)
      }

      return result
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur de connexion'
      return { ok: false, error: message }
    }
  })

  /**
   * Logout the current user.
   * Requires a session token to destroy.
   */
  ipcMain.handle('auth:logout', async (_, token?: string) => {
    try {
      const user = getCurrentUser()
      logLogout(user?.id || null)
      authLogout(token)
      return { ok: true }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur de déconnexion'
      return { ok: false, error: message }
    }
  })

  /**
   * Get the current authenticated user.
   * Used by the renderer to check auth state on mount.
   */
  ipcMain.handle('auth:getCurrentUser', async () => {
    try {
      const user = authGetCurrentUser()
      return user ?? null
    } catch (e) {
      return null
    }
  })

  /**
   * Check if a session token is still valid.
   * Used on app startup to restore sessions.
   */
  ipcMain.handle('auth:checkSession', async (_, token: string) => {
    try {
      const user = checkSession(token)
      return user
    } catch (e) {
      return null
    }
  })

  // ========================================
  // USER MANAGEMENT CHANNELS (admin only)
  // ========================================

  /**
   * Create a new user account.
   * Admin only.
   */
  ipcMain.handle('auth:createUser', async (_, userData) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: création utilisateur' }
    }

    const result = UserRepository.create({
      username: userData.username,
      password: userData.password,
      role: userData.role as UserRole,
      full_name: userData.full_name,
      email: userData.email
    })

    if (result.success && result.user) {
      logAction(
        getCurrentUser()?.id || null,
        'create',
        'users',
        result.user.id,
        null,
        JSON.stringify(result.user)
      )
    }

    return result
  })

  /**
   * Update a user account.
   * Admin only.
   */
  ipcMain.handle('auth:updateUser', async (_, id: string, updates) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: modification utilisateur' }
    }

    const oldUser = UserRepository.getById(id)
    const result = UserRepository.update(id, updates)

    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'update',
        'users',
        id,
        oldUser ? JSON.stringify(oldUser) : null,
        JSON.stringify(updates)
      )
    }

    return result
  })

  /**
   * Deactivate a user account (soft delete).
   * Admin only.
   */
  ipcMain.handle('auth:deactivateUser', async (_, id: string) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: désactivation utilisateur' }
    }

    const result = UserRepository.deactivate(id)

    if (result.success) {
      // Also destroy all sessions for this user
      destroyAllUserSessions(id)
      logAction(getCurrentUser()?.id || null, 'deactivate', 'users', id)
    }

    return result
  })

  /**
   * List all active users.
   * Admin only.
   */
  ipcMain.handle('auth:listUsers', async () => {
    if (!canRead('users')) {
      return { success: false, error: 'Accès refusé: liste utilisateurs' }
    }
    return { success: true, users: UserRepository.list() }
  })

  // ========================================
  // PASSWORD MANAGEMENT
  // ========================================

  /**
   * Change the current user's password.
   * Requires the current password for verification.
   */
  ipcMain.handle(
    'auth:changePassword',
    async (_, userId: string, currentPassword: string, newPassword: string) => {
      // Users can change their own password; admins can change anyone's
      const currentUserObj = getCurrentUser()
      if (!currentUserObj) {
        return { success: false, error: 'Non authentifié' }
      }

      if (currentUserObj.id !== userId && !canWrite('users')) {
        return { success: false, error: 'Accès refusé' }
      }

      const result = authChangePassword(userId, currentPassword, newPassword)

      if (result.success) {
        logAction(currentUserObj.id, 'change_password', 'users', userId)
      }

      return result
    }
  )

  /**
   * Reset a user's password (admin operation).
   * Does not require the current password.
   */
  ipcMain.handle('auth:resetPassword', async (_, userId: string, newPassword: string) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: réinitialisation mot de passe' }
    }

    const result = authResetPassword(userId, newPassword)

    if (result.success) {
      logAction(getCurrentUser()?.id || null, 'reset_password', 'users', userId)
    }

    return result
  })

  // ========================================
  // AUDIT LOG CHANNELS (admin + direction read)
  // ========================================

  /**
   * Query audit logs with filters.
   */
  ipcMain.handle('auth:getAuditLogs', async (_, filters) => {
    if (!canRead('audit')) {
      return { success: false, error: 'Accès refusé: logs audit' }
    }

    const logs = getAuditLogs(filters)
    const count = getAuditLogCount(filters)

    return { success: true, logs, total: count }
  })

  // ========================================
  // SESSION ACTIVITY
  // ========================================

  /**
   * Ping to renew session activity (called by renderer periodically).
   * Prevents session timeout while the user is active.
   */
  ipcMain.handle('auth:activity', async (_, token: string) => {
    renewSessionActivity(token)
    return { ok: true }
  })

  /**
   * Get current user's permissions (for frontend RBAC).
   * Returns the permission matrix for the current user's role.
   */
  ipcMain.handle('auth:getPermissions', async () => {
    const user = getCurrentUser()
    if (!user) return { success: false, error: 'Non authentifié' }

    return {
      success: true,
      user,
      permissions: getCurrentUserPermissions(),
      accessibleResources: getAccessibleResources()
    }
  })

}
