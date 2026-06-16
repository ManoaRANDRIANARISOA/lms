/**
 * audit.service.ts — Audit Logging Service
 *
 * Records all sensitive actions in the `audit_logs` table.
 * Provides querying capabilities for the Admin and Direction roles.
 *
 * Note: This is part of the "Sérénité" offer but is included
 * as an optional feature that can be enabled/disabled via settings.
 * The infrastructure is always available; logging is toggled
 * based on the 'rbac_offer_level' setting.
 *
 * @module AuditService
 */

import db from '../database/db'

// --------------------------------------------
// Types
// --------------------------------------------

export interface AuditLog {
  id: number
  user_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_value: string | null // JSON
  new_value: string | null // JSON
  timestamp: string
}

export interface AuditLogFilters {
  user_id?: string
  action?: string
  table_name?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

// --------------------------------------------
// Audit Functions
// --------------------------------------------

/**
 * Check if audit logging is enabled based on the offer level.
 * The 'serenite' offer enables full audit logging.
 */
function isAuditEnabled(): boolean {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'rbac_offer_level'").get() as
      | { value: string }
      | undefined

    if (row && row.value) {
      const level = JSON.parse(row.value)
      return level === 'serenite'
    }
  } catch (error) {
    // Default to enabled for safety
  }
  // Default: enabled (better to over-log than under-log)
  return true
}

/**
 * Log an action to the audit trail.
 *
 * @param userId - The user performing the action
 * @param action - The action type (login, create, update, delete, etc.)
 * @param tableName - The database table affected
 * @param recordId - The record ID affected
 * @param oldValue - Previous state (JSON string)
 * @param newValue - New state (JSON string)
 */
export function logAction(
  userId: string | null,
  action: string,
  tableName: string | null = null,
  recordId: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): void {
  try {
    // Always log critical actions (login/logout) regardless of offer level
    const isCriticalAction = ['login', 'logout', 'login_failed'].includes(action)
    if (!isCriticalAction && !isAuditEnabled()) {
      return
    }

    db.prepare(
      `
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
    ).run(userId, action, tableName, recordId, oldValue, newValue)
  } catch (error) {
    console.error('AuditService.logAction error:', error)
    // Don't throw — audit logging should never break the main flow
  }
}

/**
 * Log a login event.
 */
export function logLogin(userId: string | null, success: boolean): void {
  logAction(userId, success ? 'login' : 'login_failed', 'users', userId)
}

/**
 * Log a logout event.
 */
export function logLogout(userId: string | null): void {
  logAction(userId, 'logout', 'users', userId)
}

function buildAuditFilterWhere(filters: AuditLogFilters): { where: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.user_id) {
    conditions.push('user_id = ?')
    params.push(filters.user_id)
  }
  if (filters.action) {
    conditions.push('action = ?')
    params.push(filters.action)
  }
  if (filters.table_name) {
    conditions.push('table_name = ?')
    params.push(filters.table_name)
  }
  if (filters.startDate) {
    conditions.push('timestamp >= ?')
    params.push(filters.startDate)
  }
  if (filters.endDate) {
    conditions.push('timestamp <= ?')
    params.push(filters.endDate)
  }

  const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
  return { where, params }
}

/**
 * Query audit logs with filters.
 *
 * @param filters - Filter criteria
 * @returns Array of audit log entries
 */
export function getAuditLogs(filters: AuditLogFilters = {}): AuditLog[] {
  try {
    const { where, params } = buildAuditFilterWhere(filters)

    let query = 'SELECT * FROM audit_logs' + where + ' ORDER BY timestamp DESC'

    const limit = filters.limit || 100
    const offset = filters.offset || 0
    query += ' LIMIT ? OFFSET ?'
    params.push(limit, offset)

    return db.prepare(query).all(...params) as AuditLog[]
  } catch (error) {
    console.error('AuditService.getAuditLogs error:', error)
    return []
  }
}

/**
 * Get the count of audit logs matching filters.
 */
export function getAuditLogCount(filters: AuditLogFilters = {}): number {
  try {
    const { where, params } = buildAuditFilterWhere(filters)

    const query = 'SELECT COUNT(*) as count FROM audit_logs' + where

    const result = db.prepare(query).get(...params) as { count: number }
    return result.count
  } catch (error) {
    console.error('AuditService.getAuditLogCount error:', error)
    return 0
  }
}

/**
 * Get a summary of recent activity (for dashboard).
 * Returns counts by action type for the last 7 days.
 */
export function getRecentActivitySummary(): { action: string; count: number }[] {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    return db
      .prepare(
        `
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE datetime(timestamp) >= datetime(?)
      GROUP BY action
      ORDER BY count DESC
    `
      )
      .all(sevenDaysAgo) as { action: string; count: number }[]
  } catch (error) {
    console.error('AuditService.getRecentActivitySummary error:', error)
    return []
  }
}
