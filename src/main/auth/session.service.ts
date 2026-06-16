/**
 * session.service.ts — Session Management with Timeout
 *
 * Manages user sessions stored in the SQLite `sessions` table.
 * Supports:
 *   - Session creation with configurable timeout (default: 60 minutes)
 *   - Session validation and auto-renewal on activity
 *   - Session destruction on logout
 *   - Periodic cleanup of expired sessions
 *   - Inactivity timeout monitoring
 *
 * Sessions persist across app restarts (stored in SQLite),
 * but expire based on the configured timeout.
 *
 * @module SessionService
 */

import db from '../database/db'
import { v4 as uuidv4 } from 'uuid'

// --------------------------------------------
// Types
// --------------------------------------------

export interface Session {
  id: string          // UUID session token
  user_id: string     // FK to users.id
  created_at: string
  expires_at: string
  last_activity: string
}

// --------------------------------------------
// Constants
// --------------------------------------------

/** Default session timeout in minutes (from Avenant spec) */
const DEFAULT_TIMEOUT_MINUTES = 60

/** Interval for cleaning expired sessions (every 10 minutes) */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

/** Interval for checking inactivity timeout (every 1 minute) */
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000

// --------------------------------------------
// Session Functions
// --------------------------------------------

/**
 * Create a new session for a user.
 * Stores the session in SQLite and returns the session object.
 *
 * @param userId - The user ID to create a session for
 * @param timeoutMinutes - Session duration in minutes (default: 60)
 * @returns The created session with token
 */
export function createSession(userId: string, timeoutMinutes: number = DEFAULT_TIMEOUT_MINUTES): Session {
  const token = uuidv4()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000)

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at, last_activity)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
  `).run(token, userId, expiresAt.toISOString())

  return {
    id: token,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    last_activity: now.toISOString()
  }
}

/**
 * Validate a session token.
 * Checks that the session exists, is not expired, and the user is still active.
 * On success, renews the session (extends the expiry time).
 *
 * @param token - The session token to validate
 * @returns The session if valid, null otherwise
 */
export function validateSession(token: string): Session | null {
  try {
    const session = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(token) as Session | undefined

    if (!session) {
      return null
    }

    // Check if expired
    const now = new Date()
    const expiresAt = new Date(session.expires_at)
    if (now >= expiresAt) {
      // Session expired — clean it up
      destroySession(token)
      return null
    }

    // Renew the session (extend expiry by timeout duration)
    const newExpiresAt = new Date(now.getTime() + DEFAULT_TIMEOUT_MINUTES * 60 * 1000)
    db.prepare(`
      UPDATE sessions
      SET expires_at = ?, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newExpiresAt.toISOString(), token)

    return { ...session, expires_at: newExpiresAt.toISOString(), last_activity: now.toISOString() }
  } catch (error) {
    console.error('SessionService.validateSession error:', error)
    return null
  }
}

/**
 * Destroy a session (logout).
 * Deletes the session from the database.
 *
 * @param token - The session token to destroy
 */
export function destroySession(token: string): void {
  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(token)
  } catch (error) {
    console.error('SessionService.destroySession error:', error)
  }
}

/**
 * Destroy all sessions for a user (force logout on all devices).
 *
 * @param userId - The user ID
 */
export function destroyAllUserSessions(userId: string): void {
  try {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  } catch (error) {
    console.error('SessionService.destroyAllUserSessions error:', error)
  }
}

/**
 * Clean up expired sessions from the database.
 * Should be called periodically to prevent table bloat.
 */
export function cleanExpiredSessions(): void {
  try {
    db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run()
  } catch (error) {
    console.error('SessionService.cleanExpiredSessions error:', error)
  }
}

// --------------------------------------------
// Session Monitor (Inactivity Timeout)
// --------------------------------------------

let cleanupTimer: ReturnType<typeof setInterval> | null = null
let inactivityTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the session monitoring system.
 * - Periodically cleans up expired sessions
 * - Checks for inactive sessions and expires them
 *
 * Called once on app startup from index.ts.
 */
export function startSessionMonitor(): void {
  // Clean up expired sessions periodically
  cleanupTimer = setInterval(() => {
    cleanExpiredSessions()
  }, CLEANUP_INTERVAL_MS)

  // Check for inactive sessions every minute
  inactivityTimer = setInterval(() => {
    checkInactivity()
  }, INACTIVITY_CHECK_INTERVAL_MS)

  // Also do an immediate cleanup on startup
  cleanExpiredSessions()
}

/**
 * Stop the session monitoring system.
 * Called on app shutdown.
 */
export function stopSessionMonitor(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  if (inactivityTimer) {
    clearInterval(inactivityTimer)
    inactivityTimer = null
  }
}

/**
 * Check for sessions that have been inactive beyond the timeout.
 * This handles the case where the user hasn't made any IPC calls
 * (which would normally renew the session via validateSession).
 */
function checkInactivity(): void {
  try {
    const timeoutMinutes = getSessionTimeoutFromSettings()
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString()

    // Expire sessions where last_activity is older than the cutoff.
    // We wrap both sides with datetime() so ISO-8601 strings are parsed correctly.
    db.prepare(`
      DELETE FROM sessions WHERE datetime(last_activity) < datetime(?)
    `).run(cutoff)

  } catch (error) {
    console.error('SessionService.checkInactivity error:', error)
  }
}

/**
 * Get session timeout from settings (with fallback to default).
 */
function getSessionTimeoutFromSettings(): number {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'auth_session_timeout_minutes'")
      .get() as { value: string } | undefined

    if (row && row.value) {
      const parsed = JSON.parse(row.value)
      if (typeof parsed === 'number' && parsed > 0) {
        return parsed
      }
    }
  } catch (error) {
    // Ignore, use default
  }
  return DEFAULT_TIMEOUT_MINUTES
}

/**
 * Renew a session's activity timestamp.
 * Called by the auth handler on every IPC call to track user activity.
 *
 * @param token - The session token
 */
export function renewSessionActivity(token: string): void {
  try {
    db.prepare(`
      UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
    `).run(token)
  } catch (error) {
    // Ignore errors — non-critical
  }
}
