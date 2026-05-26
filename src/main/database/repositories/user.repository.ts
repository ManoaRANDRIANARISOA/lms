/**
 * UserRepository — User CRUD operations with bcrypt password hashing
 *
 * Manages the local `users` table for the Auth & RBAC module.
 * All password handling uses bcryptjs (pure JS, Electron-compatible).
 * Password hashes are NEVER returned in query results.
 *
 * @module UserRepository
 */

import db from '../db'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { addToSyncQueue } from '../../services/sync.service'

// --------------------------------------------
// Types
// --------------------------------------------

/** Role type matching the Avenant RBAC specification */
export type UserRole = 'admin' | 'secretariat' | 'accounting' | 'direction'

/** User row from the database (excludes password_hash for safety) */
export interface UserRow {
  id: string
  username: string
  role: UserRole
  full_name: string | null
  email: string | null
  active: number // SQLite boolean (0/1)
  last_login: string | null
  created_at: string
  updated_at: string
  version: number
  sync_status: string
  deleted: number
  [key: string]: any // Allow dynamic access for sanitizeUser spread
}

/** Data needed to create a new user */
export interface CreateUserInput {
  username: string
  password: string
  role: UserRole
  full_name?: string
  email?: string
}

/** Data needed to update a user (all fields optional) */
export interface UpdateUserInput {
  username?: string
  role?: UserRole
  full_name?: string
  email?: string
  active?: boolean
}

// --------------------------------------------
// Constants
// --------------------------------------------

const BCRYPT_COST = 10
const MIN_PASSWORD_LENGTH = 8
const MIN_USERNAME_LENGTH = 3
const VALID_ROLES: UserRole[] = ['admin', 'secretariat', 'accounting', 'direction']

// --------------------------------------------
// Repository Class
// --------------------------------------------

export class UserRepository {
  // ---------- Helpers ----------

