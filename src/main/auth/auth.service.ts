/**
 * auth.service.ts — Local Authentication Service (100% Offline)
 *
 * Handles user login/logout using the local SQLite `users` table.
 * Uses bcryptjs for password verification — no network dependency.
 * Session management is delegated to session.service.ts.
 *
 * This replaces the previous Supabase-based auth which required internet.
 * The entire login flow now works offline-first, as required by the Avenant.
 *
 * @module AuthService
 */

import { UserRepository, type UserRow } from '../database/repositories/user.repository'
import { setCurrentUser, getCurrentUser as getRBACCurrentUser, type User } from './rbac.service'
import { createSession, destroySession, validateSession } from './session.service'
import db from '../database/db'
import { supabase, syncWithCloud } from '../services/sync.service'

// --------------------------------------------
// Types
// --------------------------------------------

export interface LoginResult {
  ok: boolean
  user?: User
  token?: string
  error?: string
  requirePasswordChange?: boolean
}

// --------------------------------------------
// Cloud Dynamic User Sync Helper
// --------------------------------------------

/**
 * Dynamically queries Supabase for a user if absent or outdated locally.
 * Enables instant multi-workstation login (e.g. PC2 authenticating an account created on PC1).
 * Automatically saves credentials in SQLite so future logins remain 100% offline.
 */
async function fetchAndSyncUserFromCloud(
  username: string
): Promise<(UserRow & { password_hash: string }) | null> {
  try {
    if (!supabase) return null
    const cleanUsername = username.trim()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUsername)
      .maybeSingle()

    if (error || !data) return null

    // Ensure it's saved/updated in local SQLite so future logins work 100% offline
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(data.id) as any
    const fieldsToSave = {
      id: data.id,
      username: data.username,
      password_hash: data.password_hash,
      role: data.role,
      full_name: data.full_name || null,
      email: data.email || null,
      active: data.active ? 1 : 0,
      deleted: data.deleted ? 1 : 0,
      version: data.version || 1,
      sync_status: 'synced',
      updated_at: data.updated_at || new Date().toISOString()
    }

    if (existing) {
      db.prepare(`
        UPDATE users SET
          username = ?, password_hash = ?, role = ?, full_name = ?,
          email = ?, active = ?, deleted = ?, version = ?, sync_status = 'synced', updated_at = ?
        WHERE id = ?
      `).run(
        fieldsToSave.username,
        fieldsToSave.password_hash,
        fieldsToSave.role,
        fieldsToSave.full_name,
        fieldsToSave.email,
        fieldsToSave.active,
        fieldsToSave.deleted,
        fieldsToSave.version,
        fieldsToSave.updated_at,
        fieldsToSave.id
      )
    } else {
      // Remove any local conflicting row with same username but different id
      db.prepare('DELETE FROM users WHERE username = ? AND id != ?').run(fieldsToSave.username, fieldsToSave.id)
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, full_name, email, active, deleted, version, sync_status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fieldsToSave.id,
        fieldsToSave.username,
        fieldsToSave.password_hash,
        fieldsToSave.role,
        fieldsToSave.full_name,
        fieldsToSave.email,
        fieldsToSave.active,
        fieldsToSave.deleted,
        fieldsToSave.version,
        fieldsToSave.sync_status,
        fieldsToSave.updated_at
      )
    }

    // Trigger non-blocking background sync for remaining tables
    syncWithCloud().catch((e) => console.warn('Background sync after cloud auth notice:', e))

    return UserRepository.getByUsernameWithHash(data.username)
  } catch (err) {
    console.warn('Could not dynamically fetch user from cloud:', err)
    return null
  }
}

// --------------------------------------------
// Core Auth Functions
// --------------------------------------------

/**
 * Authenticate a user by username and password.
 * Offline-first with dynamic cloud fallback for multi-postes (PC1 -> PC2).
 *
 * @param username - The username (not email)
 * @param password - The plaintext password
 * @returns LoginResult with user and session token on success
 */
