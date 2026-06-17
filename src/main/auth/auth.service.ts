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

import { UserRepository } from '../database/repositories/user.repository'
import { setCurrentUser, getCurrentUser as getRBACCurrentUser, type User } from './rbac.service'
import { createSession, destroySession, validateSession } from './session.service'
import db from '../database/db'

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
// Core Auth Functions
// --------------------------------------------

/**
 * Authenticate a user by username and password.
 * 100% offline — queries local SQLite only.
 *
 * @param username - The username (not email)
 * @param password - The plaintext password
 * @returns LoginResult with user and session token on success
 */
export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  try {
    // 1. Look up user by username (with password_hash for verification)
    const userRow = UserRepository.getByUsernameWithHash(username)

    if (!userRow) {
      // Don't reveal whether user exists (security best practice)
      return { ok: false, error: 'Identifiants incorrects' }
    }

    // 2. Check if account is active
    if (!userRow.active || userRow.deleted) {
      return { ok: false, error: 'Ce compte est désactivé' }
    }

    // 3. Verify password with bcrypt
    const passwordValid = UserRepository.verifyPassword(password, userRow.password_hash)
    if (!passwordValid) {
      return { ok: false, error: 'Identifiants incorrects' }
    }

    // 4. Create session
    const session = createSession(userRow.id)

    // 5. Update last login timestamp
    UserRepository.updateLastLogin(userRow.id)

    // 6. Set current user in RBAC service (in-memory for fast IPC checks)
    const user: User = {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role as User['role'],
      full_name: userRow.full_name || '',
      email: userRow.email || ''
    }
    setCurrentUser(user)

    // 7. Check if password change is required on first login (default admin)
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