  /**
   * Hash a plaintext password using bcrypt.
   * @throws if password is too short
   */
  private static hashPassword(password: string): string {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
    }
    return bcrypt.hashSync(password, BCRYPT_COST)
  }

  /**
   * Compare a plaintext password against a stored bcrypt hash.
   */
  static verifyPassword(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash)
  }

  /**
   * Strip password_hash from a user row for safe return to IPC/renderers.
   */
  private static sanitizeUser(row: any): UserRow {
    if (!row) return row
    const { password_hash, ...safe } = row
    return safe as UserRow
  }

  /**
   * Validate username format.
   * @throws if invalid
   */
  private static validateUsername(username: string): void {
    if (!username || username.length < MIN_USERNAME_LENGTH) {
      throw new Error(`Le nom d'utilisateur doit contenir au moins ${MIN_USERNAME_LENGTH} caractères`)
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      throw new Error("Le nom d'utilisateur ne peut contenir que des lettres, chiffres, _, . et -")
    }
  }

  /**
   * Validate role value.
   * @throws if role is not one of the 4 allowed values
   */
  private static validateRole(role: string): void {
    if (!VALID_ROLES.includes(role as UserRole)) {
      throw new Error(`Rôle invalide: ${role}. Rôles autorisés: ${VALID_ROLES.join(', ')}`)
    }
  }

  // ---------- CRUD Operations ----------

  /**
   * Create a new user with hashed password.
   * Returns the created user (without password_hash) or error.
   */
  static create(input: CreateUserInput): { success: boolean; user?: UserRow; error?: string } {
    try {
      // Validate inputs
      this.validateUsername(input.username)
      this.validateRole(input.role)

      if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
      }

      // Check username uniqueness
      const existing = db
        .prepare('SELECT id FROM users WHERE username = ? AND deleted = 0')
        .get(input.username) as { id: string } | undefined
      if (existing) {
        throw new Error(`Le nom d'utilisateur "${input.username}" existe déjà`)
      }

      const id = uuidv4()
      const passwordHash = this.hashPassword(input.password)

      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, full_name, email, active, version, sync_status, deleted)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'pending', 0)
      `).run(
        id,
        input.username,
        passwordHash,
        input.role,
        input.full_name || null,
        input.email || null
      )

      // Add to sync queue for cloud propagation
      addToSyncQueue('users', id, 'create', {
        id,
        username: input.username,
        role: input.role,
        full_name: input.full_name || null,
        email: input.email || null,
        active: 1,
        version: 1
      })

      // Return the created user (without password)
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      return { success: true, user: this.sanitizeUser(user) ?? undefined }
    } catch (error: any) {
      console.error('UserRepository.create error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get a user by ID (without password_hash).
   */
  static getById(id: string): UserRow | null {
    const row = db.prepare('SELECT * FROM users WHERE id = ? AND deleted = 0').get(id)
    return this.sanitizeUser(row)
  }

  /**
   * Get a user by username (WITH password_hash for auth verification).
   * Only used internally by auth.service — never exposed via IPC.
   */
  static getByUsernameWithHash(username: string): (any & { password_hash: string }) | null {
    return db
      .prepare('SELECT * FROM users WHERE username = ? AND deleted = 0 AND active = 1')
      .get(username) as any
  }

  /**
   * List all active users (without password_hash).
   */
  static list(): UserRow[] {
    const rows = db
      .prepare('SELECT * FROM users WHERE deleted = 0 ORDER BY created_at ASC')
      .all() as any[]
    return rows.map((r) => this.sanitizeUser(r))
  }

  /**
   * Update a user's profile information (not password).
   */
  static update(id: string, input: UpdateUserInput): { success: boolean; user?: UserRow; error?: string } {
    try {
      // Validate role if provided
      if (input.role) {
        this.validateRole(input.role)
      }

      // Validate username if provided
      if (input.username) {
        this.validateUsername(input.username)
        // Check uniqueness (exclude self)
        const existing = db
          .prepare('SELECT id FROM users WHERE username = ? AND id != ? AND deleted = 0')
          .get(input.username, id) as { id: string } | undefined
        if (existing) {
          throw new Error(`Le nom d'utilisateur "${input.username}" existe déjà`)
        }
      }

      const updates: string[] = []
      const values: any[] = []

      if (input.username !== undefined) {
        updates.push('username = ?')
        values.push(input.username)
      }
      if (input.role !== undefined) {
        updates.push('role = ?')
        values.push(input.role)
      }
      if (input.full_name !== undefined) {
        updates.push('full_name = ?')
        values.push(input.full_name)
      }
      if (input.email !== undefined) {
        updates.push('email = ?')
        values.push(input.email)
      }
      if (input.active !== undefined) {
        updates.push('active = ?')
        values.push(input.active ? 1 : 0)
      }

      if (updates.length === 0) {
        return { success: true, user: this.getById(id) ?? undefined }
      }

      updates.push('updated_at = CURRENT_TIMESTAMP')
      updates.push('version = version + 1')
      updates.push("sync_status = 'pending'")

      values.push(id)

      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)

      // Add to sync queue
      addToSyncQueue('users', id, 'update', input)

      return { success: true, user: this.getById(id) ?? undefined }
    } catch (error: any) {
      console.error('UserRepository.update error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Deactivate a user (soft delete — set active=0 and deleted=1).
   */
  static deactivate(id: string): { success: boolean; error?: string } {
    try {
      // Prevent deactivating the last admin
      const user = this.getById(id)
      if (!user) {
        throw new Error('Utilisateur introuvable')
      }

      if (user.role === 'admin') {
        const activeAdmins = db
          .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1 AND deleted = 0 AND id != ?")
          .get(id) as { count: number }
        if (activeAdmins.count === 0) {
          throw new Error('Impossible de désactiver le dernier administrateur')
        }
      }

      db.prepare(`
        UPDATE users
        SET active = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `).run(id)

      addToSyncQueue('users', id, 'update', { active: 0, deleted: 1 })

      return { success: true }
    } catch (error: any) {
      console.error('UserRepository.deactivate error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Update the user's last login timestamp.
   */
  static updateLastLogin(id: string): void {
    try {
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    } catch (error) {
      console.error('UserRepository.updateLastLogin error:', error)
    }
  }

  /**
   * Change a user's password.
   * @param userId - The user ID
   * @param currentPassword - The current password (for verification)
   * @param newPassword - The new password
   */
  static changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): { success: boolean; error?: string } {
    try {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
      }

      const user = db
        .prepare('SELECT password_hash FROM users WHERE id = ? AND deleted = 0')
        .get(userId) as { password_hash: string } | undefined

      if (!user) {
        throw new Error('Utilisateur introuvable')
      }

      // Verify current password
      if (!this.verifyPassword(currentPassword, user.password_hash)) {
        throw new Error('Mot de passe actuel incorrect')
      }

      const newHash = this.hashPassword(newPassword)

      db.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `).run(newHash, userId)

      return { success: true }
    } catch (error: any) {
      console.error('UserRepository.changePassword error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Reset a user's password (admin operation — no current password required).
   * @param userId - The user ID whose password to reset
   * @param newPassword - The new password
   */
  static resetPassword(
    userId: string,
    newPassword: string
  ): { success: boolean; error?: string } {
    try {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`)
      }

      const user = this.getById(userId)
      if (!user) {
        throw new Error('Utilisateur introuvable')
      }

      const newHash = this.hashPassword(newPassword)

      db.prepare(`
        UPDATE users
        SET password_hash = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1, sync_status = 'pending'
        WHERE id = ?
      `).run(newHash, userId)

      return { success: true }
    } catch (error: any) {
      console.error('UserRepository.resetPassword error:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Count active users by role. Useful for dashboard stats.
   */
  static countByRole(): Record<UserRole, number> {
    const rows = db
      .prepare('SELECT role, COUNT(*) as count FROM users WHERE deleted = 0 AND active = 1 GROUP BY role')
      .all() as { role: string; count: number }[]

    const result: Record<string, number> = { admin: 0, secretariat: 0, accounting: 0, direction: 0 }
    rows.forEach((r) => {
      result[r.role] = r.count
    })

    return result as Record<UserRole, number>
  }
}