export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  try {
    const cleanUsername = username.trim()

    // 1. Look up user in local SQLite
    let userRow = UserRepository.getByUsernameWithHash(cleanUsername)
    let passwordValid = false

    if (userRow) {
      if (!userRow.active || userRow.deleted) {
        return { ok: false, error: 'Ce compte est désactivé' }
      }
      passwordValid = UserRepository.verifyPassword(password, userRow.password_hash)
    }

    // 2. Dynamic Cloud Fallback: If not found locally or local password check fails, check Supabase
    if (!userRow || !passwordValid) {
      const cloudUser = await fetchAndSyncUserFromCloud(cleanUsername)
      if (cloudUser) {
        if (!cloudUser.active || cloudUser.deleted) {
          return { ok: false, error: 'Ce compte est désactivé' }
        }
        if (UserRepository.verifyPassword(password, cloudUser.password_hash)) {
          userRow = cloudUser
          passwordValid = true
        }
      }
    }

    if (!userRow || !passwordValid) {
      // Don't reveal whether user exists (security best practice)
      return { ok: false, error: 'Identifiants incorrects' }
    }

    // 3. Create session
    const session = createSession(userRow.id)

    // 4. Update last login timestamp
    UserRepository.updateLastLogin(userRow.id)

    // 5. Set current user in RBAC service (in-memory for fast IPC checks)
    const user: User = {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role as User['role'],
      full_name: userRow.full_name || '',
      email: userRow.email || ''
    }
    setCurrentUser(user)

    // 6. Check if password change is required on first login (default admin)
    const requirePasswordChange = isPasswordChangeRequired(userRow.id)

    return {
      ok: true,
      user,
      token: session?.id,
      requirePasswordChange
    }
  } catch (error: any) {
    console.error('AuthService.login error:', error)
    return { ok: false, error: 'Erreur lors de la connexion' }
  }
}

/**
 * Log out the current user.
 * Destroys the session and clears the in-memory user.
 *
 * @param token - The session token to destroy
 */
export function logout(token?: string): void {
  try {
    if (token) {
      destroySession(token)
    }
    setCurrentUser(null)
  } catch (error) {
    console.error('AuthService.logout error:', error)
  }
}

/**
 * Get the currently authenticated user (from in-memory RBAC state).
 */
export function getCurrentUser(): User | null {
  return getRBACCurrentUser()
}

/**
 * Check if there is a valid session on app startup.
 * Validates the session token against the sessions table.
 *
 * @param token - The stored session token
 * @returns The user if session is valid, null otherwise
 */
export function checkSession(token: string): User | null {
  try {
    const session = validateSession(token)
    if (!session) {
      return null
    }

    // Load user from DB
    const userRow = UserRepository.getById(session.user_id)
    if (!userRow || !userRow.active) {
      destroySession(token)
      return null
    }

    const user: User = {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role as User['role'],
      full_name: userRow.full_name || '',
      email: userRow.email || ''
    }
    setCurrentUser(user)
    return user
  } catch (error) {
    console.error('AuthService.checkSession error:', error)
    return null
  }
}

/**
 * Change the current user's password.
 *
 * @param userId - The user ID
 * @param currentPassword - Current password for verification
 * @param newPassword - New password to set
 */
export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): { success: boolean; error?: string } {
  return UserRepository.changePassword(userId, currentPassword, newPassword)
}

/**
 * Reset a user's password (admin operation).
 *
 * @param userId - The user ID whose password to reset
 * @param newPassword - The new password
 */
export function resetPassword(
  userId: string,
  newPassword: string
): { success: boolean; error?: string } {
  return UserRepository.resetPassword(userId, newPassword)
}

/**
 * Check if a user needs to change their password on first login.
 * Returns true if the user has never changed their password since account creation.
 */
function isPasswordChangeRequired(userId: string): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'auth_require_password_change'")
      .get() as { value: string } | undefined

    if (row && row.value) {
      const enabled = JSON.parse(row.value)
      if (!enabled) return false
    }

    // Check if the user is the default admin (created by migration 004)
    const user = db
      .prepare('SELECT id FROM users WHERE id = ? AND last_login IS NULL')
      .get(userId) as { id: string } | undefined

    return !!user
  } catch (e) {
    return false
  }
}
